# 对话框内 AI 生成主题 · 反哺报告（2026-11-26）

> 目标：在 DSH **对话输入框**里说「给我一套赛博朋克配色」→ AI 回答已做好 → 对话流里给出色卡 →
> 点确认 → 主题应用到 DSH。**主题设置面板里原有的 AI 生成保持不动**（本条为增量路径）。
>
> 前情：面板侧 AI 生成见 [ai-theme-plan.md](ai-theme-plan.md)（0.1.80 起可用）。本文只管新的对话框链路。
>
> 结论：**已落地并实测通过**——用户确认「卡片出来了」「应用后皮肤已经更换」。
> 过程中连续踩坑四次、重启四次，全部为本实现自身缺陷，非环境问题。

## 0. 核实台账（报告数字 vs 本机实测）

| 报告 / 对话里的说法 | 本机实测（2026-11-26） | 结论 |
|---|---|---|
| 「单测 24 条全过」 | `node scripts/test-chat-tool.mjs` → OK 15 / FAIL 0 | **我此前说错了**：真实断言数是 **15**，不是 24。本报告按 15 记 |
| `verify:all` 22 道门 | `package.json` 的 verify:all 里 `node ` 出现 **22** 次（含本轮新增 1 道） | 一致；**新增前是 21 道** |
| client.js 约 716 KB | 实测 **718319** 字节（本轮修复前 716724） | 一致，本轮 +1595 字节 |
| 工具以完整 schema 注册 | `tool-status.json` → `{"phase":"tool-registered","tool":"zhuoer_theme_generate","schema":"full"}` | 一致 |
| 新模块行数 | theme-gen.js **117** / theme-tool.js **213** / src/25-chat-card.js **297** / scripts/verify-schema-output.mjs **83** | 见上 |
| 插件版本 | package.json **0.6.25** | 未升版（本轮改动未发布） |

## 1. 交付验收（用户要求的五环节，逐项实测）

| 用户要求的环节 | 结果 | 证据 |
|---|---|---|
| 在对话输入框提出「给我一套赛博朋克配色」 | ✅ | 模型自主调用 `zhuoer_theme_generate` |
| AI 回复「已经做好」 | ✅ | 工具 render 文案 + 卡片标题 |
| 显示主体色卡 | ✅ | 卡片 8 个色块 + 名称/字体/圆角 |
| 跳出确认或修改面板 | ✅ | 卡片内「应用 / 修改 / 取消」；修改支持逐色 `<input type=color>` |
| 点确认后应用到 DSH | ✅ | **用户实测：皮肤已更换** |

**未实测项（不宣称通过）**
- 修改模式（逐色调完再应用）：代码已实现，未点过
- `CUSTOM_MAX = 24` 上限报错路径：未触发
- 深色锚点取舍：见 §5

## 2. 实施批次计划（已执行）

| 批次 | 内容 | 验收 |
|---|---|---|
| A | 服务端 `theme-gen.js`（LLM 生成 + 规格解析）、`theme-tool.js`（注册工具） | 工具出现在工具表 |
| B | 客户端 `src/25-chat-card.js`（事件定义 + 色块视图 + 应用逻辑） | 卡片渲染 |
| C | 契约与门禁：host-contract 登记自有属性、新增 `verify-schema-output.mjs`、i18n 10 键 | `verify:all` exit 0 |
| D | 双路匹配（PTC 修复）：渲染文本带规格行 + 客户端认 `tool/ptc-dispatch` | 卡片出现 |

## 3. 执行台账（随做随记，不事后补写）

### R1（重启 1）：工具根本不存在
- **现象**：说「给我一套赛博朋克配色」，工具不在工具表；`plugin-status.json` 为 `endpoint-mounted`，插件已加载。
- **根因**：在 `ctx.inject(['tools'], cb)` 回调里用**外层 ctx** 取服务。Cordis 的 `ctx.<service>` 是 Proxy，外层拿不到注入面。
- **处置**：改用回调给的 `injected.get('tools')`；把注册结果落盘成 `tool-status.json`（不靠猜）。

