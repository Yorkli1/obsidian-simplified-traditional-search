import { App, PluginSettingTab, Setting } from 'obsidian';
import type STSearchPlugin from './main';

export interface STSearchSettings {
  /** 轉換方向 */
  direction: 's2t' | 't2s' | 'bidirectional';
  /** 是否啟用 */
  enabled: boolean;
  /** 是否保留運算符不轉換 */
  keepOperators: boolean;
  /** 隱式模式：搜索欄仍顯示原詞，但結果包含繁簡 */
  silentMode: boolean;
}

export const DEFAULT_SETTINGS: STSearchSettings = {
  direction: 'bidirectional',
  enabled: true,
  keepOperators: true,
  silentMode: false,
};

export class STSearchSettingTab extends PluginSettingTab {
  private plugin: STSearchPlugin;

  constructor(app: App, plugin: STSearchPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Simplified-Traditional Search — 繁簡搜索統一' });

    containerEl.createEl('p', {
      text: '自動在全局搜索中展開簡體/繁體中文字符，讓搜索不再因繁簡不同而漏掉結果。',
      cls: 'setting-item-description',
    });

    new Setting(containerEl)
      .setName('啟用插件')
      .setDesc('控制 Simplified-Traditional Search 是否處理搜索查詢')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.enabled)
          .onChange(async value => {
            this.plugin.settings.enabled = value;
            await this.plugin.saveSettings();
            this.plugin.reevaluate();
          })
      );

    new Setting(containerEl)
      .setName('轉換方向')
      .setDesc('選擇如何匹配繁簡中文')
      .addDropdown(dropdown =>
        dropdown
          .addOption('s2t', '簡體→繁體（搜「剑」也找「劍」）')
          .addOption('t2s', '繁體→簡體（搜「劍」也找「剑」）')
          .addOption('bidirectional', '雙向（兩邊都匹配，推薦）')
          .setValue(this.plugin.settings.direction)
          .onChange(async value => {
            this.plugin.settings.direction = value as 's2t' | 't2s' | 'bidirectional';
            await this.plugin.saveSettings();
            this.plugin.reevaluate();
          })
      );

    new Setting(containerEl)
      .setName('保留搜索運算符')
      .setDesc('開啟時不轉換 path:、tag:、file: 等運算符後的值')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.keepOperators)
          .onChange(async value => {
            this.plugin.settings.keepOperators = value;
            await this.plugin.saveSettings();
            this.plugin.reevaluate();
          })
      );

    new Setting(containerEl)
      .setName('隱式模式')
      .setDesc('開啟後搜索欄不顯示展開後的 (剑) OR (劍)，只顯示你輸入的「剑」，但結果仍包含繁簡匹配。')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.silentMode)
          .onChange(async value => {
            this.plugin.settings.silentMode = value;
            await this.plugin.saveSettings();
            this.plugin.reevaluate();
          })
      );

    containerEl.createEl('hr');

    containerEl.createEl('h3', { text: '使用說明' });

    const instructions = containerEl.createEl('div', { cls: 'setting-item' });
    instructions.createEl('p', {
      text: '啟用後，在全局搜索（Cmd/Ctrl+Shift+F）中輸入任意含有中文字符的關鍵詞，插件會自動將其展開為 (原詞) OR (繁/簡轉換詞) 的形式。'
    });
    instructions.createEl('p', {
      text: '例如：輸入「剑法」→ 實際搜索 (剑法) OR (劍法)，兩種寫法的結果都會出現。'
    });
    instructions.createEl('p', {
      text: '注意：如果搜索詞已經包含 OR 表達式（如已展開），插件會智能跳過不再重複處理。'
    });
  }
}
