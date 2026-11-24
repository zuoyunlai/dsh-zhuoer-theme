# 主题字体（随插件分发）

共 23 个 `.woff2`：20 个西文（14 个族）+ 3 个中文子集。

- 早期 8 个族（14 个文件）来自上游主题的自托管字体，**latin 子集原样搬运、未做任何修改**。
- 后补的 6 个族从 Google Fonts 下载 latin 子集，同样未改字形。
- 全部为**变量字体**（一支文件覆盖多档字重），所以 `@font-face` 统一声明 `font-weight:100 900`。

## 西文字体

| 字体族 | 类型 | 用途 | 文件 |
|---|---|---|---|
| Geist | 无衬线 | 内置主题主体 | geist-latin |
| Space Grotesk | 无衬线 | Absolutely / Miami | space-grotesk-latin |
| DM Sans | 无衬线 | Dash / Rose、风格预设默认 | dm-sans-latin / -italic |
| IBM Plex Sans | 无衬线 | Tide | ibm-plex-sans-latin / -italic |
| Atkinson Hyperlegible Next | 无衬线 | Beacon（可读性向） | atkinson-hyperlegible-next-latin / -italic |
| **Instrument Sans** | 无衬线 | **DSH 基础字体栈** | instrument-sans-latin |
| **Inter** | 无衬线 | 通用 UI / 自定义主题 | inter-latin |
| **Manrope** | 无衬线 | 品牌字（`--dsw-font-family-brand`） | manrope-latin |
| JetBrains Mono | 等宽 | CRT / Phosphor、`__mono__` | jetbrains-mono-latin / -italic |
| **Geist Mono** | 等宽 | 等宽备选 | geist-mono-latin |
| **Fira Code** | 等宽 | 等宽备选（带连字） | fira-code-latin |
| Lora | 衬线 | Manuscript / Absolutely 聊天正文 | lora-latin / -italic |
| Fraunces | 衬线 | Dash 聊天正文 | fraunces-latin / -italic |
| **Source Serif 4** | 衬线 | 长文阅读 | source-serif-4-latin |

粗体为本次新增（约 277 KB）。Manrope 同时接替了原来的 Montserrat——那个族从未打包，
`--dsw-font-family-brand` 一直静默回落到系统字体。

## 中文子集（自建）

| 字体族（插件内名） | 来源 | 内容 | 大小 |
|---|---|---|---|
| Zhuoer Sans SC | Noto Sans SC VF（系统安装） | GB2312 一级汉字 3755 + 中文标点符号 | 1.2 MB |
| Zhuoer Serif SC | Noto Serif SC VF（系统安装） | 同上 | 1.6 MB |
| Zhuoer Kai SC | LXGW WenKai Regular 1.530（霞鹜文楷） | 同上字表，实收 3926 字（缺 4 个韩文声调符号 U+302E/302F/3031/3032） | 0.9 MB |

- 用 `fontTools` 子集化（`--flavor=woff2 --layout-features=* --desubroutinize`）；Sans/Serif 保留 wght 可变轴，楷体是静态单字重（`font-weight:400`）。
- **只含中文字形、不含拉丁**，所以西文永远由前面的主题字体渲染，中文才落到这里。
- 族名取 `Zhuoer Sans SC` / `Zhuoer Serif SC` / `Zhuoer Kai SC`，避免与系统已装的 `Noto Sans SC` 等同名冲突。
- 楷体的取字体路径不同：GitHub Releases 在本机不可达，改为从 npm 包 `@callmebill/lxgw-wenkai-web@1.530.0`（同版本分片 woff2，无整包 TTF）取 `lxgwwenkai-regular/` 下 30 个命中码位的分片，逐个按字表子集化后 `fontTools.merge` 合并，再整体子集化输出。复现脚本见 `scripts/_rebuild-kai.py`。
- 超出字表范围的生僻字会继续回落到系统 `Noto Sans SC` / `PingFang SC` / `Microsoft YaHei`。

## 许可

全部为 **SIL Open Font License 1.1**（允许嵌入、再分发与商用，须保留各字体族的版权声明与许可文本）。

- 西文字体未改字形；如再分发本插件，请一并保留本说明与 SIL OFL 1.1 声明。
- 若对外发布，建议把各字体族原始 `OFL.txt` 一并放入本目录（目前未随包提供）。

## 中文字形回落

西文字体不含中文字形，插件在字体栈末端统一接：

- 无衬线：`"Zhuoer Sans SC", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", "DengXian", sans-serif`
- 衬线：`"Zhuoer Serif SC", "Noto Serif SC", "Songti SC", "SimSun", serif`
- 等宽：`"Sarasa Mono SC", "Zhuoer Sans SC", "Noto Sans SC", "Microsoft YaHei", ui-monospace, monospace`
- 楷体不进这三条链：它只在自定义主题的「正文字体 / 聊天字体」下拉里选（选项值 `DM Sans, Zhuoer Kai SC`，西文走 DM Sans、中文走楷体），不改变任何默认外观。

因此中文使用随包子集，缺失时依次回落到本机的思源黑体/宋体、苹方、微软雅黑、等线/宋体。
