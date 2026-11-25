#!/usr/bin/env node
/**
 * i18n 棘轮门：裸中文**只许减少，不许增加**。
 *
 * 为什么不是「一律不许有中文」：P1–P3 还没做完，面板里还有 200 多处待抽键；
 * 现在就把判据设成 0 会直接红一整周，门就会被关掉——那才是最坏的结果。
 * 所以按「每个文件的裸中文字面量条数」记基线，**增加即红**，减少则提示可以 --update。
 *
 * 判据（与 docs/i18n-plan.md §6 对齐的当前可执行部分）：
 *   1. 扫描 src/ 下各分片的字符串字面量（先剥行/块注释），统计含 CJK 的字面量条数；
 *   2. src/05-i18n.js 是词典真源，不计入；
 *   3. 任一文件条数 > 基线 → FAIL；全部 <= 基线 → PASS（并提示可收紧基线）。
 * 占位符一致性、键集合相等、宿主命名空间子集检查，等 P1–P3 落地后加（见规划 §6）。
 *
 * 用法：
 *   node scripts/verify-i18n.mjs           对账
 *   node scripts/verify-i18n.mjs --update  把当前条数写成新基线（只能收紧或不变）
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'src')
const baselinePath = join(root, 'contracts', 'i18n-baseline.json')
const DICT_FILE = 'src/05-i18n.js'
const CJK = /[\u3400-\u4dbf\u4e00-\u9fff]/

/** 剥掉行注释与块注释，保留字符串（字符串里的 // 不能被当注释）。 */
function stripComments(s) {
  let out = ''
  let i = 0
  let quote = null
  while (i < s.length) {
    const c = s[i]
    const n = s[i + 1]
    if (quote) {
      out += c
      if (c === '\\') { out += n ?? ''; i += 2; continue }
      if (c === quote) quote = null
      i++
      continue
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; out += c; i++; continue }
    if (c === '/' && n === '/') { const e = s.indexOf('\n', i); i = e < 0 ? s.length : e; continue }
    if (c === '/' && n === '*') { const e = s.indexOf('*/', i + 2); i = e < 0 ? s.length : e + 2; continue }
    out += c
    i++
  }
  return out
}

/** 统计「含 CJK 的字符串字面量」条数。 */
function countCjkLiterals(code) {
  const s = stripComments(code)
  let i = 0
  let hits = 0
  while (i < s.length) {
    const c = s[i]
    if (c === '"' || c === "'" || c === '`') {
      const quote = c
      let j = i + 1
      let body = ''
      while (j < s.length) {
        if (s[j] === '\\') { body += s[j + 1] ?? ''; j += 2; continue }
        if (s[j] === quote) break
        body += s[j]
        j++
      }
      if (CJK.test(body)) hits++
      i = j + 1
      continue
    }
    i++
  }
  return hits
}

const files = readdirSync(srcDir).filter((f) => f.endsWith('.js')).sort()
const counts = {}
for (const f of files) {
  const rel = 'src/' + f
  const code = readFileSync(join(srcDir, f), 'utf8')
  counts[rel] = rel === DICT_FILE ? 0 : countCjkLiterals(code)
}
const total = Object.values(counts).reduce((a, b) => a + b, 0)

const update = process.argv.includes('--update')
if (update) {
  writeFileSync(baselinePath, JSON.stringify({
    $comment: 'i18n 棘轮基线：每个文件的裸中文字面量条数。只许减少；改完跑 node scripts/verify-i18n.mjs --update 收紧。',
    files: counts,
    total,
  }, null, 2) + '\n')
  console.log('WROTE i18n 基线：' + Object.keys(counts).length + ' 个文件，合计 ' + total + ' 条裸中文')
  process.exit(0)
}

let baseline
try {
  baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
} catch (e) {
  console.error('FAIL  没有基线（先跑 node scripts/verify-i18n.mjs --update 建一次）')
  process.exit(1)
}

const worse = []
const better = []
for (const [rel, n] of Object.entries(counts)) {
  const was = baseline.files && typeof baseline.files[rel] === 'number' ? baseline.files[rel] : 0
  if (n > was) worse.push({ rel, was, now: n })
  else if (n < was) better.push({ rel, was, now: n })
}

console.log('裸中文基线：合计 ' + (baseline.total ?? '?') + ' 条；当前 ' + total + ' 条' +
  '（词典真源 ' + DICT_FILE + ' 不计）')

if (worse.length) {
  console.error('')
  for (const w of worse) console.error('  ADDED    ' + w.rel + '：' + w.was + ' → ' + w.now + ' 条裸中文')
  console.error('\nFAIL  ' + worse.length + ' 个文件的裸中文变多了。文案请写进 src/05-i18n.js 的 I18N，再 t(\'key\') 取。')
  process.exit(1)
}
if (better.length) {
  for (const b of better) console.log('  LESS     ' + b.rel + '：' + b.was + ' → ' + b.now + '（可 --update 收紧基线）')
}
console.log('PASS  裸中文没有增加')
