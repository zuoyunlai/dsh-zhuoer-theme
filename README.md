# dsh-zhuoer-theme（卓尔主题）

给 DSH 换整套配色的皮肤插件：11 套内置主题 + 自定义主题编辑器（取色 / AI 生成 / 风格预设）。

- 纯本地配色注入，不联网、不需要任何令牌。
- 通过 `ctx.theme.overrideTokens()` 把主题色映射到 DSH 的 `--dsw-alias-*` token（222 个，其中 151 个跟随锚点）。
- 每套主题含明/暗两种模式；默认跟随系统。
- 在 DSH 设置页「卓尔主题」处切换，即时生效。

## 主题清单

| id | 名称 | 深色画布 | 强调色 |
|---|---|---|---|
| zhuoer | Zhuoer 原版红 | #0e1015 | #d13c3c |
| absolutely | Absolutely · 极简 | — | — |
| beacon | 灯塔 · Beacon | — | — |
| crt | CRT · 终端 | #090a09 | #e8e8e8 |
| dash | Dash · 琥珀 | #1a1210 | #cf8b4d |
| knot | Knot · 绳结 | — | — |
| manuscript | 手稿 · Manuscript | — | — |
| miami | 迈阿密 · Miami | #140f1e | #f472b6 |
| phosphor | 荧光 · Phosphor | — | — |
| rose | 桃红 · Rose | — | — |
| tide | 潮汐 · Tide | #10151b | #5ab6d8 |

## 安装

从 npm 安装（推荐）：

```json
"dsh-zhuoer-theme": "^0.4.1"
```

开发期用 `link:` 指向工作树，改完重启 DSH 即可生效。

## 安装（开发期 link）

在 profile 的 `package.json` 里加：

```json
"dsh-zhuoer-theme": "link:E:/Documents/deepseek-harness/default-workspace/dsh-openclaw-skin"
```

并把 `dsh-zhuoer-theme` 加进 `dsh.profile.bundles`，然后 pnpm install 并重启 DSH。

> 宿主的插件资源路由只服务**启动时已存在**的文件，所以新增/替换 `assets/` 下的字体与底图后必须重启，
> 否则对应 URL 返回 404（页面本身正常，只是字或底图缺失）。

## 验证

```bash
npm test          # verify:all（含版本一致性门）+ 派生纯函数测试
npm run coverage  # token 覆盖率与「刻意不跟锚点」的豁免清单
npm run build     # src/*.js → client.js（产物必须与源码一致，verify:build 会查）
```

客户端代码在 `src/` 下分四片（core / themes / tokens-and-panel / quicknav），由 `build.mjs`
按文件名顺序拼成单文件 `client.js`。**改代码请改 `src/`，不要直接改 client.js**；
主题色仍只改 `themes.mjs`，然后 `npm run sync:themes`（会写入 `src/10-themes.js` 并构建）。

## 主题开发

主题色的唯一真源是 `themes.mjs`。`client.js` 里那段 `const THEMES = {...}` 是它的
生成副本：客户端插件会被宿主合并进 `/plugins/??a,b,c` 的打包请求，`import.meta.url`
指向那条合并 URL，相对 import 不可靠，所以只能内联。

**改主题只改 `themes.mjs`**，然后：

```sh
npm run sync:themes     # 把 themes.mjs 生成进 client.js
npm run verify:themes   # 校验值一致 + token 齐全 + 对比度达标
npm run check:themes    # 只检查是否需要同步（不一致时退出码 1）
```

校验覆盖：

- `client.js` 内联副本与 `themes.mjs` 逐 token 相等（`--dsw-hovercard-bg` 这类 DSH 补充 token 允许存在）
- 11 套主题、明暗两档的 alias token 集合一致，不缺项
- 正文/底色对比度 ≥ 4.5；分隔线只要求不与底色相同（≥ 1.05，Zhuoer 原版分隔线本来就极淡）

> 曾经踩过：只改 `client.js` 的内联副本、没改 `themes.mjs`，下一次 `sync` 会把修复原样覆盖回去。
> 现在两道门都会拦住这种情况。

