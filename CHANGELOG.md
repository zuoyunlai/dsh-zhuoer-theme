# CHANGELOG

按时间倒序。每条都写「为什么改」，而不只是改了什么。

> **发布纪律：攒批发版。** 版本号只在真正发版时升一次；下面的 0.6.15、0.6.16 是**同一批里攒着、
> 尚未发布**的两条，后续批次继续往下累加，发布时统一收口到一个版本号并补一条汇总。
> 所以「面板里显示的构建号」会暂时停在 0.6.16，这是有意的，不是漏改。







## 0.6.26（未发布：对话框内 AI 生成主题）

把 AI 生成主题搬到**对话输入框**：说一句「给我一套赛博朋克配色」→ 工具生成 → 对话流里出色卡 → 点「应用」换肤。
主题设置面板里原有的 AI 生成**保持不动**，这条是增量入口。

为什么要有这条：面板里的 AI 生成要先打开设置、再找到那个输入框；而用户真实的动作是「我正在聊天，顺手要一套配色」。

- **工具侧**（`theme-tool.js` + `theme-gen.js`）：注册 `zhuoer_theme_generate`，走宿主 `llm` 流式生成；只保留 8 个锚点的 `#rrggbb`，不足 4 个即判失败。
- **卡片侧**（`src/25-chat-card.js`）：`uiConversation.events.register` + `conversation.chat.node` 插槽，色块 / 逐色修改 / 应用写盘；复用 `sanitizeCustomSpec`，写入顺序 localStorage → applyTokens → emitChange。
- **双路匹配**：直连 `tool/result` 读 `presentationMeta`；PTC（`run_code`）子调用是 `tool/ptc-dispatch`，既无 `turn` 也无 meta，规格改由渲染文本里的 `DSH_THEME_SPEC:` 行回传。**少了这一路，卡片在 `run_code` 场景永远不出来。**
- **新增门禁** `scripts/verify-schema-output.mjs`：把 `OUTPUT_SCHEMA` 与 `toOutput` 抽出来，用宿主严格规则离线校验输出契约。同类错误（schema 与真实返回值不一致）本轮连炸三次、每次都要重启才能发现，这道门把它挪回本地。

- **明暗双规格**：`theme-gen.js` 改为要求模型同时给 `light` 与 `dark` 两张锚点表（各 8 键，深色底色亮度 ≤18%），卡片 `autoDark: false` 直传，浅色不再被拿来反推深色。
- **底纹按明暗各一张**（`texturePath` / `texturePathLight`）：内置主题本就两套素材（`BG` / `BG_SOFT`），一张深图铺在浅底上会发闷。服务端 stash 到插件数据目录 → 同源 `/api/texture` 下发 → 客户端 FileReader → IndexedDB，`bg` 分别落 `key` / `keyLight`，渲染按 `scheme` 取图、缺浅色图回落主图。
- **对比度教训**：内置浅色底图是 4.9 KB 平面矢量线稿；第一版 AI 浅色底纹是 198 KB 摄影噪点、线条仅深约 2%，乘 0.7 铺贴后归零。改成「浅紫底 + 深约 12% 的细网格」才可见。

- **修复：不带底纹时 100% 生成失败**。`presentationMeta` 无条件塞了 `texture: value.texture`，而 `toOutput()` 在没有底纹时根本不会加这个键 → 值为 `undefined` → 宿主判为 non-lossless JSON，**整条工具结果被拒收**（`output.presentationMeta returned non-lossless JSON`）。面板里的 AI 生成走 HTTP、不经过 `presentationMeta`，所以只有对话框这条路全挂，看起来像偶发。改为 `toMeta()` 统一构造，可选键**有值才加**。
- **门禁补位**：`verify-schema-output.mjs` 原来只校验 `toOutput` 与 schema，不碰 `presentationMeta`，所以这个 bug 一路 `PASS`。现在把 `toMeta` 也抽出来，用「有底纹 / 无底纹」两份数据跑无损序列化断言。

- **底纹改成必答 + 走到生成**：新增**必填**参数 `texture: 'want' | 'no'`。此前只在描述里写「请先询问用户」，模型可以直接跳过——实测既没问，也**根本没生成底图**。现在三层兜住：（1）缺参数/取值非法/`want` 无路径都直接报错，错误文案即操作指引；（2）工具描述开头改成 `STEP 1 - ASK FIRST` / `STEP 2 - FOLLOW THE ANSWER`，明确「要就生成深色+浅色两张再传路径」；（3）工具返回文案按 `textureDecision` 分叉，没有底纹时要求模型在回复里告知「可以再说一句加底纹」。
- **修复：语法错误让插件整体加载失败**。上一批改工具返回文案时，`render` 里的三元表达式少了一个右括号（`theme-tool.js:229`），服务端模块无法解析 → 宿主报「启动时未能加载」，`zhuoer_theme_generate` 从工具列表里**整体消失**（表现成「这个会话没有主题生成工具」，与参数校验失败极难区分）。
- **新增启动期语法门** `scripts/verify-syntax.mjs`：对 `index.js` / `theme-tool.js` / `theme-gen.js` / `build.mjs` / `scripts/dev-sync.mjs` 跑 `node --check`，作为 `verify:all` 的第一道。此前 `verify:all` 全绿也照样能让宿主起不来——没有一道门碰过服务端语法。
- **卡片状态可见**：`textureDecision` 随输出与 `presentationMeta` 下发，未启用底纹时卡片底部显示「底纹：未启用 · 想要就说「加个底纹」」。

踩坑与取证全过程见 `docs/report-chat-theme-gen-2026-11-26.md`。
## 0.6.25（发布汇总：全量审计整改批 A / B / C + 窄屏判定修正）

依据 `docs/audit-2026-11-26.md`（全量审计，82 → 86 分）逐条整改，另修一个**窄屏布局从未生效**的老问题。

### 批 A｜宿主契约 / 数据安全 / 无障碍

- **peer 走廊扩线**：`>=0.2.2-0 <0.3.0` → `>=0.1.2-rc.1 <0.2.0 || >=0.2.0-0 <0.3.0`。原走廊与宿主 0.2.1-alpha.1、0.1.7-rc.2 都不相交——宿主对不相交的插件是**静默禁用**（能装、不生效、零报错）。plugin_doctor 的 X1 由 FAIL 转 WARN。
- **读取侧截断不再静默**：存档超过 24 套自定义主题时，超出的 id 记进 `pref.droppedCustomIds`，面板顶部给一条可关闭提示。原先 `.slice(0, CUSTOM_MAX)` 无声截掉，重启即消失。
- **无障碍**：分区标题改 `<h3>`；胶囊组与主题卡组改 `role="radiogroup"` + `role="radio"` + `aria-checked`；按钮与色板最小点击区提到 24px（真机探针：小于 24px 的按钮 8 → **0**）；切主题后往 `aria-live` 播报「已切换到 X」。

### 批 B｜门禁与生命周期

- **!important 棘轮门**（新增 `scripts/verify-important.mjs`）：client.js 的 `!important` 数量不得高于基线（当前 77），只许降不许升——防「宿主加一条、插件加两条」的优先级军备竞赛升级。
- **locale 只走 `ctx.get()`**：原先直读 `ctx.locale`，未 inject 时会抛 `cannot get property "locale" without inject`（plugin_doctor K1 现为 PASS）。
- **全局资源回收**：window 的 error 监听挂 `ctx.effect`；debug 探针、底图去抖、快捷导航的定时器改为模块句柄并在卸载时清。
- **AI 生成端点加会话随机数**：服务端每次实例启动生成 24 字节随机数，`/api/gen-theme` 必须带匹配的 `x-zhuoer-nonce`。**有边界**：浏览器里同源脚本彼此无法隔离，它挡的是外部直连探测与误撞，不是同源恶意脚本——边界写进新的 `SECURITY.md`。
- **对比度台账 655 → 679 组**：新增硬边模式选中下划线（品牌色 60% 合成到 `bg-layer-1`）这一组。
- **字号表打宿主 asar 字节戳**：`verify:scale` 在本机宿主与戳不一致时提示重抽（只提示不判红，CI 无宿主属正常）。

### 批 C｜工程整洁

- `window.__zrSkin*` 三个全局改为模块作用域变量（同页别的脚本读不到也改不了）。
- `dev:sync` 改为**默认只预览**，真写要加 `--apply`（它覆盖的是你正在跑的插件目录）。
- 视觉门支持**每张图各自的视口**（采集目录放 `viewport.json`）；新增 `SECURITY.md`（端点边界、落盘清单、诊断开关、供应链）。

### 窄屏判定修正（顺带发现的老 bug）

原规则是 `@media (max-width:359px)`，判的是**视口**宽度；但面板活在宿主设置栏里——宿主设置弹层固定 800px、内容列约 559px，视口永远宽于 359px，所以那条规则**在真实宿主里从未生效**。改成 `ResizeObserver` 按面板自身宽度判定（窄于 360px 打 `data-zr-narrow`），并补采 360×780 视口下的窄屏视觉基线（323×2334）。

### 门禁

- `verify:all` 全绿；对比度台账 679 组；`!important` 棘轮 77；CSS 快照 65729 B ×2 逐字节一致；视觉基线 3 张（含窄屏）差异 0.000%；文案 155 条（中英成对）。

## 0.6.24（修复：打开自定义主题编辑器就抛 pref is not defined）

依据 `docs/audit-2026-11-26.md`（全量审计，82/100）逐条整改，分三批落地：

### 批 A（宿主契约 / 数据安全 / 无障碍）

- **peer 走廊扩线**：`>=0.2.2-0 <0.3.0` → `>=0.1.2-rc.1 <0.2.0 || >=0.2.0-0 <0.3.0`。原走廊与宿主 0.2.1-alpha.1、0.1.7-rc.2 都不相交——宿主对不相交的插件是**静默禁用**（能装、不生效、零报错）。plugin_doctor 的 X1 由 FAIL 转 WARN（只剩 0.0.1-rc.5 这条老线，属「支持到哪条线」的选择）。
- **读取侧截断不再静默**：存档超过 24 套自定义主题时，超出的 id 记进 `pref.droppedCustomIds`，面板顶部给一条可关闭提示（`panel.custom.dropped` / `droppedClose`）。原先 `.slice(0, CUSTOM_MAX)` 无声截掉，重启即消失。
- **无障碍**：分区标题由 `<div>` 改 `<h3>`（屏读可按标题跳转）；胶囊组与主题卡组改 `role="radiogroup"` + `role="radio"` + `aria-checked`；按钮与色板最小点击区提到 24px（真机探针：小于 24px 的按钮 8 → **0**）；切主题后往 `aria-live` 区播报「已切换到 X」（`.zp-sr` 视觉隐藏但屏读可见）。

### 批 B（门禁与生命周期）

- **!important 棘轮门**（新增 `scripts/verify-important.mjs`）：只许降不许升，防「宿主加一条、插件加两条」的优先级军备竞赛。当前基线 77。
- **locale 服务只走 `ctx.get()`**：原先还直读 `ctx.locale`，未 inject 时会抛 `cannot get property "locale" without inject`（plugin_doctor K1）。K1 现为 PASS。
- **全局资源回收**：window 的 error 监听改挂 `ctx.effect`；debug 晚探针与底图去抖定时器改为模块作用域句柄并在 disposer 里清；快捷导航的收起/闪烁定时器在组件卸载时清。
- **AI 生成端点加会话随机数**：服务端每次实例启动生成 24 字节随机数，`/api/gen-theme` 必须带匹配的 `x-zhuoer-nonce`（客户端先取 `/api/nonce`）。这是**有边界**的加固——浏览器里同源脚本彼此无法隔离，它挡的是外部直连探测与误撞，不是同源恶意脚本；边界写进新的 `SECURITY.md`。

