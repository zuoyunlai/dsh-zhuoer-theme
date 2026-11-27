#!/usr/bin/env node
/**
 * 诊断上报 body 收集的无头测试：zrBodyCollector(limit, head)（从 index.js 导出）。
 *
 * 为什么要有这道门：这段逻辑的**行为变化**只有真发一个 >200 KB 的请求才看得到，
 * 而宿主侧（index.js）改动要重启 DSH 才生效——每次验都要重启宿主，代价太高。
 * 抽成纯函数后，无头测试就能守住规则。
 *
 * 要守的规则：
 *   1) 没超限时，body 原样累加（诊断信息不能丢）；
 *   2) 超限后立刻停止累加（不再有 O(n) 拷贝）；
 *   3) 超限后只留头部 head 字供排障；
 *   4) truncated 标记必须为真——落盘行里没有它就分不出「截断了」与「本来就短」。
 */
import { zrBodyCollector } from '../index.js'
import assert from 'node:assert/strict'

const cases = []

{
  const c = zrBodyCollector(200000, 2000)
  c.push('{"phase":"x"}')
  const r = c.result()
  cases.push(['小请求原样保留', r.body, '{"phase":"x"}'])
  cases.push(['小请求不标截断', r.truncated, false])
}

{
  const c = zrBodyCollector(200000, 2000)
  for (let i = 0; i < 300; i++) c.push('x'.repeat(1000))
  const r = c.result()
  cases.push(['超限后只留头部', r.body.length, 2000])
  cases.push(['超限有标记', r.truncated, true])
  cases.push(['超限后不再累加', r.body.length < 300000, true])
}

{
  const c = zrBodyCollector(200000, 2000)
  c.push('x'.repeat(250000))
  const r1 = c.result()
  c.push('y'.repeat(50000))
  const r2 = c.result()
  cases.push(['超限后再来的 chunk 不改变结果', r2.body.length, r1.body.length])
  cases.push(['超限后再来的 chunk 不含新内容', r2.body.indexOf('y'), -1])
}

{
  const c = zrBodyCollector(100, 10)
  c.push('a'.repeat(150))
  const r = c.result()
  cases.push(['自定义上限生效', r.body.length, 10])
  cases.push(['自定义上限也有标记', r.truncated, true])
}

{
  const c = zrBodyCollector(0, 0)
  c.push('abc')
  const r = c.result()
  cases.push(['非法上限回落默认值', r.body, 'abc'])
}

let pass = 0
for (const [name, got, want] of cases) {
  assert.equal(got, want, name)
  pass++
}
console.log('OK    诊断 body 收集：' + pass + ' 例通过')