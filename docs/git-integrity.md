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

## 第 3 次（2026-11-25 14:56–15:04，仓库改名后）

- **现象**：`verify:all` 里的 `verify:git` 报 `.git/HEAD`、`.git/config`、`.git/index` 全缺；
  `git log` 直接报 `not a git repository`。
- **还在的**：`.git/objects`（550 个对象文件）、`.git/refs/heads/main`（715dc4e）、
  `.git/packed-refs`、`.git/ORIG_HEAD`（11:58 写的）——丢的仍然只是**元数据三件套**。
- **修复**：`node scripts/git-doctor.mjs --fix`，一条命令搞定（git init / symbolic-ref /
  remote add / reset 重建 index / branch -u），修完 HEAD=715dc4e，101 个跟踪文件，工作树 9 个未提交改动原样还在。
- **新信息**：`.git` 目录本身 mtime 14:58，`objects` 14:56——说明删除发生在 14:56–14:58 之间，
  而那段时间我在跑「截图/浏览器验证」，没有碰过 .git。这更支持「外部进程干预」而不是「git 命令写坏」。
- **仍然没有**：能指向具体进程的证据（火绒日志、USN 日志都需要管理员权限/图形界面）。
  所以**结论照旧不写死原因**；可以确定的是「objects 保住 = 恢复成本一条命令」，这条已固化进 git-doctor。

## 第 4 次（2026-11-26 02:11 前后）

- 症状一致：git 报 not a git repository，objects/ 与 refs/ 完好。
- 修复：node scripts/git-doctor.mjs --fix。
- 当时正在做的事与本仓无关，未跑 git 写操作。

## 第 5 次（2026-11-26 15:2x，门禁报出）

- verify:all 的 git-doctor 报 .git/HEAD / config / index 全缺。
- 15:43:10 修复。HEAD、config、logs、hooks、description、info、ORIG_HEAD 的创建时间
  全部落在这一秒，可作为「修复时刻」的指纹。
- .git 目录自身 CreationTime 至今仍是 11-24 21:21:41（首次 init 的时刻），说明
  **.git 外壳从未被整体替换或重建**；每次事故清掉的只是顶层元数据条目。

## 2026-11-26 晚间取证（不需要管理员的部分已穷尽）

| 假设 | 取证方式 | 结论 |
|---|---|---|
| 本仓脚本删的 | grep 全仓 rmSync / unlinkSync / rm -rf / rmdir 与 .git 字面量 | **0 命中**，排除 |
| 已装插件删的 | 扫 profiles 下所有 rmSync 与 spawn git；dsh-remote、dshmarket、dsh-better-sidebar 逐条看 | 只有 rev-parse / symbolic-ref 等**只读**调用，排除 |
| DSH 沙箱写被回滚 | 沙箱内 touch .git/.probe-sandbox，宿主立刻可见、rm 后立刻消失 | 写透正常，排除 |
| 定时任务或清理软件 | 全量非微软计划任务 + ASC.exe.log 清理记录 | ASC 清理记录停在 11-15，无命中；无相关计划任务 |
| 磁盘或文件系统损坏 | Get-Volume、Ntfs 98 事件、Get-PhysicalDisk | E: HealthStatus=Healthy、OperationalStatus=OK，排除 |
| 云同步或网盘 | Win32_LogicalDisk（E: DriveType=3 本地固定盘）、Target/LinkType（链路无 reparse point）、OneDrive 根不在 E: | 排除 |
| 回收站可恢复 | 解析 E: 回收站的 $I 记录 | **$I 记录 0 条** → 是程序化 unlink，不是资源管理器删除 |
| 火绒删除或隔离 | Quarantine 目录、QuarantineEx.db、log.db 的 HrLogV3_60 共 1034 条、hipsdaemon.log 解码 | 全是 sysprot 自保护与 c_malinfo 云端恶意 URL，**无任何文件删除事件**；火绒没动过它们 |
| 仓库被整体替换 | .git 与 objects 的 CreationTime 恒为 11-24 21:21 | 外壳未变，仅选择性丢失顶层条目 |

**仍未拿到**：能指名到进程的那一条。NTFS USN 日志（fsutil usn readjournal E:）需要管理员；
火绒行为库与 GUI 安全日志同样读不到。所以**结论不写死原因**——这条纪律不变。

**新增的特征结论**（比原因更可靠，可据此设计防护）：事故签名恒定为
**「顶层元数据成组消失、objects/ 与 refs/ 必然存活」**。因此防护只需做两件事：
① 命中即取证（时间窗、存活项、mtime）；② 就地重建元数据。

## 自动护栏（2026-11-26 起）

scripts/git-guard.mjs 把上面两件事自动化：

```bash
node scripts/git-guard.mjs            # 健康则完全静默（exit 0）；命中则先落证据再修好
node scripts/git-guard.mjs --dry-run  # 只取证不修复（exit 1）
```

- **健康时零输出**，放在 verify:all 最前面不会污染 20 步门禁日志。
- 命中时把现场写进 docs/git-incidents/<UTC 时间戳>.json（缺哪些、哪些还在、存活项 mtime、
  .git 目录 mtime、objects 数、分支、HEAD），然后 init → symbolic-ref → remote → reset →
  branch -u 原地修好。
- 与 git-doctor 的分工：doctor 负责**报告**（门禁里保留它，照旧能看到问题），guard 负责
  **让问题不再阻断工作**。两者都只重建元数据，不碰 objects/refs。
- 已在一次性沙箱仓库做过破坏注入验证：删掉 8 个顶层条目后 guard 正常取证并修好（HEAD 复原、
  跟踪文件数正确）；健康路径连跑两次均静默 exit 0。
