#!/usr/bin/env node
/**
 * 发版预检（scripts/verify-release-clean.mjs）的夹具。
 *
 * 两部分：
 *   1. 纯函数 zrRefTagCheck 的判定矩阵——抠真实实现来跑（同 test-derive 手法），
 *      守的是「workflow_dispatch 跑在分支上时 GITHUB_REF_NAME 是分支名，
 *      拿它当 tag 比会把『只跑门禁，不发布』那条手动路径判死」；
 *   2. 端到端：在临时仓里跑真正的脚本，验四种 ref 形状 + 内容漂移的拦截。
 *
 * 第 2 部分为什么必须有：verify:release **不在 verify:all 里**（它按设计要拦脏树，
 * 不能进日常门禁），所以脚本自身接线出错时 npm test 是绿的——2026-11-28 改 ref 判定
 * 就漏了一个「结尾还在引用已删变量」的错，直到实跑才炸。
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = join(root, 'scripts/verify-release-clean.mjs')
const VERSION = '1.2.3'

const results = []
const ok = (name, cond, detail) => {
  results.push({ name, pass: !!cond, detail })
  if (!cond) process.exitCode = 1
}

// ---------- 1. 纯函数：抠真实实现来跑 ----------
const src = readFileSync(SCRIPT, 'utf8')
const grabFn = (name) => {
  const i = src.indexOf('function ' + name + '(')
  if (i < 0) throw new Error('找不到 function ' + name)
  const open = src.indexOf('{', i)
  let depth = 0, j = open, inS = false, esc = false
  for (; j < src.length; j++) {
    const c = src[j]
    if (inS) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inS = false; continue }
    if (c === '"') { inS = true; continue }
    if (c === '{') depth++
    else if (c === '}') { depth--; if (depth === 0) { j++; break } }
  }
  return src.slice(i, j)
}
const zrRefTagCheck = new Function('return (' + grabFn('zrRefTagCheck') + ')')()

ok('分支 ref（branch/ci/actions-v7）不判死',
  zrRefTagCheck('branch', 'ci/actions-v7', '0.6.46') === null)
ok('分支 ref（branch/main）不判死',
  zrRefTagCheck('branch', 'main', '0.6.46') === null)
ok('refType=branch 时即使 ref 名像版本号也不拦',
  zrRefTagCheck('branch', 'v0.6.45', '0.6.46') === null)
ok('tag 且版本一致放行',
  zrRefTagCheck('tag', 'v0.6.46', '0.6.46') === null)
ok('tag 不带 v 前缀也能比',
  zrRefTagCheck('tag', '0.6.46', '0.6.46') === null)
const bad = zrRefTagCheck('tag', 'v0.6.45', '0.6.46')
ok('tag 且版本不一致被拦下',
  typeof bad === 'string' && bad.indexOf('0.6.45') >= 0 && bad.indexOf('0.6.46') >= 0, bad)
ok('无 ref 名不判死', zrRefTagCheck('', '', '0.6.46') === null)
ok('无 refType + 分支名不判死', zrRefTagCheck('', 'main', '0.6.46') === null)
ok('无 refType + 版本号形状且一致放行', zrRefTagCheck('', 'v0.6.46', '0.6.46') === null)
const localBad = zrRefTagCheck('', 'v0.6.45', '0.6.46')
ok('无 refType + 版本号形状且不一致被拦下', typeof localBad === 'string', localBad)

// ---------- 2. 端到端：临时仓里跑真脚本 ----------
const mkRepo = () => {
  const dir = mkdtempSync(join(tmpdir(), 'zr-release-'))
  mkdirSync(join(dir, 'scripts'), { recursive: true })
  mkdirSync(join(dir, 'src'), { recursive: true })
  copyFileSync(SCRIPT, join(dir, 'scripts/verify-release-clean.mjs'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', version: VERSION }, null, 2) + '\n')
  writeFileSync(join(dir, 'src/00-core.js'), "const PVERSION = '" + VERSION + "';\n")
  writeFileSync(join(dir, 'client.js'), "const PVERSION = '" + VERSION + "';\n")
  const git = (args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' })
  git(['init', '-q'])
  git(['add', '-A'])
  git(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'])
  return dir
}

const runScript = (dir, env) => {
  const r = spawnSync(process.execPath, [join(dir, 'scripts/verify-release-clean.mjs')], {
    cwd: dir,
    encoding: 'utf8',
    env: Object.assign({}, process.env, { GITHUB_REF_NAME: '', GITHUB_REF_TYPE: '' }, env || {})
  })
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }
}

const dir = mkRepo()
try {
  const base = runScript(dir, {})
  ok('干净仓 + 无 ref → 通过', base.code === 0, base.out.slice(-200))

  const branchRef = runScript(dir, { GITHUB_REF_NAME: 'ci/actions-v7', GITHUB_REF_TYPE: 'branch' })
  ok('干净仓 + 分支 ref → 通过（干跑路径不再被判死）', branchRef.code === 0, branchRef.out.slice(-200))

  const badTag = runScript(dir, { GITHUB_REF_NAME: 'v9.9.9', GITHUB_REF_TYPE: 'tag' })
  ok('真 tag 且版本不对 → 拦下', badTag.code === 1 && badTag.out.indexOf('不一致') >= 0, badTag.out.slice(-160))

  const goodTag = runScript(dir, { GITHUB_REF_NAME: 'v' + VERSION, GITHUB_REF_TYPE: 'tag' })
  ok('真 tag 且版本对 → 通过', goodTag.code === 0, goodTag.out.slice(-200))

  // 内容漂移：同长度改版本号 + 把 mtime 改回去 —— git 的 stat 缓存会放过它，
  // 预检必须靠内容哈希抓住（这正是这个脚本存在的理由）。
  const pkgPath = join(dir, 'package.json')
  const st = statSync(pkgPath)
  writeFileSync(pkgPath, JSON.stringify({ name: 'x', version: '1.2.4' }, null, 2) + '\n')
  utimesSync(pkgPath, st.atime, st.mtime)
  const drift = runScript(dir, {})
  ok('同长度内容漂移（mtime 还原）→ 被内容哈希抓住',
    drift.code === 1 && drift.out.indexOf('与 HEAD 内容不一致') >= 0, drift.out.slice(-200))
} finally {
  rmSync(dir, { recursive: true, force: true })
}

const passed = results.filter((r) => r.pass).length
for (const r of results) {
  console.log((r.pass ? 'ok    ' : 'FAIL  ') + r.name + (r.detail ? '  — ' + String(r.detail).replace(/\s+/g, ' ').slice(0, 160) : ''))
}
console.log('OK    发版预检：' + passed + ' / ' + results.length + ' 例通过')
if (passed !== results.length) process.exitCode = 1
