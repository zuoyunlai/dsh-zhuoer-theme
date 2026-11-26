# 组件面（component surface）批次规划

> 状态：**规划，未开工**。落盘日期 2026-11-26。目标是明确「哪些宿主组件可以按本插件的方式设形」，
> 以及每项的证据、验收与回落，避免下次打开又从「能不能改」重新判断。

## 0. 三种机制（决定了稳定性，先分清再动手）

| 机制 | 命中方式 | 稳定性 | 失效表现 |
|---|---|---|---|
| **M1 token** | 宿主本来就 `var(--dsw-alias-*)` | 高：宿主换版仍在 | 无（token 名是宿主契约，`verify:host` 会登记） |
| **M2 语义选择器** | `[role="switch"]` / `[role="tab"]` / `[role="dialog"]` / `[role="tooltip"]` / `[role="menu"]` / `[role="separator"]` | 中：语义是 ARIA 契约，比类名稳 | 样式静默不生效 |
| **M3 类名子串** | `[class*="_xxx"]`（哈希 CSS Modules） | 低：宿主改内部实现即失配 | 静默不生效，且属于宿主契约，需登记 |

本批次**只用 M1 + M2**，不新增 M3 依赖。

## 0b. 实施状态（2026-11-26）

| 项 | 状态 | 提交 / 结论 |
|---|---|---|
| 2.3 弹层圆角 | **已做** | `a4452bc`：dialog→radius-panel、menu→radius-lg、tooltip→radius-sm，只改圆角 |
| 2.1 开关形状与过渡 | **已做** | `2c9209b`：轨道取 radius-lg、滑块 `border-radius:inherit`、160ms 过渡 + reduced-motion 关闭 |
| 2.2 标签页指示条 | **降级不做** | 指示条是 `<span className={K0.indicator} aria-hidden style={width:calc(...)}>`：只有哈希类名 + 内联宽度，`aria-hidden` 还会命中图标，没有稳定语义锚点（M3 才做得到，本批次明确不用 M3） |
| 2.4 按钮过渡 | **降级不做** | 实测宿主 411 个按钮样式块里 39 个自带过渡（`opacity .2s`、`color 100ms` 等）；CSS 没有「追加到已有 transition」的语法，整条覆盖会把宿主的淡入淡出换掉，属于制造回归 |
| 2.5 焦点描边 | **已做** | `d529543`：仅键盘语境（`html:not([data-input-modality="pointer"])`），颜色取 brand-primary，宽度/偏移沿用宿主 |

## 1. 已确认可设的组件（M1，现状已生效）

按 `themes.mjs` 224 个已建模 token 归纳（数字=该家族 token 数）：

| 组件 | token 家族 |
|---|---|
| 按钮 | `alias-button` 15 |
| 开关滑块 | `alias-switch` 1（`--dsw-alias-switch-thumb`） |
| 卡片 / hovercard | `alias-card` 3、`elevation-*` 3 |
| 菜单 / 弹层 | `alias-menu` 2、`specific-menu`、`specific-selector` |
| 提示气泡 | `alias-tooltip` 3 |
| Toast | `alias-toast` 3 |
| 输入 / 文件 / 选择 | `specific-input`、`alias-file` 6、`specific-selector` |
| 侧栏（含顶栏条） | `specific-sidebar` 13 |
| 消息气泡 | `specific-bubble` 2 |
| 代码 / Markdown / 表格 | `alias-code` 2、`alias-markdown` 8、`font-markdown` 28 |
| 状态 | `alias-state` 13 |
| 链接 / 滚动条 / 图表 / 插画 / 导览 | `alias-link`、`alias-scrollbar` 4、`alias-chart` 3、`alias-illustration` 6、`alias-onboarding` 4 |

结论：**颜色面已经全量可设**，本批次不需要再补 token（除非后续审计发现新宿主 token）。

## 2. 本批次五项（M1 收口 + M2 补形）

### 2.1 开关：形状与滑块过渡

- 改什么：`SHAPES` 每套预设新增两个派生值 `switch-radius`（胶囊/圆角/方角）与 `switch-thumb-size`（18/16/14px）；
  注入 `[role="switch"]` 与 `[role="switch"] > span`，圆角取预设值，另加 `transform .16s cubic-bezier(.2,.8,.2,1)`。
- 依据：宿主开关是 `button[role="switch"]` + 内层 `span`（滑块），滑块色已是 token（M1）。
- 验收：方角预设（absolutely/manuscript）下开关为方角；驱动层 `prefers-reduced-motion` 时不加过渡。
- 风险：低。不改尺寸，只改圆角与过渡。

