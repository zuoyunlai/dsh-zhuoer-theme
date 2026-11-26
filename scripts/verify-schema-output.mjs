#!/usr/bin/env node
// 输出契约门：把 theme-tool.js 里的 OUTPUT_SCHEMA 与 toOutput 抽出来，
// 用**宿主的严格规则**（required 数组 / additionalProperties:false / type 匹配）
// 校验一份真实形状的 spec。
//
// 为什么需要这道门：输出校验的失败只发生在宿主进程里，本地 build/test 全绿也照样炸，
// 而每次验证都要重启一次 DSH。同一类错误（schema 与真实返回值不一致）已经连炸三次：
//   1. 属性里写 required: true            → unsupported JSON schema
//   2. font 声明成不可扩展空对象          → "value.font.body" is not a declared property
// 有了这道门，"schema 能不能过宿主" 在本地就能回答，不必再靠重启试错。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, '..', 'theme-tool.js'), 'utf8');

const grab = (startRe, endMark) => {
  const i = src.search(startRe);
  if (i < 0) throw new Error('未找到：' + startRe);
  const j = src.indexOf(endMark, i);
  if (j < 0) throw new Error('未找到结束标记 for ' + startRe);
  return src.slice(i, j + endMark.length);
};

const OUTPUT_SCHEMA = new Function(grab(/const OUTPUT_SCHEMA = \{/, '\n};') + '; return OUTPUT_SCHEMA;')();
const toOutput = new Function(grab(/function toOutput\(spec\) \{/, '\n}') + '; return toOutput;')();

// theme-gen 归一化后**必然**给出的形状（font 一定带 body/chat）
const spec = {
  label: '霓虹夜街',
  light: {
    '--dsw-alias-bg-layout': '#0a0618',
    '--dsw-alias-bg-layer-1': '#120a24',
    '--dsw-alias-label-primary': '#e8f7ff',
    '--dsw-alias-label-secondary': '#8f7fc0',
    '--dsw-alias-brand-primary': '#00f0ff',
    '--dsw-alias-border-l1': '#2a1b4d',
    '--dsw-alias-state-error': '#ff2d78',
    '--dsw-alias-state-success': '#3bffb0',
  },
  font: { body: '', chat: '__mono__' },
  radiusScale: 0,
};

const errs = [];
const typeOf = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);

const walk = (s, v, p) => {
  if (s.type && typeOf(v) !== s.type) { errs.push(p + ': expected ' + s.type + ', got ' + typeOf(v)); return; }
  if (s.type === 'object') {
    const props = s.properties || {};
    for (const k of s.required || []) if (!(k in v)) errs.push(p + ': missing required "' + k + '"');
    if (s.additionalProperties === false) {
      for (const k of Object.keys(v)) if (!(k in props)) errs.push(p + ': "' + k + '" not declared (additionalProperties:false)');
    }
    for (const k of Object.keys(props)) if (k in v) walk(props[k], v[k], p + '.' + k);
  }
};

// schema 自身形态：required 必须在顶层且为字符串数组；属性节点不得带 required
const shapeErrs = [];
const shape = (s, p) => {
  if (!s || typeof s !== 'object') return;
  if ('required' in s && !(Array.isArray(s.required) && s.required.every((x) => typeof x === 'string'))) {
    shapeErrs.push(p + '.required 不是字符串数组');
  }
  if ('type' in s && typeof s.type !== 'string') shapeErrs.push(p + '.type 不是单个字符串');
  if ('additionalProperties' in s && typeof s.additionalProperties !== 'boolean') shapeErrs.push(p + '.additionalProperties 不是布尔');
  for (const k of Object.keys(s.properties || {})) shape(s.properties[k], p + '.properties.' + k);
};
shape(OUTPUT_SCHEMA, 'schema');

const out = toOutput(spec);
walk(OUTPUT_SCHEMA, out, 'value');

const all = [...shapeErrs, ...errs];
if (all.length) {
  console.error('[verify-schema-output] FAIL');
  for (const e of all) console.error('  - ' + e);
  process.exit(1);
}
console.log('[verify-schema-output] PASS  schema 形态合规，toOutput 输出与 schema 一致（keys: ' + Object.keys(out).join(',') + '）');
