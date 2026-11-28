#!/usr/bin/env node
/**
 * 全局键门（A2）：插件自己的状态不许挂在 window 上。
 *
 * 判据：client.js 与 src/*.js 的**代码**里出现 window.__zr 即红（注释里可以提，用来解释历史）。
 * 为什么要有这道门：
 *   1) window 上的键同页任何脚本都能读能改，清了就没了；
 *   2) 热更新时新旧闭包共用同一个键 —— 旧闭包写下「已探测」「已成文」之后，新闭包会误判成
 *      已完成而整段跳过，样式/探针停在上一版且没有任何提示。0.6.45 之前的
 *      window.__zrExtraText 就是这么让样式停住的。
 * 允许的做法：模块作用域变量；跨闭包接力靠 DOM 或对象上的标记（如 sheet.__zrMark）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// 去注释再扫：错误信息里允许出现 window.__zrExtraSheet 这类历史名字。
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
const targets = [['client.js', path.join(root, 'client.js')]]
const srcDir = path.join(root, 'src')
for (const f of fs.readdirSync(srcDir)) {
  if (f.endsWith('.js')) targets.push(['src/' + f, path.join(srcDir, f)])
}
const hits = []
for (const [label, file] of targets) {
  let raw = ''
  try { raw = fs.readFileSync(file, 'utf8') } catch (e) { continue }
  const code = strip(raw)
  const lines = code.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('window.__zr') !== -1) hits.push(label + ':' + (i + 1) + '  ' + lines[i].trim().slice(0, 100))
  }
}
if (hits.length) {
  console.error('[verify:globals] 失败：插件状态又挂回 window 了')
  for (const h of hits) console.error('  - ' + h)
  console.error('  改法：换成模块作用域变量；需要跨闭包接力就用 DOM 标记或对象属性（见 src/20-tokens.js 的 ZR_SHEET_MARK）。')
  process.exit(1)
}
const total = targets.reduce((n, [, f]) => { try { return n + fs.readFileSync(f, 'utf8').length } catch (e) { return n } }, 0)
console.log('OK    全局键：' + targets.length + ' 个文件、' + total + ' 字符里没有 window.__zr')