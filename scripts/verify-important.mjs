#!/usr/bin/env node
/**
 * !important 棘轮门：宿主全部 <style> 里的 !important 只有十几处，插件却 hundreds。
 * 每加一条就是在「优先级军备竞赛」里升一级，宿主下次升级就得再加两条。
 * 这里不要求降，只要求**不再升**：计数不得高于 contracts/important-baseline.json。
 * 真要加（有充分理由），跑 node scripts/verify-important.mjs --update 并在 CHANGELOG 写明为什么。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const file = join(root, 'contracts', 'important-baseline.json')
const count = (s) => (String(s).match(/!important/g) || []).length
// 只数插件注入的 CSS 文本（PANEL_CSS + fxCss + token decls），不数注释与字符串字面量里出现的那几个。
const src = readFileSync(join(root, 'client.js'), 'utf8')
const now = count(src)
const update = process.argv.includes('--update')
if (update || !existsSync(file)) {
  writeFileSync(file, JSON.stringify({ $comment: 'client.js 里 !important 的总数上限；只能降不能升（棘轮）。', max: now, at: new Date().toISOString() }, null, 2) + '\n')
  console.log('WROTE !important 基线 = ' + now + ' → contracts/important-baseline.json')
  process.exit(0)
}
const base = JSON.parse(readFileSync(file, 'utf8'))
if (now > base.max) {
  console.error('FAIL  client.js 的 !important 计数 ' + now + ' 高于基线 ' + base.max + '：又升了一级优先级。')
  console.error('      优先改选择器特异性/注入顺序；确需增加则 node scripts/verify-important.mjs --update 并在 CHANGELOG 说明。')
  process.exit(1)
}
console.log('OK    !important 计数 ' + now + ' ≤ 基线 ' + base.max + '（棘轮）')