### 批 C（工程整洁）

- `window.__zrSkin*` 三个全局改为模块作用域变量（同页别的脚本读不到也改不了）。
- `dev:sync` 改为**默认只预览**，要真写加 `--apply`（它覆盖的是你正在跑的插件目录）。
- 视觉门支持**每张图各自的视口**（采集目录放 `viewport.json`），窄屏基线可与宽屏并存。
- 新增 `SECURITY.md`：端点信任边界、本机落盘清单、诊断开关、依赖与供应链。

### 门禁变化

- 对比度台账 **655 → 679 组**：新增硬边模式选中下划线（品牌色 60% 合成到 `bg-layer-1`）这一组。
- 新增 `verify:important`（棘轮），已并入 `verify:all`。
- 文案 153 → **155 条**（新增 `panel.custom.dropped` / `droppedClose` / `panel.a11y.live`，中英成对）。
- CSS 快照与视觉基线已按本批重采（CSS 65729 B ×2；视觉 3 张，含 360×780 窄屏）。
- **窄屏判定改为按面板自身宽度**：`ResizeObserver` 量 `.zp-root`，窄于 360px 打 `data-zr-narrow`。原先那条 `@media (max-width:359px)` 在真实宿主里**从未生效**——面板活在宿主设置栏里，视口宽不代表面板宽（宿主设置弹层固定 800px、内容列约 559px，视口永远 > 359px；反过来把窗口拉窄时宿主自己又不渲染设置弹层）。

## 0.6.24（修复：打开自定义主题编辑器就抛 pref is not defined）

0.6.23 的「硬边强化」把一行全局开关放进了**自定义主题编辑器**，但那行是从面板里复制过来的，直接引用了面板作用域的 `pref` / `set`。编辑器里两者都不存在，于是「新建主题」或「编辑」一打开就抛 `ReferenceError: pref is not defined`，面板显示「主题面板渲染出错」。

- `sharp` 是全局偏好，不属于单条主题的 `draft`：改为编辑器**只读** `props.sharp`、把结果用 `props.onSharp` 交回面板写入（`set({ sharp })`），编辑器不碰 `pref`/`set`；
- 冒烟门补一处真实缺口：原来的点击探针只验「新建主题按钮点得动」，0.6.23 炸的是**随后打开的编辑器**——现在点完必须再渲染一次编辑器，并要求「第三方控件」那一行出现，否则判红。

## 0.6.23（发布汇总：设置面板改版 + 硬边强化 + 基线重采）

这批三件事，都是「看着能用、但用户真的会踩」的问题：

1. **设置面板改版**：分组节奏、主题卡预览与选中徽章、胶囊/滑杆/危险态的控件语言；顺手修掉两处**本来就存在**的对比度退化（说明文字 tertiary 压卡片底最低 4.29、报错行 label-error 最低 4.36）。
2. **硬边强化**（`data-zr-sharp`）：直角主题下第三方分段控件的圆角与描边压平、外框线保留；第二排按钮走语义 `[role=tablist]` 兜底；选中态从「靠底色」改成品牌色下划线（60% 不透明度）+ 600 字重——实测宿主任一表面层对容器的对比都只有 1.00–1.05，24 组无一达 3:1。
3. **基线重采与开发预览**：CSS 快照（60379 → 65214 B ×2，采集规则扩到全部插件 style）与视觉基线（559×1644）在真机 `dsh web` 里重采，两门从 advisory 恢复为真判；对比度台账扩到 655 组；另加 `npm run dev:sync`（保持 registry 安装也能预览源码改动）。

**为什么**：面板有 7 个分区，但分组之间只隔一条 1px 细线 + 16px 上边距，区标题（13px/600）和行标签（12px/tertiary）几乎同权；主题卡的预览只有一条灰杠，12 张卡在浅色下几乎同构。用户反馈「看不出一共有几块、也不知道主题卡点没点中」。

| 面 | 改动 |
|---|---|
| 分组 | .zp-sec 改 18px 上边距 + 18px 内边距（对称），区标题与说明拆成上下两行 |
| 主题卡 | 预览重做为「品牌竖条 + 底色 + 表面层 + 正文线」，选中态加 2px 品牌环 + 勾选徽章（非颜色第二信号） |
| 控件 | 胶囊组加轨道容器、选中填品牌色；滑杆自绘轨道/拇指并支持 --zp-pct 填充；危险按钮改幽灵底，待确认态用浅危险底 |
| 页头 | 拆行 + 状态点（.zp-hd-row / .zp-live） |
| 窄容器 | 行标签收窄为 4.8em，@media 359px 再降级 |

**两处对比度问题（改之前就是退化的，不是美化带来）**：

- 说明文字与提示语原本用 label-tertiary，压在设置卡片底上 24 态里 **11 态 < 4.5（最低 4.29）** → 改 label-secondary（两档底最低 4.53 / 4.67）。
- 报错行原本和普通说明共用同一 class。label-error 压卡片底最低 **4.36**（vintage-paper 深色），所以不加红色文本，改 is-warn：**字重 600 + 点线下划线**，颜色只用于装饰线。

**基线重采（真机运行时）**：CSS 快照与视觉基线都已按这一版重采，两门从 advisory 恢复为真判。

- 采集环境：临时 `dsh web` 实例（web profile 装本插件并覆盖当前构建），视口 1264×771，浅色/深色各一次；
- CSS 快照取 `id=dsh-zhuoer-theme-tokens` 的 style 与以 `.zp-root{` 开头的面板 style，按 DOM 顺序以换行拼接（两份各 60379 B；旧基线 60237 B）；
- 视觉基线截 `.zp-root` 元素（559×1644，旧图 559×1236——面板变高是内容增加所致）。

**门禁**：对比度门新增「设置面板文字面」一组（label-primary / label-secondary 压 settings-card-fill 与 button-elevated-fill、胶囊选中、危险待确认），从 487 组扩到 655 组；i18n 新增 panel.bg.opacityCap（中英成对）后为 153 条。

**硬边强化（第三方控件）**：直角主题下，左侧栏「任务 / 定时」这类分段控件仍露圆角与描边——那不是 token 的问题：

- 容器：`border-radius: var(--dsw-radius-sm, 8px) !important` + `box-shadow: inset 0 0 0 .5px`（那条 inset 就是「外框边框」）；
- 指示块 / 标签：`border-radius: 6px !important` + `border: .5px solid`（选中态那圈线）。

所以插件自带 !important、token 到不了。新增 `data-zr-sharp`（自带且已登记契约）：满足「形状滑块=直角（radius token ≤ 2px）」或面板里勾选「压平第三方插件的硬编码圆角与描边」时挂上，只在这一个属性下接管 `.dsh-st-*` 分段控件——圆角归 0、外框 inset 描边与指示块边框全去掉，选中态靠底色区分。圆角主题完全不受影响。

只压「控件自己」的圆角与边框，**容器外框线保留**（用户反馈要那条框）；并补一组语义选择器 `[role="tablist"]` / `[role="tab"]` / 其 `aria-hidden` 指示块——第二排「记录 / 任务」用的是通用 tabs 结构，靠类名只能压一半。

选中态可辨识度：宿主各层表面（`bg-layer-1/3/4`、`interactive-bg-hover-accent` 等）彼此对比只有 **1.00–1.05**，12 套主题 × 两态**全部低于 3:1**——所以「选中靠底色」这件事在任何主题下都不可靠。硬边模式下改为给指示块加一条 **2px 品牌色下划线**（brand-primary 对 layer-1 最低 3.85:1，过 UI 组件 3:1 门槛），选中标签再加 `font-weight:600` 作第二信号。用户反馈下划线太重，改为 **60% 不透明度的品牌色**（`color-mix(in srgb, brand 60%, transparent)`，只淡这条线、不动指示块底色）：对 layer-1 最低 2.09:1、平均 3.12:1，低于 UI 组件门槛——可辨识性由 600 字重承担。

CSS 快照基线随之重采（60379 B → 65177 B / 两份）：采集规则从「tokens + 面板」扩到「所有 `dsh-zhuoer-theme*` 前缀的 style + `.zp-root{` 面板」，把 fxCss 这一段也纳入守卫。

## 0.6.22（发布汇总：组件面 2.3 / 2.1 / 2.5，另两项有据降级）

按 `docs/plan-component-surface.md` 的口径（只用 token 与语义选择器，不用哈希类名）做完三项：

| 项 | 结果 |
|---|---|
| 2.3 弹层圆角 | `[role="dialog"]` → `radius-panel`、`[role="menu"]` → `radius-lg`、`[role="tooltip"]` → `radius-sm`，只改圆角 |
| 2.1 开关 | 轨道取 `radius-lg`、滑块 `border-radius:inherit`、160ms 过渡，reduced-motion 下关闭 |
| 2.5 焦点环 | 仅键盘语境（`html:not([data-input-modality="pointer"])`），颜色取 `brand-primary` |

两项按规划里的降级条款**不做**，理由已写回文档对应小节：

- **2.2 标签页指示条**：只有哈希类名可锚定（`aria-hidden` 会被图标复用），命中必须引入 M3；
- **2.4 按钮过渡**：宿主 411 个按钮样式块里 39 个自带 `opacity/color` 过渡，整条覆盖会把它们替换掉。

契约新增 `data-input-modality`（用途：焦点环接管的作用域判断；缺失后果：鼠标点击也会画出焦点环）。

## 0.6.21（发布汇总：对话宽度可控 + 组件面规划落盘）

本版只做两件事：把「对话正文宽度」从宿主的自我测量回路里解放出来（默认 920px，可填 640–1600），
以及把「组件面能设什么」写成可执行的规划（`docs/plan-component-surface.md`，未开工）。

**起因**：桌面端聊天正文明显比 web 端窄。查完宿主源码，根因是它自己的测量回路，不是插件：

```js
function publishWidths(container) {
  const column = container.offsetWidth              // 量的是「本身已被宽度约束」的元素
  target.style.setProperty('--dsh-conversation-column-width', column + 'px')
}
function resolveContentWidth(col, pref) {
  return Math.max(680, Math.min(col * 0.64, 920))   // col 被量成 641 时 → 卡在 680 下限
}
```

自我引用使宽度收敛到 680 附近（实测正文 683px），窗口再宽也不变。

**第二个坑**：拖动产生的是**内联** `--dsh-chat-user-width`，而清 `localStorage`（键 `dsh.conversation.contentWidth`）不会清内联；
于是出现「存储里没有键、正文仍是旧宽度」。判据必须同时看 `element.style.cssText`。

**做法**：面板「排版」加一行**对话宽度**输入框（默认 920px = 宿主自己的上限，窗口放不下时按 `calc(100vw - 560px)` 收窄）：

- 留空 = 自适应（存 0，完全不注入规则，交还宿主逻辑）；
- 填 640–1600 = 注入 `[style*="--dsh-conversation-column-width"]{--dsh-chat-user-width:max(640px,min(Npx,calc(var(--dsh-conversation-column-width,1024px) - 176px))) !important}`；
  上限跟着宿主自己的列宽变量走（`CONTENT_EDGE_BUDGET = 176`），下限用宿主的 `CONTENT_MIN = 640`；
- 只写一个自定义属性，**不动任何布局尺寸**；
- 附带自愈：宿主偏好键为空时，把残留的内联 `--dsh-chat-user-width` 摘掉（正是上面第二个坑）。

冒烟门新增断言：输入 900 → 存 900；输入 100 → 夹到 640；清空 → 回到 0。

## 0.6.20（发布汇总：三个只有在真机上才暴露的问题）

这一版没有新功能，三件事都是「门禁全绿但用户一点就出问题」的类型：

