import { Plugin } from 'obsidian';
import { SearchHook } from './search-hook';
import { STSearchSettings, STSearchSettingTab, DEFAULT_SETTINGS } from './settings';
import { ChineseConverter } from './converter';

export default class STSearchPlugin extends Plugin {
  settings!: STSearchSettings;
  private searchHook: SearchHook | null = null;
  private converter: ChineseConverter;

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
      this.searchHook.setRegion(this.settings.region);
      this.searchHook.setSilentMode(this.settings.silentMode);
      this.searchHook.setKeepOperators(this.settings.keepOperators);
      this.searchHook.setDebounceMs(this.settings.debounceMs);
      this.searchHook.setPhraseEnabled(this.settings.phraseEnabled);
      return;
    }

    const hook = new SearchHook(
      this.converter,
      this.settings.keepOperators,
      this.settings.silentMode,
      this.settings.debounceMs,
      this.settings.phraseEnabled,
    );
    this.converter.setRegion(this.settings.region);
    if (hook.hook()) this.searchHook = hook;
  }
}
