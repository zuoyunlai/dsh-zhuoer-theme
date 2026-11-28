# 首屏白闪：根因、修法与验证进展（2026-11-28）

## 根因（宿主源码级，已确认）

宿主自己的 boot 主题在首屏注入画布底色。app.asar 里 `dsh-client-ui-theme` 的原话：

```
/** CSS that colors the document canvas before any script executes. */
const LIGHT_BACKGROUND = "#fff";
const DARK_BACKGROUND = "#151517";
```

画布规则是 `body{background-color:var(--dsw-alias-bg-base)}`，该变量默认取
`--dsw-static-neutral-bluish-00` = `#fff`（深色 `bluish-950` = `#151517`）。

我们的 token 只能等客户端 bundle 求值后才注入。实测时间线（DSH web）：

| 时刻 | 事件 |
|---|---|
| 180ms | 首绘（first-paint / FCP）——画布是宿主的 `#fff` |
| 417ms | applyTokens 开始（before 打点），宿主 token 尚未落地 |
| 421ms | overrideTokens 返回（after 打点），`--dsw-alias-bg-base` 仍为空 |
| 770ms | 探针第一次拿到渲染底色：已是主题色 |
| 1091ms | 第二次 apply，token 才稳定 |

**白底持续约 250–450ms。用户在桌面端看到的现象是真的。**

## 上一版结论为什么是错的

上一版报的「NO_FLASH、ΔE=0」是**探针盲区造成的假结论**：探针是客户端代码，
而客户端 bundle 是 defer 的模块脚本，首绘之后才求值——**首绘那一帧客户端根本看不见**。
把「没观测到变化」当成「没有变化」，是方法错误。

## 修法（已实现，走宿主正规通道）

宿主自己的主题就是这样做的（app.asar 原文）：

```
ctx.on("webserver/index-inject", (table) => {
  table.push(...bootThemeInjections(config.preference.get(), ...));
}, { prepend: true });
```

我们照做：服务端监听 `webserver/index-inject`，push 一条 `{kind:'style'}` 行，
在首屏把画布刷成主题底色。

三个要点：

1. **不用 tapIndex**：桌面端是 `file:// + IPC`，index.html 是打包好的静态壳，
   字符串变换不会被执行（dsh-boot-suite 踩过同一个坑并写了记录）。行表是两种呈现方式唯一共用的载体。
2. **底色从哪来**：服务端首绘前拿不到浏览器里的偏好（偏好存在 localStorage），
   所以客户端 apply 后回传生效的两态底色（新增 `POST /dsh-zhuoer-theme/api/boot-colors`，
   落 `boot-colors.json`）；没有回传记录时退回内置 zhuoer 两态底色。
   回传键用**真实主题 id**（pref.theme）而不是 base —— 9 个自定义主题都 clone 自 zhuoer，
   用 base 做键会导致「换主题不重新回传」。
3. **明暗口径一致**：客户端回传 `mode`（light/dark/auto）。服务端据此决定刷单色还是用媒体查询。
   若无条件用媒体查询，用户显式选「浅色」而系统是深色时，首屏会先刷深色再被改回浅色——闪反方向。

优先级：首屏行用 `html body`（特异性 (0,0,2)）压过宿主的 `body`（(0,0,1)），**不抬 !important**
（本仓优先级计数是棘轮，基线 83）。客户端那条画布规则同样不抬优先级：选择器相同但注入更晚，后来者赢。

## 已验证（web 端，证据为首屏 HTML 原文）

注入计数日志是诊断期临时加的，随诊断结束已从 `index.js` 移除；下面这段是当时的原文摘录。
启动新的 web server 后：

```
2026-11-28T10:40:25.042Z  inject known=true light=#dee7e9 dark=#101619
2026-11-28T10:41:01.740Z  inject known=true light=#f4f1ec dark=#0e1015
2026-11-28T10:41:29.713Z  inject known=true light=#f4f1ec dark=#0e1015
```

实际下发的首屏 HTML 里**两行都在**：

```html
<style>:root{color-scheme:light}body{background-color:#fff;--dsh-boot-bg:#fff}</style>      ← 宿主的
<style>:root{color-scheme:light}html body{background-color:#f4f1ec}</style>                 ← 我们的
```

**注入通道在 web 端完全正常，行确实进了首屏。**

## 桌面端：通道通了，但首帧救不回来

**通道确实通了。** 桌面 host 进程启动于 18:46:10，注入计数日志随后出现

```
2026-11-28T10:46:24.202Z  inject known=true light=#dee7e9 dark=#101619
```

（已知值与该桌面端当时生效的主题一致，不是兜底值。）所以「桌面端不触发这条事件」的
猜测被否掉了——行是推出去过的。

**但用户的观感没变**：深色还是先看见宿主自己的黑再变成主题色，浅色先白再变成主题色。
这说明断点不在「推没推」，而在**推出去之后落到画布上的时机**。

## 桌面端的断点：行表排在一次 IPC 之后

桌面端引导代码（app.asar 里发往渲染层的那段 bundle，原文顺序）：

```js
const r = globalThis.__DSH_BOOT_READY__;
Ma.ready().then(async ({ injections: i, streamBaseUrl: n }) => {   // ← IPC 往返
  globalThis.__DSH_TRANSPORT__ = { ownsHost: true, streamBaseUrl: n };
  await iG(i, ...);                                                  // ← 行表在这里才被应用
  r.resolve();                                                       // ← 之后才继续引导
})
```

而 `iG` 里的 style 行就是「`document.createElement('style')` → `document.head.append`」。
也就是说桌面端的顺序是：

1. 静态壳 HTML 解析完，窗口里已经有一块底色
2. 延迟模块（entry）下载 + 求值
3. `dshDesktopBoot.ready()` —— 一次 IPC 往返，主进程这刻才 `collectIndexInjections(peer)`
4. 我们的 `<style>` 才进 `head`

**插件唯一的上色通道排在第 3 步之后。** 用户看到的那段底色，发生在插件任何代码被调用之前——
CSS 再提前也早不过「插件还没被调用」。

web 端之所以能零闪，是因为同一张行表在 web 是被**服务端直接渲染进首屏 HTML** 的（见上一节
首屏 HTML 原文）；桌面端走 IPC，天然晚一跳。同一个设计在两种呈现方式上不是同一段时序。

### 所以这不是插件层能修的问题

插件层只剩下「行表」这一条通道，而它对桌面端的第一帧不可达。真要根治，得宿主侧动手，二选一：

- 桌面主进程把行表渲染进它加载的静态壳 HTML（它在 `loadURL` 之前就持有这些行）；
- 或让窗口底色跟随主题偏好，而不是固定取 `#fff` / `#151517`。

这两条都改不动第三方主题插件，也不该由一个插件去改 app.asar（升级即被覆盖）。

## 这一轮实际交付了什么

| 面 | 结论 |
|---|---|
| web | 首屏 HTML 里就有主题底色行，当前版本下不再有宿主底色窗口 |
| 桌面端 | 行确实注入（日志为证），但落在首帧之后；剩余那段过渡属宿主时序限制，插件侧无解 |

## 验收

- `scripts/test-boot-css.mjs`：16 组断言（auto 媒体查询 / 显式 light|dark 单色 / 非法值兜底 /
  不含 `</style` / 确实注册了 `webserver/index-inject` 且推 `kind:'style'` 行）。
- `npm test` → exit 0；优先级计数 83 ≤ 83（棘轮未升）。