| 问题 | 表层现象 | 真实原因 |
|---|---|---|
| 桌面顶栏硬边 | 右上三个窗口按钮与顶栏之间有一条色阶断层 | 顶栏渐变把收敛点算在窗口第 100% 像素，而原生按钮区从右缘 −264px 就开始覆盖 |
| 新建主题点不动 | 点 + 号没有任何反应 | `CUSTOM_MAX` 被误插进 `readPref()` 内部，事件处理器里抛 `ReferenceError` |
| 删除无确认 | 单击即删，连底图一起清 | 缺两步确认 |

对应的三处结构性补救（都已进门禁）：

- `verify:css-snapshot` 的采集提醒改成如实描述「提醒项，不是判据」，避免把时间新误读成内容一致；
- `smoke-panel` 增加**点击探针**：渲染后真点一次「新建主题」，断言不抛错且存储新增一条（渲染绿 ≠ 按钮能用）；
- `smoke-panel` 增加**有状态 hook 垫片**，连续渲染两次验证删除的两步时序（首点不删、次点归零）。

### 删除自定义主题：两步确认

删除会同时清掉该主题绑定的底图（IndexedDB 记录），底图没备份就找不回来；原来单击即删，误触代价不可逆。
现在照抄「恢复默认设置」的定时撤销模式：

- 第 1 次点「删除」→ 按钮文案变「再点一次删除」、底色变实心错误色，**不删任何东西**；
- 3.5 秒内再点一次才真删；超时或切换主题自动撤销待确认态；
- 换主题时（`pref.theme` 变化）也复位，避免把上一个主题的确认带到下一个主题上。

同时把这条路径写进冒烟门：`smoke-panel` 现在会用有状态 hook 垫片渲染两次 SkinSettings，
断言「第 1 次点击后 customThemes 不变且文案变成确认态、第 2 次点击后归零」。
（渲染级冒烟只能证明组件不炸，证明不了「点两下才删」这种时序行为。）

### 「新建主题」点不动：CUSTOM_MAX 作用域错误 + 点击探针

**现象**：点设置页「新建主题」（+）没有任何反应，面板不弹编辑器。

**根因**：`CUSTOM_MAX` 被我误插在 `readPref()` 函数内部（缩进看着像模块级，实际作用域只在函数体内）。
`newCustom()` 引用它时抛 `ReferenceError: CUSTOM_MAX is not defined`，而 React 事件处理器里的异常不会冒泡到
面板边界，表现就是「点了没反应」。同一个错误还埋着三处：复制主题、导入 JSON、读取自定义主题列表。

**为什么门没抓到**：静态门只看文本，`verify:scale`/`themes`/`csssnap` 都碰不到运行时作用域；
`smoke-panel` 只**渲染**面板，从不触发事件。所以渲染绿、点击炸。

**修法**：把 `CUSTOM_MAX` 提到模块作用域（与 `SHADOWS`/`readPref` 同级）。

**结构性补救**：`smoke-panel` 增加一条点击探针 —— 渲染后真点一次「新建主题」，断言不抛错、
并断言存储里确实多出一条自定义主题。这一颗按钮串起 `writePref` → `emitChange` → `applyTokens` 整条链路，
是在不弹真窗口前提下能点的最重的一颗。

### 桌面顶栏与窗口按钮之间的硬边

0.6.19 之后的一处视觉修正，尚未发版。

**现象**：桌面端标题栏右侧三个窗口按钮（Windows 原生 `titleBarOverlay`）与顶栏之间有一条硬边。

**取证**：截图逐像素采样 —— 顶栏左侧 `#1f2126`、按钮区 `#15171c`、按钮区左缘 x=902 处一步跳变
`(26,28,33) → (21,23,28)`。而 `#15171c` 正是本套主题 `--dsw-specific-sidebar-fill` 的深色值：
宿主把「量到的侧栏色」通过 `windowsAppearance` IPC 推给原生按钮区。

**根因**：我们的顶栏是「左侧亮带 + 右端渐变收敛到按钮色」，收敛终点写在第 100% 像素；
但原生按钮区从窗口右缘往左约 264px 就开始覆盖了，渐变在 x=902 处还没收敛完，于是留缝。

**修法**：保留亮带，但把「收敛」提前完成并固化。形状改为：亮带 → 离右缘 560px 处开始过渡 →
320px 处完全等于按钮色 → 最后 320px 纯按钮色。320 > 264，覆盖边界落进纯色区，硬边消失；
亮带仍在，顶栏与侧栏的层次保住。`--zr-topbar-hold-px` 可调那段纯色宽度（更高 DPI 下按钮区变宽就调大）。

**第一次尝试的教训**：曾把顶栏整条刷成 sidebar-fill 消除硬边，缝确实没了，但顶栏与侧栏同色、层次也没了——
用「视觉上更差」换「没有缝」不成立。正确解是让过渡**在覆盖边界之前**完成，不是取消过渡。

## 0.6.19（发布汇总：字号缩放重构 + think 渐变 token）

按攒批纪律，字号缩放重构、think 渐变 token、两条门禁修正与本轮文档纠错一起收口到本版。

### 为什么把 body{zoom} 删了

0.6.18 的字号缩放用 body{zoom}。它一处生效、整体放大，代价是把**所有布局坐标**乘了一个系数；
而宿主的侧栏拖拽是拿 clientX 与列宽直接比较的。zoom 不等于 1 时：

- 命中判定错位 —— 鼠标压在右侧栏边线上，宿主认为指针在中栏分隔线上；
- 宽度写回错位 —— 偶尔抓住，拖动改变的却是**中栏**宽度。

用户实测「只有字号=默认时拖拽正常」，就是这条的判据。皮肤插件不该做任何几何变换，这一条现在是门禁：
verify:scale 里 body{zoom} 是禁止项。

### 字号现在走三条互不重叠的通路

| 通路 | 覆盖 |
|---|---|
| --dsw-font-* 的 px 按比例换算 | Markdown 标题、代码、表格等 token 驱动的文字 |
| --dsh-content-font-size(-secondary) / --dsh-content-font-delta(-secondary) 赋值 | 对话正文与行高（宿主自己就是用它算的） |
| 构建期抽出的 HOST_TEXT_RULES（553 条 [class*="_local"] → px） | 宿主界面文字（字面量 px 的那些：侧栏项、按钮、列表、设置项） |

第三条是被实测逼出来的：运行期遍历 document.styleSheets / adoptedStyleSheets / shadow root
在真实客户端里**一条 font-size 都读不到**（面板会显示「界面文字缩放未生效」），而宿主 CSS 里
明明有 1729 条 px 字号。所以改在构建期取事实：npm run gen:hosttext 扫 app.asar，
把 .<hash>_<local> 改写成 [class*="_local"]——hash 会变、local 名稳定，因此对宿主小版本升级有韧性。

### 新增两个渐变 token

--dsw-linear-gradient-think / --dsw-linear-think-select 宿主默认写死 #fff（浅）/ #151517（深），
与本套 12 个主题的底色对不上，思考块滚动时会出现一条色带。现已按每套主题的 bg-base / bg-layer-2
生成同色淡出渐变，12 套 × 2 态共 48 条，CSS 快照基线同步重采。

### 另外修掉的两个自造事故

- **设置面板一片空白**：面板反向补偿算式写成 Math.round(10000/scale)/10000，110% 档算出 0.0091，
  面板被缩到 0.9%。正确是 100/scale。
- **拖拽高亮条与边线不重合**：高亮条挂在 body 下，rect 已是 zoom 后的视觉像素，写 left/top 等于再乘一次 zoom，
  偏差 = 位置 × (zoom−1)，右侧能差上百像素。

## 0.6.17（发布汇总：多语言全量 + 三道新门；含 0.6.15 / 0.6.16 两批）

按仓库的攒批纪律，`0.6.15`、`0.6.16` 两条**只是批次，没有单独发布**，本版一次性收口。

**1）面板与编辑器的用户可见文案全部入词典（zh/en 各一套，词典 202 条）**：品牌位、外观头部、配色主题、
背景底图、编辑器抽屉（37 键）、风格预设与 AI 取色、底图来源与可见度、形状与字体、锚点分组名、
12 个预设名、JSON 导入导出浮层、错误兜底与图片告警、底部与构建行。非 `zh*` 一律回落英文。
裸中文棘轮基线 **200 → 104**（余下是有意保留的 `console` 日志与主题名数据表）。

**2）三道新门，都是为了让「假绿」不再可能**：

- `verify:panel`：Node 端最小宿主替身渲染设置面板，任何渲染期抛错即红（0.6.11 的 `t is not defined` 就是它该抓的），
  并做过接种测试（把 `const t = zrT` 改成 `t = null` ⇒ 退出码 1）；
- `verify:text`：面板渲染出的文案与属性存成 zh/en 快照逐条比对（版本号归一化），确定性；
- `verify:keys`：静态校验 `t('…')` 用到的键两侧齐全、占位符集合一致（`{n}` vs `{count}` 直接红），
  支持 `t('前缀.' + x)` 这类动态拼键按前缀成族校验。

**3）退役像素门**：实测同一状态连续两次截 `.zp-root`，光态互差 **2.301%**（暗态逐字节相同），
冻结动画、归零滚动后依旧不复现——一个不能自我复现的像素门，红了说明不了代码坏、绿了也说明不了代码好。
脚本保留供人工看图，`verify:all` 不再包含它；注入 CSS 仍由 `verify:csssnap` 逐字节把关（60,049 B）。

**4）发布前英文实测**：真宿主切宿主语言走了面板/编辑器/JSON 浮层全流程，据此修掉英文锚点标签被省略号截断的
排版 bug（网格轨道改 `minmax(4.6em,auto)` + 允许换行）。英文界面里剩下的中文只有 11 套主题名，符合决策 A1。

**English summary** — i18n rollout complete: every user-visible string in the settings panel and the
custom-theme editor resolves through a shared zh/en dictionary (202 keys), with non-`zh` locales falling
back to English. Three new deterministic gates replace the pixel baseline (which could not reproduce
itself: 2.301% between two captures of the same state): `verify:panel` renders the panel in Node,
`verify:text` snapshots the rendered copy, `verify:keys` enforces key and placeholder parity.

## 0.6.18（发布汇总：官方契约对齐 + 文档双语化）

本版**没有改客户端 UI 逻辑**（面板/编辑器代码与 0.6.17 一致），全是「让包符合官方契约」与「把文档补齐」：

**1）官方展示元数据**（`locale/*.json`）——官方要求插件交 `meta.title` / `meta.description` 配合导出的 `./icon`，
此前只有运行时 `loc.register()`，市场/插件页的展示名可能回落成包名。现在 `locale/{zh,en}.json` 就位，
`exports` 增加 `"./locale/*.json"`，`files` 收录；并新增 **`verify:locale`** 门禁（en 必存、`meta.title` 非空、
`exports`/`files` 齐全、图标 ≤256 KiB 且两处指向一致）。

**2）文档双语化**：新增 **`README.en.md`**（与中文版同结构、顶部互链），并把中文版按 0.6.17 的实际状态整体校对；
两版都加了 **3 张截图**（浅色面板 / 深色面板 / 编辑器，2x，取自空配置的一次性 profile，无个人信息），
用绝对 raw URL 引用，GitHub 与 npm 页面都能渲染。

**3）新增 `docs/official-requirements.md`**：官方硬要求（包契约 7 条 + 市场索引 schema）、本插件逐条合规证据、
以及自检工具的两个坑（位置参数会被忽略，须 `cd` 进仓库；`files` 按字面比较会误报 `./index.js`）。

