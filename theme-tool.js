// dsh-zhuoer-theme —— 对话里的主题生成工具
// 场景：用户在 DSH 对话框说「给我一套赛博朋克配色」，
// 模型识别意图后调用本工具 → 返回主题 spec → 对话流里出现色卡卡片 →
// 用户点「应用」才真正写入并生效。
//
// 关键约束（宿主契约，从 app.asar 取证）：
//   1. ctx.tools.register 接受裸定义对象，不必依赖 @deepseek-ai/dsh-tools 的 defineTool
//      —— 那个包不在插件的依赖面里，引用会直接加载失败。
//   2. output 是必需项：{ schema, render, presentationMeta? }。
//      缺 output.render 会抛 must declare output，此时 toolsReady=true 但 registered=[]，
//      只看前者会误判成功。
//   3. presentationMeta 是把结构化数据送进客户端卡片视图的唯一通道。
//   4. schema 的 type 只能是单个字符串；additionalProperties 只能是布尔。
//   5. ctx.<service> 是 Proxy，未 inject 时直接访问会抛穿整个 apply()，
//      插件实例创建失败、工具静默消失，而 plugin list 一切正常。
//   6. **取服务必须用注入回调给的那个 ctx**（injected.get(...)），
//      用外层 ctx.get() 会拿不到——0.6.25 首次落地就栽在这里，工具静默没注册。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { generateThemeSpec } from './theme-gen.js';

export const TOOL_NAME = 'zhuoer_theme_generate';

const DESCRIPTION = [
  'Generate a DSH custom theme (color anchors, fonts, corner radius) from a style description.',
  'Use this when the user asks for a theme, palette, color scheme, or color style for DSH',
  '(for example "give me a cyberpunk palette", "make a retro terminal theme").',
  'STEP 1 - ASK FIRST: before calling this tool, ask the user one direct question - do they want a subtle background texture?',
  'Do not decide it for them and do not skip the question.',
  'STEP 2 - FOLLOW THE ANSWER: if yes, generate TWO textures with whatever image capability you have',
  '(one dark, one light - a single dark image looks muddy under a light palette), save both locally,',
  'then pass their paths as texturePath / texturePathLight with texture="want".',
  'If the user says no, pass texture="no" and attach nothing.',
  'House texture look: barely-there line work on a near-flat base - not a photograph, not busy.',
  'Also ask which MATERIAL: a pure line-art SVG (stays sharp at any resolution, a few KB, exact stroke colours)',
  'or a raster bitmap (paper grain, grain texture, hand-drawn brush feel). Pass the answer as textureMode.',
  'Raster must be at least 1600 px wide (3200x2000 is the calibrated size) - narrow ones are rejected because cover-scaling turns their grain into blurry blotches.',
  'SVG must be pure line art: needs a viewBox and must not contain script, foreignObject, event handlers, external references, embedded images or filters (64 KiB max).',
  'The result is NOT applied automatically: it is shown as a preview card in the chat,',
  'and only takes effect after the user confirms it there.',
  'It returns BOTH a light palette and an explicit dark palette, so light and dark mode each look right.',
  'Prefer this over hand-picking hex colors when the user wants a whole theme.',
].join(' ');

// output.schema 是**标准 JSON Schema**，不是 parameters 那套 DSH 方言。
// 必填只能写成顶层 required: ['a','b'] 数组；属性里写 required: true 会被宿主拒收：
//   unsupported JSON schema: schema.properties.label.required is not supported on type "string"
// —— 0.6.25 第二次落地就栽在这里，靠 tool-status.json 的 message 才定位到。
// PTC（run_code）子调用的 tool/ptc-dispatch 事件既不携带 turn 也不携带 presentationMeta，
// 卡片只能把规格从渲染文本里读回来（image-gen 的 PTC_SUMMARY_PATTERN 是同一思路）。
const SPEC_MARKER = 'DSH_THEME_SPEC:';


