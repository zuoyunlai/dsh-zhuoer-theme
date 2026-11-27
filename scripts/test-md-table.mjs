#!/usr/bin/env node
/**
 * 表格精细化 CSS 的无头测试（真机反馈：首列内容贴着竖线）。
 * 从 client.js 抓 zrTableFineCss 的真实实现来跑。
 *
 * 背景（宿主 CSS 实测，见函数注释）：宿主把 th/td 的 padding 设成 10px 16px，
 * 但**首列左、末列右刻意归零**（.td:first-child{padding-left:0}，特异性 (0,2,1)），
 * 为的是让表格文字与正文左缘对齐。我们只在不画边框时沿用这个对齐；
 * 一旦画边框（line/zebra），必须把首末列内边距补回来，否则胶囊色块紧贴竖线。
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
const zrTableFineCss = new Function('', grabFn('zrTableFineCss') + '\nreturn zrTableFineCss;')()
const MDC = 'html body [class*="_markdown_"]'

let n = 0
const ok = (name, fn) => { fn(); n++; console.log('ok    ' + name) }

ok('plain / 缺省 / 未知档位：不产出任何规则（保持宿主的左缘对齐）', () => {
  assert.equal(zrTableFineCss(MDC, 'plain'), '')
  assert.equal(zrTableFineCss(MDC, undefined), '')
  assert.equal(zrTableFineCss(MDC, 'bogus'), '')
})

ok('line 档：首列左、末列右的内边距必须补回来（本次真机反馈的修复点）', () => {
  const css = zrTableFineCss(MDC, 'line')
  assert.ok(css.includes(':where(th,td):first-child{padding-left:10px;}'), '缺首列补丁：' + css)
  assert.ok(css.includes(':where(th,td):last-child{padding-right:10px;}'), '缺末列补丁：' + css)
})

ok('line 档：边框与基础内边距仍在（不是把边框去掉换个形状）', () => {
  const css = zrTableFineCss(MDC, 'line')
  assert.ok(css.includes('border:1px solid var(--dsw-alias-border-l2)'))
  assert.ok(css.includes('padding:6px 10px;'))
  assert.equal((css.match(/border:1px solid/g) || []).length, 1)
})

ok('zebra 档：在 line 的基础上多出表头底色与偶数行底色', () => {
  const css = zrTableFineCss(MDC, 'zebra')
  assert.ok(css.includes('thead th{background:var(--dsw-alias-bg-layer-1);font-weight:600;}'))
  assert.ok(css.includes('tbody tr:nth-child(even){background:var(--dsw-alias-bg-layer-1);}'))
  assert.ok(css.includes(':first-child{padding-left:10px;}'))
})

ok('每条规则都带前缀：漏前缀会让特异性从 (0,2,2) 塌回 (0,1,0)，补丁等于没写', () => {
  const css = zrTableFineCss(MDC, 'zebra')
  const rules = css.split('}').filter((s) => s.trim())
  assert.ok(rules.length >= 6, '规则条数 ' + rules.length)
  for (const r of rules) assert.ok(r.trim().startsWith(MDC), '这条没带前缀：' + r.slice(0, 60))
})

ok('前缀为空时也不抛错（宿主拼装用不到，但别留坑）', () => {
  assert.doesNotThrow(() => zrTableFineCss('', 'line'))
  assert.ok(zrTableFineCss('', 'line').includes('table{border-collapse:collapse;}'))
})

console.log('')
console.log('OK    表格精细化 CSS：' + n + ' 例通过')
