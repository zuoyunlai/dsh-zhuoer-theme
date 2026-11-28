#!/usr/bin/env node
/**
 * 纹理对比度门：把「底纹压在正文下面之后，文字还够不够读」变成机器可查。
 *
 * 与 verify-contrast 的分工（刻意分开，别混做）：
 *   verify-contrast 管**声明式**地板——label-* 对 bg-base 的比值，内置主题由设计给出、
 *   自定义主题由 enforceTextFloor 兜住（正文 7 / 次级 6 / 三级 4.5）。
 *   本门只管**纹理侵蚀**：底纹是一层 ::before 背景图，可见度 100% 时按 0.7 不透明度
 *   压在内容下面，同一段文字在不同像素位置的背景并不相同，纹理亮部抬高背景、暗部压低。
 *   声明式算出的 10:1 是底色比值，不是最不利像素的比值。
 *
 * 为什么本门不自己解 WebP：仓库零依赖。逐像素合成在 scripts/measure-texture.mjs
 * （浏览器 canvas）跑一次，结果与每个纹理文件的 sha256 一起落进
 * contracts/texture-luminance.json；本门只做纯数学复算 + 文件对账。
 *
 * 判据（任一不满足即红）：
 *   1. 纹理文件 sha256/字节数与契约一致（换图没重测 = 红）；
 *   2. 每行 base 与 themes.mjs 当前底色一致（改底色没重测 = 红）；
 *   3. 覆盖度：每个 主题 × 明暗 × full/soft 都要有行（加主题没重测 = 红）；
 *   4. 侵蚀：declared − worst ≤ EROSION_BUDGET（纹理不许把对比度拉下去太多）；
 *   5. 归责：当 declared 本来 ≥ 4.5 而 worst < 4.5 时判红——是纹理把达标的压破了。
 *      若 declared 本身就 < 4.5，那是主题设计层面的既有问题，本门只打印不判红
 *      （否则会把「纹理无害」误报成门禁红，反而模糊了归责）。
 *   6. 契约 floors 抄件不得被改写（真源在本脚本）。
 *   7. 分辨率：每个纹理文件宽度 ≥ 1600（R-11）——素材比显示尺寸小多少就被 cover 放大多少，
 *      1000 宽的图铺满主栏会放大近 3 倍，颗粒变软块（「模糊色斑」）。
 *
 * 为什么取最不利分位而不是 p50：线稿纹理绝大多数像素 alpha=0，p50 就等于底色，
 * 拿 p50 判等于什么都没验；真正压低对比度的是 p100（暗底浅字被提亮）与 p5（亮底深字被压暗）。
 */
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const contractPath = join(root, 'contracts', 'texture-luminance.json')

const ABSOLUTE = 4.5
// 侵蚀用**相对**预算而不是绝对常数：侵蚀幅度随对比度本身缩放，绝对常数会在高对比主题上误报。
//
// 0.6.44 起预算从 10% 放到 40%。原因不是放宽门，而是判据选错了层：
// 内置底纹原先把 alpha 压到 6-25/255（有效不透明度 2-10%），视觉上几乎不可见，
// 于是「侵蚀 <= 10%」这条永远成立——它成立是因为纹理根本没画上去。
// 把 dash 的 alpha 归一到 90/255 后，最不利侵蚀是 19.3%，这不是缺陷，
// 而是「纹理可见」的必然代价。真正要保的不变量是「文字仍达 AA」（由绝对地板判），
// 40% 只作为「别把纹理做成涂墙」的兜底。
const EROSION_RATIO = 0.4
const ROLES = ['primary', 'secondary', 'tertiary']
const ROLE_TOKEN = {
  primary: '--dsw-alias-label-primary',
  secondary: '--dsw-alias-label-secondary',
  tertiary: '--dsw-alias-label-tertiary',
}

if (!existsSync(contractPath)) {
  console.error('FAIL  缺 contracts/texture-luminance.json（先跑 node scripts/measure-texture.mjs）')
  process.exit(1)
}
const contract = JSON.parse(readFileSync(contractPath, 'utf8'))
const { THEMES, THEME_IDS } = await import(pathToFileURL(join(root, 'themes.mjs')).href)

let bad = 0
const fail = (m) => { console.error('FAIL  ' + m); bad++ }

