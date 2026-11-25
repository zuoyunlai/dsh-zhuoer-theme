// dsh-zhuoer-theme —— 宿主半边
// 纯客户端皮肤；这里只做两件事：落加载状态、提供一个自检端点把客户端侧的执行情况写回磁盘。

import fs from 'node:fs';
import path from 'node:path';

export const name = 'dsh-zhuoer-theme';

const VERSION = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
const STATUS_DIR = 'dsh-zhuoer-theme';
// 资源目录契约：url 是对外 URL 前缀，disk 是包内目录，ext 是要服务的扩展名。
// 唯一声明处 —— index.js 按它注册路由，scripts/verify-assets.mjs 按它对账。
// 改这里之前先看客户端请求的路径：客户端 URL 必须等于 url + 文件名。
const ASSET_DIRS = [
  { url: '/dsh-zhuoer-theme/assets/bg/', disk: 'assets/bg/', ext: '.webp', type: 'image/webp', maxAge: 86400 },
  { url: '/dsh-zhuoer-theme/assets/fonts/', disk: 'assets/fonts/', ext: '.woff2', type: 'font/woff2', maxAge: 31536000 },
  // 品牌位 logo：svg 是纯文本、只有几 KB，长缓存即可（换图要发新版本，不支持运行时替换）
  { url: '/dsh-zhuoer-theme/assets/logo/', disk: 'assets/logo/', ext: '.svg', type: 'image/svg+xml', maxAge: 31536000 },
];

// 来源校验：这两个端点只该由插件自己的客户端调用。
// 浏览器发起的跨站请求带不上自定义头（会先触发预检，宿主不应答），所以自定义头是硬门槛；
// 同源请求若被宿主中间层剥掉了头，再用 Referer/Origin 的 host 比对兜底。
function isOwnClient(req) {
  try {
    const h = (req && req.headers) || {};
    if (String(h['x-zhuoer-client'] || '') === '1') return true;
    const ref = String(h.referer || h.origin || '');
    const host = String(h.host || '');
    if (!ref || !host) return false;
    try { return new URL(ref).host === host; } catch (e) { return false; }
  } catch (e) {
    return false;
  }
}

