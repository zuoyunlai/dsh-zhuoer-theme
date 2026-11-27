#!/usr/bin/env node
/**
 * 宿主契约门禁。
 *
 * client.js 里到处 `[class*="_frame"]`、`[data-windows-titlebar]` 这类对 DSH 的隐式依赖。
 * DSH 升级时类名 hash 会变（我们用稳定子串规避），但子串本身、属性名、语义都可能改。
 * 这份脚本把「代码实际用到的宿主依赖」与 contracts/host-contract.json 对账：
 *
 *   ADDED    代码里新增、契约未登记 → 必须补语义说明（否则以后没人知道它干嘛的）
 *   REMOVED  契约有、代码里已不用   → 确认是有意删除，然后 --update
 *
 * 用法：
 *   node scripts/verify-host-contract.mjs            对账
 *   node scripts/verify-host-contract.mjs --update   把新增项写进契约（语义标 TODO）
 *
 * 这只覆盖「静态依赖清单」。DSH 升级后某个选择器是否真能命中，仍需在真实页面上跑一次。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const clientPath = join(root, 'client.js')
const contractPath = join(root, 'contracts', 'host-contract.json')

const src = readFileSync(clientPath, 'utf8')
const contract = JSON.parse(readFileSync(contractPath, 'utf8'))

// 排除内联 THEMES（那是 token 定义，不是宿主选择器）
const at = src.indexOf('const THEMES = ')
let scanSrc = src
if (at >= 0) {
  const start = src.indexOf('{', at)
  let d = 0, end = -1, inS = false, esc = false
  for (let i = start; i < src.length; i++) {
    const c = src[i]
    if (inS) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inS = false; continue }
    if (c === '"') { inS = true; continue }
    if (c === '{' || c === '[') d++
    else if (c === '}' || c === ']') { d--; if (d === 0) { end = i + 1; break } }
  }
  if (end > 0) scanSrc = src.slice(0, at) + src.slice(end)
}

// 剥离注释：注释里出现的 [class*="xxx"] 是文档示例，不是真实依赖。
// 状态机跳过字符串，避免误伤 CSS 选择器字符串与 URL 里的斜杠。
const stripComments = (s) => {
  let out = ''
  let i = 0
  let quote = null
  while (i < s.length) {
    const c = s[i]
    const n = s[i + 1]
    if (quote) {
      out += c
      if (c === '\\') { out += n ?? ''; i += 2; continue }
      if (c === quote) quote = null
      i++
      continue
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; out += c; i++; continue }
    if (c === '/' && n === '*') { const e = s.indexOf('*/', i + 2); i = e < 0 ? s.length : e + 2; continue }
    if (c === '/' && n === '/') { const e = s.indexOf('\n', i); i = e < 0 ? s.length : e; continue }
    out += c
    i++
  }
  return out
}
scanSrc = stripComments(scanSrc)

const uniq = (arr) => [...new Set(arr)].sort()
const ownAttrs = new Set(contract.own?.attributes ?? [])

