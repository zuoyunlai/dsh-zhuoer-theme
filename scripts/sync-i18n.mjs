#!/usr/bin/env node
/**
 * 把 i18n/*.json 同步成 src/05-i18n.js 里的内联词典。
 *
 * 为什么要有这一步：客户端插件必须是单文件（宿主会把插件合并进 /plugins/??a,b,c，
 * 相对 import 不可靠），所以词典最终要内联。但词典是**要频繁改的**，
 * 所以真源放 i18n/*.json（人可读、可 diff、便于机器做键集一致性检查），
 * 由本脚本生成内联块。
 *
 * 用法：
 *   node scripts/sync-i18n.mjs           写入 src/05-i18n.js
 *   node scripts/sync-i18n.mjs --check   只比对是否一致（不一致退出 1）
 *
 * 标记：src/05-i18n.js 里 // >>> i18n:begin 与 // <<< i18n:end 之间是生成区，勿手改。
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const localeDir = join(root, 'i18n')
const target = join(root, 'src', '05-i18n.js')
const BEGIN = '// >>> i18n:begin'
const END = '// <<< i18n:end'

function esc(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

const files = readdirSync(localeDir).filter((f) => f.endsWith('.json')).sort()
if (!files.length) throw new Error('i18n/ 下没有 *.json')
const locales = files.map((f) => ({
  name: f.replace(/\.json$/, ''),
  dict: JSON.parse(readFileSync(join(localeDir, f), 'utf8')),
}))
// zh 在前、en 其次，其余按字母序——保证生成结果稳定（字节可比对）
locales.sort((a, b) => {
  const rank = (n) => (n === 'zh' ? 0 : n === 'en' ? 1 : 2)
  return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name)
})

const lines = ['    const I18N = {']
for (const L of locales) {
  lines.push('      ' + L.name + ': {')
  for (const k of Object.keys(L.dict)) {
    lines.push("        '" + k + "': '" + esc(L.dict[k]) + "',")
  }
  lines.push('      },')
}
lines.push('    }')
const generated = lines.join('\n')

const src = readFileSync(target, 'utf8')
const bi = src.indexOf(BEGIN)
const ei = src.indexOf(END)
if (bi < 0 || ei < 0 || ei < bi) throw new Error('src/05-i18n.js 缺少 i18n 标记')
const head = src.slice(0, bi + BEGIN.length)
const tail = src.slice(ei)
const next = head + '\n' + generated + '\n    ' + tail

if (process.argv.includes('--check')) {
  if (next !== src) { console.error('FAIL    src/05-i18n.js 与 i18n/*.json 不一致（跑 npm run sync:i18n）'); process.exit(1) }
  console.log('OK    i18n 内联块与 i18n/*.json 一致（' + locales.length + ' 种语言）')
} else {
  writeFileSync(target, next, 'utf8')
  console.log('OK    已同步 i18n 内联块：' + locales.length + ' 种语言 / ' + locales[0].dict ? 'ok' : 'ok')
}