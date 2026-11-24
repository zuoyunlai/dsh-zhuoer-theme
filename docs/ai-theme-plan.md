# AI 生成主题 & 图片取色 · 整体规划

> 目标：让用户用一句人话（或一张图）得到一套可用的自定义主题，再手动微调。
> 状态：规划稿。所有"已核实"项来自本仓实测或 DSH 官方文档，"待核实"项需在开发前先验证。

---

## 1. 背景

自定义主题已经支持：8 组锚点（151 个 token）、字体、圆角、深色自动反推、按主题绑底图、JSON 导入导出。

**缺口**：用户面对空白色板不知道从哪开始。让他自己挑 7 个色，大概率调出一套"能看但不好看"的主题。

**目标**：把"从零配色"这件事外包给 AI 或算法，用户只做"这版对不对"的判断和微调。

---

## 2. 现状盘点

| 能力 | 状态 | 备注 |
|---|---|---|
| 主题数据模型（8 组锚点） | ✅ 已实现 | `ANCHOR_GROUPS`，151 个 key |

### 锚点组与三种派生模式（v0.1.102 起）

| 模式 | 语义 | 用在哪些成员 |
| --- | --- | --- |
| `shift` | 色相/饱和度跟锚点走，明度继承 base 成员的相对层次 | 绝大多数面与文字（底色组 84 个 key 里的大部分） |
| `same` | 直接取锚点值，不做偏移 | 品牌色按钮、链接、chart 主序列、json 键值、成功色一族 |
| `tint` | **保留成员自己的色相与饱和度**，只搬锚点的明度变化量 | diff 增删的绿/红表层、危险/强调悬停底 |

`tint` 是补覆盖时新增的：语义色表层必须保住红绿，用 `shift` 会被底色染成蓝，
diff 的「新增行」就读不出是绿的。另外 `applyGroup` 有一条「锚点没变就整组跳过」的短路，
保证「不调锚点 = 与 base 逐字节相同」这条身份性质对 `same` 成员也成立。

覆盖率分两层，两个脚本各管一层：

- `npm run coverage` —— 建模内的覆盖率。`HOLE` 必须为 0；`STRUCTURAL` 归字体/圆角/阴影设置管，
`SELF` 是脚本里逐条写了理由的有意豁免）。
| 深色自动反推（autoDark） | ✅ 已实现 | 只需给浅色，深色按 HSL 反明度 |
| 字体 / 圆角 | ✅ 已实现 | `spec.font` / `spec.radiusScale` |
| 按主题绑底图 | ✅ 已实现 | IndexedDB，引用键存 pref |
| JSON 导入导出 | ✅ 已实现 | 可直接复用为 AI 输出的落地格式 |
| 主题校验门 | ✅ 已实现 | `test-derive.mjs` 含 key 存在性检查 |
| 服务端半边（index.js） | ⚠️ 存在但很薄 | 目前只有 `api/report` 端点 |
| LLM 调用 | ⛔ 未使用 | `ctx.llm.stream()` 可用但未接 |

---

## 3. 技术前提与约束

### 3.1 已核实

- **`ctx.llm` 是 `LlmRuntime`**，对外方法：`registerAdapter` / `stream` / `prepareCall` / `imageRequestPricing`。**`stream()` 可直接调用**，文档原文："Identifies exactly one call through this context's `ctx.llm.stream()`"。
- **客户端插件拿不到 `ctx.llm`**（浏览器侧），必须由 `index.js` 代理。
- **图片输入链路存在**：`ImageBlock` + `ImageAttachmentRef`。
- **模型必须声明图像能力**才能接收图片，文档原话："Declaring images is what makes a hand-declared vision model usable"。

### 3.2 已核实（2026-11-24 实测）

