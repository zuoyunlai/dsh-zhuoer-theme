#!/usr/bin/env node
/**
 * 内存缓存淘汰策略的无头测试：zrCachePut(map, key, value, protectedKeys)。
 * 从 client.js 抠真实实现来跑（与 test-derive.mjs 同一手法）。
 *
 * 为什么要有这道门：运行期**只同步读内存缓存**（imageCache.get），IDB 没有按 key 读回的通路——
 * 所以缓存淘汰掉一个**仍被主题引用**的键，等于那条主题的底纹静默消失。
 * 对话里生成的主题每套带两张图（明 + 暗），攒到第 7 套就越过上限；
 * 纯 LRU 会在这一轮把最早那几套的底纹全丢掉（实测：20 张里被淘汰 8 张）。
 *
 * 修法：淘汰时跳过被引用的键；全都被引用就停止淘汰（宁可多占内存）。
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
const MAX = Number(/const ZR_CACHE_MAX = (\d+);/.exec(src)[1])
const zrCachePut = new Function('ZR_CACHE_MAX', 'return (' + grabFn('zrCachePut') + ')')(MAX)

const cases = []

{
  const cache = new Map()
  for (let i = 0; i < 10; i++) { zrCachePut(cache, 'img_c' + i, 'v' + i); zrCachePut(cache, 'img_c' + i + 'b', 'v' + i) }
  cases.push(['无保护时按上限淘汰', cache.size, MAX])
  cases.push(['无保护时淘汰的是最旧的', cache.has('img_c0'), false])
}

{
  const cache = new Map()
  const keep = new Set()
  for (let i = 0; i < 10; i++) { keep.add('img_c' + i); keep.add('img_c' + i + 'b') }
  for (let i = 0; i < 10; i++) { zrCachePut(cache, 'img_c' + i, 'v' + i, keep); zrCachePut(cache, 'img_c' + i + 'b', 'v' + i, keep) }
  cases.push(['全部被引用时一张都不淘汰', cache.size, 20])
  cases.push(['最早那张仍在', cache.has('img_c0'), true])
}

{
  const cache = new Map()
  const keep = new Set(['img_c0'])
  for (let i = 0; i < 20; i++) zrCachePut(cache, 'img_c' + i, 'v' + i, keep)
  cases.push(['混合时被引用的留下', cache.has('img_c0'), true])
  cases.push(['未被引用的按上限淘汰', cache.size <= MAX + 1, true])
}

{
  const cache = new Map()
  const keep = new Set()
  for (let i = 0; i < 5; i++) zrCachePut(cache, 'k' + i, 'v', keep)
  cases.push(['没超上限时不淘汰', cache.size, 5])
  cases.push(['没超上限时最早那张还在', cache.has('k0'), true])
}

let pass = 0
for (const [name, got, want] of cases) {
  assert.equal(got, want, name)
  pass++
}
console.log('OK    缓存淘汰策略：' + pass + ' 例通过（上限 ' + MAX + '）')