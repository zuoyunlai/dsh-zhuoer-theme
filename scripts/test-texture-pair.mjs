#!/usr/bin/env node
/**
 * 底纹成对校验的无头测试：zrTexturePairCheck(args)（从 theme-tool.js 导出）。
 *
 * 为什么要有这道门：texture='want' 时只给一张，客户端浅色路径会回落成
 * 「把深图反相当浅图用」，实测表现为浅色模式整体偏色 5~10 级——
 * 用户看到的是「主题颜色不对」，但没有任何报错。
 */
import { zrTexturePairCheck } from '../theme-tool.js'
import assert from 'node:assert/strict'

const cases = [
  ['不要底纹 → 通过', { texture: 'no' }, true, []],
  ['两张齐 → 通过', { texture: 'want', texturePath: '/a.jpg', texturePathLight: '/b.jpg' }, true, []],
  ['只给深色 → 拒', { texture: 'want', texturePath: '/a.jpg' }, false, ['texturePathLight']],
  ['只给浅色 → 拒', { texture: 'want', texturePathLight: '/b.jpg' }, false, ['texturePath']],
  ['一张都没有 → 拒', { texture: 'want' }, false, ['texturePath', 'texturePathLight']],
  ['空串等同没给', { texture: 'want', texturePath: '  ', texturePathLight: '/b.jpg' }, false, ['texturePath']],
  ['非字符串 → 当没给', { texture: 'want', texturePath: 123, texturePathLight: '/b.jpg' }, false, ['texturePath']],
  ['texture 缺失 → 按 no 处理', {}, true, []],
]

let pass = 0
for (const [name, args, ok, missing] of cases) {
  const got = zrTexturePairCheck(args)
  assert.equal(got.ok, ok, name + ' 的 ok')
  assert.deepEqual(got.missing, missing, name + ' 的 missing')
  pass++
}
console.log('OK    底纹成对校验：' + pass + ' 例通过')