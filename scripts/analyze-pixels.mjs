#!/usr/bin/env node
/**
 * 像素级对比度分析（L2）：从真机截图里量「文字与其脚下背景」的实际对比度。
 *
 * 与另两个门的分工：
 *   verify-contrast 算声明式 token 对；verify-texture 算纹理合成后的最不利像素（解析法）；
 *   本脚本管它们都覆盖不到的：backdrop-filter、渐变、宿主自己的半透明层，
 *   以及「声明式 10:1、实际渲染到底多少」这件事本身。
 *
 * 关键一步是**只认文字像素**：初版用「离背景最远的连续笔画」，结果量到的是主题试样的品牌红书脊
 * （3.59:1）和表面分隔线（1.15:1）——都不是文字。正解是把候选像素限制在
 * **label-* token 颜色与底色的混色线段**上：文字只可能是这些颜色的抗锯齿混合，
 * 品牌色、边框、图标都落不到这条线上。token 由采集脚本一并写入 visual/current/labels.json。
 *
 * 判据：每 4px 横带取带内量化众数当背景，取落在混色线上的墨像素里「最接近纯 label 色」的那个
 * 当字形核心，算 WCAG 比值；带内墨像素不足 6 个的跳过；输出 p5/p50/最差带。
 *
 * 用法：node scripts/analyze-pixels.mjs [--dir visual/current] [--strict 4.5]
 *   默认只报告（退出 0）；--strict N 时 p5 < N 退出 1。
 *   两条"别把非背景当背景"的守卫（都是实测踩出来的）：
 *     a) 带内众数必须**占该带 ≥40% 像素**——12px 密集提示行里众数其实是文字色
 *        （rgb(122,123,125) 对 #83838b 只差 20 级），不加这条会量出 1.13:1 的假值；
 *     b) 混色系数 t ≥ 0.55——低于此值多半是抗锯齿边缘，不是字形核心。
 *   局限：主题试样卡里是**各主题自己的迷你界面**（底色各不相同、属装饰而非本面板文字），
 *   会因守卫 a 被跳过——这是有意为之，但覆盖率因此只统计"本面板自己的文字"；
 *   也不处理文字下的渐变/图片，同样因为该带的众数不再可信。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const argv = process.argv.slice(2)
const argOf = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }
const dir = join(root, argOf('--dir', 'visual/current'))
const strictAt = argv.indexOf('--strict')
const strictFloor = strictAt >= 0 ? Number(argv[strictAt + 1] || 4.5) : null
const TOL = Number(argOf('--tol', '16'))   // 像素到混色线的最大距离（0-255 欧氏）

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
const hexRgb = (h) => { const m = String(h || '').replace('#', ''); const f = m.length === 3 ? m.split('').map(c => c + c).join('') : m; if (!/^[0-9a-fA-F]{6}$/.test(f)) return null; return [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16)) }
// 点到线段 RGB 距离
const distToSeg = (p, a, b) => {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2]
  const apx = p[0] - a[0], apy = p[1] - a[1], apz = p[2] - a[2]
  const len2 = abx * abx + aby * aby + abz * abz
  let t = len2 ? (apx * abx + apy * aby + apz * abz) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t
  return { d: Math.sqrt(dx * dx + dy * dy + dz * dz), t }
}

const BAND = 4
const MIN_INK = 6

function analyze(img, labels) {
  const { w, h, ch, data } = img
  const segs = labels.filter(Boolean).map((L) => ({ hex: L, rgb: hexRgb(L) })).filter((s) => s.rgb)
  if (!segs.length) throw new Error('labels.json 里没有可用的 label 颜色')
  const bands = []
  for (let y0 = 0; y0 + BAND <= h; y0 += BAND) {
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
    const bg = [best.r / best.n, best.g / best.n, best.b / best.n]
    const bgL = lum(bg[0], bg[1], bg[2])
    // 只接受落在「label ↔ bg」混色线上的像素，取最接近纯 label 的那个当字形核心
    let coreT = 0, corePx = null, ink = 0, which = null
    for (let y = y0; y < y0 + BAND; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * ch
        const px = [data[i], ch >= 3 ? data[i + 1] : data[i], ch >= 3 ? data[i + 2] : data[i]]
        for (const s of segs) {
          const { d, t } = distToSeg(px, bg, s.rgb)
          if (d > TOL) continue
          ink++
          if (t > coreT) { coreT = t; corePx = s.rgb; which = s.hex }
        }
      }
    }
    // 带内众数本身就落在某条 label 混色线上 → 这一带大部分像素是字（12px 密集提示行），
    // 「众数 = 背景」的前提不成立；不加守卫会量出 1.13:1 这种假值。
    // 背景必须**占该带 ≥ 40% 像素**才算真背景。密集的 12px 提示行里众数其实是文字色（实测
    // rgb(122,123,125) 对 #83838b 只差 20 级），「众数 = 背景」的前提不成立，会量出 1.13:1 的假值。
    if (best.n / (w * BAND) < 0.4) continue
    if (ink < MIN_INK || !corePx || coreT < 0.55) continue   // 太淡的多半是抗锯齿边缘
    const coreL = lum(corePx[0], corePx[1], corePx[2])
    bands.push({ y: y0, c: ratio(coreL, bgL), ink, label: which, bg: bg.map(Math.round), t: +coreT.toFixed(2) })
  }
  bands.sort((a, b) => a.c - b.c)
  const pct = (p) => bands.length ? bands[Math.min(bands.length - 1, Math.floor((bands.length - 1) * p))].c : null
  return { w, h, bands: bands.length, p5: pct(0.05), p50: pct(0.5), worst: bands.slice(0, 5) }
}

// 采集时拿到的 token 会写在截图旁；同时复制一份进 contracts/，这样只凭仓库就能复跑分析。
const labelsCandidates = [join(dir, 'labels.json'), join(root, 'contracts', 'visual-baseline', 'labels.json')]
let LABELS = null
for (const p of labelsCandidates) { if (existsSync(p)) { LABELS = JSON.parse(readFileSync(p, 'utf8')); break } }
const labelsFor = (file, mode) => {
  const key = mode || (/light/i.test(file) ? 'light' : 'dark')
  const set = LABELS && LABELS[key]
  if (!set) return null
  return [set.primary, set.secondary, set.tertiary]
}

if (!existsSync(dir)) { console.error('FAIL  没有截图目录：' + dir); process.exit(1) }
const files = readdirSync(dir).filter((f) => f.endsWith('.png')).sort()
if (!files.length) { console.error('FAIL  ' + dir + ' 里没有 PNG'); process.exit(1) }
if (!LABELS) console.error('WARN  缺 labels.json（先跑采集脚本），p5 不可信：没有 label 颜色就无法只认文字像素')

let bad = 0
const seenHash = new Map()
for (const f of files) {
  const buf = readFileSync(join(dir, f))
  const hh = createHash('sha256').update(buf).digest('hex').slice(0, 12)
  if (seenHash.has(hh)) { console.log('SKIP  ' + f + '（与 ' + seenHash.get(hh) + ' 内容相同）'); continue }
  seenHash.set(hh, f)
  let mode = argOf('--mode', null)
  if (!mode && /narrow/i.test(f)) mode = (LABELS && LABELS.light) ? 'light' : 'dark'
  const labels = labelsFor(f, mode)
  if (!labels) { console.log('SKIP  ' + f + '（没有对应模式的 label 颜色）'); continue }
  const res = analyze(decodePng(buf), labels)
  if (!res.bands) { console.log('SKIP  ' + f + '（没有可判定的文字带）'); continue }
  console.log('INFO  ' + f + '  ' + res.w + 'x' + res.h + '  textBands=' + res.bands
    + '  p5=' + res.p5.toFixed(2) + ':1  p50=' + res.p50.toFixed(2) + ':1')
  if (strictFloor !== null && res.p5 < strictFloor) {
    console.error('FAIL  ' + f + ' p5 ' + res.p5.toFixed(2) + ':1 < ' + strictFloor)
    for (const b of res.worst) console.error('        y=' + b.y + ' ' + b.c.toFixed(2) + ':1 label=' + b.label + ' t=' + b.t + ' bg=rgb(' + b.bg.join(',') + ')')
    bad++
  }
}
if (bad) { console.error('[analyze-pixels] 失败 ' + bad + ' 张'); process.exit(1) }
console.log('OK    像素级对比度：' + files.length + ' 张截图已分析' + (strictFloor === null ? '（仅报告）' : '，p5 ≥ ' + strictFloor))
