#!/usr/bin/env node
/**
 * dsh-zhuoer-theme 主题门禁。
 *
 * 真源是 themes.mjs；client.js 里的 `const THEMES = {...}` 是它的生成副本
 * （客户端插件被宿主合并进 /plugins/??a,b,c 打包请求，import.meta.url 不可靠，
 * 所以不能运行时 import，只能生成内联）。
 *
 * 本脚本校验四件事：
 *   1. client.js 内联副本与 themes.mjs 逐 token 相等（多出的补充 token 允许）
 *   2. 每套主题 dark/light 的 token 集合一致，不缺项
 *   3. 全部主题的 alias token 集合一致（防止某套漏定义）
 *   4. 关键对比度达标（正文/底、反白/底、边线/底）
 *
 * 用法：node scripts/verify-themes.mjs
 * 退出码：0 通过 / 1 有失败项
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const themesPath = join(root, 'themes.mjs')
const clientPath = join(root, 'client.js')

const { THEMES } = await import('file://' + themesPath.replace(/\\/g, '/'))

// ---------- 1. 提取 client.js 内联副本 ----------
const clientSrc = readFileSync(clientPath, 'utf8')
const marker = 'const THEMES = '
const at = clientSrc.indexOf(marker)
if (at < 0) {
  console.error('FAIL  在 client.js 里找不到 `const THEMES = `')
  process.exit(1)
}
const start = clientSrc.indexOf('{', at)
// 括号配平（跳过字符串），避免被 token 值里的花括号骗到
let depth = 0
let end = -1
let inStr = false
let esc = false
for (let i = start; i < clientSrc.length; i++) {
  const c = clientSrc[i]
  if (inStr) {
    if (esc) esc = false
    else if (c === '\\') esc = true
    else if (c === '"') inStr = false
    continue
  }
  if (c === '"') { inStr = true; continue }
  if (c === '{' || c === '[') depth++
  else if (c === '}' || c === ']') {
    depth--
    if (depth === 0) { end = i + 1; break }
  }
}
if (end < 0) {
  console.error('FAIL  client.js 内联 THEMES 括号不闭合（可能被截断）')
  process.exit(1)
}
let inline
try {
  inline = JSON.parse(clientSrc.slice(start, end))
} catch (e) {
  console.error('FAIL  client.js 内联 THEMES 不是合法 JSON：' + e.message)
  process.exit(1)
}

const failures = []
const notes = []

// ---------- 2. 逐 token 比对 ----------
const themeIds = Object.keys(THEMES)
const inlineIds = Object.keys(inline)
if (themeIds.join() !== inlineIds.join()) {
  failures.push(`主题 id 列表不一致：themes.mjs=[${themeIds.join(',')}] client.js=[${inlineIds.join(',')}]`)
}

for (const id of themeIds) {
  for (const scheme of ['dark', 'light']) {
    const want = THEMES[id][scheme]
    const got = inline[id] && inline[id][scheme]
    if (!want) { failures.push(`${id}.${scheme} 在 themes.mjs 里缺失`); continue }
    if (!got) { failures.push(`${id}.${scheme} 在 client.js 内联副本里缺失`); continue }
    let diff = 0
    for (const [k, v] of Object.entries(want)) {
      if (String(got[k] || '').toLowerCase() !== String(v).toLowerCase()) {
        if (diff < 3) failures.push(`${id}.${scheme}.${k}：themes.mjs=${v} client.js=${got[k]}`)
        diff++
      }
    }
    if (diff > 3) failures.push(`${id}.${scheme} 另有 ${diff - 3} 处不一致`)
  }
}

// ---------- 3. token 集合完整性 ----------
const aliasKeys = (t) => Object.keys(t).filter((k) => k.startsWith('--dsw-alias-')).sort().join()
const refDark = aliasKeys(THEMES[themeIds[0]].dark)
for (const id of themeIds) {
  if (aliasKeys(THEMES[id].dark) !== refDark) failures.push(`${id}.dark 的 alias token 集合与 ${themeIds[0]} 不同`)
  if (aliasKeys(THEMES[id].light) !== aliasKeys(THEMES[themeIds[0]].light)) failures.push(`${id}.light 的 alias token 集合与 ${themeIds[0]} 不同`)
}

// ---------- 4. 对比度 ----------
const lum = (hex) => {
  const h = String(hex).replace('#', '')
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const p = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255)
    .map((c) => (Number.isNaN(c) ? 0 : c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)))
  return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]
}
const ratio = (a, b) => {
  const l1 = lum(a), l2 = lum(b)
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2)
  return (hi + 0.05) / (lo + 0.05)
}
const MIN_TEXT = 4.5
// 分隔线是 Zhuoer 原版真值（普遍 1.1~1.3），只拦「和底色几乎相同、等于没画」的情况
const MIN_LINE = 1.05
for (const id of themeIds) {
  for (const scheme of ['dark', 'light']) {
    const t = THEMES[id][scheme]
    const bg = t['--dsw-alias-bg-base']
    const checks = [
      ['--dsw-alias-label-primary', MIN_TEXT, '正文'],
      ['--dsw-alias-border-l1', MIN_LINE, '边线'],
      ['--dsw-alias-border-l2', MIN_LINE, '边线2'],
    ]
    for (const [key, min, label] of checks) {
      const v = t[key]
      if (!v || !bg) continue
      const r = ratio(v, bg)
      if (r < min) failures.push(`${id}.${scheme} ${label}对比度 ${r.toFixed(2)} < ${min}（${key}=${v} on ${bg}）`)
    }
    // 徽标反白：字母用 bg-base，底框用 label-primary
    const lp = t['--dsw-alias-label-primary']
    if (lp && bg) {
      const r = ratio(lp, bg)
      if (r < 3) notes.push(`${id}.${scheme} 反白对 ${r.toFixed(2)}（偏低，仅提示）`)
    }
  }
}

// ---------- 报告 ----------
console.log(`主题数 ${themeIds.length}，内联 alias token ${Object.keys(inline[themeIds[0]].dark).length} 个`)
if (notes.length) for (const n of notes) console.log('NOTE  ' + n)
if (failures.length) {
  console.error(`\nFAIL  ${failures.length} 项`)
  for (const f of failures.slice(0, 40)) console.error('  - ' + f)
  process.exit(1)
}
console.log('PASS  themes.mjs 与 client.js 内联副本一致，token 齐全，对比度达标')
