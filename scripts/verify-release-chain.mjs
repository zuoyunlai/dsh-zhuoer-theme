#!/usr/bin/env node
/**
 * 发布链核对：本地 tag → 远端 main → npm registry → GitHub Release 四段是否对得上。
 * verify:release 只查「工作区干净 + 版本三元组」，看不见「tag 打错提交」「npm 还在队列」。
 * 退出码：0 全对 / 3 待落地 / 2 硬失败
 */
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2)
const offline = args.includes('--offline')
const vi = args.indexOf('--version')
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const version = vi !== -1 && args[vi + 1] ? args[vi + 1] : pkg.version
const tag = 'v' + version
const REPO = 'zuoyunlai/dsh-zhuoer-theme'
const ok = [], bad = [], pending = []

function git(a) {
  try { return execFileSync('git', a, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch (e) { return '' }
}
function isAncestor(a, b) {
  if (!a || !b) return false
  try { execFileSync('git', ['merge-base', '--is-ancestor', a, b], { stdio: 'ignore' }); return true } catch (e) { return false }
}

const tagSha = git(['rev-list', '-n', '1', tag])
const head = git(['rev-parse', 'HEAD'])
if (!tagSha) bad.push('本地没有 tag ' + tag)
else if (!isAncestor(tagSha, head)) bad.push('tag ' + tag + ' 不指向 HEAD 的祖先')
else ok.push('tag ' + tag + ' -> ' + tagSha.slice(0, 7) + '（在 HEAD 历史内）')

const remoteMain = git(['rev-parse', 'origin/main'])
if (!remoteMain) bad.push('本地没有 origin/main，先 git fetch')
else if (tagSha && isAncestor(tagSha, remoteMain)) ok.push('tag 提交已在 origin/main 上（' + remoteMain.slice(0, 7) + '）')
else bad.push('tag 提交不在 origin/main 上——远端没有这次发布')

if (offline) { ok.push('--offline：跳过 registry 与 Release 检查') }
else {
  let pack = null
  try {
    const res = await fetch('https://registry.npmjs.org/' + encodeURIComponent(pkg.name), { headers: { 'cache-control': 'no-cache' } })
    if (res.ok) pack = await res.json()
  } catch (e) { /* 网络失败按待落地 */ }
  if (!pack) pending.push('registry 取不到 packument，无法判断 ' + version)
  else if (pack.versions && pack.versions[version]) {
    const dist = pack.versions[version].dist || {}
    ok.push('npm 已有 ' + version + '（shasum ' + String(dist.shasum || '?').slice(0, 12) + '）')
    const latest = pack['dist-tags'] && pack['dist-tags'].latest
    if (latest === version) ok.push('dist-tags.latest = ' + latest)
    else pending.push('dist-tags.latest 仍是 ' + String(latest))
  } else pending.push('npm 还没有 ' + version + '（CI 可能已提交，registry 处理需几分钟到一小时）')
  try {
    const res = await fetch('https://api.github.com/repos/' + REPO + '/releases/tags/' + tag, { headers: { accept: 'application/vnd.github+json' } })
    if (res.ok) ok.push('GitHub Release ' + tag + ' 存在')
    else if (res.status === 404) pending.push('GitHub Release ' + tag + ' 还没建')
    else pending.push('GitHub Release 查询返回 ' + res.status)
  } catch (e) { pending.push('GitHub Release 查询失败（网络）') }
}

for (const l of ok) console.log('OK      ' + l)
for (const l of pending) console.log('PENDING ' + l)
for (const l of bad) console.error('FAIL    ' + l)
if (bad.length) { console.error('\n发布链有硬失败：' + bad.length + ' 项'); process.exit(2) }
if (pending.length) { console.log('\n发布链未收口：' + pending.length + ' 项待落地（不是失败）'); process.exit(3) }
console.log('\n发布链一致：tag / main / npm / Release 对齐（' + version + '）')