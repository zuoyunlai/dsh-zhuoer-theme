#!/usr/bin/env node
// 启动期语法门：服务端文件一旦有语法错误，宿主只显示「启动时未能加载」，
// 工具从列表里整体消失——在别的对话里表现为「没有主题生成工具」，
// 很难和「参数校验失败 / 工具没注册」区分，而现场没有任何日志指向源文件。
// node --check 不需要 import 宿主模块，秒级出结论，所以放在 verify:all 最前面。
// 注意：src/*.js 是分片，依赖前片包住顶层 return，单独 --check 会误报，故不纳入。
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const files = ['index.js', 'theme-tool.js', 'theme-gen.js', 'build.mjs', 'scripts/dev-sync.mjs'];
const bad = [];
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', path.join(root, f)], { stdio: 'pipe' });
  } catch (e) {
    const raw = String((e && e.stderr) || (e && e.message) || '');
    bad.push(f + ' :: ' + raw.split(/\r?\n/).filter(Boolean).slice(0, 4).join(' | ').trim());
  }
}
if (bad.length) {
  console.error('[verify-syntax] FAIL');
  for (const b of bad) console.error('  - ' + b);
  process.exit(1);
}
console.log('[verify-syntax] PASS  ' + files.length + ' 个服务端文件语法正常');
