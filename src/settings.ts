import { App, PluginSettingTab, Setting } from 'obsidian';
import type STSearchPlugin from './main';

export interface STSearchSettings {
  enabled: boolean;
  keepOperators: boolean;
  silentMode: boolean;
  debounceMs: number;
}

export const DEFAULT_SETTINGS: STSearchSettings = {
  enabled: true,
  keepOperators: true,
  silentMode: false,
  debounceMs: 800,
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

    containerEl.createEl('h2', { text: 'Simplified–Traditional Search' });
    containerEl.createEl('p', {
      text: '在 Obsidian 全局搜索中自動匹配簡體與繁體中文，讓你輸入任何一種寫法都能找到所有結果。',
      cls: 'setting-item-description',
    });

    // ════════════════════════════════════════
    //  基本設置
    // ════════════════════════════════════════
    containerEl.createEl('h3', { text: '基本設置' });

    new Setting(containerEl)
      .setName('啟用插件')
      .setDesc('關閉後插件不影響搜索行為，所有設置保留。')
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
      .setName('匹配方式')
      .setDesc('雙向：不論用簡/繁體字搜索，結果都將包含簡體和繁體。')
      .addDropdown(dropdown =>
        dropdown
          .addOption('bidirectional', '雙向')
          .setValue('bidirectional')
          .setDisabled(true)
      );

    // ════════════════════════════════════════
    //  高級設置
    // ════════════════════════════════════════
    containerEl.createEl('h3', { text: '高級設置' });

    // ── 轉換運算符值 ──
    new Setting(containerEl)
      .setName('轉換運算符值')
      .setDesc('開啟後 path:、tag:、file: 等搜索運算符後面的中文也會被轉換。')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.keepOperators)
          .onChange(async value => {
            this.plugin.settings.keepOperators = value;
            await this.plugin.saveSettings();
            this.plugin.reevaluate();
          })
      );

    // ── 運算符說明 ──
    const opDesc = containerEl.createEl('div', {
      cls: 'setting-item-description',
    });
    opDesc.style.cssText = `
      margin: 0 0 12px 0;
      padding: 8px 12px;
      background: var(--background-secondary);
      border-radius: 6px;
      font-size: var(--font-smaller);
      line-height: 1.6;
    `;
    opDesc.createEl('p', { text: '什麼是搜索運算符？' });
    opDesc.createEl('p', {
      text: '在 Obsidian 全局搜索中，你可以使用 path:、tag:、file: 等運算符來限定搜索範圍。例如：',
    });
    const opList = opDesc.createEl('ul');
    opList.createEl('li', { text: 'path:劍法.md  → 只搜索檔案路徑包含「劍法」的檔案' });
    opList.createEl('li', { text: 'tag:劍術       → 只搜索包含 #劍術 標籤的檔案' });
    opDesc.createEl('p', { text: '開啟此選項後，運算符後面的中文也會被一併轉換：' });
    opList.createEl('li', { text: 'path:剑法.md → path:剑法.md OR path:劍法.md  ← 同時命中簡繁路徑' });
    opList.createEl('li', { text: 'tag:劍術 → tag:劍術 OR tag:剑术  ← 同時命中簡繁標籤' });
    opDesc.createEl('p', { text: '關閉則只轉換純文字，運算符後的值保持原樣。' });

    // ── 展開延遲 ──
    new Setting(containerEl)
      .setName('展開延遲')
      .setDesc('打字結束後等待多少毫秒再展開查詢。預設 800ms。數值越小展開越快，但容易在打字中途誤展開。')
      .addSlider(slider =>
        slider
          .setLimits(200, 2000, 100)
          .setValue(this.plugin.settings.debounceMs)
          .setDynamicTooltip()
          .onChange(async value => {
            this.plugin.settings.debounceMs = value;
            await this.plugin.saveSettings();
            this.plugin.reevaluate();
          })
      );

    // ── 簡化搜索欄模式 ──
    new Setting(containerEl)
      .setName('簡化搜索欄模式')
      .setDesc('開啟後搜索欄只顯示你輸入的原文（如「剑」），不顯示展開後的 (剑) OR (劍)。搜尋結果仍會同時包含繁簡匹配。')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.silentMode)
          .onChange(async value => {
            this.plugin.settings.silentMode = value;
            await this.plugin.saveSettings();
            this.plugin.reevaluate();
          })
      );

    // ════════════════════════════════════════
    //  關於
    // ════════════════════════════════════════
    containerEl.createEl('hr');
    containerEl.createEl('h3', { text: '關於' });

    const about = containerEl.createEl('div', { cls: 'setting-item' });
    about.createEl('p', {
      text: '字符映射表基於 OpenCC（開放中文轉換）官方數據，包含 4,011 個簡→繁及 4,142 個繁→簡字符映射。',
    });
    about.createEl('p', {
      text: '插件僅處理字對字轉換，不含短語/慣用語層級。完全離線運行，零外部請求。',
    });

    // ── GitHub 按鈕 ──
    new Setting(containerEl)
      .setName('GitHub')
      .setDesc('原始碼、議題回報、貢獻')
      .addButton(button =>
        button
          .setButtonText('前往 GitHub')
          .setCta()
          .onClick(() => {
            open('https://github.com/Yorkli1/obsidian-simplified-traditional-search');
          })
      );

    // ── Ko-fi 贊助 ──
    new Setting(containerEl)
      .setName('Ko-fi')
      .setDesc('如果你喜歡這個插件，可以請我喝杯咖啡 ☕')
      .addButton(button =>
        button
          .setButtonText('請我喝咖啡')
          .setCta()
          .onClick(() => {
            open('https://ko-fi.com/omgyork');
          })
      );
  }
}
