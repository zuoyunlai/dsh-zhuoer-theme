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
].join('\n');

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
  const light = pickAnchors(obj.light);
  if (Object.keys(light).length < 4) return null;
  // 深色是显式的一套锚点；不足 4 个就当作没给，由客户端退回 autoDark 反推。
  const darkSrc = pickAnchors(obj.dark);
  const darkOk = Object.keys(darkSrc).length >= 4;
  const font = obj.font && typeof obj.font === 'object' ? obj.font : {};
  return {
    label: typeof obj.label === 'string' && obj.label.trim() ? obj.label.trim().slice(0, 24) : 'AI 主题',
    light: light,
    dark: darkOk ? darkSrc : {},
    font: { body: typeof font.body === 'string' ? font.body : '', chat: typeof font.chat === 'string' ? font.chat : '' },
    radiusScale: typeof obj.radiusScale === 'number' ? Math.max(0, Math.min(3, obj.radiusScale)) : 1,
    dropped: Object.keys(obj.light || {}).filter((k) => !light[k]),
  };
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
