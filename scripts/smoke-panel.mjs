#!/usr/bin/env node
/**
 * 面板冒烟门：在 Node 里用最小宿主替身加载 client.js，**把设置面板渲染一次**。
 *
 * 为什么需要它：0.6.11 的面板在运行时报 `t is not defined`，被 PanelBoundary 兜成
 * 「重试 / 刷新页面」，而当时所有静态门与（陈旧的）视觉门都是绿的。这个冒烟门专门抓
 * 这一类**只在渲染时炸**的错误——不需要浏览器、不需要 React DOM。
 *
 * 做法：假 window/document/localStorage + 假 require('react')（createElement + 单遍 hook
 * 垫片），调 apply(stubCtx) 收下 settings.section 的渲染函数，再走一遍元素树。
 * 任何组件抛错 → 退出码 1 并打印组件的报错栈。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const argOf = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : '' }
const bundlePath = argOf('--file') || join(root, 'client.js')
const dumpPath = argOf('--dump')
const forceLang = argOf('--lang')
const code = readFileSync(bundlePath, 'utf8')

let hookCursor = 0
let capturedMod
const hookReset = () => { hookCursor = 0 }
function nextSlot() { return hookCursor++ }

const react = {
  createElement: (type, props, ...children) => {
    const kids = children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false)
    const p = Object.assign({}, props || {})
    if (kids.length) p.children = kids.length === 1 ? kids[0] : kids
    return { $$el: true, type, props: p, children: kids }
  },
  Fragment: 'Fragment',
  useState: (init) => { nextSlot(); return [typeof init === 'function' ? init() : init, () => {}] },
  useRef: (init) => { nextSlot(); return { current: init } },
  useEffect: () => { nextSlot() },
  useLayoutEffect: () => { nextSlot() },
  useMemo: (fn) => { nextSlot(); return fn() },
  useCallback: (fn) => { nextSlot(); return fn },
  useContext: () => { nextSlot(); return {} },
  useReducer: (r, init) => { nextSlot(); return [init, () => {}] },
  useId: () => { nextSlot(); return 'r:id' },
  createContext: (v) => ({ Provider: 'Provider', Consumer: 'Consumer', _v: v }),
  Component: class { constructor(props) { this.props = props || {}; this.state = {} } setState(u) { this.state = Object.assign({}, this.state, typeof u === 'function' ? u(this.state) : u) } forceUpdate() {} },
  PureComponent: class { constructor(props) { this.props = props || {}; this.state = {} } setState(u) { this.state = Object.assign({}, this.state, typeof u === 'function' ? u(this.state) : u) } forceUpdate() {} },
  memo: (c) => c,
  forwardRef: (c) => c,
  StrictMode: 'StrictMode',
}

react.Component.prototype.isReactComponent = true
react.PureComponent.prototype.isReactComponent = true

const styleEl = () => ({ textContent: '', setAttribute() {}, remove() {}, appendChild() {}, style: {}, classList: { add() {}, remove() {} } })
const doc = {
  head: { appendChild() {}, removeChild() {} },
  body: { appendChild() {}, removeChild() {}, style: {} },
  documentElement: { style: {}, setAttribute() {}, classList: { add() {}, remove() {} } },
  createElement: () => styleEl(),
  createElementNS: () => styleEl(),
  createTextNode: () => ({}),
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {},
  adoptedStyleSheets: null,
}
const store = new Map()
const win = {
  document: doc,
  localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
  navigator: { language: forceLang === 'en' ? 'en-US' : 'zh-CN' },
  location: { href: 'http://localhost/', search: '' },
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
  addEventListener() {}, removeEventListener() {},
  setTimeout: (fn) => { try { if (typeof fn === 'function') fn() } catch (e) { /* ignore */ } return 1 },
  clearTimeout() {},
  requestAnimationFrame: () => 1,
  cancelAnimationFrame() {},
  MutationObserver: class { observe() {} disconnect() {} },
  CSSStyleSheet: undefined,
  getComputedStyle: () => ({ getPropertyValue: () => '', backgroundColor: '' }),
  __ModuleLoader__: { load(mod) { capturedMod = mod } },
}
win.window = win

