#!/usr/bin/env node
// 版本一致性门：把「版本号只能有一个真源」变成机器可查，防止再次出现
// 面板写「构建 0.1.xxx」、控制台打别的号、package.json 又是第三个号的三方漂移。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const src = fs.readFileSync(path.join(root, 'client.js'), 'utf8');
const problems = [];

const m = /const PVERSION = '([^']+)'/.exec(src);
if (!m) problems.push('client.js 里找不到 const PVERSION');
else if (m[1] !== pkg.version) problems.push('PVERSION=' + m[1] + ' 与 package.json=' + pkg.version + ' 不一致');

// 只看代码，不看注释：注释里允许引用历史版本号（解释漂移时不可避免）。
const code = src.replace(/\/\/[^\n]*/g, '');
// 只认「被引号包住的三段式」= 版本字符串常量。
// 不能直接抓任意 x.y.z：SVG path 数据里就有 s5.4.7 这种片段（实测误报）。
// 先把块注释也去掉，注释里允许引用历史版本号。
const bare = code.replace(/\/\*[\s\S]*?\*\//g, '');
const foreign = [...new Set((bare.match(/(['"])(\d+\.\d+\.\d+)\1/g) || []).map((s) => s.slice(1, -1)))]
  .filter((v) => v !== pkg.version);
if (foreign.length) problems.push('代码里出现与当前版本线不符的版本字样：' + foreign.join(', '));

if (problems.length) {
  console.error('[verify:version] 失败');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log('OK    版本号一致：' + pkg.version);