### R2（重启 2）：注册被 schema 校验拒收
- **现象**：`tool-status.json` → `"unsupported JSON schema: schema.properties.label.required is not supported on type \"string\"; schema.properties.light.required must be an array of strings"`
- **根因**：两套方言混用。`parameters` 是 DSH 方言（属性级 `required: true`），`output.schema` 是**标准 JSON Schema**（顶层 `required: []`）。我照抄了 image-gen 的 `parameters` 写法。
- **补充发现**：宿主自己的 `propose_action` 也用属性级 `required: true`，但它走 `defineTool()`（有方言转换）；我们走裸 `ctx.tools.register`，schema 原样送严格校验。
- **处置**：改标准 JSON Schema；`scripts/test-chat-tool.mjs` 补 schema 形态断言。

### R3（重启 3）：工具能调，输出校验失败
- **现象**：`returned invalid output: "value.font.body" is not a declared property (additionalProperties: false)`
- **顺带的好消息**：这条报错证明**注册 / 模型调用 / LLM 生成 / 输出回传全已通**，只差最后一道输出校验。
- **根因**：`font` 声明成 `{type:'object', additionalProperties:false}`（不可扩展空对象），而 `theme-gen` 实际返回 `{body, chat}`。
- **处置**：`font` 显式声明 `body`/`chat`；新增 `toOutput()` **白名单收口返回值**（输出与 schema 不可能再脱节）；新增门禁 `scripts/verify-schema-output.mjs`（把 schema 与 toOutput 抽出来用宿主严格规则离线验）并接入 `verify:all`。

### R4（重启 4）：工具成功、有数据，但**没有卡片**
- **现象**：工具返回完整规格，对话流里什么都没出现。
- **根因（两条叠加）**
  1. 客户端 `match` 硬性要求 `data.turn` 是安全整数。宿主类型声明写明 `turn?: number`，注释「**PTC (run_code) sub-call results carry no turn**」——这条等于自断一臂。
  2. 更关键：本会话里调工具一律走 `run_code`，即 **PTC 子调用**，其事件是 `tool/ptc-dispatch`，**既无 turn 也无 presentationMeta**。卡片数据压根没发到前端，刷新多少次都不会有卡片。
- **取证**：读 `dsh-image-gen/lib/types/client/image-result-node.d.ts`（权威契约）+ 反编译其 bundle 的 `imageResultsFromPtcDispatch`，确认 PTC 载荷只有 `name` / `arguments` / `content`。
- **处置**
  - 服务端：渲染文本追加一行 `DSH_THEME_SPEC:{...}`（image-gen 的 `PTC_SUMMARY_PATTERN` 同思路）。
  - 客户端：`match` 改双路——`tool/result` 读 `meta`，`tool/ptc-dispatch` 从文本读回规格；归一化抽成 `zrSpecFromObj` 供两路共用；删掉 `turn` 拦截。

### R5：自动刷新被拦
- `unlag_refresh` 返回 `blocked`，原因串「在右键菜单里打开 Agent 可以自己刷新」。改由用户 F5（客户端改动只需刷新，不需重启）。

### R6（用户实测）
- 「1、出来了；2，应用后皮肤已经更换」→ 闭环。

### R7（追加批次）：浅色模式发暗 —— 只有一张底图
- **现象**：切浅色后聊天区一片深灰紫，界面几乎看不清。
- **根因**：内置主题按明暗各备一套底图（`BG` / `BG_SOFT`，`themeBgFor` 按 `scheme` 选）；AI 这条路只绑一张深色图，深图以 0.7 不透明度铺在近白底上 → 灰紫。
- **误判（我）**：先想「把浅色图调亮」，默认一张图能兼顾；用户要求「先看其他默认主题的底纹是什么样式」，一看就发现人家本来就是两套。
- **处置**：服务端加 `texturePathLight` → 输出 `textureLight`；`sanitizeCustomSpec` 保留 `bg.keyLight`；渲染层 `scheme === 'light'` 优先 `keyLight`、缺图回落 `key`。
- **状态**：已修（仅第一层）。

### R8：改了「三层」就宣布打通 —— 写入端根本没动
- **现象**：浅色仍深；再一轮后变成「完全看不到底纹」。
- **根因**：只改了 tool / sanitize / renderer，**卡片 `zrApplyThemeSpec` 的 `bg` 块一行没动**——`keyLight` 传到前端却没人写进主题，渲染层永远查不到，只能回落深色主图。
- **影响**：连续两轮把「代码改完」当成「链路打通」，用户两次重启/刷新后被退回。
- **处置**：卡片补三处——归一化保留 `textureLight`、拆 `zrFetchTexture` 分别取两张、`bg` 同时写 `key` 与 `keyLight`；`applied()` 改收 `{dark, light}` 两个 dataURL。
- **状态**：已修。验收改为沿数据流节点取证：生成 → 传输（curl 实测 200 + 字节）→ 存储（`bg` 两键）→ 读取（`scheme` 分支）→ 上屏。

