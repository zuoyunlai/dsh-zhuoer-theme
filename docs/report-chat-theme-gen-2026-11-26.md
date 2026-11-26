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

## 4. 收口汇总

最终验证（2026-11-26）：
- `node scripts/test-chat-tool.mjs` → OK 15 / FAIL 0（`ALL_PASS`）
- `npm run verify:all` → **exit 0**，22 道门（含新增 `verify-schema-output`）
- `node build.mjs` → 7 分片，718319 字节
- `node scripts/dev-sync.mjs --apply` → 已同步到 `%DSH_HOME%/profiles/desktop/node_modules/dsh-zhuoer-theme`
- 用户端：卡片出现 + 应用生效

## 5. 教训与后续

**教训**
1. **先读宿主的 `.d.ts` 再写代码**。`turn?: number`、`ConversationNodeDefinitionLike`、PTC 载荷形状都在类型声明里；读一次省三次重启。
2. **`run_code` 里调工具 ≠ 用户触发**。前者是 PTC 子调用（无 meta），后者是直连（有 meta）。凡「工具结果要渲染成 UI」，**两条路都必须实现**。
3. **客户端不要静默 `catch`**。本轮多次「代码不报错、功能无效果」；服务端靠 `tool-status.json` 能自证，客户端没有等价通道——后续应加可见诊断（`window.__zhuoerCard` 或带前缀的 console 日志）。
4. **同类错误连炸三次**（schema 与真实值不一致）才想到造门禁；`verify-schema-output.mjs` 本应在第二次之后就有。

**后续（留作下一轮输入）**
- **深色锚点取舍**：`zrApplyThemeSpec` 固定 `autoDark: true`，8 个锚点是**浅色模式**配色、深色由 DSH 推导。所以「深紫黑底」在浅色模式下拿不到——实测两次生成底色都是 `#f3effc` 浅紫。要「浅色模式也深底」需换取舍（锚点直接给深色），会连带影响浅色可读性，需产品决策。
- 修改模式与 `CUSTOM_MAX` 上限路径补实测。
- 版本号未升（本轮未发布）；发布前走 `verify:release`。
