#!/usr/bin/env node
/**
 * Markdown 排版规则的目标容器核对。
 *
 * 为什么要有这道门：0.6.31 的「排版节奏」和 0.6.32 的「标题配色」都写在了
 * `[class*="_prose"]` 上——那是宿主「工具详情 JSON 树」组件的 CSS-module 名
 *（_1h1PMq_prose），与助手正文无关。结果是两条设置在界面上完全看不出效果。
 *
 * 本门查两件事：
 *   1) 我们的 Markdown 规则区必须用 `_markdown_`（宿主助手 Markdown 组件的稳定片段），
 *      且不得出现 `_prose`；
 *   2) 能读到宿主 app.asar 时，断言宿主里确实存在
 *      「_markdown_xx h1{font:var(--dsw-font-markdown-h1)}」这类规则——
 *      有它才说明这个片段**真的是**正文容器（同名片段可能属于别的组件）。
 *
 * 用法：node scripts/verify-markdown-css.mjs [app.asar 路径]
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bad = []

// 1) 源码侧：Markdown 规则区的容器
const src = readFileSync(join(root, 'src', '20-tokens.js'), 'utf8')
const fine = src.slice(src.indexOf('var MDC ='), src.indexOf('const nextCss = css + extra'))
// 表格的精细规则已抽进纯函数 zrTableFineCss（便于无头断言），
// 所以表格相关的检查必须把这段也纳入，否则会误报「没有 border-collapse」。
const tableFn = (() => {
  const a = src.indexOf('function zrTableFineCss')
  const b = src.indexOf('function applyTokens')
  return a >= 0 && b > a ? src.slice(a, b) : ''
})()
const fineAll = fine + tableFn
if (fine && !fine.includes('.md-code-block')) bad.push('精细化规则里没有 .md-code-block（宿主代码块的类名是它）')
if (fine && !fine.includes('blockquote')) bad.push('精细化规则里没有 blockquote')
if (!fineAll.includes('border-collapse')) bad.push('精细化规则里没有表格的 border-collapse')
// 真机反馈（2026-11-27）：宿主把首列左内边距归零（td:first-child{padding-left:0}，特异性 (0,2,1)），
// 我们一画边框，首列内容就贴着竖线。补丁必须一直在，否则这个毛病会静默回归。
if (tableFn && !tableFn.includes(':first-child{padding-left:10px;}')) {
  bad.push('表格画边框时没有把首列左内边距补回来（首列内容会贴着竖线）')
}
const from = src.indexOf('const MD = {')
const to = src.indexOf('const nextCss = css + extra')
const block = from >= 0 && to > from ? src.slice(from, to) : ''
if (!block) bad.push('找不到 Markdown 规则区（MD 常量 → nextCss 拼接）')
if (block && !block.includes('[class*="_markdown_"]')) bad.push('Markdown 规则没有用 _markdown_ 容器')
if (block && block.includes('[class*="_prose"]')) bad.push('Markdown 规则里还在用 _prose（那是工具详情 JSON 树组件，不是助手正文）')

// 2) 宿主侧：这个片段必须真的是正文容器
const asar = process.argv[2] || 'D:/Programs/DeepSeek Harness/resources/app.asar'
if (existsSync(asar)) {
  const s = readFileSync(asar, 'latin1')
  if (!s.includes('_markdown_')) bad.push('宿主 app.asar 里找不到 _markdown_（片段变了？）')
  // 精细化要挂的宿主结构：代码块类名、表格、引用块
  if (!s.includes('md-code-block')) bad.push('宿主 app.asar 里找不到 md-code-block（代码块类名变了？）')
  if (!/blockquote\{[^}]*border-left/.test(s)) bad.push('宿主 app.asar 里找不到 blockquote 的 border-left 规则（引用块结构变了？）')
  if (!/_markdown_[A-Za-z0-9_]*\s*h1\{font:var\(--dsw-font-markdown-h1\)/.test(s)) {
    bad.push('宿主 app.asar 里找不到「_markdown_xx h1{font:var(--dsw-font-markdown-h1)}」——这个片段可能不是助手 Markdown 容器')
  }
} else {
  console.log('（跳过宿主侧核对：找不到 ' + asar + '）')
}

if (bad.length) {
  console.error('[verify:markdown-css] ' + bad.length + ' 项')
  for (const b of bad) console.error('  - ' + b)
  process.exit(1)
}
console.log('OK    Markdown 规则容器正确（_markdown_），宿主侧 h1 规则也确认过')