### R9：浅色底纹「看不见」 —— 对比度 2% 被 0.7 铺贴吃掉
- **现象**：链路通了，浅色仍看不到底纹。
- **根因**：提示词只写「若隐若现」，模型产出摄影噪点质感的近白图，线条仅比底色深约 2%；乘 0.7 后差异归零。内置浅色素材是 4,936 B 平面矢量线稿（线条存在感明确）——把「若隐若现」误解成「极低对比度」。
- **处置**：重生成——浅紫底 `#f1ecfa` + 深约 12% 细网格 `#c9b6ee` + 青/品红细线，202,581 B。
- **状态**：用户验收「现在很好了」。

### R10：`unlag_refresh` 第二次 `blocked`
- 原因串仍是「在右键菜单里打开 Agent 可以自己刷新」；客户端改动只需 F5，不重启。

### R11（收口）：第二次用户验收
- 「现在很好了」→ 明暗双底纹 + 可见浅色网格闭环。

### R12（另一个对话反馈）：不带底纹时 100% 生成失败 —— meta 里有 `undefined`
- **现象**：用户在别的对话里连续三次用不同描述生成主题，三次都是同一句 `output.presentationMeta returned non-lossless JSON`；面板里的「AI 生成」却正常。
- **根因**：`presentationMeta` 无条件返回 `texture: value.texture` / `textureLight: value.textureLight`，而 `toOutput()` 在没有底纹时不会添加这两个键（双底纹改动后变成两处同样问题）。于是 meta 里存在值为 `undefined` 的键，宿主按「非无损 JSON」拒收**整条工具结果**。面板路径走 HTTP、不经过 `presentationMeta`，所以同一功能只有对话框入口全挂。
- **为什么没被自己发现**：我这边的每次调用都带了底纹，恰好绕开；而 `verify-schema-output.mjs` 只校验 `toOutput` 与 schema 形态，**从没校验过 `presentationMeta`**，所以门禁一路 PASS。
- **处置**：抽出 `toMeta(value)` 统一构造 meta，`texture` / `textureLight` 改为**有值才加**；两处注册块都改为调用它。门禁新增两组断言——有底纹时必须保留两键、无底纹时必须不带空键，且整体可无损序列化（含 JSON 往返不丢键）。
- **自检**：检测器做过反证——对 `{a:1,texture:undefined}` 能判出 1 处异常，确认不是「怎么写都 PASS」的假门。
- **状态**：已修 + 已补门禁。这类「可选字段写成固定键」的错误应作为通例检查项：凡是 `presentationMeta` / `output` 里的可选字段，都要走门禁的两份数据（有/无）验证。

### R13：生成主题时根本没问要不要底纹
- **现象**：用户反馈「当前生成主题，并没有提示是否需求底纹图」——此前约定是「底图要，可询问」，即每次生成前应当问一句。
- **根因**：约束只写在**工具描述的文字**里（`ASK the user before generating one`），没有任何机制强制。模型看到「给我一套赛博朋克配色」就直接调工具、顺手把底纹也带上（或干脆不带），用户既没被问、也看不出一套主题到底有没有底纹。
- **处置**：（1）新增必填参数 `texture: 'want' | 'no'`，缺失/非法时工具抛错，错误文案即操作指引；`want` 缺 `texturePath` 同样抛错。（2）`toOutput` 恒下发 `textureDecision`，schema 与 `presentationMeta` 同步声明。（3）卡片在 `textureDecision === 'no'` 且无底纹时显示一行提示，把「当前没有底纹」变成可见状态。
- **用户补充**：不仅没问，**也没有生成底图**——整条「先问 → 再生成 → 再传路径」的流程都被跳过。只加必填参数能防住「忘了问」，防不住「根本没走到生成那一步」。
- **因此又补两层**：（4）工具描述开头改成 `STEP 1 - ASK FIRST` / `STEP 2 - FOLLOW THE ANSWER`，明确「要就生成深色+浅色两张、存本地、再传 `texturePath`/`texturePathLight`」，「不要就传 `no` 且不要挂任何图」；（5）工具返回文案按 `textureDecision` 分叉——没有底纹时要求模型在回复里主动告知「可以再说一句加底纹」，把兜底信息交到用户手里。
- **教训**：**靠描述文字约束模型行为，等于没有约束**。凡是要模型「先做某个动作再调工具」的契约，都应在参数/执行期强制，让违反者当场失败并拿到指引。
- **状态**：已改 + 门禁通过；重启后需实测「缺参数报错」与「`texture:'no'` 正常出卡」两条路径。

