#!/usr/bin/env node
/**
 * C2 等待态最小可见时长的无头测试：zrDwellDelay(elapsed, min)。
 * 从 client.js 抠真实实现与 ZR_DWELL_MS（测试里不复制数值）。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(root, 'client.js'), 'utf8')
const mm = /const ZR_DWELL_MS = (\d+);/.exec(src)
if (!mm) { console.error('[test-dwell] 找不到 ZR_DWELL_MS'); process.exit(1) }
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
const zrDwellDelay = new Function('return (' + grabFn('zrDwellDelay') + ')')()

const cases = [
  ['秒回 → 补齐到下限', 80, MIN, MIN - 80],
  ['刚好到下限 → 不等', MIN, MIN, 0],
  ['超过下限 → 不等', 2500, MIN, 0],
  ['非法 elapsed 当 0', 'x', MIN, MIN],
]
let pass = 0
for (const [name, el, min, want] of cases) {
  assert.equal(zrDwellDelay(el, min), want, name)
  pass++
}
assert.ok(MIN > 0 && MIN < 3000, '最小可见时长应当是个小常数')
console.log('OK    等待态最小可见：' + pass + ' 例通过（' + MIN + 'ms）')