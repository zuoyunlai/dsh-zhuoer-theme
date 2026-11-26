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
import { readFileSync, writeFileSync } from 'node:fs';
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
// 每次测量都记下来：门禁除了「过线」，还要回答「有没有比上次更差」。
// 只过线是不够的 —— 某主题卡在 4.51:1 时，下次调色碰一下就越界，而门禁到时才发现。
const measurements = [];
const check = (where, fg, bg) => {
  const r = ratio(fg, bg);
  if (r === null) { bad.push(where + ' 无法计算（' + fg + ' / ' + bg + '）'); return; }
  measurements.push({ key: where, fg: fg, bg: bg, ratio: Number(r.toFixed(3)) });
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

// 1c) 语义色落在「文字面」上：错误/警告色是功能性信号，必须和正文一样过线。
// 实测（12 套 × 两态）：label-error 有 15 档 < 4.5，最差 vintage-paper 深色 2.50:1（卡片层）。
for (const id of THEME_IDS) {
  for (const scheme of ['light', 'dark']) {
    const t = THEMES[id] && THEMES[id][scheme];
    if (!t) continue;
    for (const surface of ['--dsw-alias-bg-base', '--dsw-alias-bg-layer-2']) {
      for (const k of ['--dsw-alias-label-error', '--dsw-alias-state-error-primary', '--dsw-alias-state-warn-primary', '--dsw-alias-state-warn-label']) {
        if (!t[k] || !t[surface]) continue;
        check(id + '/' + scheme + ' ' + k.replace('--dsw-alias-', '') + '@' + surface.replace('--dsw-alias-bg-', ''), t[k], t[surface]);
      }
    }
  }
}

// 2) 12 套风格预设 × 深浅两态（走真实的 buildCustomTokens）
// 预设只覆盖 7 个锚点，其余锚点仍取自 base 主题——所以必须按多个 base 抽测，
// 只按 zhuoer 测会漏掉「在深底主题上预设按钮不可读」这类组合。
const PRESET_BASES = ['zhuoer', 'vintage-paper', 'beacon'];
for (const p of api.STYLE_PRESETS) {
  for (const base of PRESET_BASES) for (const scheme of ['light', 'dark']) {
    const spec = { base, light: p.light, autoDark: true };
    const t = api.buildCustomTokens(spec, scheme);
    check('预设:' + p.id + '/' + base + '/' + scheme + ' 正文', t['--dsw-alias-label-primary'], t['--dsw-alias-bg-base']);
    const fill = t['--dsw-alias-button-primary-fill'] || t['--dsw-alias-brand-primary'];
    const fg = t['--dsw-alias-label-primary-foreground'];
    check('预设:' + p.id + '/' + base + '/' + scheme + ' 按钮文字', fg, fill);
  }
}

// 3) pickOnColor 对任意底色的保证（强调色是自由输入的，覆盖极端值）
for (const fill of ['#ffffff', '#000000', '#00ff41', '#f5f5f5', '#4a7fd4', '#a8894a', '#e30613']) {
  check('pickOnColor(' + fill + ')', api.pickOnColor(fill), fill);
}

// 4) 设置面板（插件自有 UI）的文字面
// 面板不铺自己的底色，它继承宿主：可能是设置页底（bg-base），也可能被塞进卡片
// （settings-card-fill）。所以两档都要测 —— 只测 bg-base 会在卡片里悄悄掉到 4.3 以下。
// 注：label-error 压 settings-card-fill 实测 24 档里 1 档 4.36（vintage-paper 深色），
// 因此报错行不许用红色文本，只用字重 + 点线（见 PANEL_CSS 的 .zp-hint.is-warn）。
for (const id of THEME_IDS) {
  for (const scheme of ['light', 'dark']) {
    const t = THEMES[id] && THEMES[id][scheme];
    if (!t) continue;
    const surfaces = ['--dsw-alias-settings-card-fill', '--dsw-alias-button-elevated-fill'];
    for (const surface of surfaces) {
      if (!t[surface]) continue;
      const tag = surface.replace('--dsw-alias-', '');
      check(id + '/' + scheme + ' panel title@' + tag, t['--dsw-alias-label-primary'], t[surface]);
      check(id + '/' + scheme + ' panel label@' + tag, t['--dsw-alias-label-secondary'], t[surface]);
    }
    check(id + '/' + scheme + ' panel label@bg-base', t['--dsw-alias-label-secondary'], t['--dsw-alias-bg-base']);
    // 胶囊选中：品牌色底上压前景色
    if (t['--dsw-alias-brand-primary']) {
      check(id + '/' + scheme + ' panel pill-on', t['--dsw-alias-label-primary-foreground'], t['--dsw-alias-brand-primary']);
    }
    // 危险按钮待确认态：浅危险底 + 正文色
    if (t['--dsw-alias-interactive-bg-hover-danger']) {
      check(id + '/' + scheme + ' panel danger-armed', t['--dsw-alias-label-primary'], t['--dsw-alias-interactive-bg-hover-danger']);
    }
  }
}

// ---- 余量台账 ----
// 默认模式：既查「过不过线」，也查「有没有比台账更低」。
// --update：把当前实测写成新台账（只有明确知情时才该跑，否则等于自己给自己降标准）。
const BASELINE = join(root, 'contracts', 'contrast-baseline.json');
const wantUpdate = process.argv.indexOf('--update') >= 0;
if (wantUpdate) {
  writeFileSync(BASELINE, JSON.stringify({
    note: '由 npm run contrast:update 生成。ratio 是实测对比度；门禁要求任何一组都不得比它低 0.01 以上。',
    min: MIN,
    count: measurements.length,
    pairs: measurements,
  }, null, 2) + '\n');
  console.log('OK    余量台账已写入 ' + measurements.length + ' 组 → contracts/contrast-baseline.json');
  process.exit(0);
}
let baseline = null;
try { baseline = JSON.parse(readFileSync(BASELINE, 'utf8')); } catch (e) { baseline = null; }
const drops = [];
if (baseline && baseline.pairs) {
  const prev = {};
  for (const p of baseline.pairs) prev[p.key] = p.ratio;
  for (const m of measurements) {
    if (prev[m.key] === undefined) continue;
    if (m.ratio < prev[m.key] - 0.01) drops.push(m.key + ' ' + prev[m.key] + ':1 → ' + m.ratio + ':1');
  }
}
if (bad.length) {
  console.error('[verify:contrast] ' + bad.length + ' 项低于 ' + MIN + ':1');
  for (const b of bad.slice(0, 20)) console.error('  - ' + b);
  process.exit(1);
}
if (drops.length) {
  console.error('[verify:contrast] ' + drops.length + ' 组比台账更差（不是过不过线的问题，是退步）：');
  for (const d of drops.slice(0, 20)) console.error('  - ' + d);
  console.error('  确认是有意改动就 npm run contrast:update 并说明原因。');
  process.exit(1);
}
const ledger = baseline ? '（台账 ' + baseline.pairs.length + ' 组，无回退）' : '（无台账，先跑 npm run contrast:update）';
console.log('OK    对比度：内置 ' + THEME_IDS.length + ' 套 + 预设 ' + api.STYLE_PRESETS.length + ' 套 × 两态均 >= ' + MIN + ':1 ' + ledger);
