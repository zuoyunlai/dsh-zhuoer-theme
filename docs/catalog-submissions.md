# 榜单投递台账 / Catalog submissions

记录 `dsh-zhuoer-theme` 向各 DSH 插件清单的投递。**当次记录、不事后补写**。

插件仓库：https://github.com/zuoyunlai/dsh-zhuoer-theme ｜ 投递时版本：`0.6.20`（npm `latest` + GitHub Release `v0.6.20`）

## 零、自建索引源（2026-11-25 起）

DSH 不内置索引源，所以「被市场收录」的可控路径是自己发布一份索引文件。本仓的 `market/index.json` 已有**实测可用的公共 URL**：

```text
https://ghproxy.net/https://raw.githubusercontent.com/zuoyunlai/dsh-zhuoer-theme/main/market/index.json
```

- 内容：`market/index.json`，只列 0.6.20 / 0.6.19 / 0.6.18（跳过 0.6.11 那版面板报错的）；
- 守门：`verify:market`（schema + 与 `package.json` 交叉对账）；
- 实测：在该 profile 的「插件 → 实验性插件 → 自定义插件索引」里添加上面的 URL，「发现」出现索引标题 `卓尔主题索引` 与卡片（`Zhuoer 主题`、说明、0.6.19、作者、`已安装`）；
- 镜像副本：也推了一份到 Gitee（`https://gitee.com/zuoyunlai/dsh-zhuoer-theme-market`），但**不能直接用它的 raw 链接**——Gitee 会 302 跳到带签名的 `raw.giteeusercontent.com`，而 DSH 要求索引不经重定向返回 2xx，会报 `unexpected redirect`；
- 其他实测：`raw.githubusercontent.com` 在本网络于 Node 侧 `ECONNRESET`（curl 能通不代表宿主能通）；`gh-proxy.com` 同格式镜像可作备用。

**这不是投稿**，是自己托管；下面的一、二节才是向别人的清单投递。

## 一、本轮投递（2026-11-25）

