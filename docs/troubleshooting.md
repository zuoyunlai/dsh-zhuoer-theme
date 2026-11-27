# 排障（按症状查）

> 只写「真的被问到过、或者自己踩过」的条目。每条格式统一：**症状 → 原因 → 处置**。

## 底纹看不见 / 可见度滑块像没反应

按这个顺序查，三条都真实发生过：

1. **图本身 alpha 太低**（0.6.44 之前）。内置线稿的最大 alpha 只有 6–25/255，即使可见度 100%（实际不透明度 0.7）也只能把底色抬高十几级。0.6.44 起统一归一到 45/255。
2. **内置线稿被「照片限幅」压到 25%**（0.6.44 之前）。`bgKind` 只在自定义主题分支赋值，全局「主题底图」路径漏标，于是 `zrPhotoCapFor` 把线稿当照片去解 4.5:1 上限。0.6.44 已修（主题底图标 `texture`）。
3. **自定义主题自带 `bg.opacity`，覆盖面板滑块**。编辑配色抽屉里那个滑块写的是主题自带的强度，面板「可见度」写的是全局值，前者赢。0.6.45 起两者合并：面板滑块显示并编辑真正生效的那个数。

排障时直接看 `::before` 的实际值：

```js
getComputedStyle(document.querySelector('[class*="_centerCol"]'), '::before').opacity
```

- `0.7 × 可见度` 正常；`0.25` 附近说明被照片限幅压住了；`none` 背景图说明 `bgSource` 是 `none`。

## 改了代码但界面没变

宿主在**启动时快照** `client.js`，并给资源加 `?rev=`，所以：

1. 必须**重启 DSH**，刷新不够；
2. 底图 URL 不变（`bg-dash.webp`），浏览器可能拿旧图 → 重启后按一次 `Ctrl+Shift+R`。

## 设置页里找不到「Zhuoer 主题」/ 图标是齿轮

分区图标走的是 `settings.section.icon` **槽**，不是注册对象上的 `icon` 字段（后者实测被丢弃）。注册 `id` 必须等于分区 `id`。证据与结论在 `contracts/host-contract.json` 的 `positives` / `negatives`。

## `verify:texture` 红了

先看它报的是哪一类：

- `底色本已达标 X:1，纹理压到 Y:1 < 4.5` ——**真问题**。抬这套主题的 `label-tertiary`（同色相只动明度）或降低纹理强度；
- `纹理侵蚀 Z% > 预算 40%` ——纹理太强。这条预算 0.6.44 从 10% 放到 40%，因为「纹理可见」本身必然侵蚀；真正的不变量是上面的绝对地板。

换图或改底色后必须重测契约：`npm run measure:texture`（起本地服务，用浏览器打开打印的地址，页面会自己 POST 结果回来）。

## `verify:csssnap` 红了

注入 CSS 的文本或 `cssInputs` 指纹变了。处置：

```bash
node scripts/verify-css-snapshot.mjs --capture visual/css-current   # 采集
node scripts/verify-css-snapshot.mjs                                # 复验
```

采集要在**跑着新 bundle 的宿主**上做（token 明文就在注入 CSS 里）。没有可用的宿主时，按 `docs/live-verify.md` 起一次性 profile。

## `verify:drift` 红了

宿主改过名：契约里某个 `[class*="_xxx"]` 在本机 `app.asar` 里找不到了。逐条看提示里的 `breaksIfMissing`（哪块样式会消失），然后二选一：

- 改代码用新名字（正解）；
- 暂不修 → `node scripts/verify-host-drift.mjs --update-baseline --reason "为什么还没改"` 记账。

## `verify:host` 报 ADDED

代码里新用了宿主片段但契约没登记。补齐 `usedFor` 与 `breaksIfMissing` 再 `--update`。注意：**本插件自己的类名前缀**（`zp-`、`dsh-pet`）属于 `own.classFragments`，不该出现在宿主契约里。

## 面板截图截出大片空白 / 三张图字节一样

- 面板比视口高，元素截图会被滚动容器拼成「内容 + 空白」；
- 视口覆盖（`Emulation.setDeviceMetricsOverride`）只在单次自动化会话内有效，跨调用会失效。

基线口径是**视口内可见区**（明/暗 559×693、窄 323×666），采完跑 `node scripts/shot-docs.mjs` 校验并裁 docs 图。

## 发布后 `npm view` 还是旧版本

npm CDN 有传播延迟（实测 2–3 分钟）。带时间戳穿透读：

```bash
curl -s "https://registry.npmjs.org/dsh-zhuoer-theme?t=$(date +%s%N)" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s)['dist-tags'].latest))"
```

## 自定义主题存不下 / 图片丢了

- 主题上限 24 套，满了要先删；
- 单张底图上限 3 MiB，存 IndexedDB（不是 localStorage）；
- 导出 JSON **不含底图**（二进制不进 JSON），换机器要重新选图。
