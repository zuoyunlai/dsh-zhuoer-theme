#!/usr/bin/env node
/**
 * 展示元数据门：locale/*.json 与 package.json 的三处声明必须对得上。
 *
 * 为什么需要它：官方插件的展示名/说明走的是 `locale/<lang>.json` 里的 `meta.title` /
 * `meta.description`（宿主合并这些字段），并且要求导出的 `./icon` 是包内文件、≤256 KiB。
 * 这三件事分别写在 locale 目录、`exports`、`files` 三处，任一处漏了都不会有报错——
 * 表现只是「市场上显示成包名」或「装上后图标不见了」。
 *
 * 判据：
 *   1. `locale/en.json` 必须存在且 `meta.title` 非空（市场的 LocalizedText 强制含 en）；
 *   2. 每个 `locale/*.json` 都是合法 JSON，且 `meta.title` 非空；
 *   3. `exports` 里有 `./locale/*.json`，`files` 里有 locale；
 *   4. `exports["./icon"]` 指向包内文件，且 ≤ 256 KiB；
 *   5. `package.json` 的 `icon` 字段指向同一文件（插件页图标）。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const dir = join(root, 'locale')
let bad = 0
const fail = (msg) => { console.error('FAIL  ' + msg); bad++ }

// 3. exports / files
const exp = pkg.exports || {}
if (exp['./locale/*.json'] !== './locale/*.json') fail('package.json exports 缺 "./locale/*.json": "./locale/*.json"')
const files = pkg.files || []
if (!files.some((f) => f === 'locale' || f === 'locale/*.json' || f === 'locale/')) fail('package.json files 没收录 locale（打包后 locale 不会被发布）')

// 1/2. locale 文件与 meta.title
if (!existsSync(dir)) {
  fail('没有 locale/ 目录（官方展示元数据走这里）')
} else {
  const langs = readdirSync(dir).filter((f) => f.endsWith('.json'))
  if (!langs.length) fail('locale/ 里没有任何 json')
  if (!langs.includes('en.json')) fail('缺 locale/en.json（市场的 LocalizedText 强制要求 en）')
  for (const f of langs) {
    let j = null
    try { j = JSON.parse(readFileSync(join(dir, f), 'utf8')) } catch (e) { fail('locale/' + f + ' 不是合法 JSON：' + (e && e.message)); continue }
    const title = j && j.meta && typeof j.meta.title === 'string' ? j.meta.title.trim() : ''
    if (!title) fail('locale/' + f + ' 的 meta.title 为空')
    console.log('OK    locale/' + f + '  meta.title=' + JSON.stringify(title))
  }
}

// 4/5. 图标
const iconExport = exp['./icon']
if (!iconExport) fail('package.json exports 缺 "./icon"')
else {
  const p = join(root, iconExport)
  if (!existsSync(p)) fail('exports["./icon"] 指向的文件不存在：' + iconExport)
  else {
    const bytes = statSync(p).size
    if (bytes > 256 * 1024) fail('图标 ' + bytes + ' B 超过 256 KiB 上限')
    else console.log('OK    图标 ' + iconExport + ' ' + bytes + ' B（≤256 KiB）')
  }
}
if (pkg.icon && pkg.icon !== iconExport) fail('package.json 的 icon 字段（' + pkg.icon + '）与 exports["./icon"]（' + iconExport + '）不一致')

if (bad) { console.error('FAIL  ' + bad + ' 处展示元数据问题'); process.exit(1) }
console.log('PASS  展示元数据齐全：locale/*.json + exports + files + icon')
