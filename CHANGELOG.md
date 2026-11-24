# CHANGELOG

按时间倒序。每条都写「为什么改」，而不只是改了什么。

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
