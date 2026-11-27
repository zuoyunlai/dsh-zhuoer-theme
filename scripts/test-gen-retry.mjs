#!/usr/bin/env node
/**
 * 生成解析失败的可诊断化 + 自动重试（报告 §9.1）的无头测试。
 * 直接 import theme-gen.js 导出的两个纯函数 —— 测线上那份实现。
 *
 * 守三条：
 *  1) 「空响应 / 散文 / 坏 JSON」三种失败必须能从错误对象上区分出来（原来是同一个字符串）；
 *  2) 原始输出要带在错误上，且截断到上限（排障够用，又不会把整段输出塞进文件）；
 *  3) 只在「模型侧抖了」时重试；finish 明确报错不重试（那只会多烧一次额度）。
 */
import { zrGenShouldRetry, zrGenParseFailure, ZR_GEN_RAW_MAX, parseThemeSpec } from '../theme-gen.js'
import assert from 'node:assert/strict'

let n = 0
const ok = (name, fn) => { fn(); n++; console.log('ok    ' + name) }

const good = JSON.stringify({
  label: '暖砂',
  light: {
    '--dsw-alias-bg-base': '#f7f2e9', '--dsw-alias-label-primary': '#2b2620',
    '--dsw-alias-border-l1': '#e3d8c7', '--dsw-alias-brand-primary': '#a85b3c',
  },
})
assert.ok(parseThemeSpec(good), '前提：这份 JSON 本身应能解析')

ok('空响应 / 散文 / 坏 JSON 都该重试一次', () => {
  assert.equal(zrGenShouldRetry('', null), true)
  assert.equal(zrGenShouldRetry('   ', null), true)
  assert.equal(zrGenShouldRetry('当然可以！下面是一套温暖的主题：', null), true)
  assert.equal(zrGenShouldRetry('{"label":', null), true)
})

ok('能解析出 ≥4 个锚点时不该重试', () => {
  assert.equal(zrGenShouldRetry(good, null), false)
})

ok('finish 明确报错时不重试（额度/鉴权/abort 重试只是浪费）', () => {
  const fin = { kind: 'error', failure: { code: 'RATE_LIMIT' } }
  assert.equal(zrGenShouldRetry('', fin), false)
  assert.equal(zrGenShouldRetry('散文', fin), false)
})

ok('空响应：message 指明 empty，bytes=0，raw 为空串', () => {
  const e = zrGenParseFailure('bad-json', '', null)
  assert.equal(e.code, 'theme-parse-failed')
  assert.equal(e.reason, 'empty')
  assert.equal(e.empty, true)
  assert.equal(e.bytes, 0)
  assert.equal(e.raw, '')
  assert.ok(e.message.indexOf(':empty') !== -1, 'message 应能一眼看出是空响应，实得 ' + e.message)
})

ok('非空坏 JSON：reason=bad-json，raw 原样带出', () => {
  const body = '{"label":"半个"'
  const e = zrGenParseFailure('bad-json', body, null)
  assert.equal(e.reason, 'bad-json')
  assert.equal(e.empty, false)
  assert.equal(e.bytes, body.length)
  assert.equal(e.raw, body)
  assert.ok(e.message.indexOf('bad-json') !== -1)
})

ok('原始输出截断到 ZR_GEN_RAW_MAX，但 bytes 记全长', () => {
  const body = 'x'.repeat(ZR_GEN_RAW_MAX * 3)
  const e = zrGenParseFailure('bad-json', body, null)
  assert.equal(e.raw.length, ZR_GEN_RAW_MAX)
  assert.equal(e.bytes, body.length)
  assert.ok(ZR_GEN_RAW_MAX > 0 && ZR_GEN_RAW_MAX <= 4096)
})

ok('finish 原因透传：截断与空响应可以在 finish 上再分一层', () => {
  assert.deepEqual(zrGenParseFailure('bad-json', 'x', { kind: 'stop' }).finish, { kind: 'stop' })
  assert.deepEqual(
    zrGenParseFailure('bad-json', 'x', { kind: 'error', failure: { code: 'MAX_TOKENS' } }).finish,
    { kind: 'error', code: 'MAX_TOKENS' },
  )
  assert.equal(zrGenParseFailure('bad-json', 'x', null).finish, null)
})

ok('坏 finish 值不抛错（finish 是宿主给的，形状不可控）', () => {
  const weird = { get kind() { throw new Error('boom') } }
  assert.doesNotThrow(() => zrGenParseFailure('bad-json', 'x', weird))
  assert.equal(zrGenParseFailure('bad-json', 'x', weird).finish, null)
})

console.log('')
console.log('OK    生成解析诊断：' + n + ' 例通过（raw 上限 ' + ZR_GEN_RAW_MAX + ' 字符）')
