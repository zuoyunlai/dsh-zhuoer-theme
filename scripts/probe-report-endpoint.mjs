#!/usr/bin/env node
/**
 * report 端点的截断行为探针（手工验证用）。
 *
 * 用途：验证 /dsh-zhuoer-theme/api/report 的 body 上限逻辑——发一个 >200 KB 的请求，
 * 看落盘的那一行里有没有 truncated 标记、raw 是不是只剩 2 KB。
 * 判读：
 *   新代码 → 落盘行的键是 receivedAt / raw / truncated，且 truncated === true、raw 长度 2000；
 *   旧代码 → 落盘行只有 receivedAt / raw（没有 truncated 键）——说明**跑着的还是旧模块**。
 *     index.js 属于宿主侧，改它必须重启 DSH 或重载插件，热替换只覆盖 client.js。
 *
 * 用法：
 *   node scripts/probe-report-endpoint.mjs [baseUrl]
 *   baseUrl 默认 http://127.0.0.1:8350（桌面端 Web GUI）。
 *
 * 副作用：会往 ~/.dsh/dsh-zhuoer-theme/client-report.log 追加一行，**脚本自己会删掉它**。
 */
import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const BASE = process.argv[2] || 'http://127.0.0.1:8350'
const LOG = join(homedir(), '.dsh', 'dsh-zhuoer-theme', 'client-report.log')
const MARK = 'probe-report-endpoint'

const big = JSON.stringify({ phase: MARK, blob: 'z'.repeat(300000) })
const t0 = Date.now()
const res = await fetch(BASE + '/dsh-zhuoer-theme/api/report', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-zhuoer-client': '1' },
  body: big,
})
const resp = await res.text()
const ms = Date.now() - t0

let out = { base: BASE, httpStatus: res.status, responseBody: resp, sentBytes: big.length, roundTripMs: ms }
let all = []
try {
  all = readFileSync(LOG, 'utf8').trimEnd().split('\n')
  const line = all[all.length - 1]
  const obj = JSON.parse(line)
  out.writtenKeys = Object.keys(obj)
  out.truncated = obj.truncated
  out.rawLen = typeof obj.raw === 'string' ? obj.raw.length : null
  out.rawStartsWith = typeof obj.raw === 'string' ? obj.raw.slice(0, 30) : null
  out.verdict = (obj.truncated === true && out.rawLen === 2000)
    ? 'PASS：新代码按预期截断并留下 truncated 标记'
    : '旧代码在跑：落盘行没有 truncated 键 —— index.js 改动需要重启 DSH 或重载插件（热替换只覆盖 client.js）'
} catch (e) {
  out.verdict = '读不到日志：' + e.message
}

// 清理自己写的那一行，不给用户留垃圾
try {
  const kept = all.filter((l) => l.indexOf(MARK) === -1)
  writeFileSync(LOG, kept.join('\n') + '\n', 'utf8')
  out.cleanedLines = all.length - kept.length
} catch (e) { /* ignore */ }

console.log(JSON.stringify(out, null, 2))