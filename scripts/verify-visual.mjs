#!/usr/bin/env node
/**
 * 视觉回归门：把「改完 CSS 靠肉眼看」变成可比对的基线。
 *
 * 分支点说明：宿主界面要鉴权，CI 里拿不到，所以这个门在**没有当前截图时 SKIP**
 * （退出码 0，打印 SKIP 一行），不会把 CI 弄红；要它硬判就用 --strict。
 *
 * 为什么要自己解 PNG：仓库坚持零依赖、纯单文件 ESM，不引 sharp/pixelmatch。
 * 这里只支持 8-bit、非隔行（Chrome/Playwright 截图就是这个形态），够用且可核对。
 *
 * 用法：
 *   node scripts/verify-visual.mjs                     比对 visual/current/*.png 与基线
 *   node scripts/verify-visual.mjs --strict            没有 current 截图也判红
 *   node scripts/verify-visual.mjs --capture <dir>     把 <dir>/*.png 提升为基线并写 manifest
 *   node scripts/verify-visual.mjs --tolerance 8       单通道差阈值（默认 8）
 *
 * 采集约定：在 1264×771 视口下，浅色/深色各截 nav 与 .zp-root（manifest 记录视口与哈希）。
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const baselineDir = join(root, 'contracts', 'visual-baseline')
const currentDir = join(root, 'visual', 'current')
const manifestPath = join(baselineDir, 'manifest.json')

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const valueOf = (name) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}
const strict = flag('--strict')
const captureDir = valueOf('--capture')
const tolerance = Number(valueOf('--tolerance') ?? 8)
const ratioLimit = 0.001

function decodePng(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG')
  let p = 8, w = 0, h = 0, bd = 0, ct = 0, interlace = 0
  const idat = []
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p)
    const type = buf.toString('ascii', p + 4, p + 8)
    const data = buf.subarray(p + 8, p + 8 + len)
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4)
      bd = data[8]; ct = data[9]; interlace = data[12]
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    p += 12 + len
  }
  if (bd !== 8) throw new Error('仅支持 8-bit PNG，实际 ' + bd)
  if (interlace !== 0) throw new Error('不支持隔行 PNG')
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 0 ? 1 : 0
  if (!ch) throw new Error('不支持的 colorType ' + ct)
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * ch
  const out = Buffer.alloc(h * stride)
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    const cur = Buffer.alloc(stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0
      const b = prev[x]
      const c = x >= ch ? prev[x - ch] : 0
      let v = line[x]
      if (ft === 1) v += a
      else if (ft === 2) v += b
      else if (ft === 3) v += (a + b) >> 1
      else if (ft === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c)
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)
      }
      cur[x] = v & 0xff
    }
    cur.copy(out, y * stride)
    prev = cur
  }
  return { w, h, ch, data: out }
}

function compare(baseImg, curImg) {
  if (baseImg.w !== curImg.w || baseImg.h !== curImg.h) {
    return { sizeMismatch: true, base: baseImg.w + 'x' + baseImg.h, cur: curImg.w + 'x' + curImg.h }
  }
  const total = baseImg.w * baseImg.h
  const ch = Math.min(baseImg.ch, curImg.ch)
  let changed = 0
  for (let i = 0; i < total; i++) {
    let d = 0
    for (let k = 0; k < ch; k++) {
      const delta = Math.abs(baseImg.data[i * baseImg.ch + k] - curImg.data[i * curImg.ch + k])
      if (delta > d) d = delta
    }
    if (d > tolerance) changed++
  }
  return { sizeMismatch: false, changed, total, ratio: changed / total }
}

function sha(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

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
  if (!cur) return
  const src = newestMtime(join(root, 'src'), '.js')
  if (src > cur) {
    const mins = Math.round((src - cur) / 60000)
    console.warn('WARN  采集比源码旧（源码新约 ' + mins + ' 分钟）—— 这次结论只对采集那一刻成立；')
    console.warn('      改完代码请重新采集，否则门看起来是绿的，其实在比旧图。')
  }
}

function capture() {
  if (!captureDir) throw new Error('--capture 需要一个目录')
  const from = join(captureDir)
  if (!existsSync(from)) throw new Error('目录不存在：' + from)
  const names = readdirSync(from).filter((n) => n.toLowerCase().endsWith('.png'))
  if (!names.length) throw new Error('目录里没有 PNG：' + from)
  const entries = []
  for (const name of names) {
    const dest = join(baselineDir, name)
    copyFileSync(join(from, name), dest)
    const buf = readFileSync(dest)
    const img = decodePng(buf)
    entries.push({ file: name, w: img.w, h: img.h, sha256: sha(buf) })
  }
  const manifest = {
    $comment: '视觉基线清单。改动 UI 后重新采集：node scripts/verify-visual.mjs --capture <dir>',
    viewport: valueOf('--viewport') ?? '1264x771',
    tolerance,
    ratioLimit,
    images: entries.sort((a, b) => a.file.localeCompare(b.file)),
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  console.log('WROTE 基线 ' + entries.length + ' 张，manifest: ' + manifestPath)
}

function verify() {
  if (!existsSync(manifestPath)) {
    console.log('SKIP  没有基线清单（先 --capture 一次）')
    return 0
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const names = manifest.images.map((e) => e.file)
  const present = existsSync(currentDir)
    ? readdirSync(currentDir).filter((n) => n.toLowerCase().endsWith('.png'))
    : []
  if (!present.length) {
    const msg = 'SKIP  没有 visual/current 截图（需要真实宿主界面，CI 里跳过）'
    if (strict) { console.error(msg.replace('SKIP', 'FAIL')); return 1 }
    console.log(msg)
    console.log('     采集方法见 README「门禁与验证」；基线 ' + names.length + ' 张，视口 ' + manifest.viewport)
    return 0
  }
  warnIfStale(currentDir, '.png')
  console.log('基线 ' + names.length + ' 张，视口 ' + manifest.viewport + '，容差 ' + tolerance + '，判红阈值 ' + (manifest.ratioLimit * 100).toFixed(2) + '%')
  let failed = 0
  for (const entry of manifest.images) {
    const curPath = join(currentDir, entry.file)
    if (!existsSync(curPath)) {
      console.error('FAIL  缺当前截图：' + entry.file)
      failed++
      continue
    }
    const baseImg = decodePng(readFileSync(join(baselineDir, entry.file)))
    const curBuf = readFileSync(curPath)
    const curImg = decodePng(curBuf)
    const r = compare(baseImg, curImg)
    if (r.sizeMismatch) {
      console.error('FAIL  ' + entry.file + ' 尺寸变了：基线 ' + r.base + ' → 当前 ' + r.cur + '（视口或布局变了）')
      failed++
      continue
    }
    const pct = (r.ratio * 100).toFixed(3)
    if (r.ratio > manifest.ratioLimit) {
      console.error('FAIL  ' + entry.file + ' 差异 ' + pct + '%（' + r.changed + '/' + r.total + ' 像素，阈值 ' + (manifest.ratioLimit * 100).toFixed(2) + '%）')
      failed++
    } else {
      console.log('OK    ' + entry.file + ' 差异 ' + pct + '%' + (r.changed ? '（在阈值内）' : ''))
    }
  }
  if (failed) {
    console.error('\nFAIL  ' + failed + ' 张与基线不符。确认是有意改动后重新采集基线；否则说明 CSS 改坏了。')
    return 1
  }
  console.log('PASS  全部与视觉基线一致')
  return 0
}

try {
  if (captureDir) capture()
  else process.exitCode = verify()
} catch (e) {
  console.error('FAIL  ' + (e && e.message ? e.message : e))
  process.exitCode = 1
}
