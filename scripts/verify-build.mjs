#!/usr/bin/env node
/**
 * 产物新鲜度门：client.js 必须等于 src/ 重新拼接的结果。
 * 直接改 client.js（而不是改 src/ 再 build）会在这里红，避免「源码与产物各说一套」。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildClient, root } from '../build.mjs';

const { code, files } = buildClient();
const actual = readFileSync(join(root, 'client.js'), 'utf8');
if (actual !== code) {
  const at = actual.length === code.length ? '长度相同但内容不同' : '长度 ' + actual.length + ' vs ' + code.length;
  console.error('[verify:build] client.js 与 src/ 分片不一致（' + at + '），请运行 npm run build');
  console.error('  分片：' + files.join(', '));
  process.exit(1);
}
console.log('OK    产物与源码一致：' + files.length + ' 个分片，' + Buffer.byteLength(code) + ' 字节');
