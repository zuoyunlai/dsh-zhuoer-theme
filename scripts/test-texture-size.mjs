#!/usr/bin/env node
/**
 * 底纹分辨率下限的无头测试：zrTextureSize(buf) + ZR_TEX_MIN_WIDTH（都从 theme-tool.js 导出）。
 *
 * 为什么要有这道门（R-11）：底纹铺满主栏靠 `background-size:cover`，素材窄多少就被放大多少。
 * 1000 宽的图铺 977 CSS px（DPR 2 ≈ 1954 设备像素）时净放大 2.9 倍，用来压色带的 ±1 级颗粒
 * 被拉成 3×3 的软块——用户看到的是「模糊色斑」，而界面不报任何错、主题卡照常生成。
 *
 * 更要紧的是这个函数会**拒收**，一旦解析写错就会把合法底纹判成非法（反向事故）。
 * 所以三种格式的头都按住真实字节布局各验一遍，而不是只测 PNG。
 */
import { zrTextureSize, ZR_TEX_MIN_WIDTH } from '../theme-tool.js'
import assert from 'node:assert/strict'

// PNG：8 字节签名 + 4 字节长度 + 'IHDR' + 宽(4, BE) + 高(4, BE) + 位深/色型…
function png(w, h) {
  const b = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0)
  b.writeUInt32BE(13, 8)
  b.write('IHDR', 12, 'ascii')
  b.writeUInt32BE(w, 16)
  b.writeUInt32BE(h, 20)
  b[24] = 8; b[25] = 6
  return b
}

// JPEG：SOI + 一段 APP0（顺便测「按 marker 长度跳过」的循环）+ SOF0（高在前、宽在后）
function jpeg(w, h) {
  const app0 = Buffer.alloc(18)
  app0[0] = 0xff; app0[1] = 0xe0
  app0.writeUInt16BE(16, 2)
  app0.write('JFIF', 4, 'ascii')
  const sof = Buffer.alloc(19)
  sof[0] = 0xff; sof[1] = 0xc0
  sof.writeUInt16BE(17, 2)
  sof[4] = 8
  sof.writeUInt16BE(h, 5)
  sof.writeUInt16BE(w, 7)
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof])
}

// WebP 的三种 chunk 各造一份（内置素材是 VP8，模型导出常见 VP8X / VP8L）
function webpVP8X(w, h) {
  const b = Buffer.alloc(40)
  b.write('RIFF', 0, 'ascii'); b.writeUInt32LE(32, 4); b.write('WEBP', 8, 'ascii')
  b.write('VP8X', 12, 'ascii'); b.writeUInt32LE(10, 16)
  b.writeUIntLE(w - 1, 24, 3); b.writeUIntLE(h - 1, 27, 3)
  return b
}
function webpVP8(w, h) {
  const b = Buffer.alloc(40)
  b.write('RIFF', 0, 'ascii'); b.writeUInt32LE(32, 4); b.write('WEBP', 8, 'ascii')
  b.write('VP8 ', 12, 'ascii'); b.writeUInt32LE(20, 16)
  b[23] = 0x9d; b[24] = 0x01; b[25] = 0x2a
  b.writeUInt16LE(w, 26); b.writeUInt16LE(h, 28)
  return b
}
function webpVP8L(w, h) {
  const b = Buffer.alloc(40)
  b.write('RIFF', 0, 'ascii'); b.writeUInt32LE(32, 4); b.write('WEBP', 8, 'ascii')
  b.write('VP8L', 12, 'ascii'); b.writeUInt32LE(15, 16)
  b[20] = 0x2f
  b.writeUInt32LE(((h - 1) << 14) | (w - 1), 21)
  return b
}

const cases = [
  ['PNG 3200×2000', png(3200, 2000), 3200, 2000],
  ['PNG 1000×625（事故尺寸）', png(1000, 625), 1000, 625],
  ['JPEG 2816×1584', jpeg(2816, 1584), 2816, 1584],
  ['WebP VP8X 2560×1600', webpVP8X(2560, 1600), 2560, 1600],
  ['WebP VP8 1600×997（内置素材）', webpVP8(1600, 997), 1600, 997],
  ['WebP VP8L 2048×1280', webpVP8L(2048, 1280), 2048, 1280],
]

let pass = 0
for (const [name, buf, w, h] of cases) {
  const got = zrTextureSize(buf)
  assert.ok(got, name + '：应当判得出尺寸')
  assert.equal(got.w, w, name + ' 的宽')
  assert.equal(got.h, h, name + ' 的高')
  pass++
}

// 判不了的一律回 null（调用方据此拒收），绝不猜一个通过
assert.equal(zrTextureSize(Buffer.alloc(40)), null, '全零缓冲区应当判不了')
assert.equal(zrTextureSize(Buffer.alloc(8)), null, '不足 32 字节应当判不了')
pass += 2

// 下限本身：1600 是内置素材的现状，调低就等于允许底纹比内置还糊
assert.equal(ZR_TEX_MIN_WIDTH, 1600, '下限应保持与内置素材同档')
pass++

// 反向用例（这才是这次事故的形状）：1000 宽必须被判为不合格
const small = zrTextureSize(png(1000, 625))
assert.ok(small.w < ZR_TEX_MIN_WIDTH, '1000 宽必须低于下限——否则工具不会拒收，事故会重演')
pass++

console.log('OK    底纹分辨率下限：' + pass + ' 例通过（下限 ' + ZR_TEX_MIN_WIDTH + 'px 宽）')
