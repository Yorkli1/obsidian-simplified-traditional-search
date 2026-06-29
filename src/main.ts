import { Plugin } from 'obsidian';
import { SearchHook } from './search-hook';
import { STSearchSettings, STSearchSettingTab, DEFAULT_SETTINGS } from './settings';
import { ChineseConverter } from './converter';

export default class STSearchPlugin extends Plugin {
  settings!: STSearchSettings;
  private searchHook: SearchHook | null = null;
  private converter: ChineseConverter;
  private hookTimers: number[] = [];
  private unloaded = false;

  async onload(): Promise<void> {
    this.converter = new ChineseConverter();
    await this.loadSettings();
    this.converter.setRegion(this.settings.region);

    this.addSettingTab(new STSearchSettingTab(this.app, this));

    this.registerEvent(
      this.app.workspace.on('layout-change', () => this._tryHook())
    );
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => this._tryHook())
    );

    // 延遲重試：搜索面板可能晚於插件載入才出現
    for (const delay of [500, 1500, 3000]) {
      const id = window.setTimeout(() => this._tryHook(), delay);
      this.hookTimers.push(id);
    }

    console.log('Simplified-Traditional Search: plugin loaded');
  }

  onunload(): void {
    this.unloaded = true;
    for (const id of this.hookTimers) window.clearTimeout(id);
    this.hookTimers = [];
    this.searchHook?.unhook();
    this.searchHook = null;
    console.log('Simplified-Traditional Search: plugin unloaded');
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<STSearchSettings>);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  reevaluate(): void {
    this.searchHook?.unhook();
    this.searchHook = null;
    if (this.settings.enabled) {
      this._tryHook();
    }
  }

  private _tryHook(): void {
    if (this.unloaded || !this.settings.enabled) return;
    if (this.searchHook) {
      this.searchHook.setRegion(this.settings.region);
      this.searchHook.setKeepOperators(this.settings.keepOperators);
      this.searchHook.setDebounceMs(this.settings.debounceMs);
      this.searchHook.setPhraseEnabled(this.settings.phraseEnabled);
      return;
    }

    const hook = new SearchHook(
      this.converter,
      this.settings.keepOperators,
      this.settings.debounceMs,
      this.settings.phraseEnabled,
    );
    this.converter.setRegion(this.settings.region);
    if (hook.hook()) this.searchHook = hook;
  }
}
