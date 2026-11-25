#!/usr/bin/env node
/**
 * 词典门：t('…') 用到的键必须在 zh/en 两套词典里都存在，且占位符两边一致。
 *
 * 为什么需要它：文案门（verify:text）只比「渲染出来的面板」，编辑器抽屉、错误提示这类
 * 要交互才出现的文案根本进不了快照——键漏了、占位符写错了，两道门都不会红。
 * 这道门是静态的：扫源码里的 t('…')，对 I18N 的键集合，零渲染、零浏览器。
 *
 * 判据：
 *   1. 代码里用到的每个键，zh 与 en 都必须有（缺一即红）；
 *   2. 同一个键，两边的占位符集合必须相同（{n} vs {count} 这种事故直接红）；
 *   3. 词典里有、代码里没用到的键 → 只提示，不判红（可能有动态拼键）。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'src')
const dictPath = join(srcDir, '05-i18n.js')
const raw = readFileSync(dictPath, 'utf8')

// 把 I18N = { zh: { … }, en: { … } } 的两段分别截出来，按行抓 'key': 'value'
const enAt = raw.indexOf('en: {')
if (enAt < 0) { console.error('FAIL  词典里找不到 en 段'); process.exit(1) }
const zhPart = raw.slice(0, enAt)
const enPart = raw.slice(enAt)
function parse(part) {
  const out = new Map()
  const re = /^\s*'([^']+)':\s*('(?:[^'\\]|\\.)*')/gm
  let m
  while ((m = re.exec(part))) {
    let v = m[2].slice(1, -1)
    try { v = JSON.parse('"' + v.replace(/\\'/g, "'").replace(/"/g, '\\"') + '"') } catch (e) { /* keep raw */ }
    out.set(m[1], v)
  }
  return out
}
const zh = parse(zhPart)
const en = parse(enPart)

const used = new Map()
for (const f of readdirSync(srcDir).filter((x) => x.endsWith('.js'))) {
  if (f === '05-i18n.js') continue
  const code = readFileSync(join(srcDir, f), 'utf8')
  const re = /(?<![\w$.])t\(\s*'([^']+)'/g
  let m
  while ((m = re.exec(code))) { if (/^[A-Za-z0-9_.-]+$/.test(m[1])) used.set(m[1], f) }
}

const ph = (s) => {
  const set = new Set()
  const re = /\{([a-zA-Z0-9_]+)\}/g
  let m
  while ((m = re.exec(s))) set.add(m[1])
  return [...set].sort().join(',')
}

let bad = 0
for (const [k, file] of used) {
  const a = zh.get(k), b = en.get(k)
  if (a === undefined || b === undefined) {
    console.error('FAIL  键 ' + k + '（' + file + '）缺 ' + (a === undefined ? 'zh' : '') + (a === undefined && b === undefined ? ' 与 ' : '') + (b === undefined ? 'en' : ''))
    bad++
    continue
  }
  if (ph(a) !== ph(b)) {
    console.error('FAIL  键 ' + k + ' 占位符不一致：zh{' + ph(a) + '} en{' + ph(b) + '}')
    bad++
  }
}

const unused = [...zh.keys()].filter((k) => !used.has(k))
console.log('用到的键 ' + used.size + ' 个；zh ' + zh.size + ' 条 / en ' + en.size + ' 条')
if (unused.length) console.log('WARN  词典里没用到的键 ' + unused.length + ' 个（不判红）：' + unused.slice(0, 8).join(', '))
if (bad) { console.error('FAIL  ' + bad + ' 处键/占位符问题'); process.exit(1) }
console.log('PASS  键齐全、占位符两侧一致')
