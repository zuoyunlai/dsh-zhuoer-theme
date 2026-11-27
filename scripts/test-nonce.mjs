#!/usr/bin/env node
/**
 * 会话随机数过期判定的无头测试：zrIsStaleNonce(status)。
 * 从 client.js 抠真实实现来跑（与 test-derive.mjs 同一手法）。
 *
 * 为什么要有这道门：客户端把 nonce 缓存住，服务端却在每次插件装载时换新的
 * （index.js 的 makeNonce）。插件重载后客户端手里那个已过期，服务端一律 403，
 * 而客户端会一直拿旧的重试——永远好不了。403 的处置是「清缓存重领一次」。
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
const zrIsStaleNonce = new Function('return (' + grabFn('zrIsStaleNonce') + ')')()

const cases = [
  ['403 → nonce 过期', 403, true],
  ['200 → 正常', 200, false],
  ['400 → 不重试', 400, false],
  ['502 → 不重试（上游失败，重试只会再烧一次额度）', 502, false],
  ['503 → 不重试', 503, false],
  ['字符串 403 也认', '403', true],
]
let pass = 0
for (const [name, status, want] of cases) {
  assert.equal(zrIsStaleNonce(status), want, name)
  pass++
}
console.log('OK    nonce 过期判定：' + pass + ' 例通过')