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
    ['--dsw-static-blue-400', '信息蓝（深色档）'],
    ['--dsw-static-blue-600', '信息蓝（浅色档）'],
  ]
  for (const [h, why] of hooks) {
    if (!s.includes(h)) bad.push('宿主里找不到 ' + h + '（' + why + '）')
  }
} else {
  console.log('（跳过宿主侧核对：找不到 ' + asar + '）')
}

// 2) 信息蓝对每个内置主题底色的对比度
const BLUE = { dark: '#60a5fa', light: '#2563eb' }
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
let worstDark = Infinity, worstLight = Infinity
for (const id of THEME_IDS) {
  const t = THEMES[id]
  if (!t) continue
  const d = ratio(BLUE.dark, t.dark['--dsw-alias-bg-base'])
  const l = ratio(BLUE.light, t.light['--dsw-alias-bg-base'])
  if (d !== null) worstDark = Math.min(worstDark, d)
  if (l !== null) worstLight = Math.min(worstLight, l)
}
if (!(worstDark >= 3)) bad.push('信息蓝（深色档 ' + BLUE.dark + '）对最亮主题底色只有 ' + worstDark.toFixed(2) + ':1（需 ≥3:1）')
if (!(worstLight >= 3)) bad.push('信息蓝（浅色档 ' + BLUE.light + '）对最亮主题底色只有 ' + worstLight.toFixed(2) + ':1（需 ≥3:1）')

if (bad.length) {
  console.error('[verify:host-hooks] ' + bad.length + ' 项')
  for (const b of bad) console.error('  - ' + b)
  process.exit(1)
}
console.log('OK    宿主钩子齐全（data-step-process-icon / data-process-activity / 静态蓝）；信息蓝对比度：深色档 ' + worstDark.toFixed(2) + ':1、浅色档 ' + worstLight.toFixed(2) + ':1（≥3:1）')