| 榜单 | 收录方式 | 改动 | 状态 |
|---|---|---|---|
| [awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)（25.6k★，主榜） | PR 加 `data/plugins/<owner>__<repo>.yml` | `zuoyunlai__dsh-zhuoer-theme.yml`（+6） | ⏳ [#18583](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/18583) OPEN |
| [beancookie/awesome-dsh-plugin](https://github.com/beancookie/awesome-dsh-plugin) | PR：`README.md` + `README.en.md` 各一行 | 各 +1 | ⏳ [#310](https://github.com/beancookie/awesome-dsh-plugin/pull/310) OPEN |
| [kejixiaoliang/awesome-dsh-plugins](https://github.com/kejixiaoliang/awesome-dsh-plugins) | PR：`plugins/ui-themes.md` + `data/descriptions-en.json` | `ui-themes.md`(+1)、`descriptions-en.json`(+2/−1) | ⏳ [#234](https://github.com/kejixiaoliang/awesome-dsh-plugins/pull/234) OPEN |
| [Alex-Yanggg/awesome-DSH-plugin](https://github.com/Alex-Yanggg/awesome-DSH-plugin) | PR：`catalog/plugins.json` + `README.md` | `plugins.json`(+6)、`README.md`(+1) | ⏳ [#201](https://github.com/Alex-Yanggg/awesome-DSH-plugin/pull/201) OPEN —— ⚠️ 该仓库最后推送 2026-08-15，已停更约 3 个月，被 review 概率低 |

**没投的（靠 topic 自动发现，不要再手改它们的文件）**

| 榜单 | 机制 |
|---|---|
| [bruc3van/awesome-dsh-plugin-pro](https://github.com/bruc3van/awesome-dsh-plugin) | 每天自动抓 `dsh-plugin` topic 并逐个复核，写进 `data/approved.json` |
| [billLiao/awesome-dsh-plugin](https://github.com/billLiao/awesome-dsh-plugin) | 每 8 小时自动扫 topic 生成分类文件；手改会被重生成覆盖 |
| [dshworks/awesome-dsh-plugins](https://github.com/dshworks/awesome-dsh-plugins) | 定时扫 topic 进候选队列，维护者 triage 收录（CONTRIBUTING 明确 "Nothing is promoted automatically"） |
| [dataelement/awesome-dsh-workbench](https://github.com/dataelement/awesome-dsh-workbench) | **不适用**：收的是工作台类插件，门禁要求 client 注入 `dsh-desktop-workbenches` |

**前提动作**：仓库原本 `topics: []`，本轮补上 `["dsh", "dsh-plugin"]` —— 这是主榜的硬性要求，也是上面四个自动榜单唯一的发现机制。

## 二、主榜会红约 20 小时

`scripts/check-submission.mjs` 里有 `MIN_AGE_DAYS = 1`，读的是仓库 `created_at`。本仓库建于
`2026-11-24T13:21Z`，投递时只有 3.6 小时，所以 #18583 会在 **age 这一条**上红到
`2026-11-25T13:22Z` 左右。

不要因此去推空提交或关了重开：`.github/workflows/regate.yml`（每 6 小时）专门重跑「太新、
现在够天数」的 PR，checker 自己的报错文案也写着 *"No need to resubmit, push, or close and
reopen"*。

## 三、这轮踩到的三个坑

### 坑 1：锚 `\n### 标题` 会在条目和上一条之间留出空行

原文件是 `…上一条\n\n### 下一节`。用 `\n### 下一节` 做锚，匹配吃掉的是**第二个**换行，
替换后变成 `…上一条\n\n- [新条目]\n\n### 下一节` —— 新条目和列表之间多一个空行，
Markdown 会把这一条渲染成独立段落，不在列表里。diff 也因此是 +4 而不是 +2。

**改法**：锚改成一个完整的 `\n\n### 下一节`，替换成 `\n- [新条目]\n\n### 下一节`。
判据：PR 的 `additions` 必须等于预期行数，多出来的行大概率是空行。

### 坑 2：JSON 锚不要带开头的引号

`descriptions-en.json` 的最后一条是 `…builds."` 再换行 `}`。我一开始把锚写成
`"desktop (DSH 0.2.0-rc.2) and legacy Web builds."\n}` —— 那个前引号并不存在（真正的
引号是**结尾**那个闭合引号），edit 直接报 `oldText was not found`。

**判据**：改 JSON 前先把最后 2–3 行按原样打出来（含引号位置），再拼锚。

### 坑 3：同名上游 → 又差点写进别人的 fork

`kejixiaoliang/awesome-dsh-plugins` 这个名字已经被占用为 `dshworks/awesome-dsh-plugins` 的
fork（`zuoyunlai/awesome-dsh-plugins`）。按「fork 名 = 上游名」的规则会直接写错仓库。

**改法**：用 `POST /repos/<upstream>/forks -f name=<唯一名>` 指定 fork 名（本次 GitHub 先给了
`awesome-dsh-plugins-1`，再 `PATCH` 改名成 `awesome-dsh-plugins-keji`）。
**判据**：fork 完先核对返回的 `parent.full_name`，**判同靠 parent，不靠名字**。

## 四、其它记录

- `descriptions-en.json` 与 `catalog/plugins.json` 都是**文本级插入**，没有 `JSON.stringify`
  重新序列化 —— 本轮三个数据文件的实际 diff 分别是 +2/−1、+6、+2/−1，没有格式噪音。
- keji 那份我**没有写 star 数**（拿不到可靠数字，不编），PR 里已说明留给维护者整理。
\n\n## 四、0.6.19 发版后的收录状态（2026-11-26）\n\n| 榜单 | 状态 | 证据 |\n|---|---|---|\n| awesome-dsh-plugin（主榜） | **PR 仍开着，未收录** | [#18583](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/18583) 、； 在主榜 main 上仍是 404，README 里也搜不到本插件 |\n\n- 提交时踩的是仓库年龄门（，仓库建于 2026-11-24T13:21Z）；2026-11-26 已过门槛， 由  重跑后转绿。\n- 本轮同时修了条目内容：原描述写「Eleven built-in color themes / 11 套」，实际 12 套；已改为「Twelve / 12 套 + 十二套风格预设」并推送分支 （commit ）。\n- PR 正文的校验清单也同步到 0.6.19（12 套主题、224 个 token、npm latest 0.6.19、已满 1 天）。\n
## 五、0.6.19 发版后的收录状态（2026-11-26）

| 榜单 | 状态 | 证据 |
|---|---|---|
| awesome-dsh-plugin（主榜） | **PR 仍开着，未收录** | [#18583](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/18583) state=OPEN、mergeable=MERGEABLE；条目文件 `data/plugins/zuoyunlai__dsh-zhuoer-theme.yml` 在主榜 main 上仍是 404，README 里也搜不到本插件 |

- 提交时踩的是仓库年龄门（`MIN_AGE_DAYS = 1`，仓库建于 2026-11-24T13:21Z）；2026-11-26 已过门槛，`Submission gate` 由 `regate.yml` 重跑后转绿。
- 本轮同时修了条目内容：原描述写「Eleven built-in color themes / 11 套」，实际 12 套；已改为「Twelve / 12 套 + 十二套风格预设」，推送到分支 `zuoyunlai:add-dsh-zhuoer-theme`（commit `e214a99`）。
- PR 正文的校验清单同步到 0.6.19：12 套主题、224 个 token、npm latest 0.6.19、已满 1 天。
