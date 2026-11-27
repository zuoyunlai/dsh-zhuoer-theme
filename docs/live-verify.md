# 起一个「可验证」的宿主实例（不碰你的日常 profile）

写这份文档的原因：桌面端 profile（`desktop`）由 Electron 独占，`dsh --profile desktop web` 会直接报
`profile "desktop" is managed exclusively by the Electron application`；而默认的 `dsh web` 跑的是
`web` profile，里面**没有装**本插件。于是「想看一眼真实渲染」这件事经常卡在「没有可访问的界面」。

## 一次性做法（约 1 分钟）

```bash
DSH="D:/Programs/DeepSeek Harness/resources/runtime/cli/bin/dsh.cmd"

# 1) 从官方 web 模板拉一个一次性 profile（名字随意，这里叫 zr-verify）
"$DSH" --profile zr-verify --from-default-profile web --dump-config > /dev/null

# 2) 把本仓库当本地依赖装进去（pnpm 直通，file: 依赖不发布）
"$DSH" plugin --profile zr-verify add "file:E:/Documents/deepseek-harness/default-workspace/dsh-zhuoer-theme"

# 3) 启动（profile 自己决定跑哪个 app，不要再写 "web" 这个子命令）
"$DSH" --profile zr-verify --no-open --port 0
#    终端会打印 http://127.0.0.1:<port>/?token=<token> —— 用它打开，插件就活在这个实例里
```

## 采集基线（9 张截图 + 两态注入 CSS）

### 口径

**基线 = 视口内可见区，不是整块面板。** 面板比视口高（实测 2757px / 771），元素截图会被滚动容器
拼成「内容 + 大片空白」——2026-11-27 的基线就是这么坏掉的，`verify:visual` 比它自己当然 0.000%（假绿）。
真实用户看到的也只是一屏，所以基线就该是一屏。

### 9 张各是什么

| 文件 | 触发 | 尺寸 |
|---|---|---|
| `settings-light.png` / `settings-dark.png` | 设置 → Zhuoer 主题，面板可见区（`clip` 取 `.zp-root` 与视口的交集） | 559×693 |
| `settings-narrow.png` | 视口 360×780 下同上 | 323×666 |
| `editor-light.png` / `editor-dark.png` | 点 `.zp-th-add`（`+新建主题`）→ 抽屉；**裁可见的 392×771**（抽屉自身 scrollHeight 是 1973） | 392×771 |
| `dialog-light.png` / `dialog-dark.png` | 点「导入 JSON」→ `.zp-json` | 359×270 |
| `card-light.png` / `card-dark.png` | 第一张 `.zp-th` 元素 | 134×100 |

### 步骤

1. 视口 **1264×771**（`Emulation.setDeviceMetricsOverride`），打开 设置 → Zhuoer 主题；
2. 三张主图：浅色/深色各截一次 `clip = .zp-root ∩ viewport`；再切 **360×780** 截窄视口；
3. 特写：`.zp-th` → `.zp-th-add`（抽屉）→ `.zp-json`（弹层），明暗各一轮；
4. 注入 CSS（两态）：`document.querySelectorAll('style')` 里取文本匹配 `/\\.zp-|dsh-wordmark-badge-clip|--zr-/` 的，
   按 DOM 序用 `\n` 拼接（**必须用这套过滤，口径与旧基线一致**；换成「按 id 取 style」会多出一段）
   → `visual/css-current/plugin-{light,dark}.css`；
5. 校验并裁 docs 图：`node scripts/shot-docs.mjs`（`--check` 只校验不写）；
6. 提升基线：`node scripts/verify-visual.mjs --capture visual/current`、
   `node scripts/verify-css-snapshot.mjs --capture visual/css-current`；
7. 复验 + 整链：`node scripts/verify-visual.mjs && node scripts/verify-css-snapshot.mjs && npm test`。

### 六个必踩的坑（都真踩过）

1. **视口覆盖只在单次自动化会话内有效**（跨调用失效），且必须在弹层**挂载前**设；事后设不重排；
2. **元素截图会拼接**：面板/抽屉比视口高时，`.zp-root` 元素截图得到「内容 + 空白」，必须用 `clip` 取可见区；
3. **指针悬停留 tooltip**：点完胶囊先把指针移到 (2,2) 再等 ~1s，否则气泡被裁进图里；
4. **一次性 profile 会弹「预览版说明」**：先点「继续」，否则设置入口点不到；
5. **图片 URL 不变**（`bg-dash.webp`）→ 浏览器可能用旧图，重启后按一次 `Ctrl+Shift+R`；
6. **窄视口那次要是没重排**，三张图会字节相同——`shot-docs` 会直接报「与 xx 字节相同」。

**为什么是面板本体而不是整窗**：整窗截图会把左侧会话列表、时间戳等**场景内容**焊进基线。
换一个实例重采时，同样的代码也会因为会话历史不同而差异 4% 以上（实测 4.714%），
那不是回归，是假红。面板本体与注入 CSS 才是插件自己的输出。

## 收尾（务必做）

```bash
# 停掉实例（Ctrl+C 或 kill），然后删掉一次性 profile
rm -rf "$HOME/.dsh/profiles/zr-verify"
```

不删也不会影响日常使用（profile 是独立目录），但它会一直躺着一个「装着旧版插件」的副本，
下次采集时容易采到旧代码——这就是它该被删的理由。
