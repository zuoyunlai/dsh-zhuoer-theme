#!/usr/bin/env node
/**
 * 取色锚点（paletteToAnchors）的无头测试。
 * 抠法与 test-derive.mjs 同一手法：连同 #region palette 一起抠出来跑，
 * 测的就是线上那份实现，不复制、不重写。
 *
 * 守两条规则（R-02）：
 *  1) 明暗两套**各 8 组锚点**（原来只有 7 组，缺 state-success-primary）；
 *  2) 深色方案的品牌色**对底色 ≥3:1**（原来只校验「按钮上的白字」，
 *     实测深色方案 brand #173200 on bg #1c221c = 1.15:1，基本不可见）。
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

const dStart = src.indexOf('// #region derive')
const dEnd = src.indexOf('// #endregion derive')
const pStart = src.indexOf('// #region palette')
const pEnd = src.indexOf('// #endregion palette')
// #region palette 嵌在 #region derive 里（#endregion derive 在文件末尾附近），
// 只抠 derive 一段即可；再拼一次 palette 会让同名 const 重复声明而 SyntaxError。
const region = src.slice(dStart, dEnd)
const helpers = grabFn('hexHsl') + '\n' + grabFn('hslHex')

const make = new Function('THEMES', 'THEME_IDS',
  helpers + '\n' + region +
  '\nreturn { paletteToAnchors, parseHexColor };')
const { paletteToAnchors, parseHexColor } = make(THEMES, THEME_IDS)

const relLum = (hex) => {
  const c = parseHexColor(hex)
  if (!c) return null
  const ch = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}
const ratio = (a, b) => {
  const la = relLum(a), lb = relLum(b)
  if (la === null || lb === null) return null
  const hi = Math.max(la, lb), lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

// 一张「森林照片」的主色分布：灰绿主色 + 天空蓝 + 云白 + 深阴影。
const forest = [
  { hex: '#829881', share: 0.83 },
  { hex: '#a8bbd1', share: 0.07 },
  { hex: '#e6e7ea', share: 0.06 },
  { hex: '#1d2417', share: 0.04 },
]
const light = paletteToAnchors(forest, 'light')
const dark = paletteToAnchors(forest, 'dark')

const REQUIRED = [
  '--dsw-alias-bg-base', '--dsw-alias-label-primary', '--dsw-alias-border-l1',
  '--dsw-alias-brand-primary', '--dsw-alias-trajectory-accent',
  '--dsw-alias-state-error-primary', '--dsw-alias-state-warn-primary',
  '--dsw-alias-state-success-primary',
]

for (const [name, a] of [['浅色', light], ['深色', dark]]) {
  assert.ok(a, name + '方案应产出锚点')
  for (const k of REQUIRED) {
    assert.ok(typeof a[k] === 'string' && /^#[0-9a-f]{6}$/.test(a[k]), name + '缺锚点 ' + k)
  }
}
assert.equal(REQUIRED.length, 8, '锚点组数应为 8')

const br = ratio(dark['--dsw-alias-brand-primary'], dark['--dsw-alias-bg-base'])
assert.ok(br !== null && br >= 3.0, '深色品牌色对底色应 ≥3:1，实测 ' + br)
// 浅色侧的门**故意更松**（≥2.0）：品牌色是按钮填充色，它要对齐的是「按钮上的白字」，
// 不是页面底色。早先拿它跟 bg 比，浅底照片里的鲜绿永远「不够对比」，被一路压成橄榄灰——
// 照片的鲜度就丢了（见 paletteToAnchors 里 ensureOnWhite 的注释）。
// 深色侧不同：深色方案的品牌色如果对底色只有 1.15:1，颜色本身就消失了（按钮都看不见），
// 所以那边必须过 ≥3:1，并同时下发深色前景锚点。
const bl = ratio(light['--dsw-alias-brand-primary'], light['--dsw-alias-bg-base'])
assert.ok(bl !== null && bl >= 2.0, '浅色品牌色对底色应 ≥2.0（照片鲜度优先），实测 ' + bl)

console.log('OK    取色锚点：8 组齐全；深底 brand ' + br.toFixed(2) + ':1，浅底 brand ' + bl.toFixed(2) + ':1')