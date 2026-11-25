#!/usr/bin/env node
/**
 * 字号缩放门：缩放只许走「文字尺寸」通路，**禁止 body{zoom}**。
 *
 * 历史：0.4.1 把全局缩放换成「只放大主栏正文的 --dsw-font-* 子集」，被用户实测打回；
 * 0.6.19 用 body{zoom} 又踩了更硬的坑——zoom 会把布局坐标整体乘一个数，而宿主侧栏拖拽
 * 是按 clientX 与列宽直接比较的，于是「点不中把手、拖的却是中栏」。0.6.20 改为：
 *   ① 按比例放大 --dsw-font-* 里的 px（文字全部变大，布局宽高不动）
 *   ② 给宿主的 --dsh-content-font-* 变量赋值（宿主自己用它算内容行高）
 * 本条门同时守这两点：zoom 不得回归；token 缩放必须存在。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const code = readFileSync(join(root, 'client.js'), 'utf8')
const fails = []

if (/body\{zoom:/.test(code)) {
  fails.push('检测到 body{zoom}：它会让宿主侧栏拖拽的坐标对账失效（点不中把手、拖到错误的栏）')
}
if (!/pref\.fontScale/.test(code)) {
  fails.push('找不到 pref.fontScale 的使用点：字号滑块可能已失效')
}
if (!/--dsw-font/.test(code) || !/px\/g, function \(m, n\)/.test(code) || !/parseFloat\(n\) \* fsK/.test(code)) {
  fails.push('缺少 --dsw-font-* 的 px 按比例缩放实现：字号滑块不会有任何效果')
}
if (!/--dsh-content-font-size/.test(code)) {
  fails.push('缺少 --dsh-content-font-* 的注入：对话正文的行高不会跟着字号变')
}

if (fails.length) {
  console.error('[verify:scale] 失败')
  for (const f of fails) console.error('  - ' + f)
  process.exit(1)
}
console.log('OK    字号缩放：只动文字尺寸（无 body{zoom}），token 与内容字号变量都已接线')
