# 待办（backlog）

按「动它的风险」排序。每条写清判据与验收方式，免得下次打开又要重新判断该不该做。
已结项的不删除，改成「已决定不做 + 理由」——被推翻的结论比空表更有用。

## 1. `applyTokens` 的 DOM 半边（未拆）

**现状**：589 行（0.5.8 之前 632）。已抽出三个纯函数：`applySurfaceFills`（表面填充五条）、
`applyElevations`（阴影三档）、`importantDecls`（!important 声明串）。剩下的是 450 行连成
一片的 CSS 文本构建 + shadow root 注入 + `MutationObserver` 生命周期。

**为什么停在这**：剩下的不是「长」是「耦合」——它持有 `document`、`window.__zrSkinObs`、
`dispose` 闭包，以及「宿主节点在不在 / 是不是首次注入」的运行时判断。拆它要同时改生命周期，
而这块代码历史上出过两次事故（0.3.3 界面冻结、0.4.1 字号只缩放正文）。

**判据**：拆完 `overrideTokens` 收到的对象必须逐 token 与拆前一致——用 `test-derive` 快照对比，
不靠肉眼看。**验收**：`npm test` 全绿 + 11 套主题明暗切换无闪烁 + 自定义主题保存即时生效。

## 2. 视觉回归门（`verify:visual`）——CSS 改动的真正前置

**现状**：没有。这是第 1、3 条都卡住的同一个原因：CSS 与布局的改动只能在真实界面里验证。

**为什么值得先做**：0.4.1 那次回归（只缩放正文、其余不跟）就是「看起来应该没事」造成的；
0.5.8 收敛刻度时刻意只动「明显不在刻度上」的值，也是因为同样没有基线可比。

**判据**：设置页 / 编辑器抽屉 / JSON 弹层 / 主题卡 × 明暗两套，共 6–8 张基线截图；
改完逐张 diff，非零差异必须能解释。**验收**：故意把一个 `gap` 改 2px 能让门变红。

## 3. `PANEL_CSS` 间距改成 4px 网格 —— 已决定不做

**结论**：面板的真实设计语言是 **2px 网格**（6/10/14/22/26 成规模出现且视觉成立）。
硬套 4px 要改 32 处、整块重排，收益只是「数字更好看」，还得配视觉回归才敢做。

**现在由门禁守住**：`verify:cssgrid`（`scripts/verify-css-grid.mjs`）要求
字号 ∈ {11,12,13,15,18,20}、圆角 ∈ {0,2,3,4,6,8,10,12,14,16,999}、
间距 ≥4px 必须是偶数、<4px 视为光学微调放行。实测 151 个值全部合规。

**不查 width/height**：42px 按钮、26px 关闭键是命中区尺寸，套网格只会把可点击面积改小。

## 4. 字体 4.63 MB —— 已量清，无裁剪空间

**实测**（`assets/fonts`，23 个 woff2）：

| 分类 | 体积 | 占比 |
|---|---|---|
| 3 个中文字形子集（sans 1.21 / serif 1.61 / kai 0.88） | 3.70 MB | 80% |
| 20 个西文文件（14 家族，含斜体） | 0.93 MB | 20% |

**没有一个是死文件**：西文家族分别被 `MONO_STACK`（JetBrains Mono）、`FONTS` 主题字体
（beacon→Atkinson、dash 聊天→Fraunces）、12 套风格预设（luxe→Fraunces、organic→Atkinson）
和自定义主题的字体选择器（Inter / Source Serif 4 / Fira Code / Geist Mono）引用。

**唯一能减的方向**：中文子集再压——但它已经按字符集子集化过（1.2 MB ≈ 3500 字），
再压需要构建期字体工具链，会打破「零构建、纯单文件 ESM」这个前提。**暂时不做。**

## 5. 插件页图标 —— 已修（0.6.4）

**结论**：宿主读的是 **`package.json` 的 `icon` 字段**。同族插件四人组（chronicle / pet /
rightbar-quicknav / theme-palette）写法一致：根目录 `icon.svg` + `"icon": "./icon.svg"` +
`files` / `exports["./icon"]` 各一条。

**怎么定的**：不是猜——先读这四个仓的清单再照抄。**0.6.2 那次判断是错的**（当时只查了
`src/` 与 `cordis.patch.yml`，没看 package.json，也没看隔壁仓）。

**现在由门禁守住**：`verify:host` 里加了包清单三件套检查——这类字段写漏**不报错**，
只会静默少一个图标，靠记性守不住。

**残留已结（0.6.6）**：设置页左侧「Zhuoer 主题」导航行的图标也做出来了。机制**不是** `register()`
的 `icon` 字段（那个无效），而是往 **`settings.section.icon` 槽**注册，且注册 `id` 必须等于分区 `id`；
宿主渲染时按 `renderSlot(..., { size, active }, { only: row.id, fallback: 齿轮 })` 调用。
真机验证：该行 `[data-slot="settings.section.icon"]` 里从 `<svg><use>` 齿轮变成我们的 `<img>`。

## 6. `.git` 元数据事故 —— 已有工具（0.6.3）

症状 / 证据 / 归因边界 / 修复命令全在 [`docs/git-integrity.md`](git-integrity.md)。

两条要记住的：① 不是本仓脚本造成的（canary 逐命令验过），也不必再手工重建——
`node scripts/git-doctor.mjs --fix`；② `git add -A` 会漏掉**等长改写**
（0.6.2→0.6.3、0.6.3→0.6.4 两次踩中），提交前一律 `git add -A && git add --renormalize .`。