**English summary** — release batch: ships the official display metadata (`locale/{zh,en}.json` plus the
`"./locale/*.json"` export and a new `verify:locale` gate), a full English README with three UI screenshots,
and `docs/official-requirements.md` recording the official hard requirements, our per-clause evidence, and two
pitfalls of the self-check CLI. No client UI behaviour changed since 0.6.17.

## 未发布（插件契约：展示元数据 locale/*.json）

官方要求插件交展示元数据：`locale/<lang>.json` 的 `meta.title` / `meta.description`，配合导出的 `./icon`。
此前只有运行时 `loc.register(ns, …)`，没有静态 locale 文件——市场生成器能扫到（有 `dsh.bundle`），
但展示名可能回落成包名。现在补齐：

- 新增 `locale/zh.json`、`locale/en.json`（`meta.title` = Zhuoer 主题 / Zhuoer Theme，含一句 description）；
- `package.json` 增加 `"./locale/*.json"` 导出并把 `locale` 收进 `files`；
- 新增 **`verify:locale`** 门禁：en 必须存在、每个 locale 文件 `meta.title` 非空、`exports`/`files` 两处声明齐全、
  `./icon` 指向包内文件且 ≤256 KiB、`icon` 字段与导出指向同一文件。

## 未发布（文档：双语 README）

README 本身也要多语言：新增 **README.en.md**（与中文版同结构同步维护），两版顶部互相链接。
顺带把中文版按 0.6.17 实际状态整体校对：版本与安装示例、`src/` 五片、门禁表补 `verify:release`、
计数改 104 / 130；并把已作废的「视觉基线怎么采」整段换成「为什么没有像素基线了」。
英文版同样收录这些更正，并新增 Multilingual / Why there is no pixel baseline 两节。

## 未发布（发布前英文实测补记）

**按承诺把英文界面完整走了一遍**（真宿主、宿主语言切到 English 再切回）：设置导航显示
`Zhuoer theme`；面板 6 段标题与说明、footer 与构建行全英文；编辑器 6 段标题/说明、8 个锚点标签、
12 个预设名（含插值 title `Glassmorphism · radius 2 · DM Sans`）、底部 `Cancel` / `Save`；
JSON 导出与导入浮层的标题、说明、`aria`、按钮全部英文。

**测出一个真 bug 并修掉**：英文锚点标签在固定 `4.6em` 的网格轨道里被省略号截断
（截图里是 `Brand pri…` / `Brand se…`）。改成 `minmax(4.6em,auto)` + 允许换行（`max-width:6.8em`），
实测每个标签 `scrollWidth == clientWidth`、`Brand secondary` 占 82px 折两行且不裁切。
中文侧不受影响（标签短，仍是一行）。

**残留中文只有主题名**：对 `.zp-root` 做文本节点与属性扫描，英文界面里剩下的 11 条全是主题名
（`Zhuoer 原版红` / `灯塔 · Beacon` …），符合决策 A1「主题名不译」。

注入 CSS 因这条样式改动而重采：两态各 **60,049 B**，`verify:csssnap` 逐字节一致。
临时 profile 已删、实例已停、宿主语言已确认回到 `zh-CN`。

## 0.6.16（P1c 批次二：预设/AI/底图/形状字体 42 键；新增 verify:keys 词典门）

**第二批 42 键入词典**：风格预设（含预设按钮 title 里的插值 `{label} · 直角/圆角 {radius} · {body}`）、
AI 与取色（输入框 aria 与 placeholder、生成中的状态文案、预览提示 `「{label}」`、丢弃计数
`（丢弃 {n} 个不认识的 key）`、填入/丢弃按钮）、底图（来源四选一、预览 alt、两条存储提示、
可见度 aria）、形状与字体（圆角五档、正文/聊天字体、`跟随 {theme}`）。

**英文侧在真宿主里验过**：切到 English 后读出 `Style presets` / `AI & color picking` /
`Background image` / `Shape & fonts`、`Choose image…` / `Generate`、预设 title
`玻璃拟态 · radius 2 · DM Sans`（预设名本身按决策 A1 不译），随后把宿主语言切回中文
（已确认 `<html lang="zh-CN">`）。

**新增 `verify:keys` 词典门（静态）**：文案门 `verify:text` 只能看到「渲染出来的面板」，
编辑器抽屉、错误提示这类**要交互才出现**的文案根本进不了快照——键漏了、占位符写错了，两道门都不会红。
新门扫源码里的 `t('…')`，对 zh/en 两套词典：缺键即红，同名键**占位符集合必须一致**即红
（`{n}` 写成 `{count}` 这种事故直接拦下），词条没用到的只提示。当前：用到 131 键 / zh 134 / en 134，
3 条未使用（`rail.anchorLabel`、`panel.bg.sourceRow`、`panel.bg.styleRow`）。

**还剩下的中文**：锚点行标签（底色/文字/边框/品牌主色…）与预设名来自 `10-themes.js` 的数据表，
属于 P3（主题名不译、说明译）的范畴，本轮没动。

**English summary** — batch 2 (42 keys): style presets, AI generation, background image and shape/font
sections now resolve via the dictionary, including interpolated preset tooltips; English verified live
in a real host with the language switched both ways. Adds `verify:keys`: a static dictionary gate that
fails on missing keys and on placeholder mismatch between zh and en — the text snapshot cannot see the
editor drawer, so without it a broken key would ship silently.

## 0.6.15（P1c 批次一：编辑器抽屉 37 键；发现像素门不可复现，换成文案门）

**编辑器抽屉整段入词典**（37 键，zh/en 各一套）：标题/关闭按钮与 title、各段标题与说明、
锚点行的取色器与十六进制 aria、对比度「偏低」、克隆值还原的三条 title、AI 生成与取色两条流程的
按钮与错误、底图来源与可见度、圆角与字体的行标签、底部「保存 / 取消 / 放弃改动 / 继续编辑」。
分区标题本身也本地化了（en 下设置导航显示 `Zhuoer theme`）。

**这次两种语言都真验过**：中文侧与 0.6.14 的渲染**逐条相同**（131 条文案与属性，唯一差异是版本号
那一行）；英文侧在临时 profile 里把宿主语言切成 English，实测读出 `Edit colors` / `Color anchors` /
`Cancel` / `Save` / `Theme name` / `Already the cloned theme value`，随后把语言切回中文
（已确认 `<html lang="zh-CN">` 还原）。

**一个更重要的发现：像素门在这个环境里不可复现。** 为了给 0.6.15 重采基线，我在同一实例里
**连续两次**截 `.zp-root`（同一状态、无代码改动）：光态互差 **2.301%**（61,624 vs 61,130 字节），
暗态却逐字节相同。加上冻结动画（`transition:none;animation:none`）、把祖先滚动条归零，光态依旧不复现。
结论：这个像素门红了说明不了代码坏、绿了也说明不了代码好——它给的是安全错觉。

于是把它从 `verify:all` 里**摘掉**（脚本保留，需要时手动跑），换成确定性的
**`verify:text` 文案门**：在 Node 里渲染面板，把 131 条文案与属性存成 zh/en 两份快照逐条比对，
版本号归一化。同一输入必然同一输出，这才是能挡住「改文案改坏」的机器判据。
`verify:csssnap`（注入 CSS 逐字节）留在链上：本轮重采后仍是 **60,004 B 逐字节一致**。

**English summary** — batch 1 of the i18n rollout: the custom-theme editor (37 keys) and the settings
section label now resolve via the shared dictionary; Chinese rendering is unchanged (131 strings/attrs
identical, only the version line moved) and English was verified live by switching the host locale
both ways. Also retires the pixel baseline from `verify:all`: two consecutive captures of the same
state differed by 2.301% in light mode (dark was byte-identical), so the gate could not discriminate a
regression; it is replaced by a deterministic `verify:text` snapshot gate (zh + en) while
`verify:csssnap` keeps covering the injected CSS byte-for-byte.

## 0.6.14（面板冒烟门 + 外观/配色 20 条入词典）

**新增一道真能抓到「面板渲染时炸」的门：`verify:panel`。** 0.6.11 那个
`t is not defined` 的教训是：静态门（语法、版本、资产、对比度）全绿，视觉门在比旧图，
而错误只在**渲染的那一刻**抛出。0.6.13 的修法解决了症状，没解决「下次还会被骗」。

`scripts/smoke-panel.mjs` 在 Node 里搭一套最小宿主替身（假 `window`/`document`/
`localStorage` + 假 `require('react')`：真实 `createElement` 语义 + 单遍 hook 垫片，
含 `props.children`、`Component.isReactComponent`），加载构建出的 `client.js`，调
`apply(ctx)` 收下 `settings.section` 的渲染函数，**把面板真的走一遍**（当前 35 个组件，
必须出现 `SkinSettings`，否则门自己判红——不做「注册了就算过」的假绿）。

**这道门做过接种测试**：把 `const t = zrT` 改成 `const t = null` 重建，门退出码 1；
还原后退出码 0。证明它不是空跑。

**外观头部 + 配色主题 20 条文案入词典**（`panel.header.*` 3 条、`panel.theme.*` 17 条，zh/en 各一套）。
`modes` 由静态数组改成函数，渲染时取词；棘轮基线收紧 **168 → 150**（面板 118 → 100）。

**「中文渲染逐字未变」这次是机器判的，不是目测。** 桌面端 GUI 拿不到访问令牌，于是给 `verify:panel`
加了 `--dump` 模式：把 0.6.13 与 0.6.14 两版 bundle 各渲染一遍，导出面板里**所有文本节点与属性**
（`title`/`aria-label`/`placeholder`/`alt`），逐条比对 —— **131 条完全相同**（版本号归一化）。
这比「整窗截图 0.000%」更贴题：变的只是取词方式（字面量 → `t()`），文案本身一个不差。

**顺带发现旧基线的口径是错的，已改。** 旧基线是**整窗截图**（1264×771）。为了重采，我起了个临时
profile 实例装上本插件，同一视口再截，光态差异 **4.714%** —— 差异全在左侧会话列表（不同实例的会话
历史不同），面板本身一模一样。也就是说整窗基线把「场景内容」焊进了基线，换台机器重采会假红。
现在基线改为**面板本体**（`.zp-root`，559×1236，两态），CSS 基线同时改为
「插件注入的 3 个 style 块按 DOM 序拼接」，两者都可稳定复现；重采后两态都是 **0.000%**、
CSS **逐字节一致（60,004 B）**，且不再有陈旧告警。

**English summary** — adds `verify:panel`: a Node-side smoke gate that renders the settings
panel through a minimal host/React shim and fails on any render-time error (mutation-tested:
`t = null` ⇒ exit 1). Appearance header + color-theme sections (20 strings) now resolve via the
shared dictionary; bare-Chinese ratchet baseline 168 → 150. Text equality is machine-checked:
the 0.6.13 and 0.6.14 bundles render **131 identical strings/attributes**. The old whole-window
pixel baseline was scene-coupled (4.714% diff came from the sidebar session list, not the panel),
so baselines are now panel-only (`.zp-root`, both modes) and re-captured: 0.000% / byte-identical CSS.

## 0.6.13（修 0.6.11 的面板报错，请务必升级）

**0.6.11 / 0.6.12 的设置面板会直接显示「重试 / 刷新页面」** —— 面板里调了 `t()`，但 0.6.10 只在
轨道那个闭包里定义了 `t`，factory 层没有。`ReferenceError` 被 `PanelBoundary` 兜住，于是整块
面板变成错误兜底页。0.6.11 已发到 npm，**这个版本不要用**。

**为什么当时没发现（这段比结论重要）**：`verify:visual` 与 `verify:csssnap` 比的是已经落盘的
`visual/current/` 与 `visual/css-current/`，而我在改完代码后**没有重新采集**。文件没变，门当然
0.000%——那不是「渲染没变」，是「没有新渲染可比」。这次补了两件事：

