#!/usr/bin/env node
/**
 * 对外口径门：README / market 索引 / locale / package.json 里那些「用户会读到的数字」
 * 必须和仓库真值一致。存在的理由：Vintage Paper 加进来之后，主题数在 8 个地方还写着 11，
 * 而没有任何门能发现——数字漂移不会让任何测试变红，只会让市场页说谎。
 *
 * 检查项：版本号、主题数、底图数、文案条数、裸中文基线。真值全部现算，不读死数。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')
const jread = (p) => JSON.parse(read(p))

const { THEME_IDS } = await import(pathToFileURL(join(root, 'themes.mjs')).href)
const truth = {
  version: jread('package.json').version,
  themes: THEME_IDS.length,
  backgrounds: readdirSync(join(root, 'assets', 'bg')).filter((n) => n.endsWith('.webp')).length,
}

const textSnap = jread('contracts/text-snapshot/zh.json')
truth.strings = Array.isArray(textSnap) ? textSnap.length
  : (Array.isArray(textSnap.texts) ? textSnap.texts.length : 0) + (Array.isArray(textSnap.attrs) ? textSnap.attrs.length : 0)

const i18n = jread('contracts/i18n-baseline.json')
truth.bareChinese = typeof i18n.total === 'number' ? i18n.total
  : Object.values(i18n.files || i18n).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0)

const docs = {
  'README.md': read('README.md'),
  'README.en.md': read('README.en.md'),
  'package.json': read('package.json'),
  'locale/zh.json': read('locale/zh.json'),
  'locale/en.json': read('locale/en.json'),
  'market/index.json': read('market/index.json'),
}

const problems = []
const expect = (file, pattern, want, label) => {
  const m = docs[file].match(pattern)
  if (!m) { problems.push(file + ' 里找不到「' + label + '」这句话（口径句被删或被改写）'); return }
  const got = m[1]
  if (String(got) !== String(want)) problems.push(file + ' ' + label + ' = ' + got + '，真值 ' + want)
}

expect('README.md', /当前版本 \*\*([0-9.]+)\*\*/, truth.version, '当前版本')
expect('README.en.md', /Current version \*\*([0-9.]+)\*\*/, truth.version, 'Current version')
expect('README.md', /\*\*(\d+) 套内置主题/, truth.themes, '套内置主题')
expect('README.md', /(\d+) 套内置卡/, truth.themes, '套内置卡')
expect('README.en.md', /\*\*(\d+) built-in themes/, truth.themes, 'built-in themes')
expect('README.en.md', /(\d+) built-in cards/, truth.themes, 'built-in cards')
expect('package.json', /：(\d+) 套内置配色/, truth.themes, 'package description 套内置配色')
expect('locale/zh.json', /"(\d+) 套内置配色/, truth.themes, 'locale zh 套内置配色')
expect('locale/en.json', /"(\d+) built-in colour themes/, truth.themes, 'locale en built-in colour themes')
expect('market/index.json', /"zh": "(\d+) 套内置配色/, truth.themes, 'market zh 套内置配色')
expect('market/index.json', /"en": "(\d+) built-in/, truth.themes, 'market en built-in')
expect('README.md', /(\d+) 张主题底图/, truth.backgrounds, '张主题底图')
expect('README.en.md', /(\d+) theme backgrounds/, truth.backgrounds, 'theme backgrounds')
expect('README.md', /把 (\d+) 条文案/, truth.strings, '条文案')
expect('README.en.md', /compares (\d+) strings/, truth.strings, 'strings')
expect('README.md', /当前合计 (\d+) 条/, truth.bareChinese, '当前合计 条')
expect('README.en.md', /Currently (\d+) \|/, truth.bareChinese, 'Currently')

// 底图映射必须覆盖全部内置主题：加主题忘了挂底图不会让任何门变红，只会「新主题没图」。
const panelSrc = read('src/20-tokens-and-panel.js')
const mapKeys = (name) => {
  const m = panelSrc.match(new RegExp('const ' + name + ' = \\{([\\s\\S]*?)\\};'))
  return m ? [...m[1].matchAll(/"([a-z][a-z-]*)":/g)].map((x) => x[1]) : []
}
for (const name of ['BG', 'BG_SOFT']) {
  const have = mapKeys(name)
  const miss = THEME_IDS.filter((id) => !have.includes(id))
  if (miss.length) problems.push(name + ' 缺少这些主题的底图条目：' + miss.join(', '))
}

if (problems.length) {
  console.error('[verify:claims] ' + problems.length + ' 处对外数字与真值不一致')
  for (const p of problems) console.error('  - ' + p)
  console.error('  真值：version=' + truth.version + ' themes=' + truth.themes + ' backgrounds=' + truth.backgrounds +
    ' strings=' + truth.strings + ' bareChinese=' + truth.bareChinese)
  process.exit(1)
}
console.log('OK    对外口径：version=' + truth.version + ' themes=' + truth.themes +
  ' backgrounds=' + truth.backgrounds + ' strings=' + truth.strings + ' bareChinese=' + truth.bareChinese)
