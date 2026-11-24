#!/usr/bin/env node
/**
 * client.js 的构建：把 src/ 下的分片按文件名顺序拼成单文件。
 *
 * 为什么是「拼接」而不是打包：客户端插件被宿主合并进 /plugins/??a,b,c，
 * import.meta.url 指向合并后的 URL，相对 import 不可靠，所以运行时必须是单文件；
 * 但维护时没必要也单文件——分片只服务人，产物仍然是一个文件、零依赖、零转译。
 *
 * 输出必须与分片逐字节一致（不做压缩、不加 banner），这样 git 能看出「改了哪一块」，
 * 也让 verify-build.mjs 可以用字节比较判断产物是否过期。
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)));

export function buildClient() {
  const dir = join(root, 'src');
  const files = readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
  if (!files.length) throw new Error('src/ 下没有分片');
  const out = files.map((f) => readFileSync(join(dir, f), 'utf8')).join('');
  const head = files[0];
  if (head !== '00-core.js') throw new Error('第一个分片必须是 00-core.js，实际是 ' + head);
  if (!out.includes('const THEMES = ')) throw new Error('产物里缺少 THEMES（10-themes.js 是否还在？）');
  if (!out.trimEnd().endsWith('});')) throw new Error('产物结尾异常，最后一个分片可能被截断');
  return { code: out, files };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const { code, files } = buildClient();
  writeFileSync(join(root, 'client.js'), code, 'utf8');
  console.log('OK    已构建 client.js：' + files.length + ' 个分片，' + Buffer.byteLength(code) + ' 字节');
}
