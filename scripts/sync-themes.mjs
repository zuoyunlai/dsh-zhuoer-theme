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
const clientPath = join(root, 'client.js')
const src = readFileSync(clientPath, 'utf8')

const marker = 'const THEMES = '
const at = src.indexOf(marker)
if (at < 0) throw new Error('client.js 里找不到 `const THEMES = `')
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
const nextSrc = src.slice(0, start) + next + src.slice(end)
const changed = !semanticEqual

if (process.argv.includes('--check')) {
  console.log(changed ? 'STALE  client.js 内联副本与 themes.mjs 不一致，请运行 node scripts/sync-themes.mjs' : 'OK    内联副本已是最新')
  process.exit(changed ? 1 : 0)
}
if (!changed) { console.log('OK    无需改动'); process.exit(0) }
writeFileSync(clientPath, nextSrc)
console.log(`WROTE 已同步 ${Object.keys(merged).length} 套主题 → client.js（${next.length} 字符）`)
