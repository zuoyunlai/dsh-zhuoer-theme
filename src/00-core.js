/**
 * dsh-zhuoer-theme · Client 半边：Zhuoer 配色主题（DSH 皮肤）
 *
 * 做法：不注册新主题 —— 用 ctx.theme.overrideTokens() 把 Zhuoer 的调色板映射成
 * DSH 的 --dsw-alias-* token。唯一的例外是明暗三态（浅色 / 深色 / 跟随系统）：
 * 它和宿主「设置-通用设置」写的是同一份 preference，所以走 ctx.theme.setTheme()
 * 读写，不另存第二套（详见 #region mode-sync）。
 * 主题数据来自 Zhuoer Control UI（MIT）的 ui/public/themes/*.css + base.css。
 * 主题的唯一真源是 ./themes.mjs —— 改主题只改它，再 npm run sync:themes 生成这里的
 * 内联副本（宿主把插件合并进 /plugins/??a,b,c 加载，import.meta.url 不可靠，不能运行时 import）。
 *
 * 两条门禁，改完代码跑 npm run verify:all：
 *   verify:themes  内联副本与 themes.mjs 逐 token 相等 / token 齐全 / 对比度达标
 *   verify:host    宿主选择器与属性 与 contracts/host-contract.json 对账
 * 新增 [class*="xxx"] 或 [data-xxx] 这类宿主依赖时，verify:host 会要求登记用途与失效后果。
 */