// ---- 生成参数的白名单（R-08 / F-04 F-12）----
// 为什么要有白名单：模型可以随口给一个「Archivo Black」，而随包分发的只有 14 个西文族，
// 没打包的族会被浏览器静默回落成系统默认——风格落空，而且没有任何提示（实测过一次）。
// 字体名的唯一真源是 assets/fonts/README.md；scripts/test-gen-params.mjs 会拿它跟这张表对账。
export const ZR_FONT_FAMILIES = [
  'Geist', 'Space Grotesk', 'DM Sans', 'IBM Plex Sans', 'Atkinson Hyperlegible Next',
  'Instrument Sans', 'Inter', 'Manrope', 'JetBrains Mono', 'Geist Mono',
  'Fira Code', 'Lora', 'Fraunces', 'Source Serif 4',
];
// 风格预设 id：与客户端 STYLE_PRESETS 一一对应。圆角与字体档位的真源在客户端，
// 这里只做「这 id 存不存在」的校验，避免宿主侧再抄一份配方。
export const ZR_PRESET_IDS = ['glass', 'brutal', 'swiss', 'editorial', 'luxe', 'organic', 'morandi', 'paper', 'cyber', 'aurora', 'devterm', 'deepspace'];
const ZR_MONO_ALIAS = '__mono__';
const zrFontFamily = (v) => (v === ZR_MONO_ALIAS ? 'JetBrains Mono' : String(v || '').trim());

// 把工具的显式参数盖到模型给的 spec 上。纯函数，导出以便 scripts/test-gen-params.mjs 直接跑。
// 规则：显式参数优先；不合法不抛错（参数是选择题，不是命令），记一条 note 并给可用的兜底。
export function zrApplyParams(spec, args) {
  const out = Object.assign({}, spec || {});
  const a = args || {};
  const notes = [];
  if (typeof a.radiusScale === 'number' && isFinite(a.radiusScale)) {
    out.radiusScale = Math.max(0, Math.min(3, a.radiusScale));
  }
  const preset = String(a.preset || '').trim();
  if (preset) {
    if (ZR_PRESET_IDS.indexOf(preset) !== -1) out.preset = preset;
    else notes.push('preset 不在内置 12 套里，已忽略：' + preset);
  }
  // R-10：底纹强度档位——只在「确实要底纹」时生效。
  // 语义是「给底纹让出亮度余量」：0 不动 / 1 压到明度 87.8%（实测压缩解除）/ 2 压到 82.4%（到上限）。
  // 不压深就等于白加一层几乎看不见的线：浅底明度 93~96% 时余量只有 20 上下。
  if (typeof a.textureWeight === 'number' && isFinite(a.textureWeight) && a.texture === 'want') {
    out.textureWeight = Math.max(0, Math.min(2, Math.round(a.textureWeight)));
  }
  const fontRaw = String(a.font || '').trim();
  if (fontRaw) {
    const fam = zrFontFamily(fontRaw);
    const font = Object.assign({ body: '', chat: '' }, out.font || {});
    if (ZR_FONT_FAMILIES.indexOf(fam) !== -1) {
      font.body = fam;
      // 只给了 body 没给 chat：聊天正文跟着走，否则中英正文会不同族。
      if (!font.chat) font.chat = fam;
    } else {
      // 兜底替换：换成随包分发的通用 UI 族，而不是让浏览器静默回落系统默认。
      notes.push('font 未随包分发，已替换为 Inter：' + fontRaw);
      font.body = 'Inter';
      if (!font.chat) font.chat = 'Inter';
    }
    out.font = font;
  }
  return { spec: out, notes: notes };
}

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['label', 'light', 'textureDecision'],
  properties: {
    label: { type: 'string' },
    textureDecision: { type: 'string' },
    light: { type: 'object', additionalProperties: true },
    // 显式深色锚点；缺失时不输出，客户端退回 autoDark 反推。
    dark: { type: 'object', additionalProperties: true },
    // font 的真实形状是 { body, chat } 两个字符串（theme-gen 归一化后保证）。
    // 声明成 additionalProperties:false 的空对象会让宿主在**输出校验**时拒收：
    //   "value.font.body" is not a declared property (additionalProperties: false)
    // —— 第三次实测就栽在这里，链路其余部分（注册/调用/LLM）当时已全通。
    font: {
      type: 'object',
      additionalProperties: false,
      properties: {
        body: { type: 'string' },
        chat: { type: 'string' },
      },
    },
    radiusScale: { type: 'number' },
    // R-08：显式指定的风格预设 id（圆角/字体的档位由客户端解析）。
    preset: { type: 'string' },
    // R-10：底纹强度档位（0/1/2），由客户端在写盘前把浅色底色压深。
    textureWeight: { type: 'number' },
    // R-07：生成路径的对比度体检报告（只有计数与是否通过）。
    // 为什么要进 schema：toOutput 只回声明过的键，不声明就等于把体检结果丢掉。
    contrastGate: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean' },
        fixes: { type: 'number' },
        weak: { type: 'number' },
      },
    },
    texture: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: {
        name: { type: 'string' },
        mime: { type: 'string' },
        bytes: { type: 'number' },
      },
    },
    textureLight: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: {
        name: { type: 'string' },
        mime: { type: 'string' },
        bytes: { type: 'number' },
      },
    },
    // 参考图（用于取色）：图片落在插件目录，由 /api/texture 回传给卡片本地取色。
    ref: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: {
        name: { type: 'string' },
        mime: { type: 'string' },
        bytes: { type: 'number' },
      },
    },
  },
};

