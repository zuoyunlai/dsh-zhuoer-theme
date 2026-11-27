#!/usr/bin/env node
/**
 * 卡片生命周期与底纹缺失提示的无头测试（R-09）。
 * 抠法与其它夹具相同：从 client.js 里抓真实实现来跑。
 *
 * 守两条规则：
 *  1) 同一会话只留一张活卡：后一张登记时，前一张必须能知道自己被取代（否则用户会照着旧卡点应用）；
 *  2) 用户要了底纹但两张都没取回时必须报出来（原来是静默退化成纯配色）。
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
// 登记表是闭包里的 const + 计数器，必须连声明一起抠（只抠函数体拿不到 zrCardLive）。
const regStart = src.indexOf('let zrCardSeq = 0;')
const regEnd = src.indexOf('function ThemeCardNode(')
if (regStart < 0 || regEnd <= regStart) throw new Error('没抠到卡片登记表')
const registry = src.slice(regStart, regEnd)
const make = new Function(registry + '\nreturn { zrClaimCard, zrCardLive, zrTexMissing };')()
const { zrClaimCard, zrCardLive, zrTexMissing } = make

let n = 0
const ok = (name, fn) => { fn(); n++; console.log('ok    ' + name) }

ok('登记即取代：id 递增，后登记的是活卡', () => {
  const a = zrClaimCard()
  assert.equal(zrCardLive.id, a)
  const b = zrClaimCard()
  assert.ok(b > a, 'id 应递增：' + a + ' -> ' + b)
  assert.equal(zrCardLive.id, b)
})

ok('旧卡的订阅能收到新 id，从而判定自己被取代', () => {
  const myId = zrClaimCard()
  const seen = []
  const fn = (liveId) => seen.push(liveId !== myId)
  zrCardLive.subs.add(fn)
  zrClaimCard()
  assert.deepEqual(seen, [true], '应收到一次「我被取代」')
  zrCardLive.subs.delete(fn)
})

ok('新登记的卡自己不会被通知（它才是活卡）', () => {
  const fired = []
  const fn = () => fired.push(1)
  zrCardLive.subs.add(fn)
  const myId = zrClaimCard()
  zrCardLive.subs.delete(fn)
  // 通知只发给「登记之前就存在」的订阅者；自己不在集合里，所以只记到一次别人的登记
  assert.equal(fired.length, 1)
  assert.equal(zrCardLive.id, myId)
})

ok('退订后不再收到通知（卸载的旧卡不该继续 setState）', () => {
  const fired = []
  const fn = () => fired.push(1)
  zrCardLive.subs.add(fn)
  zrCardLive.subs.delete(fn)
  zrClaimCard()
  assert.equal(fired.length, 0)
})

ok('订阅者抛错不影响其它订阅者（一张坏卡不该带崩整列）', () => {
  const fired = []
  const bad = () => { throw new Error('boom') }
  const good = () => fired.push(1)
  zrCardLive.subs.add(bad)
  zrCardLive.subs.add(good)
  assert.doesNotThrow(() => zrClaimCard())
  zrCardLive.subs.delete(bad)
  zrCardLive.subs.delete(good)
  assert.equal(fired.length, 1)
})

ok('底纹缺失判定：要了 + 两张都空 = 报；取到一张就不报；没要也不报', () => {
  assert.equal(zrTexMissing({ name: 'a' }, '', ''), true)
  assert.equal(zrTexMissing(null, '', ''), false, '没要底纹就不该报')
  assert.equal(zrTexMissing({ name: 'a' }, 'data:image/png;base64,x', ''), false)
  assert.equal(zrTexMissing({ name: 'a' }, '', 'data:image/png;base64,x'), false)
  assert.equal(zrTexMissing(undefined, '', ''), false)
})

console.log('')
console.log('OK    卡片生命周期：' + n + ' 例通过')
