#!/usr/bin/env node
/**
 * 取色分档（extractPalette 的 fast / faithful）的无头测试（R-05 / F-05）。
 * 抠法与 test-derive.mjs 相同：只抠 #region derive 一段（palette 嵌在里面），
 * 测的是线上那份实现，不复制、不重写。
 *
 * 为什么要有这两条断言：快档（面板）优先「3 秒出结果」，保真档（对话）必须扛得住
 * 「大面积单色」——实测真实森林照 83% 像素吐成同一个灰绿，天空蓝与云白整段丢失。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(root, 'client.js'), 'utf8')
const { THEMES, THEME_IDS } = await import(pathToFileURL(join(root, 'themes.mjs')).href)

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
const region = src.slice(src.indexOf('// #region derive'), src.indexOf('// #endregion derive'))
const make = new Function('THEMES', 'THEME_IDS',
  grabFn('hexHsl') + '\n' + grabFn('hslHex') + '\n' + region +
  '\nreturn { extractPalette, zrTexHex };')
const { extractPalette, zrTexHex } = make(THEMES, THEME_IDS)

const mkImage = (w, h, paint) => {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const c = paint(x, y, w, h)
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255
    }
  }
  return { data: data, width: w, height: h }
}
const lerp = (a, b, t) => Math.round(a + (b - a) * t)
const dist = (hex, rgb) => {
  const c = hex.slice(1).match(/../g).map((v) => parseInt(v, 16))
  const dr = c[0] - rgb[0], dg = c[1] - rgb[1], db = c[2] - rgb[2]
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

// 一张「大面积单色」的森林照：70% 连续灰绿（跨度仅 5，5 bit 量化后并成 1 格）
// + 15% 天空蓝 + 10% 云白 + 5% 深阴影。
const SKY = [168, 187, 209]
const CLOUD = [230, 231, 234]
const SHADOW = [29, 36, 23]
const A = [130, 152, 129]
const B = [132, 155, 132]
const forest = mkImage(200, 200, (x, y) => {
  if (y < 140) { const t = x / 199; return [lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)] }
  if (y < 170) return SKY
  if (y < 190) return CLOUD
  return SHADOW
})

let n = 0
const ok = (name, fn) => { fn(); n++; console.log('ok    ' + name) }

const fast = extractPalette(forest, 6)
const faithful = extractPalette(forest, 6, { tier: 'faithful' })

ok('快档确实会塌方：最大一色占比 > 60%（这就是 F-05 的机械原因）', () => {
  assert.ok(fast.length > 0)
  assert.ok(fast[0].share > 0.6, '快档最大占比应 > 0.6，实得 ' + fast[0].share.toFixed(3))
})

ok('保真档：6 色以内、无一色占比 > 60%', () => {
  assert.ok(faithful.length > 0 && faithful.length <= 6, '应 <= 6 色，实得 ' + faithful.length)
  assert.ok(faithful[0].share <= 0.6, '最大占比应 <= 0.6，实得 ' + faithful[0].share.toFixed(3))
})

ok('保真档：保留天空蓝（离 #a8bbd1 <= 60）', () => {
  const near = faithful.filter((c) => dist(c.hex, SKY) <= 60)
  assert.ok(near.length >= 1, '应含天空蓝，实际：' + faithful.map((c) => c.hex).join(' '))
})

ok('保真档：保留云白（离 #e6e7ea <= 40）', () => {
  const near = faithful.filter((c) => dist(c.hex, CLOUD) <= 40)
  assert.ok(near.length >= 1, '应含云白，实际：' + faithful.map((c) => c.hex).join(' '))
})

ok('保真档把 70% 的单色块拆成了 >= 2 色（最大占比严格低于快档）', () => {
  // 灰绿主色跨度只有 5，所有梯度色都落在中点 (131,153,130) 半径 25 内。
  const grad = faithful.filter((c) => dist(c.hex, [131, 153, 130]) <= 25)
  assert.ok(grad.length >= 2, '主色块应被拆成 >= 2 色，实际：' + faithful.map((c) => c.hex).join(' '))
  assert.ok(faithful[0].share < fast[0].share,
    '保真 ' + faithful[0].share.toFixed(3) + ' 应低于快档 ' + fast[0].share.toFixed(3))
})

ok('占比合计为 1（误差 < 0.02）', () => {
  const s = faithful.reduce((a, c) => a + c.share, 0)
  assert.ok(Math.abs(s - 1) < 0.02, '合计 ' + s.toFixed(4))
})

ok('确定性：同一张图两次结果完全一致', () => {
  assert.deepEqual(extractPalette(forest, 6, { tier: 'faithful' }), faithful)
})

ok('缺省档 = 快档（轻量档行为零变化）', () => {
  assert.deepEqual(extractPalette(forest, 6), extractPalette(forest, 6, { tier: 'fast' }))
  assert.deepEqual(extractPalette(forest, 6, { tier: 'bogus' }), extractPalette(forest, 6))
})

ok('色数参数被尊重（要 4 色就给 <= 4 色）', () => {
  const four = extractPalette(forest, 4, { tier: 'faithful' })
  assert.ok(four.length > 0 && four.length <= 4, '实得 ' + four.length)
  const one = extractPalette(forest, 1, { tier: 'faithful' })
  assert.ok(one.length >= 1 && one.length <= 1)
})

ok('纯色图不崩：单色输入返回 1 色、占比 1', () => {
  const flat = mkImage(60, 60, () => [90, 110, 130])
  const p = extractPalette(flat, 6, { tier: 'faithful' })
  assert.equal(p.length, 1)
  // 保真档用 6 bit 量化，输出落点是「桶底」而不是原值：只要求贴近输入（<= 6）。
  assert.ok(dist(p[0].hex, [90, 110, 130]) <= 6, '实得 ' + p[0].hex)
  assert.ok(Math.abs(p[0].share - 1) < 1e-9)
})

console.log('')
console.log('OK    取色分档：' + n + ' 例通过（快档最大占比 ' + fast[0].share.toFixed(2) + ' → 保真 ' + faithful[0].share.toFixed(2) + '）')
