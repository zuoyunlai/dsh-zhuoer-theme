#!/usr/bin/env node
/**
 * 把 themes.mjs（唯一真源）生成到 client.js 的内联 THEMES。
 *
 * 为什么不能运行时 import：client.js 被宿主合并进 /plugins/??a,b,c 打包请求，
 * import.meta.url 指向那条合并 URL，相对解析会错；所以只能生成内联副本。
 *
 * 合并规则：themes.mjs 覆盖同名 token；client.js 里多出来的补充 token
 * （--dsw-hovercard-bg 之类）原样保留，因为它们是 DSH 专属语义，不在主题源里。
 *
 * 用法：node scripts/sync-themes.mjs [--check]
 *   --check  只检查是否需要同步，不写文件（CI 用），需要同步时退出码 1
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const { THEMES } = await import(pathToFileURL(join(root, 'themes.mjs')).href)
// 生成目标从 client.js 改为源分片：client.js 现在是 build.mjs 的产物，直接改它会被下一次构建覆盖。
const clientPath = join(root, 'src', '10-themes.js')
const src = readFileSync(clientPath, 'utf8')

const marker = 'const THEMES = '
const at = src.indexOf(marker)
if (at < 0) throw new Error('src/10-themes.js 里找不到 `const THEMES = `')
const start = src.indexOf('{', at)
let depth = 0, end = -1, inStr = false, esc = false
for (let i = start; i < src.length; i++) {
  const c = src[i]
  if (inStr) {
    if (esc) esc = false
    else if (c === '\\') esc = true
    else if (c === '"') inStr = false
    continue
  }
  if (c === '"') { inStr = true; continue }
  if (c === '{' || c === '[') depth++
  else if (c === '}' || c === ']') { depth--; if (depth === 0) { end = i + 1; break } }
}
if (end < 0) throw new Error('client.js 内联 THEMES 括号不闭合')
const current = JSON.parse(src.slice(start, end))

// 合并：真源优先，保留补充 token
const merged = {}
for (const id of Object.keys(THEMES)) {
  const srcTheme = THEMES[id]
  const oldTheme = current[id] || {}
  const out = {}
  for (const scheme of ['dark', 'light']) {
    const base = { ...(oldTheme[scheme] || {}), ...(srcTheme[scheme] || {}) }
    out[scheme] = base
  }
  if (srcTheme.label) out.label = srcTheme.label
  else if (oldTheme.label) out.label = oldTheme.label
  merged[id] = out
}

// --check 判「值」不判「字节」：JSON.stringify 的键顺序会随合并方式变化，
// 但键顺序不影响运行时结果，拿字节比较会天天报假红。
const sortKeys = (o) => {
  if (Array.isArray(o)) return o.map(sortKeys)
  if (o && typeof o === 'object') {
    const out = {}
    for (const k of Object.keys(o).sort()) out[k] = sortKeys(o[k])
    return out
  }
  return o
}
const semanticEqual = JSON.stringify(sortKeys(merged)) === JSON.stringify(sortKeys(current))
const next = JSON.stringify(merged)
let nextSrc = src.slice(0, start) + next + src.slice(end)

// SHADOWS 也从 themes.mjs 生成：每套主题的 shadow 字段。
// 以前 client 里单独维护一份 SHADOWS，等于阴影有两个真源（自定义主题还查不到）。
const shadows = {}
for (const id of Object.keys(THEMES)) {
  if (THEMES[id] && THEMES[id].shadow) shadows[id] = THEMES[id].shadow
}
const shMarker = 'const SHADOWS = '
const shAt = nextSrc.indexOf(shMarker)
let shadowsChanged = false
if (shAt >= 0 && Object.keys(shadows).length) {
  const shOpen = nextSrc.indexOf('{', shAt)
  let depth = 0, shEnd = -1
  // SHADOWS 的值里没有花括号，按括号计数即可，不必处理字符串转义。
  for (let i = shOpen; i < nextSrc.length; i++) {
    const c = nextSrc[i]
    if (c === '{') depth++
    else if (c === '}') { depth--; if (depth === 0) { shEnd = i + 1; break } }
  }
  if (shEnd > 0) {
    const oldText = nextSrc.slice(shOpen, shEnd)
    const oldSh = new Function('return ' + oldText)()
    // 值不同 → 需要同步；值相同但字面量不是生成的紧凑形态 → 也要重写成生成物，
    // 否则「SHADOWS 由 themes.mjs 生成」只是口号，实际仍是手写的那份。
    shadowsChanged = JSON.stringify(sortKeys(oldSh)) !== JSON.stringify(sortKeys(shadows)) || oldText !== JSON.stringify(shadows)
    nextSrc = nextSrc.slice(0, shOpen) + JSON.stringify(shadows) + nextSrc.slice(shEnd)
  }
}
const changed = !semanticEqual || shadowsChanged

if (process.argv.includes('--check')) {
  console.log(changed ? 'STALE  内联副本与 themes.mjs 不一致，请运行 npm run sync:themes（会顺带 build）' : 'OK    内联副本已是最新')
  process.exit(changed ? 1 : 0)
}
if (!changed) { console.log('OK    无需改动'); process.exit(0) }
writeFileSync(clientPath, nextSrc)
console.log(`WROTE 已同步 ${Object.keys(merged).length} 套主题 → src/10-themes.js（${next.length} 字符）`)