1. `05-i18n.js` 里补 factory 层 `const t = zrT`（面板与轨道共用）；
2. 两道门加**陈旧告警**：采集时间早于 `src/` 最新改动时打印 `WARN 采集比源码旧（源码新约 N 分钟）`，
   明确写出「这次结论只对采集那一刻成立」。

**这次的验证是真采集**：修好后重新打开面板（确认 `重试` 消失、`浅色` 等控件回来），再抓两态：
`verify:visual` **0.000%**、`verify:csssnap` **逐字节一致**——也就是说 P0 与品牌位、背景底图两段
抽取确实没有改动任何渲染结果。棘轮基线同时收紧 **188 → 168**（面板 118 条）。

**English summary** — hotfix: 0.6.11/0.6.12 crashed the settings panel (`t` was only defined in the
rail closure, so the panel threw and hit the error boundary). Fixed with a factory-level `const t = zrT`;
both visual gates now WARN when the captured artifacts are older than `src/`, so a stale capture can no
longer masquerade as a pass. Re-captured from a live panel: pixels 0.000%, injected CSS byte-identical.

## 0.6.11
**P1 试点：设置面板「品牌位」段落完成抽取**，作为后续 130 条的模板。

- 12 条文案搬进 `05-i18n.js`（`panel.brand.*`，zh/en 各一套）：段标题/说明、开关、图片行、
  选图/换图、预览 alt、移除、两条 hint；
- 面板里改为 `t('panel.brand.…')`，**中文渲染逐字不变**——由 `verify:visual` 0.000% 与
  `verify:csssnap` 逐字节一致证明，两次都是机器判的；
- 裸中文棘轮基线收紧：合计 **200 → 188**（面板 150 → 138）。

**English summary** — P1 pilot: the panel's “brand slot” section (12 strings) now resolves through
the shared dictionary; Chinese rendering is byte-identical (visual 0.000%, CSS snapshot equal),
and the bare-Chinese ratchet baseline drops from 200 to 188.

## 0.6.10
多语言第一步（规划见 `docs/i18n-plan.md`，决策 A1 / B1 已定）。

**P0 完成**：新增 `src/05-i18n.js` 作为词典与语言状态的**唯一真源**。原先 `DICT` 埋在
`30-quicknav` 的闭包里，设置面板根本取不到——面板 150 条中文只能硬编码，根因就是位置错了。
现在 `I18N` / `zrLang()` / `zrT()` / `zrLangFromHost()` / `zrRegisterLocale()` 都在模块级，
轨道改用共享词典（`const t = zrT` 别名，调用点一个字没改）。**验收**：5 个分片构建、
`verify:visual` 0.000%、`verify:csssnap` 逐字节一致——文案与样式都没动。

**`verify:i18n` 棘轮门**：还没抽完就把判据设成「零中文」会红一整周，门会被关掉；所以按
「每个文件的裸中文字面量条数」记基线（当前合计 **200**：`20-tokens-and-panel` 150、
`10-themes` 39、`30-quicknav` 11），**只许减少，多一条就红**。反例验证过：注入一条裸中文
→ `ADDED src/10-themes.js：39 → 40`、exit 1；删掉 → PASS。

**English summary** — i18n step 1: a single shared dictionary shard (`src/05-i18n.js`) now backs
both the settings panel and the sidebar rail, plus a ratchet gate that fails when bare Chinese
literals increase (baseline 200). Rail copy and injected CSS are byte-identical to 0.6.9.

## 0.6.9
**CSS 快照门 `verify:csssnap`**：把插件实际注入宿主的 CSS 文本当基线**逐字节**比。

为什么补它（截图门补不上的三个洞）：

1. 底图、品牌位这两条路径要外部素材才生效，像素基线盖不到；文本基线只要状态能复现就盖得到；
2. `applyTokens` 的 DOM 半边一旦拆，最直接的问题就是「发出去的声明变了」——它会直接报
   `首个差异在偏移 48458` 加两侧上下文，比盯 15% 像素差好定位；
3. 它同时就是 backlog 第 1 条的判据（拆完 token 必须逐 token 一致）。

**采集**：在宿主界面把 `__zrCss` 标记的样式（token 覆盖 + @font-face）、`zp-` 面板样式、
以及 `adoptedStyleSheets` 拼起来落盘成 `plugin-<mode>.css`，两态各一份（各 60,539 B）。

**验证过三遍**，不是写完就宣布可用：

- 同一构建两次独立采集 → `逐字节一致`（可复现）；
- 把 `.zp-sec` 的 `gap` 12px→14px、重建再采 → **FAIL，首个差异在偏移 48458**，上下文直接指出那一处；
- 改回 12px 再采 → PASS。

没有 `visual/css-current/` 时 SKIP（CI 里没有鉴权界面），`--strict` 才硬判。

## 0.6.8
**applyTokens 的纯 CSS 半边抽出来了**（backlog 第 1 条的一部分）。

移出三个只在拼字符串、不碰 `document` 的构造器：

| 构造器 | 管什么 | 入参 |
|---|---|---|
| `extraCssFor()` | 宿主菜单表面色 + Markdown 代码块定向修正 | 无（常量） |
| `brandCssFor(pref)` | 品牌位：内部节点置透明 + 给 `<svg>` 铺背景图 | `pref` |
| `bgCssFor(o)` | 主题底图：蒙层色跟随明暗、`_mainPanel::before`、显示开关 | `bgUrl/bgOpacity/bgStyle/tokens/scheme` |

`applyTokens` 里净移出 **53 行**（被 3 行调用替掉，约 589 → 539），文件总行数 2214 → 2227
（多出来的是构造器上的说明注释）。剩下的仍是注入 / `MutationObserver` / `dispose` 那半边——
**刻意没动**，理由是它在历史上出过两次事故（0.3.3 界面冻结、0.4.1 字号只缩放正文）。

**证明到什么程度，如实写**：

- 通过：`verify:all` 全绿；`verify:visual` 基线 0.000%；真机断言 `document.adoptedStyleSheets`
  里 `--dsw-specific-menu` 规则仍在（这条最容易在抽 `extraCssFor` 时丢）。
- **没通过**：底图与品牌位这两条路径本会话里跑不出来（没设底图；自动化点「品牌位」开关没生效），
  所以它们的输出只有「代码原样搬移 + 调用点传同一批值」这个静态保证，没有真机对照。

## 0.6.7

**视觉回归门 `verify:visual` 落地** —— backlog 第 2 条（也是第 1 条 `applyTokens` 拆分的前置）
终于有机器判据了。

- `scripts/verify-visual.mjs`：**零依赖**自己解 PNG（`zlib.inflateSync` + 五种 filter 还原），
  逐像素比单通道差（容差 8），任一图差异 >0.10% 判红；尺寸不一致直接判红（视口/布局变了）。
- 基线 `contracts/visual-baseline/`：设置页明/暗各一张整屏（1264×771），`manifest.json` 记视口、
  容差、每张的 sha256。
- 没有 `visual/current/` 时 **SKIP（退出码 0）**，不把 CI 弄红；要硬判用 `--strict`。
- 采集三步写进 README；`--capture` 负责把截图提升为基线并重写 manifest。

**反例验证过三遍**（不是写完就宣布可用）：

1. 同一构建重采集 → 0.000% PASS（说明截图可复现）；
2. `.zp-sec` 的 `gap` 12px→14px、重采集 → **5.19% / 5.69% FAIL**（2px 就能抓到）；
3. 改回 12px、重采集 → 0.000% PASS。

**没做满**：原判据要 6–8 张（编辑器抽屉 / JSON 弹层 / 主题卡特写），当前只有 2 张；
采集要逐屏操作真实界面，已把步骤写进 README，后续按需补。

## 0.6.6

**设置页左侧分区图标做出来了 —— 而且之前那条「做不到」的结论是错的。**

真正机制是**槽**，不是字段。宿主渲染导航行时调用
`renderSlot('settings.section.icon', { size, active }, { only: row.id, fallback: 齿轮 })`，
所以插件要做的是往 `settings.section.icon` 槽注册一份贡献，且**注册 id 必须等于分区 id**
（我们的是 `zhuoer-theme`）。0.6.2 那次给 `register()` 塞 `icon:` 属于机制用错——
字段被丢弃，看到的就是内置齿轮兜底。

这次是**打开真实界面看的**，不是推断：

- 变更前该行图标节点：`<span data-slot="settings.section.icon"><svg><use href="#dsw-icon-settings-outline-medium"/></svg></span>`
- 变更后：`<span data-slot="settings.section.icon"><img src="/dsh-zhuoer-theme/assets/logo/zhuoer.svg" width="16" height="16"></span>`
- 视觉：导航行出现深灰底红 Z，与「插件」页那一格、市场卡片同源

`contracts/host-contract.json` 同步纠正：新增 `positives: settings.section.icon-slot`（槽机制成立，
附真机 DOM 证据），原 negative 收窄成「`register()` 的 `icon` 字段无效」。**这三件事互不通用**：
包清单 `icon`（插件页）、`settings.section.icon` 槽（设置页导航行）、`register()` 的 `icon` 字段（无效）。

## 0.6.5

把 0.6.4 学到的两件事变成机器可查——不然下次还是靠记性。

**`verify:host` 扩成三类检查**：

1. 原有「代码 → 契约」：类名片段 / 属性对账；
2. 新增「契约 → 代码」的 **id 片段**：`#dsh-wordmark-badge-clip` 一旦从代码里消失，品牌位会
   静默失效，而原对账发现不了（代码里没有 `class*=` 就无话可说）；
3. 新增 **包清单图标三件套**：`package.json` 的 `icon`、`files` 含该文件、`exports["./icon"]`，
   外加文件真实存在且是 `.svg`。这类字段写漏**不报错、只少一个图标**，靠记性守不住。

**做了反例验证**：把 `package.json` 的 `icon` 字段删掉再跑 → 门变红（`ctrl_exit=1`，报
`MANIFEST package.json 缺 "icon"`），恢复后转绿。门不是写完就当能用。

**契约补一条 `positives`**：`package.json.icon` → 插件页图标（verdict: true，附同族四人组证据），
同时把 `negatives` 里那条收窄成「**slot 注册对象**的 icon」——两件事混着看，正是 0.6.2 那次误判的来源。

**backlog 记两条已结项**：插件页图标（含残留：设置页导航行仍做不到）、`.git` 元数据事故。

## 0.6.4

**插件页图标**：设置 → 插件 列表里那一格，之前是宿主给的默认蓝色图标，现在用本插件自己的
深灰底红 Z。

做法照的是本机**已验证可用**的同族插件，不是猜的 —— dsh-chronicle / dsh-pet /
dsh-rightbar-quicknav / dsh-theme-palette 四个都是同一套写法：

- 根目录放 `icon.svg`
- `package.json` 里有 `"icon": "./icon.svg"`
- `files` 与 `exports`（`"./icon"`）里各留一条

**我上一版说错了**：「插件管理器自己的图标，不读本插件声明的任何字段」——那是没查就下结论。
宿主确实读包清单的 `icon` 字段。**两件事不要混**：包清单的 `icon`（插件列表用，本条已修）
vs slot 注册对象里的 `icon`（设置页左侧导航行，"宿主直接丢弃"那条结论仍然成立）。

生效需要**重启宿主**：包清单元数据在插件加载时读一次。

**stat 缓存第二次咬人**：这次 0.6.3→0.6.4 又是等长改写，`src/00-core.js` 被 `git add -A` 漏掉，
`verify:release` 报 HEAD 里还是 0.6.3，而我又在它失败之后照旧 push 了（脚本没 `set -e`），
补了一次 `touch` + `git add --renormalize` 的修正。固化的做法从这条起：**提交前一律
`git add -A && git add --renormalize .`**，且门禁命令输出重定向后必须单独看 `exit`。

