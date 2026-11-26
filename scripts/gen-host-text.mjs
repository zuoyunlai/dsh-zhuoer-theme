#!/usr/bin/env node
/**
 * 从宿主 app.asar 里抽出「类名 -> font-size(px)」规则，生成 src/15-host-text.js。
 *
 * 为什么要有这张静态表：运行期读文档样式表（CSSOM）是最干净的做法，但实测在真实客户端里
 * document.styleSheets / adoptedStyleSheets 一条可缩放 font-size 都读不到（面板会显示
 * 「界面文字缩放未生效」），而宿主 CSS 里明明有 1700+ 条 px 字号。与其继续猜哪条通路被挡，
 * 不如在构建期把事实抽出来：宿主 CSS 的类名是 CSS Modules 形式 .<hash>_<local>，hash 每次
 * 发版都会变，local 名稳定，所以这里统一改写成 [class*="_local"]，运行期只乘一个系数。
 *
 * 用法：node scripts/gen-host-text.mjs [--asar <path>]
 * 宿主升级后重跑一次；verify:scale 只校验运行期接线，不校验表是否最新（表旧了只会字号不匹配，
 * 不会报错也不会有坐标问题）。
 */
import { createReadStream, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const argAsar = process.argv.indexOf('--asar')
const asar = argAsar > 0 ? process.argv[argAsar + 1] : 'D:/Programs/DeepSeek Harness/resources/app.asar'

// 宿主指纹：取 app.asar 的字节数（宿主升级 → asar 换新 → 体积几乎必变）。
// 版本号在 asar 里拿不到（asar 头部只存文件表、不存内容），体积是更可靠的代理指标。
let hostVersion = 'unknown'
try {
  const { statSync } = await import('node:fs')
  hostVersion = String(statSync(asar).size)
} catch (e) { /* 取不到就记 unknown */ }

const rules = []
const seen = new Set()
const ruleRe = /([^{}]{1,400})\{([^{}]{0,600})\}/g

// asar 是一条大二进制，按 {} 切会把 JS 代码也当规则切出来；先做形制校验，
// 只接受「看起来确实是 CSS 选择器」的那部分，宁漏不错。
const plausible = (sel) => {
  if (sel.length > 200) return false
  if (/[`;"'=()]/.test(sel)) return false
  if (!/[.#]/.test(sel)) return false
  return /^[A-Za-z0-9_\-\s.#:\[\]>+~,*]+$/.test(sel)
}

const rewrite = (sel) => {
  const parts = sel.split(',')
  const out = []
  for (const raw of parts) {
    const part = raw.trim()
    if (!part) continue
    let ok = true
    let hash = 0
    const next = part.replace(/\.[A-Za-z0-9_-]*_([A-Za-z][A-Za-z0-9_]*)/g, (_m, local) => {
      hash++
      return '[class*="_' + local + '"]'
    })
    // 只收「确实含 CSS Modules 类名」的选择器：普通 .value / .item 这类通用类名换成
    // [class*=] 会误伤，宁可漏掉几条也不能污染全局
    if (!hash) ok = false
    if (/::?(before|after|placeholder|selection)/.test(part)) ok = false
    if (ok) out.push(next)
  }
  return out.join(',')
}

let carry = ''
await new Promise((resolve, reject) => {
  const rs = createReadStream(asar, { highWaterMark: 1 << 22 })
  rs.on('data', (chunk) => {
    const text = carry + chunk.toString('latin1')
    ruleRe.lastIndex = 0
    let m
    while ((m = ruleRe.exec(text))) {
      const sel = m[1]
      const body = m[2]
      if (body.indexOf('font-size:') < 0) continue
      const fm = /font-size:\s*(-?\d+(?:\.\d+)?)px/.exec(body)
      if (!fm) continue
      const px = parseFloat(fm[1])
      if (!(px > 0)) continue
      if (!plausible(sel)) continue
      const rewritten = rewrite(sel)
      if (!rewritten) continue
      const key = rewritten + '|' + px
      if (seen.has(key)) continue
      seen.add(key)
      rules.push([rewritten, px])
    }
    carry = text.slice(Math.max(0, text.length - 2000))
  })
  rs.on('end', resolve)
  rs.on('error', reject)
})

rules.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
const lines = []
lines.push('// 由 scripts/gen-host-text.mjs 生成，勿手改。宿主升级后重跑该脚本。')
// 宿主版本戳：字号表是「针对某个宿主版本抽的事实」，宿主升级后选择器与 px 都会变。
// 记下抽取时的宿主版本，verify:hosttext 能据此提示「该重抽了」。
lines.push('// HOST_ASAR_BYTES=' + hostVersion)
lines.push('// 形如 ["[class*=\"_title\"]", 14]：选择器（CSS Modules local 名）+ 原始 px 字号。')
lines.push('const HOST_TEXT_RULES = [')
for (const [sel, px] of rules) lines.push('  [' + JSON.stringify(sel) + ', ' + px + '],')
lines.push('];')
lines.push('')
writeFileSync(join(root, 'src/15-host-text.js'), lines.join('\n'), 'utf8')
console.log('OK    host-text：' + rules.length + ' 条规则 -> src/15-host-text.js')
