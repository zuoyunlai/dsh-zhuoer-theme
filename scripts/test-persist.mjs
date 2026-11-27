#!/usr/bin/env node
/**
 * 持久化合并的无头测试：zrMergePref(raw, patch, maxCount, specV)。
 * 从 client.js 抠出真实实现来跑（与 test-derive.mjs 同一手法），不复制、不重写。
 *
 * 测的是三件曾经会咬人的事：
 *   1) 读→写往返不再丢超限的自定义主题；
 *   2) 派生字段（droppedCustomIds）不落盘；
 *   3) 形状版本 specV 只增不减。
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
const zrMergePref = new Function('return (' + grabFn('zrMergePref') + ')')()

const MAX = 24
const SPEC = 1
const mk = (n) => Array.from({ length: n }, (_, i) => ({ id: 't' + i }))

const cases = []

// 1) 读→写往返：存档 30 套，只改一个无关设置 → 30 套必须还在
{
  const raw = { customThemes: mk(30), fontScale: 100 }
  const out = zrMergePref(raw, { fontScale: 110 }, MAX, SPEC)
  cases.push(['超限主题在写回后仍保留', out.customThemes.length, 30])
}

// 2) 调用方给的是「它看得见的那批」：这部分以调用方为准（删除场景），
//    而存档里超出上限的那一段仍然保留——调用方看不见它们，不该被顺手删掉。
//    存档 30 套、调用方只给 5 套 → 5 + 存档里第 25~30 套（6 套）= 11
{
  const raw = { customThemes: mk(30) }
  const visible = mk(5)
  const out = zrMergePref(raw, { customThemes: visible }, MAX, SPEC)
  cases.push(['可见部分以调用方为准、超限段保留', out.customThemes.length, 11])
  cases.push(['超限段仍是原来那 6 套', out.customThemes.slice(5).map((c) => c.id).join(','), 't24,t25,t26,t27,t28,t29'])
}

// 2b) 调用方删掉的可见项不复活
{
  const raw = { customThemes: mk(30) }
  const visible = mk(24).filter((c) => c.id !== 't3')
  const out = zrMergePref(raw, { customThemes: visible }, MAX, SPEC)
  cases.push(['被删的可见项不复活', out.customThemes.some((c) => c.id === 't3'), false])
  cases.push(['可见 23 + 超限 6', out.customThemes.length, 29])
}

// 3) 派生字段不落盘
{
  const raw = { customThemes: mk(3), droppedCustomIds: ['x'], specFromNewer: true }
  const out = zrMergePref(raw, { fontScale: 100 }, MAX, SPEC)
  cases.push(['droppedCustomIds 不落盘', 'droppedCustomIds' in out, false])
  cases.push(['specFromNewer 不落盘', 'specFromNewer' in out, false])
}

// 4) specV 只增不减
{
  cases.push(['旧存档写入后补上版本号', zrMergePref({}, { a: 1 }, MAX, SPEC).specV, SPEC])
  cases.push(['新版本存档不被降级', zrMergePref({ specV: 9 }, { a: 1 }, MAX, SPEC).specV, 9])
  cases.push(['同版本保持不变', zrMergePref({ specV: SPEC }, { a: 1 }, MAX, SPEC).specV, SPEC])
}

// 5) 其它字段不被覆盖成默认值
{
  const raw = { customThemes: mk(3), uiFont: 'Inter', chatWidth: 900, accent: '#aabbcc' }
  const out = zrMergePref(raw, { fontScale: 110 }, MAX, SPEC)
  cases.push(['未涉及的偏好保持原值', out.uiFont + '|' + out.chatWidth + '|' + out.accent, 'Inter|900|#aabbcc'])
}

// 6) 脏输入不炸
{
  cases.push(['raw 为 null 时不抛', zrMergePref(null, { a: 1 }, MAX, SPEC).a, 1])
  cases.push(['patch 为 null 时不抛', typeof zrMergePref({ a: 1 }, null, MAX, SPEC), 'object'])
}

let pass = 0
for (const [name, got, want] of cases) {
  assert.equal(got, want, name)
  pass++
}
console.log('OK    持久化合并：' + pass + ' 例通过')