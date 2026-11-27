#!/usr/bin/env node
/**
 * 生效色板（last-theme.json）形状校验的无头测试（R-03 / F-09）。
 * 直接用 index.js 导出的 zrLastThemeShape —— 测的是线上那份实现，不复制。
 *
 * 为什么值得测：这份 JSON 是「对话之外唯一能读到最终色板」的通道，
 * 它放行什么形状，决定了审计方读到的是结论还是一堆垃圾。
 */
import { zrLastThemeShape, apply } from '../index.js'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

let n = 0
const ok = (name, fn) => { fn(); n++; console.log('ok    ' + name) }

const light = {
  '--dsw-alias-bg-base': '#F2ECFF',
  '--dsw-alias-label-primary': '#201a2b',
  '--dsw-alias-brand-primary': '#c2410c',
  '--dsw-alias-border-l1': '#d8d0e6',
}
const dark = {
  '--dsw-alias-bg-base': '#0b0518',
  '--dsw-alias-label-primary': '#ece6f5',
}

ok('合法输入：通过、hex 归一为小写、锚点数正确', () => {
  const r = zrLastThemeShape({ id: 'cabc123', label: '霓虹野火', base: 'zhuoer', light: light, dark: dark })
  assert.equal(r.ok, true)
  assert.equal(r.spec.light['--dsw-alias-bg-base'], '#f2ecff')
  assert.equal(r.anchors, 4)
  assert.equal(r.darkAnchors, 2)
  assert.ok(r.bytes > 0)
})

ok('非对象输入一律拒绝', () => {
  for (const v of [null, undefined, 0, 'x', [], true]) {
    assert.equal(zrLastThemeShape(v).ok, false)
  }
  assert.equal(zrLastThemeShape(null).reason, 'not-object')
})

ok('没有浅色表 → no-light（宁可 400 也不写空结论）', () => {
  const r = zrLastThemeShape({ light: {}, dark: dark })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'no-light')
  assert.equal(zrLastThemeShape({ light: { '--dsw-alias-bg-base': 'red' } }).reason, 'no-light')
})

ok('只收 6 位 hex 与 --dsw-alias/specific 前缀，其余静默丢弃', () => {
  const r = zrLastThemeShape({
    light: {
      '--dsw-alias-bg-base': '#ffffff',
      '--dsw-alias-label-primary': 'rgb(1,2,3)',
      '--other-token': '#000000',
      '--dsw-alias-brand-primary': '#ABC',
      '--dsw-specific-bubble': '#101010',
    },
  })
  assert.equal(r.ok, true)
  assert.deepEqual(Object.keys(r.spec.light).sort(), ['--dsw-alias-bg-base', '--dsw-specific-bubble'])
})

ok('数值与标识符越界被夹回/清空', () => {
  const r = zrLastThemeShape({
    id: 'Bad Id!', base: '9bad', light: light,
    radiusScale: 9,
  })
  assert.equal(r.spec.id, '')
  assert.equal(r.spec.base, '')
  assert.equal(r.spec.radiusScale, 3)
  assert.equal(zrLastThemeShape({ light: light, radiusScale: -5 }).spec.radiusScale, 0)
  assert.equal(zrLastThemeShape({ light: light, radiusScale: NaN }).spec.radiusScale, 1)
})

ok('label / font / bg 超长被截断，缺省有兜底', () => {
  const r = zrLastThemeShape({
    light: light,
    label: 'x'.repeat(80),
    font: { body: 'y'.repeat(200), chat: 7 },
    bg: { source: 'image', key: 'k'.repeat(100) },
  })
  assert.equal(r.spec.label.length, 24)
  assert.equal(r.spec.font.body.length, 64)
  assert.equal(r.spec.font.chat, '')
  assert.equal(r.spec.bg.key.length, 40)
  assert.equal(r.spec.bg.keyLight, '')
})

ok('枚举字段收敛：scheme / textureDecision / autoDark / sampled', () => {
  const r = zrLastThemeShape({ light: light, scheme: 'auto', textureDecision: 'maybe', autoDark: 'yes', sampled: 1 })
  assert.equal(r.spec.scheme, '')
  assert.equal(r.spec.textureDecision, 'no')
  assert.equal(r.spec.autoDark, false)
  assert.equal(r.spec.sampled, false)
  assert.equal(zrLastThemeShape({ light: light, scheme: 'dark' }).spec.scheme, 'dark')
})

ok('体积上限：超过 maxBytes 直接拒绝', () => {
  const r = zrLastThemeShape({ light: light }, { maxBytes: 20 })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'too-big')
  assert.ok(r.bytes > 20)
})

