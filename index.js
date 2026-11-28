// dsh-zhuoer-theme —— 宿主半边
// 纯客户端皮肤；这里只做两件事：落加载状态、提供一个自检端点把客户端侧的执行情况写回磁盘。

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { generateThemeSpec } from './theme-gen.js';
import { registerThemeTool } from './theme-tool.js';

export const name = 'dsh-zhuoer-theme';

const VERSION = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
const STATUS_DIR = 'dsh-zhuoer-theme';
// 资源目录契约：url 是对外 URL 前缀，disk 是包内目录，ext 是要服务的扩展名。
// 唯一声明处 —— index.js 按它注册路由，scripts/verify-assets.mjs 按它对账。
// 改这里之前先看客户端请求的路径：客户端 URL 必须等于 url + 文件名。
const ASSET_DIRS = [
  // 底图会「同名换内容」（补一套主题、加深纹理都改同一个文件名），长缓存会让用户
  // 升级后最长一天看不到变化。5 分钟足够挡重复请求，又不至于把更新藏起来。
  { url: '/dsh-zhuoer-theme/assets/bg/', disk: 'assets/bg/', ext: '.webp', type: 'image/webp', maxAge: 300 },
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

// 本次插件实例的会话随机数：只有拿到它的调用方才被允许触发 AI 生成（会消耗模型额度）。
// 诚实边界（见 SECURITY.md）：同源页面里的**其它脚本**理论上仍能取到它——
// 浏览器里同源脚本互相无法隔离，nonce 挡的是「外部来源的直连探测」与「误撞」，不是同源恶意脚本。
let sessionNonce = '';
// 会话随机数：24 字节密码学随机。
// 这里曾经写的是 `require('node:crypto')`——本文件是 ESM（package.json 里 type=module），
// require 在模块作用域**不存在**，那行必抛 ReferenceError，于是每次都掉进下面的兜底：
// 兜底是 Date.now() + Math.random()，前 13 位就是毫秒时间戳，任何同源脚本都能在
// 毫秒级窗口里猜到并直接调 /api/gen-theme 烧宿主模型额度（实测：nonce 前缀 = 时间戳）。
// 修法：文件顶部 ESM import crypto；兜底也必须是密码学随机的；
// 再兜不住就**不发** nonce（空串会让服务端拒绝所有生成请求）——宁可不可用，不可被猜。
function makeNonce() {
  try {
    return crypto.randomBytes(24).toString('hex');
  } catch (e) {
    try {
      const b = new Uint8Array(24);
      globalThis.crypto.getRandomValues(b);
      return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    } catch (e2) {
      return '';
    }
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

// 底纹图片目录：与工具落盘、端点回传共用同一个位置。
function texturesDir() {
  return path.join(dir(), 'textures');
}

function writeJson(name, data) {
  try {
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(path.join(dir(), name), JSON.stringify(data, null, 2) + '\n', 'utf8');
  } catch (e) { /* 诊断失败不影响插件 */ }
}

// ---- 诊断上报的 body 收集（导出以便无头测试）----
// 为什么抽出来：这段逻辑只有「真发一个 >200 KB 的请求」才能观察到，而宿主侧改动
// 要重启 DSH 才生效——把它做成纯函数后，单元测试可以直接验，不必每次重启宿主。
// 规则：超过上限即停（不再累加、不再 O(n) 拷贝），只留头部 head 字供排障，并标记 truncated。
export function zrBodyCollector(limit, head) {
  const max = Number(limit) > 0 ? Number(limit) : 200000;
  const keep = Number(head) > 0 ? Number(head) : 2000;
  let body = '';
  let truncated = false;
  return {
    push(chunk) {
      if (truncated) return;
      body += chunk;
      if (body.length > max) {
        truncated = true;
        body = body.slice(0, keep);
      }
    },
    result() { return { body: body, truncated: truncated }; },
  };
}

// ---- 生效配色（last-theme.json）（R-03 / F-09）----
// 为什么要落盘：对话里生成的主题，**最终生效**的色板只活在卡片的 DOM 里
// （按图取色跑在 useEffect 的 canvas 回调里，而工具结果里的 SPEC_MARKER 是服务端先写的）。
// 于是对话之外的导出 / 审计 / 另一个 agent 读到的都是「模型原色」，不是用户眼前这套。
// 形状校验做成纯函数，导出给 scripts/test-last-theme.mjs 无头验证。
const LAST_THEME_MAX_BYTES = 65536;
export function zrLastThemeShape(input, opts) {
  const limit = (opts && Number(opts.maxBytes) > 0) ? Number(opts.maxBytes) : LAST_THEME_MAX_BYTES;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, reason: 'not-object' };
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  const hexOk = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
  const tokenOk = (k) => /^--dsw-(alias|specific)-[a-z0-9-]+$/.test(k);
  // 锚点 + 少量覆盖都收，但只认 6 位 hex：写出去的是一份「能读的结论」，不是任意 JSON 垃圾场。
  const pickTokens = (src, cap) => {
    const out = {};
    if (!src || typeof src !== 'object') return out;
    Object.keys(src).forEach((k) => {
      if (Object.keys(out).length >= cap) return;
      if (!tokenOk(k) || !hexOk(src[k])) return;
      out[k] = String(src[k]).toLowerCase();
    });
    return out;
  };
  const light = pickTokens(input.light, 96);
  const dark = pickTokens(input.dark, 96);
  // 浅色表是底线：没有它就等于没有主题，宁可 400 也不要写一份空结论。
  if (!Object.keys(light).length) return { ok: false, reason: 'no-light' };
  const font = (input.font && typeof input.font === 'object') ? input.font : {};
  const bg = (input.bg && typeof input.bg === 'object') ? input.bg : {};
  const idOk = (v) => /^[a-z][a-z0-9-]{0,31}$/.test(String(v || ''));
  const spec = {
    id: idOk(input.id) ? String(input.id) : '',
    label: str(input.label, 24) || 'AI',
    base: idOk(input.base) ? String(input.base) : '',
    light: light,
    dark: dark,
    font: { body: str(font.body, 64), chat: str(font.chat, 64) },
    radiusScale: (typeof input.radiusScale === 'number' && isFinite(input.radiusScale))
      ? Math.max(0, Math.min(3, input.radiusScale)) : 1,
    autoDark: input.autoDark === true,
    bg: { source: str(bg.source, 16), key: str(bg.key, 40), keyLight: str(bg.keyLight, 40) },
    textureDecision: input.textureDecision === 'want' ? 'want' : 'no',
    sampled: input.sampled === true,
    scheme: (input.scheme === 'dark' || input.scheme === 'light') ? input.scheme : '',
    at: str(input.at, 40) || new Date().toISOString(),
  };
  const bytes = Buffer.byteLength(JSON.stringify(spec), 'utf8');
  if (bytes > limit) return { ok: false, reason: 'too-big', bytes: bytes };
  return { ok: true, spec: spec, bytes: bytes, anchors: Object.keys(light).length, darkAnchors: Object.keys(dark).length };
}

// 原子写：先写 .tmp 再 rename。客户端会 GET 回来核对，读到半截 JSON 等于没写。
function writeJsonAtomic(name, data) {
  try {
    fs.mkdirSync(dir(), { recursive: true });
    const full = path.join(dir(), name);
    const tmp = full + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, full);
    return true;
  } catch (e) { return false; }
}
// ---- 首屏底色（首绘之前就把画布刷成主题色）----
// 为什么要做这件事（2026-11-28 真机实测）：宿主自己的 boot 主题会在首屏注入
// `body{background-color:#fff}`（深色 #151517），注释原文是「CSS that colors the
// document canvas **before any script executes**」「head CSS colors the document canvas
// **before first paint**」。而我们的 token 只能等客户端 bundle 求值后才注入——
// 实测首绘 224ms、bundle 求值 370ms、主题色真正落地约 674ms，于是中间那 450ms
// 画布是宿主的白底，用户看到的就是「白色界面 → 主题底色界面」。
//
// 修法走宿主正规通道：宿主自己的主题插件就是这么做的（app.asar 里 dsh-client-ui-theme）：
//   ctx.on("webserver/index-inject", (table) => { table.push(...bootThemeInjections(...)) })
// 行的 kind 是 'style'，会被渲染成 <style> 放在 <head> 里——首绘之前就在。
//
// 为什么不用 tapIndex：桌面端是 file:// + IPC，index.html 是打包好的静态壳，
// tapIndex 的字符串变换不会被执行（见 dsh-boot-suite 的同款踩坑记录）。
//
// 底色从哪来：客户端每次 apply 都会把「当前生效的明暗两态底色」回传到这里
// （POST /dsh-zhuoer-theme/api/boot-colors，见 src/20-tokens.js 的 zrReportBootColors），
// 落 boot-colors.json；没有回传记录时（首次安装）退回内置 zhuoer 的两态底色。
function zrBootBgColors() {
  const fallback = { light: '#f4f1ec', dark: '#0e1015' };
  // 先读客户端回传的生效底色（面板里选的主题、AI 生成的主题都走这条）。
  try {
    const raw = fs.readFileSync(path.join(dir(), 'boot-colors.json'), 'utf8');
    const o = JSON.parse(raw);
    const hexOk = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
    if (hexOk(o.light) && hexOk(o.dark)) {
      return {
        light: String(o.light).toLowerCase(),
        dark: String(o.dark).toLowerCase(),
        mode: o.mode === 'light' || o.mode === 'dark' ? o.mode : 'auto',
        known: true,
      };
    }
  } catch (e) { /* 没有回传记录：退回下面的兜底 */ }
  // 再退回对话里生成过的主题（AI 卡片应用后落盘的那份）。
  try {
    const raw = fs.readFileSync(path.join(dir(), 'last-theme.json'), 'utf8');
    const spec = JSON.parse(raw);
    const pick = (side) => {
      const v = spec && spec[side] && spec[side]['--dsw-alias-bg-base'];
      return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null;
    };
    const light = pick('light');
    const dark = pick('dark');
    if (light && dark) return { light: light, dark: dark, known: true };
  } catch (e) { /* ignore */ }
  return { light: fallback.light, dark: fallback.dark, known: false };
}

// 首屏 CSS：只刷画布底色，不碰任何别的变量。明暗口径见下面的 mode 分支。
export function zrBootStyleCss(colors) {
  const c = colors && typeof colors === 'object' ? colors : {};
  const light = /^#[0-9a-fA-F]{6}$/.test(String(c.light || '')) ? String(c.light) : '#f4f1ec';
  const dark = /^#[0-9a-fA-F]{6}$/.test(String(c.dark || '')) ? String(c.dark) : '#0e1015';
  // 明暗口径必须跟客户端一致（pref.mode）：
  //   'light' / 'dark' = 用户显式指定 → 首屏就刷那一个颜色；
  //   'auto'（默认）   = 跟随系统 → 用媒体查询，跟宿主 boot 主题同款。
  // 若这里无条件用媒体查询，用户显式选「浅色」而系统是深色时，首屏会先刷深色再被客户端改回浅色——
  // 闪的方向反了，比不刷还糟。
  const mode = c.mode === 'light' || c.mode === 'dark' ? c.mode : 'auto';
  // 用「html body」而不是 !important 压过宿主的 body{background-color:#fff}：
  // 宿主那条特异性是 (0,0,1)，我们是 (0,0,2)，同声明里特异性高者赢——不需要抬优先级。
  // （!important 计数是棘轮，只许降不许升；这条是首屏兜底，不属于 a11y/排版那类。）
  const sel = 'html body';
  // 标记：让页面侧能认出「这条是卓尔的首屏行」——桌面端走 file:// + IPC 的页面侧解释器，
  // 与 web 端（服务端拼 HTML）路径不同，只能由页面自己回答「首屏里有没有那行」。
  const mark = '/*dsh-zhuoer-boot-canvas*/';
  if (mode === 'light') {
    return mark + ':root{color-scheme:light}' + sel + '{background-color:' + light + '}';
  }
  if (mode === 'dark') {
    return mark + ':root{color-scheme:dark}' + sel + '{background-color:' + dark + '}';
  }
  return mark + ':root{color-scheme:light}' + sel + '{background-color:' + light + '}'
    + '@media(prefers-color-scheme:dark){:root{color-scheme:dark}' + sel + '{background-color:' + dark + '}}';
}

export function apply(ctx, config) {
  // 对话里的主题生成工具：用户在 DSH 对话框说「给我一套赛博朋克配色」时，
  // 模型调用它生成主题 spec，对话流里出现色卡卡片，用户确认后才应用。
  // 与面板里的 AI 生成并存，互不影响。
  try {
    registerThemeTool(ctx, function (obj) { writeJson('tool-status.json', obj); }, { texturesDir: texturesDir });
  } catch (e) { /* 工具注册失败不影响皮肤 */ }

  writeJson('plugin-status.json', {
    version: VERSION,
    phase: 'apply-ok',
    node: process.version,
    at: new Date().toISOString(),
    configKeys: config && typeof config === 'object' ? Object.keys(config) : [],
    // 生效色板的落盘位置（客户端「应用」成功后回传）：对话之外的读取方按这个路径找。
    lastTheme: path.join(dir(), 'last-theme.json'),
  });

  // 客户端自检回传：client.js 在同源页面里 POST 过来，落盘供事后核对。
  const mount = (injected) => {
    sessionNonce = makeNonce();
    let ws = null;
    try { ws = typeof injected.get === 'function' ? injected.get('webServer') : null; } catch (e) { return; }
    if (!ws || typeof ws.register !== 'function') return;
    // 同一个 server 里插件可能被装配两次（desktop / web 两份 profile 各注一次）。
    // 宿主的 webServer.register 对同一路径是硬错误（实测 "duplicate exact route"），
    // 后装配的那次会在第一条路由上就抛，于是它的 nonce / 底纹路由也全没注册上，
    // 状态文件还被写成 endpoint-failed，看起来像故障。
    // 用进程级路径表把注册收敛成一次：谁先注册谁生效，后来者直接跳过。
    const ROUTE_REGISTRY = Symbol.for('dsh-zhuoer-theme.registered-routes');
    const register = (route) => {
      const set = globalThis[ROUTE_REGISTRY] || (globalThis[ROUTE_REGISTRY] = new Set());
      if (set.has(route.path)) return;
      // 先注册再记账：注册失败不占位，另一个实例还有机会补上。
      ws.register(route);
      set.add(route.path);
    };
    try {
      register({
        kind: 'exact',
        path: '/dsh-zhuoer-theme/api/report',
        handler: (req, res) => {
          if (!isOwnClient(req)) return rejectForeign(res);
          const collector = zrBodyCollector(200000, 2000);
          try {
            req.on('data', (c) => {
              // 旧写法是「先拼再截」：超过上限后每个 chunk 都要 slice 一次 200 KB（O(n) 拷贝)，
              // 而且截断落在 JSON 中间，解析必失败，落盘的是半截 JSON，排障时看不到内容。
              // 新写法：超限即停，只留头部 2 KB 供排障，并标记 truncated。
              // 收集逻辑在 zrBodyCollector 里（可被 scripts/test-report-body.mjs 无头验证）。
              collector.push(c);
            });
            req.on('end', () => {
              const got = collector.result();
              const body = got.body;
              const truncated = got.truncated;
              let parsed = null;
              try { parsed = JSON.parse(body); } catch (e) { parsed = { raw: String(body).slice(0, 2000), truncated: truncated }; }
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
      // 会话随机数领取端点：必须带自定义头（跨站请求会先触发预检，宿主不应答）。
      try {
        register({
          kind: 'exact',
          path: '/dsh-zhuoer-theme/api/nonce',
          handler: (req, res) => {
            if (!isOwnClient(req)) return rejectForeign(res);
            try {
              res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ nonce: sessionNonce }));
            } catch (e) { /* ignore */ }
          },
        });
      } catch (e) { /* ignore */ }
      // ---- 底纹图片回传 ----
      // 工具把模型产出的图片落到 textures 目录，这里按文件名回传字节。
      // 只认 16 位十六进制 basename + 白名单扩展名，路径穿越无从下手。
      try {
        register({
          kind: 'exact',
          path: '/dsh-zhuoer-theme/api/texture',
          handler: (req, res) => {
            if (!isOwnClient(req)) return rejectForeign(res);
            try {
              const u = new URL(req.url || '/', 'http://localhost');
              const name = String(u.searchParams.get('name') || '');
              if (!/^[a-f0-9]{16}\.(jpg|png|webp|svg)$/.test(name)) { res.writeHead(400); res.end(); return; }
              const buf = fs.readFileSync(path.join(texturesDir(), name));
              // 矢量底纹按 image/svg+xml 下发：它只会被 CSS url() / <img> 消费（secure static mode），
              // 脚本不执行、外部资源不加载。nosniff 防浏览器把响应当别的类型解析。
              const mime = name.endsWith('.png') ? 'image/png'
                : name.endsWith('.webp') ? 'image/webp'
                  : name.endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg';
              res.writeHead(200, {
                'content-type': mime,
                'content-length': String(buf.length),
                'x-content-type-options': 'nosniff',
                'cache-control': 'no-store',
              });
              res.end(buf);
            } catch (e) {
              try { res.writeHead(404); res.end(); } catch (e2) { /* ignore */ }
            }
          },
        });
      } catch (e) { /* ignore */ }

      // ---- 生效配色回传 / 读回（R-03）----
      // POST：客户端在「应用」成功后回传**最终生效**的色板（已含按图取色与底纹键）。
      // GET ：对话之外（脚本 / 审计 / 另一个 agent）读回同一份，两边的数字对得上。
      try {
        register({
          kind: 'exact',
          path: '/dsh-zhuoer-theme/api/last-theme',
          handler: (req, res) => {
            if (!isOwnClient(req)) return rejectForeign(res);
            try {
              if (String(req.method || 'GET').toUpperCase() === 'GET') {
                const buf = fs.readFileSync(path.join(dir(), 'last-theme.json'));
                res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
                res.end(buf);
                return;
              }
              const collector = zrBodyCollector(LAST_THEME_MAX_BYTES, 2000);
              req.on('data', (c) => { collector.push(c); });
              req.on('end', () => {
                const got = collector.result();
                let parsed = null;
                try { parsed = JSON.parse(got.body); } catch (e) { parsed = null; }
                if (got.truncated || !parsed) {
                  res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
                  res.end('{"error":"bad-body"}');
                  return;
                }
                const shaped = zrLastThemeShape(parsed);
                if (!shaped.ok) {
                  res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
                  res.end(JSON.stringify({ error: shaped.reason }));
                  return;
                }
                const wrote = writeJsonAtomic('last-theme.json', shaped.spec);
                res.writeHead(wrote ? 200 : 500, { 'content-type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: wrote, bytes: shaped.bytes, anchors: shaped.anchors }));
              });
            } catch (e) {
              try { res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' }); res.end('{"error":"none"}'); } catch (e2) { /* ignore */ }
            }
          },
        });
      } catch (e) { /* ignore */ }

      // ---- 首屏底色回传（客户端 apply 后告诉服务端「现在生效的是哪套底色」）----
      // 服务端在首绘前要刷画布，但偏好存在浏览器的 localStorage，服务端读不到，
      // 只能等客户端回传。第一次安装还没有回传记录时用内置 zhuoer 的底色兜底。
      try {
        register({
          kind: 'exact',
          path: '/dsh-zhuoer-theme/api/boot-colors',
          handler: (req, res) => {
            if (!isOwnClient(req)) return rejectForeign(res);
            try {
              if (String(req.method || 'GET').toUpperCase() === 'GET') {
                const buf = fs.readFileSync(path.join(dir(), 'boot-colors.json'));
                res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
                res.end(buf);
                return;
              }
              const collector = zrBodyCollector(8192, 1000);
              req.on('data', (c) => { collector.push(c); });
              req.on('end', () => {
                const got = collector.result();
                let parsed = null;
                try { parsed = JSON.parse(got.body); } catch (e) { parsed = null; }
                const hexOk = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
                if (!parsed || got.truncated || !hexOk(parsed.light) || !hexOk(parsed.dark)) {
                  res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
                  res.end('{"error":"bad-body"}');
                  return;
                }
                const wrote = writeJsonAtomic('boot-colors.json', {
                  light: String(parsed.light).toLowerCase(),
                  dark: String(parsed.dark).toLowerCase(),
                  mode: parsed.mode === 'light' || parsed.mode === 'dark' ? parsed.mode : 'auto',
                  theme: typeof parsed.theme === 'string' ? String(parsed.theme).slice(0, 40) : '',
                  at: typeof parsed.at === 'string' ? String(parsed.at).slice(0, 40) : new Date().toISOString(),
                });
                res.writeHead(wrote ? 200 : 500, { 'content-type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: wrote }));
              });
            } catch (e) {
              try { res.writeHead(404); res.end('{"error":"none"}'); } catch (e2) { /* ignore */ }
            }
          },
        });
      } catch (e) { /* ignore */ }

      // ---- AI 生成主题 ----
      // 客户端 POST { prompt } → 用宿主当前配置的模型生成主题 JSON。
      // 调用方式照抄 dsh-pet（已生产验证）：走高层入口 llm.stream()，chunk 取 text-delta。
      // 注意不要用 prepareCall：那是 adapter 层的接缝，dispatch 校验会拒绝插件直接调用。
      try {
        register({
          kind: 'exact',
          path: '/dsh-zhuoer-theme/api/gen-theme',
          // handler 必须同步返回：宿主在 handler 返回后才把 res 置为可写，
          // 所以在 async handler 里 await 之后再 res.end() 会写不出去（客户端收到空响应）。
          // 做法：同步返回，所有逻辑丢进立即执行的 IIFE。
          handler: (req, res) => {
            if (!isOwnClient(req)) return rejectForeign(res);
            // 二次门：AI 生成会消耗宿主模型额度，必须带本次实例的会话随机数。
            try {
              const nh = String((req.headers && req.headers['x-zhuoer-nonce']) || '');
              if (!sessionNonce || nh !== sessionNonce) {
                res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' });
                res.end('{"error":"forbidden"}');
                return;
              }
            } catch (e) { /* ignore */ }
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
            register({ kind: 'exact', path: dir.url + fname, handler: serve(fname) });
          }
        } catch (e) { /* 资源路由失败不影响主题 */ }
      }

      // 这一份会**覆盖** apply() 里那份：容易忘记同步字段。lastTheme 是读取方的唯一入口，必须两边都有。
      writeJson('plugin-status.json', {
        version: VERSION, phase: 'endpoint-mounted', at: new Date().toISOString(),
        lastTheme: path.join(dir(), 'last-theme.json'),
      });
    } catch (e) {
      writeJson('plugin-status.json', {
        version: VERSION, phase: 'endpoint-failed', error: String((e && e.message) || e), at: new Date().toISOString(),
      });
    }
  };

  // 首屏底色：在宿主渲染 index.html 之前 push 一条 style 行，画布就是主题底色。
  // prepend:true 让我们的行排在宿主 boot 主题的行之前——两行都给 body 写了 background-color，
  // 后写的赢，我们要在前面就得先写。
  try {
    if (typeof ctx.on === 'function') {
      ctx.on('webserver/index-inject', function (table) {
        try {
          if (!table || typeof table.push !== 'function') return;
          const colors = zrBootBgColors();
          table.push({ kind: 'style', text: zrBootStyleCss(colors) });
        } catch (e) { /* 首屏底色失败不影响皮肤 */ }
      }, { prepend: true });
    }
  } catch (e) { /* 没有这个事件也不影响皮肤 */ }

  if (typeof ctx.inject === 'function') {
    try {
      const bind = () => ctx.inject(['webServer'], (injected) => { try { mount(injected); } catch (e) { /* ignore */ } });
      if (typeof ctx.effect === 'function') ctx.effect(bind); else bind();
    } catch (e) { /* webServer 缺失不影响皮肤 */ }
  }
}
