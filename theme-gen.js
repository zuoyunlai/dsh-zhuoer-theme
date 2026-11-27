// dsh-zhuoer-theme —— 主题生成的共用逻辑
// 两处共用：
//   1. HTTP 端点 /dsh-zhuoer-theme/api/gen-theme（面板里的 AI 生成用）
//   2. 宿主工具 zhuoer_theme_generate（对话里模型主动出主题用）
// 抽出来是为了让两条路径的提示词、解析、校验完全一致——
// 面板能生成的主题，对话里也必须能生成同样的东西。

// 模型现在要**同时给出浅色与深色两套锚点**：深色不再由浅色反推（autoDark 只作为缺失时的兜底）。
export const THEME_SYSTEM_PROMPT = [
  '你是 DSH 主题生成器。把用户描述转成一套主题，必须同时覆盖浅色与深色两种模式。',
  '只输出 JSON，不要解释、不要 markdown 代码块、不要多余文字。',
  '格式：{"label":"主题名","light":{...8个key...},"dark":{...同样8个key...},"font":{"body":"","chat":""},"radiusScale":1}',
  'label 是给用户看的主题名：4–10 个汉字，概括风格气质（例：落日晚砂、青苔石阶、旧书暖灯），',
  '不要引号、编号、标点，也不要带「主题」二字；它会直接预填到名称框。',
  'light 与 dark 各自的 8 个 key 必须逐字使用：--dsw-alias-bg-base、--dsw-alias-label-primary、--dsw-alias-border-l1、--dsw-alias-brand-primary、--dsw-alias-trajectory-accent、--dsw-alias-state-error-primary、--dsw-alias-state-warn-primary、--dsw-alias-state-success-primary',
  'light 是**浅色模式**：bg-base 明度通常在 90% 以上，label-primary 深。',
  'dark 是**深色模式**：bg-base 必须是真正的深色（明度 ≤ 18%，例 #0a0618、#120a24），label-primary 浅；',
  '  不要用纯黑 #000000（发闷），用同色相的极深色；border-l1 要比 bg-base 略亮才看得出边界。',
  '两套是同一视觉语言的明暗两面：色相族一致、强调色（brand-primary / trajectory-accent）保持一致或仅微调明度，',
  '  只把「底色/文字/边框」三层对调。深色不是浅色的等比反色。',
  '规则：每个色值必须是 #rrggbb；两套各自的 label-primary 与 bg-base 对比度都要 ≥ 4.5；',
  'brand-primary 与 trajectory-accent 要来自同一色相族或成互补关系；',
  '复古/终端风格：radiusScale 设 0、font.chat 设 "__mono__"；扁平/极简：radiusScale 设 0；',
  '两套都必须给全 8 个 key；任一不足 4 个即视为无效。',
  '可选覆盖（每套最多 4 个，通常不需要）：只有当某个「面」必须与派生结果不同时才给额外键，例如 --dsw-specific-bubble（用户气泡）、--dsw-alias-card-fill（卡片面）、--dsw-alias-markdown-code-block（代码块底）、--dsw-alias-bg-mask-1（遮罩）。没把握就别给——派生已经会保证层次与对比度。',
].join('\n');

