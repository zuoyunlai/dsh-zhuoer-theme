# SECURITY

本文件说明 dsh-zhuoer-theme 的信任边界与数据流向。它不是安全审计结论，也不构成任何认证。

## 插件做什么

一个**纯客户端皮肤**：把 12 套内置配色（以及用户自己创建的自定义主题）映射成宿主的 `--dsw-alias-*` token。
除下列两条本机端点外，它不与任何外部服务通信。

## 网络出口

| 目标 | 何时发生 | 数据 |
|---|---|---|
| 宿主模型服务（`llm.stream`） | 用户在编辑器里点「AI 生成」 | 用户自己写的主题描述（≤ 4000 字符），外加固定的系统提示词 |
| 无其它出站请求 | — | 底图、字体、logo 全部走本机 `/dsh-zhuoer-theme/assets/*` |

AI 生成走的是**宿主已配置的模型通道**（与你在 DSH 里正常对话同一条路）。插件不内置 key，不自带 API 客户端，也不代理其它服务。

## 本机端点

| 端点 | 方法 | 作用 | 防护 |
|---|---|---|---|
| `/dsh-zhuoer-theme/assets/{bg,fonts,logo}/*` | GET | 静态资源 | 无（只读，内容是公开素材） |
| `/dsh-zhuoer-theme/api/nonce` | GET | 下发本次实例的会话随机数 | 必须带 `x-zhuoer-client: 1`；跨站请求会先触发预检，宿主不应答 |
| `/dsh-zhuoer-theme/api/gen-theme` | GET | 调宿主模型生成主题 JSON | 自定义头 **且** 必须带匹配的 `x-zhuoer-nonce`（本次实例随机生成） |
| `/dsh-zhuoer-theme/api/report` | POST | 客户端自检回传，写本机日志 | 自定义头，或同源 Referer/Origin 匹配 |

### 诚实的能力边界

- **nonce 挡的是外部来源的直连探测与误撞，不是同源恶意脚本。** 浏览器里同源脚本之间无法互相隔离：任何跑在同一页面的插件脚本都能读到页面状态、甚至直接调用这些端点。这是 Web 平台的固有限制，不是实现缺陷。
- 自定义头 `x-zhuoer-client` 之所以是硬门槛：浏览器发起的**跨站**请求带自定义头会先触发 CORS 预检，宿主不应答，于是请求根本到不了 handler。
- `gen-theme` 的 nonce 是**每次插件实例启动重新生成**的：宿主重启后旧 nonce 失效。

## 本机落盘

| 路径 | 内容 | 生命周期 |
|---|---|---|
| `$DSH_HOME/dsh-zhuoer-theme/plugin-status.json` | 版本、挂载阶段、错误信息 | 每次 apply 覆写 |
| `$DSH_HOME/dsh-zhuoer-theme/client-report.log`（+ `.1`） | 客户端自检记录 | **默认关闭**（需 `localStorage['dsh-zhuoer-theme:debug'] = '1'`）；上限 2 MiB，超出轮转一次 |
| `$DSH_HOME/dsh-zhuoer-theme/gen-request.json` | 只有在 `DSH_ZHUOER_DEBUG=1` 时写；**只写元数据，绝不写 prompt 原文** | 手写元数据 |
| 浏览器 `localStorage` 键 `dsh-zhuoer-theme:v1` | 主题偏好（主题 id、明暗、字号、圆角、对话宽度、快捷导航三态、底图引用键等） | 纯本机；「恢复默认设置」会整键删除 |
| 浏览器 IndexedDB | 底图本体（用户自己选的图片，≤ 3 MiB/张） | 纯本机；删除主题时连带清理 |

**任何情况下都不会上传**你的偏好、底图或主题 JSON。唯一的出站动作是 AI 生成，且必须由你主动触发。

## 诊断开关（默认全关）

- 客户端探针：`localStorage['dsh-zhuoer-theme:debug'] = '1'` —— 会让每次主题应用遍历 DOM 并逐元素 `getComputedStyle`，**只用于排障**。
- 服务端诊断：`DSH_ZHUOER_DEBUG=1` —— 只写请求元数据。
- 主题同步逃生阀：`localStorage['dsh-zhuoer-theme:mute-sync'] = '1'` —— 完全断开与宿主明暗偏好的同步。
- 主题上报：`$DSH_HOME/dsh-zhuoer-theme/client-report.log` 的内容**不含**你的提示词原文。

## 依赖与供应链

- 运行时依赖：**零**（`dependencies` 为空）。只 `peerDependencies` 声明两个宿主 UI 包。
- 字体与底图随包分发在本机 `assets/`，不引用任何 CDN。
- 仓库声明 `engines.dsh` 与 peer 走廊；不相交的宿主会静默禁用该插件（见 README「已知边界」）。

## 报告问题

发现问题时，请把 `$DSH_HOME/dsh-zhuoer-theme/plugin-status.json` 的内容附上——它只含版本与错误阶段，不含任何用户数据。