// 有状态 hook 垫片：必须在 factory 求值前替换（面板是解构 useState 的）。
// 默认仍走「无状态」路径，避免污染下面的整树渲染冒烟；只有两步确认这类
// 依赖连续渲染的检查才临时打开 hookStateful。
let hookSlots = []
let hookStateful = false
react.useState = (init) => {
  const i = nextSlot()
  const first = typeof init === 'function' ? init() : init
  if (!hookStateful) return [first, () => {}]
  if (!(i in hookSlots)) hookSlots[i] = first
  return [hookSlots[i], (v) => { hookSlots[i] = typeof v === 'function' ? v(hookSlots[i]) : v }]
}

const sandbox = { ...win, console, require: undefined, __hookReset: hookReset }
sandbox.globalThis = sandbox
sandbox.window = sandbox
const ctxObj = vm.createContext(sandbox)
vm.runInContext(code, ctxObj, { filename: 'client.js' })

if (!capturedMod || typeof capturedMod.factory !== 'function') {
  console.error('FAIL  client.js 没有调用 __ModuleLoader__.load({factory})')
  process.exit(1)
}

const fakeRequire = (name) => (name === 'react' ? react : undefined)
let mod
try {
  mod = capturedMod.factory(fakeRequire)
} catch (e) {
  console.error('FAIL  factory 抛出：' + (e && e.message))
  console.error(String((e && e.stack) || '').split('\n').slice(1, 4).join('\n'))
  process.exit(1)
}

const captured = []
const dispose = []
const noop = () => {}
const slots = {
  inject: (name, cb) => { if (typeof cb === 'function') cb() },
  register: (spec, render) => { captured.push({ spec, render }); return noop },
}
const theme = {
  getTheme: () => 'light',
  overrideTokens: noop,
  setTheme: noop,
  on: () => noop,
  subscribe: () => noop,
  subscribeHostChange: () => noop,
}
const services = {
  slots,
  theme,
  sidebarRightTabs: { register: () => noop },
  sidebarRight: { register: () => noop },
}
const stubCtx = new Proxy({}, {
  get: (t, k) => {
    if (k === 'slots') return slots
    if (k === 'theme') return theme
    if (k === 'effect') return (fn) => { const d = fn(); if (typeof d === 'function') dispose.push(d) }
    if (k === 'inject') return (names, cb) => { if (typeof cb === 'function') cb(stubCtx) }
    if (k === 'on') return () => noop
    if (k === 'get') return (name) => services[name]
    if (k === 'logger' || k === 'log') return { info: noop, warn: noop, error: noop, debug: noop }
    if (k === 'toString') return () => '[ctx]'
    return undefined
  },
})

try {
  const apply = (mod && (mod.apply || mod.default)) || null
  if (typeof apply !== 'function') {
    console.error('FAIL  插件没有导出 apply(ctx)')
    process.exit(1)
  }
  apply(stubCtx)
} catch (e) {
  console.error('FAIL  apply 抛出：' + (e && e.message))
  process.exit(1)
}

const panel = captured.find((c) => c && c.spec && String(c.spec.name || '').includes('settings.section'))
if (!panel) {
  const names = captured.map((c) => (c && c.spec && (c.spec.name || c.spec.id)) || '(anon)').join(', ')
  console.error('FAIL  没有捕获到 settings.section 的注册（captured=' + captured.length + '：' + names + '）')
  process.exit(1)
}

