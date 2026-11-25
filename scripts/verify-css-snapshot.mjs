#!/usr/bin/env node
/**
 * CSS 快照门：把「插件实际注入宿主的 CSS 文本」当基线逐字节比。
 *
 * 为什么除了 verify:visual 还要它：
 *   1) 截图像素只能覆盖「画出来的那部分」，底图、品牌位这类需要外部素材才生效的路径截不到；
 *   2) applyTokens 的 DOM 半边一旦拆分，最直接的问题就是「发出去的声明变了」——文本比对
 *      能在第一毫秒指出哪一个字符变了，比盯 15% 像素差好定位。
 *   3) 它同时是 backlog 第 1 条的判据：拆完 overrideTokens 收到的对象必须逐 token 一致。
 *
 * 快照怎么采（需要能打开的宿主界面；来源是运行时，不是源码）：
 *   - 在宿主界面执行 tools/…：把 style 里含 .zp- / dsh-wordmark-badge-clip / --zr- 的文本，
 *     连同 adoptedStyleSheets 的 cssText，按 DOM 顺序拼起来，落盘成 <state>.css
 *   - 把文件放进 visual/css-current/，跑本脚本比对
 *
 * 用法：
 *   node scripts/verify-css-snapshot.mjs                   比对 visual/css-current/*.css
 *   node scripts/verify-css-snapshot.mjs --strict          没有当前快照也判红
 *   node scripts/verify-css-snapshot.mjs --capture <dir>   把 <dir>/*.css 提升为基线
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const baselineDir = join(root, 'contracts', 'css-snapshot')
const currentDir = join(root, 'visual', 'css-current')
const manifestPath = join(baselineDir, 'manifest.json')

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const valOf = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined }
const strict = has('--strict')
const captureDir = valOf('--capture')
const sha = (buf) => createHash('sha256').update(buf).digest('hex')

function capture() {
  const from = captureDir
  if (!existsSync(from)) throw new Error('目录不存在：' + from)
  mkdirSync(baselineDir, { recursive: true })
  const names = readdirSync(from).filter((n) => n.endsWith('.css')).sort()
  if (!names.length) throw new Error('目录里没有 .css：' + from)
  const entries = []
  for (const name of names) {
    copyFileSync(join(from, name), join(baselineDir, name))
    const buf = readFileSync(join(baselineDir, name))
    entries.push({ file: name, bytes: buf.length, sha256: sha(buf) })
  }
  writeFileSync(manifestPath, JSON.stringify({
    $comment: '插件注入 CSS 的运行时快照基线。改动后重新采集：node scripts/verify-css-snapshot.mjs --capture visual/css-current',
    images: undefined,
    files: entries,
  }, null, 2) + '\n')
  console.log('WROTE CSS 基线 ' + entries.length + ' 份 → ' + manifestPath)
}

function firstDiff(a, b) {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i
  return a.length === b.length ? -1 : n
}

function verify() {
  if (!existsSync(manifestPath)) {
    console.log('SKIP  没有 CSS 快照基线（先 --capture 一次）')
    return 0
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const cur = existsSync(currentDir) ? readdirSync(currentDir).filter((n) => n.endsWith('.css')) : []
  if (!cur.length) {
    if (strict) { console.error('FAIL  没有 visual/css-current（需要真实宿主界面，CI 里跳过）'); return 1 }
    console.log('SKIP  没有 visual/css-current 快照（CI 里跳过）；基线 ' + manifest.files.length + ' 份')
    return 0
  }
  let failed = 0
  for (const entry of manifest.files) {
    const p = join(currentDir, entry.file)
    if (!existsSync(p)) { console.error('FAIL  缺当前快照：' + entry.file); failed++; continue }
    const base = readFileSync(join(baselineDir, entry.file), 'utf8')
    const now = readFileSync(p, 'utf8')
    if (base === now) { console.log('OK    ' + entry.file + ' 逐字节一致（' + entry.bytes + ' B）'); continue }
    const at = firstDiff(base, now)
    const ctx = (s) => s.slice(Math.max(0, at - 60), at + 60).replace(/\n/g, '⏎')
    console.error('FAIL  ' + entry.file + ' 文本变了：首个差异在偏移 ' + at)
    console.error('      基线: …' + ctx(base) + '…')
    console.error('      当前: …' + ctx(now) + '…')
    failed++
  }
  if (failed) { console.error('\nFAIL  ' + failed + ' 份 CSS 与基线不同。确认是有意改动后重新采集基线。'); return 1 }
  console.log('PASS  注入的 CSS 与基线逐字节一致')
  return 0
}

try {
  if (captureDir) capture()
  else process.exitCode = verify()
} catch (e) {
  console.error('FAIL  ' + (e && e.message ? e.message : e))
  process.exitCode = 1
}