### 2.2 标签页指示条

- 改什么：`[role="tab"]` 的选中指示条厚度（2px→3px 随形状预设）与圆角。
- 依据：宿主有 3 处 `role="tab"`；指示条目前是 `::after`/`border-bottom` 形态之一，实施时以真机 DOM 为准。
- 验收：切换标签时指示条圆角与预设一致。
- 风险：中低。若宿主把指示条画在父容器上，需改命中位置，**允许本项降级为不做**。
- **实施结论（2026-11-26）：降级不做。** 宿主指示条是 `<span aria-hidden style="width:calc(...)">`，只有哈希类名可锚定；
  `aria-hidden` 又会被图标复用。要命中就必须引入 M3 类名依赖，与本批次口径冲突。

### 2.3 弹层圆角统一

- 改什么：`[role="dialog"]`、`[role="menu"]`、`[role="tooltip"]` 的 `border-radius` 统一取 `--dsw-radius-panel` / `--dsw-radius-lg`。
- 依据：目前出现「面板声明方角、弹层仍是宿主圆角」的不一致。
- 验收：方角预设下弹层为直角；圆角预设下保持原样。
- 风险：低（纯圆角，不动尺寸与位置）。

### 2.4 按钮过渡

- 改什么：`[role="button"]`、`button` 的 `background-color`/`border-color` 加 120ms 过渡。
- 依据：插件自身 UI 已是 120ms 节奏；宿主 `--ds-transition-duration-fast = .1s`，取 120ms 与自身一致。
- 验收：hover 有过渡但无闪烁；`prefers-reduced-motion` 下无过渡。
- 风险：低。但**不要**加在 `width/height/padding` 上。
- **实施结论（2026-11-26）：降级不做。** 实测宿主 411 个按钮样式块中 39 个已有自己的过渡
  （`opacity .2s ease-in-out`、`color 100ms ease` 等）；CSS 无法「追加」到现有 transition，整条覆盖会替换掉
  宿主的淡入/按压动画，属于用一个小收益换一类回归。

### 2.5 输入焦点描边

- 改什么：`input:focus-visible`、`textarea:focus-visible`、`[data-slot="composer"] input` 的 `outline-color` 改为 `--dsw-alias-brand-primary`，宽度 2px、offset 2px。
- 依据：与插件自身 `:focus-visible` 视觉统一（面板内已是 brand-primary 2px）。
- 验收：Tab 键遍历时焦点环颜色与面板一致。
- 风险：低。注意不要覆盖宿主已有的 `transparent` 焦点策略（宿主对 pointer 模态有显式禁用，需用 `:focus-visible` 而非 `:focus`）。

## 3. 门禁与快照影响

| 影响面 | 处理 |
|---|---|
| `verify:csssnap` | 注入 CSS 会变 → 需 `--capture visual/css-current` 重采基线 |
| `verify:host` | 新增 M2 依赖（`role="switch"/tab/dialog/menu/tooltip`）→ 契约登记，附 `usedFor` / `breaksIfMissing` |
| `verify:visual` | 现有基线只覆盖设置页静态；开关/标签页/弹层不在其中，本批次**不扩基线**，靠手动验收 + 门禁不回退 |
| `verify:scale` | 不涉及（不动文字尺寸） |
| `verify:keys` / 文案快照 | 若无新文案则不变；若新增「开关形状」提示则需更新 148 条快照 |

## 4. 明确不做

- **组件尺寸**（宽/高/padding）：会改变宿主布局行高，重演 `body{zoom}` 那类坐标事故。
- **复选框 / 单选 / 滑块**：宿主未暴露 `role="checkbox"/"radio"/"slider"`，大概率原生 `input`；深度重画收益低于维护成本。
- **进度条**：无 `role="progressbar"` 锚点。
- **新增 M3 类名契约**：本批次一律不碰哈希类名。
- **大面积滤镜动画**：GPU 合成开销。

## 5. 实施顺序与回滚

1. 2.3 弹层圆角（最独立，先验证 capture 流程）→ 2.1 开关 → 2.2 标签页 → 2.4 按钮过渡 → 2.5 焦点描边。
2. 每项单独提交，提交信息写明命中的选择器与依据，便于单项回滚。
3. 任一项在真机上无法验收（例如指示条不在 `role="tab"` 上），**降级为不做并在此文档记结论**，不硬凑。