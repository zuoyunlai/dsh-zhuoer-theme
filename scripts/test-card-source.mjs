#!/usr/bin/env node
/**
 * 卡片纯逻辑的无头测试（R-06 / F-08 F-10）。
 * 抠法与其它夹具相同：从 client.js 里抓 zrSetAnchor / zrSwapSource 两个函数体来跑，
 * 测的就是线上那份实现。
 *
 * 守三条规则：
 *  1) 明暗两套都能改（原来只写 light，深色排是只读 hex）；
 *  2) 改一套不污染另一套，也不改原对象；
 *  3) 取色 / 模型两套可对调，且对调两次回到原状。
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
const make = new Function('', grabFn('zrSetAnchor') + '\n' + grabFn('zrSwapSource') + '\nreturn { zrSetAnchor, zrSwapSource };')
const { zrSetAnchor, zrSwapSource } = make()

const spec = () => ({
  label: '林间晴空',
  light: { '--dsw-alias-bg-base': '#f2ecff', '--dsw-alias-label-primary': '#201a2b' },
  dark: { '--dsw-alias-bg-base': '#0b0518' },
  font: { body: 'Manrope', chat: '' },
  radiusScale: 1.2,
})

let n = 0
const ok = (name, fn) => { fn(); n++; console.log('ok    ' + name) }

ok('改浅色只动 light，dark 一字不变', () => {
  const a = spec()
  const b = zrSetAnchor(a, 'light', '--dsw-alias-brand-primary', '#C2410C')
  assert.equal(b.light['--dsw-alias-brand-primary'], '#c2410c', 'hex 应归一为小写')
  assert.deepEqual(b.dark, a.dark)
  assert.equal(a.light['--dsw-alias-brand-primary'], undefined, '原对象不得被改')
})

ok('改深色只动 dark，light 一字不变（这是 F-10 的核心）', () => {
  const a = spec()
  const b = zrSetAnchor(a, 'dark', '--dsw-alias-label-primary', '#ECE6F5')
  assert.equal(b.dark['--dsw-alias-label-primary'], '#ece6f5')
  assert.deepEqual(b.light, a.light)
})

ok('深色表不存在时自动补一个对象（autoDark 主题也能手改）', () => {
  const a = { label: 'x', light: { '--dsw-alias-bg-base': '#ffffff' } }
  const b = zrSetAnchor(a, 'dark', '--dsw-alias-bg-base', '#000000')
  assert.deepEqual(Object.keys(b.dark), ['--dsw-alias-bg-base'])
})

ok('非法 scheme 落到 light（不抛错、也不造出第三套）', () => {
  const b = zrSetAnchor(spec(), 'auto', '--dsw-alias-border-l1', '#123456')
  assert.equal(b.light['--dsw-alias-border-l1'], '#123456')
  assert.equal(b.auto, undefined)
})

ok('对调：light/dark 与 alt 互换、src 翻转、其它字段不动', () => {
  const a = spec()
  a.src = 'sampled'
  a.altLight = { '--dsw-alias-bg-base': '#111111' }
  a.altDark = { '--dsw-alias-bg-base': '#eeeeee' }
  const b = zrSwapSource(a)
  assert.equal(b.light['--dsw-alias-bg-base'], '#111111')
  assert.equal(b.dark['--dsw-alias-bg-base'], '#eeeeee')
  assert.deepEqual(b.altLight, a.light)
  assert.deepEqual(b.altDark, a.dark)
  assert.equal(b.src, 'model')
  assert.equal(b.label, '林间晴空')
  assert.deepEqual(b.font, a.font)
})

ok('对调两次回到原状（可逆）', () => {
  const a = spec()
  a.src = 'sampled'
  a.altLight = { '--dsw-alias-bg-base': '#111111' }
  a.altDark = { '--dsw-alias-bg-base': '#eeeeee' }
  const twice = zrSwapSource(zrSwapSource(a))
  assert.deepEqual(twice.light, a.light)
  assert.deepEqual(twice.dark, a.dark)
  assert.deepEqual(twice.altLight, a.altLight)
  assert.equal(twice.src, 'sampled')
})

ok('没走过取色就没有第二套：返回 null，调用方据此不渲染按钮', () => {
  assert.equal(zrSwapSource(spec()), null)
  assert.equal(zrSwapSource(null), null)
  assert.equal(zrSwapSource({ altLight: {} }), null, '空对象等于没有第二套')
})

ok('对调不改原对象', () => {
  const a = spec()
  a.altLight = { '--dsw-alias-bg-base': '#111111' }
  zrSwapSource(a)
  assert.equal(a.light['--dsw-alias-bg-base'], '#f2ecff')
  assert.equal(a.altLight['--dsw-alias-bg-base'], '#111111')
})

console.log('')
console.log('OK    卡片配色逻辑：' + n + ' 例通过')
