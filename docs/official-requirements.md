# DSH 插件的官方要求与我们的合规对照

> 用途：发版前照着勾一遍；回答「官方到底要求什么」时引用这一页，而不是翻聊天记录。
> 记录时间 **2026-11-25**，本机宿主官方包 **0.2.2-rc.5**，本插件 **0.6.17**。

## 0. 先说清楚：有硬要求，没有官方认证

- **有**：插件包契约（能不能被识别/加载/展示）、插件市场索引 schema（想上架时）。
- **没有**：官方认证、评分、排名、安全审计、市场准入门槛。
- 社区那套 **ENTRY / FLOW / BOOST** 三层（`dsh-standards` 项目）原文自己写着
  「社区草案，非官方，不是认证/排名/安全审计」——可以自检，**不得对外称官方标准**。

## 1. 官方硬要求

### 1.1 插件包契约（决定能否被宿主识别、加载、展示）

依据：官方仓库 `AGENTS.md` / `docs/`（本机通过 `dsh-primer` 的官方文档镜像核对，
该镜像钉在 `dsh-v0.2.2-rc.3`；版本敏感条款请回官方原文复核）。

| # | 要求 | 失效后果 |
|---|---|---|
| 1 | 独立插件包必须是 **ESM**，并声明 **`dsh.bundle`** 清单（`patch` 指向 `cordis.patch.yml`） | 被装成普通依赖，**不注册成 profile 图层**（安装器会明说） |
| 2 | 有客户端时要有 **`exports["./client"]`**、包根行与 `dsh.client` 字段 | 客户端加载不到 |
| 3 | **展示元数据**：`locale/<lang>.json` 的 `meta.title` / `meta.description`，加导出的 **`./icon`**（SVG/PNG/JPEG/WebP，≤256 KiB，必须在包内） | 市场/插件页回落成包名与默认图形 |
| 4 | 注册走 **`ctx.effect()` / `ctx.on()` / 服务 `register()`** 并返回 disposer | 热重载/卸载后监听器泄漏 |
| 5 | **waterfall 监听器必须调 `next()`** | 静默短路下游 |
| 6 | **不得硬编码可调参数**；配置错误 fail loud（带字段路径）；实时字段用 `Volatile<T>` + `loader/volatile-update` | 用户改不动配置，且错得无声 |
| 7 | UI 插件：**只渲染 slot 里的 React 组件**（禁止 iframe 托管页面）；样式只用 `--dsw-alias-*` token；**不 `require` 任何 Harness Client 包** | 抛错组件会把整个 slot 搞白 |

### 1.2 插件市场索引 schema（要上架才涉及）

依据：官方 `docs/user/guide/plugin-market`。

- `LocalizedText` 字段（`title` / `description`）可以是字符串或 `{ "en": …, "zh": … }`，**对象必须含 `en`**；
- `icon`：内联 `data:` URL（SVG/PNG/JPEG/WebP，**≤32 KiB**）或一个 URL（相对图标相对索引 URL 解析）；
- 索引源 URL 必须是 `http:`/`https:`，**不得含用户名、密码或 `#` 片段**；
- 市场生成器只列**未弃用、非 private、且声明了 `dsh.bundle`** 的版本——即 1.1 第 1 条也是上架前提；
- 索引 `format: 1`；`plugins` 顺序有语义（初次展示与筛选要保持发布者顺序）。

## 2. 我们的合规对照（含证据）

