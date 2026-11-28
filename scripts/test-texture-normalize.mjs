#!/usr/bin/env node
/**
 * 底纹归一化（zrTexNormalizePixels）的无头测试。
 * 抠法与 test-derive.mjs / test-palette-anchors.mjs 同一手法：
 * 把 #region derive + #region palette + #region texture-normalize 一起抠出来跑，
 * 测的就是线上那份实现，不复制、不重写。
 *
 * 守四条规则（R-01 / F-01 F-02 / R-12）：
 *  1) 图的底色被平移到目标 bg-base（否则整页偏色 5~10 级）；
 *  2) 极性跟着**合成方式**走：lighten（深色方案）要亮墨、multiply（浅色方案）要暗墨；
 *  3) 对齐后仍能在剩余余量里留下 >= 4/255 的可见差，且不振荡；
 *  4) 余量是单向的：亮墨看 255-底，暗墨看底色本身——浅底走 multiply 才有足够余量。
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

const slice = (a, b) => src.slice(src.indexOf('// #region ' + a), src.indexOf('// #endregion ' + b))
// 颜色换算统一到 08-color.js：parseHexColor 等已不在 derive region 内，要一并抠进来。
const helpers = [grabFn('hexHsl'), grabFn('hslHex'), grabFn('zrLin'), grabFn('parseHexColor'), grabFn('toHexColor'), grabFn('zrHexLum'), grabFn('zrRatio'), grabFn('zrContrast')].join('\n')
// 注意：slice('derive') 里已经带着真的 tokensFor，所以这里不要塞替身（会被后者覆盖）。
const make = new Function('THEMES', 'THEME_IDS',
  // derive 里已经嵌了 palette 与 texture-normalize（#endregion derive 在文件末尾附近），
  // 再单独拼一次会让同名 const 重复声明而 SyntaxError。
  helpers + '\n' + slice('derive', 'derive') +
  '\nreturn { zrTexBaseRgb, zrTexHex, zrTexNormalizePixels, zrTexTargetBg, parseHexColor };')
const api = make(THEMES, THEME_IDS)

// 造一张图：base 铺满，可选若干行「线稿」。
const mk = (w, h, base, ink) => {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const isInk = !!ink && ink.rows.indexOf(y) !== -1
      const c = isInk ? ink.rgb : base
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = isInk && ink.alpha ? ink.alpha : 255
    }
  }
  return data
}

const lumOf = (rgb) => 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]
const px = (data, w, x, y) => { const i = (y * w + x) * 4; return [data[i], data[i + 1], data[i + 2], data[i + 3]] }
const hexOf = (data, w, x, y) => api.zrTexHex(px(data, w, x, y).slice(0, 3))
const hexToRgb = (h) => { const m = api.parseHexColor(h); return m }

let n = 0
const ok = (name, fn) => { fn(); n++; console.log('ok    ' + name) }

// 1) 底色采样取众数，不被线条拉偏
ok('底色采样：250,248,245 的图上取到 #faf8f5', () => {
  const W = 40, H = 40
  const data = mk(W, H, [250, 248, 245], { rgb: [150, 150, 150], rows: [10, 20, 30] })
  assert.deepEqual(api.zrTexBaseRgb(data, W, H), [250, 248, 245])
})

// 2) 暗线 + 浅底：极性翻转，底色精确落到目标，线条留下可见差
ok('浅底暗线：极性翻转、底色对齐 #f2ecff、墨差 >= 4', () => {
  const W = 60, H = 60
  const target = '#f2ecff'
  const data = mk(W, H, [250, 248, 245], { rgb: [150, 150, 150], rows: [5, 15, 25] })
  const rep = api.zrTexNormalizePixels(data, W, H, target)
  assert.equal(rep.ok, true)
  assert.equal(rep.base, '#faf8f5')
  assert.equal(rep.flipped, true, '线条比底色暗时必须翻转')
  assert.equal(rep.changed, true)
  const tgt = hexToRgb(target)
  assert.deepEqual(px(data, W, 0, 0).slice(0, 3), tgt, '底色像素必须精确等于目标色')
  assert.ok(rep.inkDelta >= 4, '墨差应 >= 4/255，实得 ' + rep.inkDelta)
  const tgtLum = lumOf(tgt)
  const inkLum = lumOf(px(data, W, 0, 5))
  assert.ok(inkLum > tgtLum, '翻转后线条必须亮于底色（lighten 才留得下）')
  assert.ok(inkLum - tgtLum >= 4, '亮度差应 >= 4，实得 ' + (inkLum - tgtLum).toFixed(1))
})

// 3) 亮线 + 深底：不翻转，只对齐底色
ok('深底亮线：不翻转、底色对齐 #0b0518', () => {
  const W = 40, H = 40
  const target = '#0b0518'
  const data = mk(W, H, [11, 11, 11], { rgb: [200, 200, 200], rows: [4, 14] })
  const rep = api.zrTexNormalizePixels(data, W, H, target)
  assert.equal(rep.ok, true)
  assert.equal(rep.flipped, false, '线条已经比底色亮，不该翻转')
  assert.deepEqual(px(data, W, 0, 0).slice(0, 3), hexToRgb(target))
  assert.ok(lumOf(px(data, W, 0, 4)) > 150, '亮线应基本保留')
})

// 4) 幂等：本来就在目标底色上的纯色图不产生改动（因此不会被重编码）
ok('幂等：纯目标色图 changed=false', () => {
  const W = 20, H = 20
  const target = '#f4f1ec'
  const data = mk(W, H, hexToRgb(target))
  const rep = api.zrTexNormalizePixels(data, W, H, target)
  assert.equal(rep.ok, true)
  assert.equal(rep.changed, false)
  assert.equal(rep.flipped, false)
})

// 5) 稳定性：连跑两次不振荡（第二次不翻转、墨差基本不变）
ok('稳定：连续两次归一化不振荡（墨差相差 <= 2）', () => {
  const W = 60, H = 60
  const target = '#f2ecff'
  const data = mk(W, H, [250, 248, 245], { rgb: [150, 150, 150], rows: [5, 15, 25] })
  const r1 = api.zrTexNormalizePixels(data, W, H, target)
  const r2 = api.zrTexNormalizePixels(data, W, H, target)
  assert.equal(r2.ok, true)
  assert.equal(r2.flipped, false, '第二次不该再翻转（已经朝上了）')
  assert.ok(Math.abs(r2.inkDelta - r1.inkDelta) <= 2, '墨差应稳定：' + r1.inkDelta + ' -> ' + r2.inkDelta)
})

// 6) alpha 不被改写（透明线稿靠它决定哪里画）
ok('alpha 原样保留', () => {
  const W = 10, H = 10
  const data = mk(W, H, [30, 30, 30], { rgb: [200, 200, 200], rows: [3], alpha: 45 })
  const rep = api.zrTexNormalizePixels(data, W, H, '#141414')
  assert.equal(rep.ok, true)
  assert.equal(px(data, W, 0, 3)[3], 45)
  assert.equal(px(data, W, 0, 0)[3], 255)
})

// 7) 坏输入一律 ok=false（调用方据此回原图）
ok('坏输入：坏目标色 / 空 buffer 都返回 ok=false', () => {
  assert.equal(api.zrTexNormalizePixels(null, 10, 10, '#ffffff').ok, false)
  assert.equal(api.zrTexNormalizePixels(new Uint8ClampedArray(16), 10, 10, '#ffffff').ok, false)
  const d = mk(10, 10, [1, 2, 3])
  assert.equal(api.zrTexNormalizePixels(d, 10, 10, 'not-a-color').ok, false)
})

// 8) 极小图不崩（1x1）
ok('边界：1x1 图不抛错', () => {
  const data = mk(1, 1, [128, 128, 128])
  const rep = api.zrTexNormalizePixels(data, 1, 1, '#202020')
  assert.equal(rep.ok, true)
  assert.equal(rep.base, '#808080')
})

// 9) 目标底色取值：spec 锚点优先，否则退回 base 主题
ok('目标底色：spec 锚点优先，缺锚点退回 base 主题', () => {
  const spec = { light: { '--dsw-alias-bg-base': '#ABCDEF' } }
  assert.equal(api.zrTexTargetBg(spec, 'light', 'zhuoer'), '#abcdef')
  // 没给深色锚点 → 退回 base 主题的真实底色（不要再写死一份期望值）
  assert.equal(api.zrTexTargetBg(spec, 'dark', 'zhuoer'), THEMES.zhuoer.dark['--dsw-alias-bg-base'])
  assert.equal(api.zrTexTargetBg({}, 'light', 'zhuoer'), THEMES.zhuoer.light['--dsw-alias-bg-base'])
  assert.equal(api.zrTexTargetBg(null, 'dark', 'zhuoer'), THEMES.zhuoer.dark['--dsw-alias-bg-base'])
})

// 10) 浅底余量被正确压缩：线条不会被 255 截成一片平白
ok('浅底压缩：翻转后不出现整片 255', () => {
  const W = 60, H = 60
  const target = '#f8f5f0'
  const data = mk(W, H, [250, 248, 245], { rgb: [90, 90, 90], rows: [5, 15, 25] })
  const rep = api.zrTexNormalizePixels(data, W, H, target)
  assert.equal(rep.ok, true)
  assert.equal(rep.flipped, true)
  assert.ok(rep.k < 1, '浅底余量不足，应触发压缩，实得 k=' + rep.k)
  const ink = px(data, W, 0, 5).slice(0, 3)
  assert.ok(ink[0] < 255 || ink[1] < 255 || ink[2] < 255, '不该三通道全被截到 255')
  assert.ok(rep.inkDelta >= 4, '压缩后墨差仍需 >= 4，实得 ' + rep.inkDelta)
})

// 11) R-12：浅色方案走 multiply，墨必须**暗于**底色
ok('multiply 方案：浅底暗线不翻转，墨保持暗于底色', () => {
  const W = 60, H = 60
  const target = '#dee7e9'
  const data = mk(W, H, hexToRgb(target), { rgb: [150, 160, 165], rows: [5, 15, 25] })
  const rep = api.zrTexNormalizePixels(data, W, H, target, true)
  assert.equal(rep.ok, true)
  assert.equal(rep.blend, 'multiply')
  assert.equal(rep.flipped, false, '线已经比底色暗，multiply 下不该翻转')
  const tgt = hexToRgb(target)
  const tgtLum = lumOf(tgt)
  assert.ok(lumOf(px(data, W, 0, 5)) < tgtLum, '线条必须暗于底色（multiply 才留得下）')
  assert.ok(rep.inkDelta >= 4, '墨差应 >= 4，实得 ' + rep.inkDelta)
})

// 12) R-12：浅色方案 + 亮线 → 翻成暗线（这正是不改合成时「看不见」的那种图）
ok('multiply 方案：浅底亮线会被翻成暗线', () => {
  const W = 60, H = 60
  const target = '#dee7e9'
  const data = mk(W, H, hexToRgb(target), { rgb: [250, 252, 253], rows: [5, 15, 25] })
  const rep = api.zrTexNormalizePixels(data, W, H, target, true)
  assert.equal(rep.ok, true)
  assert.equal(rep.flipped, true, '亮线在 multiply 下必须翻成暗线')
  assert.ok(lumOf(px(data, W, 0, 5)) < lumOf(hexToRgb(target)), '翻转后必须暗于底色')
})

// 13) R-12：深色方案仍然要亮墨（不能因为新参数把旧行为改坏）
ok('lighten 方案：深底暗线仍被翻成亮线', () => {
  const W = 60, H = 60
  const target = '#101619'
  const data = mk(W, H, hexToRgb(target), { rgb: [3, 4, 5], rows: [5, 15, 25] })
  const rep = api.zrTexNormalizePixels(data, W, H, target, false)
  assert.equal(rep.blend, 'lighten')
  assert.equal(rep.flipped, true)
  assert.ok(lumOf(px(data, W, 0, 5)) > lumOf(hexToRgb(target)), '翻转后必须亮于底色')
})

// 14) R-12：暗墨的余量取「底色本身」而不是「255-底色」——浅底因此能用到 ~40 级
ok('multiply 方案：浅底暗墨不压缩（余量是底色本身）', () => {
  const W = 60, H = 60
  const target = '#dee7e9'
  const data = mk(W, H, hexToRgb(target), { rgb: [180, 190, 195], rows: [5, 15, 25] })
  const rep = api.zrTexNormalizePixels(data, W, H, target, true)
  assert.equal(rep.k, 1, '余量充足时不该压缩，实得 k=' + rep.k)
  assert.ok(rep.inkDelta >= 30, '浅底暗墨的墨差应明显大于 lighten 的 26 级上限，实得 ' + rep.inkDelta)
})

console.log('')
console.log('OK    底纹归一化：' + n + ' 例通过')