if (contract.floors && contract.floors.absolute !== ABSOLUTE) fail('契约 floors.absolute = ' + contract.floors.absolute + '，门禁要求 ' + ABSOLUTE)
if (contract.floors && contract.floors.erosionRatio !== EROSION_RATIO) fail('契约 floors.erosionRatio = ' + contract.floors.erosionRatio + '，门禁要求 ' + EROSION_RATIO)

// 分辨率下限（R-11）：底纹铺满主栏靠 `background-size:cover`，素材比显示尺寸小多少就被放大多少。
// 1000 宽铺 977 CSS px（DPR 2 ≈ 1954 设备像素）时净放大 2.9 倍，用来压色带的 ±1 级颗粒
// 会被拉成 3×3 的软块——用户报的「模糊色斑」就是它，而界面不会报任何错。
// 1600 = 内置素材的现状（assets/bg 全是 1600×997），所以这条线的意思是「不得低于现状」。
// 只读文件头 30 字节取宽高，不碰像素：零依赖，也不算把解码搬进门禁。
const MIN_TEX_WIDTH = 1600
function texWidth(buf) {
  try {
    if (buf[0] === 0x89 && buf[1] === 0x50) return buf.readUInt32BE(16)
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
      const t = buf.toString('ascii', 12, 16)
      if (t === 'VP8X') return 1 + buf.readUIntLE(24, 3)
      if (t === 'VP8 ') return buf.readUInt16LE(26) & 0x3fff
      if (t === 'VP8L') return 1 + (buf.readUInt32LE(21) & 0x3fff)
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) { i++; continue }
        const m = buf[i + 1]
        if (m >= 0xc0 && m <= 0xc3) return buf.readUInt16BE(i + 7)
        const len = buf.readUInt16BE(i + 2)
        if (len < 2) { i++; continue }
        i += 2 + len
      }
    }
  } catch (e) { /* 头不完整：判不了就报红，不猜通过 */ }
  return 0
}

for (const [name, meta] of Object.entries(contract.textures || {})) {
  const p = join(root, 'assets', 'bg', name)
  if (!existsSync(p)) { fail('契约里的纹理不存在：' + name); continue }
  const buf = readFileSync(p)
  if (createHash('sha256').update(buf).digest('hex') !== meta.sha256) fail(name + ' 内容变了（sha256 不符）——换图必须重跑 measure-texture')
  else if (buf.length !== meta.bytes) fail(name + ' 字节数不符')
  const w = texWidth(buf)
  if (!w) fail(name + ' 读不出宽度（不是可识别的 PNG/JPEG/WebP 头）')
  else if (w < MIN_TEX_WIDTH) fail(name + ' 只有 ' + w + 'px 宽（下限 ' + MIN_TEX_WIDTH + '）——底纹被做小了，cover 会把它放大成模糊色斑')
}

const need = []
for (const id of THEME_IDS) for (const mode of ['dark', 'light']) for (const v of ['full', 'soft']) need.push(id + '|' + mode + '|' + v)
const have = new Set((contract.rows || []).map((r) => r.theme + '|' + r.mode + '|' + r.variant))
for (const k of need) if (!have.has(k)) fail('契约缺行：' + k)

const lum = (hex) => {
  const m = String(hex || '').trim().replace('#', '')
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  const ch = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
  return 0.2126 * lin(ch[0]) + 0.7152 * lin(ch[1]) + 0.0722 * lin(ch[2])
}
const ratio = (a, b) => ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05))

const perRole = { primary: [], secondary: [], tertiary: [] }
let maxErosion = { v: 0 }
const breaches = []
const debt = contract.knownDebt || {}
let preExisting = 0