| 条款 | 现状 | 证据 |
|---|---|---|
| ESM + `dsh.bundle.patch` | ✅ | `package.json` 的 `dsh.bundle.patch: "./cordis.patch.yml"` |
| `exports["./client"]` + `dsh.client`（platform/inject/immediately） | ✅ | `package.json` 的 `exports` 与 `dsh.client` |
| `./icon` 导出 + 包内 ≤256 KiB | ✅ 884 B | `icon.svg`；`verify:locale` 断言 |
| 展示元数据 `locale/*.json` | ✅ | `locale/{zh,en}.json`；`verify:locale` 断言 en 必存 + `meta.title` 非空 + `exports`/`files` 齐全 |
| 注册带 disposer、effect 化 | ✅ | `client.js` 的 `ctx.effect(...)` 返回清理函数；服务端 `index.js` 同 |
| 不 require Harness Client 包 | ✅ | 客户端只 `require('react')`（宿主 module loader 提供）；`peerDependencies` 只声明注入所需的两个 client 包 |
| UI 只用 slot + `--dsw-alias-*` | ✅ | `verify:host` 对账 `contracts/host-contract.json`；`token-surface` 报覆盖与豁免 |
| 市场 `LocalizedText` 含 `en` | ✅ | `locale/en.json` 存在且 `meta.title` = `Zhuoer Theme` |
| 市场索引（自建） | ✅ 已可公开加载 | market/index.json 按官方 schema 写，verify:market 守门。**DSH 不内置索引源**，用户自行添加 URL。公共 URL 用 ghproxy 镜像（见下），已在 DSH 0.2.2-rc.5「发现」里实测：索引标题与插件卡片（标题/说明/0.6.18/作者/已安装）全部正常 |
| 索引托管的硬约束 | ⚠️ 两条都踩过 | DSH 要求索引**不经重定向**返回 2xx。raw.githubusercontent.com 在本网络于 **Node 侧** ECONNRESET（curl 通不代表宿主通）；gitee.com/<owner>/<repo>/raw/… 会 302 跳到带签名的 raw.giteeusercontent.com，DSH 直接报 unexpected redirect。可用的公共 URL：https://ghproxy.net/https://raw.githubusercontent.com/zuoyunlai/dsh-zhuoer-theme/main/market/index.json（备用 gh-proxy.com 同格式） |
| 社区清单 | ⏳ | 4 个 awesome-list 的 PR 仍 OPEN（见 `docs/catalog-submissions.md`），与官方市场无关 |

## 3. 自检工具与两个坑

工具：`dsh-primer`（本机 v0.4.7，官方文档镜像 + `dsh-plugin-dev check` 16 项静态检查）。

**坑 1：位置参数传绝对路径会被忽略。**

```bash
# ✗ 会拿 cwd 去检查，报出一堆假 error（main/engines/files/bundle 全说没有）
dsh-plugin-dev check --json E:/path/to/plugin

# ✓ 先进仓库再跑
cd E:/path/to/plugin && dsh-plugin-dev check --json .
```

**坑 2：`files` 检查按字面比较。** 我们写 `"index.js"`，检查器拿 `main: "./index.js"` 去比，
报「whitelist is missing `./index.js`」——但 0.6.17 的发布日志明确列了 `npm notice 16.0kB index.js`，
文件确实进包。**这是误报，不要为了取悦检查器改 `files`。**

正确姿势下的判定（2026-11-25 实测）：`patch-valid`、`patch-ids-unique`、`manifest-bundle-patch`、
`manifest-main`、`manifest-engines`、`display-meta` 全部 ✓；`manifest-files` 误报；
`manifest-package-manager` 不适用（本仓用 npm）；`readme-five-langs` 是建议项（我们 zh+en 两版）。

## 4. 发版前的复检流程

1. **看镜像有没有漂**：`dsh-primer/references/official-docs/SNAPSHOT.md` 的 `Source ref` 是否覆盖
   你正在用的宿主版本（本机是 rc.5，镜像钉在 rc.3——写这份文档时就差两个 rc）。
2. **跑静态自检**：`cd <repo> && dsh-plugin-dev check --json .`（注意坑 1）。
3. **跑本仓门禁**：`npm test`（含 `verify:locale` / `verify:host` / `verify:panel` / `verify:text` / `verify:keys`）。
4. **上架前**再对 1.2 的市场 schema（`en` 必存、内联图标 ≤32 KiB、索引 URL 不带凭据）。
5. 结论按证据写：`static` 不是 `runtime`，`not-run` 不是通过；UI 是否正确要在真宿主里看一眼（见 `docs/live-verify.md`）。
