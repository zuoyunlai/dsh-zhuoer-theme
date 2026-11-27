# 设置面板 / 配色编辑面板 重构规格书

> 落盘日期：2026-11-27｜执行者：Claude Code｜状态：待执行
> 本文件是本次重构的唯一权威需求来源。执行前通读全文，改动范围以本文为准。

## 0. 环境与仓库

- 仓库绝对路径：`E:\Documents\deepseek-harness\default-workspace\dsh-zhuoer-theme`
- git 分支 `main`，工作区干净，HEAD = `cc14fb8`，版本 0.6.41，MIT
- 纯本地插件：无账号、无遥测、无外部网络请求（仅用户在编辑器点「AI 生成」时才经宿主自己的模型补一组锚点色）
- 宿主：DeepSeek Harness（Electron + React + Vite + Cordis），配色走宿主主题服务

## 1. 必读：前端设计技能

读 `C:\Users\Zuoyunlai\.dsh\skills\frontend-design\SKILL.md`（不存在时在 `C:\Users\Zuoyunlai\.dsh\skills\` 下找同名目录再读）。

必须按技能的两遍法执行，不得跳步：

1. **先出设计计划**——基色 4–6 个命名 hex、字体与其角色、布局概念 + ASCII 线框、原则——落盘到 `docs/panel-redesign-2026-11-27.md`。
2. **对照本文自评**：哪一部分是「任何 brief 都能产出的通用默认」而不是这个题目的选择？改掉，并在文档里写明改了什么、为什么。
3. 自评通过后才允许改代码。

技能里点名要避开的默认套路（本项目尤其要避开）：奶油底 + 高对比衬线 + 陶土色点缀；近黑底 + 单一亮绿/朱红点缀；报纸细线密排；SaaS 卡片套装（内容切成一模一样的圆角卡、统一柔和阴影、渐变做装饰）；tracked-out 全大写 eyebrow；居中点分隔的 meta 串；「WORD — fragment」标签；小数据标签一律用等宽；按钮文字尾巴挂「→」。

设计要落在「主题 / 配色 / 取色」这个题材自身，延续插件已有的视觉语言，不要另起炉灶造一个通用后台皮肤。

## 2. 目标界面与代码位置

主文件 `src/20-tokens-and-panel.js`（客户端半边，React createElement，`h()` 调用）：

| 位置 | 行号（约） | 内容 |
|---|---|---|
| `PANEL_CSS` | 1180 起 | 面板 CSS 模板字符串（`.zp-root{display:flex;...}`），本文件含 315 处 `zp-*` 类名 |
| `Swatch` | 1553 | 主题卡预览块 |
| `ThemeEditor` | 1686 | 自定义主题编辑器 / 逐色微调 |
| `openEditor` | 2333 | 打开编辑器 |
| 面板根渲染 | 2238 / 2543 | `.zp-root` |

辅助：`src/30-quicknav.js` 向宿主 `settings.section` 槽注入快捷入口（刻度门也检查此文件）。

构建：`client.js` 是 `src/*.js` 按文件名顺序**逐字节拼接**的产物（`build.mjs`）。改完必须 `npm run build` 重新生成，**不要手改 client.js**。

文案：`src/05-i18n.js` + `i18n/*.json`（8 语言）+ `locale/*.json`。

文档：`README.md` / `README.en.md`（双语）、`CHANGELOG.md`、`docs/` 既有计划。

## 3. 用户诉求与验收目标

用户原话：**「启用前端设计插件对 zhuoer 主题的设置面板和编辑配色面板进行重构美化，优化」**。

先读代码确认现状再下结论。已知大致现状：设置面板与配色编辑器挤在同一抽屉；12 套内置主题卡 + 12 套风格预设 + 8 组锚点微调 + AI 生成 + 图片取色 + 底纹/字体等全局开关混排；卡片预览、锚点编辑、开关三类控件规格不统一；缺少「当前值 vs 默认值」与重置/撤销的明确层级。

### A. 信息架构
面板重排为清晰层级：**主题库 / 风格预设 / 自定义配色编辑 / 全局偏好**。配色编辑器收成一段清晰流程：选基色 → 逐组锚点微调 → 实时预览 → 应用 / 重置 / 撤销。

### B. 视觉一致性
字号、间距、圆角、描边、控件高度统一到既有刻度（见 4.3）；去重复装饰；把「可记忆的一件事」留给主题 / 配色预览本身。

### C. 配色编辑面板（本次重点）
- 8 组锚点分组呈现（背景 / 表面 / 文字 / 品牌 / 语义），每组内聚、组间有呼吸；
- 实时预览必须能看出改动落在哪；
- 当前值与默认值双态可见；
- 重置 / 撤销可用；
- AI 生成与图片取色入口不喧宾夺主。

### D. 无障碍与响应式
键盘焦点环、aria 语义（状态不能只靠颜色）、`prefers-reduced-motion`、窄视口不破。

### E. 文案
用普通用户语言，动作词前后一致，不加装饰性标签。

## 4. 硬约束（违反即返工）

### 4.1 宿主契约
- 配色只经 `ctx.theme.overrideTokens()` 注入，映射到 `--dsw-alias-*` token；
- 不劫持宿主 DOM、不新增宿主组件；
- `contracts/host-contract.json` 与 `scripts/verify-host-contract.mjs` 是契约，**不得改契约来迁就改动**；
- 只用 **M1**（宿主 token）与 **M2**（ARIA 语义选择器），**不要新增对宿主哈希类名的依赖**（`docs/plan-component-surface.md` 已明确本批次不用 M3）。

### 4.2 颜色
- `PANEL_CSS` 里保持**零色值**——颜色一律经 CSS 变量 / 内联 `--zp-th-*` 变量传入，明暗两态共用同一套规则；
- 不改 `themes.mjs` 的 224 token 映射；
- 不改 `buildCustomTokens` 派生逻辑、不改 `enforceTextFloor` 地板；
- 对比度台账只升不降（`npm run verify:contrast` 必须仍绿），**不得放宽基线让它绿**。

### 4.3 刻度门（`scripts/verify-css-grid.mjs`，最容易踩）
- `font-size` ∈ {11, 12, 13, 15, 18, 20}
- `border-radius` ∈ {0, 2, 3, 4, 6, 8, 10, 12, 14, 16, 999}
- 间距（gap / padding / margin）≥ 4px 必须是**偶数**（2px 网格）；< 4px 视为光学微调放行
- 控件命中区尺寸（按钮高、关闭键大小）不受此约束

### 4.4 i18n
- 新文案必须走 i18n，**不得新增裸中文 / 英文字面量**（`scripts/verify-i18n.mjs` 是棘轮：只许减不许增）；
- 键名 8 语言齐备（`npm run sync:i18n` / `verify:keys` / `verify:locale`）。

### 4.5 文案快照
`contracts/text-snapshot/{zh,en}.json` 是基线。只有确属有意改文案才 `npm run verify:text --update`，并在报告里说明改了什么。

### 4.6 构建与门禁
改 `src` 后必须 `npm run build` 重新生成 `client.js`；**不要手改 client.js，不要手改 contracts/ 下的基线数字**。

### 4.7 版本与发布
**不要 git commit、不要 push、不要 npm publish。** 改动留在工作区交回。不动 `package.json` version、`market/index.json`、CHANGELOG 的版本号（发布是另一件事）。

### 4.8 视觉基线
`contracts/visual-baseline/*.png` 与 `contracts/css-snapshot/*.css` 是**宿主真机采集产物**。
- 没有真机宿主界面就**不得伪造**这些基线，相关门禁保持 SKIP（退出码 0）；
- 若能打开宿主（DSH Web GUI 在 `http://127.0.0.1:5536`，插件需先 `npm run dev:sync` 同步到宿主安装目录）则可采集；
- 采集不了就在报告里写「视觉基线待真机重采」。

## 5. 必须跑的验收（记录真实退出码与关键输出）

```bash
npm run verify:syntax
npm run build
npm run verify:build
npm run verify:panel
npm run verify:cssgrid
npm run verify:i18n
npm run verify:keys
npm run verify:locale
npm run verify:text
npm run verify:contrast
npm run verify:scale
npm run verify:important
npm run verify:host
npm run verify:version
npm run verify:all
```

最后 `npm run verify:all`（整条链）必须退出码 0。

任何一条红了：**修到绿，或如实报告红在哪、为什么没修**——不要改基线 / 契约 / 门禁脚本来让它变绿。

## 6. 交付格式（最终回报按此五项写）

1. **设计计划要点**：色板 / 字体 / 布局 / 原则 + 落盘文件路径
2. **改动文件清单**：按「设置面板」「配色编辑器」「共享样式」分组，写清改了什么、为什么
3. **门禁实测**：每条命令 + **真实退出码** + 关键输出（不要只写「通过」）
4. **未完成与风险**：视觉基线是否重采、窄视口是否验证、哪些交互需真机确认
5. **一句自评**：这次设计里最「可记忆的一件事」是什么，哪一处你自己还不够满意
