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
import { generateThemeSpec } from './theme-gen.js';

export const TOOL_NAME = 'zhuoer_theme_generate';

const DESCRIPTION = [
  'Generate a DSH custom theme (color anchors, fonts, corner radius) from a style description.',
  'Use this when the user asks for a theme, palette, color scheme, or color style for DSH',
  '(for example "give me a cyberpunk palette", "make a retro terminal theme").',
  'The result is NOT applied automatically: it is shown as a preview card in the chat,',
  'and only takes effect after the user confirms it there.',
  'Prefer this over hand-picking hex colors when the user wants a whole theme.',
].join(' ');

// output.schema 是**标准 JSON Schema**，不是 parameters 那套 DSH 方言。
// 必填只能写成顶层 required: ['a','b'] 数组；属性里写 required: true 会被宿主拒收：
//   unsupported JSON schema: schema.properties.label.required is not supported on type "string"
// —— 0.6.25 第二次落地就栽在这里，靠 tool-status.json 的 message 才定位到。
// PTC（run_code）子调用的 tool/ptc-dispatch 事件既不携带 turn 也不携带 presentationMeta，
// 卡片只能把规格从渲染文本里读回来（image-gen 的 PTC_SUMMARY_PATTERN 是同一思路）。
const SPEC_MARKER = 'DSH_THEME_SPEC:';

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['label', 'light'],
  properties: {
    label: { type: 'string' },
    light: { type: 'object', additionalProperties: true },
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
  },
};

// 只回 OUTPUT_SCHEMA 声明过的键，font 只留 body/chat。
// 输出校验是严格的（additionalProperties:false 拒收任何未声明键），
// 与其祈祷模型不越界，不如在返回处收口——返回值与 schema 从此不可能脱节。
function toOutput(spec) {
  const src = spec || {};
  const light = src.light && typeof src.light === 'object' ? src.light : {};
  const font = src.font && typeof src.font === 'object' ? src.font : {};
  const out = {
    label: String(src.label || 'AI 主题'),
    light: light,
    font: { body: String(font.body || ''), chat: String(font.chat || '') },
  };
  if (typeof src.radiusScale === 'number' && isFinite(src.radiusScale)) out.radiusScale = src.radiusScale;
  return out;
}

// report 由 index.js 传入（落 plugin-status 同目录的 tool-status.json），
// 目的是让「工具到底注册上没有」这件事在磁盘上可查，而不是靠猜。
export function registerThemeTool(ctx, report) {
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
    const attempt = (schema) => tools.register({
      name: TOOL_NAME,
      description: DESCRIPTION,
      parameters: {
        style: {
          type: 'string',
          required: true,
          description: 'Style description in the user\'s language, e.g. "cyberpunk, dark purple, neon cyan accents".',
        },
        name: {
          type: 'string',
          description: 'Short theme name (4-10 characters) summarizing the style. Omit to let the model choose one.',
        },
      },
      output: {
        schema: schema,
        render: (_args, value) => [{
          type: 'text',
          text: 'Theme "' + value.label + '" is ready. It is shown as a preview card below; '
            + 'tell the user it is ready and ask them to confirm there. Do not list the colors yourself.',
          }, {
            type: 'text',
            text: SPEC_MARKER + JSON.stringify(value),
        }],
        presentationMeta: (_args, value) => ({
          kind: 'dsh-zhuoer-theme',
          label: value.label,
          light: value.light,
          font: value.font || {},
          radiusScale: value.radiusScale,
        }),
      },
      async execute(args) {
        const style = String((args && args.style) || '').trim();
        if (!style) throw new Error('style is required');
        const prompt = args && typeof args.name === 'string' && args.name.trim()
          ? style + '\n主题名：' + args.name.trim()
          : style;
        const { spec } = await generateThemeSpec(ctx, prompt, {});
        return toOutput(spec);
      },
    });

    try {
      disposer = tools.register({
        name: TOOL_NAME,
        description: DESCRIPTION,
        parameters: {
          style: {
            type: 'string',
            required: true,
            description: 'Style description in the user\'s language, e.g. "cyberpunk, dark purple, neon cyan accents".',
          },
          name: {
            type: 'string',
            description: 'Short theme name (4-10 characters) summarizing the style. Omit to let the model choose one.',
          },
        },
        output: {
          schema: OUTPUT_SCHEMA,
          render: (_args, value) => [{
            type: 'text',
            text: 'Theme "' + value.label + '" is ready. It is shown as a preview card below; '
              + 'tell the user it is ready and ask them to confirm there. Do not list the colors yourself.',
            }, {
              type: 'text',
              text: SPEC_MARKER + JSON.stringify(value),
          }],
          presentationMeta: (_args, value) => ({
            kind: 'dsh-zhuoer-theme',
            label: value.label,
            light: value.light,
            font: value.font || {},
            radiusScale: value.radiusScale,
          }),
        },
        async execute(args) {
          const style = String((args && args.style) || '').trim();
          if (!style) throw new Error('style is required');
          const prompt = args && typeof args.name === 'string' && args.name.trim()
            ? style + '\n主题名：' + args.name.trim()
            : style;
          const { spec } = await generateThemeSpec(ctx, prompt, {});
          return toOutput(spec);
        },
      });
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
