#!/usr/bin/env node
/**
 * git-guard：.git 元数据消失事故的「自动取证 + 自动修复」护栏。
 *
 * 背景见 docs/git-integrity.md：这台机器上反复出现「.git 目录还在，但
 * HEAD / config / index / logs / hooks / description / info / ORIG_HEAD 全没了，
 * 只剩 objects/ 与 refs/」。历史从不丢，所以修复只需重建元数据。
 *
 * 与 git-doctor 的分工：
 *   git-doctor.mjs  诊断（exit 1）或人工 --fix；门禁里保留它做「看见问题」。
 *   git-guard.mjs   一旦命中同一签名就**先落证据、再就地修好**，让损坏不再中断工作。
 *
 * 用法：
 *   node scripts/git-guard.mjs                 # 值守：健康则静默退出 0；命中则取证+修复
 *   node scripts/git-guard.mjs --root <dir>    # 指定仓库根（自测用）
 *   node scripts/git-guard.mjs --dry-run       # 只取证不修复
 *
 * 退出码：0 健康或已修好 / 1 命中但修复失败（或 --dry-run 命中）
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const argOf = (name, fallback) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}
const ROOT = resolve(argOf('--root', join(HERE, '..')))
const DRY = argv.includes('--dry-run')
const GIT_DIR = join(ROOT, '.git')

// 事故签名：这些顶层条目在两次事故里成组消失，objects/ 与 refs/ 存活。
const META = ['HEAD', 'config', 'index', 'logs', 'hooks', 'description', 'info', 'ORIG_HEAD']
const CRITICAL = ['HEAD', 'config', 'index']

function run(args, cwd) {
  try {
    const out = execFileSync('git', args, { cwd: cwd || ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { ok: true, out: out.trim() }
  } catch (e) {
    return { ok: false, out: '', err: String(e.stderr || e.stdout || e.message || '').trim() }
  }
}

function stamp(p) {
  try { return statSync(p).mtime.toISOString() } catch { return null }
}

function snapshot() {
  const present = []
  const missing = []
  for (const name of META) (existsSync(join(GIT_DIR, name)) ? present : missing).push(name)
  let top = []
  try { top = readdirSync(GIT_DIR).filter((n) => !n.startsWith('.')) } catch { top = [] }
  let objects = 0
  const count = (dir) => {
    try {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        if (ent.isDirectory()) count(join(dir, ent.name))
        else objects += 1
      }
    } catch { /* 读不到按 0 */ }
  }
  count(join(GIT_DIR, 'objects'))
  return {
    missing,
    present,
    top,
    objects,
    gitDirMtime: stamp(GIT_DIR),
    presentMtimes: Object.fromEntries(present.map((n) => [n, stamp(join(GIT_DIR, n))])),
    refs: (() => { try { return readdirSync(join(GIT_DIR, 'refs', 'heads')) } catch { return [] } })(),
    head: run(['rev-parse', '--short', 'HEAD']).out || null,
    tracked: (() => { const r = run(['ls-files']); return r.ok && r.out ? r.out.split('\n').length : 0 })(),
  }
}

function remoteUrl() {
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    const url = String((pkg.repository && pkg.repository.url) || '')
    const m = /github\.com[/:]([^/]+)\/([^/.]+)/.exec(url)
    if (m) return 'git@github.com:' + m[1] + '/' + m[2] + '.git'
  } catch { /* 没有就跳过 origin */ }
  return ''
}

function writeIncident(snap) {
  const at = new Date()
  const id = at.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  const dir = join(ROOT, 'docs', 'git-incidents')
  const body = {
    at: at.toISOString(),
    detectedBy: 'scripts/git-guard.mjs',
    missing: snap.missing,
    present: snap.present,
    presentMtimes: snap.presentMtimes,
    gitDirMtime: snap.gitDirMtime,
    topLevel: snap.top,
    objects: snap.objects,
    refs: snap.refs,
    head: snap.head,
    tracked: snap.tracked,
    note: '删除发生在 gitDirMtime 与本文件写入之间；objects/refs 存活说明历史未丢。',
  }
  try {
    mkdirSync(dir, { recursive: true })
    const file = join(dir, id + '.json')
    writeFileSync(file, JSON.stringify(body, null, 2) + '\n', 'utf8')
    return file
  } catch {
    return null
  }
}

function repair(branch) {
  const steps = []
  steps.push(['git init -q', run(['init', '-q']).ok])
  steps.push(['symbolic-ref HEAD refs/heads/' + branch, run(['symbolic-ref', 'HEAD', 'refs/heads/' + branch]).ok])
  const url = remoteUrl()
  if (url) {
    const has = run(['remote', 'get-url', 'origin']).ok
    const r = has ? run(['remote', 'set-url', 'origin', url]) : run(['remote', 'add', 'origin', url])
    steps.push([(has ? 'remote set-url ' : 'remote add ') + 'origin', r.ok])
  }
  steps.push(['git reset -q（按 HEAD 重建 index）', run(['reset', '-q']).ok])
  steps.push(['branch -u origin/' + branch, run(['branch', '-u', 'origin/' + branch, branch]).ok])
  return steps
}

const snap = snapshot()
const criticalGone = CRITICAL.filter((n) => snap.missing.includes(n))

if (criticalGone.length === 0) {
  // 健康：默认完全静默，避免在 20 步门禁里刷屏。
  process.exit(0)
}

const tag = (t, s) => console.log(t.padEnd(5, ' ') + ' ' + s)
tag('WARN', '命中 .git 元数据消失事故：缺 ' + snap.missing.join(' / '))
tag('INFO', 'objects 文件数 ' + snap.objects + ' / 分支 ' + (snap.refs.join(', ') || '(空)') + ' / HEAD ' + (snap.head || '(读不到)'))
const record = writeIncident(snap)
tag('INFO', record ? '现场已落盘：' + record : '现场落盘失败（docs/git-incidents 不可写）')

if (DRY) {
  tag('HINT', '--dry-run：未修复。执行 node scripts/git-guard.mjs 就地修好')
  process.exit(1)
}

const branch = snap.refs.includes('main') ? 'main' : snap.refs[0]
if (!branch) {
  tag('FAIL', '.git/refs/heads 下没有分支引用，无法确定 HEAD 目标；请重新 clone 后比对')
  process.exit(1)
}

for (const [what, ok] of repair(branch)) tag(ok ? 'OK' : 'FAIL', what)
const after = snapshot()
if (criticalGone.some((n) => after.missing.includes(n))) {
  tag('FAIL', '修复后仍缺：' + after.missing.join(' / '))
  process.exit(1)
}
tag('OK', '已就地修复：HEAD ' + (after.head || '?') + '，已跟踪 ' + after.tracked + ' 个文件')
tag('HINT', '跑 git status / npm run verify:all 复核，再 git push 与远端比对')
process.exit(0)
