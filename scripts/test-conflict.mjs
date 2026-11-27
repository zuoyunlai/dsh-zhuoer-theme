#!/usr/bin/env node
/**
 * A3 共存探测的纯函数测试：zrConflictOf(key, wrote, read)。
 * 从 client.js 抠出真实实现来跑（与 test-derive.mjs 同一手法），不复制、不重写，
 * 所以测的就是线上那份代码。
 * 用法：node scripts/test-conflict.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(root, 'client.js'), 'utf8')

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

const zrConflictOf = new Function('return (' + grabFn('zrConflictOf') + ')')()

const cases = [
  ['同值', '#7c8b6f', '#7c8b6f', false, 'ok'],
  ['被覆盖', '#7c8b6f', '#3a7bd5', true, 'overridden'],
  ['大小写与空白归一', ' #7C8B6F ', '#7c8b6f', false, 'ok'],
  ['读不到不下判断', '#7c8b6f', '', false, 'unknown'],
  ['写入为空不下判断', '', '#7c8b6f', false, 'unknown'],
]

let pass = 0
for (const [name, wrote, read, conflict, reason] of cases) {
  const got = zrConflictOf('--dsw-alias-label-primary', wrote, read)
  assert.equal(got.conflict, conflict, name + ' 的 conflict 判定')
  assert.equal(got.reason, reason, name + ' 的 reason')
  pass++
}
console.log('OK    共存探测：' + pass + ' 例通过')