let rendered = 0
const seen = new Set()
const names = []
const texts = []
const attrs = []
// 渲染通过不等于「按钮能用」：0.6.19 的 CUSTOM_MAX 被误插进 readPref()，
// 静态门与渲染冒烟全绿，用户点「新建主题」却抛 ReferenceError（面板毫无反应）。
// 这里额外点一次这个按钮，把「事件处理里才会炸的错」也纳入门禁。
const clicks = []
function walk(node, depth) {
  if (node === null || node === undefined || node === false || node === true) return
  if (typeof node === 'string' || typeof node === 'number') { texts.push(String(node)); return }
  if (Array.isArray(node)) { for (const n of node) walk(n, depth); return }
  if (!node || !node.$$el) return
  for (const k of ['title', 'aria-label', 'placeholder', 'alt']) {
    const v = node.props && node.props[k]
    if (typeof v === 'string' && v) attrs.push(k + '=' + v)
  }
  const t = node.type
  // <style> 的整块 CSS 已经由 verify:csssnap 逐字节把关；放进文案快照只会让任何样式改动
  // 都显示成「文案变了」，把真正的文案回归淹掉。
  if (t === 'style') return
  if (typeof t === 'function') {
    const name = t.name || 'anonymous'
    hookReset()
    let out
    try {
      out = (t.prototype && t.prototype.isReactComponent) ? (() => { const inst = new t(node.props); const s = inst.render(); return s })() : t(node.props)
    } catch (e) {
      console.error('FAIL  组件 <' + name + '> 渲染抛出：' + (e && e.message))
      console.error(String((e && e.stack) || '').split('\n').slice(1, 5).join('\n'))
      process.exit(1)
    }
    rendered++
    names.push(name)
    walk(out, depth + 1)
    return
  }
  if (node.props && typeof node.props.onClick === 'function' && /zp-th-add/.test(String(node.props.className || ''))) {
    clicks.push(node)
  }
  if (node.children && node.children.length) for (const c of node.children) walk(c, depth + 1)
}

try {
  const hostProps = { id: 'zhuoer-theme' }
  walk(panel.render(hostProps), 0)
} catch (e) {
  console.error('FAIL  面板渲染抛出：' + (e && e.message))
  process.exit(1)
}

if (dumpPath) {
  const { writeFileSync } = await import('node:fs')
  writeFileSync(dumpPath, JSON.stringify({ texts, attrs }, null, 2))
  console.log('DUMP  ' + texts.length + ' 条文案 / ' + attrs.length + ' 个属性 → ' + dumpPath)
  process.exit(0)
}

// 点击冒烟：只点「新建自定义主题」这一颗——它会走 writePref + emitChange + applyTokens，
// 覆盖「存储写入 / 状态通知 / token 重算」整条链路，是在不弹真窗口的前提下能点的最重的一颗。
if (clicks.length === 0) {
  console.error('FAIL  没找到「新建主题」按钮：点击冒烟无法进行（按钮类名可能被改）')
  process.exit(1)
}
for (const btn of clicks.slice(0, 1)) {
  try {
    btn.props.onClick({ preventDefault() {}, stopPropagation() {} })
  } catch (e) {
    console.error('FAIL  点击「新建主题」抛出：' + (e && e.message))
    console.error(String((e && e.stack) || '').split('\n').slice(0, 5).join('\n'))
    process.exit(1)
  }
}
// 不猜存储键名：扫全部 localStorage 条目，找带 customThemes 的那一份
let added = 0
for (const k of store.keys()) {
  try {
    const parsed = JSON.parse(store.get(k))
    if (parsed && Array.isArray(parsed.customThemes)) added = Math.max(added, parsed.customThemes.length)
  } catch (e) { /* 非 JSON 条目跳过 */ }
}
if (added < 1) {
  console.error('FAIL  点击「新建主题」后存储里没有新增自定义主题（customThemes=' + added + '）')
  process.exit(1)
}

