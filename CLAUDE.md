# UCCS — Unified Chinese-characters Searcher

Obsidian 插件：在搜索框中输入简体/繁体中文时自动展开为跨变体 OR 查询。
例如输入「剑」→ 自动展开为 `(剑) OR (劍)`。

## 技术栈

- TypeScript (ES2018 target, CJS output via esbuild)
- Obsidian Plugin API (minAppVersion 1.5.0)
- OpenCC 字符映射数据（Apache 2.0 授权）
- vitest 单元测试（59 个用例）

## 项目结构

```
src/
├── main.ts          # 插件入口，生命周期，设置面板
├── converter.ts     # ChineseConverter 类：字符变体查找、区域模式
├── expander.ts      # 纯函数：tokenize, expandQuery, handleBackspace 等
├── search-hook.ts   # DOM hook：拦截搜索 input 事件
├── settings.ts      # 设置接口和默认值
├── data/            # OpenCC 映射 JSON（编译时 import 进 bundle）
├── *.test.ts        # vitest 单元测试（与源文件同目录）
scripts/
├── gen_mappings.py  # 从 OpenCC 生成 JSON 映射文件
esbuild.config.mjs   # 构建配置
```

## 核心架构

### Converter（converter.ts）
- `getVariants(char)`：返回字符的所有变体（排除自身），同时查 s2t 和 t2s
- `hasChinese(text)`：`/[\u4e00-\u9fff\u3400-\u4dbf]/`
- `needsConversion(text)`：是否有字符可转换
- 4 种区域模式：hk / tw / all / tw-hk
- **t2s 不限制区域**：任何繁体字都能找到简体
- **s2t 链式查找**：输入繁体 → 找简体 → 从简体查模式特定繁体
- 导出 `variantStats` 供设置面板显示

### Expander（expander.ts，全部纯函数）
- `tokenize(query)`：分词（中文 + 运算符值分离）
- `expandQuery(tokens, converter)`：单字→每个变体一个 OR 子句；多字→整串转换一个 OR
- `isExpansionWithExtra(query)`：检测展开后追加文本
- `stripExpansion(query)`：剥离展开部分，还原原文
- `handleBackspace(current, lastUser)`：返回 `{action, value}`

### SearchHook（search-hook.ts）
- 通过 `app.workspace.getLeavesOfType('search')` 找搜索面板
- `layout-change` / `active-leaf-change` 事件重新 hook
- `setInterval` 2s 检测 DOM 重建
- 安全检查链（顺序不可变）：
  1. `isUpdating` 标志
  2. 退格检测 → handleBackspace
  3. IME composition 状态
  4. 无中文 → 跳过
  5. 括号检测 → 跳过（不更新 lastUserValue）
  6. OR 关键词检测 → 跳过
- Debounce 800ms（可配置 200-2000ms）

### Phrase Supplement（可选，默认开启）
- 字符转换后检查短语级匹配
- 如果短语结果与所有已有 term 不同，追加为额外 term

## 关键命令

```bash
npm run dev          # watch 模式构建
npm run build        # tsc 检查 + production build
npm test             # vitest run（59 个用例）
npm run version      # 更新 manifest.json 和 versions.json
```

## 编码规范

- 4 空格缩进
- 函数必须有 type hints
- `window.setTimeout` / `window.setInterval`（不用裸调用，社区审查要求）
- `import { builtinModules } from "node:module"`（不用 `builtin-modules` 包）
- 设置面板用 `new Setting().setHeading()` 不用 `createEl('h2')`
- 样式用 CSS class 不用 inline `style.cssText`
- 不在设置标题中包含插件名（审查会拒绝）
- `manifest.json` 的 description 不能含 "Obsidian"、不能用中文标点结尾
- 用 `querySelector<HTMLInputElement>()` 泛型，不用 `as` 断言
- 测试文件与源文件同目录（`src/*.test.ts`）

## 关键陷阱

1. **无限展开循环**：安全检查链必须严格按顺序，`lastUserValue` 在括号检测时不更新
2. **IME 组合输入**：拼音输入法中途触发 `input` 事件 → 用 `compositionstart/end` 追踪
3. **退格三 bug**：括号内退格不恢复原文 / 退到原文不重新展开 / 残骸二次展开
4. **esbuild JSON import**：中文变成 `\uNNNN` 转义序列，正常行为
5. **Obsidian 不自动重载插件**：改 `main.js` 后用户必须手动点 Reload
6. **没有公开 Search API**：只能 DOM hook，没有 `registerSearchPlugin()`
7. **`setDynamicTooltip()` 兼容性**：被标记 deprecated 但 `setDisplayFormat()` 需要 Obsidian 1.13+

## 发布流程

1. `npm run build` 生成 production `main.js`
2. `npm run version` 更新 manifest.json + versions.json
3. Git tag 不带 `v` 前缀（`1.0.0` 不是 `v1.0.0`，社区目录要求）
4. `gh release create` 上传 main.js, manifest.json, styles.css
5. community.obsidian.md 提交
