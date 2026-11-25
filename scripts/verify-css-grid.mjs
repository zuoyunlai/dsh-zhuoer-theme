#!/usr/bin/env node
/**
 * 刻度门：把「字号 / 圆角 / 间距必须落在刻度上」变成机器可查。
 *
 * 为什么需要它：0.5.8 把 PANEL_CSS 的字号从 11.5/12.5 收到 12、间距收到 4px 网格，
 * 但那是一次性手改 —— 下次谁再写个 gap:7px 没有任何东西会拦。视觉回归要靠浏览器，
 * 而刻度是纯文本事实，可以在 CI 里免费守住。
 *
 * 三条规则（刻意宽松，只管「明显不守规矩」的）：
 *   1. font-size 必须属于 11/12/13/15/18/20 六档；
 *   2. border-radius 必须属于 0/2/3/4/6/8/10/12/14/16/999；
 *   3. 间距（gap / padding / margin）≥4px 必须是偶数（2px 网格），<4px 视为光学微调放行。
 *
 * 为什么是 2px 而不是 4px：这个面板的真实设计语言本来就是 2px 网格 —— 实测 6/10/14/22/26
 * 这些值成规模出现且视觉上成立。硬套 4px 会把 32 处间距全部改动、整块面板重新排版，
 * 而收益只有「数字更好看」。刻度门的作用是拦住「随手写个 7px / 9px」，不是重塑设计。
 *
 * 不查 width / height / top / left 这类控件尺寸：42px 的按钮、26px 的关闭键
 * 是命中区尺寸，硬套 4 的倍数只会把可点击面积改小。
 *
 * 刻意不用正则字面量：此前的写入事故里反斜杠被吞，正则变成语法错。这里全部用字符扫描。
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const FILES = ['src/20-tokens-and-panel.js', 'src/30-quicknav.js'];

const TYPE_SCALE = [11, 12, 13, 15, 18, 20];
const RADIUS_SCALE = [0, 2, 3, 4, 6, 8, 10, 12, 14, 16, 999];
const SPACING = ['gap', 'row-gap', 'column-gap', 'padding', 'padding-top', 'padding-bottom',
  'padding-left', 'padding-right', 'margin', 'margin-top', 'margin-bottom',
  'margin-left', 'margin-right'];
const FONT_PROPS = ['font-size', 'fontSize'];
const RADIUS_PROPS = ['border-radius', 'borderRadius'];

const isDigit = (c) => c >= '0' && c <= '9';
const isAlpha = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '-';

// 从一个位置往回吃数字（支持小数点与负号），返回 { num, start }
function numberBefore(text, end) {
  let j = end;
  while (j > 0 && text[j - 1] === ' ') j--;
  let k = j;
  while (k > 0 && (isDigit(text[k - 1]) || text[k - 1] === '.')) k--;
  if (k === j) return null;
  return { num: parseFloat(text.slice(k, j)), start: k };
}

// 从 value 区段里取出所有 px 数字（也接受裸数字，用于 JS 风格对象）
function numbersIn(value) {
  const out = [];
  let i = 0;
  while (i < value.length) {
    if (isDigit(value[i])) {
      let j = i;
      while (j < value.length && (isDigit(value[j]) || value[j] === '.')) j++;
      const raw = value.slice(i, j);
      let unit = '';
      let u = j;
      while (u < value.length && isAlpha(value[u])) { unit += value[u]; u++; }
      out.push({ num: parseFloat(raw), unit });
      i = u;
      continue;
    }
    i++;
  }
  return out;
}

const problems = [];
let checked = 0;

for (const rel of FILES) {
  const text = readFileSync(join(root, rel), 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, idx) => {
    let i = 0;
    while (i < line.length) {
      if (!isAlpha(line[i])) { i++; continue; }
      let j = i;
      while (j < line.length && isAlpha(line[j])) j++;
      const prop = line.slice(i, j);
      let k = j;
      while (k < line.length && line[k] === ' ') k++;
      if (line[k] !== ':') { i = j; continue; }
      // value 区段：到 ; } { 或行尾
      let v = k + 1;
      while (v < line.length && line[v] !== ';' && line[v] !== '}' && line[v] !== '{') v++;
      const value = line.slice(k + 1, v);
      // 拼接出来的声明不是设计值：如 applyHostTextScale 里
      //   out.push(sel + '{font-size:' + scaled + 'px !important;}')
      // 里面出现的数字是算式常量，按刻度判红只会制造假红。
      if (value.indexOf("'") >= 0 || value.indexOf('"') >= 0 || value.indexOf('+') >= 0) { i = v; continue }
      const isFont = FONT_PROPS.indexOf(prop) >= 0;
      const isRadius = RADIUS_PROPS.indexOf(prop) >= 0;
      const isSpacing = SPACING.indexOf(prop) >= 0;
      if (isFont || isRadius || isSpacing) {
        for (const n of numbersIn(value)) {
          if (isFont || isRadius || isSpacing) checked++;
          if (n.unit !== '' && n.unit !== 'px') continue;
          if (isFont) {
            if (TYPE_SCALE.indexOf(n.num) < 0) {
              problems.push({ file: rel, line: idx + 1, prop, num: n.num, rule: '字号必须属于 ' + TYPE_SCALE.join('/') });
            }
          } else if (isRadius) {
            if (RADIUS_SCALE.indexOf(n.num) < 0) {
              problems.push({ file: rel, line: idx + 1, prop, num: n.num, rule: '圆角必须属于 ' + RADIUS_SCALE.join('/') });
            }
          } else if (isSpacing) {
            if (n.num >= 4 && n.num % 2 !== 0) {
              problems.push({ file: rel, line: idx + 1, prop, num: n.num, rule: '间距 ≥4px 必须是偶数（2px 网格）' });
            }
          }
        }
      }
      i = v;
    }
  });
}

if (problems.length) {
  console.log('FAIL 刻度门：' + problems.length + ' 处不在刻度上（共查 ' + checked + ' 个值）');
  for (const p of problems) {
    console.log('  ' + p.file + ':' + p.line + '  ' + p.prop + ': ' + p.num + 'px  —— ' + p.rule);
  }
  process.exitCode = 1;
} else {
  console.log('OK 刻度门：' + FILES.length + ' 个文件、' + checked + ' 个字号/圆角/间距值全部落在刻度上');
}
