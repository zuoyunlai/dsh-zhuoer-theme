#!/usr/bin/env node
/**
 * 由 TSV（key<TAB>译文）生成 i18n/<lang>.json。
 *
 * 为什么用 TSV 中转：词典是 260 条 × 8 种语言，写 JSON 要处理引号与逗号，
 * 容易出错；TSV 一行一条，写完由本脚本合并进英文底稿，缺键/多键当场报出来。
 *
 * 用法：node scripts/mk-locale.mjs ja <file.tsv>
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const lang = process.argv[2]
const src = process.argv[3]
if (!lang || !src) { console.error('用法：node scripts/mk-locale.mjs <lang> <file.tsv>'); process.exit(1) }
const en = JSON.parse(readFileSync(join(root, 'i18n', 'en.json'), 'utf8'))
const raw = readFileSync(src, 'utf8').split('\n')
const dict = {}
const problems = []
for (const line of raw) {
  if (!line.trim()) continue
  const t = line.indexOf('\t')
  if (t < 0) { problems.push('没有制表符：' + line.slice(0, 40)); continue }
  const k = line.slice(0, t).trim()
  const v = line.slice(t + 1)
  if (!(k in en)) { problems.push('英文底稿里没有这个键：' + k); continue }
  if (k in dict) { problems.push('重复的键：' + k); continue }
  dict[k] = v
}
const missing = Object.keys(en).filter((k) => !(k in dict))
const extra = Object.keys(dict).filter((k) => !(k in en))
if (missing.length) problems.push('缺 ' + missing.length + ' 条：' + missing.slice(0, 6).join(', '))
if (extra.length) problems.push('多 ' + extra.length + ' 条：' + extra.slice(0, 6).join(', '))
if (problems.length) {
  console.error('FAIL  ' + lang + '：')
  for (const p of problems.slice(0, 20)) console.error('  - ' + p)
  process.exit(1)
}
const out = {}
for (const k of Object.keys(en)) out[k] = dict[k]
writeFileSync(join(root, 'i18n', lang + '.json'), JSON.stringify(out, null, 2) + '\n')
console.log('OK    i18n/' + lang + '.json：' + Object.keys(out).length + ' 条')