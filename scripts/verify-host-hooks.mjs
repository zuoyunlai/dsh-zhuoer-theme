#!/usr/bin/env node
/**
 * 宿主「钩子」核对：我们依赖的宿主稳定属性/类名 + 我们自己选的静态色档位。
 *
 * 为什么要有这道门：0.6.36 的「步骤过程图标语义色」靠宿主的
 * `data-step-process-icon` / `data-process-activity` 两个属性选中图标。
 * 宿主一升级就把属性改名 → 我们的功能**静默失效**（图标回到继承色），
 * 而任何现有门禁都发现不了（它们不检查「我们选中的元素还在不在」）。
 *
 * 同理，信息蓝取自宿主的原始调色板 --dsw-static-blue-400 / -600，
 * 这里顺带按**每个内置主题的底色**验一次对比度 ≥ 3:1（图标属 UI 图形，WCAG 1.4.11）。
 *
 * 用法：node scripts/verify-host-hooks.mjs [app.asar 路径]
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { THEMES, THEME_IDS } from '../themes.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bad = []

// 1) 宿主属性钩子
const asar = process.argv[2] || 'D:/Programs/DeepSeek Harness/resources/app.asar'
if (existsSync(asar)) {
  const s = readFileSync(asar, 'latin1')
  const hooks = [
    ['data-step-process-icon', '步骤过程组头的活动图标（我们用它上语义色）'],
    ['data-process-activity', '活动类型（thinking/read/edit/… 决定图标颜色）'],
    ['--dsw-static-violet-400', '思考语义色的色相'],
    ['--dsw-static-blue-500', '执行语义色的色相'],
    ['--dsw-static-green-500', '查看语义色的色相'],
    ['--dsw-static-amber-500', '改动/提问语义色的色相'],
  ]
  for (const [h, why] of hooks) {
    if (!s.includes(h)) bad.push('宿主里找不到 ' + h + '（' + why + '）')
  }
} else {
  console.log('（跳过宿主侧核对：找不到 ' + asar + '）')
}

// 2) 语义色（固定色相 × 主题正文色 65/35 混合）对每个内置主题底色的对比度
//    色相来自宿主原始调色板；亮度靠混正文色自适应明暗，所以**两种明暗都要验**。
const HUES = {
  violet: '#a78bfa',   // 思考
  blue: '#3b82f6',     // 执行
  green: '#22c55e',    // 查看
  amber: '#f59e0b',    // 改动 / 提问
}
const MIX_P = 0.55
const lum = (hex) => {
  const s = String(hex).replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(s)) return null
  const ch = [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}
const ratio = (a, b) => {
  const x = lum(a), y = lum(b)
  if (x === null || y === null) return null
  const hi = Math.max(x, y), lo = Math.min(x, y)
  return (hi + 0.05) / (lo + 0.05)
}
const mixHex = (a, b, p) => {
  const ch = [1, 3, 5].map((i) => {
    const av = parseInt(a.slice(i, i + 2), 16), bv = parseInt(b.slice(i, i + 2), 16)
    return Math.round(av * p + bv * (1 - p)).toString(16).padStart(2, '0')
  })
  return '#' + ch.join('')
}
const worst = {}
for (const [name, hue] of Object.entries(HUES)) worst[name] = { dark: Infinity, light: Infinity }
for (const id of THEME_IDS) {
  const t = THEMES[id]
  if (!t) continue
  for (const scheme of ['dark', 'light']) {
    const bg = t[scheme]['--dsw-alias-bg-base']
    const text = t[scheme]['--dsw-alias-label-primary']
    if (!bg || !text) continue
    for (const [name, hue] of Object.entries(HUES)) {
      const c = mixHex(hue, text, MIX_P)
      const r = ratio(c, bg)
      if (r === null) continue
      worst[name][scheme] = Math.min(worst[name][scheme], r)
    }
  }
}
for (const [name, w] of Object.entries(worst)) {
  for (const scheme of ['dark', 'light']) {
    if (!(w[scheme] >= 3)) bad.push(name + ' 语义色（' + scheme + '）对最差主题底色只有 ' + w[scheme].toFixed(2) + ':1（需 ≥3:1）')
  }
}

if (bad.length) {
  console.error('[verify:host-hooks] ' + bad.length + ' 项')
  for (const b of bad) console.error('  - ' + b)
  process.exit(1)
}
console.log('OK    宿主钩子齐全（data-step-process-icon / data-process-activity / 四个静态色相）；语义色对比度：' + Object.entries(worst).map(([n, w]) => n + ' ' + w.dark.toFixed(2) + '/' + w.light.toFixed(2)).join('、') + '（深/浅，均 ≥3:1）')