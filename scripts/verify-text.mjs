#!/usr/bin/env node
/**
 * 文案门：把面板**渲染出来的文案与属性**存成快照，逐条比对。
 *
 * 为什么不是像素门：2026-11-25 实测，同一状态连续两次截 `.zp-root` 会互差 2.3%
 * （暗态能复现，光态不能）。一个无法自我复现的像素门，红了说明不了代码坏，绿了也说明
 * 不了代码好——它给的是安全错觉。文案门跑在 Node 里（无浏览器），同一输入必然同一输出。
 *
 * 覆盖范围：`.zp-root` 面板渲染出的全部文本节点与 title / aria-label / placeholder / alt。
 * 不覆盖：编辑器抽屉（打开态）、轨道、主题色值本身（那由 verify:themes 与 verify:csssnap 管）。
 *
 * 用法：
 *   node scripts/verify-text.mjs               比对 zh 与 en 两份快照
 *   node scripts/verify-text.mjs --update      重新生成快照
 *   node scripts/verify-text.mjs --lang zh     只比对一种语言
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const baselineDir = join(root, 'contracts', 'text-snapshot')
const argv = process.argv.slice(2)
const update = argv.includes('--update')
const only = (() => { const i = argv.indexOf('--lang'); return i >= 0 ? argv[i + 1] : '' })()

// 版本号每次发版都会变；它出现在面板的「关于」一行里。归一化掉，免得为升版改快照。
const norm = (s) => String(s).replace(/\b\d+\.\d+\.\d+\b/g, '<ver>')

function snapshot(lang) {
  const out = join(tmpdir(), 'zr-text-' + lang + '-' + process.pid + '.json')
  execFileSync(process.execPath, [join(root, 'scripts', 'smoke-panel.mjs'), '--lang', lang, '--dump', out], { stdio: 'ignore' })
  const j = JSON.parse(readFileSync(out, 'utf8'))
  return { texts: j.texts.map(norm), attrs: j.attrs.map(norm) }
}

const langs = only ? [only] : ['zh', 'en']
if (update) mkdirSync(baselineDir, { recursive: true })
let bad = 0
for (const lang of langs) {
  const file = join(baselineDir, lang + '.json')
  const cur = snapshot(lang)
  const total = cur.texts.length + cur.attrs.length
  if (update) {
    writeFileSync(file, JSON.stringify(cur, null, 2) + '\n')
    console.log('WROTE 文案快照 ' + lang + '：' + total + ' 条 → ' + file)
    continue
  }
  if (!existsSync(file)) {
    console.error('FAIL  缺 ' + file + '（先跑 node scripts/verify-text.mjs --update）')
    bad++
    continue
  }
  const base = JSON.parse(readFileSync(file, 'utf8'))
  const a = base.texts.concat(base.attrs)
  const b = cur.texts.concat(cur.attrs)
  let diff = 0
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      diff++
      if (diff <= 5) console.log('  [' + lang + '] #' + i + ' 基线=' + JSON.stringify(a[i]) + ' 当前=' + JSON.stringify(b[i]))
    }
  }
  if (diff) { console.error('FAIL  ' + lang + ' 文案变了：' + diff + ' 处（确认是有意改文案后跑 --update）'); bad++ }
  else console.log('OK    ' + lang + ' 文案逐条一致（' + total + ' 条）')
}
process.exit(bad ? 1 : 0)
