import { registerThemeTool, TOOL_NAME } from '../theme-tool.js';

let fail = 0;
const ok = (cond, msg) => { if (!cond) { console.log('FAIL ' + msg); fail++; } else { console.log('OK   ' + msg); } };

// 复刻 cordis 语义：外层 ctx.get('tools') 拿不到，只有注入回调给的 ctx 能拿到。
function makeCtx(kind) {
  const registry = { defs: [], register(def) { this.defs.push(def); return () => {}; } };
  const inner = { get: (n) => (n === 'tools' ? registry : undefined) };
  const outer = {
    get: (n) => (kind === 'outer-only' ? (n === 'tools' ? registry : undefined) : undefined),
    inject: (deps, cb) => { cb(inner); },
    effect: (fn) => fn(),
  };
  return { ctx: outer, registry };
}

// 1) 标准情形：只能从注入 ctx 拿到服务
{
  const { ctx, registry } = makeCtx('nested');
  const reports = [];
  registerThemeTool(ctx, (o) => reports.push(o));
  ok(registry.defs.length === 1, '从注入 ctx 取到 tools 并注册（这是 0.6.25 首次失败点）');
  ok(registry.defs[0]?.name === TOOL_NAME, '注册的工具名正确');
  ok(reports.some((r) => r.phase === 'tool-registered'), '诊断记录 tool-registered');
}

// 2) 外层也能拿到时同样工作
{
  const { ctx, registry } = makeCtx('outer-only');
  registerThemeTool(ctx, () => {});
  ok(registry.defs.length === 1, '外层 ctx 可取时也注册成功');
}

// 3) 服务确实不存在：不抛、记录原因
{
  const reports = [];
  const ctx = { get: () => undefined, inject: (d, cb) => cb({ get: () => undefined }), effect: (fn) => fn() };
  let threw = false;
  try { registerThemeTool(ctx, (o) => reports.push(o)); } catch (e) { threw = true; }
  ok(!threw, 'tools 不可用时不抛异常（不能拖垮皮肤）');
  ok(reports.some((r) => r.phase === 'tool-unavailable'), '诊断记录 tool-unavailable');
}

// 4) 注册抛错也不拖垮
{
  const reports = [];
  const ctx = {
    get: () => undefined,
    inject: (d, cb) => cb({ get: () => ({ register() { throw new Error('boom'); } }) }),
    effect: (fn) => fn(),
  };
  let threw = false;
  try { registerThemeTool(ctx, (o) => reports.push(o)); } catch (e) { threw = true; }
  ok(!threw, 'register 抛错被吞掉');
  ok(reports.some((r) => r.phase === 'tool-register-failed'), '诊断记录 tool-register-failed');
}

// 5) 定义形状仍合规
{
  const { ctx, registry } = makeCtx('nested');
  registerThemeTool(ctx, () => {});
  const def = registry.defs[0];
  ok(def.output && typeof def.output.render === 'function', 'output.render 存在');
  ok(def.output.schema.type === 'object' && def.output.schema.additionalProperties === false, 'output.schema 形态合规');
  ok(typeof def.output.presentationMeta === 'function', 'presentationMeta 存在');
  const meta = def.output.presentationMeta({}, { label: 'X', light: {}, font: {}, radiusScale: 1 });
  ok(meta.kind === 'dsh-zhuoer-theme', 'meta.kind 正确');
}


// 6) output.schema 必须过宿主那套 JSON Schema 校验（首次失败就死在这）
{
  const { ctx, registry } = makeCtx('nested');
  registerThemeTool(ctx, () => {});
  const schema = registry.defs[0].output.schema;
  const problems = [];
  const walk = (node, path) => {
    if (!node || typeof node !== 'object') return;
    if (Object.prototype.hasOwnProperty.call(node, 'required')) {
      const r = node.required;
      const isArr = Array.isArray(r) && r.every((x) => typeof x === 'string');
      if (!isArr) problems.push(path + '.required 不是字符串数组');
    }
    if (typeof node.type !== 'string') problems.push(path + '.type 不是单个字符串');
    if (Object.prototype.hasOwnProperty.call(node, 'additionalProperties')
        && typeof node.additionalProperties !== 'boolean') problems.push(path + '.additionalProperties 不是布尔');
    for (const k of Object.keys(node.properties || {})) walk(node.properties[k], path + '.properties.' + k);
  };
  walk(schema, 'schema');
  ok(problems.length === 0, 'output.schema 合宿主校验规则' + (problems.length ? ' → ' + problems.join('; ') : ''));
  ok(Array.isArray(schema.required) && schema.required.includes('label') && schema.required.includes('light'), '必填写在顶层 required 数组里');
  ok(!Object.prototype.hasOwnProperty.call(schema.properties.label, 'required'), '属性节点不再带 required');
}

console.log(fail === 0 ? 'ALL_PASS' : 'FAILURES=' + fail);
process.exit(fail === 0 ? 0 : 1);