// 两步确认删除：删除会连主题底图一起清掉，是真正的数据丢失路径，必须在门里跑一遍。
// 判据：第 1 次点击只把按钮文案换成「再点一次删除」且一条都不删；第 2 次才真的删掉。
try {
  const STORE_KEY = 'dsh-zhuoer-theme:v1'
  const saved = store.get(STORE_KEY)
  store.set(STORE_KEY, JSON.stringify({
    theme: 'cmwtest',
    customThemes: [{ id: 'cmwtest', label: 'smoke', base: 'zhuoer', dark: {}, light: {} }],
  }))
  const countCustoms = () => {
    let n = -1
    for (const k of store.keys()) {
      try {
        const j = JSON.parse(store.get(k))
        if (j && Array.isArray(j.customThemes)) n = Math.max(n, j.customThemes.length)
      } catch (e) { /* ignore */ }
    }
    return n
  }
  const collect = (node, pred, out) => {
    if (!node || typeof node !== 'object') return out
    if (Array.isArray(node)) { node.forEach((n) => collect(n, pred, out)); return out }
    if (!node.$$el) return out
    if (pred(node)) out.push(node)
    ;(node.children || []).forEach((c) => collect(c, pred, out))
    return out
  }
  const tree2 = panel.render({ id: 'zhuoer-theme' })
  const skin = collect(tree2, (n) => typeof n.type === 'function' && /SkinSettings/.test(String(n.type.name)), [])[0]
  if (!skin) throw new Error('找不到 SkinSettings')
  const renderSkin = () => {
    hookReset()
    return collect(skin.type(skin.props), (n) => n.props && n.props['data-tone'] === 'danger', [])
  }
  hookStateful = true
  hookSlots = []
  const first = renderSkin()
  if (!first.length) throw new Error('带自定义主题时没渲染出删除按钮')
  first[0].props.onClick({})
  const afterFirst = countCustoms()
  const second = renderSkin()
  const labelAfterFirst = String(second[0].props.children || '')
  second[0].props.onClick({})
  const afterSecond = countCustoms()
  hookStateful = false
  hookSlots = []
  if (afterFirst !== 1) throw new Error('第 1 次点击就删掉了（应为待确认，customThemes=' + afterFirst + '）')
  if (afterSecond !== 0) throw new Error('第 2 次点击没有删掉（customThemes=' + afterSecond + '）')
  if (!/再点一次|again/i.test(labelAfterFirst)) throw new Error('第 1 次点击后按钮文案没变成确认态：' + JSON.stringify(labelAfterFirst))
  if (saved === undefined) store.delete ? store.delete(STORE_KEY) : undefined
  else store.set(STORE_KEY, saved)
} catch (e) {
  console.error('FAIL  两步确认删除：' + (e && e.message))
  process.exit(1)
}

// 对话宽度输入框：空 = 自适应（0），非空 = 提交夹到 [640,1600] 的整数。
// 这是「非受控输入 + 失焦提交」的时序，渲染冒烟看不到，必须显式调一次 onBlur。
try {
  const findBy = (node, pred, out) => {
    if (!node || typeof node !== 'object') return out
    if (Array.isArray(node)) { node.forEach((n) => findBy(n, pred, out)); return out }
    if (!node.$$el) return out
    if (pred(node)) out.push(node)
    ;(node.children || []).forEach((c) => findBy(c, pred, out))
    return out
  }
  const skinNode = findBy(panel.render({ id: 'zhuoer-theme' }), (n) => typeof n.type === 'function' && /SkinSettings/.test(String(n.type.name)), [])[0]
  if (!skinNode) throw new Error('找不到 SkinSettings')
  hookReset()
  const numInput = findBy(skinNode.type(skinNode.props), (n) => n.props && /zp-num/.test(String(n.props.className || '')), [])[0]
  if (!numInput) throw new Error('没找到对话宽度输入框（className 应含 zp-num）')
  const readChatWidth = () => {
    for (const k of store.keys()) {
      try {
        const j = JSON.parse(store.get(k))
        if (j && typeof j === 'object' && 'chatWidth' in j) return j.chatWidth
      } catch (e) { /* ignore */ }
    }
    return undefined
  }
  numInput.props.onBlur({ target: { value: '900' } })
  if (readChatWidth() !== 900) throw new Error('填入 900 后 chatWidth=' + readChatWidth())
  numInput.props.onBlur({ target: { value: '100' } })
  if (readChatWidth() !== 640) throw new Error('低于下限应夹到 640，实际 ' + readChatWidth())
  numInput.props.onBlur({ target: { value: '' } })
  if (readChatWidth() !== 0) throw new Error('清空应回到 0（自适应），实际 ' + readChatWidth())
} catch (e) {
  console.error('FAIL  对话宽度输入：' + (e && e.message))
  process.exit(1)
}

if (!names.some((n) => /SkinSettings/.test(n))) {
  console.error('FAIL  SkinSettings 没有被真正渲染（只渲染了：' + names.join(', ') + '）——冒烟门形同虚设')
  process.exit(1)
}
console.log('OK    面板冒烟通过：settings.section 已注册，渲染 ' + rendered + ' 个组件（' + names.join(' > ') + '），无抛错')
