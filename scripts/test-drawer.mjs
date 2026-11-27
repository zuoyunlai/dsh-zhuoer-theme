#!/usr/bin/env node
/**
 * C1 抽屉宽度收敛的无头测试：zrClampEdW(v)。
 * 从 client.js 抠真实实现与三个常量（测试里不复制数值）。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(root, 'client.js'), 'utf8')
const pick = (name) => {
  const m = new RegExp('const ' + name + ' = (\\d+);').exec(src)
  if (!m) throw new Error('找不到常量 ' + name)
  return Number(m[1])
}
const DEF = pick('ZR_ED_W_DEFAULT')
const MIN = pick('ZR_ED_W_MIN')
const MAX = pick('ZR_ED_W_MAX')
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
const zrClampEdW = new Function('ZR_ED_W_DEFAULT', 'ZR_ED_W_MIN', 'ZR_ED_W_MAX', 'return (' + grabFn('zrClampEdW') + ')')(DEF, MIN, MAX)

const cases = [
  ['没有存过宽度 → 默认', undefined, DEF],
  ['太小 → 下限', 100, MIN],
  ['太大 → 上限', 9999, MAX],
  ['取整', 501.6, 502],
  ['非法值 → 默认', 'abc', DEF],
]
let pass = 0
for (const [name, input, want] of cases) {
  assert.equal(zrClampEdW(input), want, name)
  pass++
}
assert.ok(MIN < DEF && DEF < MAX, '默认值应落在上下限之间')
console.log('OK    抽屉宽度：' + pass + ' 例通过（' + MIN + '–' + MAX + '，默认 ' + DEF + '）')