#!/usr/bin/env node
/**
 * CSS 值转义的无头测试：cssUrl(v) / cssStr(v)。
 * 从 client.js 抠真实实现来跑（与 test-derive.mjs 同一手法）。
 *
 * 为什么要有这道门：底图、品牌图、界面字体名是**用户可控**的字符串，被拼进注入的样式表。
 * 一个双引号就能提前闭合 url(") 并注入任意 CSS。拼接处必须统一走转义，
 * 而不是指望每个字段各自记得校验。
 *
 * 断言方式：**不比对字面量，比安全性质**——转义后的输出里不允许出现任何「没被反斜杠
 * 挡住」的危险字符（引号、括号、空白、花括号、反斜杠）。这样实现怎么改都判得住，
 * 也不会像字面量断言那样在换一种等价写法时误报。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(root, 'client.js'), 'utf8')

// 这两个函数的正则字符类里含一个双引号（[\\"'()\s{}]），会骗过按引号计数的括号扫描器，
// 所以这里改用缩进定位：函数体在工厂函数里固定是 4 空格缩进，结尾是单独一行「    }」。
const grabFn = (name) => {
  const start = src.indexOf('function ' + name + '(')
  if (start < 0) throw new Error('找不到 function ' + name)
  const endMark = '\n    }'
  const end = src.indexOf(endMark, start)
  if (end < 0) throw new Error('找不到 ' + name + ' 的结尾')
  return src.slice(start, end + endMark.length)
}
const cssUrl = new Function('return (' + grabFn('cssUrl') + ')')()
const cssStr = new Function('return (' + grabFn('cssStr') + ')')()

/**
 * 找出所有「没被转义挡住」的危险字符。
 * 扫描按转义对消费：遇到反斜杠就跳过它和下一个字符（那一对是「转义 + 被转义者」），
 * 所以 `\\`（转义后的反斜杠）与 `\\"`（转义后的引号）都不算危险。
 */
function rawDanger(out, chars) {
  const hits = []
  for (let i = 0; i < out.length; i++) {
    const c = out[i]
    if (c === '\\') { i++; continue }
    if (chars.indexOf(c) === -1) continue
    hits.push(c + '@' + i)
  }
  return hits
}

const URL_DANGER = '"\'()\\ \t\n{}'
const STR_DANGER = '"\\'

const payloads = [
  'x"); } html { background:url(https://evil.example/x) } .y{',
  "x'); } html { background:url(https://evil.example/x) } .y{",
  'a\\',
  'a b',
  'data:image/png;base64,AAAA',
]

let pass = 0
for (const p of payloads) {
  const u = cssUrl(p)
  assert.deepEqual(rawDanger(u, URL_DANGER), [], 'cssUrl 仍留有未转义的危险字符：' + JSON.stringify(p))
  const s = cssStr(p)
  assert.deepEqual(rawDanger(s, STR_DANGER), [], 'cssStr 仍留有未转义的危险字符：' + JSON.stringify(p))
  pass += 2
}

assert.equal(cssUrl('/assets/bg/bg-zhuoer.webp'), '/assets/bg/bg-zhuoer.webp', '普通路径应原样保留')
assert.equal(cssUrl(null), '', 'null 应转成空串')
assert.equal(cssStr(null), '', 'null 应转成空串')
assert.equal(cssUrl(undefined), '', 'undefined 应转成空串')
pass += 4

// 反回归：注入载荷里那个闭合引号必须被转义（否则整段 CSS 会被并进 url()）。
assert.ok(cssUrl('x")').indexOf('\\"') !== -1, '闭合引号没有被转义')
pass += 1

console.log('OK    CSS 转义：' + pass + ' 项通过')