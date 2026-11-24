#!/usr/bin/env node
/**
 * 发版预检：工作区必须与 HEAD 逐文件一致（按内容哈希，不看 stat）。
 *
 * 为什么需要它：git 的 stat 缓存会把「同长度 + mtime 未变」的编辑当成未修改，
 * `git add -A` 与 `git status` 都会静默放过。0.3.7 与 0.5.3 两次发版都栽在这里：
 * 版本号 0.3.6→0.3.7 / 0.5.1→0.5.3 长度相同，提交里仍是旧值，
 * 本地门禁全绿（它们读的是工作区），CI 才报 tag 与 package.json 不一致。
 *
 * 判据只有一条：每个已跟踪文件的内容 sha256 必须等于 `HEAD:<path>` 的 sha256。
 * 另外顺带核对 HEAD 里的版本三元组：package.json / PVERSION / 产物 client.js。
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const git = (args) => execFileSync('git', args, { cwd: root, maxBuffer: 256 * 1024 * 1024 })
const sha = (buf) => createHash('sha256').update(buf).digest('hex')

const fails = []
const drift = []

let headExists = true
try { git(['rev-parse', '--verify', 'HEAD']) } catch { headExists = false }
if (!headExists) {
  console.error('[verify:release] 仓库还没有提交，无法比对 HEAD')
  process.exit(1)
}

const tracked = git(['-c', 'core.quotepath=false', 'ls-files', '-z']).toString('utf8').split('\0').filter(Boolean)
for (const file of tracked) {
  let head
  try { head = git(['cat-file', '-p', 'HEAD:' + file]) } catch { continue } // 新增未提交文件由下面的 git status 兜住
  let work
  try { work = readFileSync(join(root, file)) } catch { drift.push({ file, why: '工作区缺失（未提交的删除）' }); continue }
  if (sha(head) !== sha(work)) drift.push({ file, why: '内容与 HEAD 不同' })
}

// 未跟踪且未被忽略的文件：说明还有东西没提交，同样不能发版。
const untracked = git(['ls-files', '--others', '--exclude-standard', '-z']).toString('utf8').split('\0').filter(Boolean)
if (untracked.length) {
  fails.push('有 ' + untracked.length + ' 个未跟踪文件未提交：' + untracked.slice(0, 8).join(', '))
}

if (drift.length) {
  fails.push('工作区有 ' + drift.length + ' 个文件与 HEAD 内容不一致（极可能是 git stat 缓存吞掉了改动）：')
  for (const d of drift.slice(0, 12)) fails.push('  - ' + d.file + '：' + d.why)
  fails.push('  处理：touch 这些文件后重新 git add（或 git add --renormalize），再提交。')
}

const readHead = (p) => git(['cat-file', '-p', 'HEAD:' + p]).toString('utf8')
const pkgHead = JSON.parse(readHead('package.json'))
const pkgWork = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const coreHead = readHead('src/00-core.js').match(/PVERSION = '([^']+)'/)
const coreWork = readFileSync(join(root, 'src/00-core.js'), 'utf8').match(/PVERSION = '([^']+)'/)
const client = readFileSync(join(root, 'client.js'), 'utf8')

const versions = [
  ['HEAD package.json', pkgHead.version],
  ['HEAD src/00-core.js PVERSION', coreHead && coreHead[1]],
  ['工作区 client.js PVERSION', (client.match(/PVERSION = '([^']+)'/) || [])[1]],
]
for (const [where, v] of versions) {
  if (v !== pkgWork.version) fails.push(where + ' = ' + v + '，与工作区 package.json ' + pkgWork.version + ' 不一致')
}

const tag = String(process.env.GITHUB_REF_NAME || '')
if (tag) {
  const tagVersion = tag.replace(/^v/, '')
  if (tagVersion !== pkgWork.version) fails.push('tag ' + tag + ' 与 package.json ' + pkgWork.version + ' 不一致')
}

if (fails.length) {
  console.error('[verify:release] 失败')
  for (const f of fails) console.error('  ' + f)
  process.exit(1)
}
console.log('OK    发版预检：' + tracked.length + ' 个跟踪文件与 HEAD 内容一致，版本三元组均为 ' + pkgWork.version + (tag ? '（tag ' + tag + '）' : ''))