1. **`ctx.llm.stream()` 可用**，是**高层入口**（不是 `prepareCall` 那个 adapter 接缝）。实测签名：
   ```js
   llm.stream({ provider?, model?, system, messages, maxTokens, temperature, signal })
   // messages[].content 必须是块数组：[{ type: 'text', text }]，传字符串会炸 content.some is not a function
   // 返回同步的 AsyncIterable；chunk.type 有 text-delta / reasoning-delta / finish 等
   ```
2. **留空 provider/model 会 NO_ADAPTER**（"no adapter registered for provider undefined"），
   必须显式给路由或回落。回落用 `deepseek-account/deepseek-flash`——用 `deepseek-official`
   会直接 MISSING_CREDENTIAL（那是 API key 路由，账号登录用户没有）。
3. **`prepareCall` 不能给插件直接用**：签名是 `(config, signal)`（文档里 adapter 那版
   `(provider, model, signal)` 是给适配器实现者的），且 dispatch 阶段会报
   "prepared LLM call config changed before adapter dispatch"。**别走这条路**。
4. **模型视觉**：`deepseek-account` 路由下的 flash 支持图片；但 `deepseek-chat` 的
   `inputModalities` 只声明 `["text"]`。图片方案仍以本地取色为主、模型视觉为辅。

### 3.3 硬约束

- 插件以 `link:` 方式挂在 desktop profile，改完重启即生效。
- 客户端与宿主共用页面，**服务端端点不可阻塞主线程**。
- 主题必须过现有两道门（`verify:themes` / `verify:host`）。
- 生成结果只写 `pref.customThemes`，**不改 `themes.mjs`**（内置主题仍是只读真源）。

---

## 4. 总体架构

```
┌─────────────────────────────────────────────────────┐
│ 设置面板（client.js）                                │
│  ┌───────────────────────────────────────────────┐  │
│  │ [文本输入框]  [上传图片]        [生成]        │  │
│  │ ───────────────────────────────────────────── │  │
│  │ 图片 → 本地取色 → 色板预览（不依赖模型）      │  │
│  │ ───────────────────────────────────────────── │  │
│  │ 生成中… 逐字段出现：底色 #xxx 主色 #xxx       │  │
│  │ ───────────────────────────────────────────── │  │
│  │ [应用到新主题]                                │  │
│  └───────────────────────────────────────────────┘  │
└──────────────────────┬──────────────────────────────┘
                       │ POST /dsh-zhuoer-theme/api/gen-theme
                       │ (request body: {prompt} 或 {colors})
┌──────────────────────▼──────────────────────────────┐
│ index.js（服务端）                                   │
│  ctx.inject(['llm','webServer'])                     │
│  → ctx.llm.stream({ messages, schema hint })         │
│  → 增量 JSON 转发（SSE / 分块）                      │
└──────────────────────┬──────────────────────────────┘
                       │
                 已配置的模型（用户无需再填 key）
```

**关键设计**：**只让 AI 产出浅色锚点**，深色由 `autoDark` 反推。AI 输出量减半，出错面也减半。

---

## 5. 生成结果 Schema

AI 只需返回这一个形状（8 个锚点，不是 151 个）：

```json
{
  "label": "海滨黄昏",
  "base": "zhuoer",
  "reason": "一句为什么这样配色",
  "light": {
    "--dsw-alias-bg-base":          "#1a1a2e",
    "--dsw-alias-label-primary":    "#e8e8f0",
    "--dsw-alias-border-l1":        "#3a3a55",
    "--dsw-alias-brand-primary":    "#ff8c42",
    "--dsw-alias-trajectory-accent":"#4a90d9",
    "--dsw-alias-state-error-primary":"#e05252",
    "--dsw-alias-state-warn-primary": "#f0b429"
  },
  "font": { "body": "DM Sans", "chat": "__mono__" },
  "radiusScale": 0
}
```

**约束**：

- `base` 必须是 11 个内置主题 id 之一（决定未覆盖 token 的骨架）
- `light` 的 8 个 key 必须**精确匹配** `ANCHOR_GROUPS` 的 anchor 名
- `font` 只接受 `FONT_CHOICES` 里的值或 `__mono__`
- `radiusScale` ∈ [0, 3]

