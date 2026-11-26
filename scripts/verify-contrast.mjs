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
const helpers = [grabFn('hexHsl'), grabFn('hslHex'), grabFn('parseHexColor'), grabFn('toHexColor'), grabFn('apcaContrast')].join('\n');
const make = new Function('THEMES', 'THEME_IDS',
  helpers + '\n' + region + '\nreturn { buildCustomTokens, STYLE_PRESETS, pickOnColor, hexHsl, contrastOn, overrideReport, apcaContrast };');
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
const check = (where, fg, bg, decor) => {
  const r = ratio(fg, bg);
  if (r === null) { bad.push(where + ' 无法计算（' + fg + ' / ' + bg + '）'); return; }
  // lc：APCA 副指标（单位就是 Lc，亮底为正、暗底为负）。
  // 只进台账与展示，**不做门槛**——门槛仍由 WCAG 地板负责。
  const lc = Math.round(api.apcaContrast(fg, bg) * 100) / 100;
  measurements.push({ key: where, fg: fg, bg: bg, ratio: Number(r.toFixed(3)), lc: lc, decor: !!decor });
  // decor：装饰性线条（非文字、非组件边界），不按 MIN 判红，但仍进台账守住「只升不降」。
  if (!decor && r < MIN) bad.push(where + ' ' + r.toFixed(2) + ':1（' + fg + ' on ' + bg + '）');
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
    // 硬边模式的选中下划线：品牌色 60% 合成到 bg-layer-1 上（color-mix in srgb）。
    // 这一组是「有意低于 4.5」的装饰线：可辨识性由选中标签的 600 字重承担（非颜色信号）。
    // 用 measureOnly 记台账、不按 MIN 判红，但它只许升不许降（回退会被台账抓到）。
    if (t['--dsw-alias-brand-primary'] && t['--dsw-alias-bg-layer-1']) {
      const a = luminance(t['--dsw-alias-brand-primary']), b = luminance(t['--dsw-alias-bg-layer-1']);
      if (a !== null && b !== null) {
        const mixed = 0.6 * a + 0.4 * b;
        const hi = Math.max(mixed, b), lo = Math.min(mixed, b);
        measurements.push({ key: id + '/' + scheme + ' sharp-underline(60%)', fg: t['--dsw-alias-brand-primary'] + '@60%', bg: t['--dsw-alias-bg-layer-1'], ratio: Number(((hi + 0.05) / (lo + 0.05)).toFixed(3)), decor: true });
      }
    }
  }
}

