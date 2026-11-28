#!/usr/bin/env node
/**
 * 纹理对比度测量器（一次性 + 换图时重跑）
 *
 * 为什么非要浏览器：仓库是零依赖纯 ESM，Node 解不了 WebP；而对比度又必须
 * **逐像素合成**才能算准——只看文件头或平均色都会把「纹理亮部压低局部对比度」漏掉。
 * 所以这里起一个本地静态服务 + 一张 canvas 页面：页面按真实合成规则逐像素算，
 * 把结果 POST 回来；Node 侧补每个纹理文件的 sha256 后写 contracts/texture-luminance.json。
 *
 * 门禁（scripts/verify-texture.mjs）只读那份契约，纯数学复算，不依赖浏览器。
 *
 * 用法：
 *   node scripts/measure-texture.mjs [--port 18556]
 *   然后打开打印出的 URL，等页面显示「written」即可（结果自动落盘）。
 */
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { extname, join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const argAt = process.argv.indexOf('--port')
const PORT = argAt > 0 && process.argv[argAt + 1] ? Number(process.argv[argAt + 1]) : 18556

const { THEMES, THEME_IDS } = await import(pathToFileURL(join(root, 'themes.mjs')).href)

// 与 bgCssFor() 保持同源：可见度 100% = 实际 0.7；混合方式按方案分（见下）。
const ALPHA = 0.7
// R-12 / R-13：内置底图是**透明线稿**，运行时不加任何混合——`bgCssFor` 的 blend 只在
// 「自定义图片」（bgIsImage）上挂，主题自带底图走的是普通 alpha 合成。
// 所以这里要按 alpha 合成建模（mix = 取图本身的颜色），而不是 lighten/multiply。
// 浅色现在也不加混合（multiply 会把「图底 = 底色」的满幅图乘成 b²/255，整幅盖灰），
// 深色仍是 lighten——底色对齐后 max(底,底)=底，两种模型在「线只是略亮/略暗」时数值等价。
const BLEND_FOR = { dark: 'lighten', light: 'none' }
const ROLES = ['--dsw-alias-label-primary', '--dsw-alias-label-secondary', '--dsw-alias-label-tertiary']
// 画布尺寸只在这里声明一次：浏览器侧从模板里取，Node 侧写契约时也用这份常量。
const CANVAS = '320x200'

const jobs = []
for (const id of THEME_IDS) {
  for (const mode of ['dark', 'light']) {
    const tk = THEMES[id][mode] || THEMES[id].dark
    const base = tk['--dsw-alias-bg-base']
    if (!base) continue
    for (const variant of ['full', 'soft']) {
      // 素材可以是位图也可以是矢量（P2 起内置 dash 就是 SVG）。同名前缀按 .svg 优先解析，
      // 与 BG 映射保持一致——否则门禁会量到一份客户端根本不用的旧位图。
      // 变量名不能叫 base：循环里 base 是**底色**，之前阴影过一次，结果契约里 base 被写成文件名。
      const stem = 'bg-' + (variant === 'soft' ? 'soft-' : '') + id
      const file = [stem + '.svg', stem + '.webp', stem + '.png', stem + '.jpg']
        .find((n) => existsSync(join(root, 'assets', 'bg', n))) || (stem + '.webp')
      jobs.push({ theme: id, mode, variant, file, base, blend: BLEND_FOR[mode], texUrl: '/assets/bg/' + file })
    }
  }
}

const html = `<!doctype html><meta charset="utf-8"><title>measure-texture</title>
<pre id="out" style="font:13px ui-monospace,monospace;white-space:pre-wrap">starting…</pre>
<script type="module">
const OUT = document.getElementById('out')
window.onerror = (m,s,l,c) => { OUT.textContent = 'ERR ' + m + ' @' + l + ':' + c }
window.addEventListener('unhandledrejection', (e) => { OUT.textContent = 'REJ ' + (e.reason && e.reason.message || e.reason) })
const JOBS = ${JSON.stringify(jobs)}
const ALPHA = ${ALPHA}
const lum = (r,g,b) => { const f=(v)=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)}; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b) }
const hex2rgb = (h) => { const m=String(h||'').replace('#',''); const f=m.length===3?m.split('').map(c=>c+c).join(''):m; return [0,2,4].map(i=>parseInt(f.slice(i,i+2),16)) }
const pct = (arr,p) => arr[Math.min(arr.length-1, Math.max(0, Math.round((arr.length-1)*p)))]
const W = 320, H = 200  // 与 Node 侧 CANVAS 常量对应
const cv = document.createElement('canvas'); cv.width = W; cv.height = H
const cx = cv.getContext('2d', { willReadFrequently: true })
const load = (url) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('load ' + url)); i.src = url })

const rows = []
for (const job of JOBS) {
  OUT.textContent = 'measuring ' + (rows.length + 1) + '/' + JOBS.length
  const img = await load(job.texUrl)
  cx.clearRect(0, 0, W, H); cx.drawImage(img, 0, 0, W, H)
  const d = cx.getImageData(0, 0, W, H).data
  const [br, bg, bb] = hex2rgb(job.base)
  const lums = []
  for (let i = 0; i < d.length; i += 4) {
    const a = ALPHA * (d[i + 3] / 255)
    const mix = (b, t) => (job.blend === 'none' ? t : (job.blend === 'multiply' ? (b * t) / 255 : Math.max(b, t)))
    lums.push(lum(a * mix(br, d[i]) + (1 - a) * br, a * mix(bg, d[i + 1]) + (1 - a) * bg, a * mix(bb, d[i + 2]) + (1 - a) * bb))
  }
  lums.sort((x, y) => x - y)
  rows.push({ theme: job.theme, mode: job.mode, variant: job.variant, texture: job.file, base: job.base,
    lumP5: +pct(lums, 0.05).toFixed(5), lumP50: +pct(lums, 0.5).toFixed(5),
    lumP95: +pct(lums, 0.95).toFixed(5), lumP100: +lums[lums.length - 1].toFixed(5) })
}
const res = await fetch('/__result', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rows }) })
OUT.textContent = res.ok ? 'written ' + rows.length + ' rows' : 'server rejected: ' + (await res.text())
</script>`

const MIME = { '.html': 'text/html; charset=utf-8', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json' }

async function writeContract(rows) {
  const textures = {}
  for (const row of rows) {
    if (textures[row.texture]) continue
    const buf = await readFile(join(root, 'assets', 'bg', row.texture))
    textures[row.texture] = { bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') }
  }
  const contract = {
    '$comment': [
      '纹理对比度契约：由 scripts/measure-texture.mjs 在浏览器里逐像素合成生成，门禁 scripts/verify-texture.mjs 只读本文件。',
      '为什么存「合成后背景亮度的分位」而不是存纹理本身的均值：局部对比度由最不利的那个像素决定，',
      '而线稿纹理绝大多数像素 alpha=0（p50 就是底色），均值会把线条那一小撮完全平均掉。',
      '换了纹理文件必须重跑测量——门禁会比对 sha256，没重测就红。',
    ].join(''),
    alpha: ALPHA,
    blend: BLEND_FOR,
    canvas: '320x200',
    generatedAt: new Date().toISOString(),
    // 判据真源在 verify-texture.mjs：这里只是把它抄一份进契约，便于人工核对与 diff 时发现被改。
    // erosionBudget = 纹理允许回落的对比度上限；absolute = WCAG AA 地板。
    floors: { absolute: 4.5, erosionRatio: 0.4 },
    roles: ROLES,
    textures,
    rows,
  }
  const target = join(root, 'contracts', 'texture-luminance.json')
  // 已知负债必须跟着走：重测会整份重写契约，若不复用旧 knownDebt，
  // 那些「已明确接受」的绝对地板缺口会在下次 measurement 后变成「新问题」——
  // 要么把门逼红，要么让人习惯性再跑一次 --accept-debt，两种都是在洗账。
  let knownDebt = {}
  try {
    knownDebt = JSON.parse(await readFile(target, 'utf8')).knownDebt || {}
  } catch (e) { /* 首次生成没有旧契约 */ }
  if (Object.keys(knownDebt).length) contract.knownDebt = knownDebt
  await writeFile(target, JSON.stringify(contract, null, 2) + '\n', 'utf8')
  return target
}

createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/__result') {
      let body = ''
      for await (const chunk of req) body += chunk
      const { rows } = JSON.parse(body)
      if (!Array.isArray(rows) || !rows.length) { res.writeHead(400); return res.end('no rows') }
      const target = await writeContract(rows)
      console.log('[measure-texture] 已写入 ' + target + '（' + rows.length + ' 行）')
      res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok')
    }
    if (req.url === '/' || req.url.startsWith('/?') || req.url.startsWith('/index')) {
      res.writeHead(200, { 'content-type': MIME['.html'] }); return res.end(html)
    }
    if (req.url.startsWith('/assets/bg/')) {
      const name = req.url.slice('/assets/bg/'.length).split('?')[0]
      const buf = await readFile(join(root, 'assets', 'bg', name))
      res.writeHead(200, { 'content-type': MIME[extname(name)] || 'application/octet-stream' }); return res.end(buf)
    }
    res.writeHead(404); res.end('nf')
  } catch (e) {
    console.error('[measure-texture] ' + (e && e.message))
    try { res.writeHead(500); res.end('err') } catch (e2) { /* ignore */ }
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log('[measure-texture] 打开 http://127.0.0.1:' + PORT + '/ 等页面显示 written（' + jobs.length + ' 行）')
})