**为什么还保留 `base`**：AI 只给 7 个锚点，其余 72 个 token 来自 base 的骨架。base 选对了，"没被锚点覆盖的部分"（阴影、图表色、代码块）才协调。

---

## 6. 提示词设计

借鉴 tweakcn 的"设计原则"段，但适配我们的 7 锚点模型。

### 6.1 系统提示（骨架）

```
# 角色
你是 DSH 主题生成器。把用户描述转成一套浅色主题锚点。

# 输出铁律
1. 只输出 JSON，不要解释、不要 markdown 代码块
2. 只输出 light 里的 7 个 key，深色由系统自动反推
3. key 必须逐字匹配给定的 7 个名字，不得自创
4. 每个色值必须是 #rrggbb

# 七个锚点的语义
- bg-base：页面底色
- label-primary：正文文字色，与 bg-base 对比度 ≥ 4.5
- border-l1：分隔线，比底色亮/暗一档
- brand-primary：主色，按钮与链接
- trajectory-accent：次色，点缀与强调
- state-error-primary：错误色（红系，除非用户明确要求）
- state-warn-primary：警告色（黄/橙色系）

# 设计质量（关键）
- 色彩和谐：主色与次色应来自同一色相族或互补关系，不要随机
- 对比度：文字与底色 ≥ 4.5，边框与底色 ≥ 1.05
- 风格映射：
  - 复古/终端 → base 选 crt 或 phosphor，font 用 __mono__，radiusScale 0
  - 扁平/极简 → radiusScale 0，border 对比度提高
  - 柔和/温暖 → base 选 rose 或 manuscript，radiusScale 1
- base 选择：根据氛围选最近的骨架，不要总是 zhuoer
```

### 6.2 图片输入的提示

若模型支持视觉，图片随消息一起发；否则走本地取色，把色值作为文本喂入：

```
从这张图取到的主色（按占比降序）：#1a2b4c (32%), #ff8c42 (24%), #e8e8f0 (18%), ...
请据此设计主题，命名要有画面感（如「海滨黄昏」），并说明一句理由。
```

---

## 7. 图片取色（本地，不依赖模型）

### 7.1 流程

```
上传 → 压缩到 ≤ 1 MiB（长边 960px）→ canvas.drawImage
→ getImageData → 采样（每 N 像素取一个，控制到 ~10k 样本）
→ 中位切分（median cut）取 6 色
→ 输出 [{hex, share}]
```

### 7.2 为什么用中位切分而不是 k-means

- 中位切分是**确定性**的（同一张图结果稳定），k-means 依赖初始点
- 实现简单（~60 行）、O(n log n)、无需迭代
- 对配色提取足够好（Photoshop 的"存储为 Web 所用格式"也是这类算法）

### 7.3 输出

```json
[
  { "hex": "#1a2b4c", "share": 0.32 },
  { "hex": "#ff8c42", "share": 0.24 }
]
```

界面直接显示这 6 个色块 + 占比条，**用户先确认取色对不对**，再决定要不要交给 AI。

---

## 8. 流式与容错

### 8.1 增量 JSON 解析

模型流式输出的是半截 JSON（`{"label":"海`），不能直接 `JSON.parse`。需要一个容错解析器：

- 维护累积缓冲区
- 每次尝试"补全括号后 parse"
- 成功则更新预览，失败则等下一块
- 用 `JSON.parse` 的增量版本或手写状态机

### 8.2 降级路径

| 情况 | 处理 |
|---|---|
| 模型不支持视觉 | 走本地取色 + 规则映射，不调模型 |
| 流式解析始终失败 | 等流结束再整体 parse |
| 整体 parse 失败 | 保留上次好状态，提示"重新生成" |
| key 不认识 | 丢弃该项，其余照常应用 |
| 色值格式错 | 丢弃该项 |