// 只回 OUTPUT_SCHEMA 声明过的键，font 只留 body/chat。
// 输出校验是严格的（additionalProperties:false 拒收任何未声明键），
// 与其祈祷模型不越界，不如在返回处收口——返回值与 schema 从此不可能脱节。
function toOutput(spec, texture, textureLight, decision, ref) {
  const src = spec || {};
  const light = src.light && typeof src.light === 'object' ? src.light : {};
  const dark = src.dark && typeof src.dark === 'object' ? src.dark : {};
  const font = src.font && typeof src.font === 'object' ? src.font : {};
  const out = {
    label: String(src.label || 'AI 主题'),
    light: light,
    font: { body: String(font.body || ''), chat: String(font.chat || '') },
    textureDecision: decision === 'want' ? 'want' : 'no',
  };
  // 深色只有凑够 4 个锚点才下发，否则让它走反推，避免给出半套深色。
  if (Object.keys(dark).length >= 4) out.dark = dark;
  if (typeof src.radiusScale === 'number' && isFinite(src.radiusScale)) out.radiusScale = src.radiusScale;
  if (typeof src.preset === 'string' && src.preset) out.preset = src.preset;
  if (typeof src.textureWeight === 'number' && isFinite(src.textureWeight)) out.textureWeight = src.textureWeight;
  // 只有真的跑过体检才下发（缺省不加键：值为 undefined 会被宿主判成 non-lossless）。
  if (src.gate && typeof src.gate === 'object') {
    out.contrastGate = { ok: src.gate.ok === true, fixes: Number(src.gate.fixes) || 0, weak: Number(src.gate.weak) || 0 };
  }
  if (texture) out.texture = texture;
  if (textureLight) out.textureLight = textureLight;
  if (ref) out.ref = ref;
  return out;
}
// presentationMeta 必须整体可无损序列化：值为 undefined 的键会被宿主判成 non-lossless，
// 整条工具结果被拒收（0.6.24 就栽在这——没有底纹时 texture 是 undefined，却仍被无条件塞进 meta；
// 一次不带底纹的生成 100% 失败，而面板里的 AI 生成走 HTTP 不经过这里，所以看起来像是偶发）。
// 因此可选键只在有值时才加。
function toMeta(value) {
  const v = value || {};
  const meta = {
    kind: 'dsh-zhuoer-theme',
    label: String(v.label || 'AI 主题'),
    light: v.light || {},
    dark: v.dark || {},
    font: v.font || {},
    radiusScale: typeof v.radiusScale === 'number' ? v.radiusScale : 1,
  };
  meta.textureDecision = v.textureDecision === 'want' ? 'want' : 'no';
  if (v.texture) meta.texture = v.texture;
  if (v.textureLight) meta.textureLight = v.textureLight;
  if (v.ref) meta.ref = v.ref;
  if (v.preset) meta.preset = v.preset;
  if (typeof v.textureWeight === 'number') meta.textureWeight = v.textureWeight;
  if (v.contrastGate) meta.contrastGate = v.contrastGate;
  return meta;
}

// ---- 底纹（可选）----
// 通用插件不挑宿主：不调任何图片工具或厂商 API，只接收模型产出的本地图片路径。
// 图片落到插件自己的目录，由同源端点 /api/texture 回传给客户端再进 IndexedDB。
// 这样既不把 3 MiB 塞进工具结果（会撑爆 PTC 文本），也不依赖别的插件。
const TEXTURE_MAX = 3 * 1024 * 1024;

