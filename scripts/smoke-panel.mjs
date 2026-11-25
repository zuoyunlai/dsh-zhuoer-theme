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
  navigator: { language: 'zh-CN' },
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

if (!names.some((n) => /SkinSettings/.test(n))) {
  console.error('FAIL  SkinSettings 没有被真正渲染（只渲染了：' + names.join(', ') + '）——冒烟门形同虚设')
  process.exit(1)
}
console.log('OK    面板冒烟通过：settings.section 已注册，渲染 ' + rendered + ' 个组件（' + names.join(' > ') + '），无抛错')
