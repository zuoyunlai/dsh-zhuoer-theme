#!/usr/bin/env node
/**
 * B1 隔离状态机的无头测试：isolationReducer(state, event)。
 * 从 client.js 抠出真实实现与 ZR_ISOLATION_LIMIT 来跑（与 test-derive.mjs 同一手法），
 * 测的是线上那份代码，阈值也不在测试里复制一份。
 * 用法：node scripts/test-isolation.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(root, 'client.js'), 'utf8')

const lm = /const ZR_ISOLATION_LIMIT = (\d+);/.exec(src)
if (!lm) {
  console.error('[test-isolation] client.js 里找不到 ZR_ISOLATION_LIMIT')
  process.exit(1)
}
const LIMIT = Number(lm[1])

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
const isolationReducer = new Function('ZR_ISOLATION_LIMIT', 'return (' + grabFn('isolationReducer') + ')')(LIMIT)

const S0 = { fails: 0, offline: false, tries: 0 }
const run = (state, kinds) => kinds.reduce((s, k) => isolationReducer(s, { kind: k }), state)

const cases = [
  ['单次临时错误不离线', run(S0, ['transient']), { fails: 1, offline: false }],
  ['两次临时错误仍不离线', run(S0, ['transient', 'transient']), { fails: 2, offline: false }],
  ['连续三次临时错误离线', run(S0, ['transient', 'transient', 'transient']), { fails: 3, offline: true }],
  ['离线后成功即清零', run(S0, ['transient', 'transient', 'transient', 'success']), { fails: 0, offline: false }],
  ['参数错误不计数', run(S0, ['argError', 'argError']), { fails: 0, offline: false }],
  ['明确不可用立即离线', isolationReducer(S0, { kind: 'fatal' }), { fails: LIMIT, offline: true }],
  ['离线期间再临时错误仍是离线', run(S0, ['transient', 'transient', 'transient', 'transient']), { fails: 4, offline: true }],
  ['状态损坏按零处理', isolationReducer(null, { kind: 'transient' }), { fails: 1, offline: false }],
]

let pass = 0
for (const [name, got, want] of cases) {
  assert.equal(got.fails, want.fails, name + ' 的 fails')
  assert.equal(got.offline, want.offline, name + ' 的 offline')
  pass++
}
assert.ok(LIMIT >= 2, '阈值不该小于 2（一次即弃就是原设计缺陷）')
console.log('OK    隔离状态机：' + pass + ' 例通过（阈值 ' + LIMIT + '）')