## 0.6.3

仓库自身的健壮性，跟主题渲染无关，但跟「这个仓还能不能用」有关。

**事故**：这台机器上 `.git` 顶层元数据（`HEAD`/`config`/`index`/`logs`/`hooks`）被清空，
两次，症状都是 `fatal: not a git repository`，而 `objects`/`refs` 完好、历史没丢。
第一次手工重建花了很久，第二次又从头来了一遍——所以这次把它做成工具。

**新增 `scripts/git-doctor.mjs`**：诊断 + `--fix` 一键修复（只重建元数据，不碰
`objects`/`refs`，不会丢提交）。已挂进 `verify:all` 的**第一道**，这样元数据一坏，
报错就是一句人话，而不是从某个门禁的堆栈里猜。

**归因没有定论，如实记在 `docs/git-integrity.md`**：已排除本仓脚本（canary 逐命令验过）、
OneDrive（不覆盖 `E:\Documents`）、git 全局钩子；最强嫌疑是火绒安全的主动防御回滚
（受损时间点与它的日志目录 mtime 重合），但火绒日志读不到、USN 日志要管理员，
所以只当「嫌疑」记录，不写成原因。

**顺带又踩了一次 stat 缓存**：这次的 0.6.2→0.6.3 是等长改写，`git add -A` 里
`src/00-core.js` 的改动被 stat 缓存吞掉（提交里仍是 0.6.2），是 `verify:release` 抓住的。
更糟的是我第一次跑它时用 `| tail -2` 把退出码吃掉了，所以先推了错误提交，随即补了一次修正。
教训：门禁命令**不要接管道后再看退出码**（或用 `PIPESTATUS`）。

## 0.6.2

市场卡片图标 + 设置页分区图标，都用 `zhuoer.svg` 那一枚（深灰底 + 红色 Z）。

**市场卡片图标**：`assets/icon-180.png`（180×180，2.6 KB），主榜条目的 `icon:` 字段指向
`raw.githubusercontent.com/.../main/assets/icon-180.png`。主榜要求的是 **GitHub 托管的位图**，
所以 SVG 不能直接用，必须栅格化一次。

**怎么栅格化的**（记一笔，因为本机没有可用的转换器）：`magick`/`rsvg-convert`/`inkscape`
都没有，`sharp` 没装，`cairosvg` 缺 libcairo。最后用 agent 浏览器在页面里建 canvas、
`drawImage` 画 SVG、`toDataURL` 导出——**不走截图**。截图那版（`ego_screenshot`）会把
agent 光标叠进图里，实拍确认过，所以弃用。

**设置页图标：试过，不通（实测，不是待验证）。** 给 `settings.section` 的注册对象加
`icon: '/dsh-zhuoer-theme/assets/logo/zhuoer.svg'` 并重启，设置页左侧「Zhuoer 主题」仍显示宿主
**默认齿轮**（和「通用设置」同一个图标），页面上也没把那个路径当字符串印出来——两个事实合起
来看，宿主是**直接丢弃这个字段**，不是「类型不对所以渲染成文本」。

那行已经删了，只留注释挡住后来人。想让红色 Z 出现在设置页导航里只剩两条路：(a) 宿主支持
分区图标（要上游加）；(b) 用 CSS 命中那一行 DOM——但 `dsh web` 有鉴权，我打不开也拿不到真实
节点，靠猜选择器不干。

**另一处也不是我能改的**：内置插件列表里本插件那行是默认蓝色图标，那是插件管理器自己的
图标，不读本插件声明的任何字段。

## 0.6.1

品牌位补上「主题自带」这一档：0.6.0 里开关打开但没选图是空转，现在**开 = 用自带的卓尔标**（深灰底 +
红色 Z 的方标，`assets/logo/zhuoer.svg`，走插件自己的资源路由），上传图片则覆盖它，「移除」回落到自带。

顺带把 0.6.0 的 panel 文案改准：原来写「还没选图，启用也不会生效」，现在语义变了，写「用主题自带 logo
（选图则用你的）」。

**注意：自带 logo 走宿主资源路由，新增目录要重启 DSH 才生效**（客户端那份改动刷新即可，上传的图片是
data URL 也不受影响）。这条是老坑，README 的资源段里已经写着。

## 0.6.0

新功能：**品牌位**——把左上角那枚 deepseek HARNESS 徽标换成自己的图，设置页可开关、可上传、可移除。

**为什么只能这么做。** 那枚徽标在宿主里是一个内联 `<svg>`：鲸鱼图标是 `path`、「HARNESS」白底牌是
`rect`、牌子里 7 个字母是 `<g clipPath="url(#dsh-wordmark-badge-clip)">` 里的 `path`。SVG 子节点只认
`fill` / `stroke`，不认 `background`，也无法往里塞文字——所以「只换 HARNESS 那几个字」做不到，
能做的只有整枚替换：把内部节点 `opacity:0`，再给 `<svg>` 这个 **HTML 盒子**铺 `background-image`。

**默认关闭。** 打开且已选图才生效；关了立刻回退宿主原生。理由是这是 DeepSeek 的官方标识——
个人换无所谓，但让所有装插件的人跟着变不该是默认行为。

**图片处理。** 选图后压到最长边 512px、存 PNG（换掉的 logo 多是透明底，转 JPEG 会糊成一块），
写进 localStorage 而不是 IndexedDB——这张图比底图小两个数量级，没必要动用索引库。

**已知代价。** 宿主一旦改掉 `#dsh-wordmark-badge-clip` 这个 id，替换会**静默失效**（不报错，只是变回
原生徽标）。已在 `contracts/host-contract.json` 的 `idFragments` 里登记；注意 `verify:host` 目前
只扫 class 片段与属性，**id 尚未被门禁强制**，所以这条登记是文档而不是闸门。

## 0.5.9

backlog 四条的收口。两条落成代码，一条落成门禁，一条量清后决定不做。

**新增刻度门 `verify:cssgrid`。** 0.5.8 把字号与间距收敛到刻度是一次性手改，下次谁写个
`gap:7px` 没有任何东西会拦。现在把规则写成门：字号 ∈ {11,12,13,15,18,20}、
圆角 ∈ {0,2,3,4,6,8,10,12,14,16,999}、间距 ≥4px 必须是偶数。实测 151 个值全部合规
（改前 32 处不合规，收敛到 13 处真·离格，其余是 6/10/14/22 这类成规模的 2px 值）。

间距的判定刻意用 **2px 网格而不是 4px**：这个面板的设计语言本来就是 2px
（6/10/14/22/26 成规模出现且视觉成立），硬套 4px 要重排 32 处、收益只有数字好看。
门禁的作用是拦住「随手写个 9px」，不是重塑设计。

**对比度门从「过线」升级成「不许退步」。** 原来只判「是否 ≥ 4.5:1」——
某主题卡在 4.51 时，下次调色碰一下就越界，门禁要到那时才发现。现在每次测量都记进
`contracts/contrast-baseline.json`（187 组），门禁比对台账，任一组比上次低 0.01 以上就红。
`npm run contrast:update` 才更新台账（自己给自己降标准要走明示路径）。

**`applyTokens` 再抽两个纯函数**：`applyElevations`（阴影三档）、`importantDecls`
（!important 声明串）。632 → 589 行。剩下的 450 行是 CSS 文本构建 + shadow root 注入 +
`MutationObserver` 生命周期，与运行时状态耦合，**没拆**——理由与判据见 `docs/backlog.md` 第 1 条。

**字体体积做了实测，结论是不裁。** 4.63 MB 里中文字形子集占 3.70 MB（80%），
20 个西文文件占 0.93 MB。逐个核对过：没有死文件——西文家族分别被 `MONO_STACK`、
主题字体表（beacon→Atkinson、dash 聊天→Fraunces）、12 套风格预设和自定义主题的字体选择器引用。
唯一能再减的方向是中文子集再压，但需要构建期字体工具链，会打破「零构建、纯单文件 ESM」这个前提。
数据与理由写进 `docs/backlog.md` 第 4 条。

## 0.5.8

三轮 backlog 的收口。这一版没有新功能，全是「该做的清理」，外加一处文案错误。

**弹层焦点管理统一。** 编辑器早就有「打开即聚焦 / Tab 在面板内循环 / Esc 关闭 / 关闭后
归还焦点」这套行为，JSON 导入导出弹层一直漏着——它有 `role="dialog"` 和 `aria-modal`，
但 Tab 键会直接跑到背后的设置页上，Esc 也不响应。现在抽成 `useModalA11y`，
编辑器与 JSON 弹层共用一份实现；JSON 弹层同时抽成独立组件 `JsonModal`（hook 必须无条件
调用，内联在 SkinSettings 里做不到）。

**刻度收敛。** 字号从 `11.5/12.5` 收到 `12`（类型刻度固定为 11/12/13/15/18/20）；
间距收到 4px 网格：`gap 5→4`、`gap 7→8`、`padding 7→8`、`padding 9→8`、
`padding-top 18→16`、`radius 7→8`。残留的 1/2/3px 是光学微调，故意保留。

**`applyTokens` 抽出 `applySurfaceFills`。** 侧栏/顶栏/窗口按钮区/导轨/外框这五条
表面填充是纯函数（只读 tokens、只写 tokens），埋在 632 行的 `applyTokens` 中间既难读
也没法单测。抽出来 27 行，行为逐 token 不变（`npm test` 35 项全绿作证）。
剩下 600 行仍是 DOM 与阴影 CSS 注入，与生命周期耦合，**没做**——理由写进仓库里的 `docs/backlog.md` 第 1 条
（该目录不打进 npm 包，看这段话时请到 GitHub 上找），不在这里假装做完了。

**文案纠错。** JSON 弹层的提示写着「不含派生出的 202 个 token」，实际是 222 个。

## 0.5.7

仅文档：补一条实测到的安装陷阱。

0.5.6 发布后实测：`npmjs` 的 `latest` 已是 0.5.6，而 **npmmirror（淘宝镜像）仍显示 0.5.5**，
此时 `dsh plugin add dsh-zhuoer-theme@latest` 会因为「latest 就是 0.5.5」而拒绝安装 0.5.6。
这不是 pnpm 缓存，是镜像同步滞后。

- README 的安装段补上：默认 registry 是 npmmirror 时，镜像同步滞后期间需要显式指定
  `--registry=https://registry.npmjs.org/`。

## 0.5.6

一次深度审计后的收口。审计方法是**在真实运行实例上打 HTTP 探测**（而不是只读代码），
因此发现了一个 P0：主题自带底图从未真正工作过。

### P0 · 主题底图全部 404

客户端请求 21 个 `/dsh-zhuoer-theme/assets/bg/bg-*.webp`，而服务端只注册了
`/dsh-zhuoer-theme/assets/<id>-dark.webp` —— 那是 0.4.0 清理死资产时**已经删掉**的文件名。
`assets/bg/` 从未被注册过任何路由。实测：字体 200（走的是另一条注册路径），底图 404。

- `index.js` 改为按 `ASSET_DIRS` 契约逐目录注册（启动时扫目录，有多少注册多少），
  契约同时是 `scripts/verify-assets.mjs` 的解析来源；
- 删掉那 11 条指向已删文件的死路由；
- `bg-verify` 探针改查 `[class*="_centerCol"]::before`（底图实际挂载点），
  此前查的是 `body::before` —— 永远查不到，所以底图坏了也看不出问题。

### P0 复盘：门禁的盲区

底图 404 能进仓库，恰恰因为**没有任何一道门会问「客户端要的 URL，服务端给了吗」**。
客户端引用与服务端注册各自都"看起来对"，两边命名从来没对过。

