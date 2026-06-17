import { Direction, ChineseConverter } from './converter';

/**
 * 搜索攔截器 — 掛載到 Obsidian 的全局搜索輸入框
 * 
 * 工作流程：
 * 用戶輸入 → 檢測中文字符 → OpenCC 轉換 → (原詞) OR (轉換詞) → 原生搜索引擎
 */
export class SearchHook {
  private converter: ChineseConverter;
  private inputEl: HTMLInputElement | null = null;
  private isUpdating = false;
  /** 用戶最後一次手動輸入後的值（排除插件自動展開） */
  private lastUserValue = '';
  private observeTimer: number | null = null;

  constructor(
    private direction: Direction,
    private keepOperators: boolean,
  ) {
    this.converter = new ChineseConverter();
  }

  setDirection(dir: Direction): void {
    this.direction = dir;
    if (this.inputEl) {
      this._processInput(this.inputEl);
    }
  }

  setKeepOperators(keep: boolean): void {
    this.keepOperators = keep;
  }

  /**
   * 查找並 hook 到搜索輸入框
   */
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
    this._setupFallback(container);

    this._processInput(input);

    return true;
  }

  unhook(): void {
    this._unhook();
  }

  private _unhook(): void {
    if (this.inputEl) {
      this.inputEl.removeEventListener('input', this._onInput);
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
    this._processInput(input);
  };

  /**
   * 處理搜索輸入變化
   * 
   * 安全策略（防止無限循環展開）：
   * 1. 如果值變短了（用戶在退格/刪除），跳過展開
   * 2. 如果游標不在輸入框末尾，跳過（用戶在中間編輯）
   * 3. 如果查詢已包含 OR 展開模式，跳過
   * 4. 如果 isUpdating 為 true（我們自己在更新），跳過
   */
  private _processInput(input: HTMLInputElement): void {
    if (this.isUpdating) return;

    const currentValue = input.value;

    // ── 安全檢查 1：值沒變 → 跳過 ──
    if (currentValue === this.lastUserValue) return;

    // ── 安全檢查 2：值變短了（用戶在退格刪除）→ 跳過，不重新展開 ──
    if (currentValue.length < this.lastUserValue.length) {
      this.lastUserValue = currentValue;
      return;
    }

    // ── 安全檢查 3：游標不在末尾（用戶在中間編輯）→ 跳過 ──
    if (input.selectionStart !== null && input.selectionStart !== currentValue.length) {
      this.lastUserValue = currentValue;
      return;
    }

    // ── 安全檢查 4：查詢包含括號或 OR → 已是複雜/展開過的查詢，不自動展開 ──
    //    正常用戶搜索不會打括號，只有我們展開時才會
    if (/[()]/.test(currentValue)) {
      this.lastUserValue = currentValue;
      return;
    }

    // ── 安全檢查 5：沒有中文 → 跳過 ──
    if (!this.converter.hasChinese(currentValue)) {
      this.lastUserValue = currentValue;
      return;
    }

    // ── 安全檢查 6：不需要轉換（全是同方向的字） → 跳過 ──
    if (!this.converter.needsConversion(currentValue, this.direction)) {
      this.lastUserValue = currentValue;
      return;
    }

    // ── 執行展開 ──
    const expanded = this._expandQuery(currentValue);
    if (!expanded || expanded === currentValue) return;

    // 記住展開前的值，用於檢測刪除
    this.lastUserValue = currentValue;

    // 更新搜索框
    this.isUpdating = true;
    input.value = expanded;
    // 觸發 Obsidian 的搜索更新
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    this.isUpdating = false;
  }

  /**
   * 展開查詢：將包含中文字符的詞條替換為 (原詞) OR (轉換詞)
   */
  private _expandQuery(query: string): string {
    const tokens = this._tokenize(query);
    const newTokens: string[] = [];

    for (const token of tokens) {
      if (token.type === 'plain' && this.converter.hasChinese(token.value)) {
        const converted = this.converter.getVariant(token.value, this.direction);
        if (converted !== token.value) {
          newTokens.push(`(${token.value}) OR (${converted})`);
          continue;
        }
      }
      newTokens.push(token.raw);
    }

    return newTokens.join(' ');
  }

  /**
   * 將查詢字符串分詞
   * 識別: quoted strings, operators (path:/file:/tag:), OR, -prefix, group parens
   */
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
