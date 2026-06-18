import { ChineseConverter, type Region } from './converter';

/**
 * 搜索攔截器 — 掛載到 Obsidian 的全局搜索輸入框
 *
 * 工作流程：
 * 用戶輸入 → 安全檢查 → 防抖 800ms → (原詞) OR (轉換詞) → 原生搜索引擎
 */
export class SearchHook {
  private inputEl: HTMLInputElement | null = null;
  private isUpdating = false;
  private isComposing = false;
  private lastUserValue = '';
  private observeTimer: number | null = null;
  private debounceTimer: number | null = null;

  constructor(
    private converter: ChineseConverter,
    private keepOperators: boolean,
    private silentMode: boolean,
    private debounceMs: number,
    private phraseEnabled: boolean,
  ) {
  }

  setRegion(region: Region): void {
    this.converter.setRegion(region);
    if (this.inputEl) this._processInput(this.inputEl);
  }

  setKeepOperators(keep: boolean): void {
    this.keepOperators = keep;
  }

  setSilentMode(silent: boolean): void {
    this.silentMode = silent;
  }

  setDebounceMs(ms: number): void {
    this.debounceMs = ms;
  }

  setPhraseEnabled(enabled: boolean): void {
    this.phraseEnabled = enabled;
  }

  hook(): boolean {
    const searchLeaf = app.workspace.getLeavesOfType('search')[0];
    if (!searchLeaf) return false;

    const container = (searchLeaf.view as any)?.containerEl as HTMLElement | null;
    if (!container) return false;

    const input = container.querySelector(
      '.search-input-container input, input[type="search"], input[placeholder*="搜索"], input[placeholder*="Search"], input[placeholder*="搜尋"]'
    ) as HTMLInputElement | null;
    if (!input) return false;

    if (this.inputEl === input) return true;
    this._unhook();
    this.inputEl = input;

    input.addEventListener('input', this._onInput);
    input.addEventListener('compositionstart', this._onCompositionStart);
    input.addEventListener('compositionend', this._onCompositionEnd);
    this._setupFallback(container);

    this._processInput(input);
    return true;
  }

  unhook(): void {
    this._unhook();
  }

  private _unhook(): void {
    this._cancelDebounce();
    if (this.inputEl) {
      this.inputEl.removeEventListener('input', this._onInput);
      this.inputEl.removeEventListener('compositionstart', this._onCompositionStart);
      this.inputEl.removeEventListener('compositionend', this._onCompositionEnd);
      this.inputEl = null;
    }
    if (this.observeTimer !== null) {
      clearInterval(this.observeTimer);
      this.observeTimer = null;
    }
  }

  private _setupFallback(container: HTMLElement): void {
    if (this.observeTimer !== null) return;
    this.observeTimer = window.setInterval(() => {
      const input = container.querySelector<HTMLInputElement>(
        '.search-input-container input, input[type="search"]'
      );
      if (input && input !== this.inputEl) {
        this.inputEl?.removeEventListener('input', this._onInput);
        this.inputEl = input;
        input.addEventListener('input', this._onInput);
        this._processInput(input);
      }
    }, 2000);
  }

  private _onInput = (evt: Event): void => {
    const input = evt.target as HTMLInputElement;
    if (this.isComposing) return;
    this._cancelDebounce();
    this._processInput(input);
  };

  private _onCompositionStart = (): void => {
    this.isComposing = true;
    this._cancelDebounce();
  };

  private _onCompositionEnd = (evt: CompositionEvent): void => {
    this.isComposing = false;
    const input = evt.target as HTMLInputElement;
    this._processInput(input);
  };

