#!/usr/bin/env node
/**
 * 资源路由对账门：客户端引用的每个 /dsh-zhuoer-theme/assets/** URL，
 * 都要与「服务端注册的目录」和「磁盘上的文件」三方对得上。
 *
 * 为什么需要它：底图 404 能进仓库，就是因为没有任何一道门会问
 * 「客户端要的 URL，服务端给了吗」。客户端引用 /assets/bg/bg-*.webp（21 张），
 * 服务端却注册 /assets/<id>-dark.webp（0.4.0 已删的文件）——两边的命名
 * 从来没对过，而两边各自看起来都对。
 *
 * 服务端侧的真相在 index.js 的 ASSET_DIRS 里（本门直接解析它），
 * 客户端侧扫 client.js 的字面量引用，磁盘侧读真实目录。
 *
 * 实现说明：刻意不使用正则字面量。前一版用正则写这道门时，反斜杠在写入阶段
 * 被吃掉，门脚本自己先语法错误；这里全部改成手写字符扫描。
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const client = readFileSync(join(root, 'client.js'), 'utf8');
const server = readFileSync(join(root, 'index.js'), 'utf8');

const PREFIX = '/dsh-zhuoer-theme/assets/';
const SQ = String.fromCharCode(39);
const SLASH = String.fromCharCode(47);

function scanQuoted(text, start) {
  if (text.charAt(start) !== SQ) return null;
  let i = start + 1;
  const out = [];
  while (i < text.length) {
    const c = text.charAt(i);
    if (c === String.fromCharCode(92)) { out.push(text.charAt(i + 1)); i += 2; continue; }
    if (c === SQ) return [out.join(''), i + 1];
    out.push(c); i++;
  }
  return null;
}

function fieldAfter(text, key) {
  const kAt = text.indexOf(key);
  if (kAt < 0) return null;
  const qAt = text.indexOf(SQ, kAt);
  if (qAt < 0) return null;
  const got = scanQuoted(text, qAt);
  return got ? got[0] : null;
}

function trimSlash(s) { return s.endsWith(SLASH) ? s.slice(0, -1) : s; }

// --- 1. 服务端契约：解析 ASSET_DIRS ---
const dirs = [];
const blockAt = server.indexOf('const ASSET_DIRS = [');
if (blockAt < 0) {
  console.error('[verify:assets] index.js 里找不到 ASSET_DIRS 契约');
  process.exit(1);
}
const blockEnd = server.indexOf(String.fromCharCode(93), blockAt);
const block = server.slice(blockAt, blockEnd > 0 ? blockEnd : server.length);
{
  let i = 0;
  while (i < block.length) {
    const ob = block.indexOf('{', i);
    if (ob < 0) break;
    const cb = block.indexOf('}', ob);
    if (cb < 0) break;
    const obj = block.slice(ob, cb + 1);
    const url = fieldAfter(obj, 'url');
    const disk = fieldAfter(obj, 'disk');
    const ext = fieldAfter(obj, 'ext');
    const type = fieldAfter(obj, 'type');
    if (url && disk && ext) dirs.push({ url: url, disk: disk, ext: ext, type: type || '' });
    i = cb + 1;
  }
}
if (!dirs.length) {
  console.error('[verify:assets] 解析不到 ASSET_DIRS 条目 —— 契约结构变了');
  process.exit(1);
}
for (const d of dirs) {
  if (d.url.indexOf(PREFIX) !== 0) {
    console.error('[verify:assets] ASSET_DIRS 的 url 不在资源前缀下：' + d.url);
    process.exit(1);
  }
}

// --- 2. 客户端引用 ---
const refs = new Set();
{
  let at = client.indexOf(PREFIX);
  while (at >= 0) {
    let end = at + PREFIX.length;
    while (end < client.length) {
      const c = client.charAt(end);
      const ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')
        || c === '.' || c === '_' || c === '-' || c === '/';
      if (!ok) break;
      end++;
    }
    // 目录前缀（结尾是斜杠）不是文件引用，跳过：FONT_BASE 之类的常量会扫成这种。
    if (end > at + PREFIX.length && client.charAt(end - 1) !== SLASH) refs.add(client.slice(at, end));
    at = client.indexOf(PREFIX, at + 1);
  }
}
if (!refs.size) {
  console.error('[verify:assets] 客户端里扫不到资源引用 —— 匹配规则可能失效了');
  process.exit(1);
}

// --- 3. 磁盘文件 ---
const diskFiles = new Set();
function walk(dir, rel) {
  let names = [];
  try { names = readdirSync(dir); } catch (e) { return; }
  for (const name of names) {
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch (e) { continue; }
    if (st.isDirectory()) walk(full, rel ? rel + '/' + name : name);
    else diskFiles.add(rel ? rel + '/' + name : name);
  }
}
// 键必须是「相对仓库根」的路径，才能与契约里的 disk 字段（如 assets/bg/）对齐。
walk(join(root, 'assets'), 'assets');

const problems = [];

// --- 4. 客户端引用 → 契约目录 → 磁盘文件 ---
for (const ref of refs) {
  let hit = null;
  for (const d of dirs) {
    if (ref.indexOf(d.url) !== 0) continue;
    const rest = ref.slice(d.url.length);
    if (rest.indexOf('/') >= 0) continue;
    const diskRel = trimSlash(d.disk) + '/' + rest;
    if (!diskFiles.has(diskRel)) {
      problems.push('客户端引用但磁盘没有该文件：' + ref + '（期望 ' + diskRel + '）');
    }
    hit = d;
    break;
  }
  if (!hit) {
    const anyDir = dirs.some((d) => ref.indexOf(d.url) === 0);
    problems.push(anyDir
      ? '客户端引用但文件不在磁盘上：' + ref
      : '客户端引用但服务端没有对应目录契约：' + ref);
  }
}

// --- 5. 契约目录必须在磁盘上，且有可注册的文件 ---
for (const d of dirs) {
  const rel = trimSlash(d.disk);
  if (!existsSync(join(root, rel))) {
    problems.push('契约声明的目录在磁盘上不存在：' + rel);
    continue;
  }
  let count = 0;
  for (const r of diskFiles) {
    if (r.indexOf(rel + '/') === 0 && r.toLowerCase().endsWith(d.ext)) count++;
  }
  if (!count) problems.push('契约目录里没有匹配扩展名的文件（注册了 0 条路由）：' + rel);
}

// --- 6. 磁盘上有匹配扩展名的文件却不在任何契约目录里（会被漏注册） ---
for (const r of diskFiles) {
  // 只管「本该被服务」的文件：扩展名与某条契约匹配，才谈得上漏注册。
  // assets/fonts/README.md 这类说明文件不需要对外提供，不算问题。
  const relevant = dirs.some((d) => r.toLowerCase().endsWith(d.ext));
  if (!relevant) continue;
  const hit = dirs.some((d) => {
    const base = trimSlash(d.disk);
    return r.indexOf(base + '/') === 0 && r.toLowerCase().endsWith(d.ext);
  });
  if (!hit) problems.push('磁盘文件不在任何契约目录里（不会被注册）：' + r);
}

if (problems.length) {
  console.error('[verify:assets] ' + problems.length + ' 项不一致：');
  for (const p of problems.slice(0, 20)) console.error('  - ' + p);
  if (problems.length > 20) console.error('  ...还有 ' + (problems.length - 20) + ' 项');
  process.exit(1);
}
console.log('OK    资源路由：' + refs.size + ' 个客户端引用 ↔ ' + dirs.length + ' 条目录契约 ↔ '
  + diskFiles.size + ' 个磁盘文件，三方一致');