// 5) 自定义主题的派生地板（遮罩跟随 / 层次阶梯 / 文字地板 / 少量覆盖）
// 合成一套「暖灰 + 低对比」深色主题：就是实测里出问题的那类组合
// （面板 #2b2522、正文 #a89b92；幕外曾是冷黑 #0b0d11，正文实测 2.33:1、标题 3.08:1）。
const customDark = {
  base: 'dash', autoDark: false, font: {}, radiusScale: 1, light: {},
  dark: {
    '--dsw-alias-bg-base': '#2b2522',
    '--dsw-alias-label-primary': '#a89b92',
    '--dsw-alias-border-l1': '#4a4038',
    '--dsw-alias-brand-primary': '#b08968',
    '--dsw-alias-trajectory-accent': '#8c7b6b',
    '--dsw-alias-state-error-primary': '#a05a4a',
    '--dsw-alias-state-warn-primary': '#b08a4a',
    '--dsw-alias-state-success-primary': '#6f8a63',
    '--dsw-specific-bubble': '#3a332e',
  },
};
const ct = api.buildCustomTokens(customDark, 'dark');
const cbg = ct['--dsw-alias-bg-base'];
check('自定义:暖灰 正文', ct['--dsw-alias-label-primary'], cbg);
// 主文字地板比门禁的通用 4.5 更严：正文要 7:1，否则长段落读起来发虚。
const priRatio = ratio(ct['--dsw-alias-label-primary'], cbg);
if (priRatio === null || priRatio < 7) bad.push('自定义:暖灰 正文只 ' + Number(priRatio || 0).toFixed(2) + ':1（地板 7:1）');
check('自定义:暖灰 次级', ct['--dsw-alias-label-secondary'], cbg);
const terRatio = ratio(ct['--dsw-alias-label-tertiary'], cbg);
if (terRatio === null || terRatio < 3) bad.push('自定义:暖灰 三级文字 ' + Number(terRatio || 0).toFixed(2) + ':1（地板 3:1）');
// 阈值来自实测：阶梯 4/8/12/16% 下，暖灰样本相对底色的累计比是 1.13/1.30/1.51/1.77，
// 相邻比约 1.13/1.15/1.16/1.17。阈值取相邻比略低一档——摘掉 enforceDepth 会一起红。
const ladder = [
  ['--dsw-alias-bg-layer-1', 1.10], ['--dsw-alias-bg-layer-2', 1.12],
  ['--dsw-alias-bg-layer-3', 1.13], ['--dsw-alias-bg-layer-4', 1.14],
];
let prevSurface = cbg;
for (const pair of ladder) {
  const r2 = ratio(ct[pair[0]], prevSurface);
  if (r2 === null || r2 < pair[1]) bad.push('自定义:暖灰 层次过平 ' + pair[0].replace('--dsw-alias-bg-', '') + ' vs 上一层 ' + Number(r2 || 0).toFixed(2) + ':1（地板 ' + pair[1] + '）');
  prevSurface = ct[pair[0]];
}
const deepRatio = ratio(ct['--dsw-alias-bg-layer-4'], cbg);
if (deepRatio === null || deepRatio < 1.70) bad.push('自定义:暖灰 最深层与底色只差 ' + Number(deepRatio || 0).toFixed(2) + ':1（地板 1.70）');
const bgH = api.hexHsl(cbg), mH = api.hexHsl(ct['--dsw-alias-bg-mask-1']);
if (!bgH || !mH) bad.push('自定义:暖灰 遮罩无法解析');
else {
  const dh = Math.abs(mH[0] - bgH[0]);
  const dh2 = Math.min(dh, 360 - dh);
  if (dh2 > 25) bad.push('自定义:暖灰 遮罩未跟随底色色相 Δh=' + dh2.toFixed(1) + '°（上限 25°）');
  if (mH[2] > 0.14) bad.push('自定义:暖灰 遮罩不够暗 L=' + mH[2].toFixed(2) + '（上限 0.14）');
}
if (ct['--dsw-specific-bubble'] !== '#3a332e') bad.push('自定义:暖灰 少量覆盖未生效（--dsw-specific-bubble=' + ct['--dsw-specific-bubble'] + '）');

// 地板要覆盖「文字真正会落在的抬升面」，不只是 bg-base（借 palette 多背景思路）
// 注意：必须压低**锚点**（label-primary）来触发地板；直接覆盖 label-secondary 是无效测试——
// 覆盖发生在地板之后，测到的是覆盖值本身（第一次就写错了，被这条断言自己抓出来）。
const multi = api.buildCustomTokens({
  base: 'dash', autoDark: false, font: {}, radiusScale: 1, light: {},
  dark: {
    '--dsw-alias-bg-base': '#2b2522',
    '--dsw-alias-label-primary': '#3a332e',
    '--dsw-alias-bg-layer-2': '#4a4038',
  },
}, 'dark');
const onBg = api.contrastOn ? api.contrastOn(multi['--dsw-alias-label-secondary'], multi['--dsw-alias-bg-base']) : ratio(multi['--dsw-alias-label-secondary'], multi['--dsw-alias-bg-base']);
const onLayer = ratio(multi['--dsw-alias-label-secondary'], multi['--dsw-alias-bg-layer-2']);
if (!(onLayer >= 5.9)) bad.push('次级文字在抬升层上只有 ' + Number(onLayer || 0).toFixed(2) + ':1（地板 6:1，旧实现只校验 bg-base 会漏掉这个面）');
if (!(onBg >= 5.9)) bad.push('次级文字在底色上只有 ' + Number(onBg || 0).toFixed(2) + ':1（地板 6:1）');

