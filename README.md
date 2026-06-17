# Obsidian-簡繁體全局搜索

> **在 Obsidian 全局搜索中自動匹配簡體與繁體中文 — 輸入「剑」也搜得到「劍」**

![Obsidian](https://img.shields.io/badge/Obsidian-Plugin-7C3AED?logo=obsidian)
![Version](https://img.shields.io/github/v/release/Yorkli1/obsidian-cjk-search)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## ✨ 功能

當你在 Obsidian 的全局搜索（`Cmd/Ctrl+Shift+F`）中輸入關鍵詞時，插件會自動將中文字符擴展為**簡體 + 繁體**兩種寫法，確保不漏掉任何筆記。

| 輸入 | 實際搜索 | 匹配結果 |
|------|---------|---------|
| `剑法` | `(剑法) OR (劍法)` | 同時命中「剑法」和「劍法」 |
| `龍門` | `(龍門) OR (龙门)` | 同時命中兩種寫法 |
| `學習 Python` | `(學習) OR (学习) Python` | 英文保持不變 |

## 🎯 適用場景

- 你的 vault 裡混雜著簡體和繁體筆記
- 從簡體網站複製的資料，與手寫的繁體筆記相互引用
- 團隊協作時隊友用繁體、你用簡體（或反過來）
- 研究古籍、兩岸三地文獻，簡繁並存

## 📦 安裝

### 手動安裝
1. 下載最新的 [Release](https://github.com/Yorkli1/obsidian-cjk-search/releases)
2. 解壓到你的 vault：`.obsidian/plugins/cjk-search/`
3. 在 Obsidian → 設定 → 第三方插件 → **重新載入插件**
4. 啟用 **CJK Search**

### 從源碼構建
```bash
git clone https://github.com/Yorklii/Obsidian-簡繁體全局搜索.git
cd Obsidian-簡繁體全局搜索
npm install
npm run build
# 將 main.js + manifest.json + styles.css 複製到 vault/.obsidian/plugins/cjk-search/
```

## ⚙️ 設定

| 選項 | 說明 |
|------|------|
| **啟用插件** | 一鍵開關 |
| **轉換方向** | 簡→繁 / 繁→簡 / **雙向（推薦）** |
| **保留搜索運算符** | 開啟時 `path:`、`tag:` 等運算符後的數值也會被轉換 |

## 🧠 工作原理

```
用戶輸入: 劍法
    ↓
檢測到中文字符
    ↓
OpenCC 標準映射表字對字轉換
    ↓
搜索框更新為: (劍法) OR (剑法)
    ↓
Obsidian 原生搜索引擎 OR 運算
    ↓
同時命中簡繁結果 ✅
```

### 技術要點
- **字符級轉換** — 4011 個簡→繁 + 4142 個繁→簡映射，源於 [OpenCC](https://github.com/BYVoid/OpenCC) 官方數據
- **智能跳過** — 檢測已展開的 `) OR (` 模式，避免重複處理
- **語法感知** — 正確解析引號、括號、`path:` 等搜索運算符
- **零運行時依賴** — 映射數據直接打包進插件，無需網絡
- **DOM 兜底** — 監聽佈局變化，搜索面板延遲創建也能正常 hook

## 🛠️ 開發

```bash
npm run dev       # 開發模式（自動 watch）
npm run build     # 生產構建
npm run version   # 更新版本號
```

字符映射表從 OpenCC 官方數據庫生成：
```bash
python3 scripts/gen_mappings.py
```

## 📄 許可證

MIT License。字符映射數據源於 [OpenCC](https://github.com/BYVoid/OpenCC)（Apache-2.0 License）。