### R14：插件「启动时未能加载」，工具从列表里消失
- **现象**：用户在另一个对话里发现工具列表没有 `zhuoer_theme_generate`，插件管理页显示「启动时未能加载」。
- **根因**：上一批改工具返回文案时，`render` 的三元表达式只写了 `: '...',` 而漏掉收尾的 `)`，`theme-tool.js:229` 变成 `Unexpected token '}'`。服务端模块解析失败 → 整个插件起不来 → 工具注册从未执行。
- **为什么门禁没拦**：`verify:all` 里 22 道门覆盖构建产物、版本号、素材、对比度、schema 输出、i18n、CSS 快照等，**没有一道用 `node --check` 碰服务端文件**；而 `node build.mjs` 只拼接 `src/*.js` 生成 `client.js`，`theme-tool.js` 根本不参与构建。`verify-schema-output.mjs` 虽然读 theme-tool.js，但只 `grab()` 出 `OUTPUT_SCHEMA` / `toOutput` / `toMeta` 三段做 `new Function`，语法错误只要不落在这三段里就看不见。
- **处置**：修括号；新增 `scripts/verify-syntax.mjs` 并对 5 个服务端文件跑 `node --check`，挂在 `verify:all` **最前面**（最快失败、最便宜）。`src/*.js` 是分片、依赖前片包住顶层 `return`，单独检查会误报，故不纳入。
- **教训**：**「本地全绿」只证明被测的那几条路径**。客户端构建与门禁都不碰服务端入口文件，所以服务端语法错误能一路走到用户重启。新增/改动服务端文件时，`node --check <file>` 应当是第一个动作，而不是最后补的门。
- **状态**：已修 + 已补门。待用户重启验证。

### R15：遮罩不跟随 / 层次被压平 / 第三方面板发虚 —— 三处派生地板 + 少量覆盖
- **现象（用户报）**：（1）设置面板外的底色不跟主题；（2）插件页 header 色块下沿没有边距，仅暗色模式；（3）定时任务/论衡等第三方面板文字与底色对比极弱。用户当前主题「莫兰迪暖灰」，非全部主题都有。
- **取证（像素采样，四张截图）**：面板 `#2b2522` vs 幕外 `#0b0d11`（对比 1.29）；header 块与 tab 行下方**同为 `#211d1b`**（1.00）、与页面底 1.02；正文 p2/p98 对比 **2.33**、标题 3.08、KPI 2.53 / 3.52。
- **根因三条**：① 遮罩 5 个 token 被 `EXEMPT` 有意排除（脚本注明「跟底色平移会失去遮罩感」），于是暖面板压在冷黑幕上；② `shiftMember` 只保持「成员与锚点的明度差」，base 深色层间差本只有 2%，底色提亮后肉眼归零；③ 文字组同理会把 secondary/tertiary 一起下移，而 `ensureReadableOn` **只兜底彩底文字**，正文对比无人管。
- **处置**：A 遮罩 `veil` 派生；B 深色层次地板（+2.5/5/7.5/10%）；C 文字对比地板（7/4.5/3）；E 少量覆盖（≤4 键，派生之后写入）；D 门禁合成样本 + 变异测试。另加守卫：地板只在底色/文字锚点被调过时启用。
- **实测**：层次相邻比 有地板 1.089/1.086/1.102/1.111 ↔ 无地板 1.074/1.046/1.052/1.060；文字 7.10/4.65/3.09；覆盖 `--dsw-specific-bubble` 生效；变异测试摘掉地板后门禁报 7 条红（次级 2.72、三级 2.00、层次过平等）。覆盖统计 151→156、SELF 12→7。
- **状态**：已完成，`verify:all` exit 0；待用户重启验收。

