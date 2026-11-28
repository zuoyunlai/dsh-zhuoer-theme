/**
 * 语义锚点门禁：我们 CSS 里引用的 `[data-slot="…"]` 必须仍然存在于宿主。
 *
 * 为什么需要它：
 *   插件对宿主布局的依赖分两类。一类是 CSS Modules 哈希类名（`_centerCol` 这种），
 *   宿主一改名就静默失配——样式悄悄消失，`verify:visual` 也可能因为没覆盖到而不报。
 *   另一类是语义锚点（`[data-slot="sidebar"]`），它由宿主的 Slot 契约保证，比类名稳。
 *   这个门禁只保证「我们引用的锚点还在清单里」，不保证「它能上色」——真机实测这些元素
 *   全是 `display:contents` 的 0×0 包装，背景无效、量不到尺寸，只能作祖先限定或 `:has(> …)` 反选。
 *
 * 用法：
 *   node scripts/verify-anchors.mjs                    对账 src/*.js 与 contracts/host-anchors.json
 *   node scripts/verify-anchors.mjs --capture <file>   用一份真机 dump 重写清单（见下）
 *
 * 采集（升级宿主后做一次）：
 *   1) dsh --profile zr-probe --from-default-profile web --dump-config
 *   2) dsh plugin --profile zr-probe add "file:<本仓绝对路径>"
 *   3) dsh --profile zr-probe --no-open --port 0    → 拿到带 token 的 URL
 *   4) 用浏览器打开，在控制台取：
 *        JSON.stringify([...new Set([...document.querySelectorAll('[data-slot]')]
 *          .map(e => e.getAttribute('data-slot')))].sort())
 *      存成文件后用 --capture 喂进来；profile 用完即删。
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = join(root, 'contracts', 'host-anchors.json')
const argv = process.argv.slice(2)
const capIdx = argv.indexOf('--capture')

const srcDir = join(root, 'src')
const used = new Map() // anchor -> [files]
for (const name of readdirSync(srcDir).filter((f) => f.endsWith('.js'))) {
  const text = readFileSync(join(srcDir, name), 'utf8')
  const re = /\[data-slot="([^"]+)"\]/g
  let m
  while ((m = re.exec(text))) {
    if (!used.has(m[1])) used.set(m[1], [])
    if (!used.get(m[1]).includes(name)) used.get(m[1]).push(name)
  }
}

if (capIdx !== -1) {
  const file = argv[capIdx + 1]
  if (!file || !existsSync(file)) {
    console.error('FAIL  用法：node scripts/verify-anchors.mjs --capture <dump.json>')
    process.exit(2)
  }
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  const slots = Array.isArray(raw) ? raw : raw.slots
  if (!Array.isArray(slots) || slots.length === 0) {
    console.error('FAIL  dump 里没有 slots 数组')
    process.exit(2)
  }
  const next = {
    $comment: '宿主语义锚点清单：DOM 里 [data-slot] 的取值全集，用于 verify:anchors 校验我们 CSS 引用的锚点仍然存在。由 scripts/verify-anchors.mjs --capture 生成，不要手改。',
    hostVersion: (Array.isArray(raw) ? null : raw.hostVersion) || 'unknown',
    capturedAt: new Date().toISOString(),
    capturedFrom: (Array.isArray(raw) ? null : raw.capturedFrom) || 'capture',
    note: '这些元素全部是 display:contents 的 0×0 包装：不能上色、量不到尺寸，只能作祖先限定或 :has(> …) 反选真实盒子。',
    slots: [...new Set(slots)].sort(),
  }
  writeFileSync(manifestPath, JSON.stringify(next, null, 2) + '\n')
  console.log('WROTE 锚点清单：' + next.slots.length + ' 个 → contracts/host-anchors.json')
  process.exit(0)
}

if (!existsSync(manifestPath)) {
  console.error('FAIL  缺少 contracts/host-anchors.json（先跑一次 --capture）')
  process.exit(2)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const known = new Set(manifest.slots || [])
const unknown = [...used.entries()].filter(([anchor]) => !known.has(anchor))

if (unknown.length) {
  console.error('FAIL  src 里引用了宿主没有的锚点（宿主改名或我们写错）：')
  for (const [anchor, files] of unknown) console.error('        [data-slot="' + anchor + '"]  ← ' + files.join(', '))
  console.error('      修法：跑一次 --capture 刷新清单；若锚点确实消失，改回 CSS Modules 类名并在此处说明。')
  process.exit(1)
}

const list = [...used.keys()].sort()
console.log('OK    语义锚点 ' + list.length + ' 个都在宿主清单内（清单共 ' + known.size + ' 个，采集于 ' + (manifest.capturedAt || '?').slice(0, 10) + ' / 宿主 ' + (manifest.hostVersion || '?') + '）')
for (const a of list) console.log('        [data-slot="' + a + '"]  ← ' + used.get(a).join(', '))
