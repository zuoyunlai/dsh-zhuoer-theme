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

    // 步骤图标探针：报告图标元素的**实际计算颜色**，用来核对「语义色有没有真的上上去」。
    function zrIconProbe() {
      if (!zrDebug()) return;
      try {
        const list = [];
        const seen = {};
        for (const el of Array.from(document.querySelectorAll('[data-step-process-icon]'))) {
          const btn = el.closest('[data-process-activity]');
          const act = btn ? btn.getAttribute('data-process-activity') : '?';
          const cs = getComputedStyle(el);
          const key = act + '|' + cs.color;
          if (seen[key]) continue;
          seen[key] = 1;
          list.push({ activity: act, color: cs.color, text: btn ? String(btn.innerText || '').slice(0, 14) : '' });
        }
        fetch(REPORT_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-zhuoer-client': '1' },
          body: JSON.stringify({ at: new Date().toISOString(), phase: 'icon-probe', count: list.length, icons: list }),
        }).catch(function () {});
      } catch (e) { /* ignore */ }
    }

    // 面板切换后再取样：页面加载时看到的是聊天页，抓不到插件面板。
    function zrHookSemiProbe(scheme) {
      if (!zrDebug()) return;
      try {
        if (window.__zrSemiHooked) return;
        window.__zrSemiHooked = true;
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
          const mo = new MutationObserver(function () {
            clearTimeout(timer);
            timer = setTimeout(fire, 1500);
          });
          mo.observe(root, { childList: true, subtree: true });
        }
        setTimeout(fire, 2500);
      } catch (e) { /* ignore */ }
    }

    // 版本号唯一源：面板文案与自检回传都用它，别再出现「构建 0.1.101」这种漂移。
    const PVERSION = '0.6.34';
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

    