**核心原则**：**部分成功优于整体失败**。7 个色里对 5 个，也比"什么都没生成"好。

---

## 9. 校验与回填

复用现有门：

1. **key 白名单**：只用 `ANCHOR_GROUPS` 里的 anchor（`test-derive.mjs` 已有这条检查）
2. **色值格式**：`/^#[0-9a-fA-F]{6}$/`
3. **对比度**：`label-primary` vs `bg-base` < 4.5 → 黄色警告，不阻止
4. **base 合法性**：不在 `THEME_IDS` 里则回退 `zhuoer`

回填：

```
AI 结果 → sanitizeCustomSpec → 写入 pref.customThemes（新 id）
→ 切换 theme 到该 id
→ 打开编辑器（让用户看到并微调）
```

**不自动保存为用户主题之外的东西**——用户可以随时删。

---

## 10. 分阶段实施

### P0 · 本地取色（纯客户端，独立可用）

**范围**：上传图片 → 取色 → 显示 6 色板 + 占比。

**为什么先做**：不依赖模型能力，不依赖服务端，做出来立刻有价值（用户可以先看取色准不准）。

**验收**：拖 3 张不同风格的图，取色结果肉眼符合直觉；黑白图不死黑死白。

---

### P1 · 服务端端点 + 文本生成

**范围**：`index.js` 注册 POST 端点 → `ctx.llm.stream` → 返回 JSON；客户端输入框 + 应用按钮（先不做流式，等整体返回）。

**验收**：curl 该端点，输入"复古、灰底、黄色主色蓝色次色、等宽、锐角"，返回的 JSON 过 schema 校验，且生成的色彩对比度达标。

**这一步是风险最高的**：要先确认 `ctx.llm.stream` 的签名和模型可用性。

---

### P2 · 图片 → 取色 → AI 组织

**范围**：把 P0 的取色结果作为文本喂给 P1 的端点，让 AI 命名 + 分配锚点。

**验收**：上传一张夕阳海景图，返回的主题名叫得像个名字（不是"Theme 1"），主色接近图里的橙色。

---

### P3 · 流式渐进渲染

**范围**：端点改成 SSE/分块，客户端边收边更新色板。

**验收**：生成过程中能看到色值逐个出现，不是干等十几秒。

---

### P4 · 后续可选

- 多轮微调（"再暖一点"）
- 保存生成历史
- 从 URL 取图

**明确不做**（理由见 §12）。

---

## 11. 风险与对策

| 风险 | 概率 | 影响 | 对策 |
|---|---|---|---|
| 模型不支持视觉 | 中高 | 图片方案失效 | 降级本地取色（P0 已覆盖） |
| `ctx.llm.stream` 签名与预期不符 | 中 | P1 卡住 | 先写最小探针验证，再写 UI |
| 模型输出非法 JSON | 高 | 生成失败 | 容错解析 + 丢弃非法项 + 重试一次 |
| 生成的主题难看 | 中 | 用户失望 | 提示词里的设计原则 + 可手动微调 |
| 服务端端点影响插件加载 | 低 | 整个插件挂掉 | 端点注册包 try/catch，失败只警告不抛 |
| 延迟过长 | 中 | 用户以为卡死 | 流式 + 明确 loading 文案 |

---

## 12. 明确不做的事

1. **不在设置面板做完整聊天会话**：不做历史、不做多轮上下文管理。成本远超收益，重述比翻聊天记录快。
2. **不让 AI 改内置主题**：`themes.mjs` 是只读真源。
3. **不让 AI 输出深色**：深色由 `autoDark` 反推，保证明暗一致性。
4. **不引入额外 AI SDK**：用 DSH 已有的 `ctx.llm`，不打包 `ai` / `@ai-sdk/*`。
5. **不存生成历史到服务端**：生成结果只进 localStorage 的 pref。

---

