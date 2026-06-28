import type { App } from 'obsidian';
import { ChineseConverter, type Region } from './converter';
import { expandQuery, isExpansionWithExtra, stripExpansion, handleBackspace } from './expander';

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

  setDebounceMs(ms: number): void {
    this.debounceMs = ms;
  }

  setPhraseEnabled(enabled: boolean): void {
    this.phraseEnabled = enabled;
  }

  hook(): boolean {
    const searchLeaf = app.workspace.getLeavesOfType('search')[0];
    if (!searchLeaf) return false;

    const container: HTMLElement | null = searchLeaf.view?.containerEl ?? null;
    if (!container) return false;

    const input = container.querySelector<HTMLInputElement>(
      '.search-input-container input, input[type="search"], input[placeholder*="搜索"], input[placeholder*="Search"], input[placeholder*="搜尋"]'
    );
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
      window.clearInterval(this.observeTimer);
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
      const result = handleBackspace(
        currentValue, this.lastUserValue,
        (t) => this.converter.hasChinese(t),
        (t) => this.converter.needsConversion(t),
      );
      if (result.action === 'restore') {
        this.isUpdating = true;
        input.value = result.value;
        this.isUpdating = false;
        this.lastUserValue = result.value;
        if (result.value && this.converter.hasChinese(result.value) && this.converter.needsConversion(result.value)) {
          this._scheduleDebounce(input, result.value);
        }
        return;
      }
      this.lastUserValue = currentValue;
      if (result.action === 'reexpand') {
        this._scheduleDebounce(input, currentValue);
      }
      return;
    }

    // 2b. 值比 lastUserValue 長但含括號 → 展開內容上退格（值仍比原文長）
    // 例如展開 "(杖与剑) OR (杖與劍)" 後按退格 → "(杖与剑) OR (杖與劍"
    // 注意：必須排除展開+追加輸入的情況（由第4步剝離處理）
    if (/[()]/.test(currentValue) && this.lastUserValue && !/[()]/.test(this.lastUserValue)
        && !isExpansionWithExtra(currentValue)) {
      const restored = this.lastUserValue.slice(0, -1);
      this.isUpdating = true;
      input.value = restored;
      this.isUpdating = false;
      this.lastUserValue = restored;
      if (restored && this.converter.hasChinese(restored) && this.converter.needsConversion(restored)) {
        this._scheduleDebounce(input, restored);
      }
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
    // 不更新 lastUserValue，保持為展開前的原文，這樣退格時能正確恢復
    if (/[()]/.test(currentValue)) {
      return;
    }

    // 5b. 有 OR 關鍵字 → 複雜查詢，不展開（防止二次展開）
    if (/\bOR\b/i.test(currentValue)) {
      this.lastUserValue = currentValue;
      return;
    }

    // 6. 沒有中文
    if (!this.converter.hasChinese(currentValue)) {
      this.lastUserValue = currentValue;
      return;
    }

    // 7. 不需要轉換（同方向文字）
    //    但有短語時仍繼續（短語可能涵蓋字符轉換無法處理的詞）
    if (!this.converter.needsConversion(currentValue)) {
      if (!this.phraseEnabled || !this.converter.getPhraseVariant(currentValue)) {
        this.lastUserValue = currentValue;
        return;
      }
    }

    // 全部通過 → 防抖展開
    this.lastUserValue = currentValue;
    this._scheduleDebounce(input, currentValue);
  }

  /** 檢測是否為展開 + 用戶後續輸入 */
  private _isExpansionWithExtra(query: string): boolean {
    return isExpansionWithExtra(query);
  }

  /** 從展開查詢中還原用戶原始輸入 */
  private _stripExpansion(query: string): string {
    return stripExpansion(query);
  }

  private _cancelDebounce(): void {
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
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
    const expanded = expandQuery(originalValue, this.converter, {
      keepOperators: this.keepOperators,
      phraseEnabled: this.phraseEnabled,
    });
    if (!expanded || expanded === originalValue) return;

    this.lastUserValue = originalValue;

    this.isUpdating = true;
    input.value = expanded;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    this.isUpdating = false;
  }
}

declare const app: App;
