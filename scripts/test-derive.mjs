#!/usr/bin/env node
/**
 * 自定义主题派生逻辑的无头验证。
 *
 * 直接从 client.js 的 #region derive 抠出真实实现来跑（不复制、不重写），
 * 所以测的就是线上那份代码，天然不会漂移。
 *
 * 用法：node scripts/test-derive.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const src = readFileSync(join(root, 'client.js'), 'utf8')
const { THEMES, THEME_IDS } = await import(pathToFileURL(join(root, 'themes.mjs')).href)

const start = src.indexOf('// #region derive')
const end = src.indexOf('// #endregion derive')
if (start < 0 || end < 0) throw new Error('client.js 里找不到 #region derive 标记')
const region = src.slice(start, end)

// buildCustomTokens 的 autoDark 分支会用到 hexHsl / hslHex，它们在 region 之外，单独抠出来
const grabFn = (name) => {
  const i = src.indexOf('function ' + name + '(')
  if (i < 0) throw new Error('找不到 function ' + name)
  const open = src.indexOf('{', i)
  let depth = 0, j = open, inS = false, esc = false
  for (; j < src.length; j++) {
    const c = src[j]
    if (inS) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inS = false; continue }
    if (c === '"') { inS = true; continue }
    if (c === '{') depth++
    else if (c === '}') { depth--; if (depth === 0) { j++; break } }
  }
  return src.slice(i, j)
}
const helpers = grabFn('hexHsl') + '\n' + grabFn('hslHex')

// 取色用的纯函数（medianCut / paletteToAnchors）单独抠出来——它们不碰 DOM
const pStart = src.indexOf('// #region palette')
const pEnd = src.indexOf('// #endregion palette')
const paletteRegion = pStart >= 0 && pEnd > pStart ? src.slice(pStart, pEnd) : ''
// 注意：STYLE_PRESETS 位于 #region derive 内部，已随 region 一起抠出，
// 不要再单独抠一次，否则等于声明两遍（SyntaxError: already been declared）。

const make = new Function('THEMES', 'THEME_IDS',
  helpers + '\n' + region + '\n' + paletteRegion +
  '\nreturn { ANCHOR_GROUPS, buildCustomTokens, parseHexColor, toHexColor, flipLightness, medianCut, paletteToAnchors, STYLE_PRESETS, hexHsl };')
const api = make(THEMES, THEME_IDS)
const { ANCHOR_GROUPS, buildCustomTokens, parseHexColor, flipLightness, medianCut, paletteToAnchors, STYLE_PRESETS, hexHsl } = api

const base = THEMES.beacon.dark
const results = []
const ok = (name, cond, detail) => {
  results.push({ name, pass: !!cond, detail })
  if (!cond) process.exitCode = 1
}

// 1) 身份：不改任何锚点 → 与 base 主题逐 token 相同
const identity = buildCustomTokens({ base: 'beacon', dark: {} }, 'dark')
const diff = Object.keys(base).filter((k) => String(identity[k]) !== String(base[k]))
ok('不改锚点时与 base 完全一致', diff.length === 0, diff.length ? diff.slice(0, 3).join(',') : `${Object.keys(base).length} 个 token 全部一致`)

// 2) 底色平移：把 bg-base 从 #000000 改成 #101014（+16/+16/+20）
const shifted = buildCustomTokens({ base: 'beacon', dark: { '--dsw-alias-bg-base': '#101014' } }, 'dark')
const oldBg = parseHexColor(base['--dsw-alias-bg-base'])
const oldL1 = parseHexColor(base['--dsw-alias-bg-layer-1'])
const newBg = parseHexColor(shifted['--dsw-alias-bg-base'])
const newL1 = parseHexColor(shifted['--dsw-alias-bg-layer-1'])
const expectL1 = oldL1.map((v, i) => v + (newBg[i] - oldBg[i]))
// 契约变更（0.6.26 层次阶梯）：layer-1 不再「纯平移」，而是 max(平移结果, 底色 + 4%)。
// beacon 的深色层距本来只有 ~3%，阶梯会把它抬到 4% —— 这正是阶梯存在的目的。
// 所以断言改成两条：① 不能比平移结果更暗（平移是下限）；② 与「底色 +4%」相差不超过 2 级。
const bgh = hexHsl(shifted['--dsw-alias-bg-base'])
const bgL1 = bgh ? bgh[2] : 0
const l1L = (Math.max.apply(null, newL1) + Math.min.apply(null, newL1)) / 2 / 255
const l1LowerOk = newL1.every((v, i) => v >= Math.max(0, Math.min(255, Math.round(expectL1[i]))) - 1)
const l1FloorOk = l1L >= bgL1 + 0.03
const l1Ok = l1LowerOk && l1FloorOk
ok('改底色后 layer-1 ≥ 平移结果且达到底色+4% 层距', l1Ok, `bg ${base['--dsw-alias-bg-base']}→${shifted['--dsw-alias-bg-base']}，layer1 ${base['--dsw-alias-bg-layer-1']}→${shifted['--dsw-alias-bg-layer-1']}（L1 ${l1L.toFixed(3)} vs 底色 ${bgL1.toFixed(3)}+0.04）`)

// 3) 品牌组 same：9 个成员必须与新品牌色完全相同
const branded = buildCustomTokens({ base: 'beacon', dark: { '--dsw-alias-brand-primary': '#00bcd4' } }, 'dark')
const brandGroup = ANCHOR_GROUPS.find((g) => g.key === 'brand')
const sameMembers = brandGroup.members.filter(([, mode]) => mode === 'same')
const shiftMembers = brandGroup.members.filter(([, mode]) => mode === 'shift')
const sameBad = sameMembers.filter(([k]) => branded[k] !== '#00bcd4').map(([k]) => k)
ok('改品牌色后组内 same 成员全部跟随', sameBad.length === 0, sameBad.length ? sameBad.slice(0, 3).join(',') : `${sameMembers.length} 个成员 = #00bcd4`)
// shift 成员（如 button-primary-dimmed）应保持「比品牌色暗一档」，而不是变成同一个颜色
const shiftOk = shiftMembers.every(([k]) => branded[k] && branded[k].toLowerCase() !== '#00bcd4')
ok('品牌组的 shift 成员保持层次（不等于纯色）', shiftOk, shiftMembers.map(([k]) => `${k.replace('--dsw-alias-', '')}=${branded[k]}`).join(' ') || '无 shift 成员')

// 4) 文字组平移：label-primary 变亮，secondary/tertiary 同步变亮且保持递减
const texted = buildCustomTokens({ base: 'beacon', dark: { '--dsw-alias-label-primary': '#ffffff' } }, 'dark')
const lum = (h) => { const c = parseHexColor(h) || [0, 0, 0]; return c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114 }
const order = ['--dsw-alias-label-primary', '--dsw-alias-label-secondary', '--dsw-alias-label-tertiary']
const vals = order.map((k) => lum(texted[k]))
ok('文字层级仍保持 primary > secondary > tertiary', vals[0] >= vals[1] && vals[1] >= vals[2], order.map((k, i) => `${k.replace('--dsw-alias-', '')}=${texted[k]}(${vals[i].toFixed(0)})`).join(' '))

// 5) 浅色主题同样可派生（方向由原差值决定，不写死）
const lightShift = buildCustomTokens({ base: 'beacon', light: { '--dsw-alias-bg-base': '#222222' } }, 'light')
const lb = THEMES.beacon.light
ok('浅色主题也能派生', lightShift['--dsw-alias-bg-base'] === '#222222' && lightShift['--dsw-alias-bg-layer-1'] !== lb['--dsw-alias-bg-layer-1'], `light base ${lb['--dsw-alias-bg-base']}→#222222，layer1 ${lb['--dsw-alias-bg-layer-1']}→${lightShift['--dsw-alias-bg-layer-1']}`)

// 6) autoDark：深色由浅色反推（底色变深、文字变浅）
const autoSpec = { base: 'beacon', autoDark: true, light: { '--dsw-alias-bg-base': '#f2ede4', '--dsw-alias-label-primary': '#2a2118' }, dark: {} }
const autoDark = buildCustomTokens(autoSpec, 'dark')
const lumOf = (h) => { const c = parseHexColor(h) || [0, 0, 0]; return c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114 }
ok('autoDark: 浅底反推成深底', lumOf(autoDark['--dsw-alias-bg-base']) < 60, `light #f2ede4 → dark ${autoDark['--dsw-alias-bg-base']}`)
ok('autoDark: 深字反推成浅字', lumOf(autoDark['--dsw-alias-label-primary']) > 140, `light #2a2118 → dark ${autoDark['--dsw-alias-label-primary']}`)

// 7) autoDark + 手动深色锚点：手调优先，其余继续反推
const mixedSpec = Object.assign({}, autoSpec, { dark: { '--dsw-alias-bg-base': '#101018' } })
const mixed = buildCustomTokens(mixedSpec, 'dark')
ok('autoDark: 手调的深色锚点覆盖反推值', mixed['--dsw-alias-bg-base'] === '#101018', `期望 #101018，实得 ${mixed['--dsw-alias-bg-base']}`)
ok('autoDark: 未手调的组仍按反推', lumOf(mixed['--dsw-alias-label-primary']) > 140, `label-primary=${mixed['--dsw-alias-label-primary']}`)

// 9) 所有锚点与成员 key 必须真实存在于主题表 —— 防住"前缀写错/名字不存在"这类静默失效
//    （踩过：hovercard 文字写成 --dsw-hovercard-label-primary，实际是 --dsw-alias-hovercard-label-*）
const probeBase = THEMES.beacon.dark
const missingKeys = []
for (const g of ANCHOR_GROUPS) {
  if (!(g.anchor in probeBase)) missingKeys.push(g.anchor)
  for (const [k] of g.members) if (!(k in probeBase)) missingKeys.push(k)
}
ok('所有分组 key 在主题表里真实存在', missingKeys.length === 0,
  missingKeys.length ? [...new Set(missingKeys)].join(', ') : `${ANCHOR_GROUPS.length} 组共 ${ANCHOR_GROUPS.reduce((n, g) => n + 1 + g.members.length, 0)} 个 key 全部存在`)

// 10) 取色：三簇明显不同的颜色应该被切成三份，且占比接近
const clusterPixels = []
for (let i = 0; i < 300; i++) clusterPixels.push({ r: 240, g: 40, b: 40, n: 1 })
for (let i = 0; i < 200; i++) clusterPixels.push({ r: 40, g: 80, b: 240, n: 1 })
for (let i = 0; i < 100; i++) clusterPixels.push({ r: 240, g: 240, b: 60, n: 1 })
const cut = medianCut(clusterPixels, 3)
ok('中位切分把三簇切成三份', cut.length === 3, cut.map((c) => `${c.hex}(${(c.share * 100).toFixed(0)}%)`).join(' '))
ok('取色占比与像素数一致', Math.abs(cut[0].share - 0.5) < 0.05, `最大簇占比 ${(cut[0].share * 100).toFixed(0)}%（期望约 50%）`)

// 11) 取色 → 锚点：最暗给底色、最亮给正文、最饱和给品牌
const anchors = paletteToAnchors([
  { hex: '#101018', share: 0.4 },
  { hex: '#f0f0f8', share: 0.3 },
  { hex: '#ff6b35', share: 0.2 },
  { hex: '#3a7bd5', share: 0.1 },
])
// 品牌色会被压暗以保证白字可读（#ff6b35 配白只有 1.9:1），所以只校验底色与正文，
// 品牌色单独校验"比原色更暗/不变"。
ok('取色映射：最暗→底色 / 最亮→正文',
  anchors &&
  anchors['--dsw-alias-bg-base'] === '#101018' &&
  anchors['--dsw-alias-label-primary'] === '#f0f0f8',
  anchors ? `bg=${anchors['--dsw-alias-bg-base']} text=${anchors['--dsw-alias-label-primary']}` : 'null')
ok('取色映射：品牌色被压暗到白字可读',
  !!anchors && lumOf(anchors['--dsw-alias-brand-primary']) <= lumOf('#ff6b35'),
  anchors ? `brand ${anchors['--dsw-alias-brand-primary']}（原 #ff6b35）` : 'null')

// 12) 浅底照片：大面积亮 + 少量深，底色必须落在亮侧（曾经无条件取最暗，导致整个主题反相）
const lightPhoto = paletteToAnchors([
  { hex: '#f5f2ea', share: 0.6 },
  { hex: '#d8d2c4', share: 0.25 },
  { hex: '#2a2620', share: 0.1 },
  { hex: '#c94f3d', share: 0.05 },
])
// 只校验"落在亮侧/暗侧"，不锁死具体色值——底色现在会保留主色色相，允许与最亮色不同
ok('浅底照片：底色落在亮侧、文字落在暗侧',
  // lumOf 返回 0-255，不是 0-1
  !!lightPhoto && lumOf(lightPhoto['--dsw-alias-bg-base']) > 216 && lumOf(lightPhoto['--dsw-alias-label-primary']) < 77,
  lightPhoto ? `bg=${lightPhoto['--dsw-alias-bg-base']} text=${lightPhoto['--dsw-alias-label-primary']}` : 'null')

// 13) 深底照片：大面积暗 + 少量亮，底色必须落在暗侧
const darkPhoto = paletteToAnchors([
  { hex: '#0d1018', share: 0.65 },
  { hex: '#1b2230', share: 0.2 },
  { hex: '#e8e2d4', share: 0.1 },
  { hex: '#e0a030', share: 0.05 },
])
ok('深底照片：底色落在暗侧、文字落在亮侧',
  !!darkPhoto && darkPhoto['--dsw-alias-bg-base'] === '#0d1018' && darkPhoto['--dsw-alias-label-primary'] === '#e8e2d4',
  darkPhoto ? `bg=${darkPhoto['--dsw-alias-bg-base']} text=${darkPhoto['--dsw-alias-label-primary']}` : 'null')

// 14) 整图偏灰时照片里没有足够亮/暗的色，文字必须被兜底推到可读极值
const flatPhoto = paletteToAnchors([
  { hex: '#6e6e6e', share: 0.5 },
  { hex: '#7a7a7a', share: 0.3 },
  { hex: '#888888', share: 0.2 },
])
ok('灰片兜底：文字被推到近黑/近白',
  !!flatPhoto && (flatPhoto['--dsw-alias-label-primary'] === '#14161a' || flatPhoto['--dsw-alias-label-primary'] === '#f2f2f2'),
  flatPhoto ? `bg=${flatPhoto['--dsw-alias-bg-base']} text=${flatPhoto['--dsw-alias-label-primary']}` : 'null')

// 15) 真实风景照色板（用户实测那张）：底色浅、文字深，且边框/品牌必须在底色上看得见
//     曾经边框按"亮度最接近底色"挑，挑到 #a2cd10 → 1.1:1，分隔线直接消失
const photo = paletteToAnchors([
  { hex: '#9ecdd1', share: 0.831 },
  { hex: '#1066f0', share: 0.093 },
  { hex: '#9ecb08', share: 0.028 },
  { hex: '#0859f0', share: 0.024 },
  { hex: '#9fcc10', share: 0.017 },
  { hex: '#7ab400', share: 0.007 },
])
const lumPhoto = (h) => {
  const c = parseHexColor(h) || [0, 0, 0]
  return (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) / 255
}
const bgL = photo ? lumPhoto(photo['--dsw-alias-bg-base']) : 0
const bdL = photo ? lumPhoto(photo['--dsw-alias-border-l1']) : 0
const brL = photo ? lumPhoto(photo['--dsw-alias-brand-primary']) : 0
ok('风景照：底色浅、文字深', !!photo && bgL > 0.5 && lumPhoto(photo['--dsw-alias-label-primary']) < 0.3,
  photo ? `bg=${photo['--dsw-alias-bg-base']}(L${bgL.toFixed(2)}) text=${photo['--dsw-alias-label-primary']}` : 'null')
ok('风景照：底色被推到接近白', bgL >= 0.90,
  photo ? `bg=${photo['--dsw-alias-bg-base']}(L${bgL.toFixed(3)})` : 'null')
ok('风景照：边框与底色有可见亮度差', Math.abs(bdL - bgL) > 0.10,
  photo ? `border=${photo['--dsw-alias-border-l1']}(Δ${Math.abs(bdL - bgL).toFixed(2)})` : 'null')
ok('风景照：品牌色与底色有可见亮度差', Math.abs(brL - bgL) > 0.15,
  photo ? `brand=${photo['--dsw-alias-brand-primary']}(Δ${Math.abs(brL - bgL).toFixed(2)})` : 'null')
// 16) 日落图：58% 浅米 + 37% 深棕。加权平均 0.42 会判成深底 → 底色纯黑，
//     必须按主色（占比最大）判断，否则整张图的气氛丢掉。
const sunset = paletteToAnchors([
  { hex: '#bf9a77', share: 0.58 },
  { hex: '#472900', share: 0.37 },
  { hex: '#190800', share: 0.04 },
  { hex: '#080800', share: 0.003 },
  { hex: '#0c0001', share: 0.003 },
  { hex: '#000000', share: 0.003 },
])
ok('日落图：主色是浅米，底色不能是纯黑',
  !!sunset && lumOf(sunset['--dsw-alias-bg-base']) > 180,
  sunset ? `bg=${sunset['--dsw-alias-bg-base']} text=${sunset['--dsw-alias-label-primary']}` : 'null')
ok('日落图：7 个锚点全部填满（含语义色）',
  !!photo && ['--dsw-alias-bg-base','--dsw-alias-label-primary','--dsw-alias-border-l1',
    '--dsw-alias-brand-primary','--dsw-alias-trajectory-accent',
    '--dsw-alias-state-error-primary','--dsw-alias-state-warn-primary']
    .every(k => !!photo[k]),
  photo ? `danger=${photo['--dsw-alias-state-error-primary']} warn=${photo['--dsw-alias-state-warn-primary']}` : 'null')

// 17) 风格预设：每套的 7 个锚点必须齐全，且都是 ANCHOR_GROUPS 里真实存在的 key
//     （写错 token 名会静默失效，之前 hovercard 前缀就栽过）
const validAnchors = new Set(ANCHOR_GROUPS.map(g => g.anchor))
const presetIssues = []
for (const p of STYLE_PRESETS || []) {
  for (const schemeName of ['light', 'dark']) {
    const tbl = p[schemeName]
    if (!tbl) continue
    const keys = Object.keys(tbl)
    if (keys.length !== 7) presetIssues.push(`${p.id}.${schemeName} 有 ${keys.length} 个锚点`)
    for (const k of keys) if (!validAnchors.has(k)) presetIssues.push(`${p.id}.${schemeName} 未知 ${k}`)
  }
  if (typeof p.radius !== 'number' || p.radius < 0 || p.radius > 3) presetIssues.push(`${p.id} radius=${p.radius}`)
  if (!p.light || Object.keys(p.light).length !== 7) presetIssues.push(`${p.id} 缺 light 表`)
}
ok('风格预设：锚点齐全且 key 合法',
  presetIssues.length === 0,
  presetIssues.length ? presetIssues.slice(0, 4).join('; ') : `${(STYLE_PRESETS || []).length} 套预设全部合规`)

// 18) shift 成员必须跟随锚点色相，不能残留 base 的色相
//     （zhuoer 的浅色是暖白，锚点改成冷蓝后，menu/hovercard 这类成员必须是冷的）
const shiftedTheme = buildCustomTokens({
  base: 'zhuoer',
  light: { '--dsw-alias-bg-base': '#dceef5', '--dsw-alias-label-primary': '#14161a' },
}, 'light')
const menuHsl = hexHsl(shiftedTheme['--dsw-menu-surface-fill'])
const hoverHsl = hexHsl(shiftedTheme['--dsw-alias-hovercard-bg'])
const cool = (hsl) => hsl && (hsl[0] > 150 && hsl[0] < 260)
ok('shift 成员跟随锚点色相（不再残留 base 暖色）',
  cool(menuHsl) && cool(hoverHsl),
  `menu=${shiftedTheme['--dsw-menu-surface-fill']}(H${menuHsl ? menuHsl[0].toFixed(0) : '?'}) hover=${shiftedTheme['--dsw-alias-hovercard-bg']}(H${hoverHsl ? hoverHsl[0].toFixed(0) : '?'})`)

// 19) 自定义主题（base=knot 中性深灰）+ 暖锚点：hovercard/tip 必须跟随锚点的暖色相
const customWarm = buildCustomTokens({
  base: 'knot',
  light: { '--dsw-alias-bg-base': '#f5efe4', '--dsw-alias-label-primary': '#2a2620' },
}, 'light')
const hcHsl = hexHsl(customWarm['--dsw-alias-hovercard-bg'])
const menuHsl2 = hexHsl(customWarm['--dsw-specific-menu'])
const warm = (hsl) => hsl && hsl[0] >= 20 && hsl[0] <= 60 && hsl[1] > 0.05
ok('自定义主题：弹出层跟随暖锚点色相（不再是中性灰）',
  warm(hcHsl) && warm(menuHsl2),
  `hovercard=${customWarm['--dsw-alias-hovercard-bg']}(H${hcHsl ? hcHsl[0].toFixed(0) : '?'},S${hcHsl ? (hcHsl[1]*100).toFixed(0) : '?'}%) menu=${customWarm['--dsw-specific-menu']}`)

// 20) 复现用户的自定义 11：base=dash（暖琥珀）+ 冷蓝锚点 #f2f7fa
//     hovercard / menu 必须变成冷色，不能留着 dash 的暖棕
const customCool = buildCustomTokens({
  base: 'dash',
  light: {
    '--dsw-alias-bg-base': '#f2f7fa',
    '--dsw-alias-label-primary': '#0e2a3a',
    '--dsw-alias-border-l1': '#c6d8e3',
    '--dsw-alias-brand-primary': '#1f7aa8',
    '--dsw-alias-trajectory-accent': '#4fb3d0',
    '--dsw-alias-state-error-primary': '#b23a48',
    '--dsw-alias-state-warn-primary': '#b7791f',
  },
}, 'light')
const hc2 = hexHsl(customCool['--dsw-alias-hovercard-bg'])
const mn2 = hexHsl(customCool['--dsw-specific-menu'])
const cool2 = (hsl) => hsl && hsl[0] > 170 && hsl[0] < 260
ok('自定义11（暖base+冷锚点）：弹出层必须冷色',
  cool2(hc2) && cool2(mn2),
  `hovercard=${customCool['--dsw-alias-hovercard-bg']}(H${hc2 ? hc2[0].toFixed(0) : '?'}) menu=${customCool['--dsw-specific-menu']}(H${mn2 ? mn2[0].toFixed(0) : '?'}) bg=${customCool['--dsw-alias-bg-base']}`)

// 21) 覆盖补齐：界面真正消费的是 --dsw-alias-hovercard-bg（带 alias）。
//     只补不带 alias 的 --dsw-hovercard-bg，会出现「变量变了、卡还是暖米色」的错位。
const aliasHc = hexHsl(customCool['--dsw-alias-hovercard-bg'])
ok('自定义11：--dsw-alias-hovercard-bg（界面真正消费的那个）也是冷色',
  cool2(aliasHc),
  'alias-hovercard-bg=' + customCool['--dsw-alias-hovercard-bg'] + '(H' + (aliasHc ? aliasHc[0].toFixed(0) : '?') + ')')

// 22) tint：自带语义色的浅色块（diff 增删）必须保留红绿，不能被底色染成蓝
const tintTheme = buildCustomTokens({ base: 'dash', light: { '--dsw-alias-bg-base': '#eef4f8' } }, 'light')
const addHsl = hexHsl(tintTheme['--dsw-alias-code-diff-added'])
const delHsl = hexHsl(tintTheme['--dsw-alias-code-diff-deleted'])
ok('tint 成员保留语义色相：diff 增=绿、删=红（不被冷底色染蓝）',
  !!addHsl && !!delHsl && addHsl[0] > 80 && addHsl[0] < 170 && (delHsl[0] > 330 || delHsl[0] < 30),
  'added=' + tintTheme['--dsw-alias-code-diff-added'] + '(H' + (addHsl ? addHsl[0].toFixed(0) : '?') + ') deleted='
    + tintTheme['--dsw-alias-code-diff-deleted'] + '(H' + (delHsl ? delHsl[0].toFixed(0) : '?') + ')')

// 23) 身份：把每个组的锚点原值再写回去，整表必须与 base 逐字节相同。
//     这条专门盯 same 成员 —— 没有 applyGroup 的「锚点没变就跳过」，
//     它们会被锚点值覆盖（warn-secondary 之类的层次差立刻消失）。
const identityMiss = []
for (const baseId of ['beacon', 'dash', 'knot', 'zhuoer']) {
  const tt = THEMES[baseId]
  if (!tt) continue
  for (const scheme of ['light', 'dark']) {
    const same = {}
    for (const g of ANCHOR_GROUPS) {
      const v = tt[scheme] && tt[scheme][g.anchor]
      if (typeof v === 'string') same[g.anchor] = v
    }
    const spec = scheme === 'light' ? { base: baseId, light: same } : { base: baseId, dark: same }
    const out = buildCustomTokens(spec, scheme)
    for (const g of ANCHOR_GROUPS) {
      const keys = [g.anchor].concat(g.members.map((m) => m[0]))
      for (const key of keys) {
        const want = tt[scheme] && tt[scheme][key]
        if (typeof want !== 'string') continue
        if (String(out[key]) !== String(want)) identityMiss.push(baseId + '/' + scheme + ':' + key)
      }
    }
  }
}
ok('锚点写回原值即与 base 逐字节相同（含 same/tint 成员）', identityMiss.length === 0,
  identityMiss.length
    ? identityMiss.slice(0, 6).join(', ')
    : ANCHOR_GROUPS.reduce(function (n, g) { return n + g.members.length + 1 }, 0) + ' 个 key × 4 套 base × 2 方案全部一致')

// 24) success 组真的存在，且成员在主题表里都有值
const successGroup = ANCHOR_GROUPS.find(function (g) { return g.key === 'success' })
ok('success 组存在且 5 个成员在主题表里都有值',
  !!successGroup && successGroup.members.length === 5
    && successGroup.members.every(function (m) { return typeof THEMES.beacon.light[m[0]] === 'string' }),
  successGroup ? successGroup.members.map(function (m) { return m[0] }).join(',') : 'missing')

for (const r of results) console.log((r.pass ? 'PASS  ' : 'FAIL  ') + r.name + '  —  ' + r.detail)
console.log(results.every((r) => r.pass) ? '\nALL PASS' : '\n有失败项')
