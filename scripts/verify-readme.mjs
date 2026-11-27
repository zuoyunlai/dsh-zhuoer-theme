#!/usr/bin/env node
/**
 * README 门禁：查那些「人不会天天看、机器一查就知道」的东西。
 *
 * 为什么需要它（2026-11-27 的真实教训）：
 *   1. README 里有一整节标题是「为什么没有像素基线了」，结论「这条路不做了」——
 *      而我们其实在做像素级度量。这节**说反了**，是人读出来才发现的；
 *   2. 一次改动里 5 张截图全部重采，没有任何门禁检查「README 指向的图还在不在」；
 *   3. 市场卡片还写着「界面中英双语」，而界面 0.6.19 起就是 8 种语言。
 * 三类都是「文档与事实脱节」，verify:claims 只比数字，覆盖不到。
 *
 * 本门只查**可机械判定**的：图文链接在不在、中英结构是否对齐、版本串是否一致、
 * 是否出现已知的过期措辞。不查观点、不查文笔。
 *
 * 用法：node scripts/verify-readme.mjs
 */
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const VERSION = pkg.version

const files = { zh: 'README.md', en: 'README.en.md' }
const RAW = 'https://raw.githubusercontent.com/zuoyunlai/dsh-zhuoer-theme/main/'
// 已知过期措辞：[label, 正则, 为什么禁, 改成什么]
const BANNED = [
  ['双语口径', /界面中英双语|界面中英雙語|bilingual UI|two-language UI/i, '界面 0.6.19 起是 8 种语言，「双语」是旧口径', '界面支持 8 种语言 / 8-language UI'],
  ['像素基线标题', /为什么没有像素基线了|Why there is no pixel baseline/i, '像素度量现在是三层判据之一（0.6.43 起），这节标题与结论都已过期', '像素：比对不做门，度量要做 / Pixels: no comparison gate, but a real measurement'],
]
// 检查前剥掉「引用态」的内容：反引号、中文引号、「」、“”、成对英文引号。
// 否则 README 里那条**说明禁词**的门禁行会被自己判违规（实测踩到）。
const stripQuoted = (s) => s
  .replace(/`[^`]*`/g, ' ')
  .replace(/「[^」]*」/g, ' ')
  .replace(/“[^”]*”/g, ' ')
  .replace(/"[^"\n]*"/g, ' ')
// 版本行的两种写法
const VERSION_LINE = {
  zh: /当前版本 \*\*(\d+\.\d+\.\d+)\*\*/,
  en: /Current version \*\*(\d+\.\d+\.\d+)\*\*/,
}

const problems = []
const notes = []

for (const [lang, file] of Object.entries(files)) {
  const path = join(root, file)
  if (!existsSync(path)) { problems.push(file + ' 不存在'); continue }
  const text = readFileSync(path, 'utf8')

  // 1) 图片/链接：站内相对路径必须真实存在；仓库内绝对 URL 必须能映射到本地文件
  const refs = [...text.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)].map((m) => m[1])
  for (const ref of refs) {
    if (/^https?:/.test(ref)) {
      if (ref.startsWith(RAW)) {
        const local = join(root, ref.slice(RAW.length))
        if (!existsSync(local)) problems.push(file + ' 指向的图不存在：' + ref.slice(RAW.length))
        else if (statSync(local).size === 0) problems.push(file + ' 指向的图是 0 字节：' + ref.slice(RAW.length))
      } else {
        notes.push(file + ' 用了站外图片（不判红，但离线/隐私场景会裂）：' + ref.slice(0, 60))
      }
    } else if (!/^[a-z]+:/i.test(ref)) {
      if (!existsSync(join(root, ref))) problems.push(file + ' 指向的相对资源不存在：' + ref)
    }
  }

  // 2) 版本串：README 必须与 package.json 一致
  const m = text.match(VERSION_LINE[lang])
  if (!m) problems.push(file + ' 找不到版本行（应为「当前版本 **x.y.z**」/「Current version **x.y.z**」）')
  else if (m[1] !== VERSION) problems.push(file + ' 版本写成 ' + m[1] + '，package.json 是 ' + VERSION)

  // 3) 过期措辞（剥掉引用态后再判）
  const bare = stripQuoted(text)
  for (const [label, re, why, instead] of BANNED) {
    if (re.test(bare)) problems.push(file + ' 出现过期措辞「' + label + '」 —— ' + why + '；应改成：' + instead)
  }

  // 4) 两版互链
  const other = lang === 'zh' ? 'README.en.md' : 'README.md'
  if (!text.includes('(' + other + ')')) problems.push(file + ' 没有链到 ' + other)
}

// 5) 中英结构对齐：标题层级、图片、代码块、表格数量应一致
const shape = (text) => ({
  h1: (text.match(/^# /gm) || []).length,
  h2: (text.match(/^## /gm) || []).length,
  h3: (text.match(/^### /gm) || []).length,
  images: (text.match(/!\[[^\]]*\]\(/g) || []).length,
  fences: (text.match(/^```/gm) || []).length,
  tables: (text.match(/^\|.*\|$/gm) || []).length,
})
const zhText = existsSync(join(root, 'README.md')) ? readFileSync(join(root, 'README.md'), 'utf8') : ''
const enText = existsSync(join(root, 'README.en.md')) ? readFileSync(join(root, 'README.en.md'), 'utf8') : ''
if (zhText && enText) {
  const a = shape(zhText)
  const b = shape(enText)
  for (const key of Object.keys(a)) {
    if (a[key] !== b[key]) problems.push('中英结构不对齐：' + key + ' 中文 ' + a[key] + ' / 英文 ' + b[key] + '（两版应同步维护）')
  }
}

for (const n of notes) console.log('WARN  ' + n)
if (problems.length) {
  for (const p of problems) console.error('FAIL  ' + p)
  console.error('[verify:readme] 失败 ' + problems.length + ' 项')
  process.exit(1)
}
console.log('OK    README：图文链接可达、中英结构对齐、版本串 ' + VERSION + ' 一致、无过期措辞')
