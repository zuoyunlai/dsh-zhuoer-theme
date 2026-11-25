# .git 元数据消失事故（2026-11-25，两次）

本文件是这台机器上 `.git` 元数据被清空的现场记录与处置约定。它不是版本说明，
但比版本说明更重要：不写下来，下次还会当成「git 莫名其妙坏了」重来一遍。

## 症状

`git status` / `git log` 一律报：

```
fatal: not a git repository (or any of the parent directories): .git
```

而 `.git` 目录**还在**，里面只剩 `.git/objects`、`.git/refs`（第二次还有 `.git/ORIG_HEAD`）。
丢的是元数据：`HEAD`、`config`、`index`、`logs`、`hooks`。

关键点：**历史没丢**。`objects` 与 `refs` 完好 → `git fsck` 退出码 0，
所有提交、tag、远端追踪都在。恢复只需要重建元数据，不需要重新 clone。

## 时间线（第二次）

| 时刻 | 事件 | 证据 |
|---|---|---|
| ~11:51 | 提交 `6063fc8`（0.6.2 带 icon 字段那版）成功 | `git log` 可见 |
| 11:51 | `C:/ProgramData/Huorong/Sysdiag/log` 目录 mtime 变为 11:51 | `ls -la` 目录时间戳 |
| 11:57 左右 | `git add/commit` 报 `fatal: not a git repository` | 该次命令输出 |
| 11:58:55 | 手工重建元数据（init / symbolic-ref / remote / reset） | 各文件 mtime |
| 12:07 | 复核通过：`fsck` exit 0，81 文件，随后 push 成功 | `verify:release` |

第一次出现时间更早，症状完全一致（当时也只留下 `objects/` 与 `refs/`）。

## 已排除

- **本仓脚本**：`scripts/*.mjs` 与 `build.mjs` 里没有任何 `rm`/`unlink`/`.git` 操作（grep 为 0 命中）。
- **npm 全链路**：布署 canary（`.git/.canary`）后逐个跑 `node build.mjs`、`verify-build`、
  `verify-assets`、`verify-release-clean`、`npm pack --dry-run`、`git status`、`git add -A`，
  canary 与 `HEAD/config/index` 全部存活。
- **OneDrive**：`OneDrive=C:\Users\Zuoyunlai\OneDrive`，`E:\Documents` 不在同步根内；`E:\` 与
  `E:\Documents` 下也没有 `.dropbox`/`desktop.ini` 之外的同步标记。
- **git 全局配置**：无 `init.templateDir`、无 `core.hooksPath`，不存在全局钩子。

## 未定论（最强嫌疑）

进程表里有 **火绒安全**：`HipsDaemon.exe`、`HipsTray.exe`（另有 `secd.exe`、Adobe `CoreSync.exe`）。
火绒的主动防御 / 勒索防护会回滚它认为异常的批量文件改动，而受损时间点（11:51）
与它的日志目录 mtime 变化**重合**。

但这是**相关性，不是因果**：

- `Sysdiag/log` 下的 `hipsdaemon.log` 最后写入是 10:11，不是 11:51，日志里也没有本仓路径；
- 火绒的拦截记录在 SQLite（`db/hips.db`、`behav.db`）与 GUI 安全日志里，命令行读不到内容；
- NTFS USN 日志能给出确切删除记录，但读取需要管理员：
  `fsutil usn readjournal E: csv` → `Error 5: Access is denied`。

## 处置

诊断与修复都走一条命令：

```bash
node scripts/git-doctor.mjs          # 诊断：缺哪个元数据、objects/分支还在不在
node scripts/git-doctor.mjs --fix    # 修复：init → symbolic-ref → remote → reset → 追踪
```

修复**只重建元数据**，不碰 `objects`/`refs`，所以不会丢提交。修完必须复核：

```bash
git fsck --no-progress      # exit 0；dangling 属正常（amend/rebase 留下的孤儿对象）
npm run verify:all          # 仓库门禁全绿
git push origin main        # 与远端比对，确认没有本地改动被吞
```

## 下次再发生时，先收集这四样

1. `node scripts/git-doctor.mjs` 的输出（objects 文件数、分支、HEAD）；
2. `ls -la --time-style=full-iso .git`（哪些文件还在、mtime 是多少）；
3. 火绒 GUI → 安全日志，看 11:51 前后有没有针对 `E:\Documents\...\dsh-openclaw-skin` 的拦截；
4. 有管理员权限时导 USN 日志并按路径过滤，能直接指出是哪个进程删的。

在 1～4 拿到任何一条能指向具体进程的证据之前，**不要**把它写成「已知原因」。
