#!/usr/bin/env node
/**
 * 像素级对比度分析（L2）：直接从真机截图里量「文字与它脚下背景」的实际对比度。
 *
 * 为什么需要它（与 verify-texture / verify-contrast 的分工）：
 *   - verify-contrast 算**声明式** token 对；
 *   - verify-texture 算**纹理合成**后的最不利像素（解析法，离线）；
 *   - 本脚本管两者都覆盖不到的：backdrop-filter、渐变、宿主自己的半透明层，
 *     以及「声明式算出来 10:1、实际渲染到底是多少」这件事本身。
 *
 * 做法（不引入依赖，PNG 解码复用 verify-visual 里那套 inflate + 反滤波）：
 *   1. 按 4px 横带切图（文字行约 16–20px，切太粗会把两行混在一起）；
 *   2. 带内取「量化后的众数色」当背景（面板底色占绝大多数像素）；
 *   3. 带内取离背景亮度最远的像素当墨色（字形核心，不用抗锯齿边缘——WCAG 判的是文字色）；
 *   4. 只保留墨像素足够多的带（≥ 20 个），对每带算 WCAG 比值；
 *   5. 输出 p5/p50/最差带——p5 就是「最差的 5% 文字行」。
 *
 * 已知局限（实测踩到，别当它已经是文字度量）：
 *   本脚本用「离背景最远的连续笔画」当墨色，但界面里还有**同强度的图形**——主题试样的品牌红书脊
 *   （#d13c3c）在暗底上是 3.59:1、表面分隔线在亮底上是 1.15:1，都会被算进来。所以当前 p5 读作
 *   「带内最抢眼的非背景笔画」而不是「文字最差对比度」。下一步应把候选像素限制在 label-* token
 *   颜色与背景之间的混色线上（文字只会是这些颜色的抗锯齿混合），再判 p5。
 *   在改之前：本脚本只做**报告**，不要接进 verify:all，也不要用它的 p5 下「文字不达标」的结论。
 *
 * 用法：node scripts/analyze-pixels.mjs [--dir visual/current] [--strict 4.5]
 *   默认只报告（退出 0）；给 --strict N 则 p5 低于 N 时退出 1。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const argv = process.argv.slice(2)
const argOf = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }
const dir = join(root, argOf('--dir', 'visual/current'))
const strictAt = argv.indexOf('--strict')
const strictFloor = strictAt >= 0 ? Number(argv[strictAt + 1] || 4.5) : null

function decodePng(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG')
  let p = 8, w = 0, h = 0, bd = 0, ct = 0, interlace = 0
  const idat = []
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p)
    const type = buf.toString('ascii', p + 4, p + 8)
    const data = buf.subarray(p + 8, p + 8 + len)
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; interlace = data[12] }
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    p += 12 + len
  }
  if (bd !== 8) throw new Error('仅支持 8-bit PNG')
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

const lin = (v) => { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
const BAND = 4
const MIN_INK = 20

function analyze(img) {
  const { w, h, ch, data } = img
  const bands = []
  for (let y0 = 0; y0 + BAND <= h; y0 += BAND) {
    // 带内量化众数 = 背景
    const hist = new Map()
    for (let y = y0; y < y0 + BAND; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * ch
        const r = data[i], g = ch >= 3 ? data[i + 1] : r, b = ch >= 3 ? data[i + 2] : r
        const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
        const e = hist.get(key)
        if (e) { e.n++; e.r += r; e.g += g; e.b += b } else hist.set(key, { n: 1, r, g, b })
      }
    }
    let best = null
    for (const e of hist.values()) if (!best || e.n > best.n) best = e
    const bgR = best.r / best.n, bgG = best.g / best.n, bgB = best.b / best.n
    const bgL = lum(bgR, bgG, bgB)
    // 墨像素判定：必须是「连续 ≥3px 的笔画」，且横向跨度不超过 80% 宽度——
    // 前一条排除抗锯齿噪点，后一条排除分隔线／边框（它们是整行贯通的 1px 线，
    // 早期版本把这类线当文字，量出 3.59:1 的假红）。
    const inkMask = new Uint8Array(w * BAND)
    for (let yy = 0; yy < BAND; yy++) {
      for (let x = 0; x < w; x++) {
        const i = ((y0 + yy) * w + x) * ch
        const r = data[i], g = ch >= 3 ? data[i + 1] : r, b = ch >= 3 ? data[i + 2] : r
        if (Math.abs(lum(r, g, b) - bgL) > 0.08) inkMask[yy * w + x] = 1
      }
    }
    const keep = new Uint8Array(w * BAND)
    for (let yy = 0; yy < BAND; yy++) {
      let x = 0
      while (x < w) {
        if (!inkMask[yy * w + x]) { x++; continue }
        let x2 = x
        while (x2 < w && inkMask[yy * w + x2]) x2++
        if (x2 - x >= 3) for (let k = x; k < x2; k++) keep[yy * w + k] = 1
        x = x2
      }
    }
    // 带内最远像素 = 墨色核心（只看落在笔画上的像素）
    let inkL = bgL, inkR = bgR, inkG = bgG, inkB = bgB, ink = 0
    let minX = w, maxX = -1
    for (let yy = 0; yy < BAND; yy++) {
      for (let x = 0; x < w; x++) {
        if (!keep[yy * w + x]) continue
        const i = ((y0 + yy) * w + x) * ch
        const r = data[i], g = ch >= 3 ? data[i + 1] : r, b = ch >= 3 ? data[i + 2] : r
        const l = lum(r, g, b)
        if (Math.abs(l - bgL) > Math.abs(inkL - bgL)) { inkL = l; inkR = r; inkG = g; inkB = b }
        ink++
        if (x < minX) minX = x
        if (x > maxX) maxX = x
      }
    }
    // 横向跨度接近整宽 → 是贯通线/边框，不是文字
    if (maxX >= 0 && (maxX - minX) > w * 0.8) continue
    if (ink < MIN_INK) continue
    bands.push({ y: y0, c: ratio(inkL, bgL), ink, bg: [Math.round(bgR), Math.round(bgG), Math.round(bgB)], fg: [Math.round(inkR), Math.round(inkG), Math.round(inkB)] })
  }
  bands.sort((a, b) => a.c - b.c)
  const pct = (p) => bands.length ? bands[Math.min(bands.length - 1, Math.floor((bands.length - 1) * p))].c : null
  return { w, h, bands: bands.length, p5: pct(0.05), p50: pct(0.5), worst: bands.slice(0, 5) }
}

if (!existsSync(dir)) { console.error('FAIL  没有截图目录：' + dir); process.exit(1) }
const files = readdirSync(dir).filter((f) => f.endsWith('.png')).sort()
if (!files.length) { console.error('FAIL  ' + dir + ' 里没有 PNG'); process.exit(1) }

let bad = 0
const seenHash = new Map()
for (const f of files) {
  const buf = readFileSync(join(dir, f))
  const { createHash } = await import('node:crypto')
  const h = createHash('sha256').update(buf).digest('hex').slice(0, 12)
  if (seenHash.has(h)) { console.log('SKIP  ' + f + '（与 ' + seenHash.get(h) + ' 内容相同，疑似重复采集）'); continue }
  seenHash.set(h, f)
  const img = decodePng(buf)
  const res = analyze(img)
  if (!res.bands) { console.log('SKIP  ' + f + '（没有可判定的文字带）'); continue }
  const line = 'INFO  ' + f + '  ' + res.w + 'x' + res.h + '  bands=' + res.bands
    + '  p5=' + res.p5.toFixed(2) + ':1  p50=' + res.p50.toFixed(2) + ':1'
  console.log(line)
  if (strictFloor !== null && res.p5 < strictFloor) {
    console.error('FAIL  ' + f + ' p5 ' + res.p5.toFixed(2) + ':1 < ' + strictFloor)
    for (const b of res.worst) console.error('        最差带 y=' + b.y + ' ' + b.c.toFixed(2) + ':1  bg=rgb(' + b.bg.join(',') + ') fg=rgb(' + b.fg.join(',') + ') ink=' + b.ink)
    bad++
  }
}
if (bad) { console.error('[analyze-pixels] 失败 ' + bad + ' 张'); process.exit(1) }
console.log('OK    像素级对比度：' + files.length + ' 张截图已分析' + (strictFloor === null ? '（仅报告，未设门槛）' : '，p5 ≥ ' + strictFloor))