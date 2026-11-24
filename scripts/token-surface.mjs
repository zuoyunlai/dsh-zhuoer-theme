#!/usr/bin/env node
/**
 * 宿主 token 面 vs 我们建模面的对照（coverage-report.mjs 管不到的「第二层」）。
 *
 * coverage-report.mjs 回答的是「我们建模的 token 里，有几个跟着锚点走」。
 * 它管不到更要命的那个问题：**我们建模的这批，是不是宿主真正的全集**。
 * 这个脚本直接扫宿主 app.asar 里的 --dsw-* 名字来对，分成三类：
 *
 *   A 宿主有定义、我们没建模   → 真缺口（颜色类才列）
 *   B 宿主 var() 引用了但自己没定义 → 宿主自己的死引用，不该我们补
 *   C 我们建模了、宿主里没有   → 幽灵 token（写进去没人读，最坑）
 *
 * app.asar 里 CSS/JS 都是未压缩文本，直接流式扫字节即可，不依赖 grep。
 * 找不到宿主安装时跳过（退出码 0），不阻断 CI。
 *
 * 用法：node scripts/token-surface.mjs [--asar <path>]
 */
import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const argAt = process.argv.indexOf('--asar')
const CANDIDATES = [
  argAt > 0 ? process.argv[argAt + 1] : '',
  process.env.DSH_ASAR || '',
  'D:/Programs/DeepSeek Harness/resources/app.asar',
  'C:/Programs/DeepSeek Harness/resources/app.asar',
  '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar',
].filter(Boolean)
const asar = CANDIDATES.find((p) => { try { return existsSync(p) && statSync(p).size > 1e6 } catch { return false } })
if (!asar) {
  console.log('token-surface: 没找到宿主 app.asar，跳过（用 --asar 指定路径）')
  process.exit(0)
}

// 流式扫：块之间留 200 字节重叠，避免 token 名被切断
const USE = /var\((--dsw-[a-z0-9-]+)\)/g
const DEF = /(--dsw-[a-z0-9-]+):/g
const uses = new Map()
const defs = new Map()
const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1)
await new Promise((resolve, reject) => {
  const rs = createReadStream(asar, { encoding: 'latin1', highWaterMark: 1 << 22 })
  let tail = ''
  rs.on('data', (chunk) => {
    const buf = tail + chunk
    for (const re of [USE, DEF]) {
      re.lastIndex = 0
      let m
      while ((m = re.exec(buf))) bump(re === USE ? uses : defs, m[1])
    }
    tail = buf.slice(-200)
  })
  rs.on('end', resolve)
  rs.on('error', reject)
})

const { THEMES } = await import(pathToFileURL(join(root, 'themes.mjs')).href)
// 建模面 = themes.mjs 的全部 key（不再手工补：之前手工补的 --dsw-hovercard-bg
// 本身就是幽灵，补进来只会把 C 类缺口藏掉）
const ours = new Set()
for (const id of Object.keys(THEMES)) {
  for (const sc of ['dark', 'light']) for (const k of Object.keys(THEMES[id][sc] || {})) ours.add(k)
}

// 非颜色：静态色阶、字体、圆角、形状、宽度、模糊、滤镜、阴影档位
const NOT_COLOUR = /^--dsw-(static|font|radius|corner-shape|focus-ring-width|elevation-(soft|panel|prominent|stroke)$)|-blur$|-filter$|-width$|^--dsw-shadow-lv/
const clean = (k) => !NOT_COLOUR.test(k) && !k.endsWith('-')
const all = new Set([...uses.keys(), ...defs.keys()])

const A = [...all].filter((k) => clean(k) && !ours.has(k) && (defs.get(k) || 0) > 0).sort()
const B = [...all].filter((k) => clean(k) && !ours.has(k) && (defs.get(k) || 0) === 0).sort()
const C = [...ours].filter((k) => !all.has(k)).sort()

// A 类的逐条解释。结论很重要：这 8 个**没有「每套主题一个值」这回事**，
// 所以抠不出原值、也不该建模。宿主把它们定义成了组件局部变量 / 常量 / 固定渐变。
// 证据取自 app.asar 实际字节（见每一项后面的实测值）。
// 新冒出来的 A 项不在表里 = 宿主升级加了真 token，门禁会红。
const EXPLAINED = {
  '--dsw-elevation-stroke-color': '组件局部变量：63 处定义全是 --x:var(--dsw-alias-border-l1|l2|l3|l2-darkmode-thin) 这类别名，无全局定义、无字面色；边框 token 我们已建模，阴影跟着走',
  '--dsw-focus-ring-color': '常量：只在 3 处定义，值一律 transparent（设计上不画焦点圈）',
  '--dsw-desktop-window-tint': '常量：:root 里 color-mix(rgb(255 255 255) 40%, transparent)，暗色靠 media/body 属性切 rgb(24 25 28) 50%；桌面原生材质透光底色，不随主题变',
  '--dsw-gradient-onboarding-blue-stops': '固定品牌渐变 #3964fe 18.75%, #398efe 51.78%, #6dccff 86.252%；明暗两方案同一串',
  '--dsw-gradient-onboarding-violet-stops': '固定品牌渐变 #2a2fb6 33.1%, #8b76f6 50.95%, #c5c0ff 85.33%，同上',
  '--dsw-gradient-onboarding-cyan-stops': '固定品牌渐变 #0293b4 21.15%, #2dc8eb 50.95%, #aff0ff 85.33%，同上',
  '--dsw-linear-gradient-think': '明暗两套硬编色（#fff / #151517）的渐隐遮罩，宿主自己也没按主题给值',
  '--dsw-linear-think-select': '同上（#f5f6f7 / #232325）',
}
const unexplained = A.filter((k) => !EXPLAINED[k])

console.log('宿主 app.asar: ' + asar)
console.log('宿主 --dsw-* 名字 ' + all.size + ' 个 · 我们建模 ' + ours.size + ' 个 · 交集 '
  + [...ours].filter((k) => all.has(k)).length)
console.log('\n[A] 宿主有定义、我们没建模: ' + A.length + '（已解释 ' + (A.length - unexplained.length) + ' / 未解释 ' + unexplained.length + '）')
for (const k of A) {
  const why = EXPLAINED[k]
  console.log('    ' + (why ? 'ok  ' : '!!  ') + k.padEnd(40) + 'defs=' + String(defs.get(k)).padStart(3))
  if (why) console.log('         └ ' + why)
}
console.log('\n[B] 宿主引用但从未定义（宿主自己的死引用，不补）: ' + B.length)
for (const k of B) console.log('    ' + k.padEnd(42) + 'uses=' + (uses.get(k) || 0))
console.log('\n[C] 我们建模、宿主里不存在（幽灵，写进去没人读）: ' + C.length)
for (const k of C) console.log('    ' + k)
console.log('\n门禁：C 必须为 0（幽灵是 bug）；A 里未解释的项必须为 0（新增宿主 token 要在这里登记理由）。')
process.exitCode = (C.length || unexplained.length) ? 1 : 0
