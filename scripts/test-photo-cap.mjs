#!/usr/bin/env node
/**
 * 照片对比度限幅的单元测试（L1b）。
 *
 * 为什么单独测这个纯函数：限幅要真机上传照片才看得到效果，而它错起来是**静默**的
 * ——解错了上限，照片只是被压淡或压根没被限制，界面不报错。这里直接拿 client.js 里的
 * 真实实现（与 test-derive / verify-contrast 同一手法：抠函数体 + new Function）跑断言。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(root, 'client.js'), 'utf8')

const grabFn = (name) => {
  const i = src.indexOf('function ' + name + '(')
  if (i < 0) throw new Error('找不到 function ' + name)
  const open = src.indexOf('{', i)
  let depth = 0
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') depth++
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(i, j + 1) }
  }
  throw new Error('函数体不闭合：' + name)
}
const grabConst = (name) => {
  const i = src.indexOf('const ' + name + ' = ')
  if (i < 0) throw new Error('找不到 const ' + name)
  const end = src.indexOf(';', i)
  return src.slice(i, end + 1)
}

const code = [
  grabConst('PHOTO_CONTRAST_TARGET'), grabConst('PHOTO_CAP_MAX'),
  grabFn('zrLin'), grabFn('parseHexColor'), grabFn('zrHexLum'), grabFn('zrRatio'), grabFn('zrSolvePhotoCap'),
].join('\n')
const api = new Function(code + '\nreturn { zrSolvePhotoCap, zrHexLum, parseHexColor, zrRatio, zrLin, PHOTO_CONTRAST_TARGET, PHOTO_CAP_MAX };')()
const { zrSolvePhotoCap, zrHexLum, zrRatio, PHOTO_CAP_MAX } = api

let bad = 0
const ok = (name, cond, detail) => {
  if (cond) console.log('ok    ' + name + (detail ? '（' + detail + '）' : ''))
  else { console.error('FAIL  ' + name + (detail ? '（' + detail + '）' : '')); bad++ }
}
const pix = (r, g, b, n = 256) => {
  const a = new Uint8ClampedArray(n * 4)
  for (let i = 0; i < n; i++) { a[i * 4] = r; a[i * 4 + 1] = g; a[i * 4 + 2] = b; a[i * 4 + 3] = 255 }
  return a
}
// 用解出来的上限复算最不利对比度，验证「解」真的达标（而不是只看数字小）
const worstAfter = (pixels, textHex, baseHex, cap) => {
  const t = zrHexLum(textHex); const b = api.parseHexColor(baseHex)
  let worst = Infinity
  for (let i = 0; i < pixels.length; i += 4) {
    const l = 0.2126 * api.zrLin(cap * pixels[i] + (1 - cap) * b[0])
      + 0.7152 * api.zrLin(cap * pixels[i + 1] + (1 - cap) * b[1])
      + 0.0722 * api.zrLin(cap * pixels[i + 2] + (1 - cap) * b[2])
    worst = Math.min(worst, zrRatio(t, l))
  }
  return worst
}

// 1) 纯白照片压在暗底上、浅色正文：必须被限幅，且限幅后仍达标
{
  const base = '#0e1015', text = '#bcbcc0'
  const cap = zrSolvePhotoCap(pix(255, 255, 255), text, base)
  const w = worstAfter(pix(255, 255, 255), text, base, cap)
  ok('白色照片在暗底被限幅', cap < PHOTO_CAP_MAX, 'cap=' + cap)
  ok('限幅后正文仍 ≥ 4.5:1', w >= 4.5 - 1e-6, 'worst=' + w.toFixed(2))
}
// 2) 纯黑照片压在暗底上：不增加亮度，无需限幅
{
  const cap = zrSolvePhotoCap(pix(0, 0, 0), '#bcbcc0', '#0e1015')
  ok('黑照片在暗底不限幅', cap === PHOTO_CAP_MAX, 'cap=' + cap)
}
// 3) 图与底色同色：等价于没换底
{
  const cap = zrSolvePhotoCap(pix(14, 16, 21), '#bcbcc0', '#0e1015')
  ok('与底色同色的图不限幅', cap === PHOTO_CAP_MAX, 'cap=' + cap)
}
// 4) 纯黑照片压在亮底上、深色正文：会压低对比度，必须限幅
{
  const base = '#f4f1ec', text = '#403c35'
  const cap = zrSolvePhotoCap(pix(0, 0, 0), text, base)
  const w = worstAfter(pix(0, 0, 0), text, base, cap)
  ok('黑照片在亮底被限幅', cap < PHOTO_CAP_MAX, 'cap=' + cap)
  ok('限幅后正文仍 ≥ 4.5:1（亮底）', w >= 4.5 - 1e-6, 'worst=' + w.toFixed(2))
}
// 5) 上限永不为负、且不低于 0.05（保底可见）
{
  const cap = zrSolvePhotoCap(pix(255, 255, 255), '#ffffff', '#000000')
  ok('极端输入仍有下限', cap >= 0.05 && cap <= PHOTO_CAP_MAX, 'cap=' + cap)
}

if (bad) { console.error('[test-photo-cap] 失败 ' + bad + ' 项'); process.exit(1) }
console.log('OK    照片限幅：5 组断言通过')