### R16：底纹压底三轮无效 → 真根因是「满幅图 vs 透明线稿」
- **现象（用户）**：自定义主题下插件面板（论衡运行、定时任务）文字对比整体弱化；内置主题（如 Dash·琥珀）同样有底纹却毫无问题。压底滑块在 0–100% 之间没有任何可见变化。
- **错判 1｜压底挂内容根**：给 `_root` 加 `rgba(bg-base, scrim%)`。用户实测「论衡面板毫无变化」——那个类名只存在于聊天主栏，插件整页路由不是它。
- **错判 2｜压底乘在底纹不透明度**：`可见度 × 0.7 × (1−压底)`。用户实测「100% 对比度正常了，但底纹不见了」——这等于关掉底纹，不是修法。
- **错判 3｜压底挂顶层子元素 inset 阴影**：`[class*="_centerCol"] > *` 加 `box-shadow: inset 0 0 0 9999px`。用户实测「0–100% 都没有变化」——子元素铺满父容器后把父级内阴影完全遮住。
- **取证结论**：客户端取样（两次，含 MutationObserver 面板切换后再取样）在论衡页只命中 1 个候选元素（输入区），说明**面板容器不在我们能按类名命中的层**；定向补面这条路证伪。
- **真根因（像素统计）**：内置底纹 `bg-*.webp` 的 **p50 = 0**、p99 ≈ 103 —— 它们是**透明线稿**，只把线画在不透明底色上；自定义底纹是**满幅图**，p50 ≈ 30、底色烘焙在图里，`opacity 0.7` 替换掉整块底。两者的差别不在颜色、不在暗度，而在**是否覆盖底色**。
- **修法**：`mix-blend-mode`——深色 `lighten`、浅色 `multiply`，让满幅图只保留与底色有差异的线条，等价于内置素材的画法；`bg.scrim` 保留为辅助。
- **验收**：用户「现在好了」。截图前后对比：论衡面板正文从发虚恢复到可读，底纹仍在。
- **教训**：① 症状在「层叠对比」时，先量**素材本身**（是否覆盖底色），再动层级；② 「压底/调淡」是补偿手段，补偿永远修不出「只画线不换底」；③ 三次改错都发生在同一层（压底），说明应当先写一份「谁覆盖了谁」的层叠清单再动手。

## 4. 收口汇总

最终验证（2026-11-26）：
- `node scripts/test-chat-tool.mjs` → OK 15 / FAIL 0（`ALL_PASS`）
- `npm run verify:all` → **exit 0**，22 道门（`verify-schema-output` 追加批次后连 `presentationMeta` 一起校验）
- `node build.mjs` → 7 分片，723257 字节（追加批次后）
- `/api/texture` 实测：深色 `200 860735 image/png`、浅色 `200 202581 image/jpeg`、无客户端头 `403`
- `node scripts/dev-sync.mjs --apply` → 已同步到 `%DSH_HOME%/profiles/desktop/node_modules/dsh-zhuoer-theme`
- 用户端：卡片出现 + 应用生效

## 5. 教训与后续

**教训**
1. **先读宿主的 `.d.ts` 再写代码**。`turn?: number`、`ConversationNodeDefinitionLike`、PTC 载荷形状都在类型声明里；读一次省三次重启。
2. **`run_code` 里调工具 ≠ 用户触发**。前者是 PTC 子调用（无 meta），后者是直连（有 meta）。凡「工具结果要渲染成 UI」，**两条路都必须实现**。
3. **客户端不要静默 `catch`**。本轮多次「代码不报错、功能无效果」；服务端靠 `tool-status.json` 能自证，客户端没有等价通道——后续应加可见诊断（`window.__zhuoerCard` 或带前缀的 console 日志）。
4. **同类错误连炸三次**（schema 与真实值不一致）才想到造门禁；`verify-schema-output.mjs` 本应在第二次之后就有。

5. **「改完」不等于「通了」**。同一件事连错三轮（漏 PTC 分支、漏 `keyLight` 浅色分支、漏 `bg` 写入端），共同根因是**只读自己改的那几处就下结论**。跨层改动的验收标准应是：先列数据流节点（生成→传输→存储→读取→上屏），逐节点取证，再宣布完成。
6. **素材词条要量化**。「若隐若现」被实现成对比度 2%，而内置素材的真实水准是「线条存在感明确、底几乎纯色」。凭形容词生成前，先量一张内置样本当基线。

**后续（留作下一轮输入）**
- ~~深色锚点取舍~~ **已解决**：`theme-gen.js` 现要求模型显式给 `dark` 表（≥4 锚点才采用），卡片按 `autoDark: !(dark && keys>=4)` 关闭推导；实测深色底 `#0a0618`。
- 修改模式与 `CUSTOM_MAX` 上限路径补实测。
- 版本号未升（本轮未发布）；发布前走 `verify:release`。
