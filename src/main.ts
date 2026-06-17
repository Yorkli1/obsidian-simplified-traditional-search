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
    await this._ensurePhraseData();

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
      this._ensurePhraseData();
      this._tryHook();
    }
  }

  /**
   * 按需載入短語映射數據（不打包進 main.js）
   */
  private async _ensurePhraseData(): Promise<void> {
    if (!this.settings.phraseEnabled || this.converter.isPhraseLoaded) return;

    try {
      const pluginDir = `${this.app.vault.configDir}/plugins/simplified-traditional-search`;
      const adapter = this.app.vault.adapter;

      const [stRaw, tsRaw] = await Promise.all([
        adapter.read(`${pluginDir}/st_phrases.json`),
        adapter.read(`${pluginDir}/ts_phrases.json`),
      ]);

      this.converter.loadPhraseData(JSON.parse(stRaw), JSON.parse(tsRaw));
      console.log('Phrase data loaded');
    } catch (e) {
      console.warn('Failed to load phrase data:', e);
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
    if (hook.hook()) this.searchHook = hook;
  }
}