window.__ModuleLoader__.load({
  id: 'dsh-zhuoer-theme',
  factory(require) {
    'use strict';
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useState, useRef } = React;

    // 复现用：卡片标题悬停态检查
    const SOURCE = 'dsh-zhuoer-theme';
    const STORE = 'dsh-zhuoer-theme:v1';

    // ---- 自检回传：把客户端执行情况 POST 给宿主端点（失败静默） ----
    const REPORT_URL = '/dsh-zhuoer-theme/api/report';
    function report(payload) {
      // 默认不落盘。探针在开发期有用，但在生产里是纯开销：每次 apply 数条 POST + 写盘，
      // 日志一天能涨到 MB 级（实测 297 次 apply 约 1,780 条记录）。
      // 需要复现时：localStorage['dsh-zhuoer-theme:debug'] = '1' 再刷新。
      if (typeof zrDebug === 'function' && !zrDebug()) return;
      try {
        fetch(REPORT_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-zhuoer-client': '1' },
          body: JSON.stringify(Object.assign({ at: new Date().toISOString(), href: String(location && location.href || '').slice(0, 200) }, payload)),
        }).catch(function () {});
      } catch (e) { /* ignore */ }
    }
    // ---- 一次性 token 快照（排障用）----
    // 自定义主题生效时上报一次真实 token 表，每页只报一次。
    // 目的：确认「规则改完了但界面没变」到底是规则没跑，还是那块界面根本不读这些 token。
    let zrDumpDone = false;
    function zrDumpTokensOnce(scheme, pref, tokens) {
      if (zrDumpDone) return;
      // 排障已完成（底纹满幅 vs 线稿那条根因），探针收回到调试开关后面：
      // 需要复现时 localStorage['dsh-zhuoer-theme:debug'] = '1' 再刷新。
      if (!zrDebug()) return;
      let c = null;
      try { c = customSpec(pref); } catch (e) { c = null; }
      if (!c) return;
      zrDumpDone = true;
      const keys = [
        '--dsw-alias-bg-base', '--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2',
        '--dsw-alias-bg-layer-3', '--dsw-alias-bg-layer-4', '--dsw-alias-bg-mask-1',
        '--dsw-alias-settings-card-fill', '--dsw-alias-card-fill', '--dsw-specific-bubble',
        '--dsw-alias-label-primary', '--dsw-alias-label-secondary', '--dsw-alias-label-tertiary',
      ];
      const t = {};
      keys.forEach(function (k) { t[k] = String(tokens[k] || ''); });
      const info = {
        phase: 'token-dump',
        scheme: scheme,
        base: c.base,
        autoDark: !!c.autoDark,
        lightKeys: Object.keys(c.light || {}),
        darkKeys: Object.keys(c.dark || {}),
        tokens: t,
        // 一次把「所有自定义主题」的锚点也带回来：
        // 用户反馈「三套有问题、一套没问题」，只报当前生效那套看不出差别。
        themes: (function () {
          const list = (pref && pref.customThemes) || [];
          return list.map(function (c) {
            return {
              id: c && c.id, label: c && c.label, base: c && c.base,
              autoDark: !!(c && c.autoDark),
              light: (c && c.light) || {}, dark: (c && c.dark) || {},
              // 底纹是逐主题配置的：同样一套锚点，开不开底纹观感差很多。
              bg: c && c.bg ? { source: c.bg.source, opacity: c.bg.opacity, style: c.bg.style, key: c.bg.key ? 1 : 0, keyLight: c.bg.keyLight ? 1 : 0 } : null,
            };
          });
        })(),
        // 半透明面的取样：用户反馈「透明底卡片文字发虚、不透明卡片正常」。
        // 光有 token 值判断不了，必须知道那些元素到底用了什么类名与 alpha。
        semi: (function () {
          const out = [];
          try {
            const root = document.querySelector('[class*="_centerCol"]') || document.body;
            if (!root) return out;
            const els = root.querySelectorAll('div,section,article,li');
            for (let i = 0; i < els.length && out.length < 12; i++) {
              const el = els[i];
              let cs = null;
              try { cs = getComputedStyle(el); } catch (e) { continue; }
              const bg = String(cs.backgroundColor || '');
              const m = bg.match(/rgba?\(([^)]+)\)/);
              if (!m) continue;
              const parts = m[1].split(',').map(function (x) { return parseFloat(x); });
              const a = parts.length > 3 ? parts[3] : 1;
              if (!(a > 0.02 && a < 0.98)) continue;
              const r = el.getBoundingClientRect();
              if (r.width < 160 || r.height < 50) continue;
              out.push({
                cls: String(el.className || '').slice(0, 100),
                bg: bg, alpha: a,
                w: Math.round(r.width), h: Math.round(r.height),
                color: String(cs.color || ''),
              });
            }
          } catch (e) { /* ignore */ }
          return out;
        })(),
      };
      // 不走 report()：那条通道默认被 zrDebug() 关掉，而这次就是要它在常态下报一次。
      try {
        fetch(REPORT_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-zhuoer-client': '1' },
          body: JSON.stringify(Object.assign({ at: new Date().toISOString() }, info)),
        }).catch(function () {});
      } catch (e) { /* ignore */ }
    }

    // ---- 半透明面取样（排障用）----
    // 为什么需要：用户反馈「底纹之上每一层都半透明，文字对比被冲淡」。
    // 只看 token 判断不了，必须知道那些容器到底用了 rgba / 背景图 / backdrop 还是 opacity。
    function zrSemiProbe() {
      const out = [];
      try {
        const root = document.querySelector('[class*="_centerCol"]');
        if (!root) return out;
        const els = root.querySelectorAll('div,section,article,li,main');
        for (let i = 0; i < els.length && out.length < 15; i++) {
          const el = els[i];
          let cs = null;
          try { cs = getComputedStyle(el); } catch (e) { continue; }
          const r = el.getBoundingClientRect();
          if (r.width < 120 || r.height < 30) continue;
          const bg = String(cs.backgroundColor || '');
          const m = bg.match(/rgba?\(([^)]+)\)/);
          let a = 1;
          if (m) {
            const p = m[1].split(',').map(function (x) { return parseFloat(x); });
            a = p.length > 3 ? p[3] : 1;
          }
          const img = String(cs.backgroundImage || 'none');
          const bd = String(cs.backdropFilter || 'none');
          const op = parseFloat(cs.opacity || '1');
          const translucent = a > 0.02 && a < 0.98;
          const hasImg = img !== 'none';
          const hasBd = bd !== 'none';
          const lowOp = op < 0.95;
          if (!translucent && !hasImg && !hasBd && !lowOp) continue;
          out.push({
            cls: String(el.className || '').slice(0, 110),
            bg: bg, alpha: a,
            img: hasImg ? img.slice(0, 70) : '',
            bd: hasBd ? bd : '',
            op: op,
            color: String(cs.color || ''),
            w: Math.round(r.width), h: Math.round(r.height),
          });
        }
      } catch (e) { /* ignore */ }
      return out;
    }

    // 底图解析探针：只在 debug 开关下上报，用来定位「某个方案下底图不出现」。
    // 记录：主题 bg 原始字段、内存缓存是否命中、解析出的 URL、以及伪元素的实际计算样式。
    function zrBgProbe(payload) {
      if (!zrDebug()) return;
      try {
        fetch(REPORT_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-zhuoer-client': '1' },
          body: JSON.stringify(Object.assign({ at: new Date().toISOString(), phase: 'bg-probe' }, payload)),
        }).catch(function () {});
      } catch (e) { /* ignore */ }
    }

    // A2：探针的一次性守卫改模块作用域。挂 window 的两个问题：同页其它脚本可读可改；
    // 热更新时新旧闭包共用同一个键，新闭包会被旧闭包留下的 true 误判成「已探测」而整段跳过。
    let zrIconProbed = false;

    // ---- B3：设备像素栅格 ----
    // 为什么需要：125% / 150% 系统缩放下 devicePixelRatio 是 1.25 / 1.5，字号算出来的小数 px
    // （例如 14 × 1.15 = 16.1）落在 20.125 设备像素上，行盒上下边各带 0.125 的分数；
    // 流式输出时正文行数与输入框自增高会各自取整到不同侧，看起来就是底栏/正文轻微抖动。
    // 上游 PTC 的做法（2.5.0 #45）：输入区高度按设备像素对齐、正文行距改为整像素。
    // 这里的实现：把所有注入的 px 值拍到 1/dpr 的栅格上——只动数值精度，不动布局结构。
    // ---- B1：故障隔离状态机 ----
    // 为什么不是「失败一次就永久降级」：overrideTokens 的失败大多是临时的（宿主主题服务晚到、
    // 宿主正在注入样式表、HMR 中途）。一次即弃会让用户看到「主题只生效一半」，而且没有任何原因。
    // 上游 PTC 的隔离规则：明确不可用立即禁用；临时错误连续 3 次才禁用、成功一次清零；
    // 参数错误 / 权限拒绝 / 业务失败不算故障。这里是它的纯函数版本（无 DOM，可无头测试）。
    const ZR_ISOLATION_LIMIT = 3;
    function isolationReducer(state, event) {
      const s = state && typeof state === 'object'
        ? { fails: state.fails | 0, offline: !!state.offline, tries: state.tries | 0 }
        : { fails: 0, offline: false, tries: 0 };
      const kind = event && event.kind;
      if (kind === 'success' || kind === 'reset') return { fails: 0, offline: false, tries: 0 };
      if (kind === 'fatal') return { fails: ZR_ISOLATION_LIMIT, offline: true, tries: 0 };
      // 参数错误不算故障：传错了是我们自己的 bug，不该因此把主题关掉。
      if (kind === 'argError') return { fails: s.fails, offline: s.offline, tries: s.tries };
      if (kind === 'transient') {
        const fails = s.fails + 1;
        return { fails: fails, offline: fails >= ZR_ISOLATION_LIMIT, tries: s.tries };
      }
      if (kind === 'tick') return { fails: s.fails, offline: s.offline, tries: s.tries + 1 };
      return s;
    }

    // ---- B4：字号覆盖的完整性判据 ----
    // 原来判「扫出来 ≥ 20 条就算完整」。宿主 CSS 里有 1700+ 条 px 字号，所以「读到 30 条」
    // 其实丢了 98%，但旧判据仍标成 cssom，把这次失败记成了一次成功。
    // 上游 PTC 的规矩是「只有快照完整才刷新缓存」，这里用覆盖率近似它：≥ 70% 才算读到。
    const ZR_TEXT_COVER_MIN = 0.7;
    function zrTextCoverage(have, total) {
      const t = total | 0;
      const h = have | 0;
      if (!t) return { have: h, total: t, ratio: 0, mode: 'unknown', pct: 0 };
      const ratio = h / t;
      return {
        have: h,
        total: t,
        ratio: ratio,
        mode: ratio >= ZR_TEXT_COVER_MIN ? 'cssom' : 'table-fallback',
        pct: Math.round(ratio * 100),
      };
    }

    // ---- C1：编辑器抽屉宽度 ----
    // 392px 是设计值，但调色时经常想更宽（8 组锚点 + 十六进制 + 对比比值要并排看）。
    // 范围 320–640：低于 320 六列网格会挤断，高于 640 会把主界面压没（CSS 的 max-width:94vw 再兜一层）。
    const ZR_ED_W_DEFAULT = 392;
    const ZR_ED_W_MIN = 320;
    const ZR_ED_W_MAX = 640;
    function zrClampEdW(v) {
      const n = Number(v);
      if (!isFinite(n) || n <= 0) return ZR_ED_W_DEFAULT;
      return Math.min(ZR_ED_W_MAX, Math.max(ZR_ED_W_MIN, Math.round(n)));
    }

    // ---- C2：等待态的最小可见时长 ----
    // 一次生成本来要 1–3 秒，但缓存命中、本地校验先失败、宿主立刻 401 这类情形可能 80ms 就返回，
    // 按钮上的「生成中…」闪一下等于没有反馈——用户只会再点一次。上游 PTC 的做法是「最短可见 +
    // 结果原位停留」，这里先取最小可见时长这一半。
    const ZR_DWELL_MS = 600;
    function zrDwellDelay(elapsed, min) {
      const e = Number(elapsed) || 0;
      const m = Number(min) || 0;
      if (e >= m) return 0;
      return Math.max(0, Math.round(m - e));
    }

    // ---- 会话随机数失效判定 ----
    // 客户端把 nonce 缓存住（一次会话只取一次），但服务端的 sessionNonce 在**每次插件装载**时
    // 重新生成（见 index.js 的 makeNonce）。于是：插件重载 / 宿主热更新之后，客户端手里那个
    // 已经是旧的，服务端一律 403 —— 而客户端会一直拿旧的重试，永远好不了。
    // 判据：403 = nonce 过期（唯一会返回 403 的原因，见 index.js 的二次门），其它状态码不重试。
    function zrIsStaleNonce(status) {
      return Number(status) === 403;
    }

    // ---- CSS 值转义 ----
    // 为什么需要：底图、品牌图、界面字体名都是**用户可控**的字符串，被原样拼进注入的样式表。
    // 一个双引号就能提前闭合 url("...") 并注入任意 CSS（实测可写出 `html{background:url(外部地址)}`）。
    // 攻击面有限（要能写 localStorage = 同源脚本），但同文件里的 brandImage 早就做了前缀校验，
    // bgImage 没做——这种「一半有、一半没有」最危险：后来者会以为整个文件都安全了。
    // 修法：拼接处统一走转义，而不是在每个字段里各写一遍正则（漏一个就是一次注入）。
    function cssUrl(v) {
      // url() 里要转义引号、反斜杠、括号与空白；其余交给 CSS 的 \ 转义。
      // 字符类里用十六进制转义（\x22 = 双引号、\x27 = 单引号、\x5c = 反斜杠），不直接写引号：
      // 仓库里有几道门用「按引号计数的状态机」剥注释，它们认不出正则字面量——
      // 正则里那个引号会被当成字符串开头，后面一整段注释就再也剥不掉（会造出假门禁失败）。
      return String(v == null ? '' : v).replace(/[\x5c\x22\x27()\s{}]/g, function (c) { return '\\' + c; });
    }
    function cssStr(v) {
      // 字符串字面量里要转义引号与反斜杠（后者能反过来闭合引号）。
      return String(v == null ? '' : v).replace(/[\x5c\x22]/g, function (c) { return '\\' + c; });
    }

    // ---- 缓存键与淘汰 ----
    // 原来的 key 是「长度 + 末 96 字符」：data URL 动辄几百 KB，两张**末 96 字符相同、长度相同**
    // 的图会共用一条缓存 —— 一旦撞了，A 图的对比度限幅会被用到 B 图上（静默的视觉错误）。
    // 换成对全文做 hash：键唯一、无碰撞，也不再要求把整串 URL 拉进内存比较。
    function zrHashKey(s) {
      // FNV-1a 32 位：够快、够散；只用于缓存键，不做安全用途。
      let h = 0x811c9dc5;
      const str = String(s == null ? '' : s);
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
      }
      return h.toString(16);
    }
    // 缓存上限：用户换十几次底图就会在内存里留十几次大字符串（每张 data URL 可到几 MB）。
    // Map 保持插入序，满了丢最旧的（LRU）。
    const ZR_CACHE_MAX = 12;
  // 底纹归一化的画布上限（R-01）：只影响内存与重编码耗时，不改可见尺寸。
  const ZR_TEX_NORM_EDGE = 1000;
    function zrCachePut(map, key, value, protectedKeys) {
      if (map.has(key)) { map.delete(key); map.set(key, value); return value; }
      map.set(key, value);
      while (map.size > ZR_CACHE_MAX) {
        // 优先淘汰**没被任何主题引用**的条目；被引用的绝不能丢——
        // 丢了那条主题的底纹就静默消失（运行期只同步读内存缓存，IDB 没有按 key 读回的通路）。
        // 全部条目都被引用时停止淘汰：宁可多占内存，也不让用户的主题少一张图。
        let victim = undefined;
        for (const k of map.keys()) {
          if (protectedKeys && protectedKeys.has && protectedKeys.has(k)) continue;
          victim = k;
          break;
        }
        if (victim === undefined) break;
        try { map.delete(victim); } catch (e) { break; }
      }
      return value;
    }
    function zrDpr() {
      try { return window.devicePixelRatio || 1; } catch (e) { return 1; }
    }
    function zrQ(v, dpr) {
      const d = typeof dpr === 'number' && dpr > 0 ? dpr : 1;
      const n = Number(v);
      if (!isFinite(n)) return v;
      return Math.round(n * d) / d;
    }

    /** 取宿主服务（惰性解析，读不到当缺失，不崩）。
     *  宿主服务只能经 ctx.get 取；直接读 ctx.xxx 在未 inject 时会抛（plugin_doctor K1）。
     *  上提到 factory 层：i18n 助手与快捷导航都要用，两边各写一份必然漂移。 */
    function serviceOf(ctx, name) {
      if (!ctx) return undefined;
      try {
        if (typeof ctx.get === 'function') {
          const v = ctx.get(name);
          if (v !== undefined && v !== null) return v;
        }
      } catch (e) {
        /* fallthrough */
      }
      try {
        return ctx[name];
      } catch (e) {
        return undefined;
      }
    }

    // ---- 探针资源的回收登记 ----
    // doctor K3 一直报这两处：图标探针与半透明探针各自起 setTimeout + MutationObserver，
    // 且**没有回收路径**——热更新时旧实例的观察者仍在 document.body 上跑，
    // 每次 HMR 都多留一个最长 120 秒的全局观察者。
    // 修法：把定时器与观察者登记到一张表里，卸载时统一断开（面板的 dispose 会调 zrProbeCleanup）。
    const zrProbeTimers = [];
    const zrProbeObservers = [];
    function zrProbeTimer(fn, ms) {
      const id = setTimeout(function () {
        const i = zrProbeTimers.indexOf(id);
        if (i !== -1) zrProbeTimers.splice(i, 1);
        try { fn(); } catch (e) { /* ignore */ }
      }, ms);
      zrProbeTimers.push(id);
      return id;
    }
    function zrProbeObserver(mo) {
      zrProbeObservers.push(mo);
      return mo;
    }
    function zrProbeCleanup() {
      while (zrProbeTimers.length) {
        try { clearTimeout(zrProbeTimers.pop()); } catch (e) { /* ignore */ }
      }
      while (zrProbeObservers.length) {
        try { const mo = zrProbeObservers.pop(); if (mo && mo.disconnect) mo.disconnect(); } catch (e) { /* ignore */ }
      }
    }

    // 步骤图标探针：报告图标元素的**实际计算颜色**，用来核对「语义色有没有真的上上去」。
    function zrIconProbe() {
      // 收进调试闸门（口径与 report() 一致）：它每会话最多发 6 次 POST，还要挂 body 级
      // 观察者 120 秒，每次 DOM 变化都重扫全部图标并逐个 getComputedStyle——
      // 生产环境是纯开销（实测日志已累积 115 条 icon-probe）。
      // 要复现时开 localStorage['dsh-zhuoer-theme:debug'] = '1' 再刷新。
      // 用 MutationObserver 采样（与 zrHookSemiProbe 同一手法）：插件初始化时聊天区还没渲染，
      // 一次性取样只会得到 0 个图标；等 DOM 稳定后再取，才能覆盖历史上出现过的各类活动。
      if (!zrDebug()) return;
      if (zrIconProbed) return;
      zrIconProbed = true;
      try {
        let sent = 0;
        const seen = {};
        const fire = function () {
          if (sent >= 6) return;
          const list = [];
          for (const el of Array.from(document.querySelectorAll('[data-step-process-icon]'))) {
            const btn = el.closest('[data-process-activity]');
            const act = btn ? btn.getAttribute('data-process-activity') : '?';
            const cs = getComputedStyle(el);
            const key = act + '=' + cs.color;
            if (seen[key]) continue;
            seen[key] = 1;
            list.push({ activity: act, color: cs.color, text: btn ? String(btn.innerText || '').slice(0, 16) : '' });
          }
          if (!list.length) return;
          sent++;
          fetch(REPORT_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-zhuoer-client': '1' },
            body: JSON.stringify({ at: new Date().toISOString(), phase: 'icon-probe', n: sent, icons: list }),
          }).catch(function () {});
        };
        zrProbeTimer(fire, 900);
        const root = document.body;
        if (root && typeof MutationObserver === 'function') {
          let t = 0;
          const mo = zrProbeObserver(new MutationObserver(function () { clearTimeout(t); t = setTimeout(fire, 1200); }));
          mo.observe(root, { childList: true, subtree: true });
          zrProbeTimer(function () { try { mo.disconnect(); } catch (e) { /* ignore */ } }, 120000);
        }
      } catch (e) { /* ignore */ }
    }

    // 面板切换后再取样：页面加载时看到的是聊天页，抓不到插件面板。
    let zrSemiHooked = false;
    function zrHookSemiProbe(scheme) {
      if (!zrDebug()) return;
      try {
        if (zrSemiHooked) return;
        zrSemiHooked = true;
        let sent = 0;
        let timer = 0;
        const fire = function () {
          if (sent >= 6) return;
          sent++;
          const semi = zrSemiProbe();
          try {
            fetch(REPORT_URL, {
              method: 'POST',
              headers: { 'content-type': 'application/json', 'x-zhuoer-client': '1' },
              body: JSON.stringify({ at: new Date().toISOString(), phase: 'semi-probe', scheme: scheme, n: sent, semi: semi }),
            }).catch(function () {});
          } catch (e) { /* ignore */ }
        };
        const root = document.querySelector('[class*="_centerCol"]');
        if (root && typeof MutationObserver === 'function') {
          const mo = zrProbeObserver(new MutationObserver(function () {
            clearTimeout(timer);
            timer = setTimeout(fire, 1500);
          }));
          mo.observe(root, { childList: true, subtree: true });
        }
        setTimeout(fire, 2500);
      } catch (e) { /* ignore */ }
    }

    // 版本号唯一源：面板文案与自检回传都用它，别再出现「构建 0.1.101」这种漂移。
    const PVERSION = '0.6.46';
    // 诊断探针总闸：默认关闭，开启方式 localStorage['dsh-zhuoer-theme:debug'] = '1'。
    // 下面若干探针会在每次 apply 时全文档遍历 DOM、逐元素 getComputedStyle、扫 styleSheets，
    // 是「启动 / 切主题卡顿」的主要来源之一，只在排障时打开。
    function zrDebug() {
      try { return window.localStorage.getItem('dsh-zhuoer-theme:debug') === '1'; } catch (e) { return false; }
    }
    report({ phase: 'bundle-evaluated' });
    report({ phase: 'factory-entered' });
    // 全局 error 监听：句柄留成模块级，apply() 里挂进 ctx.effect，卸载/HMR 时随 effect 回收（doctor K3）。
    const onWindowError = function (ev) {
      report({ phase: 'window-error', message: String((ev && ev.message) || ev).slice(0, 300), file: String((ev && ev.filename) || '').slice(0, 200), line: ev && ev.lineno });
    };

    