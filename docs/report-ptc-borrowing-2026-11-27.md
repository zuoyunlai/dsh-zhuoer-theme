# dsh-zhuoer-theme 借鉴反哺报告：以 dsh-deep-ptc-mode 2.6.0 为参照（2026-11-27，第二稿）

- 本仓版本：0.6.45 ｜ HEAD：af22514（未提交改动 0 项）
- 参照物：dsh-deep-ptc-mode 2.6.0 的 README.zh.md（30,206 字符，全文读过）
- 方法：读上游 README 全文 → 本仓 7 分片 / client.js 静态读证（ops_grep / ops_read）→ 逐条回代码核销
- 边界：**本轮未运行任何测试**（未跑 `npm test` / `npm run verify:all`）、**未起真机实例**、**未改动任何代码**。全部数字为 2026-11-27 静态实测；无法证实的已进 §5「待核实」。
- 第二稿说明：第一稿只收了 6 条（工程韧性）。本稿把三轮对话的全部候选合并进来——**20 条候选 → 12 条采纳（A/B/C 三批）、6 条已对齐（只登记）、2 条不采纳**，另列 4 项待核实。像素对齐从"字号一条"扩成**四子项的套件**（B3）。
- 候选来源索引见文末附录，可回查每条出自哪一轮。

## 0. 核实台账（说法 vs 本机实测）

