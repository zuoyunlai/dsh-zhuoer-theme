#!/usr/bin/env node
/**
 * 自定义主题的 token 覆盖率报告。
 *
 * 回答的问题：「用户调锚点时，到底有多少 token 会跟着走，剩下的是为什么没跟。」
 * 直接从 client.js 的 #region derive 抠出真实 ANCHOR_GROUPS 来算，不复制不重写，
 * 改了代码这份报告立刻跟着变（跟 test-derive.mjs 同一套抠法）。
 *
 * 剩下的 token 分三类，互不重叠：
 *   STRUCTURAL  字体 / 圆角 / 阴影 —— 由「字体」「圆角」「阴影」三个独立设置接管，
 *               不走锚点，所以不算缺口。
 *   SELF        自成体系的语义色（成功绿、遮罩、反色文字）—— 见下方 EXEMPT 理由。
 *   HOLE        真正漏了的（本项目目标是 0）。
 *
 * 用法：node scripts/coverage-report.mjs [--json]
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const src = readFileSync(join(root, 'client.js'), 'utf8')
const { THEMES } = await import(pathToFileURL(join(root, 'themes.mjs')).href)

const start = src.indexOf('// #region derive')
const end = src.indexOf('// #endregion derive')
if (start < 0 || end < 0) throw new Error('client.js 里找不到 #region derive 标记')

// buildCustomTokens 需要 hexHsl / hslHex，它们在 region 之外，单独抠出来
const grabFn = (name) => {
  const i = src.indexOf('function ' + name + '(')
  if (i < 0) throw new Error('找不到 function ' + name)
  const open = src.indexOf('{', i)
  let depth = 0
  let j = open
  let inS = false
  let esc = false
  for (; j < src.length; j++) {
    const c = src[j]
    if (inS) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inS = false
      continue
    }
    if (c === '"') { inS = true; continue }
    if (c === '{') depth++
    else if (c === '}') { depth--; if (depth === 0) { j++; break } }
  }
  return src.slice(i, j)
}
const make = new Function('THEMES', 'THEME_IDS',
  grabFn('hexHsl') + '\n' + grabFn('hslHex') + '\n' + src.slice(start, end) + '\nreturn { ANCHOR_GROUPS };')
const { ANCHOR_GROUPS } = make(THEMES, Object.keys(THEMES))

const covered = new Set()
for (const g of ANCHOR_GROUPS) {
  covered.add(g.anchor)
  for (const m of g.members) covered.add(m[0])
}

// 结构性 token：字体/圆角/阴影各有专门的设置项，不靠锚点
const STRUCTURAL = [/^--dsw-font/, /^--dsw-radius/, /^--dsw-elevation/]

// 有意不跟锚点走的：每一项都要写清理由，否则下一个人只能猜
const EXEMPT = {
  '--dsw-alias-bg-mask-1': '遮罩层：浅色主题里是刻意压暗的灰幕，跟底色平移会失去遮罩感',
  '--dsw-alias-bg-mask-2': '同上',
  '--dsw-alias-bg-mask-3': '同上',
  '--dsw-alias-bg-mask-photo': '同上（图片遮罩）',
  '--dsw-alias-bg-mask-drop': '同上（拖放遮罩）',
  '--dsw-alias-button-tool-bar-fill-invisible': '隐藏态按钮：刻意透明/反色，跟底色会显形',
  '--dsw-alias-label-primary-foreground': '彩色按钮面上的文字：恒白/恒黑，跟锚点会失去对比',
  '--dsw-alias-label-primary-inverted': '反色文字：跟随方案（明暗）而非锚点',
  '--dsw-alias-label-on-color': '彩底文字：恒白/恒黑',
  '--dsw-alias-tooltip-label': 'tooltip 文字：跟随 tooltip 底的反色，不跟正文色',
  '--dsw-alias-toast-bg': 'toast 底：浅色主题里刻意用深色反色面，跟底色会失去浮起感',
  '--dsw-specific-sidebar-fill': '由 applyTokens 按标题栏色现算（见 client.js 里 applyTokens 的 specific-sidebar-fill 计算），纳入组会被覆盖',
}

const base = process.argv[3] === '--base' ? process.argv[4] : 'dash'
const theme = THEMES[base]
if (!theme) throw new Error('找不到主题 ' + base)

const rows = []
for (const key of Object.keys(theme.light || {})) {
  if (key.startsWith('--dsw-static-')) continue
  const kind = covered.has(key) ? 'COVERED'
    : STRUCTURAL.some((re) => re.test(key)) ? 'STRUCTURAL'
    : EXEMPT[key] ? 'SELF'
    : 'HOLE'
  rows.push({ key, kind })
}
const by = (k) => rows.filter((r) => r.kind === k)
const total = rows.length

if (process.argv[2] === '--json') {
  console.log(JSON.stringify({
    base,
    total,
    groups: ANCHOR_GROUPS.length,
    coveredKeys: covered.size,
    covered: by('COVERED').length,
    structural: by('STRUCTURAL').length,
    self: by('SELF').length,
    holes: by('HOLE').map((r) => r.key),
  }, null, 2))
  process.exitCode = by('HOLE').length ? 1 : 0
} else {
  console.log('base=' + base + '  非静态 token=' + total + '  锚点组=' + ANCHOR_GROUPS.length
    + '  覆盖 key=' + covered.size)
  console.log('  COVERED    ' + String(by('COVERED').length).padStart(3)
    + '  跟锚点走（' + ANCHOR_GROUPS.map((g) => g.label + '/' + (g.members.length + 1)).join(' ') + '）')
  console.log('  STRUCTURAL ' + String(by('STRUCTURAL').length).padStart(3) + '  字体/圆角/阴影，由独立设置接管')
  console.log('  SELF       ' + String(by('SELF').length).padStart(3) + '  有意不跟（理由见脚本 EXEMPT）')
  console.log('  HOLE       ' + String(by('HOLE').length).padStart(3) + '  真缺口')
  for (const r of by('HOLE')) console.log('      ! ' + r.key)
  for (const r of by('SELF')) console.log('      - ' + r.key + '  —  ' + EXEMPT[r.key])
  process.exitCode = by('HOLE').length ? 1 : 0
}
