#!/usr/bin/env node
/**
 * 像素对齐门（B3）：注入的 px 必须落在 1/dpr 的栅格上。
 *
 * 三组判据：
 *  1) zrQ 的数学：dpr ∈ {1, 1.25, 1.5, 2} × 字号缩放 ∈ {90,100,110,125,140} × 基准 {14,13} 全部对齐；
 *     另加三条硬期望值，防止「恒等函数」也能通过。
 *  2) 旧的 calc 小数源不得回归：calc(14px * …) / calc(13px * …)。
 *  3) CSS 文本里不得出现小于 1px 的圆角/描边宽度。
 * 第三组刻意不扫 box-shadow：模糊半径本来就允许小数，扫了只会误报。
 *
 * 为什么要有这道门：125%/150% 缩放下小数 px 会落到半像素，行盒与输入框各自取整到不同侧，
 * 表现是底栏/正文轻微抖动（上游 PTC #45 的原话与修法）。这类回归肉眼很难稳定复现，只能靠算。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(root, 'client.js'), 'utf8')
const fails = []

const grabFn = (name) => {
  const i = src.indexOf('function ' + name + '(')
  if (i < 0) return null
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

const fnSrc = grabFn('zrQ')
if (!fnSrc) {
  console.error('[verify:dpi] 失败：client.js 里找不到 zrQ()')
  process.exit(1)
}
const zrQ = new Function('return (' + fnSrc + ')')()

let checked = 0
for (const dpr of [1, 1.25, 1.5, 2]) {
  for (const s of [90, 100, 110, 125, 140]) {
    for (const base of [14, 13]) {
      const v = zrQ((base * s) / 100, dpr)
      const dev = Math.abs(v * dpr - Math.round(v * dpr))
      if (dev > 1e-9) fails.push('dpr=' + dpr + ' scale=' + s + '% base=' + base + ' → ' + v + ' 不在 1/dpr 栅格（偏差 ' + dev + '）')
      checked++
    }
  }
}
const expect = [
  [16.1, 1.25, 16],
  [16.1, 1, 16],
  [15.5, 2, 15.5],
]
for (const [v, dpr, want] of expect) {
  const got = zrQ(v, dpr)
  if (got !== want) fails.push('zrQ(' + v + ', ' + dpr + ') = ' + got + '，期望 ' + want)
}

for (const bad of ['calc(14px *', 'calc(13px *']) {
  if (src.indexOf(bad) !== -1) fails.push('又出现小数字号源：' + bad)
}

const frac = [...src.matchAll(/(border-radius|border-width|outline-width)\s*:\s*0?\.\d+px/g)]
if (frac.length) {
  for (const m of frac.slice(0, 5)) fails.push('小于 1px 的描边/圆角：' + m[0])
}

if (fails.length) {
  console.error('[verify:dpi] 失败')
  for (const f of fails) console.error('  - ' + f)
  process.exit(1)
}
console.log('OK    像素对齐：' + checked + ' 组 dpr×字号 全在 1/dpr 栅格，无小数描边源')