for (const row of contract.rows || []) {
  const tk = (THEMES[row.theme] || {})[row.mode] || (THEMES[row.theme] || {}).dark || {}
  const cur = tk['--dsw-alias-bg-base']
  if (cur && String(cur).toLowerCase() !== String(row.base).toLowerCase()) {
    fail(row.theme + '/' + row.mode + ' 底色已变为 ' + cur + '（契约记录 ' + row.base + '）——必须重跑 measure-texture')
  }
  const baseLum = lum(row.base)
  const bands = [row.lumP5, row.lumP50, row.lumP95, row.lumP100].filter((x) => typeof x === 'number')
  if (baseLum === null || !bands.length) continue
  for (const role of ROLES) {
    const hex = tk[ROLE_TOKEN[role]]
    const tl = hex ? lum(hex) : null
    if (tl === null) continue
    const declared = ratio(tl, baseLum)
    let worst = Infinity
    for (const b of bands) worst = Math.min(worst, ratio(tl, b))
    const erosion = declared - worst
    perRole[role].push(worst)
    if (erosion > maxErosion.v) maxErosion = { v: erosion, at: row.theme + '/' + row.mode + '/' + row.variant + ' ' + role }
    const key = row.theme + '/' + row.mode + '/' + row.variant + '|' + role
    const erosionPct = declared > 0 ? erosion / declared : 0
    if (erosionPct > EROSION_RATIO) {
      breaches.push({ key, kind: 'erosion', worst: +worst.toFixed(3), erosionPct: +(erosionPct * 100).toFixed(1), msg: row.theme + '/' + row.mode + '/' + row.variant + ' ' + role + ' 纹理侵蚀 ' + (erosionPct * 100).toFixed(1) + '% > 预算 ' + (EROSION_RATIO * 100) + '%' })
    }
    if (declared >= ABSOLUTE && worst < ABSOLUTE) {
      breaches.push({ key, kind: 'absolute', worst: +worst.toFixed(3), declared: +declared.toFixed(3), msg: row.theme + '/' + row.mode + '/' + row.variant + ' ' + role + ' 底色本已达标 ' + declared.toFixed(2) + ':1，纹理压到 ' + worst.toFixed(2) + ':1 < ' + ABSOLUTE })
    } else if (declared < ABSOLUTE) {
      preExisting++
    }
  }
}

const minima = ROLES.map((r) => {
  const v = perRole[r].slice().sort((a, b) => a - b)
  return r + ' 最小 ' + v[0].toFixed(2) + ':1 / 中位 ' + v[Math.floor(v.length / 2)].toFixed(2) + ':1'
}).join(' · ')
console.log('INFO  ' + minima)
console.log('INFO  最大侵蚀 ' + maxErosion.v.toFixed(2) + '（' + maxErosion.at + '，相对预算 ' + (EROSION_RATIO * 100) + '%）；底色本身已低于 ' + ABSOLUTE + ' 的角色行 ' + preExisting + ' 处（属主题设计，不归本门）')

const acceptDebt = process.argv.includes('--accept-debt')
const fresh = []
const regressed = []
for (const b of breaches) {
  const d = debt[b.key]
  if (!d) { fresh.push(b); continue }
  if (b.worst < d.worst - 0.01) regressed.push(b)
}
if (!acceptDebt) {
  for (const b of fresh) fail('新问题（未记账）：' + b.msg)
  for (const b of regressed) fail('已记账项恶化：' + b.msg + '（台账记 ' + debt[b.key].worst + ':1）')
}

if (acceptDebt) {
  if (fresh.length) {
    const { readFileSync: rf, writeFileSync: wf } = await import('node:fs')
    const next = JSON.parse(rf(contractPath, 'utf8'))
    next.knownDebt = Object.assign({}, next.knownDebt || {})
    for (const b of fresh) next.knownDebt[b.key] = { worst: b.worst, kind: b.kind, recordedAt: new Date().toISOString().slice(0, 10) }
    wf(contractPath, JSON.stringify(next, null, 2) + '\n', 'utf8')
    console.log('DEBT  已记入 ' + fresh.length + ' 项已知负债（contracts/texture-luminance.json 的 knownDebt）')
    for (const b of fresh) console.log('  + ' + b.key + '  worst=' + b.worst + ':1  ' + b.kind)
    process.exit(0)
  }
  console.log('DEBT  没有新负债需要记录')
  process.exit(bad ? 1 : 0)
}

const debtCount = Object.keys(debt).length
if (debtCount) console.log('WARN  已知负债 ' + debtCount + ' 项（纹理在个别暗色主题上把对比度压低；见 contracts/texture-luminance.json 的 knownDebt，恶化会判红）')
if (bad) { console.error('[verify:texture] 失败 ' + bad + ' 项'); process.exit(1) }
console.log('OK    纹理对比度：' + (contract.rows || []).length + ' 行 / ' + Object.keys(contract.textures || {}).length + ' 张纹理，无新增侵蚀')