// ---- 生成路径的对比度体检（R-07 / F-11）----
// 为什么要有：对比度门原来只存在于面板编辑器与 verify-contrast.mjs；
// 「模型直接返回一套不可读配色」这条路没有任何门——界面不会报错，用户只会觉得「这主题怪」。
// 做法：解析后立刻体检**锚点**（不重算派生层），不达标就往离底色更远的黑/白推到位，
// 结果记进 spec.gate 供工具结果与卡片引用。
// 诚实边界：下面四个小函数是客户端 src/10-themes.js 里同一套规则的**宿主侧副本**
// （宿主拿不到客户端代码）。规则变动时两处都要改——已在 CHANGELOG 记这条债。
function zrHexToRgb(h) {
  const m = String(h || '').trim().replace('#', '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}
function zrRgbToHex(c) {
  return '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}
function zrRelLum(hex) {
  const c = zrHexToRgb(hex);
  if (!c) return null;
  const f = (v) => { const n = v / 255; return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}
export function zrContrast(a, b) {
  const la = zrRelLum(a), lb = zrRelLum(b);
  if (la === null || lb === null) return 0;
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}
function zrMixHex(a, b, t) {
  const A = zrHexToRgb(a), B = zrHexToRgb(b);
  if (!A || !B) return a;
  return zrRgbToHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}
// 往「离底色更远」的那一侧推，二分找最小位移量（14 次足够分辨 1/255）。
// 数学上 4.5 与 3.0 这两个门槛总能达成：对任意底色亮度 L，黑给出 (L+0.05)/0.05、
// 白给出 1.05/(L+0.05)，两者必有一侧 >= 4.5。所以 weak 是兜底而不是常态——
// 只有将来把阈值调高到「黑白都压不出来」时它才会亮。
function zrPushToRatio(hex, bg, minRatio) {
  const toward = (zrRelLum(bg) || 0) > 0.35 ? '#000000' : '#ffffff';
  if (zrContrast(toward, bg) < minRatio) return { hex: hex, ratio: zrContrast(hex, bg), ok: false };
  let lo = 0, hi = 1;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (zrContrast(zrMixHex(hex, toward, mid), bg) >= minRatio) hi = mid; else lo = mid;
  }
  const out = zrMixHex(hex, toward, hi);
  return { hex: out, ratio: zrContrast(out, bg), ok: true };
}
// 体检并**就地修正** spec.light / spec.dark 的正文色与品牌色。
// 门槛：正文 vs 底色 >= 4.5（WCAG AA），品牌 vs 底色 >= 3.0（大字号/图形底线）。
export function zrAnchorGate(spec) {
  const rep = { ok: true, fixes: [], weak: [], ratios: {} };
  if (!spec || typeof spec !== 'object') return rep;
  const round2 = (v) => Math.round(v * 100) / 100;
  ['light', 'dark'].forEach((scheme) => {
    const a = spec[scheme];
    if (!a || typeof a !== 'object') return;
    const bg = a['--dsw-alias-bg-base'];
    if (!bg) return;
    const r = {};
    const pairs = [
      ['--dsw-alias-label-primary', 4.5],
      ['--dsw-alias-brand-primary', 3.0],
    ];
    pairs.forEach((pair) => {
      const key = pair[0], min = pair[1];
      const cur = a[key];
      if (typeof cur !== 'string') return;
      const now = zrContrast(cur, bg);
      const slot = key.indexOf('brand') !== -1 ? 'brand' : 'text';
      r[slot] = round2(now);
      if (now >= min) return;
      const fixed = zrPushToRatio(cur, bg, min);
      a[key] = fixed.hex;
      r[slot] = round2(fixed.ratio);
      const item = { scheme: scheme, token: key, from: cur, to: fixed.hex, ratio: r[slot] };
      if (fixed.ok) rep.fixes.push(item); else rep.weak.push(item);
    });
    rep.ratios[scheme] = r;
  });
  rep.ok = rep.weak.length === 0;
  return rep;
}
// 模型返回的文本 → 主题 spec。
// 与客户端 src/10-themes.js 的 extractAiTheme 同源同规则：
// 只收真实存在的 anchor 与 #rrggbb，模型编出来的 key 丢掉并记在 dropped。
// 至少 4 个锚点才算有效（与客户端一致）。
export function parseThemeSpec(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let obj = null;
  try { obj = JSON.parse(s.slice(start, end + 1)); } catch (e) { return null; }
  if (!obj || typeof obj !== 'object') return null;
  const allowed = new Set([
    '--dsw-alias-bg-base',
    '--dsw-alias-label-primary',
    '--dsw-alias-border-l1',
    '--dsw-alias-brand-primary',
    '--dsw-alias-trajectory-accent',
    '--dsw-alias-state-error-primary',
    '--dsw-alias-state-warn-primary',
    '--dsw-alias-state-success-primary',
  ]);
  const pickAnchors = (o) => {
    const out = {};
    const src = o && typeof o === 'object' ? o : {};
    Object.keys(src).forEach((k) => {
      if (!allowed.has(k)) return;
      const v = src[k];
      if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim())) out[k] = v.trim().toLowerCase();
    });
    return out;
  };
  const EXTRA_RE = /^--dsw-(alias|specific)-[a-z0-9-]+$/;
  const MAX_EXTRA = 4;
  // 少量覆盖：锚点之外的 alias/specific 键在派生之后写入（见客户端 applyOverrides）。
  // 只收 4 个：给多了模型就会开始「手挑颜色」，把派生的层次与对比度保证绕过去。
  const pickExtras = (o, anchors) => {
    const out = {};
    const src = o && typeof o === 'object' ? o : {};
    Object.keys(src).forEach((k) => {
      if (Object.keys(out).length >= MAX_EXTRA) return;
      if (allowed.has(k) || anchors[k]) return;
      if (!EXTRA_RE.test(k)) return;
      const v = src[k];
      if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim())) out[k] = v.trim().toLowerCase();
    });
    return out;
  };
  const light = pickAnchors(obj.light);
  if (Object.keys(light).length < 4) return null;
  Object.assign(light, pickExtras(obj.light, light));
  // 深色是显式的一套锚点；不足 4 个就当作没给，由客户端退回 autoDark 反推。
  const darkSrc = pickAnchors(obj.dark);
  const darkOk = Object.keys(darkSrc).length >= 4;
  if (darkOk) Object.assign(darkSrc, pickExtras(obj.dark, darkSrc));
  const font = obj.font && typeof obj.font === 'object' ? obj.font : {};
  const spec = {
    label: typeof obj.label === 'string' && obj.label.trim() ? obj.label.trim().slice(0, 24) : 'AI 主题',
    light: light,
    dark: darkOk ? darkSrc : {},
    font: { body: typeof font.body === 'string' ? font.body : '', chat: typeof font.chat === 'string' ? font.chat : '' },
    radiusScale: typeof obj.radiusScale === 'number' ? Math.max(0, Math.min(3, obj.radiusScale)) : 1,
    dropped: Object.keys(obj.light || {}).filter((k) => !light[k]),
  };
  // R-07：解析完立刻体检并就地修正锚点。报告只放计数与比值（detail 留给排障），
  // 因为 toOutput 的 schema 是 additionalProperties:false，字段一旦进 schema 就改不动了。
  const gate = zrAnchorGate(spec);
  spec.gate = { ok: gate.ok, fixes: gate.fixes.length, weak: gate.weak.length, ratios: gate.ratios, detail: gate.fixes };
  return spec;
}