## 自定义主题

> AI 生成主题与图片取色的设计见 [docs/ai-theme-plan.md](docs/ai-theme-plan.md)（规划稿，未实现）。

设置 → Zhuoer 主题 → 配色主题里，内置 11 套之后有「新建主题」卡。

新建时**克隆当前选中的内置主题**，然后只调 6 个锚点色：

| 组 | 锚点 | 自动派生 |
|---|---|---|
| 底色 | `--dsw-alias-bg-base` | layer-1/2/3/4、overlay、card、settings-card、skeleton |
| 文字 | `--dsw-alias-label-primary` | secondary / tertiary / quaternary |
| 边框 | `--dsw-alias-border-l1` | l2 / l3 / l4 / selected |
| 品牌 | `--dsw-alias-brand-primary` | 按钮填充与 hover、brand-text、invert、business、trajectory、onboarding |
| 危险 | `--dsw-alias-state-error-primary` | label-error、error-secondary |
| 警告 | `--dsw-alias-state-warn-primary` | warn-label、warn-secondary |

派生用**相对偏移**：组内其它 token 按它们与锚点的 RGB 差值整体平移，所以换底色不会破坏原主题的层次关系。

编辑器是左侧 352px 浮层面板，右半区完全透明、点击穿透 —— **真实界面就是预览**，不用搭假组件样板。

- 明暗分开编辑，切换只影响预览，不会改掉应用自身的明暗偏好
- 每个色板实时显示对比度，低于 4.5 标黄提示，但不阻止保存
- 只存锚点（每套约 20 个 hex），其余从 `base` 主题现算，所以几百套也不会撑爆 localStorage

自定义主题卡的三个动作：**编辑配色 / 复制 / 删除**。

### AI 生成与图片取色

这两件事都在**自定义主题编辑器**里（新建主题或点主题卡「编辑配色」后打开）：

- **AI 生成**：输入一句风格描述，用宿主当前配置的模型生成浅色锚点，点「填入当前主题」
- **从图片取色**：选一张图，本地提 6 个主色，点「填入当前主题」

两者都只填**浅色**锚点，并自动打开 `autoDark`（深色由浅色反推）。填入后可以继续手动微调、换字体、调圆角，最后保存。

### 主题自带底图

编辑器里可以给每个自定义主题单独绑一张底图（来源：跟随全局 / 主题自带 / 自定义图片 / 无）。

**图片存在 IndexedDB**（库名 `dsh-zhuoer-theme-bg`），不是 localStorage —— 后者 5MB 装不下多张 1920px 图，且写满时是静默失败。pref 里只留引用键（`img_xxxx`），启动时预加载进内存供同步取用。

- 单张上限 3 MiB
- 删主题会自动清掉它绑的图
- **导出 JSON 不含底图**（二进制不进 JSON），换机器需要重新选图

> 派生逻辑有独立无头测试：`node scripts/test-derive.mjs`。
> 它直接从 `client.js` 的 `#region derive` 抠出真实实现来跑，测的就是线上那份代码。

## 宿主契约

`client.js` 里大量 `[class*="_frame"]`、`[data-windows-titlebar]` 这类对 DSH 的隐式依赖。
DSH 升级时类名带 hash 后缀会变（我们用稳定子串规避），但子串本身、属性名、语义都可能改。

`contracts/host-contract.json` 登记了每一项：**用在哪、失效会怎样**。

```sh
npm run verify:host      # 代码实际用到的宿主依赖 与契约对账
npm run verify:all       # 主题门 + 契约门 + 语法检查，一次跑完
```

对账结果只有两种：

- `ADDED` —— 代码里新加了宿主选择器却没登记，必须补语义（否则以后没人知道它干嘛）
- `REMOVED` —— 契约里有、代码已不用，确认是有意删除后跑 `--update`

这套只覆盖**静态依赖清单**。DSH 升级后某个选择器是否真能命中，仍需在真实页面上验一次 ——
契约里的 `breaksIfMissing` 就是给那一步看的。

## 许可

MIT。主题色值来自 Zhuoer（MIT），在此基础上做 DSH token 映射。