- 新增 `scripts/verify-assets.mjs`（`npm run verify:assets`，已接进 `verify:all`）：
  客户端引用 ↔ 服务端目录契约 ↔ 磁盘文件，三方对账；
- 这道门刻意不用正则字面量（写门脚本时反斜杠在写入阶段被吃掉，脚本自己先语法错误），
  全部改成手写字符扫描。

### P1

- **prompt 不再落盘**：此前每次 AI 请求都把 `gen-request.json` 写盘，其中 `url` 带着用户输入原文
  （实测文件内容含 `?prompt=hi`）。现在只在 `DSH_ZHUOER_DEBUG=1` 时写，且只写元数据
  （路径、是否有 prompt、长度），不含 prompt 本身。
- **AI 提示补上 success 锚点**：提示词要 7 个 key，而 `ANCHOR_GROUPS` 是 8 组 ——
  AI 生成的主题永远没有成功色。现在要求 8 个 key，与编辑器可见的锚点一致。
- **两处全 DOM 扫描纳入 zrDebug**：0.4.0 只 gate 了 `styleSheets` 与 late-probe，
  shadow-root 注入的 `querySelectorAll("*")` 与逐元素 `getComputedStyle` 仍在每次 apply 跑。
- **README 数字对齐**：锚点 6 → 8 组（补品牌次色、成功两组）；功能表补「编辑配色页」一行。

### P2

- **npm 包瘦身**：`themes.mjs` 只在开发期用（运行时用 client.js 里的内联副本），却被打进包。
  移出 `files` 后 tarball 5.1 MB → 4.85 MB，文件数 53 → 52。
- **面板字号刻度化**：10px / 10.5px / 11.5px 三档并到 11px / 12px（hex 值、占比、主题 id、
  分区副标题、提示与错误文案）——10px 下中文笔画糊，而这些恰恰是需要读准的数值。

## 0.5.5

仅文档：**让 npm 页面上的安装说明与仓库一致**。

0.5.4 的包内 README 还是「裸包名」写法。实测发版后一小段时间里，pnpm 的包元数据缓存会把裸包名解析成上一版
（0.5.3 发布后 `dsh plugin add dsh-zhuoer-theme` 装到 0.5.1），这正是上一轮排查过的问题。

- 安装命令改为 `dsh plugin --profile <profile> add dsh-zhuoer-theme@latest`，并给出固定版本 `@x.y.z` 的写法；
- 一条说明解释缓存行为与两种写法为何都能绕开它；
- GitHub 安装的 tag 示例刷成当前发布版。

无代码改动，`client.js` 除 `PVERSION` 外与 0.5.4 相同。

## 0.5.4

发版预检：把「同长度编辑被 git stat 缓存吞掉」这一类事故变成机械门禁。

两次发版栽在同一处（0.3.7、0.5.3）：版本号 `0.3.6→0.3.7` / `0.5.1→0.5.3` 长度相同，文件 mtime 又没变，
git 认为文件未修改，`git add -A` 静默跳过；`git status` 也随之显示干净。本地所有门禁读的是工作区，所以全绿；
CI 才在「tag 与 package.json 一致」这步报错（`tag=0.5.3 package=0.5.1`）。

- 新增 `scripts/verify-release-clean.mjs`（`npm run verify:release`）：逐个跟踪文件比对内容 sha256 与 `HEAD:<path>`，
  不看 stat；另查未跟踪文件、以及版本三元组（HEAD `package.json` / HEAD `PVERSION` / 产物 `client.js`）与工作区一致，
  CI 里还核对 `GITHUB_REF_NAME` 的 tag。
- 接入 `publish.yml` 的 `Preflight (workspace == HEAD)` 步骤（在 tag 校验与门禁之前）。
- README 发布流程补上这一步。

自证方式（本轮实跑）：把 `README.md` 里「安装」改成「装安」（同字节长度），再用 `touch -r` 把 mtime 还原；
`git status` 显示干净，`verify:release` 判红并指名 `README.md`。还原后门禁恢复绿。

## 0.5.3

「编辑配色 / 自定义主题」页重构。两位专家（UI 设计 + 前端）各自审了一遍，交叉后按「会丢东西 → 读不懂 → 不好看」排序修。

### 行为：先别丢用户的工作

- **取消不再留下宿主浅色**：编辑期间「填入」会调 `onSwitchToLight`，那是真把宿主 preference 写成 light；
  原来取消只重置本地 state，深色下编辑一次再取消，整个应用停在浅色。保存同样还原宿主明暗。
- **Esc 不再吞掉中文输入法**：加 `isComposing` 守卫，在「名称」框按 Esc 取消候选词不会关掉编辑器。
- **未保存改动要确认**：× / Esc / 取消 都走同一个 `requestClose()`；有改动时底栏变成「继续编辑 / 放弃改动」，
  不再一点就静默丢弃（同一面板里「恢复默认」却要两步确认，风险处理原本是倒挂的）。
- **hex 输入框可以逐字敲了**：原来受控值只在完整 `#rrggbb` 时才提交，输入中途一律不合法 → 每次按键被回弹，
  实际只剩「选中单个字符替换」能用。现在有本地缓冲，失焦/合法时提交，非法态标出但不覆盖原值。
- **两个弹层互斥**：编辑器与 JSON 导入导出不再同时打开（两个 `aria-modal` 叠加会让 Tab 行为打架）。
- **错误边界可重试**：面板崩溃后不再只有「刷新页面」，加了「重试」按钮并 `console.error` 留栈。
- **预设改为替换语义**：先套带 dark 表的预设、再套不带 dark 表的预设时，旧深色锚点会继续支配深色态；
  现在 `light`/`dark` 整套替换，并清掉 `dark`。
- **一次操作只 apply 一次**：预设/AI/取色原本 `commit()` 之后又显式 `onPreview()`，每次跑两遍 applyTokens，已合并。

### 视觉与信息架构

- **分区**：外观 / 配色锚点 / 风格预设 / 形状与字体 / AI 与取色 / 底图。原来 22 个块平铺、零标题。
- **主任务上移**：8 个锚点色原来排在第 20 屏之后（前面是名称、预设、AI、取色、底图、字体），现在紧跟外观。
- **头尾吸顶/吸底**：抽屉 352px、内容常态 1000px+，原来滚到色板就看不到标题、× 与保存。
- **锚点行对齐表单**：标签列从 58px/secondary 改成 4.6em/tertiary，与上面的 `Row` 同一左边缘、同一档色。
- **「继承值」与「我改过的值」分开**：已覆盖的行标签提亮加底色，↺ 未改时置灰不可点（原来 8 个 ↺ 常亮，点了没反应）。
- **对比度不只靠颜色**：低于 4.5 时文字追加「偏低」并 `aria-live=polite`。
- **阴影改走主题 elevation**：原来写死 `rgba(0,0,0,.5)`，是全 CSS 段唯一硬编码色，浅色主题下压出一圈黑边。
- **可访问性**：hex/取色器/名称/风格描述都补了 `aria-label`；↺ 的可访问名从「↺」改成「恢复<锚点>为克隆主题的值」；
  × / ↺ / 原生色块 / 预设补 `:focus-visible`；打开聚焦「名称」而不是 ×；Tab 在焦点跑到穿透区后会被收回面板内。
- **AI 结果可读**：色块标出对应锚点名、错误改用 `.zp-ed-err` + `role=alert`；描述框补可访问名。
- **派生加 memo**：名称每敲一个字不再重算 222 token。

### 刻意没做

- **没有拆成六片**（editor-model / panel-kit / theme-editor）：方案已写在专家回报里，但动 `applyTokens`（632 行）
  与面板 418 行的拆分需要同时改 `build.mjs`、`sync-themes` 的所有权边界与三个抠代码的脚本，风险大于本次收益。
- **JSON 弹层仍缺焦点管理**：它现在与编辑器互斥，但自身还没有 Tab 环与 Esc；属于下一轮小改。
- **面板层字号/间距刻度只统一了编辑器抽屉**：`PANEL_CSS` 里 10/10.5/11/11.5 等档位仍在，整站归一会牵动主题卡与设置面板。

## 0.5.2

AI 生成主题时**用模型给的名称预填「名称」框**。

服务端 system 提示里一直写着「格式：{"label":"主题名",...}」，模型也确实返回了 label——
但编辑器只把它显示在预览摘要里（「xxx」…），从没写回 draft，所以名称框始终停在「自定义 N」。
这次把这条链路接通，并补了两件小事：

- `cleanAiLabel()`：清洗模型偶尔带的引号 / 书名号 / 序号 / 结尾标点，截到 12 字；
  模型没给 label 时退回用户描述的前 12 个字，仍比「自定义 3」有信息量。
- **只在用户没自己命名时采用建议名**（当前值匹配 `自定义 N` 或为空才覆盖），
  避免把已经手输的名字冲掉。
- 提示词补一句：label 用 4–10 个汉字概括风格气质，不要引号/编号/标点/「主题」二字。

### 同一版附带：明暗三态与宿主「外观」双向同步

宿主「通用设置 → 外观」和本页「模式」写的是同一个 preference 字段，但两条方向此前不对称：

- **本页 → 宿主**可用：`writeHostMode()` 走 `theme.setTheme()`，宿主那边会跟着变。
- **宿主 → 本页坏了**：`theme/change` 订阅只做了 `emitChange()`（面板重渲染），
  既没把三态镜像回本地 `mode`（于是 `resolveScheme` 仍按旧的 light/dark 覆盖宿主偏好），
  也没重算 token（`overrideTokens` 写的是两槽定值，宿主换槽只是换了槽，画面不动）。
  表现就是「宿主切深色，本页模式显示变了但主题不变」。

修法：订阅回调里先镜像 `mode`、再 `applyTokens()` 重算，最后才通知面板；
订阅建立时做一次启动对齐（纠正旧存档里两端不一致的情况）；
`writeHostMode()` 成功后预置 `hostPrefSeen`，避免自己的回灌被当成外部改动再跑一轮。

### 同一版附带：README 整体重写

旧 README 停在 0.4.x 之前的状态：写「222 token 其中 151 跟随锚点」却没提 12 套预设、
把 AI 生成标成「规划稿，未实现」、安装版本停在 `^0.4.1`、门禁清单只有两道。
这次按现状重写（231 行）：功能一览、11 套主题的深色画布与强调色（从 `themes.mjs` 实测取值）、
明暗双向同步与 `mute-sync` 逃生阀、源码分片与 `sync:themes` 工作流、9 道门禁逐条说明、
发布流程、隐私说明，以及「已知边界与刻意不做」（CJK 拆包、阴影刻度、真机确认）。

同时给 `docs/ai-theme-plan.md` 补了一行状态说明：它已实现，不是规划稿；迭代差异以 CHANGELOG 为准。

## 0.5.1

修我上一版引入的回归：**界面字号只放大主栏对话正文**。

0.4.1 里我把 `body{zoom}` 换成了「缩放 `--dsw-font-*` 的 px」，理由写的是
「zoom 会放大 getBoundingClientRect 的坐标系、让右侧轨道错位」——那是静态推断，没有实测。
实际后果是：`--dsw-font-*` 只是对话正文用的 shorthand token，宿主侧栏 / 按钮 / 面板的文字尺寸另有来源，
于是只有正文变大，其余不动。**这是把「整体缩放」换成了「局部缩放」，方向就错了。**

- 恢复 `body{zoom}` 作为唯一的字号缩放手段（比例、间距、边框一起变）。
- 删除按 `--dsw-font-*` 改写 px 的实现，避免与 zoom 叠加成双重放大。
- 新增 `scripts/verify-scale.mjs` 并接进 `verify:all`：全局缩放规则缺失、或又出现字体 token 的
  px 改写，都会当场红。0.4.1 那次改动通过了当时全部门禁，所以这次补的是「门」而不是只补代码。

