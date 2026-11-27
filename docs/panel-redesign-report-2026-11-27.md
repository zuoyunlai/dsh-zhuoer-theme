# 设置面板 / 配色编辑面板 重构——收口记录

> 日期：2026-11-27｜执行者：Claude Code（宿主导通后经 CLI 驱动）｜复核：主控（本会话）
> 需求来源：`docs/panel-redesign-spec-2026-11-27.md`
> 设计计划：`docs/panel-redesign-2026-11-27.md`

## 1. 结果概述

按「试样台」思路重排设置面板与配色编辑器，信息架构落为四段：
**配色主题（12 套试样 + 模式）/ 风格预设（12 配方签）/ 自定义配色 / 全局偏好（一条台账）**。

配色编辑器独立成流程：基色与明暗 → 锚点色（5 个语义带）→ 底图 → 排版与精细化 → 恢复默认。

## 2. 改动清单

| 分组 | 文件 | 说明 |
|---|---|---|
| 设置面板 | `src/20-tokens-and-panel.js` | 主题卡由「圆角卡+灰条」改为界面试样（3px 品牌书脊 / 表面侧轨 / 内容卡 / 两行字色 / 三枚语义点）；删除卡上内部 id；头部去掉胶囊标签改品牌色书脊；风格预设改为三段色脊的「配方签」；全局偏好收成一条 12px 分组标题 + 细线的台账 |
| 配色编辑器 | `src/20-tokens-and-panel.js` | 锚点按 `ANCHOR_BANDS` 分 5 带（背景与表面 / 文字 / 描边 / 品牌 / 语义色）；每行同时给当前色与默认色（默认色虚线边），并显示该色对比度读数与「偏低」提示；AI 生成与图片取色收进可展开次要区；底部「恢复默认设置」 |
| 共享样式 | `src/20-tokens-and-panel.js` | `PANEL_CSS` 重写：**零色值**（实测该区块 0 处 hex/rgba），全部经宿主 `--dsw-alias-*` 与内联 `--zp-th-*`；字号/圆角/间距全部落在刻度门通道内 |
| 文案 | `src/05-i18n.js` + `i18n/*.json`（8 语言） | 新增 177 行词条（zh 词典 310 键）；无新增裸中文字面量（i18n 棘轮仍绿） |
| 构建产物 | `client.js` | 由 `npm run build` 重新拼接（`verify-build` 逐字节核对通过） |
| 契约重采 | `contracts/text-snapshot/{zh,en}.json` | 有意改文案后 `verify:text --update`；同时移除卡片上的主题 id 文案。`host-contract.json` 与 `contrast-baseline.json` **未动** |
| 文档 | `README.md` / `README.en.md` | 文案门条数 200 → 220（现算真值），其余无改 |

## 3. 门禁实测（逐条真跑，非自述）

`verify:all` 整链在本机因沙箱限制无法整体执行：`verify-syntax.mjs` 内部 `spawnSync node` 被判 `EPERM`（嵌套进程被拦，属环境限制非代码问题）。改为逐脚本执行，每条只从 shell 起一层进程：

| 门 | 结果 |
|---|---|
| 语法（`node --check client.js` + 各独立模块） | PASS |
| git-guard / git-doctor | PASS / PASS |
| verify-build | PASS |
| verify-version / verify-assets | PASS / PASS |
| verify-contrast | PASS |
| verify-cssgrid（刻度门） | PASS |
| verify-scale / verify-important / verify-themes | PASS / PASS / PASS |
| verify-host（宿主契约） | PASS |
| verify-csssnap | PASS（无 current 快照时 SKIP） |
| verify-text / verify-keys / verify-locale | PASS / PASS / PASS |
| verify-market / verify-claims | PASS / PASS |
| verify-i18n（棘轮） | PASS |
| verify-markdown / verify-hooks / verify-schema | PASS / PASS / PASS |
| verify-panel（面板冒烟 + 点击「新建主题」+ 编辑器重渲染） | PASS |
| token-surface | PASS |

> 说明：逐条跑时对 `src/*.js` 分片做 `node --check` 会误报（分片是拼接片段，如 `00-core.js` 在函数中截断，`20-tokens-and-panel.js` 末尾是 `return`）。真正的语法真值是拼接后的 `client.js`，已通过，且 `verify-build` 证明产物与分片逐字节一致。

## 4. 额外复核（主控）

- **编辑器实渲**：`verify:panel` 已覆盖（点击后用状态垫片重渲染并断言编辑器文案出现）。另用一次性脚本把 dump 移到点击之后，确认编辑器渲染 **270 条文案**，结构为「编辑配色 / 基色与明暗 / 配色锚点（背景与表面·文字·描边·品牌·语义色）/ 底图 / 排版与精细化 / 恢复默认设置」，锚点行带对比度读数（如 `10.1:1`、`1.2:1 偏低`）。
- **零色值**：`PANEL_CSS` 区块扫描 0 处 hex/rgba；文件中残留的色值全在 JS 兜底与顶栏渐变（既有代码，非本次引入）。
- **契约未扩权**：`contracts/` 下仅 `text-snapshot` 变更；未改 `host-contract`、`contrast-baseline`、门禁脚本。
- **未提交**：HEAD 仍为 `cc14fb8`，改动全部留在工作区。

## 5. 未完成与风险

1. **视觉基线未重采**：`contracts/visual-baseline/*.png` 与 `contracts/css-snapshot/*.css` 需真机采集；本次无当前截图，门禁保持 SKIP，**未伪造**。
2. **真机观感未验**：插件未同步进宿主 install（`npm run dev:sync` 需写 `~/.dsh/profiles/*/node_modules`），面板在真实宿主字号/宽度下的实际效果尚待人工过目。
3. **窄视口未验**：`settings-narrow` 基线未重采，窄容器换行规则（标签换行到独立一行）仅按代码实现，未实测。
4. **对比度提示口径**：品牌主色/次色在默认主题下显示「4.0:1 偏低」，属既有地板口径（`enforceTextFloor` 正文 7:1 / 次级 6:1），非本次引入的回归。
