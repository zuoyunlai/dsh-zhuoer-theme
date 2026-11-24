#!/usr/bin/env node
/**
 * 对比度门：把「彩色底上的文字必须可读」变成机器可查。
 *
 * 为什么不并进 verify-themes：那道门只查 label-primary on bg-base 一档，
 * 而实测过不去的是 button-primary-fill 上的前景色（12 套风格预设里 12 个组合 < 4.5:1，
 * 最差 cyber 深色 1.37:1），以及被强调色改写过底色的情形。
 *
 * 直接从 client.js 的 #region derive 抠真实实现来跑（与 test-derive 同一手法），
 * 所以测的就是线上那份 pickOnColor / buildCustomTokens。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const src = readFileSync(join(root, 'client.js'), 'utf8');
const { THEMES, THEME_IDS } = await import(pathToFileURL(join(root, 'themes.mjs')).href);

const grabFn = (name) => {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('找不到 function ' + name);
  const open = src.indexOf('{', i);
  let depth = 0, j = open, inS = false, esc = false;
  for (; j < src.length; j++) {
    const c = src[j];
    if (inS) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inS = false; continue; }
    if (c === '"') { inS = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { j++; break; } }
  }
  return src.slice(i, j);
};

const start = src.indexOf('// #region derive');
const end = src.indexOf('// #endregion derive');
if (start < 0 || end < start) throw new Error('client.js 里找不到 #region derive 标记');
const region = src.slice(start, end);
const helpers = [grabFn('hexHsl'), grabFn('hslHex'), grabFn('parseHexColor'), grabFn('toHexColor')].join('\n');
const make = new Function('THEMES', 'THEME_IDS',
  helpers + '\n' + region + '\nreturn { buildCustomTokens, STYLE_PRESETS, pickOnColor };');
const api = make(THEMES, THEME_IDS);

const luminance = (hex) => {
  const m = String(hex || '').trim().replace('#', '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const ch = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(ch[0]) + 0.7152 * lin(ch[1]) + 0.0722 * lin(ch[2]);
};
const ratio = (a, b) => {
  const la = luminance(a), lb = luminance(b);
  if (la === null || lb === null) return null;
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
};

const MIN = 4.5;
const bad = [];
const check = (where, fg, bg) => {
  const r = ratio(fg, bg);
  if (r === null) { bad.push(where + ' 无法计算（' + fg + ' / ' + bg + '）'); return; }
  if (r < MIN) bad.push(where + ' ' + r.toFixed(2) + ':1（' + fg + ' on ' + bg + '）');
};

// 1) 内置 11 套 × 深浅两态
for (const id of THEME_IDS) {
  for (const scheme of ['light', 'dark']) {
    const t = THEMES[id] && THEMES[id][scheme];
    if (!t) continue;
    check(id + '/' + scheme + ' 正文', t['--dsw-alias-label-primary'], t['--dsw-alias-bg-base']);
    const fill = t['--dsw-alias-button-primary-fill'] || t['--dsw-alias-brand-primary'];
    check(id + '/' + scheme + ' 按钮文字', t['--dsw-alias-label-primary-foreground'], fill);
  }
}

// 1b) 提示级与语义色：它们是小字号，低于 4.5 直接读不清（实测修复前浅色 10–11/11 套不达标）
for (const id of THEME_IDS) {
  for (const scheme of ['light', 'dark']) {
    const t = THEMES[id] && THEMES[id][scheme];
    if (!t) continue;
    for (const k of ['--dsw-alias-label-tertiary', '--dsw-alias-label-caption', '--dsw-alias-label-dimmed', '--dsw-alias-state-success-primary']) {
      if (!t[k]) continue;
      check(id + '/' + scheme + ' ' + k.replace('--dsw-alias-', ''), t[k], t['--dsw-alias-bg-base']);
    }
  }
}

// 2) 12 套风格预设 × 深浅两态（走真实的 buildCustomTokens）
for (const p of api.STYLE_PRESETS) {
  for (const scheme of ['light', 'dark']) {
    const spec = { base: 'zhuoer', light: p.light, autoDark: true };
    const t = api.buildCustomTokens(spec, scheme);
    check('预设:' + p.id + '/' + scheme + ' 正文', t['--dsw-alias-label-primary'], t['--dsw-alias-bg-base']);
    const fill = t['--dsw-alias-button-primary-fill'] || t['--dsw-alias-brand-primary'];
    const fg = t['--dsw-alias-label-primary-foreground'];
    check('预设:' + p.id + '/' + scheme + ' 按钮文字', fg, fill);
  }
}

// 3) pickOnColor 对任意底色的保证（强调色是自由输入的，覆盖极端值）
for (const fill of ['#ffffff', '#000000', '#00ff41', '#f5f5f5', '#4a7fd4', '#a8894a', '#e30613']) {
  check('pickOnColor(' + fill + ')', api.pickOnColor(fill), fill);
}

if (bad.length) {
  console.error('[verify:contrast] ' + bad.length + ' 项低于 ' + MIN + ':1');
  for (const b of bad.slice(0, 20)) console.error('  - ' + b);
  process.exit(1);
}
console.log('OK    对比度：内置 ' + THEME_IDS.length + ' 套 + 预设 ' + api.STYLE_PRESETS.length + ' 套 × 两态均 >= ' + MIN + ':1');
