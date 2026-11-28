    /* ================= 首帧观测（排障用，默认关） =================
     * 回答一个问题：主题是「第一帧就在」，还是「先闪一下宿主默认色才到」。
     *
     * 测法只看一件事：**屏幕渲染出来的底色**随时间怎么变。
     * 为什么不能只看 token：token 落地 ≠ 画面变了；也不能只看「属性在插值」——
     * 入场动效那三次失败就是属性确实在动（opacity 0.54→0.97、translateY 11→0），
     * 但逐像素比对显示整屏 91% 的像素零变化，因为淡入层和底色是同一个颜色。
     * 属性插值 ≠ 画面变了；要回答「用户看到什么」，就得盯渲染结果。
     *
     * 三个数字：
     *   ① 闪不闪：首绘之后渲染底色有没有再变过
     *   ② 差多少：首绘时的底色 → 最终底色的 CIE76 ΔE
     *   ③ 多久：最后一次底色变化时刻 − 首绘时刻
     *
     * 结果落在两处：
     *   · 页面上：<script type="application/json" id="dsh-zhuoer-boot-probe">（DOM 标记，
     *     不挂 window —— 全局键门不允许插件状态挂 window，理由见 scripts/verify-globals.mjs）
     *   · 落盘：POST 到 /dsh-zhuoer-theme/api/report，phase=boot-probe，
     *     用 node scripts/boot-probe-report.mjs 读
     *
     * 用法：localStorage['dsh-zhuoer-theme:debug'] = '1' → 刷新。
     */
    const ZR_BOOT_PROBE_ID = 'dsh-zhuoer-boot-probe';
    // 模块作用域状态：热更新时新旧闭包各有一份，互不污染（这正是不挂 window 的理由）。
    let zrBootProbeState = null;

    function zrBootProbeColor(rgb) {
      const m = String(rgb || '').match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(',').map(function (x) { return parseFloat(x); });
      if (p.length < 3 || !isFinite(p[0])) return null;
      // 透明不算颜色：透明层的「屏幕颜色」来自它下面压着的那层。
      if (p.length > 3 && p[3] < 0.01) return null;
      return '#' + [p[0], p[1], p[2]].map(function (v) {
        return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
      }).join('');
    }

    // sRGB → Lab → CIE76 ΔE：只为了回答「两种底色差多少」，不需要更贵的色差公式。
    function zrBootDeltaE(a, b) {
      const toLab = function (hex) {
        const s = String(hex || '').trim().replace(/^#/, '');
        const full = s.length === 3 ? s.split('').map(function (c) { return c + c; }).join('') : s;
        if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
        const lin = [0, 2, 4].map(function (i) {
          const c = parseInt(full.slice(i, i + 2), 16) / 255;
          return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        const X = (lin[0] * 0.4124 + lin[1] * 0.3576 + lin[2] * 0.1805) / 0.95047;
        const Y = lin[0] * 0.2126 + lin[1] * 0.7152 + lin[2] * 0.0722;
        const Z = (lin[0] * 0.0193 + lin[1] * 0.1192 + lin[2] * 0.9505) / 1.08883;
        const f = function (t) { return t > 0.008856 ? Math.pow(t, 1 / 3) : 7.787 * t + 16 / 116; };
        const fx = f(X), fy = f(Y), fz = f(Z);
        return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
      };
      const la = toLab(a), lb = toLab(b);
      if (!la || !lb) return null;
      return Math.round(Math.sqrt(Math.pow(la[0] - lb[0], 2) + Math.pow(la[1] - lb[1], 2) + Math.pow(la[2] - lb[2], 2)) * 10) / 10;
    }

    function zrBootProbeMark(phase) {
      if (typeof zrDebug === 'function' && !zrDebug()) return;
      const P = zrBootProbeState;
      if (!P) return;
      const bg = (function () {
        try {
          return String(getComputedStyle(document.documentElement).getPropertyValue('--dsw-alias-bg-base') || '').trim();
        } catch (e) { return ''; }
      })();
      P.marks.push({ phase: phase, t: Math.round(performance.now()), bg: bg });
    }

    // 结果落到 DOM 标记：外部（控制台 / 采集脚本）读得到，又不往 window 挂状态。
    function zrBootProbePublish(result) {
      try {
        const json = JSON.stringify(result);
        let el = document.getElementById(ZR_BOOT_PROBE_ID);
        if (!el) {
          el = document.createElement('script');
          el.id = ZR_BOOT_PROBE_ID;
          el.type = 'application/json';
          (document.body || document.documentElement).appendChild(el);
        }
        el.textContent = json;
      } catch (e) { /* ignore */ }
      try { report({ phase: 'boot-probe', data: result }); } catch (e) { /* ignore */ }
    }

    function zrBootProbeStart() {
      // 诊断完成后闸门收回调试开关：常开会在每次启动跑一遍 rAF 采样 + 一次上报，
      // 对它要观测的那个时间窗反而添噪。
      if (typeof zrDebug === 'function' && !zrDebug()) return;
      const P = { paints: {}, marks: [], frames: [], done: false };
      zrBootProbeState = P;
      try {
        new PerformanceObserver(function (list) {
          const es = list.getEntries();
          for (let i = 0; i < es.length; i++) P.paints[es[i].name] = Math.round(es[i].startTime);
        }).observe({ type: 'paint', buffered: true });
      } catch (e) { /* 浏览器不支持 paint 观察就只报时间差 */ }

      // 「有效底色」= 从目标元素往上找，第一个不透明的 background-color——
      // 透明层的屏幕颜色来自它下面压着的那层，只看元素自己的 bg 会把透明当成黑色。
      const readRendered = function () {
        let el = null;
        try { el = document.querySelector('[class*="_centerCol"]'); } catch (e) { el = null; }
        if (!el) el = document.body;
        if (!el) return { where: 'none', color: null };
        const where = el === document.body ? 'body' : 'centerCol';
        let node = el;
        while (node && node.nodeType === 1) {
          try {
            const c = zrBootProbeColor(getComputedStyle(node).backgroundColor);
            if (c) return { where: where, color: c };
          } catch (e) { /* 继续上溯 */ }
          node = node.parentElement;
        }
        return { where: where, color: null };
      };

      const t0 = performance.now();
      const tick = function () {
        const now = performance.now();
        const r = readRendered();
        const last = P.frames[P.frames.length - 1];
        if (r.color && (!last || last.color !== r.color || last.where !== r.where)) {
          P.frames.push({ t: Math.round(now), where: r.where, color: r.color });
        }
        if (now - t0 < 3000) { requestAnimationFrame(tick); return; }

        P.done = true;
        // 首屏行检查：服务端推的那条 style 行到底在不在 head 里、有没有被解释器渲染。
        // 桌面端（file:// + IPC）走的是「页面侧解释器」而不是服务端拼 HTML，
        // 所以必须由页面自己回答「首屏里有没有那行」——这是桌面与 web 唯一的差别。
        try {
          const marker = 'dsh-zhuoer-boot-canvas';
          const styles = Array.from(document.head.querySelectorAll('style'));
          let found = null;
          for (const st of styles) {
            const t = st.textContent || '';
            if (t.indexOf(marker) >= 0) { found = t.slice(0, 260); break; }
          }
          P.bootRow = { present: !!found, text: found, styleCount: styles.length };
        } catch (e) { /* ignore */ }
        const paintAt = P.paints['first-contentful-paint'] !== undefined ? P.paints['first-contentful-paint'] : P.paints['first-paint'];
        // 目标切换（body → centerCol）不是颜色变化，分析时只用同一目标的那段序列。
        const where = P.frames.length ? P.frames[P.frames.length - 1].where : null;
        const seq = P.frames.filter(function (f) { return f.where === where; });
        const first = seq.length ? seq[0] : null;
        const lastF = seq.length ? seq[seq.length - 1] : null;
        let changedAt = null;
        for (let i = seq.length - 1; i > 0; i--) {
          if (seq[i].color !== seq[i - 1].color) { changedAt = seq[i].t; break; }
        }
        zrBootProbePublish({
          firstPaint: P.paints['first-paint'] !== undefined ? P.paints['first-paint'] : null,
          firstContentfulPaint: P.paints['first-contentful-paint'] !== undefined ? P.paints['first-contentful-paint'] : null,
          observedFrom: P.frames.length ? P.frames[0].t : null,
          themeLandedAt: changedAt,
          // 闪不闪：首绘之后渲染底色还变过没有（没变过 = false，不是 unknown）
          flashed: paintAt === undefined ? null : (changedAt !== null ? changedAt > paintAt : false),
          // 多久：最后一次底色变化 − 首绘
          flashMs: (changedAt !== null && paintAt !== undefined) ? (changedAt - paintAt) : null,
          firstColor: first ? first.color : null,
          lastColor: lastF ? lastF.color : null,
          deltaE: first && lastF ? zrBootDeltaE(first.color, lastF.color) : null,
          frames: P.frames.slice(0, 16),
          marks: P.marks.slice(0, 8),
          bootRow: P.bootRow || null,
        });
      };
      requestAnimationFrame(tick);
    }
    try { zrBootProbeStart(); } catch (e) { /* ignore */ }
