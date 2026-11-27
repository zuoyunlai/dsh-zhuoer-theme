#!/usr/bin/env node
/**
 * 宿主导航漂移检查（对照本机 DSH 的 app.asar）。
 *
 * 为什么需要它：本插件大量依赖 [class*="_语义名"] 这类**稳定子串**去命中 DSH 的 CSS Module 类名。
 * DSH 改一次名，那一片样式就**静默失效**——不报错、门禁全绿、只是界面上少了一块。
 * 现有 verify:host 只对账「代码用了什么 ↔ 契约登记了什么」，两边的名字都还在，
 * 它**判断不了「这个名字在宿主里还存不存在」**。本脚本补的就是这一段。
 *
 * 做法（照 dsh-bloom-theme 的 dsh-drift 思路）：把宿主 app.asar 整块读进内存，
 * 对契约里登记的每个片段做**子串**匹配（必须子串：DSH 用的是 class*=）。
 * asar 里各文件内容首尾相接，所以直接对二进制做 indexOf 就够，不需要解析容器格式。
 *
 * 为什么**不做** npm 下载那条腿（Bloom 有，我们刻意没有，2026-11-27 实测）：
 * 在 0.2.2-rc.5 上把候选包全下来解包逐包扫，覆盖度是——
 *   @deepseek-ai/dsh-client-ui-conversation  10 / 24
 *   ui-settings 1 · locale 1 · dsh-web 1（dsh-client-ui-core / ui-shell / dsh-client 在 npm 上不存在）
 * 也就是说 npm 路只能看到 42% 的片段，剩下 14 条会变成**假缺失**，硬门会天天红。
 * 宿主的类名分散在桌面外壳与打包产物里，不在这些公开包中。所以本门只认本机安装，
 * CI 上 SKIP；发版前本机一定会跑 npm test，这道门就在那时候起作用。
 *
 * 退出码：
 *   0  没有「基线外」的缺失（可能一切正常，也可能全是已记账的旧缺失）
 *   1  出现基线外的缺失——阻止新漂移
 *   0  找不到宿主（SKIP）：CI 上没有 DSH 安装，这不是失败
 *
 * 用法：
 *   node scripts/verify-host-drift.mjs                       # 自动找本机 app.asar
 *   node scripts/verify-host-drift.mjs --asar <path>
 *   node scripts/verify-host-drift.mjs --from <file-or-dir>  # 扫一个目录/文件（解包后的宿主）
 *   node scripts/verify-host-drift.mjs --update-baseline --reason "为什么还没改"
 *   node scripts/verify-host-drift.mjs --offline             # 与默认行为一致（不联网）
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const args = process.argv.slice(2)
const argOf = (flag, def) => { const i = args.indexOf(flag); return i >= 0 && args[i + 1] ? args[i + 1] : def }

const BASELINE = join(root, 'contracts', 'host-drift-baseline.json')
const CONTRACT = join(root, 'contracts', 'host-contract.json')
const CANDIDATES = [
  process.env.DSH_ASAR || '',
  'D:/Programs/DeepSeek Harness/resources/app.asar',
  join(homedir(), 'AppData', 'Local', 'Programs', 'DeepSeek Harness', 'resources', 'app.asar'),
  join(homedir(), '.dsh', 'dsh-runtimes', 'app.asar'),
].filter(Boolean)

const contract = JSON.parse(readFileSync(CONTRACT, 'utf8'))
const host = contract.host || {}
const items = []
for (const c of host.classFragments || []) items.push({ fragment: c.fragment, kind: 'class', usedFor: c.usedFor || '', breaks: c.breaksIfMissing || '' })
for (const c of host.idFragments || []) items.push({ fragment: c.fragment, kind: 'id', usedFor: c.usedFor || '', breaks: c.breaksIfMissing || '' })

let source = argOf('--asar', '') || argOf('--from', '')
let buf = null
let scannedFiles = 1
if (source) {
  if (!existsSync(source)) { console.error('FAIL  指定的宿主路径不存在：' + source); process.exit(1) }
  const st = statSync(source)
  if (st.isDirectory()) {
    const parts = []
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        const s = statSync(p)
        if (s.isDirectory()) walk(p)
        else if (/\.(js|mjs|cjs|css|html|json)$/.test(name)) parts.push(readFileSync(p))
      }
    }
    walk(source)
    buf = Buffer.concat(parts)
    scannedFiles = parts.length
  } else {
    buf = readFileSync(source)
  }
} else {
  for (const cand of CANDIDATES) {
    if (existsSync(cand)) { source = cand; buf = readFileSync(cand); break }
  }
}

if (!buf) {
  console.log('SKIP  没找到宿主 app.asar（CI 上正常）。本机要跑：--asar <path> 或设 DSH_ASAR。')
  process.exit(0)
}

const missing = []
const found = []
for (const it of items) {
  if (buf.indexOf(it.fragment) === -1) missing.push(it)
  else found.push(it)
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : { missing: [] }
const known = new Set((baseline.missing || []).map((m) => m.fragment))
const fresh = missing.filter((m) => !known.has(m.fragment))
const repaired = [...known].filter((f) => !missing.some((m) => m.fragment === f))

console.log('INFO  宿主 ' + basename(source) + '（' + (buf.length / 1048576).toFixed(1) + ' MB' + (scannedFiles > 1 ? ' / ' + scannedFiles + ' 文件' : '') + '）')
console.log('INFO  契约片段 ' + items.length + ' 个：命中 ' + found.length + '，缺失 ' + missing.length + (known.size ? '（基线里记账 ' + known.size + '）' : ''))

if (args.includes('--update-baseline')) {
  const reason = argOf('--reason', '未写原因')
  const next = {
    '$comment': '宿主漂移基线：这里记「已确认在宿主里消失、但还没改代码」的片段。每条必须写原因。出现基线外的新缺失时 verify:host-drift 会红。',
    updatedAt: new Date().toISOString().slice(0, 10),
    host: { path: source, bytes: buf.length },
    missing: missing.map((m) => {
      const old = (baseline.missing || []).find((b) => b.fragment === m.fragment)
      return { fragment: m.fragment, kind: m.kind, reason: old ? old.reason : reason, since: old ? old.since : new Date().toISOString().slice(0, 10), breaksIfMissing: m.breaks }
    }),
  }
  writeFileSync(BASELINE, JSON.stringify(next, null, 2) + '\n', 'utf8')
  console.log('WROTE 基线：' + BASELINE + '（缺失 ' + missing.length + ' 条）')
  process.exit(0)
}

for (const m of missing) {
  const tag = known.has(m.fragment) ? '已知' : '新缺失'
  console.log('      ' + tag + ' ' + m.fragment + '（' + m.kind + '）' + (m.breaks ? ' → ' + m.breaks : ''))
}
for (const f of repaired) console.log('INFO  已修好（可从基线移除）：' + f + '　跑 --update-baseline 收敛基线')

if (fresh.length) {
  console.error('FAIL  出现 ' + fresh.length + ' 个基线外缺失——DSH 可能改过名，这几处样式会在界面上静默消失。')
  console.error('      逐条确认后：node scripts/verify-host-drift.mjs --update-baseline --reason "还没改的原因"')
  process.exit(1)
}
console.log('OK    宿主导航漂移：' + items.length + ' 个契约片段无新增缺失' + (missing.length ? '（' + missing.length + ' 条已在基线记账）' : ''))