// APCA 副指标：正文 |Lc| >= 60（APCA 对正文的通行标准）。
// 只对**正文**设线：次级/三级文字的 Lc 天然更低（实测内置最差 三级/dark = -32.75），
// 一刀切会把正常的层级差判成失败。正文这一档是「能读」的底线，LC 60 是公认门槛。
const lcOf = (fg, bg) => Math.abs(Math.round(api.apcaContrast(fg, bg) * 100));
let minLc = Infinity, minLcKey = '';
for (const id of THEME_IDS) {
  const t = THEMES[id];
  if (!t) continue;
  for (const sc of ['light', 'dark']) {
    const tt = t[sc] || {};
    const v = lcOf(tt['--dsw-alias-label-primary'], tt['--dsw-alias-bg-base']);
    if (v < minLc) { minLc = v; minLcKey = id + '/' + sc; }
  }
}
if (!(minLc >= 60)) bad.push('内置主题正文 Lc 最差只有 ' + minLc + '（' + minLcKey + '），APCA 正文标准是 60）');
const lcWarm = lcOf(ct['--dsw-alias-label-primary'], ct['--dsw-alias-bg-base']);
if (!(lcWarm >= 60)) bad.push('自定义:暖灰 正文 Lc 只有 ' + lcWarm + '（APCA 正文标准 60）');

// B 档：前景文字的覆盖若低于 3:1 必须回退到派生值（覆盖多来自 AI 生成 / JSON 导入）。
// 注意用文字组的**成员** token 测：锚点 label-primary 本来就不走覆盖路径（它走 applyGroup + 文字地板）。
const evilOv = { base: 'dash', autoDark: false, font: {}, radiusScale: 1, light: {},
  dark: Object.assign({}, customDark.dark, { '--dsw-alias-label-secondary': '#2f2825' }) };
const ev = api.buildCustomTokens(evilOv, 'dark');
const evRatio = ratio(ev['--dsw-alias-label-secondary'], ev['--dsw-alias-bg-base']);
if (evRatio === null || evRatio < 3) bad.push('覆盖把次级文字压到 ' + Number(evRatio || 0).toFixed(2) + ':1 却没回退（B 档要求 <3:1 回退）');
const evRep = api.overrideReport();
if (!evRep || evRep.softened.length !== 1) bad.push('覆盖报告 softened 应为 1，实得 ' + (evRep ? evRep.softened.length : 'null'));
if (evRep && evRep.applied.indexOf('--dsw-specific-bubble') < 0) bad.push('正常覆盖应记入 applied');
// 背景类覆盖不受该约束：卡片面本来就和底色接近
const bgOv = { base: 'dash', autoDark: false, font: {}, radiusScale: 1, light: {},
  dark: Object.assign({}, customDark.dark, { '--dsw-alias-card-fill': '#3b332d' }) };
if (api.buildCustomTokens(bgOv, 'dark')['--dsw-alias-card-fill'] !== '#3b332d') bad.push('背景类覆盖被误判回退（B 档只约束前景文字）');
// 身份性质：只换品牌色时不得改动底色层级（否则等于悄悄改掉所有老主题的外观）
const brandOnly = api.buildCustomTokens({ base: 'dash', autoDark: false, font: {}, radiusScale: 1, light: {}, dark: { '--dsw-alias-brand-primary': '#b08968' } }, 'dark');
if (brandOnly['--dsw-alias-bg-layer-1'] !== THEMES.dash.dark['--dsw-alias-bg-layer-1']) bad.push('只换品牌色却改动了底色层级（应保持 base 值）');

// ---- 余量台账 ----
// 默认模式：既查「过不过线」，也查「有没有比台账更低」。
// --update：把当前实测写成新台账（只有明确知情时才该跑，否则等于自己给自己降标准）。
const BASELINE = join(root, 'contracts', 'contrast-baseline.json');
const wantUpdate = process.argv.indexOf('--update') >= 0;
if (wantUpdate) {
  writeFileSync(BASELINE, JSON.stringify({
    note: '由 npm run contrast:update 生成。ratio 是实测 WCAG 对比度；lc 是 APCA 副指标（Lc/100，只展示不设门槛）。门禁要求 ratio 与 lc 都不得退步。',
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
  const prevLc = {};
  for (const p of baseline.pairs) { prev[p.key] = p.ratio; if (typeof p.lc === 'number') prevLc[p.key] = p.lc; }
  for (const m of measurements) {
    if (prev[m.key] === undefined) continue;
    if (m.ratio < prev[m.key] - 0.01) drops.push(m.key + ' ' + prev[m.key] + ':1 → ' + m.ratio + ':1');
    // Lc 同样只升不降：它是「看得清」的副指标，退步了要说出来。
    if (typeof prevLc[m.key] === 'number' && typeof m.lc === 'number' && m.lc < prevLc[m.key] - 0.5) {
      drops.push(m.key + ' Lc ' + prevLc[m.key] + ' → ' + m.lc + '（APCA 副指标退步）');
    }
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
