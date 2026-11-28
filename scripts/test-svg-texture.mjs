#!/usr/bin/env node
/**
 * 矢量底纹（SVG）校验的无头测试：zrValidateSvg（从 theme-tool.js 导出）。
 *
 * 为什么拒绝比清洗更好：清洗器漏一条就是一整类风险（XSS / 外部请求 / 位图偷渡），
 * 而"悄悄清洗成安全的"会让作者以为自己的素材原样生效了。所以这里逐条测「该红必须红」。
 *
 * 另外测两件容易写错的事：
 *   1) 合法的 XML 头 + DOCTYPE 必须放行（很多导出工具都会带）；
 *   2) viewBox 缺失时必须拒——没有它，background-size:cover 没有可依据的坐标系。
 */
import { zrValidateSvg, ZR_SVG_MAX } from '../theme-tool.js'
import assert from 'node:assert/strict'

const SVG = (body, attrs = 'viewBox="0 0 100 60"') =>
  '<svg xmlns="http://www.w3.org/2000/svg" ' + attrs + '>' + body + '</svg>'

let pass = 0
const ok = (name, fn) => { fn(); pass++; console.log('ok    ' + name) }

// ---- 必须放行 ----
ok('最小合法 SVG', () => {
  assert.equal(zrValidateSvg(SVG('')).ok, true)
})
ok('带 XML 声明', () => {
  assert.equal(zrValidateSvg('<?xml version="1.0" encoding="UTF-8"?>\n' + SVG('<path d="M0 0L10 10"/>')).ok, true)
})
ok('带 XML 声明 + DOCTYPE', () => {
  const s = '<?xml version="1.0"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">' + SVG('')
  assert.equal(zrValidateSvg(s).ok, true)
})
ok('前导 BOM 与空白', () => {
  assert.equal(zrValidateSvg('\uFEFF\n  ' + SVG('<g stroke="#fff"><rect width="10" height="10"/></g>')).ok, true)
})
ok('没有 viewBox 但有 width+height 也放行', () => {
  assert.equal(zrValidateSvg(SVG('', 'width="100" height="60"')).ok, true)
})
ok('内部 defs / linearGradient / path 放行', () => {
  const s = SVG('<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><path d="M0 0L10 10" stroke="url(#g)"/>')
  assert.equal(zrValidateSvg(s).ok, true)
})

// ---- 必须拒绝（每一条都是真实攻击面或会让渲染失效）----
const rejects = [
  ['script 标签', SVG('<script>fetch("/x")</script>'), 'script'],
  ['foreignObject', SVG('<foreignObject><div>hi</div></foreignObject>'), 'foreign-object'],
  ['事件属性 onload', SVG('<rect width="1" height="1" onload="alert(1)"/>'), 'event-handler'],
  ['事件属性 onclick', SVG('<rect width="1" height="1" onclick="x()"/>'), 'event-handler'],
  ['javascript: url', SVG('<a href="javascript:alert(1)"><rect width="1" height="1"/></a>'), 'javascript-url'],
  ['外部 href', SVG('<a href="https://evil.example/x">x</a>'), 'external-ref'],
  ['协议相对 href', SVG('<a href="//evil.example/x">x</a>'), 'external-ref'],
  ['内嵌位图 <image>', SVG('<image href="data:image/png;base64,AAAA"/>'), 'embed-image'],
  ['<use> 引用外部文档', SVG('<use href="other.svg#id"/>'), 'embed-image'],
  ['滤镜元素', SVG('<filter id="f"><feGaussianBlur stdDeviation="2"/></filter>'), 'filter-element'],
  ['滤镜属性', SVG('<rect width="1" height="1" filter="url(#f)"/>'), 'filter-attr'],
  ['外部 url()（CSS 里）', SVG('<style>.a{fill:url(https://evil.example/x)}</style>'), 'external-url'],
  ['@import', SVG('<style>@import "x.css";</style>'), 'css-import'],
  ['没有根 svg', '<html><body>hi</body></html>', 'not-svg-root'],
  ['根之前有垃圾', 'garbage ' + SVG(''), 'junk-before-root'],
  ['空文档', '   ', 'empty'],
  ['没有 viewBox 也没有宽高', '<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'no-viewbox'],
]
for (const [name, text, reason] of rejects) {
  ok('拒绝：' + name + ' → ' + reason, () => {
    const r = zrValidateSvg(text)
    assert.equal(r.ok, false, name + ' 必须被拒')
    assert.equal(r.reason, reason, name + ' 的原因应可读')
  })
}

// ---- 反向兜底：上限本身 ----
ok('超过 ' + ZR_SVG_MAX + ' 字节 → too-large', () => {
  const big = SVG('<path d="M0 0' + ' L1 1'.repeat(Math.ceil(ZR_SVG_MAX / 5)) + '"/>')
  assert.ok(Buffer.byteLength(big, 'utf8') > ZR_SVG_MAX)
  const r = zrValidateSvg(big)
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'too-large')
  assert.equal(r.max, ZR_SVG_MAX)
})
ok('恰好在上限内 → 放行', () => {
  // 空白填充（真实素材里是缩进与注释），只为把字节数顶到上限附近
  const padLen = ZR_SVG_MAX - Buffer.byteLength(SVG(''), 'utf8')
  assert.ok(padLen > 0)
  const s = SVG(' '.repeat(padLen))
  assert.equal(Buffer.byteLength(s, 'utf8'), ZR_SVG_MAX)
  assert.equal(zrValidateSvg(s).ok, true)
})

console.log('')
console.log('OK    矢量校验：' + pass + ' 例通过（上限 ' + ZR_SVG_MAX + ' 字节）')