function rejectForeign(res) {
  try { res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' }); res.end('{"error":"forbidden"}'); } catch (e) { /* ignore */ }
}

function dshHome() {
  const env = process.env.DSH_HOME;
  if (env && env.trim()) return env.trim();
  const home = process.env.USERPROFILE || process.env.HOME || '.';
  return path.join(home, '.dsh');
}

function dir() {
  return path.join(dshHome(), STATUS_DIR);
}

function writeJson(name, data) {
  try {
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(path.join(dir(), name), JSON.stringify(data, null, 2) + '\n', 'utf8');
  } catch (e) { /* 诊断失败不影响插件 */ }
}

export function apply(ctx, config) {
  writeJson('plugin-status.json', {
    version: VERSION,
    phase: 'apply-ok',
    node: process.version,
    at: new Date().toISOString(),
    configKeys: config && typeof config === 'object' ? Object.keys(config) : [],
  });

  // 客户端自检回传：client.js 在同源页面里 POST 过来，落盘供事后核对。
  const mount = (injected) => {
    let ws = null;
    try { ws = typeof injected.get === 'function' ? injected.get('webServer') : null; } catch (e) { return; }
    if (!ws || typeof ws.register !== 'function') return;
    try {
      ws.register({
        kind: 'exact',
        path: '/dsh-zhuoer-theme/api/report',
        handler: (req, res) => {
          if (!isOwnClient(req)) return rejectForeign(res);
          let body = '';
          try {
            req.on('data', (c) => { body += c; if (body.length > 200000) body = body.slice(0, 200000); });
            req.on('end', () => {
              let parsed = null;
              try { parsed = JSON.parse(body); } catch (e) { parsed = { raw: String(body).slice(0, 2000) }; }
              // 追加 JSONL：保留整条执行链，不被后一条覆盖
              try {
                fs.mkdirSync(dir(), { recursive: true });
                // 日志上限 2 MiB：超过就轮转一次。之前无上限追加，实测涨到 74 MB。
                const logPath = path.join(dir(), 'client-report.log');
                try {
                  const st = fs.statSync(logPath);
                  if (st.size > 2 * 1024 * 1024) fs.renameSync(logPath, logPath + '.1');
                } catch (e) { /* 文件不存在就跳过 */ }
                fs.appendFileSync(logPath, JSON.stringify(Object.assign({ receivedAt: new Date().toISOString() }, parsed)) + '\n', 'utf8');
              } catch (e) { /* ignore */ }
              res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
              res.end('{"ok":true}');
            });
          } catch (e) {
            try { res.writeHead(500); res.end('{}'); } catch (e2) { /* ignore */ }
          }
        },
      });
      // ---- AI 生成主题 ----
      // 客户端 POST { prompt } → 用宿主当前配置的模型生成主题 JSON。
      // 调用方式照抄 dsh-pet（已生产验证）：走高层入口 llm.stream()，chunk 取 text-delta。
      // 注意不要用 prepareCall：那是 adapter 层的接缝，dispatch 校验会拒绝插件直接调用。
      try {
        ws.register({
          kind: 'exact',
          path: '/dsh-zhuoer-theme/api/gen-theme',
          // handler 必须同步返回：宿主在 handler 返回后才把 res 置为可写，
          // 所以在 async handler 里 await 之后再 res.end() 会写不出去（客户端收到空响应）。
          // 做法：同步返回，所有逻辑丢进立即执行的 IIFE。
          handler: (req, res) => {
            if (!isOwnClient(req)) return rejectForeign(res);
            void (async () => {
            // 入口诊断：用来区分「handler 没被调用」和「handler 调用了但响应写不出去」。
            // 只写元数据，绝不写 prompt：url 的 query string 里带着用户输入的原文，
            // 落盘就等于在用户机器上留了一份用户数据副本，与 README 的隐私说明不符。
            // 需要排查时开 DSH_ZHUOER_DEBUG=1（服务端）或 localStorage debug 键（客户端）。
            if (process.env.DSH_ZHUOER_DEBUG === '1') {
              const u0 = new URL(req.url || '/', 'http://localhost');
              writeJson('gen-request.json', {
                at: new Date().toISOString(),
                method: req.method, path: u0.pathname,
                hasPrompt: u0.searchParams.has('prompt'),
                promptLength: (u0.searchParams.get('prompt') || '').length,
                readableEnded: req.readableEnded, complete: req.complete,
                destroyed: req.destroyed, headers: req.headers && {
                  'content-type': req.headers['content-type'],
                  'content-length': req.headers['content-length'],
                  'transfer-encoding': req.headers['transfer-encoding'],
                },
              });
            }
            // 实测：POST body 在 handler 里读不到（宿主提前截走/消费），
            // 一度表现为客户端拿到空响应。改为从 query string 取参数，绕开请求体。
            let rawBody = '';
            try {
              const u = new URL(req.url || '/', 'http://localhost');
              const qp = u.searchParams.get('prompt');
              if (qp) rawBody = JSON.stringify({ prompt: qp, provider: u.searchParams.get('provider') || undefined, model: u.searchParams.get('model') || undefined });
            } catch (e) { rawBody = ''; }
            let replied = false;
            const send = (code, obj) => {
              if (replied) return;
              replied = true;
              try {
                res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify(obj));
              } catch (e) { /* ignore */ }
            };
            // 这些状态在 try 之外也要可见：成功分支的 send(200) 位于 catch 之后
            let text = '';
            let finish = null;
            const chunksSeen = [];
            const route = {};
            // 任何未捕获异常都必须回一个 JSON，否则客户端只会看到空响应
            try {
            if (rawBody.length > 200000) { send(413, { error: 'body-too-large' }); return; }
            const body = rawBody;
            let payload = {};
            try { payload = JSON.parse(body || '{}'); } catch (e) { send(400, { error: 'bad-json' }); return; }
            const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim().slice(0, 4000) : '';
            if (!prompt) { send(400, { error: 'empty-prompt' }); return; }
            let llm = null;
            try { llm = typeof ctx.get === 'function' ? ctx.get('llm') : null; } catch (e) { llm = null; }
            if (!llm || typeof llm.stream !== 'function') { send(503, { error: 'llm-unavailable' }); return; }

            const system = [
              '你是 DSH 主题生成器。把用户描述转成一套浅色主题锚点。',
              '只输出 JSON，不要解释、不要 markdown 代码块、不要多余文字。',
              '格式：{"label":"主题名","light":{...7个key...},"font":{"body":"","chat":""},"radiusScale":1}',
              'label 是给用户看的主题名：4–10 个汉字，概括风格气质（例：落日晚砂、青苔石阶、旧书暖灯），',
              '不要引号、编号、标点，也不要带「主题」二字；它会直接预填到名称框。',
              'light 的 8 个 key 必须逐字使用：--dsw-alias-bg-base、--dsw-alias-label-primary、--dsw-alias-border-l1、--dsw-alias-brand-primary、--dsw-alias-trajectory-accent、--dsw-alias-state-error-primary、--dsw-alias-state-warn-primary、--dsw-alias-state-success-primary',
              '规则：每个色值必须是 #rrggbb；label-primary 与 bg-base 对比度 ≥ 4.5；',
              'brand-primary 与 trajectory-accent 要来自同一色相族或成互补关系；',
              '复古/终端风格：radiusScale 设 0、font.chat 设 "__mono__"；扁平/极简：radiusScale 设 0；',
              '不要输出深色，深色由系统自动反推。',
            ].join('\n');

            const ac = typeof AbortController === 'function' ? new AbortController() : null;
            const timer = setTimeout(() => { try { if (ac) ac.abort(); } catch (e) { /* ignore */ } }, 60000);
            if (typeof payload.provider === 'string' && payload.provider.trim()) route.provider = payload.provider.trim();
            if (typeof payload.model === 'string' && payload.model.trim()) route.model = payload.model.trim();
            // content 必须是块数组，不能是字符串——传字符串会在适配器里炸 content.some is not a function。
            const messages = [{
              role: 'user',
              content: [{ type: 'text', text: prompt }],
            }];
            const consume = async (rt) => {
              let out = '';
              let fin = null;
              const stream = llm.stream(Object.assign({}, rt, {
                system,
                messages,
                maxTokens: 1500,
                temperature: 0.7,
                signal: ac ? ac.signal : undefined,
              }));
              for await (const chunk of stream) {
                if (chunksSeen.length < 6 && chunk && chunk.type) chunksSeen.push(chunk.type);
                if (chunk && chunk.type === 'finish') fin = chunk.reason || chunk;
                if (chunk && chunk.type === 'text-delta' && typeof chunk.text === 'string') out += chunk.text;
              }
              return { out, fin };
            };
            try {
              let ran = await consume(route);
              text = ran.out;
              finish = ran.fin;
              // 留空路由会得到 NO_ADAPTER（宿主不实现"跟随当前路由"）。此时回落一次官方路由。
              if (!text && finish && finish.kind === 'error' &&
                  finish.failure && finish.failure.code === 'NO_ADAPTER' &&
                  !route.provider && !route.model) {
                // 用 deepseek-account（账号登录）而不是 deepseek-official（需要 DEEPSEEK_API_KEY）。
                // 用户大多是账号登录，走 official 会直接 MISSING_CREDENTIAL。
                ran = await consume({ provider: 'deepseek-account', model: 'deepseek-flash' });
                text = ran.out;
                finish = ran.fin;
              }
            } catch (e) {
              clearTimeout(timer);
              send(502, { error: 'llm-failed', message: String((e && e.message) || e).slice(0, 300), chunksSeen });
              return;
            }
            clearTimeout(timer);
            } catch (outer) {
              send(500, { error: 'internal', message: String((outer && outer.message) || outer).slice(0, 300) });
              return;
            }
            // 把 finish 原因带回去：留空路由时常见 NO_ADAPTER，客户端据此决定是否提示用户指定模型
            let finishBrief = null;
            try {
              finishBrief = finish ? {
                kind: finish.kind,
                code: finish.failure && finish.failure.code,
                message: finish.message || (finish.failure && finish.failure.message),
              } : null;
            } catch (e) { finishBrief = 'unserializable'; }
            send(200, { ok: true, text, chars: text.length, finish: finishBrief, chunksSeen, route });
            })().catch(function (fatal) {
              try {
                res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'internal', message: String((fatal && fatal.message) || fatal).slice(0, 240) }));
              } catch (e2) { /* ignore */ }
            });
          },
        });
      } catch (e) { /* 端点注册失败不影响皮肤 */ }
      // 资源目录契约：每个目录逐文件注册 exact 路由（prefix 形态宿主不一定支持）。
      // ASSET_DIRS 是「客户端 URL ↔ 服务端路由 ↔ 磁盘文件」三方的唯一声明处，
      // scripts/verify-assets.mjs 直接解析它做对账。
      // 路由必须与客户端实际请求的路径一致：客户端要 /assets/bg/bg-*.webp，
      // 而旧的 <id>-dark.webp 命名在 0.4.0 清理死资产时已被删除 —— 保留那条路由只会
      // 让每个请求都 404，而客户端要的 /assets/bg/ 下 21 张图一张都取不到。
      for (const dir of ASSET_DIRS) {
        try {
          const diskUrl = new URL(dir.disk, import.meta.url);
          const serve = (name) => (req, res) => {
            try {
              const buf = fs.readFileSync(new URL(name, diskUrl));
              res.writeHead(200, { 'content-type': dir.type, 'cache-control': 'public, max-age=' + dir.maxAge });
              res.end(buf);
            } catch (e) { try { res.writeHead(404); res.end(); } catch (e2) { /* ignore */ } }
          };
          for (const fname of fs.readdirSync(diskUrl)) {
            if (!fname.toLowerCase().endsWith(dir.ext)) continue;
            ws.register({ kind: 'exact', path: dir.url + fname, handler: serve(fname) });
          }
        } catch (e) { /* 资源路由失败不影响主题 */ }
      }

      writeJson('plugin-status.json', {
        version: VERSION, phase: 'endpoint-mounted', at: new Date().toISOString(),
      });
    } catch (e) {
      writeJson('plugin-status.json', {
        version: VERSION, phase: 'endpoint-failed', error: String((e && e.message) || e), at: new Date().toISOString(),
      });
    }
  };

  if (typeof ctx.inject === 'function') {
    try {
      const bind = () => ctx.inject(['webServer'], (injected) => { try { mount(injected); } catch (e) { /* ignore */ } });
      if (typeof ctx.effect === 'function') ctx.effect(bind); else bind();
    } catch (e) { /* webServer 缺失不影响皮肤 */ }
  }
}
