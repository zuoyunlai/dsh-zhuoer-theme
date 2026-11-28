#!/usr/bin/env node
/**
 * 双装配回归：同一 server 里插件被装配两次（desktop / web 两份 profile 各注一次）时，
 * 宿主的 webServer.register 对同路径会硬抛 "duplicate exact route"。
 * 这里用一个「重复即抛」的假 webServer 模拟宿主，装配两次，断言：
 *   1) 第二次不会抛；2) 每个路径只注册一次；3) 状态落成 endpoint-mounted。
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const mod = await import(pathToFileURL(path.resolve('index.js')).href)

const seen = new Map()
const ws = {
  register(route) {
    if (seen.has(route.path)) throw new Error('duplicate exact route "' + route.path + '"')
    seen.set(route.path, route)
  },
}
const injected = { get: (n) => (n === 'webServer' ? ws : null) }
const makeCtx = () => ({
  get: () => null,
  inject: (deps, fn) => { if (deps.includes('webServer')) fn(injected) },
  effect: (fn) => fn(),
})

let threw = null
try {
  mod.apply(makeCtx(), {})
  mod.apply(makeCtx(), {})   // 第二次装配：修复前这里就抛 duplicate
} catch (e) { threw = e }

assert.equal(threw, null, '第二次装配不应抛错：' + (threw && threw.message))
const report = Array.from(seen.keys()).filter((p) => p.indexOf('/dsh-zhuoer-theme/api/report') >= 0)
assert.equal(report.length, 1, '/api/report 只应注册一次')
assert.ok(seen.size >= 2, '应注册多个路由（report + nonce + 资源），实际 ' + seen.size)

const statusPath = path.join(os.homedir(), '.dsh', 'dsh-zhuoer-theme', 'plugin-status.json')
const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'))
assert.equal(status.phase, 'endpoint-mounted', '状态应为 endpoint-mounted，实际 ' + status.phase)

console.log('OK    双装配：第二次不抛、' + seen.size + ' 条路由各注册一次、状态 endpoint-mounted')
