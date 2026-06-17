import { Plugin, WorkspaceLeaf } from 'obsidian';
import { SearchHook } from './search-hook';
import { STSearchSettings, STSearchSettingTab, DEFAULT_SETTINGS } from './settings';
import { ChineseConverter, Direction } from './converter';

export default class STSearchPlugin extends Plugin {
  settings!: STSearchSettings;
  private searchHook: SearchHook | null = null;
  private converter!: ChineseConverter;

  async onload(): Promise<void> {
    this.converter = new ChineseConverter();
    await this.loadSettings();

    // 註冊設置頁
    this.addSettingTab(new STSearchSettingTab(this.app, this));

    // 監聽佈局變化 — 搜索面板可能在不同時候創建
    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        this._tryHook();
      })
    );

    // 面板打開/關閉時重新掛鉤
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        this._tryHook();
      })
    );

    // 延遲嘗試掛鉤（確保搜索面板已就緒）
    setTimeout(() => this._tryHook(), 500);
    setTimeout(() => this._tryHook(), 1500);
    setTimeout(() => this._tryHook(), 3000);

    console.log('Simplified-Traditional Search: plugin loaded');
  }

  onunload(): void {
    this.searchHook?.unhook();
    this.searchHook = null;
    console.log('Simplified-Traditional Search: plugin unloaded');
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /**
   * 當設置變更後重新評估
   */
  reevaluate(): void {
    this.searchHook?.unhook();
    this.searchHook = null;
    if (this.settings.enabled) {
      this._tryHook();
    }
  }

  private _tryHook(): void {
    if (!this.settings.enabled) return;
    if (this.searchHook) {
      // 更新已存在的 hook 的設置
      this.searchHook.setDirection(this.settings.direction);
      this.searchHook.setKeepOperators(this.settings.keepOperators);
      return;
    }

    const hook = new SearchHook(this.settings.direction, this.settings.keepOperators);
    if (hook.hook()) {
      this.searchHook = hook;
    }
  }
}