ok('at 缺省补当前时间；给了就原样保留', () => {
  const a = zrLastThemeShape({ light: light })
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(a.spec.at))
  assert.equal(zrLastThemeShape({ light: light, at: '2026-11-27T21:00:00.000Z' }).spec.at, '2026-11-27T21:00:00.000Z')
})


// ---- 路由层集成（不启服务器，直接驱动 handler）----
// 为什么要这一段：纯函数只证明「形状校验对」，证明不了「真的写到盘上、GET 能读回来」。
// 上一轮踩过「门禁全绿但运行期没加载」的坑，所以写盘与读回要各验一次。
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'zr-last-'))
process.env.DSH_HOME = home
const routes = []
const fakeCtx = {
  get: (n) => (n === 'webServer' ? { register: (def) => { routes.push(def); } } : null),
  // apply() 走的是 ctx.inject(['webServer'], cb) 这条路；effect 有的宿主才有。
  inject: (deps, cb) => cb({ get: fakeCtx.get }),
  effect: (fn) => fn(),
}
apply(fakeCtx, {})
const route = routes.filter((r) => r.path === '/dsh-zhuoer-theme/api/last-theme')[0]

const fakeRes = () => {
  const r = { status: 0, headers: null, body: '' }
  r.writeHead = (s, h) => { r.status = s; r.headers = h || null }
  r.end = (b) => { r.body = b === undefined || b === null ? '' : String(b) }
  return r
}
const fakeReq = (method, chunks) => {
  const ev = {}
  return {
    method: method,
    headers: { 'x-zhuoer-client': '1' },
    on(name, fn) { (ev[name] = ev[name] || []).push(fn); return this },
    fire() {
      // 注意：这里不能写成以 ( 开头的连续两行（ASI 会把它拼成一次调用）。
      const ds = ev.data || []
      const es = ev.end || []
      ds.forEach((f) => chunks.forEach((c) => f(c)))
      es.forEach((f) => f())
    },
  }
}
const drive = (method, payload) => {
  const res = fakeRes()
  const req = fakeReq(method, payload === undefined ? [] : [Buffer.from(JSON.stringify(payload), 'utf8')])
  route.handler(req, res)
  req.fire()
  return res
}

ok('路由存在且受来源头保护（无头 → 403）', () => {
  assert.ok(route, 'last-theme 路由必须注册')
  assert.equal(route.kind, 'exact')
  const res = fakeRes()
  route.handler({ method: 'POST', headers: {}, on() { return this } }, res)
  assert.equal(res.status, 403)
})

ok('POST 落盘 → GET 读回同一份（含 8 组锚点与采样标记）', () => {
  const payload = {
    id: 'cabc123', label: '林间晴空', base: 'zhuoer',
    light: light, dark: dark,
    font: { body: 'Manrope', chat: '' }, radiusScale: 1.2,
    autoDark: false, sampled: true, textureDecision: 'want',
    bg: { source: 'image', key: 'img_1', keyLight: 'img_1b' },
    scheme: 'light',
  }
  const posted = drive('POST', payload)
  assert.equal(posted.status, 200, '写盘应成功，实得 ' + posted.status + ' ' + posted.body)
  const file = path.join(home, 'dsh-zhuoer-theme', 'last-theme.json')
  assert.ok(fs.existsSync(file), '应该落盘到 ' + file)
  assert.ok(!fs.existsSync(file + '.tmp'), '临时文件应被 rename 掉')
  const got = drive('GET')
  assert.equal(got.status, 200)
  const back = JSON.parse(got.body)
  assert.equal(back.id, 'cabc123')
  assert.equal(back.sampled, true)
  assert.equal(back.bg.key, 'img_1')
  assert.equal(back.light['--dsw-alias-bg-base'], '#f2ecff')
  assert.equal(back.radiusScale, 1.2)
})

ok('坏 body → 400 且不覆盖已落盘的那份', () => {
  const before = fs.readFileSync(path.join(home, 'dsh-zhuoer-theme', 'last-theme.json'), 'utf8')
  const bad = fakeRes()
  const req = {
    method: 'POST',
    headers: { 'x-zhuoer-client': '1' },
    on(name, fn) { if (name === 'end') req._end = fn; return this },
  }
  route.handler(req, bad)
  const finish = req._end || (() => {})
  finish()
  assert.equal(bad.status, 400)
  assert.equal(bad.body, '{"error":"bad-body"}')
  const after = fs.readFileSync(path.join(home, 'dsh-zhuoer-theme', 'last-theme.json'), 'utf8')
  assert.equal(after, before, '坏请求不得覆盖上一份结论')
})

ok('形状不合规 → 400 并指明原因', () => {
  const res = drive('POST', { light: {} })
  assert.equal(res.status, 400)
  assert.equal(res.body, '{"error":"no-light"}')
})
console.log('')
console.log('OK    生效色板：' + n + ' 例通过')