// 本插件自己的类名前缀（own.classFragments）不算宿主片段：它们只出现在 :not([class*="zp-"]) 这类
// 负选择器里，用来把「自己的弹层」排除掉。以前 verify:host 把它们当宿主依赖自动塞进契约，
// 留下两条 TODO 占位；漂移检查一上线就把这两条判成「宿主缺失」——它们本来就不在宿主里。
const ownFragments = new Set((contract.own?.classFragments ?? []).map((e) => e.fragment))
const foundFragments = uniq([...scanSrc.matchAll(/class\*="([^"]+)"/g)].map((m) => m[1])).filter((f) => !ownFragments.has(f))
const attrPool = [
  ...[...scanSrc.matchAll(/\[(data-[a-z0-9-]+)[\]=]/g)].map((m) => m[1]),
  ...[...scanSrc.matchAll(/['"](data-[a-z0-9-]+)['"]/g)].map((m) => m[1]),
]
const foundAttrs = uniq(attrPool.filter((a) => !ownAttrs.has(a)))

// —— id 片段：契约 → 代码（0.6.5 补）——
// classFragments 走「代码 → 契约」，查不出「代码里把唯一一条 id 依赖删了」这种情况
// （代码没了 class*=，对账自然无话可说）。品牌位的 svg:has(#dsh-wordmark-badge-clip)
// 就是唯一一条 id 依赖，删掉它品牌位会静默失效，所以反过来再查一遍。
const knownIdFragments = (contract.host.idFragments ?? []).map((e) => e.fragment)
const missingIdFragments = knownIdFragments.filter((f) => !scanSrc.includes(f))

// —— 包清单图标三件套（0.6.4 起）——
// 设置 → 插件 列表那一格读的是 package.json 的 "icon"，同族插件
// （dsh-chronicle / dsh-pet / dsh-rightbar-quicknav / dsh-theme-palette）写法一致。
// 这些字段写漏不会有任何报错，只会静默少一个图标，所以放进门里。
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const iconRel = typeof pkg.icon === 'string' ? pkg.icon.replace(/^\.\//, '') : ''
const manifestProblems = []
if (!pkg.icon) manifestProblems.push('package.json 缺 "icon"（插件页会回落到宿主默认图标）')
else if (!iconRel) manifestProblems.push('"icon" 必须是字符串路径')
if (iconRel && !existsSync(join(root, iconRel))) manifestProblems.push('"icon" 指向的文件不存在：' + iconRel)
if (iconRel && !/\.svg$/i.test(iconRel)) manifestProblems.push('"icon" 必须指向 .svg：' + iconRel)
if (iconRel && !(pkg.files ?? []).includes(iconRel)) manifestProblems.push('"files" 未包含 ' + iconRel + '（发布包会缺图标）')
if (iconRel && pkg.exports?.['./icon'] !== './' + iconRel) manifestProblems.push('exports 缺少 "./icon": "./' + iconRel + '"')


const knownFragments = new Set(contract.host.classFragments.map((e) => e.fragment).filter((f) => !ownFragments.has(f)))
const knownAttrs = new Set(contract.host.attributes.map((e) => e.attribute))

const addedFragments = foundFragments.filter((f) => !knownFragments.has(f))
const removedFragments = [...knownFragments].filter((f) => !foundFragments.includes(f))
const addedAttrs = foundAttrs.filter((a) => !knownAttrs.has(a))
const removedAttrs = [...knownAttrs].filter((a) => !foundAttrs.includes(a))

const update = process.argv.includes('--update')
if (update) {
  for (const f of addedFragments) {
    contract.host.classFragments.push({ fragment: f, usedFor: 'TODO 补语义：用在哪', breaksIfMissing: 'TODO 补语义：失效后果' })
  }
  for (const a of addedAttrs) {
    contract.host.attributes.push({ attribute: a, usedFor: 'TODO 补语义：用在哪', breaksIfMissing: 'TODO 补语义：失效后果' })
  }
  if (removedFragments.length) contract.host.classFragments = contract.host.classFragments.filter((e) => foundFragments.includes(e.fragment))
  if (removedAttrs.length) contract.host.attributes = contract.host.attributes.filter((e) => foundAttrs.includes(e.attribute))
  writeFileSync(contractPath, JSON.stringify(contract, null, 2) + '\n')
  console.log(`WROTE 契约已更新：+${addedFragments.length + addedAttrs.length} / -${removedFragments.length + removedAttrs.length}`)
}

console.log(`契约 host 部分：${knownFragments.size} 个类名片段 + ${knownAttrs.size} 个属性 + ${knownIdFragments.length} 个 id 片段；代码实测 ${foundFragments.length} + ${foundAttrs.length}`)

const lines = []
for (const f of addedFragments) lines.push(`ADDED    类名片段 [class*="${f}"] 未登记`)
for (const a of addedAttrs) lines.push(`ADDED    属性 [${a}] 未登记`)
for (const f of removedFragments) lines.push(`REMOVED  契约里的 [class*="${f}"] 代码已不再使用`)
for (const a of removedAttrs) lines.push(`REMOVED  契约里的 [${a}] 代码已不再使用`)
for (const f of missingIdFragments) lines.push(`MISSING  契约里的 id 片段 #${f} 代码已不再使用（品牌位会静默失效）`)
for (const p of manifestProblems) lines.push('MANIFEST ' + p)

if (lines.length && !update) {
  console.error('')
  for (const l of lines) console.error('  ' + l)
  console.error(`\nFAIL  ${lines.length} 项未对账（确认后跑 --update 更新契约，并补齐 TODO 语义）`)
  process.exit(1)
}
console.log('PASS  宿主依赖与契约一致')