## 0.5.0

把 0.4.1 结尾列出的三项逐条处理，其中一项经实测后判定「不该做」。

### 形状语言扩展到 9 套主题（P2-3）

SHAPES 此前只有 crt（终端直角）与 beacon（高对比边线）两个条目，其余 9 套拿宿主默认刻度。
现在按主题身份给圆角档：absolutely 全直角 0px、phosphor 2–8px、manuscript 2–16px、
rose 8–32px、miami 6–28px，其余按「终端 / 纸张 / 软色」三类归位。只动 --dsw-radius-*，不碰配色。

### 阴影数据并回 themes.mjs（技术债）

原来 SHADOWS 是 client 里手写的一份表，与 themes.mjs 的 --dsw-elevation-* 并存：阴影有两个真源，
自定义主题还查不到（那条已在 0.4.0 修）。现在 themes.mjs 每套主题带 shadow 字段，
sync:themes 一并生成 const SHADOWS；11 套值逐条比对 diff = 0，但字面量已变生成物，手改会被 --check 判红。

### CJK 字体拆包：尝试后实测收益不足，未采用

按 GB2312 一级字表（3755 字）把三支中文字体拆成 common / rare：

| 字体 | 原大小 | common | rare | 首屏省下 |
|---|---|---|---|---|
| noto-sans-sc | 1,207,784 | 1,067,796（3882 字） | 142,228 | 11.6% |
| noto-serif-sc | 1,612,184 | 1,409,180（3882 字） | 207,784 | 12.6% |
| zhuoer-kai-sc | 882,336 | 882,176（3923 字） | 1,000（3 字） | 0.02% |

原因：这些字体本就是只含约 4,400 字的子集，一级字表已覆盖其中 88%；再拆只能省一成，
却要为 common 子集内联约 2.2 万字符的 unicode-range（两份 × 三字体），
并把「按需下载一次」变成「可能两次下载」。楷体更极端：拆出去只有 3 个字。
结论：不做。真正影响首屏的是「默认链路里不放衬线中文字体」，它已经只在用户选 serif 时触发。

## 0.4.1

审计第二批收尾：上一条「刻意没做」之外，把剩余的 P2 逐条清掉。

- **预览不再丢主题服务**（P2-6）：编辑器 / 取色器 / 滑块此前调 `applyTokens(null, …)`，
  `overrideTokens` 拿不到服务、抛错被吞，编辑期间只剩 CSS 兜底层。现在模块级缓存了宿主主题服务，
  预览与正式路径走同一条。
- **预览按帧合并**（P1-2 的另一半）：取色器拖动、滑块、颜色输入每个事件都会触发完整 apply，
  现在用 `requestAnimationFrame` 合并成每帧至多一次。
- **@font-face 单独一张表**：4.6 MB 字体声明不再跟着 token 表每次重新解析。
- **extra 改用 adoptedStyleSheets**（P2-4）：菜单 / 代码块的定向修正在文档样式表之后求值，
  不再靠「每 200ms 把自己 appendChild 到末尾」的竞态。
- **字号缩放不再用 `body{zoom}`**（P2-9）：zoom 会连 `getBoundingClientRect` 的坐标系一起放大，
  右侧快捷导航那种按 px 绝对定位的面板会错位；改为直接缩放 `--dsw-font-*` 的 px 值。
- **卡片圆角基准改为派生**（P2-2）：从 `--dsw-radius-panel` 取基准再乘缩放，crt 这类直角主题
  不会再拿到 28px 卡片。
- **版本门收紧**（P2-7 另一半）：只认「被引号包住的三段式」版本字符串，并且先剥掉块注释
  ——再宽一点就会把 SVG path 里的 `s5.4.7` 当版本号（实测误报）。
- 文档行号漂移修正：coverage-report 里对 client.js 的硬编码行号改为不提行号。

## 0.4.0

按一次前端审计（11 套主题 × 两态 + 12 套预设的 WCAG 全量计算 + 运行时日志反查）修的口径，
三批一起发：先止血、再体验、最后拆结构。

### P1 · 止血

- **诊断探针真正关闭**。0.3.5 只关了 4 处循环，`document.styleSheets` 全表正则、8 秒后的
  late-probe（全 DOM + 逐元素 `getComputedStyle`）仍在每次 apply 跑；日志实录 297 次 apply
  ≈ 1,780 条写盘。现在 `report()` 默认早退，两处重扫描也挂上 `zrDebug()`。
- **阴影取错键**：`SHADOWS[pref.theme]` 对自定义主题恒为 undefined，整段阴影覆盖被跳过，
  manuscript 深色 panel 阴影因此偏重 8.3×。改为按克隆来源取（`effTheme`）。
- **彩色底上的文字**：新增 `pickOnColor` / `ensureReadableOn`（在 `#region derive` 内，可被
  无头脚本抠出验证）。预设 12 套 × 两态的按钮文字从 1.25–4.02:1 提到 ≥4.5:1；强调色写入后
  再收口一次。新增 `scripts/verify-contrast.mjs` 并接入 `verify:all`，覆盖内置 11 套、
  预设 12 套、提示级与 success 语义色。
- 提示级文字（tertiary / caption / dimmed）与 `state-success-primary` 在 57 处达不到 4.5:1，
  已按各主题底色抬到达标（themes.mjs 改完 `sync:themes` 生成）。

### P2 · 体验与资产

- 样式表**只在内容变化时重写**（此前每次 apply 都重赋 26–45 KB，等于整表重新解析）。
- MutationObserver 与 `data-zr-state` 只在启用底图时工作（此前无条件挂在 body 全子树）。
- 自定义主题编辑器与 JSON 弹层补上模态语义：`aria-modal`、打开即聚焦、Tab 在面板内循环、
  Escape 关闭、关闭后焦点归还。
- 设置面板加错误边界（此前损坏的 JSON 或派生失败会把整块设置页拖黑）。
- 删除 31 个未被引用的 `assets/*.webp`（451 KB；0.3.5 起客户端只用 `assets/bg/`）。
- `QUICKNAV_VERSION` 并入 `PVERSION`：0.3.9 那个独立常量逃过了 `verify-version`
  （门只认三位 patch），控制台打出的版本与 package.json 对不上。

### 结构 · 源码分片 + 构建

- `client.js` 现在是**产物**：`src/00-core.js` / `10-themes.js`（sync-themes 生成）/
  `20-tokens-and-panel.js` / `30-quicknav.js` 由 `build.mjs` 按文件名顺序拼接。
  不引入打包器：运行时仍必须是单文件（合并请求下 `import.meta.url` 不可靠），
  分片只服务维护。
- 新增 `verify:build` 门：client.js 必须等于分片重新拼接的结果，直接改产物会红。
- `sync:themes` 改为写入 `src/10-themes.js` 并顺带构建。

### 刻意没做

- **阴影数据并回 themes.mjs**：需要为 11 套主题重新定一套 shadow 刻度（现有 `SHADOWS` 与
  themes.mjs 原值本就两套），属于数据设计而非清理；取错键的 bug 已在本版修掉，合并留待单独一轮。
- **CJK 字体加 `unicode-range`**：每支中文字体目前是**单个** woff2（整段 CJK），
  `unicode-range` 只有在按区间拆成多文件、让浏览器按需下载时才有意义；不拆分等于无效属性。
  真正能省的是把衬线中文字体从默认链路里摘掉（它本来就按使用触发下载）。

## 0.3.7

- **发版改走 CI 的 OIDC 可信发布**（`.github/workflows/publish.yml`）。
  原因：本机默认 registry 是 npmmirror 只读镜像、npm 侧的 token 也早已失效，
  每次发版都要人工网页 2FA，且 CLI 发布拿不到 provenance 证明。
  现在打 tag 即触发：校验 tag 与 package.json 版本一致、tag 必须落在默认分支历史上、
  跑完门禁后由 GitHub OIDC 直接向 npm 发布（带 provenance），再补 GitHub Release。
- `package.json` 增加 `publishConfig`（固定 registry.npmjs.org、access=public），
  避免本机默认镜像导致发错地方。
- README 增加 npm 安装写法。

## 0.3.6

- **两个本地端点加来源校验**（`index.js`）。`/api/report` 与 `/api/gen-theme` 此前接受任意来源请求：
  报告端点可被灌日志，生成端点可被本机任意网页触发模型调用（花的是用户额度）。
  现在要求自定义头 `x-zhuoer-client: 1`（跨站请求要先过预检，宿主的 webServer 不应答），
  同源请求若头被中间层剥掉，再用 Referer/Origin 的 host 比对兜底。客户端两处 fetch 已同步带头。
- **定时器与观察器纳入生命周期**（`client.js`）。那个监视 `document.body` 子树的 MutationObserver
  和 200ms 去抖定时器此前从不释放，插件卸载/HMR 之后仍在跑；宿主 `theme/change` 合并重算用的
  `setTimeout` 同理。现在都挂在 effect 的清理函数里断开。
- **加 `npm test` 与版本一致性门**（`scripts/verify-version.mjs`）。`verify:all` 现在第一步就校验
  `package.json` 与 `client.js` 的 `PVERSION` 相等、且没有 `0.1.xxx` 残留字样。

## 0.3.5

- 底图从 `client.js` 里的 3 行 base64（764 KB）改为 `assets/bg/*.webp`（21 张，329 KB），
  客户端体积 988 KB → 551 KB。**宿主的插件资源路由只服务启动时已存在的文件，升级后必须重启才显示底图。**
- 全局 `*{…!important}`（230 个自定义属性对全 DOM 每个元素各算一遍）改为 `html,body` +
  只命中「style 里显式写了这些变量」的元素。
- 每次 apply 都会跑的 4 轮全文档 DOM 遍历（含逐元素 `getComputedStyle`、扫 `styleSheets`）
  挂上 `zrDebug()` 总闸，默认关闭；排障时 `localStorage['dsh-zhuoer-theme:debug']='1'`。
- 版本号三处漂移（`0.1.101` / `0.3.9` / `0.3.4`）收敛为单一 `PVERSION`。
- `peerDependencies` 与 `engines.dsh` 统一为 `>=0.2.2-0 <0.3.0`，与 `dsh.compatibility.dsh` 一致。
- `dsh.disclosure` 改成真实端点与真实留存（原先把另一个插件的 Gateway 与目录写了进来）。
- README 安装示例里的 `link:` 路径指向 `dsh-zhuoer-panel`（另一个仓），改为本仓。

## 0.3.4

- 修复 0.3.3 引入的**同步死循环**：`theme.overrideTokens()` 自己会 emit `theme/change`，
  无条件 `emitChange()` 造成 `apply → overrideTokens → theme/change → emitChange → apply`，
  表现为启动极卡、设置页点不动、整窗卡死。
- `theme/change` 订阅改为「按偏好值去重 + 只注册一次 + 异步合并」，并加逃生阀
  `localStorage['dsh-zhuoer-theme:mute-sync']='1'`。

## 0.3.3

- 配色主题页的「模式」三态与宿主偏好双向同步（顺序改为 浅色 / 深色 / 跟随系统）。
- **这版引入了上面的死循环，请勿回退到此版本。**

## 0.3.2

- 自定义主题抽屉的标题不再压住桌面端标题栏的「应用 / 编辑」菜单：
  `html[data-windows-titlebar]` 下用 `--dsh-windows-titlebar-height` 下移。

## 0.3.1

- 中文字体改名 `OC Sans SC`/`OC Serif SC` → `Zhuoer Sans SC`/`Zhuoer Serif SC`，新增 `Zhuoer Kai SC`。
- 自选字体补 generic 与中文回退（此前中文会落到系统雅黑/宋体）。
