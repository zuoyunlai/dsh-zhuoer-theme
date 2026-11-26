#!/usr/bin/env node
/**
 * 对比度图表：从**门禁台账** contracts/contrast-baseline.json 生成 SVG。
 *
 * 为什么从台账而不是重新计算：台账是对比度门禁每次跑都会核对的那份真值，
 * 图表与门禁同源，不会出现「图好看、门禁红」的两套数字。
 *
 * 输出：docs/images/contrast-audit.svg（纯文本 SVG，零依赖，可复跑）
 * 用法：node scripts/contrast-chart.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ledger = JSON.parse(readFileSync(join(root, 'contracts', 'contrast-baseline.json'), 'utf8'))

// 只画台账里**成组**的角色：内置主题没有逐套的 label-secondary 测量（只有自定义样本有 1 组），
// 拿 n=1 画「最差」会误导，所以次级不进图；用 caption 代表最低一档文字。
const ROLES = [
  { label: '正文', match: / 正文$/ },
  { label: '三级', match: / label-tertiary$/ },
  { label: '提示', match: / label-caption$/ },
  { label: '错误', match: / state-error-primary@base$/ },
  { label: '成功', match: / state-success-primary$/ },
]

const stats = []
for (const role of ROLES) {
  const rows = ledger.pairs.filter((p) => role.match.test(p.key) && typeof p.lc === 'number' && !p.decor)
  if (!rows.length) continue
  const abs = rows.map((p) => Math.abs(p.lc))
  const ratios = rows.map((p) => p.ratio)
  stats.push({
    label: role.label,
    n: rows.length,
    minLc: Math.min(...abs),
    medLc: abs.slice().sort((a, b) => a - b)[Math.floor(abs.length / 2)],
    minRatio: Math.min(...ratios),
    medRatio: ratios.slice().sort((a, b) => a - b)[Math.floor(ratios.length / 2)],
  })
}

if (!stats.length) { console.error('台账里没有可用的文字角色数据'); process.exit(1) }

const W = 1400, H = 420, PAD = 34, BOT = 96
const plotH = H - PAD - BOT
const maxLc = 100
const yOf = (v) => PAD + plotH - (Math.min(v, maxLc) / maxLc) * plotH
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
const gw = (W - PAD * 2) / stats.length
const bw = gw * 0.24

const parts = []
parts.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" font-family="Segoe UI, Microsoft YaHei, sans-serif">')
parts.push('<rect width="' + W + '" height="' + H + '" fill="#0e1015"/>')
// 参考线：Lc 60（正文标准）与 Lc 30（最小可读）
for (const v of [60, 30]) {
  const y = yOf(v)
  parts.push('<line x1="' + PAD + '" y1="' + y + '" x2="' + (W - PAD) + '" y2="' + y + '" stroke="' + (v === 60 ? '#c4694f' : '#6d6157') + '" stroke-width="1.5" stroke-dasharray="6 5"/>')
  parts.push('<text x="' + (W - PAD - 4) + '" y="' + (y - 7) + '" fill="' + (v === 60 ? '#e08a6c' : '#9a8c7e') + '" font-size="13" text-anchor="end">Lc ' + v + '</text>')
}
stats.forEach((s, i) => {
  const cx = PAD + gw * i + gw / 2
  const bars = [[s.minLc, '#7896c8', '最差'], [s.medLc, '#96beeb', '中位']]
  bars.forEach((b, j) => {
    const x = cx - bw - 3 + j * (bw + 6)
    const y = yOf(b[0])
    parts.push('<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + (PAD + plotH - y) + '" fill="' + b[1] + '" rx="3"/>')
    parts.push('<text x="' + (x + bw / 2) + '" y="' + (y - 7) + '" fill="#cdc8c2" font-size="12" text-anchor="middle">' + b[0].toFixed(1) + '</text>')
  })
  parts.push('<text x="' + cx + '" y="' + (PAD + plotH + 26) + '" fill="#d8d3cd" font-size="15" text-anchor="middle">' + esc(s.label) + '</text>')
  parts.push('<text x="' + cx + '" y="' + (PAD + plotH + 48) + '" fill="#a49c93" font-size="12" text-anchor="middle">最差比 ' + s.minRatio.toFixed(2) + ':1</text>')
  parts.push('<text x="' + cx + '" y="' + (PAD + plotH + 66) + '" fill="#8d857c" font-size="11" text-anchor="middle">n=' + s.n + ' 组</text>')
})
parts.push('<text x="' + PAD + '" y="' + (H - 30) + '" fill="#b0a89e" font-size="13">APCA Lc：亮底黑字为正、暗底浅字为负，取绝对值。蓝=最差，浅蓝=中位；虚线为 Lc 60（正文标准）与 Lc 30（最小可读）。</text>')
parts.push('<text x="' + PAD + '" y="' + (H - 12) + '" fill="#7d766e" font-size="12">数据源：contracts/contrast-baseline.json（对比度门禁台账，' + ledger.count + ' 组）</text>')
parts.push('</svg>')

const out = join(root, 'docs', 'images', 'contrast-audit.svg')
writeFileSync(out, parts.join('\n'))
console.log('OK    图表已写入 ' + out + '（' + stats.length + ' 个角色，' + ledger.count + ' 组台账）')