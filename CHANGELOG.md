# CHANGELOG

按时间倒序。每条都写「为什么改」，而不只是改了什么。

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
