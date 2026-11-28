#!/usr/bin/env node
/**
 * 逐 token 说明的覆盖率门。
 *
 * 为什么需要它：说明是「手写文案 ↔ 代码里的 token 列表」两处各自演进的东西。
 * 加了 token 忘了写说明，面板上那一行就是空的；删了 token 忘了删文案，
 * 就留下一批永远不会显示的键。两种漂都只能靠对账发现。
 *
 * 判三条：
 *   1. ANCHOR_GROUPS 里每个 token（含 8 个锚点自己）都有 tok.<去掉前缀的名>；
 *   2. 没有孤立键（文案在、token 没了）；
 *   3. 8 种语言的 tok.* 键集一致（否则某种语言会静默缺行）。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(root, 'src', '12-theme-derive.js'), 'utf8')
const begin = src.indexOf('const ANCHOR_GROUPS')
if (begin < 0) { console.error('FAIL  找不到 ANCHOR_GROUPS'); process.exit(1) }
const end = src.indexOf('\n    ];', begin)
if (end < 0) { console.error('FAIL  找不到 ANCHOR_GROUPS 结束'); process.exit(1) }
const body = src.slice(begin, end)

const slugOf = (tok) => tok.replace('--dsw-alias-', '').replace('--dsw-', '')
const tokens = new Set()
for (const m of body.matchAll(/\[\s*'(--dsw-[a-z0-9-]+)'/g)) tokens.add(slugOf(m[1]))
for (const m of body.matchAll(/anchor:\s*'(--dsw-[a-z0-9-]+)'/g)) tokens.add(slugOf(m[1]))

const dir = join(root, 'i18n')
const langs = readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
const have = new Map()
for (const f of langs) {
  const dict = JSON.parse(readFileSync(join(dir, f), 'utf8'))
  have.set(f, new Set(Object.keys(dict).filter((k) => k.startsWith('tok.')).map((k) => k.slice(4))))
}

let pass = 0
const fail = []
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log('ok    ' + name + (detail ? '  — ' + detail : '')) }
  else fail.push(name + (detail ? '  — ' + detail : ''))
}

const zh = have.get('zh.json')
const missing = [...tokens].filter((t) => !zh.has(t))
check('每个 token 都有说明', missing.length === 0, missing.length ? '缺 ' + missing.join(', ') : tokens.size + ' 个全覆盖')
const orphans = [...zh].filter((k) => !tokens.has(k))
check('没有孤立键', orphans.length === 0, orphans.length ? '多 ' + orphans.join(', ') : '0 个')

for (const f of langs) {
  const set = have.get(f)
  const diff = [...zh].filter((k) => !set.has(k)).concat([...set].filter((k) => !zh.has(k)))
  check('键集一致 ' + f, diff.length === 0, diff.length ? diff.slice(0, 5).join(', ') : String(set.size) + ' 键')
}

if (fail.length) {
  console.error('\nFAIL  逐 token 说明：' + fail.length + ' 项不通过')
  for (const f of fail) console.error('      ' + f)
  process.exit(1)
}
console.log('\nOK    逐 token 说明：' + pass + ' 项通过（' + tokens.size + ' 个 token × ' + langs.length + ' 种语言）')
