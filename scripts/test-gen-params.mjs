#!/usr/bin/env node
/**
 * 生成参数（radiusScale / preset / font）的无头测试（R-08 / F-04 F-12）。
 * 直接 import theme-tool.js 的 zrApplyParams 与两张白名单 —— 测线上那份实现。
 *
 * 除了行为，这里还守两条**漂移**：
 *  1) 字体白名单必须与 assets/fonts/README.md 的西文表逐字对齐（少一个就是「模型能选、浏览器回落」）；
 *  2) 预设 id 必须与客户端 STYLE_PRESETS 的 id 完全一致（宿主只传 id，客户端才是配方真源）。
 */
import { zrApplyParams, ZR_FONT_FAMILIES, ZR_PRESET_IDS } from '../theme-tool.js'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let n = 0
const ok = (name, fn) => { fn(); n++; console.log('ok    ' + name) }

ok('字体白名单 = assets/fonts/README.md 的西文 14 族', () => {
  const md = fs.readFileSync(join(root, 'assets/fonts/README.md'), 'utf8')
  const seg = md.slice(md.indexOf('## 西文字体'), md.indexOf('## 中文子集'))
  const fams = seg.split('\n')
    .filter((l) => l.trim().startsWith('|'))
    .map((l) => l.split('|')[1].replace(/\*\*/g, '').trim())
    .filter((v) => v && v !== '字体族' && !/^-+$/.test(v))
  assert.equal(fams.length, 14, 'README 里应正好 14 个西文族，实得 ' + fams.length + '：' + fams.join(' / '))
  assert.deepEqual(fams.slice().sort(), ZR_FONT_FAMILIES.slice().sort())
})

ok('预设 id 白名单 = 客户端 STYLE_PRESETS 的 12 个 id', () => {
  const src = fs.readFileSync(join(root, 'client.js'), 'utf8')
  const seg = src.slice(src.indexOf('// #region presets'), src.indexOf('// #endregion presets'))
  assert.ok(seg.length > 100, '没抠到 presets 段')
  const presets = new Function(seg + '; return STYLE_PRESETS;')()
  assert.equal(presets.length, ZR_PRESET_IDS.length, '数量应一致')
  assert.deepEqual(presets.map((p) => p.id).sort(), ZR_PRESET_IDS.slice().sort())
})

const spec = () => ({ label: 'x', light: { '--dsw-alias-bg-base': '#ffffff' }, font: { body: '', chat: '' }, radiusScale: 1 })

ok('没给参数：spec 一个键都不动（零行为变化）', () => {
  const a = spec()
  const r = zrApplyParams(a, {})
  assert.deepEqual(r.spec, a)
  assert.equal(r.notes.length, 0)
  assert.deepEqual(zrApplyParams(a, undefined).spec, a)
})

ok('radiusScale 覆盖模型值并夹到 0–3', () => {
  assert.equal(zrApplyParams(spec(), { radiusScale: 2 }).spec.radiusScale, 2)
  assert.equal(zrApplyParams(spec(), { radiusScale: 9 }).spec.radiusScale, 3)
  assert.equal(zrApplyParams(spec(), { radiusScale: -4 }).spec.radiusScale, 0)
  assert.equal(zrApplyParams(spec(), { radiusScale: 'x' }).spec.radiusScale, 1, '非数字应忽略')
})

ok('preset：合法写入，非法忽略并记 note', () => {
  const good = zrApplyParams(spec(), { preset: 'cyber' })
  assert.equal(good.spec.preset, 'cyber')
  assert.equal(good.notes.length, 0)
  const bad = zrApplyParams(spec(), { preset: 'vaporwave' })
  assert.equal(bad.spec.preset, undefined)
  assert.equal(bad.notes.length, 1)
  assert.ok(bad.notes[0].indexOf('vaporwave') !== -1)
})

ok('font：随包族写入 body+chat；__mono__ 换成 JetBrains Mono', () => {
  const a = zrApplyParams(spec(), { font: 'Lora' })
  assert.deepEqual(a.spec.font, { body: 'Lora', chat: 'Lora' })
  const m = zrApplyParams(spec(), { font: '__mono__' })
  assert.deepEqual(m.spec.font, { body: 'JetBrains Mono', chat: 'JetBrains Mono' })
  assert.equal(m.notes.length, 0)
})

ok('font：未随包的族兜底替换为 Inter 并记 note（不让浏览器静默回落）', () => {
  const r = zrApplyParams(spec(), { font: 'Archivo Black' })
  assert.equal(r.spec.font.body, 'Inter')
  assert.equal(r.spec.font.chat, 'Inter')
  assert.equal(r.notes.length, 1)
  assert.ok(r.notes[0].indexOf('Archivo Black') !== -1)
})

ok('font 只给 body 时不动已存在的 chat（尊重模型的选择）', () => {
  const a = spec()
  a.font = { body: '', chat: 'Lora' }
  const r = zrApplyParams(a, { font: 'Geist' })
  assert.deepEqual(r.spec.font, { body: 'Geist', chat: 'Lora' })
})

ok('不修改传入的 spec 对象（工具层可能还要拿原值报告）', () => {
  const a = spec()
  const before = JSON.stringify(a)
  zrApplyParams(a, { radiusScale: 0, font: 'Lora', preset: 'paper' })
  assert.equal(JSON.stringify(a), before)
})

ok('三个参数可以同时给，互不覆盖', () => {
  const r = zrApplyParams(spec(), { radiusScale: 0, preset: 'devterm', font: 'Fira Code' })
  assert.equal(r.spec.radiusScale, 0)
  assert.equal(r.spec.preset, 'devterm')
  assert.deepEqual(r.spec.font, { body: 'Fira Code', chat: 'Fira Code' })
})

console.log('')
console.log('OK    生成参数：' + n + ' 例通过（' + ZR_FONT_FAMILIES.length + ' 族 / ' + ZR_PRESET_IDS.length + ' 预设）')
