#!/usr/bin/env node
/**
 * OKLCH 亮度步进工具 —— 给「为了对比度而调色」这件事一个可复算的口径。
 *
 * 背景：0.6.44 为了让纹理可见，给 7 套主题的三级文字各抬了 +3~8 级 sRGB。
 * 那些数字是**按 sRGB 级数**手调的，肉眼看着一致，但没有度量说明它们是否真的等距。
 * OKLCH 的 L 是感知亮度，ΔL 相同的两步看起来才一样重。以后再有这类调整，用本工具算：
 *
 *   node scripts/oklch-step.mjs --pair "#908072,#9b8d80"        # 看两色在 OKLCH 里差多少
 *   node scripts/oklch-step.mjs --lift "#908072" --dl 0.04 --base "#1a1210"
 *                                                               # 抬 0.04 感知亮度，并给出与底色的对比度
 *   node scripts/oklch-step.mjs --audit                          # 复核 0.6.44 那 7 组是否等距
 *
 * 零依赖：sRGB ↔ OKLab 用标准矩阵，不引第三方库。
 */
const args = process.argv.slice(2)
const argOf = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d }

const srgbToLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
const linToSrgb = (c) => { const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return Math.round(Math.max(0, Math.min(1, v)) * 255) }
const hex2rgb = (h) => { const m = String(h).replace('#', ''); const f = m.length === 3 ? m.split('').map((c) => c + c).join('') : m; return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)) }
const rgb2hex = (a) => '#' + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')

function rgbToOklab([r, g, b]) {
  const R = srgbToLin(r), G = srgbToLin(g), B = srgbToLin(b)
  const l = 0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B
  const m = 0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B
  const s = 0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s)
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ]
}
function oklabToRgb([L, a, b]) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3
  return [
    linToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  ]
}
const toLch = ([L, a, b]) => {
  const C = Math.hypot(a, b)
  let h = Math.atan2(b, a) * 180 / Math.PI
  if (h < 0) h += 360
  return { L, C, h }
}
const fromLch = ({ L, C, h }) => [L, C * Math.cos(h * Math.PI / 180), C * Math.sin(h * Math.PI / 180)]
const relLum = (hex) => { const [r, g, b] = hex2rgb(hex); return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b) }
const contrast = (a, b) => { const x = relLum(a), y = relLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }

const fmt = (x, n = 4) => Number(x).toFixed(n)

if (args.includes('--audit')) {
  // 0.6.44 为「纹理可见」抬过的 7 组（暗色 tertiary）
  const pairs = [
    ['dash', '#908072', '#9b8d80'],
    ['absolutely', '#85857f', '#8a8a84'],
    ['crt', '#7c7c7c', '#808080'],
    ['knot', '#7a7a83', '#7d7d86'],
    ['manuscript', '#918871', '#948c75'],
    ['miami', '#857ba3', '#887ea5'],
    ['rose', '#86839c', '#8e8ca3'],
  ]
  console.log('theme         from      to        ΔL(OKLCH)  ΔC      Δh°')
  const dls = []
  for (const [id, a, b] of pairs) {
    const la = toLch(rgbToOklab(hex2rgb(a)))
    const lb = toLch(rgbToOklab(hex2rgb(b)))
    const dL = lb.L - la.L, dC = lb.C - la.C, dh = lb.h - la.h
    dls.push(dL)
    console.log(id.padEnd(13) + a + '  ' + b + '  ' + fmt(dL, 4).padStart(9) + '  ' + fmt(dC, 4).padStart(7) + '  ' + fmt(dh, 2).padStart(6))
  }
  const min = Math.min(...dls), max = Math.max(...dls)
  console.log('')
  console.log('ΔL 范围 ' + fmt(min, 4) + ' ~ ' + fmt(max, 4) + '（极差 ' + fmt(max - min, 4) + '）—— 极差越小，7 套的「抬亮手感」越一致')
  process.exit(0)
}

const pair = argOf('--pair', '')
if (pair) {
  const [a, b] = pair.split(',').map((s) => s.trim())
  const la = toLch(rgbToOklab(hex2rgb(a))), lb = toLch(rgbToOklab(hex2rgb(b)))
  console.log(a + '  LCH(' + fmt(la.L) + ', ' + fmt(la.C) + ', ' + fmt(la.h, 1) + ')')
  console.log(b + '  LCH(' + fmt(lb.L) + ', ' + fmt(lb.C) + ', ' + fmt(lb.h, 1) + ')')
  console.log('ΔL ' + fmt(lb.L - la.L) + '   ΔC ' + fmt(lb.C - la.C) + '   Δh ' + fmt(lb.h - la.h, 2) + '°')
  process.exit(0)
}

const lift = argOf('--lift', '')
const dl = Number(argOf('--dl', '0'))
if (lift) {
  if (!dl) { console.error('FAIL  --lift 需要 --dl（如 --dl 0.04）'); process.exit(1) }
  const lch = toLch(rgbToOklab(hex2rgb(lift)))
  const out = rgb2hex(oklabToRgb(fromLch({ L: Math.max(0, Math.min(1, lch.L + dl)), C: lch.C, h: lch.h })))
  const base = argOf('--base', '')
  console.log(lift + ' → ' + out + '   （OKLCH L ' + fmt(lch.L) + ' → ' + fmt(lch.L + dl) + '）')
  if (base) {
    console.log('与 ' + base + ' 对比度：' + fmt(contrast(lift, base), 2) + ' → ' + fmt(contrast(out, base), 2))
  }
  process.exit(0)
}

console.error('用法：--pair "a,b" | --lift hex --dl 0.04 [--base hex] | --audit')
process.exit(1)
