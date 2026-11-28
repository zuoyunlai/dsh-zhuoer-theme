#!/usr/bin/env node
/**
 * 首帧观测读数：把探针报回来的记录读成三个数字——闪/不闪、差多少、多久。
 *
 * 记录来源：客户端探针（src/02-boot-probe.js）在调试闸门打开时 POST 到
 * /dsh-zhuoer-theme/api/report，落在 ~/.dsh/dsh-zhuoer-theme/client-report.log 里，
 * phase = boot-probe。页面上也有一份：<script id="dsh-zhuoer-boot-probe" type="application/json">。
 *
 * 怎么拿一条记录：先开闸门再刷新——
 *   浏览器控制台：localStorage['dsh-zhuoer-theme:debug'] = '1'；location.reload()
 *
 * 用法：
 *   node scripts/boot-probe-report.mjs            读最后一条（当前 schema）
 *   node scripts/boot-probe-report.mjs --all      读全部（按时间倒序）
 *   node scripts/boot-probe-report.mjs --json     输出 JSON（给别的脚本用）
 */
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const logPath = join(homedir(), '.dsh', 'dsh-zhuoer-theme', 'client-report.log')
const argv = process.argv.slice(2)
const asJson = argv.includes('--json')
const all = argv.includes('--all')

if (!existsSync(logPath)) {
  console.error('找不到 ' + logPath + '（客户端还没上报过）')
  process.exit(2)
}

const rows = []
for (const line of readFileSync(logPath, 'utf8').split(/\r?\n/)) {
  if (!line.trim()) continue
  let o
  try { o = JSON.parse(line) } catch (e) { continue }
  if (o && o.phase === 'boot-probe' && o.data) rows.push(o)
}
if (!rows.length) {
  console.error('日志里没有 boot-probe 记录。先开调试闸门再刷新页面：localStorage["dsh-zhuoer-theme:debug"]="1"')
  process.exit(2)
}

// 只认当前 schema（带 flashed 的那版），否则会读到旧探针留下的记录。
const current = rows.filter((r) => r.data && 'flashed' in r.data)
const use = current.length ? current : rows
const pick = all ? use.slice().reverse() : use.slice(-1)

if (asJson) {
  console.log(JSON.stringify(pick.map((r) => ({ at: r.receivedAt || r.at, ...r.data })), null, 2))
  process.exit(0)
}

for (const r of pick) {
  const d = r.data
  const flash = d.flashMs
  const verdict = d.flashed === true ? 'FLASH' : d.flashed === false ? 'NO_FLASH' : 'UNKNOWN'
  console.log('— ' + (r.receivedAt || r.at))
  console.log('   首绘: first-paint=' + d.firstPaint + 'ms  FCP=' + d.firstContentfulPaint + 'ms  观测起点=' + d.observedFrom + 'ms  底色最后变化=' + d.themeLandedAt + 'ms')
  console.log('   ① 闪不闪: ' + verdict + (flash === null || flash === undefined ? '' : '（闪 ' + flash + 'ms）'))
  console.log('   ② 差多少: 首帧底色 ' + (d.firstColor || d.hostBg) + ' → 最终底色 ' + (d.lastColor || d.themeBg) + '  ΔE=' + d.deltaE)
  console.log('   ③ 多久: ' + (d.flashMs === null || d.flashMs === undefined ? '观测窗内没有底色变化' : d.flashMs + 'ms'))
  if (d.frames && d.frames.length) {
    console.log('   采样: ' + d.frames.map((s) => s.t + 'ms ' + s.where + '=' + s.color).join('  '))
  }
  if (d.marks && d.marks.length) {
    console.log('   打点: ' + d.marks.map((m) => m.phase + '@' + m.t + 'ms(bg=' + (m.bg || '-') + ')').join('  '))
  }
}
