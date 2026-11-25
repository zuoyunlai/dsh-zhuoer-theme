#!/usr/bin/env node
/**
 * 字号缩放门：全局缩放必须走 body{zoom}，且不得再缩放 --dsw-font-* 的 px。
 *
 * 起因：0.4.1 把 body{zoom} 换成了「只放大 --dsw-font-* 里的 px」，
 * 结果只有主栏对话正文变大，侧栏 / 按钮 / 面板不变（用户实测反馈）。
 * 那次改动通过了当时全部门禁——所以补这一道，防止再被「清理」掉。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const code = readFileSync(join(root, 'client.js'), 'utf8')
const fails = []

if (!/body\{zoom:/.test(code)) {
  fails.push('缺少全局缩放规则 body{zoom:…}：界面字号调整会只影响部分文字')
}
if (!/pref\.fontScale/.test(code)) {
  fails.push('找不到 pref.fontScale 的使用点：字号滑块可能已失效')
}
// 只看真正的「改写 token 内 px」实现；/^--dsw-font/ 这类判断本身是 CJK 字体链用的，属正常代码。
if (/px\/g,\s*function \(m, pre, num\)/.test(code) || /parseFloat\(num\) \* k \* 100/.test(code)) {
  fails.push('检测到按 --dsw-font-* 改写 px 的实现：它会与 body{zoom} 叠加或只放大正文')
}

// 面板反向补偿：必需存在，且除数是 100（漏写会让面板缩到 1%，表现为「设置页一片空白」）。
if (/zp-root\{zoom:/.test(code)) {
  if (!/Math\.round\(10000 \/ pref\.fontScale\) \/ 100\b/.test(code)) {
    fails.push('面板反向补偿的算式不是 100/scale：写成 /10000 会把面板缩到 1%（0.6.19 真实事故）')
  }
} else {
  fails.push('缺少 html .zp-root{zoom:1/scale}：字号缩放会连带缩小设置面板')
}

if (fails.length) {
  console.error('[verify:scale] 失败')
  for (const f of fails) console.error('  - ' + f)
  process.exit(1)
}
console.log('OK    字号缩放：全局 body{zoom} 存在，且未做字体 token 的 px 改写')