| 说法（出处） | 本机实测（2026-11-27） | 方法 | 结论 |
|---|---|---|---|
| 源码 6 分片 / 6,281 行（[audit-2026-11-26.md](audit-2026-11-26.md)，v0.6.24） | **7 分片**；分片合计 **10,130 行**，client.js **10,129 行** | ops_stat ×8 | 旧数过期，以新数为准 |
| 构建产物 695,791 B（同上） | **938,662 B** | ops_stat | 旧数过期 |
| 脚本 44 个 | 44 个（`scripts/*.mjs`） | ops_glob | 一致 |
| `verify:all` 门数 | **28 项**（27 个脚本 + `node --check client.js`） | 读 package.json:45 | 记新数 |
| 宿主类名片段 | **34 处**（client.js，`_(mainPanel|centerCol|markdown_|iconBtn|sideBar|toolbar|composer|chatList|message_)`） | ops_grep count | 见 B2 |
| 含 `[class*=` 的行 | **607 行** | ops_grep count | 选择器耦合面很大 |
| `!important` 静态出现 | **61 行** | ops_grep count | 与 audit「运行时注入 512 处」口径不同，不可比 |
| 含 `1px` 的行 | **69 行** | ops_grep count | 见 B3.2 |
| `box-shadow:` 的行 | **9 行** | ops_grep count | 见 B3.3 |
| `letter-spacing` 的行 | **2 行** | ops_grep count | 非问题，登记 |
| 圆角取值 | 2 / 4 / 6 / 8 / 999px（无小数） | ops_grep 抽样 | 已是整像素，见 B3.3 |
| 半像素描边 | 主题自身 **0 处**；仅**宿主/第三方分段控件**用 `inset 0 0 0 .5px`（[client.js:5641-5642](../client.js#L5641-L5642) 注释记录） | 读 + grep | 主题只在硬边档接管它，见 B3.2 |
| 底纹铺法 | `::before` + `inset:0`，**整幅 cover，非 tile** | 读 [20-tokens:269](../src/20-tokens-and-panel.js#L269) | 不需 tile 整数对齐，见 B3.4 |
| 全局键 | `__zrIconProbed` / `__zrSemiHooked` / `__zrExtraSheet` / `__zrExtraText` 共 **4 个** | ops_grep | 见 A2 |
| 持久化版本 | `indexedDB.open(BG_DB, 1)` 2 处，版本硬死 **1**；spec 无版本字段 | ops_grep | 见 A1 |
| 编辑器宽度 | `.zp-ed-panel{width:392px;max-width:94vw}` | 读 [20-tokens:1465](../src/20-tokens-and-panel.js#L1465) | 见 C1 |
| 关键固定尺寸 | 26 / 24 / 14 / 56 / 96 / 64 / 112 / 132 px（关闭键/指示块/勾选块/hex 列/预览高/预设高/自定义宽/主题卡最小宽） | ops_grep 抽样 | 见 B3.4 |
| `visibilitychange` | **0 处** | ops_grep | 主题无常驻循环，不构成问题 |
| `@keyframes` | 1 处 | ops_grep count | 同上 |
| overrideTokens 失败路径 | 1 次 console.warn → 永久退回 !important 层，无重试 | 读 [client.js:5500-5515](../client.js#L5500-L5515) | 见 B1 |
| 字号判据 | `if (main.length < 20)` 即判完整 | 读 [20-tokens:368-376](../src/20-tokens-and-panel.js#L368-L376) | 见 B4 |
| `ws.register` 路由 | **5 处** | ops_grep | **待核实**（§5） |
| `sanitizeCustomSpec` | 定义 1 处（[:1328](../src/20-tokens-and-panel.js#L1328)）+ 调用 3 处（[:148](../src/20-tokens-and-panel.js#L148) / [:196](../src/20-tokens-and-panel.js#L196) / [:2771](../src/20-tokens-and-panel.js#L2771)） | ops_grep | 已对齐 |

## 1. 判据与评分（本报告不动上轮分数）

上一轮全量审计（[audit-2026-11-26.md](audit-2026-11-26.md)）给 82 / 100（B+）。**本报告不复核、不改动该分数**，只补四个它没有单列的维度：

| 维度 | 现状 | 说明 |
|---|---|---|
| 宿主耦合的契约化程度 | 72 | 字号表已"派生 + 带戳"；选择器表未进契约（34 处散落） |
| 内部状态可判定性 | 58 | 缓存键缺来源版本；降级无状态机、面板不可见 |
| 像素对齐（DPI） | 65 | 字号走小数 px；描边与固定尺寸未按设备像素栅格校核 |
| 用户输入安全 | 88 | sanitize 三入口一致，已对齐上游 #52 |

采纳与否的六条筛选标准：

1. 解决的是**本仓已存在**的问题，且行号级证据在手，不是假设问题；
2. 修法能在**现有门禁体系内**变成一道 exit 0 / 1，不靠人工记得；
3. 不引入新依赖、不新增运行时服务；
4. 单条改动可独立回滚；
5. 不改变已发布的用户可见行为（B3 取整属修缺陷，需 CHANGELOG 单列）；
6. 与上一轮冲突时上一轮优先（peer 走廊 P1 优先于本批任何条目）。

## 2. 修订批次计划

### 批次 A：让内部状态可判定（零行为变化，一批提交）

#### A1 持久化加 schema 版本，替掉两条"猜旧形状"分支

- **现象**：自定义主题与底图数据的形状没有版本号，只能靠猜旧形状活着。
- **证据**：`indexedDB.open(BG_DB, 1)`（[20-tokens:263](../src/20-tokens-and-panel.js#L263)、[:292](../src/20-tokens-and-panel.js#L292)）；三条兼容分支——`// 旧数据没有 kind`（[:491](../src/20-tokens-and-panel.js#L491)）、`// 自愈：…（旧版切 source 会清 key 造成）`（[:498](../src/20-tokens-and-panel.js#L498)）、`// 旧版本存在两端不一致的存档`（[:1460](../src/20-tokens-and-panel.js#L1460)）。
- **参照**：上游 2.5.7（#51/#53）「投影版本升级，历史冻结缓存会在读取时丢弃并从日志重建」。
- **修法**：
  1. 落盘结构改为 `{ v: SPEC_V, spec: {...}, savedAt }`；`SPEC_V` 用独立常量并在 `verify:version` 登记；
  2. 读取时 `v !== SPEC_V` → **整条丢弃**、回退内置主题、`report({phase:'spec-dropped', from:v})` 记一条；
  3. **不写迁移函数**——宁可让用户重选一次主题，与上游"丢弃重建"一致；
  4. 删除 [:491](../src/20-tokens-and-panel.js#L491) / [:498](../src/20-tokens-and-panel.js#L498)；[:1460](../src/20-tokens-and-panel.js#L1460) 的跨端纠正**保留**（那是两端不一致，不是形状版本）。
- **验收**：`npm run verify:build` exit 0；新增 `scripts/test-persist.mjs`（纯函数）6 例：v=1+SPEC_V=2 → null 且无残留、v=2 → 原样、缺 v → null 等；`npm run verify:css-snapshot` 差异 0。
- **风险**：丢旧存档 = 用户自定义主题消失一次。CHANGELOG 必须写明，丢弃时用现有 err 提示位给一次面板提示。
- **回滚**：revert 单批。

#### A2 全局键收口 + 缓存键加来源版本

- **现象**：同一个理由（"同页别的脚本能读到也能改"）只执行了一半。
- **证据**：[00-core:41-45](../src/00-core.js#L41-L45) 已把 `window.__zrSkin*` 迁进模块作用域并写明动机；但 `window.__zrIconProbed`（[20-tokens:190](../src/20-tokens-and-panel.js#L190)）、`window.__zrSemiHooked`（[:229-230](../src/20-tokens-and-panel.js#L229-L230)）、`window.__zrExtraSheet` / `window.__zrExtraText`（[:1008-1014](../src/20-tokens-and-panel.js#L1008-L1014)）仍在全局。
- **后果**：热更新时新旧闭包共用同一张 CSSStyleSheet：新版 `if (window.__zrExtraSheet)` 直接复用旧的，再用 `if (window.__zrExtraText !== extra)` 决定是否 `replaceSync`。旧闭包写一次 `__zrExtraText`，新版就跳过刷新，样式停在上一份且无提示。
- **参照**：上游 2.5.1（"打开过深度 PTC 会话时，从 2.4.4 更新到 2.5.0 会因旧模块仍在内存里而加载失败并回滚"）+ 修法（"新增的接口改放新文件"）。
- **修法**：
  1. `__zrExtraSheet` / `__zrExtraText` 改模块作用域（照 [00-core:41-45](../src/00-core.js#L41-L45)）；全局只留**一个带版本后缀**的探测键 `__zrSheet_v<MAJOR>_<MINOR>`；
  2. 缓存键从"文本相等"改为**两键**：`text + hostStamp`（`hostStamp` = `HOST_ASAR_BYTES` + 当前 mode）。任一变化即重建；
  3. `__zrIconProbed` / `__zrSemiHooked` 同样带后缀或并入模块作用域；
  4. **必须**加启动清理：扫全局移除无版本后缀的旧 sheet，否则双份生效。
- **验收**：新增 grep 门（并入 `verify:syntax` 或新建 `verify-globals.mjs`）：`window.__zr` 只允许白名单键且必须匹配 `__zr\w+_v\d+`；裸 `__zrExtra*` 即红；`node --check client.js` exit 0；`verify:css-snapshot` 差异 0；启动后带 `__zr` 前缀的 adopted sheet 数量 ≤ 1。
- **风险**：新键首次加载会新建 sheet，清理写漏就重复注入（验收已兜）。
- **回滚**：revert 单批。

#### A3 外观插件共存：不点名探测，冲突先提示

- **现象**：与同类主题插件的共存是**按名打补丁**，靠 `!important` 分层压过对方。
- **证据**：[client.js:5504-5505](../client.js#L5504-L5505) 注释点名 `dsh-theme-palette`；[:5514-5515](../client.js#L5514-L5515) 用 `html,body{…}` + `[style*="--dsw-alias-"]` 双份 `!important`；[:5517-5518](../client.js#L5517-L5518) 专门为对方的 `--dshtp-code-inline` 打一条规则。
- **参照**：上游做法相反——"检测到 dsh-claude-style、dsh-refined-ui 等外观插件时默认关闭自己的特效"，即**先探测同类在场，然后自己退让并告知**，而不是逐个压过。
- **修法**：
  1. apply 之后隔一帧回读：`getComputedStyle(document.documentElement).getPropertyValue('--dsw-alias-label-primary')` 与自己写入值比对；不一致 → 置 `conflict=true`；
  2. 面板与 doctor 显示一行"另一插件正在覆盖主题变量"（与 B4 的降级行共用位置，不新增提示位）；
  3. **保留**现有 `!important` 兜底层（它仍是有效的最后手段），但把它从"唯一策略"降级为"冲突时的兜底"，并停止新增按名补丁。
- **验收**：新增 `scripts/test-conflict.mjs`（纯函数：给定写入值 + 回读值 → 冲突判定，4 例）；`smoke-panel` 断言冲突态文本存在；既有 css-snapshot 差异 0（本批不删补丁）。
- **风险**：回读时机早于对方注入会误报。控制：只在 `requestAnimationFrame` 之后读一次，且连续两帧一致才置位。
- **回滚**：revert 单批。

### 批次 B：降级可恢复、可测量、像素可校核（每项单独提交）

#### B1 故障隔离状态机（3 次 / 清零 / 分类）

- **现象**：`overrideTokens` 失败一次即永久降级。
- **证据**：[client.js:5500-5515](../client.js#L5500-L5515) —— catch → `console.warn` → 之后一直走 `!important` 兜底层，无重试、无恢复、无状态上报。
- **参照**：上游隔离规则——「明确不可用立即禁用；临时错误连续 3 次才禁用，成功一次清零；参数错误、权限拒绝、业务失败不算故障；一键重载只清当前对话」。
- **修法**：抽纯函数 `isolationReducer(state, event)` 放 00-core（无 DOM 依赖）；事件 `{kind:'transient'|'fatal'|'argError'|'success'}`。判类：服务缺失 / CSSOM 抛错 / 样式表不可读 → `transient`；`overrideTokens` 不存在 → `fatal`；sanitize 后 spec 为 null → `argError`。离线态仍重试但降频（每 5 次 apply 一次），成功一次清零。
- **验收**：新增 `scripts/test-isolation.mjs` 8 例（transient×1/×2 不离线、×3 离线、success 清零、argError 不计数、fatal 立即离线、离线期间 transient 不叠加、reset 清空）；`npm run verify:all` exit 0。
- **风险**：离线态重试多一次 apply 开销，已用降频控制。
- **回滚**：revert 单批。

#### B2 宿主选择器进契约（把隐性耦合变成可测）

- **现象**：34 处宿主 CSS-Modules 片段散在 client.js，宿主升级断了只能等用户报障。
- **证据**：§0 实测 34 处 / 607 行含 `[class*=`；对照 `HOST_TEXT_RULES`（[15-host-text.js](../src/15-host-text.js)，构建期从 app.asar 抽、带 `HOST_ASAR_BYTES` 戳、运行期读空才回退）已是正确样板。
- **参照**：上游把"从宿主派生"的全部输入做成 fixture + 哈希 + `npm run check:upstream`，宿主升级时红的是"派生不变量破了"。
- **修法（两步，第二步可延后）**：① 抽 `17-host-selectors.js`，由 `scripts/gen-host-selectors.mjs` 生成，格式与 `HOST_TEXT_RULES` 同构 `[片段, 用途, 优先级]`，34 处改查表；② `contracts/host-contract.json` 增 `hostSelectors:{count,sha256,asarBytes}`，`verify-host-drift` 有宿主时比对、失配 exit 1，无宿主输出 **SKIP**（对齐三值语义）。
- **验收**：`npm run verify:host-drift` 无宿主 → SKIP（exit 0）、失配 → exit 1；`verify:css-snapshot` 差异 0；新增断言：client.js 不再出现未登记的 `_` 开头片段（白名单 34 条 + 允许的样式名）；生成器拿不到 asar 时 exit 1 并打印实际查找路径（不许静默成功）。
- **风险**：生成器依赖 asar 结构，已用上一条兜住。
- **回滚**：revert 单批（两步分别提交）。

#### B3 像素对齐全套（四子项）：上游只给了一句话，本仓落成可校核的四件事

上游的原话只有一句（2.5.0 / #45）：「125% 等缩放下，输入区高度按设备像素对齐，正文行距改为整像素」。本仓要把它落成可校核的四件事，因为**小数设备像素不止影响字号**。

##### B3.1 字号与行高栅格（原方案）

- **证据**：`--dsh-content-font-size:calc(14px * kk)`（[client.js:5735-5739](../client.js#L5735-L5739)，kk=1.15 → 16.1px）；token 与界面文字放大用两位小数 `Math.round(n*k*100)/100`（[:306-308](../client.js#L306-L308)、[:339](../client.js#L339)）。16.1×1.25 = 20.125 设备像素。
- **修法**：新增 `q(v, dpr) = Math.round(v * dpr) / dpr`，凡写入 `--dsw-font-*` / `--dsh-content-font-*` 的数值过一遍；`dpr` 取 `window.devicePixelRatio` 并在 `matchMedia('(resolution: …)')` 变化时重算；markdown 的相对行高（1.25/1.3/1.35/1.55）**不动**（相对值由浏览器按设备像素取整）。
- **验收**：新增 `scripts/verify-dpi.mjs`：dpr ∈ {1, 1.25, 1.5, 2} × fontScale ∈ {90,100,110,120,150} 共 20 组，断言 `Math.abs(v*dpr - Math.round(v*dpr)) < 1e-6`；接入 `verify:scale`。

##### B3.2 描边与焦点环：对齐**盒子**，不是对齐描边

- **证据**：主题自身含 `1px` 的行 **69 行**；焦点环用宿主自己的 `2px/2px`（[client.js:5636-5638](../client.js#L5636-L5638)）；主题自身**没有**小数描边，但宿主/第三方分段控件用 `inset 0 0 0 .5px` 与 `border:.5px solid`（[client.js:5641-5642](../client.js#L5641-L5642) 注释记录），主题只在硬边档接管。
- **判断**：把 1px 改成 1/dpr 是错的方向（描边宽度由浏览器取整，改小反而消失）。**真正要校核的是盒子的位置与高度**——盒子落在整数设备像素上，1px 描边才不会被摊成两个半透明像素。
- **修法**：
  1. 新增一条静态断言：CSS 文本里不得出现**主题自有**的小数描边（`0.5px` / `.5px` / `1.5px`），白名单仅限宿主/第三方选择器（本批白名单为空，因为当前主题自身 0 处）；
  2. 参与垂直节奏的固定高度/间距（面板行高、分段控件、输入框）在注入时过 `q()` 到 `1/dpr` 栅格；
  3. 焦点环不改宽度（沿用宿主 2px/2px），只保证其宿主元素的盒子已对齐。
- **验收**：`verify-dpi.mjs` 增加"小数描边扫描"一项（读 client.js 文本，命中即红）；`verify:css-grid` 保持 exit 0。

##### B3.3 圆角与阴影：维持整像素，禁止"半像素效果"

- **证据**：圆角取值 2 / 4 / 6 / 8 / 999px，**无小数**；`box-shadow:` 9 行；`letter-spacing` 2 行。
- **判断**：现状没问题，缺的是**回归保护**——将来有人写 `border-radius:.5px` 或 `box-shadow:0 0 0 .5px` 时没有门会红。
- **修法**：把 B3.2 的小数描边扫描扩成"**小数长度值扫描**"：`border-radius|border-width|outline-width|box-shadow` 中出现小于 1px 的非零值即红（白名单同 B3.2）。阴影的模糊半径允许小数（模糊本就是连续量），只禁 `spread` 与偏移的小数值。
- **验收**：`verify-dpi.mjs` 两个扫描项（描边 / 圆角与阴影 spread）；对现有代码跑一次应为 0 命中（先证明门是绿的，再证明它能红——用一个临时反例本地验）。

##### B3.4 固定尺寸与底纹：只做"确认 + 素材"两件事

- **证据**：关键固定尺寸 26 / 24 / 14 / 56 / 96 / 64 / 112 / 132 px（面板样式块，见 [20-tokens-and-panel.js:1463](../src/20-tokens-and-panel.js#L1463)）；底纹走 `::before` + `inset:0` 的**整幅 cover，不是 tile**（[20-tokens:269](../src/20-tokens-and-panel.js#L269)），因此不存在 tile 接缝对齐问题。
- **判断**：① 固定尺寸不必逐个改成 `1/dpr`——它们决定的是**盒子**，B3.2 的栅格化已覆盖"参与垂直节奏"的那部分；② 底纹真正要保证的是**素材分辨率 ≥ 显示尺寸 × 1.5**（高 DPI 下不被上采样），现有素材与 `verify:texture` 的合成层判据已覆盖观感，本项只补一条登记性断言。
- **修法**：在 `verify-dpi.mjs` 输出一张"固定尺寸清单"（尺寸 / 用途 / 是否参与垂直节奏 / 是否已栅格化），进报告而不是进门；素材侧只在 `verify:texture` 增加一条：底图原始像素宽 ≥ 目标显示宽 × 1.5。
- **验收**：`verify:dpi` 打印清单且 exit 0；`verify:texture` 新增断言通过。
- **风险**：清单会随 UI 改动过期 → 由 B2 的同类做法兜（生成而非手写）。

#### B4 降级状态从 debug 总闸提到面板可见

- **现象**："字号覆盖是否完整"只有 `stats.mode`，要开 debug 才看得到。
- **证据**：`if (main.length < 20)` 即判完整（[20-tokens:368-376](../src/20-tokens-and-panel.js#L368-L376)）；debug 总闸 [00-core:259-264](../src/00-core.js#L259-L264)。
- **参照**：上游 2.6.0「只有宿主快照完整时才刷新持久缓存」+ 降级必须能被解释。
- **修法**：判据从绝对数 20 改为**覆盖率** `main.length / HOST_TEXT_RULES.length >= 0.7` 才认 cssom，否则用表并标 `mode='table-fallback'`；面板状态行（复用 `zp-live`）显示 `字号覆盖：cssom 98%` / `表回退（宿主样式表不可读）`；与 B1 的 offline、A3 的 conflict 合并成同一行。
- **验收**：`npm run smoke-panel` 断言面板文本含 `字号覆盖`；覆盖率计算抽纯函数 + 3 例（0 / 0.5 / 0.98）。
- **风险**：多一行字 → `verify:text` 快照需更新，属预期。

### 批次 C：UI 与交互（下批实施，本批只立项与约法）

> 本批**不在本轮动手**：批次 A/B 全是工程韧性项，混入 UI 改动会让 CI 差异无法归因。以下条目已具备开工条件（证据 + 修法 + 验收齐备）。

#### C1 编辑器抽屉：可拖宽 / 记住 / 双击复位 / 键盘可达

- **证据**：`.zp-ed-panel{…width:392px;max-width:94vw}`（[20-tokens:1465](../src/20-tokens-and-panel.js#L1465)），内部每行锚点是六列网格 `minmax(4.6em,auto) 26px 14px minmax(0,1fr) 56px 24px`（[:1487](../src/20-tokens-and-panel.js#L1487)），hex 列仅 56px。
- **参照**：上游面板——拖动左边缘调宽、范围 240–640、**双击恢复 280**、聚焦边缘后方向键（Shift 加大步长）/ Home-End、宽度被记住、停靠时对话区**至少保留 540px**。
- **修法**：抽屉宽度从常量改为 `pref.editorWidth`（默认 392，clamp 320–640），左边缘加 4px 拖拽热区（复用现有 `zp-rz-bar` 的写法），双击复位 392，聚焦后方向键步进 8 / Shift 32，宽度写回 pref；`max-width:94vw` 保留作窄窗兜底。
- **验收**：`smoke-panel` 断言抽屉存在且 `width` 可读；新增 3 例纯函数（clamp 下界 / 上界 / 默认值）；键盘可达性靠 `tabindex=0` + `verify-host-hooks` 现有探针覆盖。

#### C2 等待态：最短可见时长 + 结束原位停留 + 计数进标题行

- **证据**：`zhuoer_theme_generate` / 编辑器内 AI 生成走宿主模型（[theme-tool.js](../theme-tool.js) + [theme-gen.js](../theme-gen.js)），1–3 秒往返；面板只有 `panel.ai.badJson` 这类错误文案，没有"进行中"的稳定态。
- **参照**：上游后台任务——只列超过 1.5 秒的、结束后原位停留几秒再离开、运行中/已结束数量写在标题行、点标题看最近结束。
- **修法**：生成中按钮进锁定态并写入 `busyAt`；结果落回同一位置（不弹 toast）；分组标题显示 `自定义 3 套`；最短可见 600ms（低于此只更新不闪）。
- **验收**：`smoke-panel` 断言 busy 态类名出现；文案门更新。

#### C3 危险操作：danger 变体 + 一次结算

- **证据**：`panel.ed.resetAll`（清空当前明暗的锚点覆盖，[i18n:317-318](../src/05-i18n.js#L317-L318)）与 `panel.reset.label`（恢复默认设置，[:218](../src/05-i18n.js#L218)）都是不可逆操作，样式与普通 pill 同款；主题只有 `anchor.danger` 这个**语义色**，没有危险**按钮**。
- **参照**：上游"危险操作用 danger 样式""按钮按一次后立即结算、不再可点"（`keep` 被接受但忽略）。
- **修法**：新增 `.zp-btn--danger`（前景用 `--dsw-alias-state-error-primary`，hover 才填底），点击后 300ms 内禁用并原地显示"已清空"；重复点击不产生第二次写入（现有 `onClick` 加 `once` 守卫）。
- **验收**：`smoke-panel` 断言 danger 类名存在；对比度门自动覆盖新前景色（`verify:contrast` 会把它算进台账）。

#### C4 设置项两段式：标题行放开关，说明行写"什么时候别用"

- **证据**：字号缩放会**重写宿主所有 `font-size: Npx` 规则为 !important**（[20-tokens:311-313](../src/20-tokens-and-panel.js#L311-L313)），装了两个主题插件或宿主改版后 CSSOM 读不全时表现是"没效果"而不是报错——这正是 B4/A3 的用户可见出口。
- **参照**：上游 2.5.4 把"深度睡眠"从文字按钮改成开关组件，并把阶段/已答/目标移到开关下方说明行，还补了适用场景说明。
- **修法**："字号缩放"开关下增加说明行：只动文字尺寸不动布局 / 与其他主题插件可能互相覆盖 / 覆盖不全时的表现（配合 B4 的 `mode` 显示）。文案进 `i18n` 八套词典。
- **验收**：`verify:keys` 与 `verify:i18n` exit 0；`verify:text` 快照更新。

#### C5 生成结果卡只留最新版本

- **证据**：[25-chat-card.js:89-118](../src/25-chat-card.js#L89-L118) 从 `tool/ptc-dispatch` / `tool/result` 事件重建 spec 渲染卡片；连续生成三次会留三张预览卡。
- **参照**：上游"同一张卡再次展示时，组内只保留最新版本""同卡只在最新一轮出现"。
- **修法**：卡片 shell 带 `data-zr-gen-seq`，同一会话内新卡渲染时把旧卡折叠成一行回执（不删，保留可展开）。
- **验收**：`smoke-panel` 断言最多一张展开态；`test-chat-tool.mjs` 增加 2 例（连续两次生成 → 展开卡数 = 1）。

### 提交纪律

1. **A 批（A1+A2+A3）一次提交**：都在持久化 / 注入路径，一次验完；`npm run verify:all` exit 0 再 commit。
2. **B1 → B4 各自单独提交**；B2 分两步（抽表 / 契约字段 + SKIP 语义）。
3. **B3 独立提交**：它改变用户可见数值，CHANGELOG 单列（"字号改为按设备像素取整"）。
4. **C 批下个版本开工**，C1/C3 可合批（都是 CSS + 一处交互），C2/C4/C5 各自独立。
5. 全程**只本地提交，不推送**，等明确指令。

## 3. 不采纳（含理由）

| 候选 | 理由 |
|---|---|
| 卡片体系（展示卡并排 / 任务卡 / 验收 / 深度睡眠 / 提示音 / 虚拟 DSH） | agent 会话语义，主题没有会话可挂；且主题已通过 [25-chat-card.js](../src/25-chat-card.js) 读 `tool/ptc-dispatch` 适配 PTC，需要卡片时让 PTC 自己渲染。 |
| `content-visibility` 长会话优化 | 上游 2.5.4 上、2.5.7 撤，理由"长会话性能交给宿主"。主题若加会与宿主虚拟滚动冲突。 |
| C5 生成卡只留最新 | 预览卡由**宿主**按 tool result 渲染，插件不持有该节点；要「只留最新」只能改宿主会话 DOM，违背本仓「不劫持宿主结构」的纪律。上游 PTC 能做是因为卡片由它自己画。 |

## 4. 已对齐（不动，仅登记）

| 上游做法 | 本仓对应 | 证据 |
|---|---|---|
| 用户输入不当模板解析（#52 双花括号） | sanitizeCustomSpec 三入口共用 | [20-tokens:1328](../src/20-tokens-and-panel.js#L1328) / [:148](../src/20-tokens-and-panel.js#L148) / [:196](../src/20-tokens-and-panel.js#L196) / [:2771](../src/20-tokens-and-panel.js#L2771) |
| 版本号唯一源 | PVERSION 单常量 | [00-core:257-258](../src/00-core.js#L257-L258) |
| 等服务到位再注册 | `ctx.inject(['webServer'], …)` | [index.js:363-366](../index.js#L363-L366) |
| 减少自身重算（400ms 节流） | **更优**：预览路径 rAF 合并成每帧至多一次 | [20-tokens:51-64](../src/20-tokens-and-panel.js#L51-L64) |
| 设置页窄窗不横向溢出（2.5.8） | 窄窗已在视觉基线里 | `contracts/visual-baseline/settings-narrow.png` |
| 特效默认不干扰外观 | 默认 100% 时零注入（`dropAll()` + `k===1` 早退） | [20-tokens:322](../src/20-tokens-and-panel.js#L322) |

## 5. 待核实（本轮未证，不许当结论用）

1. **`ws.register` 的路径面**：index.js 5 处注册，其中 `dir.url + fname`（[index.js:348](../index.js#L348)）在自定义底图时对外提供文件。`serve()` 是否做路径穿越防护、路由是否只绑本地——**未读实现，不下判断**。全插件唯一自开 HTTP 服务的位置，建议下一轮单独看。
2. **测试是否仍全绿**：本轮未跑 `npm test` / `npm run verify:all`。"验收"栏全是**计划**，不是已通过的事实。
3. **上一轮 P1（peer 走廊 `>=0.2.2-0 <0.3.0`，doctor X1 FAIL）** 未复核是否已修；它优先于本报告任何条目。
4. **真机 DPI 未实测**：B3 全套装依据上游原话 + 数值推理，未在本机 125% / 150% 缩放下截图对比。按"修缺陷"提交前，先补一次三档 DPI 的边框锐度截图。

## 6. 执行台账（随做随记，不事后补写）

### A1（2026-11-27 19:58）：持久化形状版本 + 删掉猜旧形状的 kind 推断

- 改动面：`src/10-themes.js`（新增 `SPEC_V`、`normalizeSpec()`、`readPref()` 归一与 `specV` 落盘）、`src/20-tokens-and-panel.js`（`specBg.kind` 兜底推断 → 二值收敛）、`CHANGELOG.md`（新增未发布节）
- 构建：`node build.mjs` exit 0，client.js **938,662 → 940,984 B**（+2,322 B，全部是注释与归一函数）
- 门禁：**27/28 绿**（`node --check client.js` 0；build / version / assets / contrast / texture / css-grid / scale / important / themes / host-contract / host-drift / css-snapshot / text / keys / locale / market-index / claims / readme / i18n / markdown-css / host-hooks / schema-output / smoke-panel / token-surface / git-guard / git-doctor 全 0）
- **唯一未执行：`verify:syntax`** —— 本会话沙箱内子进程 `spawnSync` 被拒（实测 `SPAWN=EPERM`），非代码问题。改用等价的逐文件 `node --check`（index.js / theme-tool.js / theme-gen.js / build.mjs / scripts/*.mjs）全部 exit 0。换到无沙箱环境复跑 `npm run verify:all` 才算全额绿。
- 与报告的口径偏差：A1 由「版本不符即丢弃」改为「归一 + 版本标记」。理由：上游那条规则成立的前提是有事件日志可重建，本仓 pref 是用户手写数据、没有日志，丢弃等于删用户的主题。已在 CHANGELOG 写明。
- 提交：A 批三条合批为 `4d6f25f`（11 文件，+676/−26）。
### A2（2026-11-27 20:12）：全局键收口 + extra 样式表两键缓存

- 改动面：`src/00-core.js`（两个探针守卫改模块作用域）、`src/20-tokens-and-panel.js`（sheet 改模块作用域 + `__zrMark` 接力 + 缓存键 `extra|HOST_ASAR_STAMP`）、`src/15-host-text.js` 与 `scripts/gen-host-text.mjs`（新增 `HOST_ASAR_STAMP` 常量）、新增 `scripts/verify-globals.mjs`、`package.json`（新脚本 + 接进 verify:all）
- 门禁：`verify:globals` 绿（8 个文件 / 1,733,642 字符里 0 处 `window.__zr`）；`verify:build` / `version` / `themes` / `important` / `--check` 全 0
- **棘轮抓到我自己**：写进注释里的那个 CSS 关键字被 `verify:important` 计了一级（83 → 84 判红）。说明该门量的是整个 bundle 文本、不是 CSS 字符串；已改写注释并复跑至 83 ≤ 83。

### A3（2026-11-27 20:20）：外观插件共存探测（不点名）

- 改动面：`src/20-tokens-and-panel.js`（`zrConflictOf` 纯函数 + 隔两帧回读探针 + `report({phase:'theme-conflict'})`）、新增 `scripts/test-conflict.mjs`、`package.json` 接进 `npm test`
- 测试：5 例通过（同值 / 被覆盖 / 大小写空白归一 / 读不到 / 写入为空）
- 行为：只上报，不改渲染——退让这件事代价太大（主题的职责就是覆盖），但沉默地互相压更糟。
- **门禁总账（A 批收官）**：29 项里 **28 项可跑且全绿**；`verify:syntax` 因沙箱 `spawnSync` EPERM 跑不了，用逐文件 `node --check` 顶替（全 0）。
- 提交：`4d6f25f`（11 文件，+676/−26），只本地未推送。
### B3（2026-11-27 20:41）：像素对齐落地

- 改动面：`src/00-core.js`（`zrDpr` / `zrQ`）、`src/20-tokens-and-panel.js`（三处注入点过栅格，内容字号从 CSS 相乘改成算好的 px）、新增 `scripts/verify-dpi.mjs`、`package.json`（新脚本 + 接进 verify:all）、`CHANGELOG.md`
- 门禁：`verify:dpi` 绿（40 组 dpr × 字号 + 3 条硬期望 + 2 条反回归扫描）；`verify:scale` / `verify:important`（83 ≤ 83）/ `verify:build` / `node --check` 全 0；**31 项检查全绿**
- 又踩一次「门扫的是整个 bundle 文本」：注释里写出旧的像素字面量会让 `verify:dpi` 判红，已改写注释并在门里注明。
- 未做真机 125%/150% 截图对比（§5 待核实第 4 条仍未销）：本项按「数值可算」落地，观感需真机复核。
### B1（2026-11-27 21:05）：故障隔离状态机

- 改动面：`src/00-core.js`（`isolationReducer` + `ZR_ISOLATION_LIMIT`）、`src/20-tokens-and-panel.js`（tick/降频重试/成功清零/失败分类 + `theme-isolation` 上报）、新增 `scripts/test-isolation.mjs`、`package.json` 接进 `npm test`
- 测试：8 例通过（阈值 3）；**首跑就抓到 TDZ 真 bug**（`const s` 在初始化式里引用 `s`），这类错误会让每次 apply 都抛、主题整片失效，静态门抓不到。
- 未做：失败分类是**按消息正则**判的（bare string / invalid / 参数 → 参数错误；not a function / undefined / null → 明确不可用；其余 → 临时）。宿主换错误文案时分类会退化到 transient，属可接受退化（宁可多试 3 次，不要一次即弃）。
### B4（2026-11-27 21:22）：字号覆盖完整性判据

- 改动面：`src/00-core.js`（`ZR_TEXT_COVER_MIN` + `zrTextCoverage`）、`src/20-tokens-and-panel.js`（两处判据改覆盖率 + `host-text` 上报）、新增 `scripts/test-textmode.mjs`、`package.json`
- 测试：5 例通过（全读到 / 只读到 30 条 / 恰好踩阈值 / 读空 / 无静态表可对）
- 面板行未做：留到 C 批，避免一轮里改两次 UI 让快照反复重采（已在 CHANGELOG 写明）。
### C1（2026-11-27 22:40）：编辑器抽屉可拖宽

- 改动面：`src/00-core.js`（`zrClampEdW` + 三常量）、`src/10-themes.js`（`editorWidth` 偏好）、`src/20-tokens-and-panel.js`（CSS 变量宽度 + 6px 热区 + 拖动/键盘/双击 + 首帧读偏好）、新增 `scripts/test-drawer.mjs`、`package.json`
- 测试：5 例通过（320–640，默认 392）
- 门禁：`npm run verify:all` **exit 0**（本轮环境已能跑完整 29 项，`verify:syntax` 的 EPERM 尾巴消失了）
- 未做：真实浏览器里的拖动手感（`smoke-panel` 不渲染抽屉打开态）；C2/C4/C5 未开工。

### 纠错（2026-11-27 22:40）：C3 原本就不缺

- 报告 §2 写「主题只有 `anchor.danger` 语义色，没有危险按钮」——**错的**。代码里已有 `.zp-btn[data-tone="danger"]`、
  `.is-armed` 两段式确认，并且在三处用着（编辑器恢复克隆值、删除自定义主题、面板恢复默认设置）。
- 说明这与 B2 是同一类错误：**先看报告、后看代码**。本轮把 C 批逐条对回代码后，C3 撤销，
### C4（2026-11-27 23:05）：降级告警接覆盖率（**原判断部分有误**）

- **纠错**：报告写「设置项没有说明行」是错的——`PrefGroup.note` + `Row` 内 `zp-hint` + `scaleMiss` 告警早就在。
### C2（2026-11-27 23:30）：等待态最小可见时长（**原判断部分有误**）

- **纠错**：报告写「没有等待态」是错的。`aiBusy` + `disabled` + `panel.ed.generating` 早就在（20-tokens:2524-2526）。错因是 grep `limit=8` 被 8 条 i18n 结果占满，唯一使用点被截掉——**限制返回条数时的截断不能当「不存在」**。
- 真缺口：最小可见时长。新增 `ZR_DWELL_MS=600` + `zrDwellDelay()`，收尾按差值补齐；`test-dwell` 4 例。
- 门禁：`npm run verify:all` exit 0。

### C5（2026-11-27 23:30）：不采纳

- 聊天里的预览卡由**宿主**按 tool result 渲染，插件不持有该节点；要「只留最新」就得改宿主会话 DOM，
  违背本仓「不劫持宿主结构」的纪律。上游 PTC 能做是因为卡片是它自己画的。
- 真缺口：告警只认 `rules === 0`，B4 之后新增的「表回退（覆盖率 < 70%）」不告警，而它恰恰是「半生效」那种最难自查的情形。
- 改动面：`src/20-tokens-and-panel.js` 一行条件（`rules === 0 || mode !== 'cssom'`）；无新增文案。
- 门禁：`npm run verify:all` exit 0（29 项）。
  C1 是真缺口，C2（等待态最短停留）/ C4（说明行）/ C5（卡只留最新）仍待办。
### B2（2026-11-27 22:05）：宿主指纹进契约（**原判断有误，已收窄**）

- **纠错**：报告原写「34 处未进契约」是错的。`verify-host-contract` 本来就在做双向对账，实测 23 个类名片段 + 11 个属性 + 1 个 id 片段**全部已登记**。我把「用法处数」当成了「未登记数」。
- 剩余真缺口：契约没有「针对哪个宿主核过」的指纹，宿主升级后旧契约会安静地继续 PASS。
- 改动面：`contracts/host-contract.json`（`host.verifiedAgainst = {asarBytes, date}`）、`scripts/verify-host-contract.mjs`（比对 + `--mark` + `--strict`）
- 门禁：默认 PASS（本机 asar 与契约一致，209083008）；`--strict` 可用作硬门。
- 顺带修掉一个我自己引入的缺陷：那段代码用了未定义的 `argv`（该文件用的是 `process.argv`），默认路径下直接被判红才发现——**又一次证明「管道后取 $?」是错的**（前一次它把崩溃读成了 0）。

## 7. 收口汇总


### 独立审查修订批（2026-11-27 21:05）：9 条发现全部处置

- 详见 `docs/review-2026-11-27.md`（原始台账）。处置：7 条修订、1 条撤销（C3 早已存在）、1 条不采纳（C5 卡片由宿主渲染）。
- 落点：持久化层（P1-1 / P1-2 / P3-1）、nonce（P1-3）、CSS 转义（P2-1）、监听与探针（P2-2 / P3-4）、缓存与报告端点（P3-2 / P3-3）。
- 顺带修掉门禁自身两处缺陷：`verify:host` 的注释剥离器认不出正则字面量（造成 `_title` 假失败），以及契约里由那场假失败留下的残渣条目 `_prose`。
- 验收：`npm run verify:all` exit 0（29 项）；测试脚本 9 个全绿（新增 persist 13 例 / nonce 6 例 / css-escape 15 项）。
### 收口（2026-11-27 23:59）

11 项候选的最终处置：**10 项落地、1 项撤销（C3，代码里早已存在）、1 项不采纳（C5，卡片由宿主渲染）**。

| 批次 | commit | 内容 |
|---|---|---|
| A | `4d6f25f` | A1 形状版本 / A2 全局键收口 / A3 共存探测 |
| B3 | `8761c10` | 字号与内容字号拍到 1/dpr 栅格 |
| B1 | `3e7dbcb` | overrideTokens 隔离状态机 |
| B4 | `41cd6e3` | 字号覆盖改覆盖率判据 |
| B2 | `ecd1478` | 契约记宿主指纹（收窄；原判断有误） |
| C1 | `3be4584` | 编辑器抽屉可拖宽 |
| C4 | `bbdc9c8` | 降级告警接覆盖率 |
| C2 | `4920d43` | 生成等待态最小可见时长 |

**最终验证**：`npm run verify:all` exit 0（29 项，含 `verify:syntax`）；6 个测试脚本全绿
（`test-derive` / `test-conflict` 5 例 / `test-isolation` 8 例 / `test-textmode` 5 例 /
`test-drawer` 5 例 / `test-dwell` 4 例）。

**新增门 2 道**（`verify:globals`、`verify:dpi`），门禁总数 28 → 29；工作区干净，全部只本地提交。

**仍然没验的**（不许当已验）：

1. B3 的观感——125% / 150% 缩放下抖是否真的消失，需真机截图对比；
2. C1 的拖动手感——`smoke-panel` 不渲染抽屉打开态；
3. B1 的失败分类是按消息正则判的，宿主换文案后会退化成 transient（可接受退化，已在 CHANGELOG 写明）。

## 附录：候选来源索引

| 来源轮次 | 候选 | 落点 |
|---|---|---|
| 第一轮（渲染/像素） | 125% DPI 整像素（#45） | B3 全套（B3.1–B3.4） |
| 第一轮 | 降级按"完整性"判（2.6.0） | B4 |
| 第一轮 | 上游事实带版本 + 哈希硬门 | B2 |
| 第一轮 | 检测外观插件、默认关特效 | A3 |
| 第一轮 | `content-visibility`（上又撤） | §3 不采纳 |
| 第一轮 | 默认零注入 / rAF 合并 / 窄窗基线 | §4 已对齐 |
| 第二轮（UI 功能） | 面板可拖宽 / 记住 / 双击复位 / 键盘 | C1 |
| 第二轮 | 最短可见 + 原位停留 + 计数进标题行 | C2 |
| 第二轮 | 危险操作 danger 样式 + 一次结算 | C3 |
| 第二轮 | 两段式设置项（说明行写适用场景） | C4 |
| 第二轮 | 同卡只留最新版本 | C5 |
| 第二轮 | 卡片并排 / 任务卡 / 深度睡眠 | §3 不采纳 |
| 第三轮（机制） | 全局键半吊子迁移 + 两键缓存 | A2 |
| 第三轮 | 持久化 schema 版本 | A1 |
| 第三轮 | 34 处宿主选择器进契约 | B2 |
| 第三轮 | 故障隔离状态机（3 次/清零/分类） | B1 |
| 第三轮 | sanitize / PVERSION / `ctx.inject` | §4 已对齐 |
| 第三轮 | `ws.register` 路径面 | §5 待核实 |
