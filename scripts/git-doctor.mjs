#!/usr/bin/env node
/**
 * git-doctor：`.git` 顶层元数据消失事故的诊断与一键修复。
 *
 * 2026-11-25 这台机器上出现过两次同一症状：git 命令报
 * `fatal: not a git repository`，但 `.git/objects` 与 `.git/refs` 完好，
 * 丢的是 HEAD / config / index / logs / hooks。历史没丢，所有 git 命令罢工。
 *
 * 归因未完成（见 docs/git-integrity.md）：已排除本仓脚本与环境误操作，
 * 最强线索是「火绒安全的主动防御/勒索防护」与损坏时间点重合，但证据不足。
 * 所以本脚本不做归因，只保证再发生时：能立刻判定、能一条命令恢复、
 * 并把现场数字打出来便于事后比对。
 *
 * 用法：
 *   node scripts/git-doctor.mjs          # 只诊断
 *   node scripts/git-doctor.mjs --fix    # 诊断并修复（只重建元数据，不动 objects/refs）
 *
 * 退出码：0 健康或已修复 / 1 有问题（或修复失败）
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const FIX = process.argv.includes('--fix')
const gitDir = join(root, '.git')

function run(args) {
  try {
    const out = execFileSync('git', args, {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { ok: true, out: out.trim() }
  } catch (e) {
    const err = (e.stderr || e.stdout || e.message || '').toString().trim()
    return { ok: false, out: '', err }
  }
}

function countFiles(dir) {
  let n = 0
  try {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      n += ent.isDirectory() ? countFiles(join(dir, ent.name)) : 1
    }
  } catch { /* 目录不可读就当 0 */ }
  return n
}

function branches() {
  try { return readdirSync(join(gitDir, 'refs', 'heads')).filter((n) => !n.startsWith('.')) } catch { return [] }
}

function remoteUrl() {
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    const m = /github\.com[/:]([^/]+)\/([^/.]+)/.exec(String(pkg.repository && pkg.repository.url ? pkg.repository.url : ''))
    if (m) return 'git@github.com:' + m[1] + '/' + m[2] + '.git'
  } catch { /* 用不到就空着 */ }
  return ''
}

function inspect() {
  const problems = []
  const info = { objects: 0, refs: branches(), head: '', tracked: 0 }
  if (!existsSync(gitDir)) {
    problems.push('.git 目录不存在（这种情况没法本地修复，只能重新 clone）')
    return { problems, info }
  }
  for (const f of ['HEAD', 'config', 'index']) {
    if (!existsSync(join(gitDir, f))) problems.push('.git/' + f + ' 缺失')
  }
  if (!existsSync(join(gitDir, 'refs', 'heads'))) problems.push('.git/refs/heads 缺失')
  info.objects = existsSync(join(gitDir, 'objects')) ? countFiles(join(gitDir, 'objects')) : 0
  const rev = run(['rev-parse', '--short', 'HEAD'])
  if (rev.ok) info.head = rev.out
  const ls = run(['ls-files'])
  if (ls.ok) info.tracked = ls.out ? ls.out.split('\n').length : 0
  return { problems, info }
}

function repair(branch) {
  const steps = []
  const url = remoteUrl()
  steps.push(['git init -q', run(['init', '-q']).ok])
  steps.push(['symbolic-ref HEAD refs/heads/' + branch, run(['symbolic-ref', 'HEAD', 'refs/heads/' + branch]).ok])
  if (url) {
    const hasOrigin = run(['remote', 'get-url', 'origin']).ok
    const r = hasOrigin ? run(['remote', 'set-url', 'origin', url]) : run(['remote', 'add', 'origin', url])
    steps.push([(hasOrigin ? 'remote set-url ' : 'remote add ') + 'origin', r.ok])
  }
  steps.push(['git reset -q（按 HEAD 重建 index）', run(['reset', '-q']).ok])
  const up = run(['branch', '-u', 'origin/' + branch, branch])
  steps.push(['branch -u origin/' + branch, up.ok])
  return steps
}

const { problems, info } = inspect()
const line = (tag, text) => console.log(tag.padEnd(6, ' ') + ' ' + text)

console.log('[git-doctor] 仓库：' + root)
line('INFO', 'objects 文件数 ' + info.objects + ' / 分支 ' + (info.refs.join(', ') || '(空)') + ' / HEAD ' + (info.head || '(读不到)'))

if (!problems.length) {
  line('OK', '元数据完整，git 可用；已跟踪文件 ' + info.tracked + ' 个')
  process.exit(0)
}

for (const p of problems) line('FAIL', p)
line('INFO', '历史对象仍在 .git/objects，缺的是元数据 —— 通常可以原地修复，不会丢提交')

if (!FIX) {
  line('HINT', '确认后执行：node scripts/git-doctor.mjs --fix')
  process.exit(1)
}

const branch = info.refs.includes('main') ? 'main' : info.refs[0]
if (!branch) {
  line('FAIL', '.git/refs/heads 下没有分支引用，无法确定 HEAD 该指向谁；请重新 clone 后比对')
  process.exit(1)
}

line('INFO', '开始修复，HEAD 目标分支 ' + branch)
for (const [what, ok] of repair(branch)) line(ok ? 'OK' : 'FAIL', what)

const after = inspect()
if (after.problems.length) {
  for (const p of after.problems) line('FAIL', '修复后仍存在：' + p)
  process.exit(1)
}
line('OK', '修复完成：HEAD ' + (after.info.head || '?') + '，已跟踪 ' + after.info.tracked + ' 个文件')
line('HINT', '接着跑 git status / npm run verify:all 复核，再 git push 与远端比对')
process.exit(0)
