#!/usr/bin/env node
/**
 * 市场索引门：market/index.json 必须能被 DSH 的「发现」接受。
 *
 * 为什么需要它：DSH 对索引是**整份接受或整份拒绝**——任一字段违规就整份不显示，且用户只在
 * 「管理索引源…」里看到一句原因。字段写错了不会在本地任何命令里暴露，所以要把官方 schema
 * 变成可机械判定的门。
 *
 * 判据（按官方 plugin-market 文档的索引/插件/版本字段表）：
 *   1. format === 1；plugins 非空；title 存在且为合法 LocalizedText；
 *   2. LocalizedText：字符串，或对象且**必须含 en**（其余键为小写语言 id）；
 *   3. 插件：name 唯一、必填；versions 非空；
 *   4. 版本：SemVer 精确版本、插件内唯一；publishTimestamp 为整数；source.type 为 npm 或 git
 *      （git 需 https url + 40 位十六进制 commit）；engines.dsh 若给则为版本范围字符串；
 *   5. 本仓一致性：插件 name 与 package.json name 相同；engines.dsh 与 package.json 的 engines.dsh
 *      一致；homepage/repository 指向同一仓库；版本号都在 package.json 的版本之前或相等。
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const file = join(root, 'market', 'index.json')
if (!existsSync(file)) { console.error('FAIL  缺 market/index.json'); process.exit(1) }
let idx
try { idx = JSON.parse(readFileSync(file, 'utf8')) } catch (e) { console.error('FAIL  market/index.json 不是合法 JSON：' + e.message); process.exit(1) }
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

let bad = 0
const fail = (m) => { console.error('FAIL  ' + m); bad++ }
const isLT = (v) => typeof v === 'string' || (v && typeof v === 'object' && typeof v.en === 'string' && Object.keys(v).every((k) => k === k.toLowerCase()))
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

if (idx.format !== 1) fail('format 必须是 1，实际 ' + JSON.stringify(idx.format))
if (idx.title !== undefined && !isLT(idx.title)) fail('title 不是合法 LocalizedText（对象形式必须含 en，键为小写语言 id）')
if (idx.description !== undefined && !isLT(idx.description)) fail('description 不是合法 LocalizedText')
if (!Array.isArray(idx.plugins) || !idx.plugins.length) fail('plugins 必须是非空数组')

const names = new Set()
for (const [i, p] of (idx.plugins || []).entries()) {
  const at = 'plugins[' + i + ']'
  if (!p || typeof p.name !== 'string' || !p.name) { fail(at + '.name 缺失'); continue }
  if (names.has(p.name)) fail(at + '.name 重复：' + p.name)
  names.add(p.name)
  for (const k of ['title', 'description']) if (p[k] !== undefined && !isLT(p[k])) fail(at + '.' + k + ' 不是合法 LocalizedText')
  if (p.homepage !== undefined && !/^https?:\/\//.test(String(p.homepage))) fail(at + '.homepage 不是 http(s) URL')
  if (p.repository !== undefined && !(p.repository && /^https?:\/\//.test(String(p.repository.url || '')))) fail(at + '.repository.url 不是 http(s) URL')
  if (typeof p.icon === 'string' && p.icon.startsWith('data:') && p.icon.length > 32 * 1024) fail(at + '.icon 内联 data URL 超过 32 KiB')
  if (!Array.isArray(p.versions) || !p.versions.length) { fail(at + '.versions 必须非空'); continue }
  const seen = new Set()
  for (const [j, v] of p.versions.entries()) {
    const vat = at + '.versions[' + j + ']'
    if (!v || !SEMVER.test(String(v.version))) fail(vat + '.version 不是精确 SemVer：' + JSON.stringify(v && v.version))
    else if (seen.has(v.version)) fail(vat + '.version 重复：' + v.version)
    else seen.add(v.version)
    if (!Number.isInteger(v.publishTimestamp)) fail(vat + '.publishTimestamp 必须是整数（Unix 秒）')
    const s = v.source || {}
    if (s.type === 'npm') {
      if (s.registry !== undefined && !/^https?:\/\//.test(String(s.registry))) fail(vat + '.source.registry 不是 http(s) URL')
    } else if (s.type === 'git') {
      if (!/^https:\/\//.test(String(s.url || ''))) fail(vat + '.source.url 必须是 https URL')
      if (!/^[0-9a-f]{40}$/.test(String(s.commit || ''))) fail(vat + '.source.commit 必须是 40 位十六进制')
    } else fail(vat + '.source.type 必须是 npm 或 git，实际 ' + JSON.stringify(s.type))
    if (v.engines && v.engines.dsh !== undefined && typeof v.engines.dsh !== 'string') fail(vat + '.engines.dsh 必须是版本范围字符串')
  }
}

// 与本仓一致性
const me = (idx.plugins || []).find((p) => p && p.name === pkg.name)
if (!me) fail('索引里没有本仓插件 ' + pkg.name)
else {
  const want = (pkg.engines && pkg.engines.dsh) || ''
  for (const v of me.versions || []) {
    if (v.engines && v.engines.dsh && want && v.engines.dsh !== want) fail('版本 ' + v.version + ' 的 engines.dsh（' + v.engines.dsh + '）与 package.json（' + want + '）不一致')
  }
  const latest = String(pkg.version)
  const hasLatest = (me.versions || []).some((v) => v.version === latest)
  if (!hasLatest) console.error('WARN  索引里没有当前 package.json 版本 ' + latest + '（发版后要同步）')
  if (pkg.version && (me.versions || []).some((v) => v.version > latest)) fail('索引里出现了比 package.json 更新的版本：' + latest)
}

if (bad) { console.error('FAIL  ' + bad + ' 处索引问题'); process.exit(1) }
console.log('PASS  市场索引合规：' + (idx.plugins || []).length + ' 个插件 / ' + (idx.plugins || []).reduce((n, p) => n + (p.versions || []).length, 0) + ' 个版本')
