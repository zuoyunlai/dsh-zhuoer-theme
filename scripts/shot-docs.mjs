#!/usr/bin/env node
/**
 * 文档截图收尾工具：校验 + 裁剪。**不做**「怎么把图采出来」，那一步见下。
 *
 * 为什么拆成两半：采集必须驱动真实宿主（打开设置 → 切主题 → 截 .zp-root），
 * 仓库零依赖、没有 puppeteer，硬塞一个浏览器驱动会把「零依赖」这个前提打掉。
 * 所以采图仍按 docs/live-verify.md 的配方手工/脚本执行；本工具负责**采完之后**那步——
 * 那一步今天全是靠临时脚本手搓的，而且踩了三个坑，每个都能机械检出：
 *
 *   1. 三次截图字节完全相同（窄视口那次根本没重排，图其实是浅色那张）；
 *   2. 元素截图把滚动容器截成大片空白（面板比视口高、祖先可滚动时 Playwright 会拼）；
 *   3. 指针停在胶囊上留了个 tooltip 气泡，直接被裁进 docs 图里。
 *
 * 用法：
 *   node scripts/shot-docs.mjs            # 校验 visual/current 三张 + 裁出 docs/images/panel-*.png
 *   node scripts/shot-docs.mjs --check    # 只校验不写文件（给门禁用）
 *
 * 期望输入（visual/current，由采集流程产出；gitignore，不进库）：
 *   settings-light.png / settings-dark.png  559×2757（1264×771 视口下的 .zp-root）
 *   settings-narrow.png                     323×666（360×780 视口下的可见区）
 * 输出（进库）：
 *   docs/images/panel-light.png / panel-dark.png   559×676（裁上部）
 */
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { inflateSync, deflateSync } from 'node:zlib'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const CHECK_ONLY = process.argv.includes('--check')
const DIR = join(root, 'visual', 'current')
const OUT = join(root, 'docs', 'images')
const CROP_H = 676

// 口径：三张都是「视口内可见区」，不是整块面板。
// 面板比视口高（2757px），元素截图会被滚动容器拼成「内容 + 大片空白」——
// 2026-11-27 的基线就是这么坏掉的，verify:visual 比它自己当然 0.000%（假绿）。
// 真实用户看到的也只是一屏，所以基线就该是一屏。
const EXPECT = {
  'settings-light.png': { w: 559, h: 693, tol: 30 },
  'settings-dark.png': { w: 559, h: 693, tol: 30 },
  'settings-narrow.png': { w: 323, h: 666, tol: 30 },
}

function decodePng(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG')
  let p = 8, w = 0, h = 0, bd = 0, ct = 0, interlace = 0
  const idat = []
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p)
    const type = buf.toString('ascii', p + 4, p + 8)
    const data = buf.subarray(p + 8, p + 8 + len)
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; interlace = data[12] }
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    p += 12 + len
  }
  if (bd !== 8) throw new Error('仅支持 8-bit PNG，实际 ' + bd)
  if (interlace !== 0) throw new Error('不支持隔行 PNG')
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 0 ? 1 : 0
  if (!ch) throw new Error('不支持的 colorType ' + ct)
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * ch
  const out = Buffer.alloc(h * stride)
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    const cur = Buffer.alloc(stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0
      const b = prev[x]
      const c = x >= ch ? prev[x - ch] : 0
      let v = line[x]
      if (ft === 1) v += a
      else if (ft === 2) v += b
      else if (ft === 3) v += (a + b) >> 1
      else if (ft === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c)
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)
      }
      cur[x] = v & 0xff
    }
    cur.copy(out, y * stride)
    prev = cur
  }
  return { w, h, ch, data: out }
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()
function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function encodePng(w, h, ch, data) {
  const stride = w * ch
  const rawRows = Buffer.alloc(h * (stride + 1))
  for (let y = 0; y < h; y++) {
    rawRows[y * (stride + 1)] = 0
    data.copy(rawRows, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = ch === 4 ? 6 : ch === 3 ? 2 : 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rawRows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
function cropTop(img, keepH) {
  const stride = img.w * img.ch
  return { w: img.w, h: Math.min(keepH, img.h), ch: img.ch, data: img.data.subarray(0, Math.min(keepH, img.h) * stride) }
}
// 空白检测：统计「整行像素全部相同」的行占比。滚动容器截错时会大片纯色。
function flatRowRatio(img) {
  const stride = img.w * img.ch
  let flat = 0
  for (let y = 0; y < img.h; y++) {
    const base = y * stride
    let same = true
    for (let x = img.ch; x < stride; x++) { if (img.data[base + x] !== img.data[base + x - img.ch]) { same = false; break } }
    if (same) flat++
  }
  return flat / img.h
}

const problems = []
const hashes = new Map()
const imgs = {}

for (const [name, exp] of Object.entries(EXPECT)) {
  const p = join(DIR, name)
  if (!existsSync(p)) { problems.push('缺 ' + name + '（先按 docs/live-verify.md 采集）'); continue }
  const buf = readFileSync(p)
  const h = createHash('sha256').update(buf).digest('hex').slice(0, 12)
  if (hashes.has(h)) problems.push(name + ' 与 ' + hashes.get(h) + ' 字节相同——多半是视口没生效，截图没真正重排')
  hashes.set(h, name)
  let img
  try { img = decodePng(buf) } catch (e) { problems.push(name + ' 解码失败：' + e.message); continue }
  imgs[name] = img
  if (Math.abs(img.w - exp.w) > 2) problems.push(name + ' 宽度 ' + img.w + '，期望 ' + exp.w + '（视口或弹层宽度不对）')
  if (Math.abs(img.h - exp.h) > exp.tol) problems.push(name + ' 高度 ' + img.h + '，期望约 ' + exp.h + '（面板内容变了？确认后更新 EXPECT）')
  if (statSync(p).size === 0) problems.push(name + ' 是 0 字节')
  const flat = flatRowRatio(img)
  if (flat > 0.35) problems.push(name + ' 有 ' + Math.round(flat * 100) + '% 的行是纯色——像是滚动容器被截成空白（用 fullPage+clip 或先解锁滚动容器）')
}

if (problems.length) {
  for (const p of problems) console.error('FAIL  ' + p)
  console.error('[shot-docs] ' + problems.length + ' 项不合格')
  process.exit(1)
}

if (CHECK_ONLY) {
  console.log('OK    截图校验通过（' + Object.keys(EXPECT).length + ' 张，尺寸/重复/空白均正常）')
  process.exit(0)
}

for (const mode of ['light', 'dark']) {
  const img = imgs['settings-' + mode + '.png']
  const crop = cropTop(img, CROP_H)
  const png = encodePng(crop.w, crop.h, crop.ch, crop.data)
  writeFileSync(join(OUT, 'panel-' + mode + '.png'), png)
  console.log('WROTE docs/images/panel-' + mode + '.png  ' + crop.w + 'x' + crop.h + '  ' + png.length + ' B')
}
console.log('OK    截图校验 + docs 图裁剪完成；接着跑 verify:readme 与 verify:visual')
