# 榜单投递台账 / Catalog submissions

记录 `dsh-zhuoer-theme` 向各 DSH 插件清单的投递。**当次记录、不事后补写**。

插件仓库：https://github.com/zuoyunlai/dsh-zhuoer-theme ｜ 投递时版本：`0.5.9`（npm `latest` + GitHub Release `v0.5.9`）

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
