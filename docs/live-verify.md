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

## 采集基线

1. 视口设成 **1264×771**（`Emulation.setDeviceMetricsOverride`），打开 设置 → Zhuoer 主题；
2. 浅色态：`截 .zp-root` → `visual/current/settings-light.png`；
   `document.querySelectorAll('.zp-root style')` + id 以 `dsh-zhuoer-theme` 开头的 `<style>`，
   按 DOM 序用 `/*===*/` 拼接 → `visual/css-current/plugin-light.css`；
3. 点面板里的「深色」重复一次 → `settings-dark.png` / `plugin-dark.css`；
4. 提升为基线：`node scripts/verify-visual.mjs --capture visual/current`、
   `node scripts/verify-css-snapshot.mjs --capture visual/css-current`。

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