// 走宿主 llm.stream 生成主题。
// 调用方式照抄 dsh-pet（已生产验证）：高层入口 llm.stream()，chunk 取 text-delta。
// 注意不要用 prepareCall：那是 adapter 层的接缝，dispatch 校验会拒绝插件直接调用。
// 留空 provider/model 会得到 NO_ADAPTER（宿主不实现「跟随当前路由」），回落一次账号路由。
export async function generateThemeSpec(ctx, prompt, opts) {
  const o = opts || {};
  const text = String(prompt == null ? '' : prompt).trim().slice(0, 4000);
  if (!text) throw new Error('empty-prompt');
  let llm = null;
  try { llm = typeof ctx.get === 'function' ? ctx.get('llm') : null; } catch (e) { llm = null; }
  if (!llm || typeof llm.stream !== 'function') throw new Error('llm-unavailable');

  const route = {};
  if (typeof o.provider === 'string' && o.provider.trim()) route.provider = o.provider.trim();
  if (typeof o.model === 'string' && o.model.trim()) route.model = o.model.trim();

  const ac = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => { try { if (ac) ac.abort(); } catch (e) { /* ignore */ } }, 60000);
  const consume = async (r) => {
    const stream = llm.stream(Object.assign({}, r, {
      system: THEME_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: [{ type: 'text', text: text }] }],
      maxTokens: 1500,
      temperature: 0.7,
      signal: ac ? ac.signal : undefined,
    }));
    let out = '';
    let fin = null;
    for await (const chunk of stream) {
      if (chunk && chunk.type === 'finish') fin = chunk.reason || chunk;
      if (chunk && chunk.type === 'text-delta' && typeof chunk.text === 'string') out += chunk.text;
    }
    return { out, fin };
  };
  try {
    let ran = await consume(route);
    let body = ran.out;
    let fin = ran.fin;
    if (!body && fin && fin.kind === 'error' && fin.failure && fin.failure.code === 'NO_ADAPTER'
        && !route.provider && !route.model) {
      // 用 deepseek-account（账号登录）而不是 deepseek-official（需要 DEEPSEEK_API_KEY）。
      ran = await consume({ provider: 'deepseek-account', model: 'deepseek-flash' });
      body = ran.out;
      fin = ran.fin;
    }
    const spec = parseThemeSpec(body);
    if (!spec) {
      const code = fin && fin.kind === 'error' && fin.failure ? fin.failure.code : 'bad-json';
      throw new Error('theme-parse-failed:' + code);
    }
    return { spec, finish: fin };
  } finally {
    clearTimeout(timer);
  }
}
