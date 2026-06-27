import { App, PluginSettingTab, Setting } from 'obsidian';
import type STSearchPlugin from './main';
import { variantStats, type Region } from './converter';

export interface STSearchSettings {
  enabled: boolean;
  region: Region;
  keepOperators: boolean;
  silentMode: boolean;
  debounceMs: number;
  phraseEnabled: boolean;
}

export const DEFAULT_SETTINGS: STSearchSettings = {
  enabled: true,
  region: 'hk',
  keepOperators: true,
  silentMode: false,
  debounceMs: 800,
  phraseEnabled: false,
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

    new Setting(containerEl).setName('Unified Chinese-characters Searcher (UCCS)').setHeading();
    containerEl.createEl('p', {
      text: '在 Obsidian 全局搜索中自動匹配多種地區的中文，讓你輸入任何一個中文字都能找到所有對應中文的結果。',
      cls: 'setting-item-description',
    });

    // ════════════════════════════════════════
    //  基本設置
    // ════════════════════════════════════════
    new Setting(containerEl).setName('基本設置').setHeading();

    new Setting(containerEl)
      .setName('啟用插件')
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
      .setName('映射地區')
      .setDesc('選擇繁簡轉換的地區變體。不同地區的繁體寫法略有差異。')
      .addDropdown(dropdown =>
        dropdown
          .addOption('hk', '簡體<->繁體（香港）')
          .addOption('tw', '簡體<->繁體（台灣）')
          .addOption('all', '全部地區')
          .addOption('tw-hk', '*繁體HK<->繁體TW')
          .setValue(this.plugin.settings.region)
          .onChange(async value => {
            this.plugin.settings.region = value as Region;
            await this.plugin.saveSettings();
            this.plugin.reevaluate();
          })
      );

    // ── 地區差異對照 ──
    const regionNote = containerEl.createEl('div', {
      cls: 'uccs-settings-note',
    });
    regionNote.createEl('p', { text: '不同模式的匹配方式：' });

    const table = regionNote.createEl('table', { cls: 'uccs-settings-table' });
    const thead = table.createEl('thead');
    const headerRow = thead.createEl('tr');
    const headers = ['模式', '用戶輸入(簡/繁)', '涵蓋搜索結果'];
    for (const h of headers) {
      headerRow.createEl('th', { text: h });
    }

    const tbody = table.createEl('tbody');
    const rows = [
      ['簡體-繁體HK', '烟 / 菸', '(烟) OR (菸)'],
      ['簡體-繁體TW', '启 / 啟', '(启) OR (啟)'],
      ['全部地區', '里 / 裏 / 裡', '(里) OR (裏) OR (裡)'],
      ['*繁體HK-繁體TW', '裏 / 裡', '(裏) OR (裡)'],
    ];
    for (const cells of rows) {
      const tr = tbody.createEl('tr');
      for (const cell of cells) {
        tr.createEl('td', { text: cell });
      }
    }

    regionNote.createEl('p', { text: '*繁體(HK)和繁體(TW)大部分寫法相同，應用此選項僅在繁體(HK)和繁體(TW)之間有差異時進行展開且不會匹配簡體中文。' });
    //  高級功能
    // ════════════════════════════════════════
    new Setting(containerEl).setName('高級功能').setHeading();

    // ── 轉換運算符值 ──
    new Setting(containerEl)
      .setName('轉換運算符值')
      .setDesc('開啟後 path:、tag:、file: 等搜索運算符後面的中文也會按照映射地區而轉換。')
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
      cls: 'uccs-settings-note',
    });
    opDesc.createEl('p', { text: '例如選用「全部地區」時：' });
    opDesc.createEl('p', { text: 'tag：里巷  = 【 tag：里巷 OR tag：裏巷 OR tag：裡巷】' });
    opDesc.createEl('p', { text: '關閉則此選項則：tag：里巷 =【tag：里巷】，【tag：裏巷】和【tag：裡巷】不會被觸發。' });

    // ── 展開延遲 ──
    new Setting(containerEl)
      .setName('展開延遲')
      .setDesc('打字結束後等待多少毫秒再展開查詢。預設 800ms。數值越小展開越快，但容易在打字中途誤展開。')
      .addSlider(slider =>
        slider
          .setLimits(200, 2000, 100)
          .setValue(this.plugin.settings.debounceMs)
          // setDynamicTooltip is deprecated but still functional;
          // setDisplayFormat (1.13.0+) causes rendering errors on older Obsidian
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

    // ── 短語/成語補充轉換 ──
    new Setting(containerEl)
      .setName('短語/成語補充轉換')
      .setDesc('字符轉換無法處理時，補充短語級轉換（例如：老板 → 老闆）。僅在結果不同時追加。')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.phraseEnabled)
          .onChange(async value => {
            this.plugin.settings.phraseEnabled = value;
            await this.plugin.saveSettings();
            this.plugin.reevaluate();
          })
      );

    // ── GitHub 按鈕 ──
    new Setting(containerEl)
      .setName('GitHub')
      .setDesc('原始碼、議題回報、貢獻')
      .addButton(button =>
        button
          .setButtonText('前往 GitHub')
          .setCta()
          .onClick(() => {
            open('https://github.com/Yorkli1/Unified-Chinese-Characters-Searcher');
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

    // ── 版權與授權 ──
    const notice = containerEl.createEl('p', {
      cls: 'uccs-settings-notice',
    });
    notice.createEl('span', { text: '字符映射數據源自 ' });
    notice.createEl('a', {
      text: 'OpenCC',
      href: 'https://github.com/BYVoid/OpenCC',
    });
    notice.createEl('span', { text: '（Apache License 2.0）。本插件僅做格式轉換，不修改原始映射關係。' });
  }
}
