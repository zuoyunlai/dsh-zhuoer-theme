#!/usr/bin/env node
/**
 * 浅色底色「为底纹让路」的无头测试（R-10）。
 * 从 client.js 里抓 zrPressLightBase 的真实实现 + 两个颜色助手来跑。
 *
 * 守四条：
 *  1) 0 档一个字都不动（默认行为零变化）；
 *  2) 1 档压到明度 87.8%、2 档压到 82.4%，且色相/饱和度不动；
 *  3) 只压不减：底色已经够深就原样返回（重复应用不会越压越黑）；
 *  4) 坏输入（缺底色 / 非 hex / 非数字档位）一律原样返回，不抛错。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(root, 'client.js'), 'utf8')
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
const make = new Function('', grabFn('hexHsl') + '\n' + grabFn('hslHex') + '\n' + grabFn('zrPressLightBase') + '\nreturn { zrPressLightBase, hexHsl };')
const { zrPressLightBase, hexHsl } = make()
const L = (hex) => hexHsl(hex)[2]
const BG = '--dsw-alias-bg-base'
const A = (hex) => ({ [BG]: hex, '--dsw-alias-label-primary': '#2e2318' })

let n = 0
const ok = (name, fn) => { fn(); n++; console.log('ok    ' + name) }

ok('0 档 / 缺省 / 非数字：一个字都不动', () => {
  const a = A('#f4e8d4')
  assert.equal(zrPressLightBase(a, 0)[BG], '#f4e8d4')
  assert.equal(zrPressLightBase(a, undefined)[BG], '#f4e8d4')
  assert.equal(zrPressLightBase(a, 'x')[BG], '#f4e8d4')
  assert.equal(zrPressLightBase(a, -3)[BG], '#f4e8d4')
})

ok('1 档：压到明度 87.8%，正文色不动', () => {
  const out = zrPressLightBase(A('#f4e8d4'), 1)
  assert.ok(Math.abs(L(out[BG]) - 0.878) < 0.002, '实得明度 ' + L(out[BG]))
  assert.equal(out['--dsw-alias-label-primary'], '#2e2318')
})

ok('2 档：压到明度 82.4%', () => {
  const out = zrPressLightBase(A('#f4e8d4'), 2)
  assert.ok(Math.abs(L(out[BG]) - 0.824) < 0.002, '实得明度 ' + L(out[BG]))
})

ok('9 档被夹到 2（不会压穿）', () => {
  const out = zrPressLightBase(A('#f4e8d4'), 9)
  assert.ok(Math.abs(L(out[BG]) - 0.824) < 0.002)
})

ok('色相与饱和度保持不变（只是变深，不换颜色）', () => {
  const before = hexHsl('#f4e8d4')
  const after = hexHsl(zrPressLightBase(A('#f4e8d4'), 2)[BG])
  assert.ok(Math.abs(before[0] - after[0]) < 2, '色相 ' + before[0] + ' -> ' + after[0])
  assert.ok(Math.abs(before[1] - after[1]) < 0.03, '饱和度 ' + before[1] + ' -> ' + after[1])
})

ok('只压不减：已经够深的底色原样返回（重复应用幂等）', () => {
  const dark = A('#d3c4be')
  assert.equal(zrPressLightBase(dark, 1)[BG], '#d3c4be')
  const once = zrPressLightBase(A('#f4e8d4'), 1)
  const twice = zrPressLightBase(once, 1)
  assert.equal(twice[BG], once[BG], '再压一次不该继续变深')
})

ok('坏输入不抛错：缺底色 / 非 hex / 空锚点表', () => {
  assert.deepEqual(zrPressLightBase({}, 2), {})
  assert.equal(zrPressLightBase({ [BG]: 'rgb(1,2,3)' }, 2)[BG], 'rgb(1,2,3)')
  assert.deepEqual(zrPressLightBase(null, 2), {})
})

ok('不修改传入对象（卡片里可能还要拿原值做对比）', () => {
  const a = A('#f4e8d4')
  zrPressLightBase(a, 2)
  assert.equal(a[BG], '#f4e8d4')
})

console.log('')
console.log('OK    浅色底色档位：' + n + ' 例通过')