  /**
   * 安全檢查全部通過 → 啟動防抖 800ms
   * 用戶繼續打字 → 計時器重置
   * 用戶停頓 800ms → 執行展開
   */
  private _processInput(input: HTMLInputElement): void {
    if (this.isUpdating) return;

    const currentValue = input.value;

    // 1. 值沒變
    if (currentValue === this.lastUserValue) return;

    // 2. 值變短了（退格刪除）
    if (currentValue.length < this.lastUserValue.length) {
      this.lastUserValue = currentValue;
      return;
    }

    // 3. 游標不在末尾
    if (input.selectionStart !== null && input.selectionStart !== currentValue.length) {
      this.lastUserValue = currentValue;
      return;
    }

    // 4. 已展開 + 用戶後續輸入 → 剝離展開，保留純文字
    //    例如: (杖与) OR (杖與)剑的魔剑谭 → 杖与剑的魔剑谭
    if (this._isExpansionWithExtra(currentValue)) {
      const cleanText = this._stripExpansion(currentValue);
      this.isUpdating = true;
      input.value = cleanText;
      this.isUpdating = false;
      // 不設 lastUserValue → 後續 input 事件會當作新文字處理
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    // 5. 有括號 → 是我們自己展開的內容
    if (/[()]/.test(currentValue)) {
      this.lastUserValue = currentValue;
      return;
    }

    // 6. 沒有中文
    if (!this.converter.hasChinese(currentValue)) {
      this.lastUserValue = currentValue;
      return;
    }

    // 7. 不需要轉換（同方向文字）
    if (!this.converter.needsConversion(currentValue)) {
      this.lastUserValue = currentValue;
      return;
    }

    // 全部通過 → 防抖展開
    this.lastUserValue = currentValue;
    this._scheduleDebounce(input, currentValue);
  }

  /** 檢測是否為展開 + 用戶後續輸入 */
  private _isExpansionWithExtra(query: string): boolean {
    const m = query.match(/\([^)]+\)\s+OR\s+\([^)]+\)/);
    if (!m || m.index === undefined) return false;
    const before = query.slice(0, m.index).trim();
    const after = query.slice(m.index + m[0].length).trim();
    return !!(before || after);
  }

  /** 從展開查詢中還原用戶原始輸入 */
  private _stripExpansion(query: string): string {
    const m = query.match(/\([^)]+\)\s+OR\s+\([^)]+\)/);
    if (!m || m.index === undefined) return query;
    const before = query.slice(0, m.index).trim();
    const original = m[0].match(/^\(([^)]+)\)/)?.[1] || '';
    const after = query.slice(m.index + m[0].length).trim();
    return (before + original + after).trim();
  }

  private _cancelDebounce(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private _scheduleDebounce(input: HTMLInputElement, originalValue: string): void {
    this._cancelDebounce();
    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null;
      if (input.value === originalValue) {
        this._doExpand(input, originalValue);
      }
    }, this.debounceMs);
  }

  private _doExpand(input: HTMLInputElement, originalValue: string): void {
    const expanded = this._expandQuery(originalValue);
    if (!expanded || expanded === originalValue) return;

    this.lastUserValue = originalValue;

    this.isUpdating = true;
    input.value = expanded;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    if (this.silentMode) {
      requestAnimationFrame(() => {
        input.value = originalValue;
        this.isUpdating = false;
      });
    } else {
      this.isUpdating = false;
    }
  }

  private _expandQuery(query: string): string {
    const tokens = this._tokenize(query);
    const newTokens: string[] = [];

    for (const token of tokens) {
      if (token.type === 'plain' && this.converter.hasChinese(token.value)) {
        const terms: string[] = [token.value];

        // 短語層級：完整詞匹配
        if (this.phraseEnabled) {
          const phraseVariant = this.converter.getPhraseVariant(token.value);
          if (phraseVariant && phraseVariant !== token.value) {
            terms.push(phraseVariant);
          }
        }

        // 字符層級：逐字轉換
        // 找出每個有變體的字符，生成所有排列的結果
        const chars = [...token.value];
        const altOptions: string[][] = chars.map(ch => {
          const v = this.converter.getVariants(ch);
          return v.length > 0 ? [ch, ...v] : [ch];
        });

        // 如果有至少一個字符有變體，建立所有排列組合
        const hasVariants = altOptions.some((opts, i) =>
          opts.length > 1 || opts[0] !== chars[i]
        );

        if (hasVariants) {
          // 遞迴生成所有排列
          const allAlts: string[] = [];
          const build = (idx: number, acc: string[]) => {
            if (idx >= chars.length) {
              const alt = acc.join('');
              if (alt !== token.value) allAlts.push(alt);
              return;
            }
            const seen = new Set<string>();
            for (const c of altOptions[idx]) {
              if (seen.has(c)) continue;
              seen.add(c);
              acc.push(c);
              build(idx + 1, acc);
              acc.pop();
            }
          };
          build(0, []);

          for (const alt of allAlts) {
            if (!terms.includes(alt)) terms.push(alt);
          }
        }

        if (terms.length > 1) {
          newTokens.push(`(${terms.join(') OR (')})`);
          continue;
        }
      }
      newTokens.push(token.raw);
    }

    return newTokens.join(' ');
  }

  private _tokenize(query: string): Token[] {
    const tokens: Token[] = [];
    const re = /("(?:[^"\\]|\\.)*")|(-?(?:path|file|tag|line|block|content|section|match|heading):(?:[^\s)]+|"(?:[^"\\]|\\.)*"))|(-?\()|(\))|(\bOR\b)|(-?(?:[^\s()"]+))/gi;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = re.exec(query)) !== null) {
      if (match.index > lastIndex) {
        const ws = query.slice(lastIndex, match.index);
        if (ws) tokens.push({ type: 'whitespace', raw: ws, value: ws });
      }

      const [, quoted, op, openParen, closeParen, orKw, term] = match;

      if (quoted) {
        tokens.push({ type: 'quoted', raw: quoted, value: quoted.slice(1, -1) });
      } else if (op) {
        tokens.push({ type: 'operator', raw: op, value: op });
      } else if (openParen) {
        tokens.push({ type: 'open', raw: openParen, value: openParen });
      } else if (closeParen) {
        tokens.push({ type: 'close', raw: closeParen, value: closeParen });
      } else if (orKw) {
        tokens.push({ type: 'or', raw: orKw, value: 'OR' });
      } else if (term) {
        tokens.push({ type: 'plain', raw: term, value: term });
      }

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < query.length) {
      const remaining = query.slice(lastIndex);
      if (remaining) tokens.push({ type: 'whitespace', raw: remaining, value: remaining });
    }

    return tokens;
  }
}

interface Token {
  type: 'plain' | 'quoted' | 'operator' | 'open' | 'close' | 'or' | 'whitespace';
  raw: string;
  value: string;
}

declare var app: any;