## 13. 验收清单（整体）

- [ ] P0：3 张图取色结果符合直觉
- [ ] P1：curl 端点返回合法 JSON，过 schema 校验
- [ ] P1：生成的主题能通过 `verify:themes` 的对比度检查（不阻断，只看是否合理）
- [ ] P2：图片 → 主题名有语义，主色接近图中主色
- [ ] P3：流式生成可见渐进
- [ ] 全流程：应用后打开编辑器可手动改，改动立即生效
- [ ] 全流程：删除该主题后，绑定的底图等资源被清理
- [ ] 回归：两道门（`verify:all`）+ `test-derive.mjs` 全绿

---

## 14. 附：与 tweakcn 的对照

| | tweakcn | 本方案 |
|---|---|---|
| 结构化输出 | AI SDK `streamObject` + zod | 自写增量解析 + 手写校验 |
| 模型来源 | 自有 Gateway + key | **DSH 已配置模型**（用户零配置） |
| 主题变量数 | ~20 | **8**（输出量小 2.5 倍） |
| 深色 | AI 同时生成 light+dark | **autoDark 反推**（输出再减半） |
| 图片 | 模型视觉 | **本地取色为主**，模型可选 |

**核心差异**：我们用更小的主题模型 + 自动反推，把 AI 的出错面压到最低。

---

## 附：宿主未建模的 8 个 token —— 实测原值（2026-11-24 扫 app.asar）

结论先说：**这 8 个没有「每套主题一个值」这回事**，所以不存在可抠的 per-theme 原值。
它们的值是常量、组件局部别名、或固定品牌渐变。真值记录在此，`npm run surface` 逐条核对。

| token | 定义次数 | 实测值 | 性质 |
| --- | --- | --- | --- |
| `--dsw-elevation-stroke-color` | 56 处 | 全是 `var(--dsw-alias-border-l1\|l2\|l3\|l2-darkmode-thin)` 别名（l1×31、l2×7、l3×6、thin×4、transparent×2） | 组件局部变量，无全局定义、无字面色 |
| `--dsw-focus-ring-color` | 2 处 | `transparent` | 常量（设计上不画焦点圈） |
| `--dsw-desktop-window-tint` | 2 处 | 浅 `color-mix(in srgb, rgb(255 255 255) 40%, transparent)`；深 `color-mix(in srgb, rgb(24 25 28) 50%, transparent)` | 桌面原生材质透光底色 |
| `--dsw-gradient-onboarding-blue-stops` | 2 处 | `#3964fe 18.75%, #398efe 51.78%, #6dccff 86.252%, #3964fe` | 固定品牌渐变，明暗同一串 |
| `--dsw-gradient-onboarding-violet-stops` | 2 处 | `#2a2fb6 33.102%, #8b76f6 50.954%, #c5c0ff 85.326%, #2a2fb6` | 同上 |
| `--dsw-gradient-onboarding-cyan-stops` | 2 处 | `#0293b4 21.154%, #2dc8eb 50.954%, #aff0ff 85.326%, #0293b4` | 同上 |
| `--dsw-linear-gradient-think` | 6 处 | 浅 `linear-gradient(180deg, #fff 20.19%, transparent 100%)`；深 `#151517` | 明暗两套硬编色的渐隐遮罩 |
| `--dsw-linear-think-select` | 6 处 | 浅 `#f5f6f7`；深 `#232325` | 同上 |

**唯一值得动的一条**：`--dsw-linear-gradient-think` / `--dsw-linear-think-select` 把明暗底色硬编成
`#fff` / `#151517`。改了底色的自定义主题下，思考流的渐隐遮罩仍是纯白/纯黑，和染色底色之间可能露边。
宿主自己就是这么写的，不是我们引入的；要修得按 `--dsw-alias-bg-base` 现算这两条渐变
（`select` 那一档可复用 sidebar-fill 的「底色混 4%~6% 文字色」系数）。