// 底纹最小宽度（R-11）：低于这个数就当场拒收，而不是收下再交给 CSS 去放大。
// 为什么是 1600：内置素材的现状就是 1600×997（assets/bg/*.webp 全部），
// 这条线的意思是「不得低于内置水平」。1000 宽的图铺满主栏要被 cover 放大近 3 倍，
// 用来压色带的 ±1 级颗粒会变成 3×3 的软块——用户看到的是「模糊色斑」，而界面不报任何错。
// 为什么放在执行期：靠工具描述约束模型等于没约束（R-13 的教训，schema 只校验形状）。
export const ZR_TEX_MIN_WIDTH = 1600;

// 矢量底纹（SVG）的上限：只收**纯线稿**，超了就拒。1–10 KB 是常态，64 KiB 留足余量，
// 同时挡住「把位图 base64 塞进 SVG」这种绕过方式。
export const ZR_SVG_MAX = 64 * 1024;

function looksSvg(buf) {
  const head = buf.toString('utf8', 0, Math.min(buf.length, 512)).replace(/^\uFEFF/, '').trimStart();
  return /^(?:<\?xml[\s\S]*?\?>\s*)?(?:<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(head);
}

// SVG 静态校验：**拒绝而不是清洗**。半坏的素材比没有素材更难查，所以每条都给出可读原因。
// 白名单式的「只允许这些」比黑名单更稳，但这里用黑名单 + 根元素/尺寸硬要求：
// 真正兜底的是 README 里那条不变量——SVG 只经 CSS url() / <img> 使用，永不内联进 DOM。
// 导出以便 scripts/test-svg-texture.mjs 直接跑（含"该红必须红"的反向用例）。
export function zrValidateSvg(text) {
  const s = String(text == null ? '' : text);
  const bytes = Buffer.byteLength(s, 'utf8');
  if (!s.trim()) return { ok: false, reason: 'empty' };
  if (bytes > ZR_SVG_MAX) return { ok: false, reason: 'too-large', bytes: bytes, max: ZR_SVG_MAX };
  const head = s.replace(/^\uFEFF/, '').trimStart();
  const rootAt = head.search(/<svg[\s>]/i);
  if (rootAt < 0) return { ok: false, reason: 'not-svg-root' };
  const before = head.slice(0, rootAt).trim();
  if (before && !/^(?:<\?xml[\s\S]*?\?>\s*<!DOCTYPE[^>]*>\s*$|<\?xml[\s\S]*?\?>\s*$|<!DOCTYPE[^>]*>\s*$)/i.test(before)) {
    return { ok: false, reason: 'junk-before-root' };
  }
  const rootEnd = head.indexOf('>', rootAt);
  const rootTag = rootEnd > 0 ? head.slice(rootAt, rootEnd + 1) : '';
  if (!/\bviewBox\s*=/i.test(rootTag) && !(/\bwidth\s*=/i.test(rootTag) && /\bheight\s*=/i.test(rootTag))) {
    return { ok: false, reason: 'no-viewbox' };
  }
  const bad = [
    [/<script\b/i, 'script'],
    [/<foreignObject\b/i, 'foreign-object'],
    [/<!ENTITY\b/i, 'entity'],
    [/\son[a-z]+\s*=/i, 'event-handler'],
    [/javascript:/i, 'javascript-url'],
    // 元素检查放在 href 检查之前：`<image href="data:...">` 的准确原因是"内嵌位图"，
    // 而不是笼统的"外部引用"——拒绝理由要能直接指导作者改。
    [/<(?:image|use)\b/i, 'embed-image'],
    [/(?:xlink:)?href\s*=\s*["']\s*(?:https?:|\/\/|data:)/i, 'external-ref'],
    [/<filter\b/i, 'filter-element'],
    [/\bfilter\s*=/i, 'filter-attr'],
    [/url\(\s*["']?\s*(?:https?:|\/\/)/i, 'external-url'],
    [/@import\b/i, 'css-import'],
  ];
  for (let i = 0; i < bad.length; i++) {
    if (bad[i][0].test(s)) return { ok: false, reason: bad[i][1] };
  }
  return { ok: true, bytes: bytes };
}

function sniffImage(buf) {
  if (!buf || buf.length < 12) return '';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (looksSvg(buf)) return 'image/svg+xml';
  return '';
}

// 只读文件头取宽高（零依赖，不解像素）：PNG 的 IHDR、JPEG 的 SOFn、WebP 的三种 chunk。
// 解码失败返回 null——判不了就当没有，门禁那边同理（不作「猜一个通过」）。
export function zrTextureSize(buf) {
  try {
    if (!buf || buf.length < 32) return null;
    if (buf[0] === 0x89 && buf[1] === 0x50) {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const m = buf[i + 1];
        if (m >= 0xc0 && m <= 0xc3) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
        const len = buf.readUInt16BE(i + 2);
        if (len < 2) { i++; continue; }
        i += 2 + len;
      }
      return null;
    }
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
      const t = buf.toString('ascii', 12, 16);
      if (t === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
      if (t === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
      if (t === 'VP8L') {
        const b = buf.readUInt32LE(21);
        return { w: 1 + (b & 0x3fff), h: 1 + ((b >>> 14) & 0x3fff) };
      }
    }
  } catch (e) { /* 头不完整 / 字段越界：当判不了 */ }
  return null;
}

// 返回 { name, mime, bytes }；不合规返回 null 或 { error }。
// opts.minWidth > 0 时额外要求宽度（底纹用；参考图不做这个要求）。
function stashTexture(srcPath, getDir, opts) {
  const minWidth = opts && Number(opts.minWidth) > 0 ? Number(opts.minWidth) : 0;
  if (typeof srcPath !== 'string' || !srcPath.trim()) return null;
  try {
    const p = srcPath.trim();
    const info = fs.statSync(p);
    // 下限 32 字节：合法的极简 SVG 可以不到 64 字节（`<svg viewBox="0 0 1 1"/>`）。
    // 真正的形态判断交给 sniffImage + zrValidateSvg，不靠文件大小猜。
    if (!info.isFile() || info.size < 32 || info.size > TEXTURE_MAX) return null;
    const buf = fs.readFileSync(p);
    const mime = sniffImage(buf);
    if (!mime) return null;
    if (mime === 'image/svg+xml') {
      // 矢量不走像素归一化（那会把矢量重编码回位图），改在入口做静态校验。
      const v = zrValidateSvg(buf.toString('utf8'));
      if (!v.ok) return { error: 'svg-' + v.reason, bytes: v.bytes, max: v.max };
    } else if (minWidth) {
      const size = zrTextureSize(buf);
      if (!size || size.w < minWidth) {
        return { error: 'too-small', w: size ? size.w : 0, h: size ? size.h : 0, need: minWidth };
      }
    }
    const ext = mime === 'image/png' ? 'png'
      : mime === 'image/webp' ? 'webp'
        : mime === 'image/svg+xml' ? 'svg' : 'jpg';
    const d = getDir();
    if (!d) return null;
    const name = crypto.randomBytes(8).toString('hex') + '.' + ext;
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, name), buf);
    return { name: name, mime: mime, bytes: info.size };
  } catch (e) {
    return null;
  }
}
// report 由 index.js 传入（落 plugin-status 同目录的 tool-status.json），
// 目的是让「工具到底注册上没有」这件事在磁盘上可查，而不是靠猜。
// 底纹成对校验（纯函数，导出以便无头测试 scripts/test-texture-pair.mjs）。
// 规则：texture='want' 时深色与浅色两张**缺一不可**。
// 为什么：客户端浅色路径缺图时会回落成「把深图反相当浅图用」（bgInvert 分支），
// 实测表现为浅色模式整体偏色 5~10 级——用户看到的是「主题颜色不对」，但没有任何报错。
// 与 R-13 同一个教训：靠工具描述约束模型等于没约束，要在执行期强制。
export function zrTexturePairCheck(args) {
  const decision = String((args && args.texture) || '').trim();
  if (decision !== 'want') return { ok: true, decision: decision, missing: [] };
  const hasDark = !!(args && typeof args.texturePath === 'string' && args.texturePath.trim());
  const hasLight = !!(args && typeof args.texturePathLight === 'string' && args.texturePathLight.trim());
  const missing = [];
  if (!hasDark) missing.push('texturePath');
  if (!hasLight) missing.push('texturePathLight');
  return { ok: missing.length === 0, decision: decision, missing: missing };
}
export function registerThemeTool(ctx, report, opts) {
  const say = (obj) => { try { if (typeof report === 'function') report(obj); } catch (e) { /* ignore */ } };
  let disposer = null;
  let done = false;

  const bind = (injected) => {
    if (done) return;
    // 6：必须从注入回调给的 ctx 取服务，外层 ctx.get 拿不到。
    let tools = null;
    try { tools = injected && typeof injected.get === 'function' ? injected.get('tools') : null; } catch (e) { tools = null; }
    if (!tools) { try { tools = ctx.get('tools'); } catch (e) { tools = null; } }
    if (!tools || typeof tools.register !== 'function') {
      say({ phase: 'tool-unavailable', hasInjected: Boolean(injected), hasTools: Boolean(tools) });
      return;
    }
    // 兜底：output.schema 过严时（宿主 raw 注册路径会原样做 JSON Schema 校验），
    // 退回最小 schema 也要把工具注册上——schema 只用于参数/结果校验，丢掉 properties
    // 不会影响 render / presentationMeta，卡片照常出。
    const textureDir = () => { try { return opts && typeof opts.texturesDir === 'function' ? opts.texturesDir() : ''; } catch (e) { return ''; } };
    const attempt = (schema) => tools.register({
      name: TOOL_NAME,
      description: DESCRIPTION,
      parameters: {
        style: {
          type: 'string',
          required: true,
          description: 'Style description in the user\'s language, e.g. "cyberpunk, dark purple, neon cyan accents".',
        },
        texture: {
          type: 'string',
          required: true,
          description: 'Whether the user wants a background texture. Ask the user ONE direct question first, then pass \'want\' or \'no\'. \'want\' requires BOTH texturePath (dark) and texturePathLight (light) - one alone is rejected.',
        },
        name: {
          type: 'string',
          description: 'Short theme name (4-10 characters) summarizing the style. Omit to let the model choose one.',
        },
        // R-08：形状与字体不该只靠提示词说服模型。三个参数缺省时行为与以前完全一致。
        radiusScale: {
          type: 'number',
          description: 'Corner radius scale 0-3 (0 = square/terminal, 1 = default, 2 = soft/glassy). Overrides whatever the model picked. Omit to keep the model value.',
        },
        preset: {
          type: 'string',
          description: 'Built-in style preset id, one of: glass, brutal, swiss, editorial, luxe, organic, morandi, paper, cyber, aurora, devterm, deepspace. Sets radius/font defaults on the client when the model did not. Omit for none.',
        },
        textureWeight: {
          type: 'number',
          description: 'Texture depth 0-2, only meaningful with texture=want: 0 = leave the light base as chosen, 1 = press it to lightness 87.8% so the texture is not compressed away (+57% visibility), 2 = press to 82.4% (the ceiling). Omit for 0.',
        },
        font: {
          type: 'string',
          description: 'Body font family, must be one the plugin ships: Geist, Space Grotesk, DM Sans, IBM Plex Sans, Atkinson Hyperlegible Next, Instrument Sans, Inter, Manrope, JetBrains Mono, Geist Mono, Fira Code, Lora, Fraunces, Source Serif 4 (or __mono__). Unlisted names are rejected and replaced with Inter. Omit to keep the model value.',
        },
        texturePath: {
          type: 'string',
          description: 'Absolute local path to the DARK background texture. Raster: JPEG/PNG/WebP, <=3 MiB, at least 1600 px wide (3200x2000 is the calibrated size; narrower images are rejected because cover-scaling them turns grain into blurry blotches). Vector: a pure line-art SVG (<=64 KiB, needs a viewBox, no script/foreignObject/event handlers/external refs/embedded images/filters) - it stays sharp at any resolution. Required when texture is want, together with texturePathLight.',
        },
        imagePath: {
          type: 'string',
          description: 'Optional absolute path to a REFERENCE IMAGE for colour sampling (photo, screenshot, anything). When given, the anchors are replaced by colours sampled from that image locally (same algorithm as the panel image picker), so the theme really matches the picture instead of the model\'s guess. Accepts PNG/JPEG/WebP up to 3 MiB.',
        },
        // 生成前先问用户要哪一种底纹（矢量线稿 / 位图质感）。缺省 ask = 必须问。
        // 指定后做一致性校验：选了 vector 却给位图（或反过来）直接报错，避免"问了等于没问"。
        textureMode: {
          type: 'string',
          description: 'Which material the user chose for the background texture. "vector" = a pure line-art SVG (sharp at any resolution, a few KB, exact stroke colours); "raster" = a generated bitmap (paper grain, grain texture, hand-drawn brush feel). Ask the user ONE question first ("矢量线稿还是位图质感？"), then pass their answer. Omit to accept whatever you were given.',
        },
        texturePathLight: {
          type: 'string',
          description: 'Absolute local path to the LIGHT-mode variant of that texture (light base, faint strokes). Required when texture is want, together with texturePath. Built-in themes ship two backgrounds because one dark image looks muddy under a light palette.',
        },
      },
      output: {
        schema: schema,
        render: (_args, value) => [{
          type: 'text',
          text: 'Theme "' + value.label + '" is ready. It is shown as a preview card below; '
            + 'tell the user it is ready and ask them to confirm there. Do not list the colors yourself. '
            + (value.textureDecision === 'want'
              ? 'A background texture is attached (dark + light).'
              : 'No background texture was added - tell the user they can reply "add a texture" if they want one.')
            // R-07：把体检结论说出来。修过了要说，压不到 4.5 也要说——不能悄悄改用户的颜色。
            + (value.contrastGate && value.contrastGate.fixes > 0
              ? ' Contrast check adjusted ' + value.contrastGate.fixes + ' anchor(s) that the model returned too low to read.'
              : '')
            + (value.contrastGate && value.contrastGate.weak > 0
              ? ' Warning: ' + value.contrastGate.weak + ' anchor(s) still fall short of 4.5:1 even at full black/white - tell the user the base color is too mid-gray.'
              : ''),
          }, {
            type: 'text',
            text: SPEC_MARKER + JSON.stringify(value),
        }],
        presentationMeta: (_args, value) => toMeta(value),
      },
      async execute(args) {
        const style = String((args && args.style) || '').trim();
        if (!style) throw new Error('style is required');
        const decision = String((args && args.texture) || '').trim();
        if (decision !== 'want' && decision !== 'no') {
          throw new Error('texture 必须是 want 或 no：动手前先问用户要不要底纹，再按回答传值。');
        }
        // R-04：底纹两张缺一不可（规则见 zrTexturePairCheck，导出以便无头测试）。
        const pair = zrTexturePairCheck(args);
        if (!pair.ok) {
          if (pair.missing.length === 2) {
            throw new Error('用户要底纹，但两张路径都没给（texturePath 深色 + texturePathLight 浅色，缺一不可）。先按风格生成两张底图，拿到本地路径再重试。');
          }
          if (pair.missing[0] === 'texturePath') {
            throw new Error('缺深色底纹路径 texturePath（浅色那张不能顶替：反相用会在浅色模式偏色）。先补一张深色底图再重试。');
          }
          throw new Error('缺浅色底纹路径 texturePathLight（深色那张不能顶替：深图铺在浅底上会发闷）。先补一张浅色底图再重试。');
        }
        // R-11：底纹太窄就当场拒。静默收下等于把「模糊色斑」直接送到用户眼前——
        // cover 会把 1000 宽放大到近 3 倍，压色带的颗粒变成软块，而界面一个字都不提示。
        // 位置刻意放在「调模型生成配色」之前：尺寸不合规时不该先烧一次模型额度再报错。
        const takeTexture = (p, key) => {
          const st = stashTexture(p, textureDir, { minWidth: ZR_TEX_MIN_WIDTH });
          if (st && st.error === 'too-small') {
            throw new Error(key + ' 只有 ' + st.w + '×' + st.h + ' px，窄于 ' + st.need
              + ' 宽：铺满主栏时 cover 会把它放大成模糊色斑（用来压色带的颗粒会变成软块）。'
              + '请按至少 ' + st.need + '×1000 重画这两张底图（推荐 3200×2000）再重试。');
          }
          if (st && typeof st.error === 'string' && st.error.indexOf('svg-') === 0) {
            throw new Error(key + ' 的 SVG 没通过校验（' + st.error.slice(4) + '）：只收纯线稿矢量——'
              + '必须有 viewBox，且不能带 script / foreignObject / 事件属性 / 外部引用 / 内嵌位图 / 滤镜；'
              + '上限 64 KiB。位图（PNG/JPEG/WebP）走另一个通道，不受这条限制。');
          }
          if (st && st.error) throw new Error(key + ' 无法作为底纹：' + st.error);
          if (!st) throw new Error(key + ' 不是可读的图片（PNG/JPEG/WebP/SVG，位图 ≤3 MiB）：' + p);
          return st;
        };
        const texDark = decision === 'want' ? takeTexture(args && args.texturePath, 'texturePath') : null;
        const texLight = decision === 'want' ? takeTexture(args && args.texturePathLight, 'texturePathLight') : null;
        // P1：用户选了哪一种，就得给哪一种。问了等于没问是最难查的一类"看起来都正常"。
        const mode = String((args && args.textureMode) || '').trim().toLowerCase();
        if (mode === 'vector' || mode === 'raster') {
          for (const t of [texDark, texLight]) {
            if (!t) continue;
            const isVec = t.mime === 'image/svg+xml';
            if (mode === 'vector' && !isVec) throw new Error('用户选了矢量线稿，但底纹是位图（' + t.mime + '）：请产纯线稿 SVG 再重试，或改传 textureMode="raster"。');
            if (mode === 'raster' && isVec) throw new Error('用户选了位图质感，但底纹是 SVG：请改传位图（PNG/JPEG/WebP），或改传 textureMode="vector"。');
          }
        } else if (mode && mode !== 'ask') {
          say({ phase: 'texture-mode-ignored', value: mode });
        }
        const prompt = args && typeof args.name === 'string' && args.name.trim()
          ? style + '\n主题名：' + args.name.trim()
          : style;
        // §9.1：解析失败时把模型的原始输出留下来（只进工具自己的 tool-status.json，不进对话）。
        // 不这么做的话，「散文 / 被 maxTokens 截断 / body 为空」三种情况在排障时长得一模一样。
        let gen = null;
        try {
          gen = await generateThemeSpec(ctx, prompt, {});
        } catch (e) {
          say({
            phase: 'gen-parse-failed',
            reason: e && e.reason,
            bytes: e && e.bytes,
            empty: !!(e && e.empty),
            finish: (e && e.finish) || null,
            raw: typeof (e && e.raw) === 'string' ? e.raw : '',
          });
          throw e;
        }
        if (gen.retried) say({ phase: 'gen-retried' });
        // R-08：显式参数盖在模型结果之上（缺省时 zrApplyParams 不动任何键）。
        const applied = zrApplyParams(gen.spec, args);
        const spec = applied.spec;
        if (applied.notes.length) say({ phase: 'params-ignored', notes: applied.notes });
        // 参考图：只落到插件目录，由 /api/texture 回传客户端做真实取色。
        const refPath = String((args && args.imagePath) || '').trim();
        const ref = refPath ? stashTexture(refPath, textureDir) : null;
        if (refPath && !ref) throw new Error('imagePath 不是可读的图片（PNG/JPEG/WebP，≤3 MiB）：' + refPath);
        return toOutput(spec, texDark, texLight, decision, ref);
      },
    });

    try {
      disposer = attempt(OUTPUT_SCHEMA);
      done = true;
      say({ phase: 'tool-registered', tool: TOOL_NAME, schema: 'full' });
    } catch (e) {
      // 第一次失败：退回最小 schema 再试一次（不留半死状态）
      try {
        disposer = attempt({ type: 'object' });
        done = true;
        say({ phase: 'tool-registered', tool: TOOL_NAME, schema: 'minimal', firstError: String((e && e.message) || e).slice(0, 300) });
      } catch (e2) {
        say({ phase: 'tool-register-failed', message: String((e && e.message) || e).slice(0, 200), retryError: String((e2 && e2.message) || e2).slice(0, 200) });
      }
    }
  };

  say({ phase: 'tool-boot', hasInject: typeof ctx.inject === 'function', hasEffect: typeof ctx.effect === 'function' });
  try {
    if (typeof ctx.inject === 'function') {
      const boot = () => { ctx.inject(['tools'], (injected) => { try { bind(injected); } catch (e) { say({ phase: 'tool-inject-cb-threw', message: String((e && e.message) || e).slice(0, 200) }); } }); };
      if (typeof ctx.effect === 'function') ctx.effect(boot); else boot();
    } else {
      bind(null);
    }
  } catch (e) {
    say({ phase: 'tool-inject-failed', message: String((e && e.message) || e).slice(0, 200) });
  }
  return function dispose() {
    if (typeof disposer === 'function') { try { disposer(); } catch (e) { /* ignore */ } }
    disposer = null; done = false;
  };
}
