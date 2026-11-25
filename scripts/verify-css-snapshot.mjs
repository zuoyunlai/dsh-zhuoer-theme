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
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { THEMES: THEME_VALUES } = await import(pathToFileURL(join(root, 'themes.mjs')).href)
const baselineDir = join(root, 'contracts', 'css-snapshot')
const currentDir = join(root, 'visual', 'css-current')
const manifestPath = join(baselineDir, 'manifest.json')

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const valOf = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined }
const strict = has('--strict')
const captureDir = valOf('--capture')
const sha = (buf) => createHash('sha256').update(buf).digest('hex')

function newestMtime(dir, ext) {
  try {
    let newest = 0
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(ext)) continue
      const m = statSync(join(dir, name)).mtimeMs
      if (m > newest) newest = m
    }
    return newest
  } catch (e) {
    return 0
  }
}

function warnIfStale(currentDir, ext) {
  const cur = newestMtime(currentDir, ext)
  if (!cur) return false
  const src = newestMtime(join(root, 'src'), '.js')
  if (src > cur) {
    const mins = Math.round((src - cur) / 60000)
    // mtime 只是提醒，不是判据：真正决定注入 CSS 的是 themes.mjs 指纹（下面单独比）与逐字节比对。
    // 只改了 JS 逻辑、没动 CSS 字符串时，这里也会响——说明清楚，免得把「时间新」误读成「内容不一致」。
    console.warn('WARN  采集时间早于 src 约 ' + mins + ' 分钟（提醒项，不是判据）')
    console.warn('      若本轮只改了非 CSS 代码，上面的逐字节比对已足以证明注入 CSS 未变；')
    console.warn('      若改过 token 或面板 CSS，请重新采集：--capture visual/css-current（真机采集见 docs/live-verify.md）。')
    return true
  }
  return false
}

function cssInputsHash() {
  return sha(readFileSync(join(root, 'themes.mjs')))
}

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
    cssInputs: cssInputsHash(),
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
  warnIfStale(currentDir, '.css')
  // 真正会改变注入 CSS 的是「token 输入」（themes.mjs）。只比 mtime 会把
  // 纯 UI/文案改动也判红（面板改了、注入的 222 个 token 一个没动），那种假红最后
  // 只会逼人习惯性 --capture，等于把门关掉。所以这里比 token 输入的指纹。
  const inputs = cssInputsHash()
  let failed = 0
  if (manifest.cssInputs && manifest.cssInputs !== inputs) {
    console.error('FAIL  token 输入变了（themes.mjs 指纹不一致）——注入的 CSS 可能已经不同，请重新采集：')
    console.error('      node scripts/verify-css-snapshot.mjs --capture visual/css-current')
    failed++
  } else if (!manifest.cssInputs) {
    console.warn('WARN  基线里没有 token 输入指纹（旧格式），本次只做逐字节比对')
  }
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
  // 逐字节一致还不够：两份文件可以是「一起旧」的（改了 token 只 promote 没重采）。
  // 所以再拿 themes.mjs 的真值反查基线里每个 token 的取值——这是「基线是否还对得上代码」的硬判据。
  {
    const want = { light: readFileSync(join(baselineDir, 'plugin-light.css'), 'utf8'), dark: readFileSync(join(baselineDir, 'plugin-dark.css'), 'utf8') }
    for (const scheme of ['light', 'dark']) {
      const t = THEME_VALUES.zhuoer && THEME_VALUES.zhuoer[scheme]
      if (!t || !want[scheme]) continue
      // 排除运行时会被改写的几族：字体（FONTS 换族）、阴影（SHADOW_STRENGTH 缩放）、
      // 侧栏填充（按标题栏色现算）——它们的值本来就不等于 themes.mjs 的字面量。
      const runtimeOwned = (k) => /^--dsw-font-/.test(k) || /^--dsw-elevation-/.test(k) || k === '--dsw-specific-sidebar-fill'
      const miss = Object.keys(t).filter((k) => !runtimeOwned(k) && !want[scheme].includes(k + ':' + t[k] + ' !important'))
      if (miss.length) {
        console.error('FAIL  ' + scheme + ' 基线里有 ' + miss.length + ' 个 token 与 themes.mjs 不一致（首个：' + miss[0] + '）')
        failed++
      }
    }
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
