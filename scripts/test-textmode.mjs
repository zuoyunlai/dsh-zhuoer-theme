#!/usr/bin/env node
/**
 * B4 覆盖率判据的无头测试：zrTextCoverage(have, total)。
 * 从 client.js 抠真实实现与阈值（测试里不复制常量）。
 * 用法：node scripts/test-textmode.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(root, 'client.js'), 'utf8')
const mm = /const ZR_TEXT_COVER_MIN = ([0-9.]+);/.exec(src)
if (!mm) { console.error('[test-textmode] 找不到 ZR_TEXT_COVER_MIN'); process.exit(1) }
const MIN = Number(mm[1])

const grabFn = (name) => {
  const i = src.indexOf('function ' + name + '(')
  if (i < 0) throw new Error('找不到 function ' + name)
  const open = src.indexOf('{', i)
  let depth = 0, j = open, inS = false, esc = false
  for (; j < src.length; j++) {
    const c = src[j]
    if (inS) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inS = false; continue }
    if (c === '"') { inS = true; continue }
    if (c === '{') depth++
    else if (c === '}') { depth--; if (depth === 0) { j++; break } }
  }
  return src.slice(i, j)
}
const zrTextCoverage = new Function('ZR_TEXT_COVER_MIN', 'return (' + grabFn('zrTextCoverage') + ')')(MIN)

const cases = [
  ['全读到', 1700, 1700, 'cssom', 100],
  ['只读到 30 条（旧判据会误判为完整）', 30, 1700, 'table-fallback', 2],
  ['恰好踩在阈值上', Math.round(1700 * MIN), 1700, 'cssom', Math.round(MIN * 100)],
  ['一条都读不到', 0, 1700, 'table-fallback', 0],
  ['没有静态表可对（total=0）', 5, 0, 'unknown', 0],
]
let pass = 0
for (const [name, have, total, mode, pct] of cases) {
  const got = zrTextCoverage(have, total)
  assert.equal(got.mode, mode, name + ' 的 mode')
  assert.equal(got.pct, pct, name + ' 的 pct')
  pass++
}
assert.ok(MIN > 0 && MIN < 1, '覆盖率阈值应当在 0 与 1 之间')
console.log('OK    字号覆盖率：' + pass + ' 例通过（阈值 ' + MIN + '）')