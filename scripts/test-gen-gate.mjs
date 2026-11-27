#!/usr/bin/env node
/**
 * 生成路径对比度体检的无头测试（R-07 / F-11）。
 * 直接 import theme-gen.js 的 zrAnchorGate / zrContrast / parseThemeSpec —— 测线上那份实现。
 *
 * 守两条规则：
 *  1) 模型给出的不可读配色必须被推到 正文 >= 4.5:1、品牌 >= 3:1，并如实记账（改了哪键、从什么到什么）；
 *  2) 已经达标的主题一个字节都不许动（体检不是「顺手美化」）。
 */
import { zrAnchorGate, zrContrast, parseThemeSpec } from '../theme-gen.js'
import assert from 'node:assert/strict'

let n = 0
const ok = (name, fn) => { fn(); n++; console.log('ok    ' + name) }

const BG_L = '#f4f1ec'
const BG_D = '#0b0518'

ok('坏输入不抛错：null / 非对象 / 没有底色都给空报告', () => {
  for (const v of [null, undefined, 0, 'x', [], {}]) {
    const r = zrAnchorGate(v)
    assert.equal(r.ok, true)
    assert.equal(r.fixes.length, 0)
  }
  const noBg = zrAnchorGate({ light: { '--dsw-alias-label-primary': '#ffffff' } })
  assert.equal(noBg.fixes.length, 0, '没有 bg-base 就无从判定，不该瞎改')
})

ok('达标的主题原地不动，且记载比值', () => {
  const spec = {
    light: {
      '--dsw-alias-bg-base': BG_L,
      '--dsw-alias-label-primary': '#201a2b',
      '--dsw-alias-brand-primary': '#bd4531',
    },
  }
  const before = JSON.stringify(spec)
  const r = zrAnchorGate(spec)
  assert.equal(JSON.stringify(spec), before, '达标就不许改')
  assert.equal(r.fixes.length, 0)
  assert.ok(r.ratios.light.text >= 4.5)
  assert.ok(r.ratios.light.brand >= 3.0)
})

ok('浅底白字：正文被推到 >= 4.5 并如实记账', () => {
  const spec = { light: { '--dsw-alias-bg-base': BG_L, '--dsw-alias-label-primary': '#ffffff' } }
  const was = zrContrast('#ffffff', BG_L)
  assert.ok(was < 4.5, '前提：白字在浅底上本来就不可读，实得 ' + was.toFixed(2))
  const r = zrAnchorGate(spec)
  assert.equal(r.fixes.length, 1)
  assert.equal(r.fixes[0].token, '--dsw-alias-label-primary')
  assert.equal(r.fixes[0].from, '#ffffff')
  assert.ok(zrContrast(spec.light['--dsw-alias-label-primary'], BG_L) >= 4.5)
  assert.ok(r.ratios.light.text >= 4.5)
})

ok('深底近黑品牌色：品牌被推到 >= 3.0（F-06 的生成侧同款）', () => {
  const spec = { dark: { '--dsw-alias-bg-base': BG_D, '--dsw-alias-brand-primary': '#173200' } }
  assert.ok(zrContrast('#173200', BG_D) < 3.0, '前提：这个品牌色在深底上不可见')
  const r = zrAnchorGate(spec)
  assert.equal(r.fixes.length, 1)
  assert.equal(r.fixes[0].scheme, 'dark')
  assert.ok(zrContrast(spec.dark['--dsw-alias-brand-primary'], BG_D) >= 3.0)
})

ok('明暗两套各算各的：只修不达标那一套', () => {
  const spec = {
    light: { '--dsw-alias-bg-base': BG_L, '--dsw-alias-label-primary': '#201a2b' },
    dark: { '--dsw-alias-bg-base': BG_D, '--dsw-alias-label-primary': '#101010' },
  }
  const r = zrAnchorGate(spec)
  assert.equal(r.fixes.length, 1)
  assert.equal(r.fixes[0].scheme, 'dark')
  assert.equal(spec.light['--dsw-alias-label-primary'], '#201a2b')
})

ok('幂等：修正过的 spec 再体检不再动', () => {
  const spec = { light: { '--dsw-alias-bg-base': BG_L, '--dsw-alias-label-primary': '#ffffff' } }
  zrAnchorGate(spec)
  const second = zrAnchorGate(spec)
  assert.equal(second.fixes.length, 0)
})

ok('报告形状：ok / fixes / weak / ratios 齐全且可序列化', () => {
  const r = zrAnchorGate({ light: { '--dsw-alias-bg-base': BG_L, '--dsw-alias-label-primary': '#ffffff' } })
  assert.equal(typeof r.ok, 'boolean')
  assert.ok(Array.isArray(r.fixes) && Array.isArray(r.weak))
  assert.equal(typeof r.ratios.light.text, 'number')
  assert.equal(JSON.parse(JSON.stringify(r)).fixes.length, r.fixes.length)
})

ok('端到端：解析阶段就把坏配色修好，并把结论挂到 spec.gate', () => {
  const raw = JSON.stringify({
    label: '把灯关了',
    light: {
      '--dsw-alias-bg-base': '#f4f1ec',
      '--dsw-alias-label-primary': '#fbfaf6',
      '--dsw-alias-border-l1': '#e6e3dd',
      '--dsw-alias-brand-primary': '#f0ece4',
      '--dsw-alias-trajectory-accent': '#bd4531',
    },
    dark: {
      '--dsw-alias-bg-base': '#0b0518',
      '--dsw-alias-label-primary': '#ece6f5',
      '--dsw-alias-border-l1': '#1f1a2b',
      '--dsw-alias-brand-primary': '#241a3a',
      '--dsw-alias-trajectory-accent': '#7c5cff',
    },
  })
  const spec = parseThemeSpec(raw)
  assert.ok(spec, '解析应成功')
  // 三处：浅色正文 #fbfaf6、浅色品牌 #f0ece4（都是「模型以为很淡很高级」）、深色品牌 #241a3a
  assert.equal(spec.gate.fixes, 3, '实得 ' + spec.gate.fixes + ' 处')
  assert.equal(spec.gate.ok, true)
  assert.ok(zrContrast(spec.light['--dsw-alias-label-primary'], spec.light['--dsw-alias-bg-base']) >= 4.5)
  assert.ok(zrContrast(spec.light['--dsw-alias-brand-primary'], spec.light['--dsw-alias-bg-base']) >= 3.0)
  assert.ok(zrContrast(spec.dark['--dsw-alias-brand-primary'], spec.dark['--dsw-alias-bg-base']) >= 3.0)
  assert.equal(spec.gate.detail.length, 3)
})

ok('端到端：本身就达标的主题 gate.fixes=0（不许顺手改色）', () => {
  const raw = JSON.stringify({
    label: '安分',
    light: {
      '--dsw-alias-bg-base': '#faf9f7',
      '--dsw-alias-label-primary': '#1b1a18',
      '--dsw-alias-border-l1': '#e6e3dd',
      '--dsw-alias-brand-primary': '#a33a22',
    },
  })
  const spec = parseThemeSpec(raw)
  assert.ok(spec)
  assert.equal(spec.gate.fixes, 0)
  assert.equal(spec.light['--dsw-alias-label-primary'], '#1b1a18')
})

console.log('')
console.log('OK    生成路径对比度体检：' + n + ' 例通过')
