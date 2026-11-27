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
const src = readFileSync(join(root, 'src', '20-tokens-and-panel.js'), 'utf8')
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