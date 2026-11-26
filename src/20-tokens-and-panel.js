    // 主题底图：静态资源走插件自己的 assets 路由（同 FONT_BASE），不再内联 base64。
    // 注意：宿主的插件资源路由只服务启动时已存在的文件，新增图片必须重启 DSH 才可访问。
    const BG_SOFT = {"absolutely":"/dsh-zhuoer-theme/assets/bg/bg-soft-absolutely.webp","knot":"/dsh-zhuoer-theme/assets/bg/bg-soft-knot.webp","beacon":"/dsh-zhuoer-theme/assets/bg/bg-soft-beacon.webp","zhuoer":"/dsh-zhuoer-theme/assets/bg/bg-soft-zhuoer.webp","crt":"/dsh-zhuoer-theme/assets/bg/bg-soft-crt.webp","dash":"/dsh-zhuoer-theme/assets/bg/bg-soft-dash.webp","manuscript":"/dsh-zhuoer-theme/assets/bg/bg-soft-manuscript.webp","miami":"/dsh-zhuoer-theme/assets/bg/bg-soft-miami.webp","phosphor":"/dsh-zhuoer-theme/assets/bg/bg-soft-phosphor.webp","rose":"/dsh-zhuoer-theme/assets/bg/bg-soft-rose.webp","tide":"/dsh-zhuoer-theme/assets/bg/bg-soft-tide.webp","vintage-paper":"/dsh-zhuoer-theme/assets/bg/bg-soft-vintage-paper.webp"};;
    const BG = {"zhuoer":"/dsh-zhuoer-theme/assets/bg/bg-zhuoer.webp","knot":"/dsh-zhuoer-theme/assets/bg/bg-knot.webp","dash":"/dsh-zhuoer-theme/assets/bg/bg-dash.webp","absolutely":"/dsh-zhuoer-theme/assets/bg/bg-absolutely.webp","tide":"/dsh-zhuoer-theme/assets/bg/bg-tide.webp","beacon":"/dsh-zhuoer-theme/assets/bg/bg-beacon.webp","phosphor":"/dsh-zhuoer-theme/assets/bg/bg-phosphor.webp","crt":"/dsh-zhuoer-theme/assets/bg/bg-crt.webp","manuscript":"/dsh-zhuoer-theme/assets/bg/bg-manuscript.webp","rose":"/dsh-zhuoer-theme/assets/bg/bg-rose.webp","miami":"/dsh-zhuoer-theme/assets/bg/bg-miami.webp","vintage-paper":"/dsh-zhuoer-theme/assets/bg/bg-vintage-paper.webp"};;

    function ensureStyleById(id) {
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement('style');
        el.id = id;
      }
      (document.head || document.documentElement).appendChild(el);
      return el;
    }

    function ensureStyle() {
      let el = document.getElementById(STYLE_ID);
      if (!el) {
        el = document.createElement('style');
        el.id = STYLE_ID;
      }
      // 每次都移到 head 末尾：与 dsh-theme-palette 这类同样用 *{...!important}
      // 覆盖 CSS 变量的插件共存时，同优先级下是"后写者赢"。
      // 两个插件都装时主题会互相压，把我们的规则始终放在最后能保证自己的配色生效。
      (document.head || document.documentElement).appendChild(el);
      return el;
    }

    // 面板要按「当前实际明暗」取色（主题卡预览、强调色色板），但设置面板拿不到
    // ctx.theme。applyTokens 每次都算出了 scheme，这里共享出来给面板读。
    let liveScheme = 'dark';
// 当前 body{zoom} 的缩放比（1 = 未缩放）。拖拽高亮条挂在 body 下，会被这个 zoom 再缩一次，
// 所以定位时必须把 getBoundingClientRect 的视觉像素除以它。
// 不要用 getComputedStyle(body).zoom 现取：Chromium 对这条非标准属性返回值不可靠（常是 "normal"/"1"），
// 取不到就等于没补偿——这正是「大字号下亮条偏右一百多像素」的直接原因。
let ZR_SCALE = 1;
// 上一次界面文字缩放的结果（面板用它给用户可见的失败反馈）
let HOST_TEXT_STATS = null;

    // 预览路径（编辑器 / 取色器 / 滑块）此前传 null，导致 overrideTokens 拿不到服务、抛错被吞，
    // 编辑期间只剩 CSS 兜底层。这里留一个模块级引用，任何调用点都能拿到宿主主题服务。
    let themeRef = null;

    // 预览路径（取色器拖动、滑块、颜色输入）每个事件都会触发一次完整 apply，
    // 用 rAF 合并成「每帧至多一次」，拖动时不再重建几十次样式表。
    let previewPending = null;
    let previewRaf = 0;
    function schedulePreview(spec) {
      previewPending = spec;
      if (previewRaf) return;
      previewRaf = window.requestAnimationFrame(function () {
        previewRaf = 0;
        const s = previewPending;
        previewPending = null;
        try { applyTokens(themeRef, s); } catch (e) { /* ignore */ }
      });
    }

    // 从「正文色 + 底色」现算表面填充：侧栏 / 顶栏 / 窗口按钮区 / 导轨 / 外框。
    // 抽出来的理由：这五条是纯函数（只读 tokens、只写 tokens），不碰 DOM、不读 pref，
    // 埋在 applyTokens 中间既难读也没法单独验证。系数注释随实现一起搬，避免两处漂移。
    function applySurfaceFills(tokens) {
      const text = tokens['--dsw-alias-label-primary'] || tokens['--dsw-alias-brand-primary'];
      const base = tokens['--dsw-alias-bg-base'];
      const toRgb = function (c) {
        const m = String(c || '').trim().match(/^#([0-9a-f]{6})$/i);
        if (!m) return null;
        return [0, 2, 4].map(function (i) { return parseInt(m[1].slice(i, i + 2), 16); });
      };
      const hex = function (arr) {
        return '#' + arr.map(function (v) {
          return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
        }).join('');
      };
      const T = toRgb(text), B = toRgb(base);
      if (!T || !B) return;
      // 侧栏 4% 正文色混入底色：对应宿主原来的 color-mix(text 4%, bg-content)，
      // 必须按「我们实际渲染的底色」现算，否则像 zhuoer 这种改过底色的主题，
      // 硬编码的 sidebar-fill 会比底色更暗，顶部就成了一条黑边。
      tokens['--dsw-specific-sidebar-fill'] = hex(T.map(function (v, i) { return v * 0.04 + B[i] * 0.96; }));
      // 顶栏 10%（比侧栏明显亮一档，用户要求）；右上窗口按钮区约 5%（由实测反推）。
      // 窗口按钮是 Windows 原生绘制的（Electron titleBarOverlay），插件改不了它的底色，
      // 所以不在整条上妥协，而是靠更宽的水平渐变把亮顶栏平滑收敛到按钮色。
      tokens['--zr-topbar-fill'] = hex(T.map(function (v, i) { return v * 0.10 + B[i] * 0.90; }));
      tokens['--zr-frame-fill'] = hex(T.map(function (v, i) { return v * 0.10 + B[i] * 0.90; }));
      tokens['--zr-btn-fill-base'] = hex(T.map(function (v, i) { return v * 0.05 + B[i] * 0.95; }));
      tokens['--zr-rail-fill'] = hex(B.map(function (v) { return v * 0.82; }));
    }

    // 阴影三档 + shadow-lv3。自定义主题的 id（c1:dark 之类）不在 SHADOWS 里，
    // 调用方传入的是 effectiveThemeId（克隆来源），否则整段覆盖被跳过、回落到 themes.mjs 原值
    // —— 实测 manuscript 深色 panel 阴影因此偏重 8.3 倍。
    function applyElevations(tokens, effTheme, scheme) {
      const sh = SHADOWS[effTheme];
      if (!sh) return;
      const k = SHADOW_STRENGTH[scheme] || SHADOW_STRENGTH.dark;
      tokens['--dsw-elevation-soft'] = scaleShadow(sh.sm, k);
      tokens['--dsw-elevation-panel'] = scaleShadow(sh.lg, k);
      tokens['--dsw-elevation-prominent'] = scaleShadow(sh.xl, k);
      tokens['--dsw-shadow-lv3'] = scaleShadow(sh.lg, k);
    }

    // 带 !important 的变量声明串。写在 html,body 上压过宿主同名定义（DSH 在 body 上也有一份）。
    function importantDecls(tokens) {
      return Object.keys(tokens).map(function (k) {
        return k + ':' + tokens[k] + ' !important;';
      }).join('');
    }

    // —— 纯 CSS 构造器（0.6.8 从 applyTokens 抽出）——
// 这三块只是字符串拼装：不碰 document、不持有生命周期、输出只由入参决定，
// 抽出来之后才能单独核对「改写前后发出去的 CSS 字面量没变」。
// 剩下的仍是注入 / MutationObserver / dispose 那半边，**刻意没动**（见 docs/backlog.md 第 1 条）。
function extraCssFor() {
  // 宿主菜单的 class 是 CSS Modules 哈希（.Luqt-a_menu 之类），各组件命名不一致，
  // 只认一个形态会漏，所以三种子串都覆盖；排除宠物插件自己的菜单与本面板自己的类。
  var menuFix =
    '[role="menu"]:not(.dsh-pet-menu):not([class*="zp-"]),' +
    '[class*="_menu"]:not(.dsh-pet-menu):not([class*="zp-"]),' +
    '[class*="-menu"]:not(.dsh-pet-menu):not([class*="zp-"]):not([class*="dsh-pet"])' +
    '{background-color:var(--dsw-specific-menu) !important;}';
  return menuFix +
    ' [class*="_markdown_"] :not(pre) > code{background:var(--dsw-alias-markdown-inline-code) !important;}' +
    ' [class*="_markdown_"] .md-code-block{background:var(--dsw-alias-markdown-code-block) !important;}' +
    ' [class*="_markdown_"] pre{background:transparent !important;}';
}

// 品牌位：宿主左上角徽标是内联 <svg>，内部含 #dsh-wordmark-badge-clip。
// SVG 子节点只认 fill / stroke，不认 background，也没法塞文字 —— 换图只有一条路：
// 内部节点置透明，再给 <svg> 这个 HTML 盒子铺背景图。
// 来源优先级：用户上传 > 主题自带 logo；开了但没选图 = 用自带的，不是「不生效」。
function brandCssFor(pref) {
  var src = pref.brandLogo ? (pref.brandImage || BRAND_LOGO) : '';
  if (!src) return '';
  return 'html svg:has(#dsh-wordmark-badge-clip)>*{opacity:0 !important;}'
    + 'html svg:has(#dsh-wordmark-badge-clip){background-image:url("' + src + '") !important;'
    + 'background-size:contain !important;background-position:left center !important;'
    + 'background-repeat:no-repeat !important;}';
}

// 主题底图：蒙层色跟随明暗（之前写死深色，浅色模式一片灰），
// 图片挂在 _mainPanel 的 ::before 上，会话内层 _root 必须透明，否则图被整片盖住。
function bgCssFor(o) {
  var bgUrl = o.bgUrl;
  if (!bgUrl) return '';
  var bgOpacity = o.bgOpacity;
  var bgStyle = o.bgStyle;
  var tokens = o.tokens;
  var scheme = o.scheme;
  var fbase = (function () {
    var raw = String(tokens['--dsw-alias-bg-base'] || '');
    var m = raw.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) {
      var conv = hexToRgba(raw, 1);
      m = conv ? String(conv).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/) : null;
    }
    return m ? (m[1] + ',' + m[2] + ',' + m[3]) : (scheme === 'light' ? '244,241,236' : '14,16,21');
  })();
  // 可见度滑块接到图片上：Zhuoer full-bleed 实测 opacity = 可见度 × 0.7（85% → 0.595）。
  var vis = Math.max(0, Math.min(100, bgOpacity)) / 100;
  var imgOpacity = +(vis * 0.7).toFixed(3);
  // 淡化：另加一层垂直渐隐遮罩做出「边缘化开」；Zhuoer 的 faded 靠面板层不透明压暗，
  // 我们的内容层是透明的，直接照抄会更浓，所以用 mask 达到同样效果。
  var fadeMask = bgStyle === 'fade'
    ? '-webkit-mask-image:linear-gradient(180deg,#000 0%,#000 42%,rgba(0,0,0,.55) 74%,transparent 100%) !important;mask-image:linear-gradient(180deg,#000 0%,#000 42%,rgba(0,0,0,.55) 74%,transparent 100%) !important;'
    : '';
  return '[class*="_centerCol"],[class*="_mainPanel"]{background-color:var(--dsw-alias-bg-base) !important;background-image:none !important;position:relative !important;isolation:isolate !important;}'
    + '[class*="_centerCol"]::before,[class*="_mainPanel"]::before{content:"" !important;position:absolute !important;inset:0 !important;background-image:url("' + bgUrl + '") !important;background-size:cover !important;background-position:50% 0% !important;background-repeat:no-repeat !important;opacity:' + imgOpacity + ' !important;' + fadeMask + 'pointer-events:none !important;z-index:0 !important;}'
    + '[class*="_centerCol"] [class*="_root"],[class*="_mainPanel"] [class*="_root"]{background-color:transparent !important;}'
    + 'html[data-zr-state="empty"][data-zr-bg-empty="0"] [class*="_centerCol"]::before,html[data-zr-state="empty"][data-zr-bg-empty="0"] [class*="_mainPanel"]::before,html[data-zr-state="session"][data-zr-bg-session="0"] [class*="_centerCol"]::before,html[data-zr-state="session"][data-zr-bg-session="0"] [class*="_mainPanel"]::before{display:none !important;}';
}

function applyTokens(theme, pref) {
      theme = theme || themeRef;
      const scheme = resolveScheme(pref.mode, theme);
      liveScheme = scheme;
      const tokens = Object.assign({}, tokensForPref(pref, scheme));
      // 自定义主题的 SHAPES / FONTS / 底图都按它克隆的 base 查（自定义 id 在那些表里不存在）
      const effTheme = effectiveThemeId(pref);
      // 用户强调色：必须写进 tokens，否则 extra 的 * {…!important} 兜底层会把主题旧色压在按钮上
      const shape = SHAPES[effTheme];
      if (shape) Object.keys(shape).forEach(function (k) { tokens[k] = shape[k]; });
      const fnt = FONTS[effTheme];
      if (fnt && (fnt.body || fnt.chat)) {
        Object.keys(tokens).forEach(function (k) {
          if (!/^--dsw-font/.test(k)) return;
          const isMarkdown = /-markdown/.test(k);
          if (isMarkdown && fnt.chat) tokens[k] = swapFamily(tokens[k], fnt.chat);
          else if (!isMarkdown && fnt.body) tokens[k] = swapFamily(tokens[k], fnt.body);
        });
      }
      // 字号缩放（替代 body{zoom}）：只放大 --dsw-font-* 里的 px，不动布局宽高。
      // 这样侧栏把手仍在原位，宿主拖拽的坐标对账不会错。
      const fsK = (pref.fontScale && pref.fontScale !== 100) ? (pref.fontScale / 100) : 1;
      if (fsK !== 1) {
        Object.keys(tokens).forEach(function (key) {
          if (!/^--dsw-font/.test(key)) return;
          const v = String(tokens[key]);
          tokens[key] = v.replace(/(\d+(?:\.\d+)?)px/g, function (m, n) {
            return (Math.round(parseFloat(n) * fsK * 100) / 100) + 'px';
          });
        });
      }
      // 界面文字缩放：宿主侧栏/按钮/列表的字号是**字面量 px**，既不读 token 也不读
      // --dsh-content-font-*。唯一不改几何的放大办法是读宿主的样式表（CSSOM 同源可读），
      // 把每条「font-size: Npx」规则按比例重写成 !important 覆盖。
      // 这样文字的盒子会重排，但元素的**位置坐标**没有任何变换，侧栏拖拽的命中判定不受影响。
      const applyHostTextScale = function (k) {
        try {
          const id = STYLE_ID + '-hosttext';
          const dropAll = function () {
            try { const o = document.getElementById(id); if (o && o.parentNode) o.parentNode.removeChild(o); } catch (e) { /* ignore */ }
            try { document.querySelectorAll('style[data-zr-hosttext]').forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); }); } catch (e) { /* ignore */ }
          };
          if (!(k > 0) || k === 1) { dropAll(); HOST_TEXT_STATS = null; return; }
          if (!document.head) return;
          let el = document.getElementById(id);
          if (!el) { el = document.createElement('style'); el.id = id; document.head.appendChild(el); }
          if (el.__zrK === k) return;
          const stats = { sheets: 0, adopted: 0, rules: 0, shadowRoots: 0, shadowRules: 0, capped: false };
          const build = function (sheets) {
            const out = [];
            const walk = function (list) {
              for (let i = 0; i < list.length; i++) {
                const r = list[i];
                if (r.cssRules) { walk(r.cssRules); continue; }
                if (!r.selectorText || !r.style) continue;
                if (r.selectorText.indexOf('.zp-') >= 0) continue;
                const fs = r.style.fontSize;
                if (!/^\d+(\.\d+)?px$/.test(fs)) continue;
                if (out.length >= 8000) { stats.capped = true; return; }
                out.push(r.selectorText + '{font-size:' + (Math.round(parseFloat(fs) * k * 100) / 100) + 'px !important;}');
              }
            };
            for (let s = 0; s < sheets.length; s++) {
              try {
                const sh = sheets[s];
                const own = sh.ownerNode;
                if (own && ((own.id === id) || (own.getAttribute && own.getAttribute('data-zr-hosttext')))) continue;
                if (sh.cssRules) walk(sh.cssRules);
              } catch (e) { /* 跨源表不可读，跳过 */ }
            }
            return out;
          };
          const docSheets = Array.prototype.slice.call(document.styleSheets || []);
          const docAdopted = Array.prototype.slice.call(document.adoptedStyleSheets || []);
          stats.sheets = docSheets.length;
          stats.adopted = docAdopted.length;
          // 兜底：真实客户端里 CSSOM 常常一条 font-size 都读不到（面板此前就显示「未生效」），
          // 而宿主 CSS 里明确有 1700+ 条 px 字号。于是构建期用 gen-host-text.mjs 把规则抽成静态表，
          // 运行期在 CSSOM 读空时直接用它——不依赖任何样式表可读性。
          const fromTable = function () {
            if (typeof HOST_TEXT_RULES === 'undefined' || !HOST_TEXT_RULES.length) return null;
            const out = [];
            for (let i = 0; i < HOST_TEXT_RULES.length; i++) {
              const row = HOST_TEXT_RULES[i];
              out.push(row[0] + '{font-size:' + (Math.round(row[1] * k * 100) / 100) + 'px !important;}');
            }
            return out;
          };
          let main = build(docSheets.concat(docAdopted));
          stats.mode = 'cssom';
          if (main.length < 20) {
            const tbl = fromTable();
            if (tbl) { main = tbl; stats.mode = 'table'; }
          }
          el.textContent = main.join('');
          el.__zrK = k;
          stats.rules = main.length;
          // Shadow DOM：document 的样式表管不到 shadow root，必须往每个 root 里插一份
          try {
            const hosts = document.querySelectorAll('*');
            for (let i = 0; i < hosts.length; i++) {
              const root = hosts[i].shadowRoot;
              if (!root) continue;
              stats.shadowRoots++;
              try {
                const sheets = [];
                if (root.styleSheets) for (let s = 0; s < root.styleSheets.length; s++) sheets.push(root.styleSheets[s]);
                const ad = root.adoptedStyleSheets || [];
                for (let s = 0; s < ad.length; s++) sheets.push(ad[s]);
                let rules = build(sheets);
                if (rules.length < 20) { const tbl = fromTable(); if (tbl) rules = tbl; }
                stats.shadowRules += rules.length;
                const prev = root.querySelector ? root.querySelector('style[data-zr-hosttext]') : null;
                if (!rules.length) { if (prev && prev.parentNode) prev.parentNode.removeChild(prev); continue; }
                let sh = prev;
                if (!sh) { sh = document.createElement('style'); sh.setAttribute('data-zr-hosttext', '1'); root.appendChild(sh); }
                sh.textContent = rules.join('');
              } catch (e) { /* ignore */ }
            }
          } catch (e) { /* ignore */ }
          HOST_TEXT_STATS = stats;
          try { report({ phase: 'textscale', k: k, stats: stats }); } catch (e) { /* ignore */ }
        } catch (e) { /* ignore */ }
      };

      applyHostTextScale((pref.fontScale && pref.fontScale !== 100) ? (pref.fontScale / 100) : 1);
      // 自定义主题可单独指定字体（空则沿用 base 主题算出来的那一套）
      const csFont = customSpec(pref);
      if (csFont && csFont.font && (csFont.font.body || csFont.font.chat)) {
        Object.keys(tokens).forEach(function (k) {
          if (!/^--dsw-font/.test(k)) return;
          const isMd = /-markdown/.test(k);
          const fam = isMd ? csFont.font.chat : csFont.font.body;
          if (!fam) return;
          // 下拉里存的只是族名：没有 generic，也没有中文回退。以前只换族名，导致自选字体的中文
          // 落到系统雅黑/宋体，与主题自带用字不一致。这里补 generic 再走一次 withCJK。
          const stack = /(?:sans-serif|serif|monospace)\s*$/.test(fam) ? fam : fam + ', sans-serif';
          tokens[k] = swapFamily(tokens[k], withCJK(stack));
        });
      }
      // 圆角：按 base 主题的现值等比缩放（--dsw-radius-* 不在 alias 白名单里，单独算）
      // 卡片/对话框的 28px 在 DSH 里是写死的，不读 --dsw-radius-*，只能靠变量单独接管。
      // 关键：--zr-card-radius 必须**无条件定义**（主栏另有一条常量直角规则，不用变量）。
      // var() 指向未定义的自定义属性时，整条声明在「计算值阶段」失效，border-radius
      // 会取初始值 0 —— 不是注释里曾以为的「声明被丢弃、回落到上一个值」。
      // 于是默认圆角档（scale=1）全站卡片直接变直角。实测踩过一次，别再挪回 if 里。
      // 宿主原生圆角刻度（实测 app.asar：xs4 / sm8 / md12 / lg16 / xl20 / panel28）。
      // themes.mjs 原来带一套 6/6/10/14/20 的占位值，跟宿主对不上（连 xs/sm 都相等），
      // 导致「默认圆角」也在扭曲 DSH 的刻度 —— 那 5 个 key 已从主题数据里删除。
      // 现在的语义：默认档 = 不动，宿主原生值直接生效；其它档 = 以原生值为基准缩放。
      // crt 的 SHAPES 会先把更小的值写进 tokens，缩放就以它为准（主题特性保留）。
      const RADIUS_BASE = {
        '--dsw-radius-xs': 4, '--dsw-radius-sm': 8, '--dsw-radius-md': 12,
        '--dsw-radius-lg': 16, '--dsw-radius-xl': 20, '--dsw-radius-panel': 28,
      };
      const rScale = csFont && typeof csFont.radiusScale === 'number' ? csFont.radiusScale : 1;
      // 基准从宿主自己的圆角刻度取（--dsw-radius-panel，实测 28px）；
      // 写死 28 会让 crt 这类直角主题也拿到 28px 卡片。
      const panelBase = (function () {
        const m = String(tokens['--dsw-radius-panel'] || '').match(/(\d+(?:\.\d+)?)px/);
        return m ? parseFloat(m[1]) : 28;
      })();
      tokens['--zr-card-radius'] = Math.round(panelBase * rScale) + 'px';
      if (rScale !== 1) {
        Object.keys(RADIUS_BASE).forEach(function (k) {
          const m = String(tokens[k] || '').match(/^(\d+(?:\.\d+)?)px$/);
          const base = m ? parseFloat(m[1]) : RADIUS_BASE[k];
          tokens[k] = Math.round(base * rScale * 10) / 10 + 'px';
        });
      }
      // 所有主题的字体统一接中文回退（含 themes.mjs 里已转好的 DM Sans / Lora / IBM Plex 等）
      Object.keys(tokens).forEach(function (k) {
        if (/^--dsw-font/.test(k)) tokens[k] = withCJK(tokens[k]);
      });
      // 桌面端标题栏（window titlebar）走 --dsw-specific-sidebar-fill；Zhuoer 的竖条色是
      // color-mix(text 4%, bg-content)，必须按「我们实际渲染的底色」现算，否则像 zhuoer 这种
      // 改过底色的主题，硬编码的 sidebar-fill 会比底色更暗，顶部就成了一条黑边。
      applySurfaceFills(tokens);
      applyElevations(tokens, effTheme, scheme);
      if (pref.accent) {
        ['--dsw-alias-button-primary-fill', '--dsw-alias-button-primary-hover',
         '--dsw-alias-button-info-fill', '--dsw-alias-button-info-hover',
         '--dsw-alias-brand-primary', '--dsw-alias-brand-text',
         '--dsw-alias-state-business-primary', '--dsw-alias-brand-primary-invert',
         '--dsw-alias-trajectory-accent', '--dsw-alias-onboarding-accent',
         '--dsw-alias-brand-primary-new-colorprimary-new-color'].forEach(function (v) { tokens[v] = pref.accent; });
      }
      // 强调色是在 buildCustomTokens 之后才写进 token 的，这里再收口一次（幂等）。
      ensureReadableOn(tokens);
      // 背景：主题自带底图或用户上传图。启用时把内容底色改成半透明，让底图透出来。
      let bgUrl = '';
      let bgOpacity = pref.bgOpacity;
      let bgStyle = pref.bgStyle;
      // 自定义主题可以自带底图；source 为空表示跟随全局底图设置。
      // 图片本身存在 IndexedDB，这里只按引用键从内存缓存取（IDB 是异步的，不能在这里 await）。
      const specBg = (customSpec(pref) && customSpec(pref).bg) || null;
      // 只打包了 dark 底图；light 模式复用同一张并做提亮，避免额外 11 张资源
      const themeBgFor = function () {
        return (scheme === 'light' ? (BG_SOFT[effTheme] || BG[effTheme]) : BG[effTheme]) || '';
      };
      if (specBg && specBg.source) {
        if (typeof specBg.opacity === 'number') bgOpacity = specBg.opacity;
        if (specBg.style) bgStyle = specBg.style;
        if (specBg.source === 'theme') bgUrl = themeBgFor();
        else if (specBg.source === 'image' && specBg.key) bgUrl = imageCache.get(specBg.key) || '';
        // source === 'none' → 该主题明确不要底图
      } else if (pref.bgSource === 'theme') bgUrl = themeBgFor();
      else if (pref.bgSource === 'image' && pref.bgImage) bgUrl = pref.bgImage;
      if (bgUrl) {
        // 主栏内层（_root）用 bg-base 填空，若它不透明就会把容器上的底图完全盖住。
        // 所以 bg-base 必须保持半透明；左栏用 bg-layer 系列，仍是实色，对比不受影响。
        // bg-base 必须半透明，否则主栏内层（_root）会用实色把容器上的底图盖住。
        // 明暗都适用：软图在浅色下是深灰线，透出后正好可见。
        // 图挂在伪元素上（opacity 0.7）与底色混合，底色必须保持实色；
        // 若这里再把 bg-base 改半透明，会变成「半透明底 + 半透明图」两层互透，糊成一片。
        // 底色由主题自身决定（zhuoer 深色 = #1a1210 暖棕），切换主题自动跟随。
      }
      // 字号缩放不在这里做。--dsw-font-* 是对话正文用的 shorthand token，
      // 宿主侧栏 / 按钮 / 面板的文字尺寸另有来源；只缩放这些 token 的结果
      // 就是「只有主栏正文变大」（0.4.1 的用户实测）。全局缩放见下面的 body{zoom}。
      // 每次 applyTokens 前先撤销上一次的 override。
      // 之前只存了 dispose 从不调用：如果宿主内部是按 SOURCE 累加而非替换，
      // 上一次主题里"这一次不再提供"的 token 就会留在页面上——
      // 表现出来就是切主题后仍带着上一套的色块（橙色选中条之类）。
      let dispose = function () {};
      // 宿主 overrideTokens 要求每个 token 是 { light, dark } 两槽；传裸字符串会被整批拒绝
      // （控制台会看到 "is a bare string — pass { light, dark }"）。我们按当前 scheme 已算好值，
      // 两槽写同一个值即可。
      const overrideMap = {};
      Object.keys(tokens).forEach(function (k) {
        overrideMap[k] = { light: tokens[k], dark: tokens[k] };
      });
      let overrideApplied = false;
      try {
        if (window.__zrSkinDispose) {
          try { window.__zrSkinDispose(); } catch (e) { /* 旧的已经不在了也无妨 */ }
          window.__zrSkinDispose = null;
        }
        dispose = theme.overrideTokens(SOURCE, overrideMap) || (function () {});
        window.__zrSkinDispose = dispose;
        overrideApplied = true;
      } catch (e) {
        try { console.warn('[zhuoer-theme] overrideTokens 失败', (e && e.message) || e); } catch (e2) { /* ignore */ }
      }
      // 兜底层：带 !important 的 CSS 变量表。
      // 与 dsh-theme-palette 等同样调用 overrideTokens 的插件共存时，
      // 运行时分层谁后压谁；!important 的自定义属性在层叠中优先级更高，不会被反复的 heal 覆盖。
      try {
        // 关键：DSH 在 body 上另有一份同名变量定义，只写 :root 会被 body 覆盖。
        // 因此同时覆盖 html 与 body，并带 !important 确保压过宿主的定义。
        const decls = importantDecls(tokens);
        // 自定义属性天生继承：写在 html,body 上，全部后代都能取到，不必逐元素命中。
        // 历史：这里原本是 '*{' + decls + '}'，想压过「容器自己重新定义」，代价是 230+ 个属性
        // 对全 DOM 每个元素各算一遍（样式共享失效、每次 apply 全量重算）。
        // 现在只补一条精准兜底：显式在 style 里写了这些变量的元素（真正的重新定义路径）。
        const css = 'html,body{' + decls + '}'
          + '[style*="--dsw-alias-"],[style*="--dsw-font-"]{' + decls + '}';
        // 直接覆盖 markdown 内联 code / 代码块背景：
        // dsh-theme-palette 会注入 [class*="_markdown_"] :not(pre) > code{background:var(--dshtp-code-inline)}
        // 且排在后面（同优先级后写者赢），必须用更高优先级的规则压过它。
        // 菜单定向兜底：DSH 的右键菜单（.Luqt-a_menu 一类）带 backdrop-filter，
        // 组件级还可能再写一次背景色，光靠变量 override 不一定压得住。
        // 这里直接给 role=menu 指回主题的菜单表面色，排除我们自己的宠物菜单。
        // 覆盖多种可能的选择器形态：DSH 的菜单 class 是 CSS Modules 哈希
        // （.Luqt-a_menu 之类），不同组件命名不一致，只认一个会漏。
        const extra = extraCssFor();;
        // 品牌位：宿主左上角那枚徽标是一个内联 <svg>，内部含 #dsh-wordmark-badge-clip。
        // SVG 子节点只认 fill / stroke，不认 background，也没法往里塞文字 —— 所以「换图」只有一条路：
        // 把内部节点置透明，再给 <svg> 这个 HTML 盒子铺背景图（svg 在 CSS 里就是个普通盒子）。
        // 盒子尺寸由宿主的 width/height 决定，用 contain + 贴左居中：比例不匹配时留白，不会裁切。
        // 来源优先级：用户上传的图 > 主题自带 logo。开但没选图 = 用自带的，不是「不生效」。
        const brandCss = brandCssFor(pref);
        const bgCss = bgCssFor({ bgUrl: bgUrl, bgOpacity: bgOpacity, bgStyle: bgStyle, tokens: tokens, scheme: scheme });
        // 文字大小 / 强调色 / 字体（照 Zhuoer 外观页的三组设置）
        let fxCss = '';
        // 主栏四个角永远是直角 —— 用户明确要求「无论何种主题、无论什么情况」。
        // 这是一条固定设计约束，不是「默认档的观感」：所以写常量 0，
        // 不接 --zr-panel-radius / --zr-card-radius / --dsw-radius-panel，
        // 也不跟圆角档位联动（上一版让它跟档位走，默认档就变圆角了，与预期相反）。
        // 只压这两个容器；对话框/菜单/卡片仍走 --zr-card-radius，照常跟随圆角设置。
        fxCss += 'html [class*="_centerCol"],html [class*="_mainPanel"]{border-radius:0 !important;}';
        // 桌面端顶部条 = _frame 顶部露出的部分（frame 铺满整个窗口），侧栏 _sidebarCol 自己刷同色。
        // 两条约束：① 不能改 frame 的 background-color（v33 那样会把整个主栏染色）；
        //          ② 只差一两个色阶肉眼看不出来（v35 的教训）。
        // 做法：侧栏压到暗一档；frame 只在前 N px 叠一条 linear-gradient 亮带（frame 是底层，
        // 渐变只覆盖顶部条范围，不会盖住主栏内容与底纹）。
        // 桌面标题栏的真身：DSH 自己用
        //   [data-windows-titlebar] .frame::before { height: var(--dsh-windows-titlebar-height);
        //                                            background: var(--dsw-specific-sidebar-fill) }
        // 画出那一 34px 高的拖拽条。所以只需改它的背景——只影响那一条，
        // 不碰 .frame 本体（v33 就是连本体一起刷，才把整个主栏染色）。
        // 标题栏条：左侧用亮一点的 --zr-topbar-fill，向右渐变到 sidebar-fill ——
        // 也就是右上角三个窗口按钮区（Electron 原生 titleBarOverlay）自己的底色。
        // 那三个按钮由 Windows 在窗口非客户区绘制、压在网页之上，CSS 永远改不到；
        // 但让条子右端收敛到同一个颜色，视觉上就是一条连续的顶栏，不再有一块断层。
        // z-index 是关键：::before 在 DOM 顺序上先于 centerCol，不加层级时会被
        // centerCol 自己的背景盖住，只剩侧栏上方那一段能看见。
        // 注意：linear-gradient 里任何一个 var() 解析为空，整条声明都会作废、背景退回透明，
        // 而 z-index:2 会让这层透明盖住下面的内容 —— 顶栏反而比侧栏更暗。所以色值写死，
        // 只保留 --zr-topbar-fill 作为可选覆盖（带真实 fallback）。
        // 顶栏配色一律由主题推导，不写死：
        //   1) 首选插件为当前主题算好的 --zr-topbar-fill；
        //   2) 万一该变量没注入，用宿主主题 token 现算（文字色 10% 混面板底色）——
        //      换主题时宿主 token 会变，所以照样跟随；
        //   3) 最后一条纯色只是极端兜底，正常情况下根本不会生效。
        // 右上三个按钮是 Windows 原生（Electron titleBarOverlay）绘制的，压在网页之上，
        // 插件改不到它自己的底色；能做的只有让紧邻它的那段顶栏精确收敛到同一个颜色，
        // 让分界看不出来。所以：收敛目标 = 窗口底色（overlay 用的就是它，不是侧栏色），
        // 收敛宽度优先用 env(titlebar-area-width) 自动对齐原生按钮区，取不到再退回估算值。
        // 两层分开声明，互不重置：
        //   background-color  = 原生按钮区的颜色（实测 #221918，取自面板底色 token）
        //   background-image  = 左侧亮条 + 右端收敛到同一个按钮色
        // 渐变生效 → 亮条自然过渡进按钮区；渐变若失效 → 整条直接等于按钮色，
        // 也不会出现"亮条紧贴一个暗块"的断层。
        // 顶栏要同时满足两件事：① 比侧栏亮一点（层次）；② 紧邻窗口按钮区那一段必须与按钮区同色。
        // 实测：宿主把「量到的 --dsw-specific-sidebar-fill」通过 windowsAppearance IPC 推给原生
        // titleBarOverlay（zhuoer 深色 #15171c，与截图按钮区像素一致），而按钮区从窗口右缘往左
        // 约 264px 就开始覆盖。原实现让渐变在「第 100% 像素」才收敛，所以 264px 处还没收敛完，
        // 留下一条硬边。
        // 现在的形状：亮带 → 在离右缘 560px 处开始过渡 → 到 320px 处完全变成按钮色 → 最后 320px
        // 保持纯按钮色（320 > 264，留了 56px 余量）。这样既有亮带，又保证覆盖边界落在纯色区里。
        // --zr-topbar-hold 可调那 320px：换到更高 DPI 若按钮区变宽（按钮宽随缩放变大），
        // 把这个值调大即可；调小到 <264 就会重新出现硬边。
        fxCss += 'html[data-windows-titlebar] [class*="_frame"]::before{'
          + '--zr-btn-fill:var(--zr-titlebar-btn-fill,'
          + ' var(--dsw-specific-sidebar-fill, #15171c));'
          + '--zr-topbar-band:var(--zr-topbar-fill, #2a2322);'
          + '--zr-topbar-hold:var(--zr-topbar-hold-px, 320px);'
          + 'z-index:2 !important;'
          + 'background-color:var(--zr-btn-fill) !important;'
          + 'background-image:linear-gradient(to right,'
          + 'var(--zr-topbar-band) 0,'
          + 'var(--zr-topbar-band) calc(100% - 560px),'
          + 'var(--zr-btn-fill) calc(100% - var(--zr-topbar-hold)),'
          + 'var(--zr-btn-fill) 100%) !important;}';
        // 右上角最小化/最大化/关闭那一组按钮自绘在 [data-window-drag-controls] 容器里，
        // 容器自己带底色，会盖住上面那条亮色。把它的背景清成透明，让 ::before 的亮色透出来。
        // 按钮本身（svg / path）不受影响，点击区域与 app-region 也不变。
        fxCss += 'html[data-windows-titlebar] [data-window-drag-controls],'
          + 'html[data-windows-titlebar] [data-window-drag-controls] > *{background-color:transparent !important;}';
        // M2（语义选择器）弹层圆角统一：宿主把 role 直接放在盒子本身上
        //   dialog  -> div[role="dialog"][aria-modal="true"]
        //   menu    -> div[role="menu"]（含 submenu）
        //   tooltip -> div[role="tooltip"]
        // 只改圆角，不动尺寸/内边距/定位；圆角取形状预设的 radius token，方角预设自动得到直角。
        fxCss += 'html [role="dialog"]{border-radius:var(--dsw-radius-panel,12px) !important;}'
          + 'html [role="menu"]{border-radius:var(--dsw-radius-lg,10px) !important;}'
          + 'html [role="tooltip"]{border-radius:var(--dsw-radius-sm,6px) !important;}';
        // M2：开关（button[role="switch"] + 内层 span 是滑块）。滑块颜色本来就是 token
        // （--dsw-alias-switch-thumb，已建模），这里只补形状与过渡：
        // 轨道圆角跟随形状预设，滑块用 inherit 与之配套；过渡 160ms，尊重「减少动态效果」。
        fxCss += 'html [role="switch"]{border-radius:var(--dsw-radius-lg,10px) !important;}'
          + 'html [role="switch"]>span{border-radius:inherit !important;'
          + 'transition:transform .16s cubic-bezier(.2,.8,.2,1),background-color .16s ease;}'
          + '@media (prefers-reduced-motion:reduce){html [role="switch"]>span{transition:none !important;}}';
        // M2：焦点环统一成主题的 brand-primary。宿主自己有一条策略——
        //   html[data-input-modality='pointer'] body :focus-visible { outline-color: transparent }
        // 那是它刻意「鼠标点击不留焦点环」的设计，不能覆盖。所以这里显式排除 pointer 模态，
        // 只在键盘（Tab）语境下接管，且不改宽度/偏移（用宿主自己的 2px/2px）。
        fxCss += 'html:not([data-input-modality="pointer"]) body :focus-visible{'
          + 'outline-color:var(--dsw-alias-brand-primary) !important;}';
        // 硬边档补充（M3：第三方插件自有类名，不是宿主哈希）：左侧栏「任务 / 定时」这类
        // 分段控件自己带 !important 与 inset 描边，token 到不了：
        //   容器  -> border-radius: var(--dsw-radius-sm,8px) + box-shadow: inset 0 0 0 .5px（那条 inset 就是外框线）
        //   指示块 -> border-radius:6px !important + border:.5px solid（选中态那圈线）
        // 所以只在 data-zr-sharp（radius 全 0 的硬边主题）下接管：圆角归 0、线全去掉，
        // 选中态靠底色区分。圆角主题一个字不受影响。
        fxCss += 'html[data-zr-sharp] .dsh-st-shell-segmented-tabs,'
          + 'html[data-zr-sharp] .dsh-st-settings-tabs{'
          + 'border-radius:0 !important;box-shadow:none !important;}'
          + 'html[data-zr-sharp] .dsh-st-shell-segmented-tabs>span[aria-hidden="true"],'
          + 'html[data-zr-sharp] .dsh-st-settings-tabs>span[aria-hidden="true"]{'
          + 'border-radius:0 !important;border:0 !important;box-shadow:none !important;}'
          + 'html[data-zr-sharp] .dsh-st-shell-segmented-tabs [role="tab"],'
          + 'html[data-zr-sharp] .dsh-st-settings-tabs [role="tab"]{'
          + 'border-radius:0 !important;border:0 !important;}';
        // 左右栏的拖拽分隔条：宿主实现是「元素宽 0 + ::before 画 0.5px 竖线」，
        // 命中区只有半像素，鼠标很难精确压住，所以拖动时也没有任何反馈。
        // 这里补两件事：
        //   1) ::after 撑出 4px 透明热区（absolute，不占布局），让边线变得好按；
        //   2) hover / 按住时把线换成本主题品牌色并加粗到 2px —— 颜色走 token，换主题自动跟。
        // 类名用 "ivider_" 而不是 "_divider_"：主布局是 _divider_，右侧 dock 是
        // _tabLayoutDivider_，两者只有 "ivider_" 这段共有，一条规则通吃。
        fxCss += 'html [class*="ivider_"]{position:relative;}'
          + 'html [class*="ivider_"]::after{content:"";position:absolute;top:0;bottom:0;left:-2px;width:4px;}'
          + 'html [class*="ivider_"]:hover::before,'
          + 'html [class*="ivider_"]:active::before{'
          + 'background:var(--dsw-alias-brand-primary) !important;'
          + 'width:2px !important;left:-1px !important;}';
        // 通用兜底：不认宿主的类名，只认 cursor。命中时由 JS 往 body 挂一根
        // fixed 高亮条（不碰宿主 DOM，避免 React 重渲染把节点吃掉）。
        fxCss += 'html .zp-rz-bar{position:fixed;width:2px;z-index:2147483000;pointer-events:none;'
          + 'background:var(--dsw-alias-brand-primary);opacity:0;transition:opacity .12s ease;}'
          + 'html .zp-rz-bar[data-on="1"]{opacity:1;}';
        // 对话轮次刻度尺挪到左边。注意：只改位置不够，内部是「按贴右设计」的，
        // 必须一并镜像三处，否则会出现「位置在左、朝向还朝右」的错位：
        //   1) 容器：宿主的 right:12px → right:auto + left:2px；
        //      选 nav[class*="_frame"] 而不是 [class*="_frame"]，后者会连主框架一起命中。
        //   2) 刻度条：._mark::before 原本 right:0 + transform-origin:100%（贴右、从右收缩），
        //      改成 left:0 + 0%，变成贴左、从左展开；focus 态的两条规则也要跟着镜像。
        //   3) 悬停预览：它是 nav 的直接子元素，位置由 JS 算成内联 left（固定发布在刻度尺
        //      左侧约 -310px）。左移后整块会弹到屏幕外 —— 用 transform 平移「自身宽 + 48px」
        //      （48 = 刻度尺宽 28 + 两侧各 10 的间隙），预览就改成朝右伸出。
        // 预览用 nav > 的选择器限定：页面里还有 _previewPrompt / _previewResponse 等同名族。
        // 品牌徽标（SVG）：底框是 <rect fill="currentColor">（= 正文色 label-primary），
        // 字母是 fill="var(--dsw-alias-label-primary-inverted)"。本主题里这两个值太接近
        // （深色 #bcbcc0 vs #f0f0f2、浅色两边都偏深），所以「HARNESS」在两个模式下都糊。
        // 正确的反白关系是「底=正文色、字=页面底色」，把字母改成 bg-base 后明暗自动成立；
        // CSS 的 fill 能压过 SVG 的 presentation attribute，不需要宿主配合。
        // 侧栏右缘竖线 —— Web 端与桌面端必须一致（用户实测对比过两端截图）。
        // Web 端那条线是 DSH 原生画的；桌面端没有，因为侧栏的 border-right-style 是 none、
        // 宽度 0。所以「只改 border-right-color」在桌面端永远画不出线，必须用 border-right
        // 简写把 宽度/样式/颜色 一起钉死（Web 端基线恰好是 1px solid，浏览器里看不出差别，
        // 这个坑只在桌面端暴露）。通贯整个窗口高度（含桌面端标题栏）。
        // 曾试过「border 透明 + 伪元素从标题栏下方起画」，顶部断了一截，已回退，别再改。
        // 默认按 border-l3 画（= Web 端原生那条的观感），所有主题通用；
        // 灯塔（beacon）的设计特征是高对比分隔线，再单独提到 border-l4。
        // 选择器用 html 前缀而不是 data-zr-base：自定义主题（marker 是 c1:dark 之类）也要有线。
        fxCss += 'html [class*="sidebarCol"]{'
          + 'border-right:1px solid var(--dsw-alias-border-l3,transparent) !important;}'
          + 'html[data-zr-base="beacon"] [class*="sidebarCol"]{'
          + 'border-right:1px solid var(--dsw-alias-border-l4,#9a9a9a) !important;}'
          // DSH 的对话卡片圆角是写死的 28px，不读 --dsw-radius-*，单独用变量接管。
          // var() 未定义时整条声明失效，所以内置主题不受影响。
          + '[class*="_card"],[class*="_card_"],[role="dialog"],[class*="_modal"]{'
          + 'border-radius:var(--zr-card-radius) !important;}'
        fxCss += 'html svg:has(#dsh-wordmark-badge-clip) [fill^="var(--dsw-alias-label-primary-inverted"]{'
          + 'fill:var(--dsw-alias-bg-base) !important;}'
          + 'html nav[class*="_frame"]{right:auto !important;left:2px !important;}'
          + 'html nav[class*="_frame"]>[class*="_preview"]{'
          + 'transform:translateX(calc(100% + 48px)) !important;}'
          + 'html [class*="_mark"]::before{right:auto !important;left:0 !important;'
          + 'transform-origin:0% center !important;}'
          + 'html [class*="_mark"]:focus-visible::before{transform:translateY(-50%) scaleX(1) !important;}'
          + 'html [class*="_mark"]:focus-visible::after{inset:0 auto 0 0 !important;}';
        ZR_SCALE = 1;
        // body{zoom} 已弃用：它会把布局坐标整体乘一个数，而宿主的侧栏拖拽是按 clientX 与列宽
        // 直接比较的，zoom≠1 时命中判定和宽度写回全部错位（表现为「点不中把手、拖的却是中栏」）。
        // 现在改用两条不改变布局坐标的通路：① 下面把 --dsw-font-* 里的 px 按比例放大；
        // ② 给宿主的 --dsh-content-font-* 变量赋值（宿主自己就用它算行高）。
        if (pref.fontScale && pref.fontScale !== 100) {
          const kk = pref.fontScale / 100;
          fxCss += ':root{'
            + '--dsh-content-font-size:calc(14px * ' + kk + ');'
            + '--dsh-content-font-size-secondary:calc(13px * ' + kk + ');'
            + '--dsh-content-font-delta:calc(14px * ' + (Math.round((kk - 1) * 1000) / 1000) + ');'
            + '--dsh-content-font-delta-secondary:calc(13px * ' + (Math.round((kk - 1) * 1000) / 1000) + ');'
            + '}';
        }
        // 对话正文宽度：宿主 CSS 是 var(--dsh-chat-user-width, clamp(...))，所以只要给这个变量赋值，
        // 就完全绕过它那套「按中栏宽度自我测量」的公式（实测那个公式会把宽度锁在下限附近）。
        // 上限跟着宿主自己的列宽变量走（列宽 − 176px，176 = 两侧手柄预留，宿主 CONTENT_EDGE_BUDGET），
        // 下限用宿主的 CONTENT_MIN = 640。全程只写一个自定义属性，不动任何布局尺寸。
        // 选择器用内联样式属性：宿主是把 --dsh-conversation-column-width 内联写在 _root 上的。
        // 对话正文宽度：宿主的公式会因自我测量把宽度锁在 680 下限附近（实测 683px），
        // 所以默认就覆盖成「最宽 920」，只在窗口真的放不下时按视口收窄——
        // 920 是宿主自己的上限（resolveContentWidth 的 Math.min(..., 920)），不是我拍的数。
        // 560 = 左侧栏(≈330) + 右侧快捷导航(≈40) + 宿主两侧手柄预留(176) + 余量。
        // 纯 CSS 推导，不需要监听 resize，也不写任何布局尺寸。
        {
          const want = pref.chatWidth && pref.chatWidth > 0 ? pref.chatWidth : 920;
          fxCss += '[style*="--dsh-conversation-column-width"]{--dsh-chat-user-width:'
            + 'max(640px,min(' + want + 'px,calc(100vw - 560px))) !important;}';
        }
        // 自愈：宿主的旧拖动值会以**内联样式**留在 _root 上，而清 localStorage 不会清它，
        // 于是出现「存储里没有键，但正文仍是旧宽度」。没有宿主偏好键时把残留内联值摘掉。
        try {
          const hostPrefKey = 'dsh.conversation.contentWidth';
          if (!window.localStorage.getItem(hostPrefKey)) {
            const stale = document.querySelectorAll('[style*="--dsh-chat-user-width"]');
            for (let i = 0; i < stale.length; i++) stale[i].style.removeProperty('--dsh-chat-user-width');
          }
        } catch (e) { /* ignore */ }
        if (pref.uiFont) {
          const fam = '"' + pref.uiFont.replace(/"/g, '') + '", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          // html body 提高特异性：宿主用 font shorthand 写在 body 上，单条 body 规则会被重置。
          fxCss += ':root{--dsw-font-family:' + fam + ' !important;}'
            + 'html body,html body [class*="_root"],html body [class*="_msg"],html body [class*="_content"]{font-family:' + fam + ' !important;}';
        }
        // 只在内容真的变了才重写：一次 textContent 赋值等于整表重新解析 + 全文档样式重算，
        // 而 apply 会被主题切换、底图可见度、字号滑块反复触发（每次 26–45 KB）。
        // @font-face 是常量：单独一张表，只写一次，避免每次 apply 把 4.6 MB 字体声明
        // 跟着 token 表一起重新解析。
        try {
          const fontEl = ensureStyleById(STYLE_ID + '-fonts');
          if (fontEl.__zrCss !== fontFaceCss) {
            fontEl.textContent = fontFaceCss;
            fontEl.__zrCss = fontFaceCss;
          }
        } catch (e) { /* ignore */ }
        const nextCss = css + extra + bgCss + fxCss + brandCss;
        const styleEl = ensureStyle();
        if (styleEl.__zrCss !== nextCss) {
          styleEl.textContent = nextCss;
          styleEl.__zrCss = nextCss;
        }
        // extra（菜单 / 代码块定向修正）最容易被别的插件压掉：各自 <style> 后插入就赢。
        // adoptedStyleSheets 排在文档样式表之后，同优先级稳定胜出；不支持的环境退回 <style>。
        try {
          if (document.adoptedStyleSheets && typeof CSSStyleSheet === 'function') {
            if (!window.__zrExtraSheet) {
              window.__zrExtraSheet = new CSSStyleSheet();
              document.adoptedStyleSheets = document.adoptedStyleSheets.concat([window.__zrExtraSheet]);
            }
            if (window.__zrExtraText !== extra) {
              window.__zrExtraSheet.replaceSync(extra);
              window.__zrExtraText = extra;
            }
          }
        } catch (e) { /* 老 Chromium 没有 adoptedStyleSheets */ }
        // 背景显示开关：标注当前是「空态」还是「会话中」，供上面的 CSS 选择器使用
        try {
          const rootEl = document.documentElement;
          rootEl.setAttribute('data-zr-bg-empty', pref.bgOnEmpty === false ? '0' : '1');
          rootEl.setAttribute('data-zr-bg-session', pref.bgOnSession === false ? '0' : '1');
          const markState = function () {
            const empty = Boolean(document.querySelector('[class*="composerHero"], [class*="_empty_"]'));
            rootEl.setAttribute('data-zr-state', empty ? 'empty' : 'session');
          };
          // 状态标注与观察器只服务底图相关的 CSS（data-zr-state / bg 开关）；
          // 没开底图时它们纯属白付成本，直接跳过。
          if (bgUrl) markState();
          if (bgUrl && !window.__zrSkinObs) {
            window.__zrSkinObs = new MutationObserver(function () {
              clearTimeout(window.__zrSkinT);
              window.__zrSkinT = setTimeout(function () {
                markState();
                // 守卫：dsh-theme-palette 这类插件会用它自己的 <style> 覆盖同一批
                // CSS 变量，同优先级下后写者赢。检测到我们的 style 不在末尾就移回去，
                // 否则切主题后部分组件（右键菜单、悬停卡）会停在对方的配色上。
                try {
                  const el = document.getElementById(STYLE_ID);
                  const head = document.head || document.documentElement;
                  if (el && head && el.parentNode) {
                    const styles = head.querySelectorAll('style');
                    if (styles.length && styles[styles.length - 1] !== el) head.appendChild(el);
                  }
                } catch (e) { /* ignore */ }
              }, 200);
            });
            window.__zrSkinObs.observe(document.body, { childList: true, subtree: true });
          }
        } catch (e) { /* 状态标注失败不影响主题 */ }
        // 同步注入 open shadow root（closed 的无法访问，只能靠继承）。
        // 全 DOM 扫描不便宜：只在 debug 下跑。生产路径靠 CSS 变量继承，
        // shadow host 拿不到的是个别组件，代价不值得每次 apply 都扫一遍。
        let shadowInjected = 0;
        try {
          for (const host of (zrDebug() ? document.querySelectorAll('*') : [])) {
            const sr = host.shadowRoot;
            if (!sr) continue;
            let s = sr.getElementById ? sr.getElementById(STYLE_ID) : null;
            if (!s) {
              s = document.createElement('style');
              s.id = STYLE_ID;
              sr.appendChild(s);
              shadowInjected++;
            }
            s.textContent = ':host, :host *{' + decls + '}';
          }
        } catch (e) { /* ignore */ }
        document.documentElement.setAttribute('data-dsh-zhuoer', pref.theme + ':' + scheme);
        // 自定义主题的 marker 是它自己的 id，但 SHAPES / 边线这类「按主题特性」的规则
        // 要按它克隆的 base 生效，否则自定义一个 beacon base 的主题就拿不到灯塔那套提亮边线。
        document.documentElement.setAttribute('data-zr-base', effTheme);
        // 硬边档判定：读计算值而不是看 pref —— 形状可能来自主题预设、半径缩放滑块
        // 或自定义锚点，只有算出来的 radius 才代表「这套主题真的是直角」。
        // 第三方控件（左侧栏分段 tabs）的圆角/边线只在 data-zr-sharp 下被接管。
        try {
          let radiusSm = '';
          try { radiusSm = getComputedStyle(document.documentElement).getPropertyValue('--dsw-radius-sm').trim(); } catch (e) { radiusSm = ''; }
          // 两道判据任一成立就接管第三方控件：显式勾选，或这套主题本身就是直角
          //（形状滑块选「直角」时 radiusScale=0，所有 radius token 变 0）。
          const sharp = pref.sharp === true || (radiusSm !== '' && parseFloat(radiusSm) <= 2);
          if (sharp) document.documentElement.setAttribute('data-zr-sharp', '1');
          else document.documentElement.removeAttribute('data-zr-sharp');
        } catch (e) { /* 读不到计算值就当非硬边，宁可不改 */ }
        // 探针：底图到底有没有落到计算样式里。
        // 查的元素必须与实际挂载点一致：底图挂在 [class*="_centerCol"]::before 上
        //（见上面 bgCss），此前这里查的是 body::before —— 永远查不到，于是底图
        // 即使 404 也看不出问题。
        try {
          const bgHost = document.querySelector('[class*="_centerCol"]') || document.body;
          const bcs = getComputedStyle(bgHost, '::before');
          const styleEl = document.getElementById(STYLE_ID);
          report({
            phase: 'bg-verify',
            probeHost: bgHost === document.body ? 'body' : 'centerCol',
            beforeImg: String(bcs.backgroundImage || '').slice(0, 48),
            beforeOpacity: bcs.opacity,
            beforeContent: bcs.content,
            styleLen: styleEl ? String(styleEl.textContent || '').length : -1,
            bgImageLen: pref.bgImage ? pref.bgImage.length : 0,
            opaque: (function () {
              // 找出盖住底图的不透明大块容器
              const out = [];
              const vw = window.innerWidth, vh = window.innerHeight;
              for (const el of (zrDebug() ? document.querySelectorAll('*') : [])) {
                let cs;
                try { cs = getComputedStyle(el); } catch (e) { continue; }
                const m = String(cs.backgroundColor).match(/[\d.]+/g);
                if (!m || m.length < 4) continue;
                if (Number(m[3]) < 0.85) continue;
                const r = el.getBoundingClientRect();
                if (r.width * r.height < vw * vh * 0.25) continue;
                out.push({ tag: el.tagName, cls: String(el.className || '').slice(0, 36), bg: String(cs.backgroundColor).slice(0, 24) });
                if (out.length >= 6) break;
              }
              return out;
            })(),
          });
        } catch (e) { report({ phase: 'bg-verify-failed', message: String((e && e.message) || e) }); }
        // 探针：确认当前协议下能否取到主题底图（dsh-app:// 与 http:// 的路由行为可能不同）
        if (bgUrl) {
          try {
            fetch(bgUrl).then(function (resp) {
              report({ phase: 'bg-probe', url: bgUrl, status: resp.status, contentType: String(resp.headers.get('content-type') || '') });
            }).catch(function (err) {
              report({ phase: 'bg-probe', url: bgUrl, error: String((err && err.message) || err) });
            });
          } catch (e) { /* ignore */ }
        }
        report({ phase: 'applied', theme: pref.theme, scheme: scheme, mode: pref.mode, bgSource: pref.bgSource, bgUrl: bgUrl, bgStyle: pref.bgStyle, bgOpacity: pref.bgOpacity, dshPref: (function () { try { const t = theme.getTheme(); return t && (t.preference || t.mode || t.scheme); } catch (e) { return null; } })(), tokens: Object.keys(tokens).length, cssBytes: css.length, styleInDom: Boolean(document.getElementById(STYLE_ID)) });
        // 注入后实测：变量算出来的值 vs 元素真实渲染色，用来判断「变量生效但没被使用」还是「变量被覆盖」
        try {
          const rootCs = getComputedStyle(document.documentElement);
          const bodyCs = getComputedStyle(document.body);
          const sampleSelectors = ['[class*="sidebarCol"]', '[class*="sidebar"]', 'main'];
          const samples = {};
          for (const sel of sampleSelectors) {
            try {
              const el = document.querySelector(sel);
              if (el) {
                const cs2 = getComputedStyle(el);
                samples[sel] = { bg: cs2.backgroundColor, color: cs2.color, font: String(cs2.fontFamily).slice(0, 40) };
              }
            } catch (e) {}
          }
          let varCount = 0;
          for (const p of rootCs) if (p.startsWith('--dsw-')) varCount++;
          const styleEls = [...document.querySelectorAll('style')].map((s) => ({ id: s.id, len: (s.textContent || '').length }));
          // 逐层探变量：如果某个祖先容器上另有定义，组件读到的是那份
          const chain = [];
          let el = document.body;
          for (let d = 0; el && d < 5; d++) {
            try {
              const cs3 = getComputedStyle(el);
              chain.push({
                tag: el.tagName,
                cls: String(el.className || '').slice(0, 40),
                bgBase: String(cs3.getPropertyValue('--dsw-alias-bg-base')).trim(),
                fontBase: String(cs3.getPropertyValue('--dsw-font-family')).slice(0, 30),
                selfBg: cs3.backgroundColor,
              });
            } catch (e) {}
            el = el.firstElementChild;
          }
          report({ phase: 'chain', chain: chain });
          // 代码块探针：找出 DSH 实际用哪个变量画代码块底色
          try {
            // 穿透 shadow DOM 找 code/kbd，并记录所在根是否 shadow
            const visit = (rootEl, depth) => {
              const list = [];
              if (depth > 6 || !zrDebug()) return list;
              for (const el of rootEl.querySelectorAll('*')) {
                const tag = String(el.tagName).toLowerCase();
                const cls = String(el.className || '');
                if (tag === 'code' || tag === 'kbd' || /inline|code|tag/i.test(cls)) {
                  const cs4 = getComputedStyle(el);
                  list.push({
                    tag: tag,
                    cls: cls.slice(0, 60),
                    bg: cs4.backgroundColor,
                    color: cs4.color,
                    text: String(el.textContent || '').slice(0, 20),
                    inShadow: Boolean(el.getRootNode() && el.getRootNode().host),
                  });
                }
                if (el.shadowRoot) list.push.apply(list, visit(el.shadowRoot, depth + 1));
                if (list.length > 10) return list;
              }
              return list;
            };
            const codes = visit(document, 0);
            // 是否存在 shadow host
            const shadowHosts = [...(zrDebug() ? document.querySelectorAll('*') : [])].filter((el) => el.shadowRoot).map((el) => String(el.tagName) + '.' + String(el.className || '').slice(0, 30)).slice(0, 5);
            report({ phase: 'shadow-scan', hosts: shadowHosts, codeCount: codes.length });
            // 全面扫描：iframe / shadow root 内部样式 / markdown 相关 CSS 规则
            try {
              const iframes = [...document.querySelectorAll('iframe')].map((f) => String(f.src || '').slice(0, 80));
              const shadowInfo = [];
              for (const host of (zrDebug() ? document.querySelectorAll('*') : [])) {
                if (!host.shadowRoot) continue;
                const sr = host.shadowRoot;
                const styles = [...sr.querySelectorAll('style')].map((s) => String(s.textContent || '').slice(0, 400));
                const hasCode = sr.querySelectorAll('code, kbd, [class*="code"]').length;
                shadowInfo.push({ host: String(host.tagName) + '.' + String(host.className || '').slice(0, 30), styleCount: styles.length, hasCode, styles: styles.slice(0, 2) });
                if (shadowInfo.length > 3) break;
              }
              const cssHits = [];
              // 全 CSSOM 扫描最贵（每条规则一次正则），只在排障时跑。
              for (const sheet of (zrDebug() ? document.styleSheets : [])) {
                let rules;
                try { rules = sheet.cssRules; } catch (e) { continue; }
                for (const r of rules) {
                  const t = String(r.cssText || '');
                  if (/markdown|inline|\bcode\b|kbd/i.test(t) && /background/i.test(t)) cssHits.push(t.slice(0, 220));
                  if (cssHits.length > 12) break;
                }
                if (cssHits.length > 12) break;
              }
              report({ phase: 'deep-scan', iframes: iframes, shadowInfo: shadowInfo, cssHits: cssHits });
            } catch (e) { report({ phase: 'deep-scan-failed', message: String((e && e.message) || e) }); }
            report({
              phase: 'code-probe',
              varCodeBlock: String(rootCs.getPropertyValue('--dsw-alias-markdown-code-block')).trim(),
              varCodeBanner: String(rootCs.getPropertyValue('--dsw-alias-markdown-code-block-banner')).trim(),
              varTag: String(rootCs.getPropertyValue('--dsw-alias-markdown-tag')).trim(),
              els: codes,
            });
          } catch (e) { report({ phase: 'code-probe-failed', message: String((e && e.message) || e) }); }
          report({
            phase: 'verify',
            shadowInjected: shadowInjected,
            rootBgBase: String(rootCs.getPropertyValue('--dsw-alias-bg-base')).trim(),
            rootBrand: String(rootCs.getPropertyValue('--dsw-alias-brand-primary')).trim(),
            rootFontBase: String(rootCs.getPropertyValue('--dsw-font-base-16')).slice(0, 50),
            bodyBg: bodyCs.backgroundColor,
            bodyFont: String(bodyCs.fontFamily).slice(0, 50),
            varCount: varCount,
            samples: samples,
            styleCount: styleEls.length,
            ourStyleIndex: styleEls.findIndex((s) => s.id === STYLE_ID),
            styleEls: styleEls.slice(-4),
          });
        } catch (e) { report({ phase: 'verify-failed', message: String((e && e.message) || e) }); }
        try {
          // 自检口：控制台/自动化都能一眼看出 overrideTokens 这条路径是否真的生效了。
          window.__dshOpenclawSkin = {
            theme: pref.theme, scheme: scheme,
            tokens: Object.keys(tokens).length,
            overrideApplied: !!overrideApplied,
            version: PVERSION,
          };
          console.info('[zhuoer-theme] applied', pref.theme, scheme, Object.keys(tokens).length, 'tokens · overrideTokens', overrideApplied ? 'ok' : 'skipped');
        } catch (e3) { /* ignore */ }
      } catch (e2) { /* ignore */ }
      return dispose;
    }

    // ---- 设置面板样式（v59 重构：层次 / 留白 / 分组 / 控件态）----
    // 排版规则（改之前先读，否则很容易把节奏改乱）：
    //   · 区块分隔 = 18px 留白 + 18px 内边距 + 1px 细线：细线上下等距，才不会读成
    //     上一块内容的「尾巴」（旧版 22/16 不对称，细线总贴着上一个区）。
    //   · 圆角 8（卡片 10、胶囊 8、输入 8），字号只用 11/12/13/15 四档。
    //   · 文字三级：primary（标题 / 值）— secondary（标签 / 副行）— tertiary（说明）。
    //     tertiary 只在 bg-base 上达标（12 套 × 两态实测 4.50），不要放到卡片 / 胶囊 /
    //     提示底色上（实测最低 4.08）；需要「浅一点」就用 secondary。
    const PANEL_CSS = [
      '.zp-root{display:flex;flex-direction:column;gap:0;min-width:0;max-width:100%;',
      'color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5;}',
      // 给所有子元素压 min-width：flex/grid 子项默认 min-width:auto，
      // 一个长主题名或长字体名就能把面板顶出横向滚动条。
      '.zp-root,.zp-root *{box-sizing:border-box;min-width:0;}',
      '.zp-hd{display:flex;flex-direction:column;gap:6px;}',
      '.zp-hd-row{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px;}',
      '.zp-hd-t{font-size:15px;font-weight:600;letter-spacing:.01em;}',
      '.zp-hd-m{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;',
      'font-size:12px;color:var(--dsw-alias-label-tertiary);}',
      '.zp-tag{display:inline-flex;align-items:center;gap:4px;padding:1px 8px;border-radius:999px;',
      'background:var(--dsw-alias-interactive-bg-hover-accent);color:var(--dsw-alias-label-primary);',
      'font-size:12px;font-weight:600;line-height:1.6;}',
      '.zp-live{display:inline-flex;align-items:center;gap:6px;}',
      '.zp-live::before{content:"";width:6px;height:6px;border-radius:999px;',
      'background:var(--dsw-alias-state-success-primary);}',
      '.zp-sec{display:flex;flex-direction:column;gap:12px;',
      'padding-top:18px;margin-top:18px;border-top:1px solid var(--dsw-alias-border-l1);}',
      '.zp-sec-hd{display:flex;flex-direction:column;gap:2px;}',
      '.zp-sec-t{font-size:13px;font-weight:600;letter-spacing:.01em;}',
      '.zp-sec-n{font-size:12px;line-height:1.55;color:var(--dsw-alias-label-secondary);max-width:56em;}',
      // 主题卡：132px 起跳，320px 宽能放两列，再宽自动三列/四列，永不横向溢出
      '.zp-ths{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:8px;}',
      '.zp-th{position:relative;display:flex;flex-direction:column;gap:8px;padding:8px;border-radius:10px;',
      'cursor:pointer;font:inherit;text-align:left;color:inherit;',
      'background:var(--dsw-alias-button-elevated-fill);border:1px solid var(--dsw-alias-border-l1);',
      'transition:border-color .13s ease,box-shadow .13s ease;}',
      '.zp-th:hover{border-color:var(--dsw-alias-border-l3);box-shadow:0 0 0 1px var(--dsw-alias-border-l3);}',
      // 选中态用当前主题的品牌色（不是卡片自己的色），和界面其它选中态同一语义
      '.zp-th[data-on="1"]{border-color:var(--dsw-alias-brand-primary);',
      'box-shadow:0 0 0 1px var(--dsw-alias-brand-primary);}',
      '.zp-th[data-on="1"]::after{content:"";position:absolute;top:6px;right:6px;width:14px;height:14px;',
      'border-radius:999px;background:var(--dsw-alias-brand-primary);',
      'box-shadow:0 0 0 2px var(--dsw-alias-bg-base);}',
      '.zp-th[data-on="1"]::before{content:"";position:absolute;top:9px;right:11px;z-index:1;width:4px;height:8px;',
      'border-right:1.5px solid var(--dsw-alias-label-primary-foreground);',
      'border-bottom:1.5px solid var(--dsw-alias-label-primary-foreground);transform:rotate(45deg);}',
      '.zp-th:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;}',
      '.zp-th-p{position:relative;display:flex;flex-direction:column;justify-content:center;gap:6px;',
      'height:46px;border-radius:6px;padding:0 10px 0 14px;overflow:hidden;',
      'background:var(--zp-th-bg,var(--dsw-alias-bg-layer-2));',
      'border:1px solid var(--zp-th-line,var(--dsw-alias-border-l2));}',
      '.zp-th-p::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;',
      'background:var(--zp-th-accent,var(--dsw-alias-brand-primary));}',
      '.zp-th-c{height:10px;width:66%;border-radius:3px;',
      'background:var(--zp-th-surface,var(--dsw-alias-bg-layer-2));',
      'border:1px solid var(--zp-th-line,var(--dsw-alias-border-l2));}',
      '.zp-th-b{height:4px;width:42%;border-radius:2px;',
      'background:var(--zp-th-ink,var(--dsw-alias-label-primary));opacity:.42;}',
      '.zp-th-n{display:flex;flex-direction:column;gap:1px;padding:0 2px;}',
      '.zp-th-nm{font-size:12px;font-weight:600;line-height:1.25;',
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.zp-th-id{font-size:11px;line-height:1.3;color:var(--dsw-alias-label-secondary);',
      'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;',
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      // 胶囊组：flex-wrap 而不是等分分段——5 档字号在窄容器里换行比压扁可读
      '.zp-seg{display:inline-flex;flex-wrap:wrap;gap:2px;padding:2px;border-radius:10px;',
      'background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);}',
      '.zp-pill{appearance:none;display:inline-flex;align-items:center;gap:4px;padding:4px 12px;',
      'border-radius:8px;border:1px solid transparent;background:transparent;',
      'font:inherit;font-size:12px;line-height:1.4;cursor:pointer;',
      'color:var(--dsw-alias-label-secondary);',
      'transition:background-color .12s ease,border-color .12s ease,color .12s ease;}',
      '.zp-pill:hover{background:var(--dsw-alias-interactive-bg-hover);',
      'border-color:transparent;color:var(--dsw-alias-label-primary);}',
      '.zp-pill[data-on="1"]{background:var(--dsw-alias-brand-primary);',
      'border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-foreground);',
      'font-weight:600;}',
      '.zp-pill:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}',
      '.zp-row{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;}',
      '.zp-lbl{flex:0 0 auto;width:4.8em;font-size:12px;color:var(--dsw-alias-label-secondary);}',
      '.zp-body{flex:1 1 190px;display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-width:0;}',
      '.zp-chk{display:inline-flex;align-items:center;gap:8px;padding:2px;border-radius:6px;',
      'font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer;}',
      '.zp-chk:hover{color:var(--dsw-alias-label-primary);}',
      '.zp-chk input{width:14px;height:14px;margin:0;accent-color:var(--dsw-alias-brand-primary);',
      'cursor:pointer;}',
      '.zp-chk:focus-within{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}',
      '.zp-range{flex:1 1 120px;min-width:80px;height:16px;margin:0;appearance:none;',
      'background:transparent;cursor:pointer;accent-color:var(--dsw-alias-brand-primary);}',
      '.zp-range::-webkit-slider-runnable-track{height:4px;border-radius:999px;',
      'background:linear-gradient(to right,var(--dsw-alias-brand-primary) var(--zp-pct,50%),',
      'var(--dsw-alias-border-l2) var(--zp-pct,50%));}',
      '.zp-range::-webkit-slider-thumb{appearance:none;width:12px;height:12px;margin-top:-4px;',
      'border-radius:999px;background:var(--dsw-alias-brand-primary);',
      'border:2px solid var(--dsw-alias-bg-base);box-shadow:0 0 0 1px var(--dsw-alias-border-l2);}',
      '.zp-range::-moz-range-track{height:4px;border-radius:999px;background:var(--dsw-alias-border-l2);}',
      '.zp-range::-moz-range-progress{height:4px;border-radius:999px;background:var(--dsw-alias-brand-primary);}',
      '.zp-range::-moz-range-thumb{width:12px;height:12px;border-radius:999px;',
      'background:var(--dsw-alias-brand-primary);border:2px solid var(--dsw-alias-bg-base);}',
      '.zp-range:focus{outline:none;}',
      '.zp-range:focus-visible::-webkit-slider-thumb{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;}',
      '.zp-range:focus-visible::-moz-range-thumb{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;}',
      '.zp-val{min-width:38px;text-align:right;font-size:12px;',
      'color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}',
      '.zp-inp{flex:1 1 180px;padding:6px 8px;border-radius:8px;font:inherit;font-size:12px;',
      'background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);',
      'color:var(--dsw-alias-label-primary);}',
      '.zp-inp::placeholder{color:var(--dsw-alias-label-dimmed);}',
      '.zp-inp:focus{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;',
      'border-color:var(--dsw-alias-brand-primary);}',
      '.zp-btn{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:8px;',
      'font:inherit;font-size:12px;line-height:1.5;cursor:pointer;',
      'background:var(--dsw-alias-button-elevated-fill);border:1px solid var(--dsw-alias-border-l2);',
      'color:var(--dsw-alias-label-primary);',
      'transition:background-color .12s ease,border-color .12s ease,box-shadow .12s ease;}',
      '.zp-btn:hover{background:var(--dsw-alias-interactive-bg-hover);',
      'border-color:var(--dsw-alias-border-l3);}',
      '.zp-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;}',
      '.zp-btn[data-tone="danger"]{background:var(--dsw-alias-bg-base);',
      'color:var(--dsw-alias-label-error);border-color:var(--dsw-alias-state-error-primary);}',
      '.zp-btn[data-tone="danger"]:hover{background:var(--dsw-alias-bg-base);',
      'border-color:var(--dsw-alias-state-error-primary);',
      'box-shadow:0 0 0 1px var(--dsw-alias-state-error-primary);}',
      // 待确认态：文案已经变成「再点一次删除」，外观也要跟着变，否则用户会以为第一次点击没生效。
      '.zp-btn[data-tone="danger"].is-armed{background:var(--dsw-alias-interactive-bg-hover-danger);',
      'border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-label-primary);',
      'box-shadow:0 0 0 1px var(--dsw-alias-state-error-primary);font-weight:600;}',
      // 文件选择：input 视觉隐藏但保留可聚焦，靠 :focus-within 给键盘用户焦点环
      '.zp-file{position:relative;}',
      '.zp-file input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;}',
      '.zp-file:focus-within{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;}',
      '.zp-sws{display:flex;align-items:center;flex-wrap:wrap;gap:12px;}',
      // 视觉 22px，命中区靠 ::after 外扩到 34px：一排 9 个色点，不能为了 44px 把面板撑爆
      '.zp-sw{position:relative;width:22px;height:22px;padding:0;border-radius:999px;cursor:pointer;',
      'border:1px solid var(--dsw-alias-border-l3);background:transparent;',
      'transition:transform .12s ease,box-shadow .12s ease;}',
      '.zp-sw::after{content:"";position:absolute;inset:-6px;border-radius:999px;}',
      '.zp-sw:hover{transform:scale(1.08);}',
      '.zp-sw[data-on="1"]{border-color:var(--dsw-alias-label-primary);',
      'box-shadow:0 0 0 1px var(--dsw-alias-label-primary),0 0 0 4px var(--dsw-alias-bg-layer-1);}',
      '.zp-sw:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:3px;}',
      '.zp-color{width:26px;height:22px;padding:0;border-radius:6px;cursor:pointer;',
      'border:1px solid var(--dsw-alias-border-l2);background:transparent;}',
      '.zp-thumb{width:56px;height:34px;border-radius:6px;object-fit:cover;',
      'border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);}',
      '.zp-hint{font-size:12px;line-height:1.55;color:var(--dsw-alias-label-secondary);}',
      // 报错行不能只靠颜色区分（明暗 × 12 套主题里 label-error 压卡片底色最低 4.36），
      // 用字重 + 点线更稳，颜色只做非文本的装饰线。
      '.zp-hint.is-warn{font-weight:600;text-decoration:underline dotted var(--dsw-alias-state-error-primary);',
      'text-underline-offset:2px;}',
      // ---- 自定义主题：卡片 / 编辑器 ----
      '.zp-th-add{border-style:dashed;align-items:center;justify-content:center;min-height:78px;}',
      '.zp-th-p-add{display:flex;align-items:center;justify-content:center;height:46px;',
      'border:1px dashed var(--dsw-alias-border-l2);background:transparent;',
      'font-size:20px;line-height:1;color:var(--dsw-alias-label-tertiary);}',
      '.zp-th-p-add::before{display:none;}',
      '.zp-cus-acts{display:flex;gap:8px;flex-wrap:wrap;padding-top:2px;}',
      '.zp-txt{padding:4px 8px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px;min-width:110px;}',
      '.zp-txt:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}',
      '.zp-num{width:104px;text-align:right;}',
      '.zp-btn-pri{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground,var(--dsw-alias-bg-base));border-color:transparent;}',
      '.zp-btn-pri:hover{background:var(--dsw-alias-button-primary-hover);}',
      // 编辑器浮层：外层 pointer-events:none，只有左侧面板接管点击，右半区让真实界面透出来当预览。
      '.zp-ed{position:fixed;inset:0;z-index:2147483000;pointer-events:none;}',
      // 桌面端的窗口拖拽条（--dsh-windows-titlebar-height，34px）里画着「应用 / 编辑」菜单，
      // 抽屉若从 top:0 开始就会把面板标题压在那两个菜单上。桌面端整体下移一条标题栏的高度；
      // Web 端没有 data-windows-titlebar，这条不生效，仍是满高。
      'html[data-windows-titlebar] .zp-ed-panel{top:var(--dsh-windows-titlebar-height,34px);}',
      // 抽屉 352px：头尾吸顶/吸底，中间滚动；阴影改用主题自己的 elevation，
      // 以前写死 rgba(0,0,0,.5)，浅色主题下会压出一圈 50% 黑边。
      '.zp-ed-panel{pointer-events:auto;position:absolute;left:0;top:0;bottom:0;width:352px;max-width:94vw;display:flex;flex-direction:column;gap:10px;padding:16px;overflow:auto;background:var(--dsw-alias-bg-base);border-right:1px solid var(--dsw-alias-border-l2);box-shadow:var(--dsw-elevation-panel,0 18px 44px rgba(0,0,0,.28));}',
      '.zp-ed-hd{position:sticky;top:-16px;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:8px;margin:-16px -16px 0;padding:14px 16px 10px;background:var(--dsw-alias-bg-base);border-bottom:1px solid var(--dsw-alias-border-l1);}',
      '.zp-ed-ttl{font-size:15px;font-weight:600;}',
      '.zp-ed-x{width:26px;height:26px;border-radius:8px;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);font-size:18px;line-height:1;cursor:pointer;}',
      '.zp-ed-x:hover{background:var(--dsw-alias-interactive-bg-hover);}',
      '.zp-ed-list{display:flex;flex-direction:column;gap:2px;}',
      // 标签列宽与 .zp-lbl(4.4em) 对齐、颜色同档 tertiary：
      // 原来 58px + secondary，与上面的表单块左边缘差 5px 且深浅不同，看着不像同一张表单。
      '.zp-ed-item{display:grid;grid-template-columns:minmax(4.6em,auto) 26px minmax(0,1fr) 62px 26px;gap:6px 8px;align-items:center;padding:3px 0 3px 2px;border-radius:6px;}',
      '.zp-ed-lbl{font-size:12px;color:var(--dsw-alias-label-tertiary);overflow:hidden;word-break:break-word;white-space:normal;line-height:1.15;max-width:6.8em;}',
      // 已改过的行：标签提亮并加底色，和「继承自主题」的值区分开。
      '.zp-ed-item.is-dirty .zp-ed-lbl{color:var(--dsw-alias-label-primary);font-weight:600;}',
      '.zp-ed-item.is-dirty{background:var(--dsw-alias-interactive-bg-hover);}',
      '.zp-ed-hex{min-width:0;width:100%;}',
      '.zp-ed-ratio{font-size:11px;text-align:right;color:var(--dsw-alias-label-tertiary);}',
      '.zp-ed-ratio.is-low{color:var(--dsw-alias-state-warn-primary);font-weight:600;}',
      '.zp-ed-reset{width:24px;height:24px;border-radius:6px;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;}',
      '.zp-ed-reset:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);}',
      // 未改过的行 ↺ 置灰不可点：以前 8 个常亮，点了没反应，像坏了。
      '.zp-ed-reset[disabled]{opacity:.28;cursor:default;background:transparent;color:var(--dsw-alias-label-tertiary);}',
      '.zp-ed-reset:focus-visible,.zp-ed-x:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}',
      '.zp-color:focus-visible,.zp-preset:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;}',
      '.zp-ed-ft{position:sticky;bottom:-16px;z-index:2;display:flex;align-items:center;gap:8px;justify-content:flex-end;margin:0 -16px -16px;padding:10px 16px 14px;background:var(--dsw-alias-bg-base);border-top:1px solid var(--dsw-alias-border-l1);}',
      '.zp-ed-confirm{flex:1;font-size:12px;line-height:1.4;color:var(--dsw-alias-state-warn-primary);}',
      '.zp-ed .zp-sec{padding-top:12px;}',
      '.zp-sel-wrap{display:inline-flex;min-width:0;}',
      '.zp-sel{appearance:none;padding-right:26px;background-repeat:no-repeat;background-position:right 8px center;background-size:9px;background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%);background-position-x:calc(100% - 14px),calc(100% - 9px);background-size:5px 5px,5px 5px;}',
      '.zp-ed-err{font-size:12px;color:var(--dsw-alias-state-error-primary);line-height:1.45;}',
      '.zp-presets{display:flex;flex-wrap:wrap;gap:6px;}',
      '.zp-preset{padding:4px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);font-size:12px;line-height:1.2;cursor:pointer;transition:border-color .15s,color .15s;}',
      '.zp-preset:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);}',
      '.zp-ed-ai{display:flex;flex-direction:column;gap:6px;flex:1;min-width:0;}',
      '.zp-pal{display:flex;flex-wrap:wrap;gap:8px;padding-top:2px;}',
      '.zp-pal-item{display:flex;flex-direction:column;align-items:center;gap:3px;min-width:56px;}',
      '.zp-pal-sw{width:100%;height:34px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);}',
      '.zp-pal-hex{font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--dsw-alias-label-secondary);}',
      '.zp-pal-share{font-size:11px;color:var(--dsw-alias-label-tertiary);}',
      '.zp-pal-name{font-size:11px;color:var(--dsw-alias-label-secondary);max-width:64px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.zp-ed-sec{display:flex;flex-direction:column;gap:6px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l1);}',
      '.zp-ed-sec:first-of-type{padding-top:0;border-top:0;}',
      '.zp-json{width:100%;box-sizing:border-box;padding:8px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.5;resize:vertical;}',
      '.zp-foot{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;',
      'padding-top:18px;margin-top:18px;border-top:1px solid var(--dsw-alias-border-l1);}',
      '@media (prefers-reduced-motion: reduce){.zp-root *{transition:none !important;',
      'animation:none !important;}}',
      // 极窄容器：行标签独占一行，避免「标签被压成竖条」
      '@media (max-width:359px){.zp-lbl{width:auto;flex:1 0 100%;}',
      '.zp-sec{padding-top:14px;margin-top:14px;}.zp-hd{gap:4px;}',
      '.zp-ths{grid-template-columns:repeat(auto-fill,minmax(112px,1fr));}}',
    ].join('');

    // 分组容器：统一「标题 + 说明 + 内容」的节奏，间距不再靠逐项手调。
    function Section(props) {
      return h('section', { className: 'zp-sec', 'aria-label': props.title },
        h('div', { className: 'zp-sec-hd' },
          h('div', { className: 'zp-sec-t' }, props.title),
          props.note ? h('div', { className: 'zp-sec-n' }, props.note) : null
        ),
        props.children
      );
    }

    // 一行「标签 + 控件」：标签定宽、控件可换行，窄容器里不会横向溢出。
    function Row(props) {
      return h('div', { className: 'zp-row' },
        h('div', { className: 'zp-lbl' }, props.label),
        h('div', { className: 'zp-body' }, props.children)
      );
    }

    // 胶囊单选组：用 aria-pressed 而不是 role=radio。
    // radio 组要求方向键导航，宿主里没人教；按钮组 Tab 能直接落到每一项。
    function Pills(props) {
      return h('div', { className: 'zp-seg', role: 'group', 'aria-label': props.label },
        props.opts.map(function (o) {
          const on = props.value === o[0];
          return h('button', {
            key: String(o[0]), type: 'button', className: 'zp-pill',
            'data-on': on ? '1' : '0', 'aria-pressed': on,
            onClick: function () { props.onChange(o[0]); },
          }, o[1]);
        })
      );
    }

    // 下拉选择：比自由输入稳，选项外的历史值单独保留一项，不让用户丢配置
    function Select(props) {
      const opts = props.options || [];
      const cur = props.value || '';
      const known = opts.some(function (o) { return o[0] === cur; });
      return h('div', { className: 'zp-sel-wrap' },
        h('select', {
          className: 'zp-txt zp-sel',
          'aria-label': props.label,
          value: cur,
          onChange: function (ev) { props.onChange(ev.target.value); },
        },
          h('option', { value: '__empty__' }, props.emptyLabel || t('panel.sel.follow')),
          opts.map(function (o) {
            return h('option', { key: o[0], value: o[0] }, o[1]);
          }),
          cur && !known ? h('option', { key: '__cur__', value: cur }, t('panel.sel.current', { value: cur })) : null
        )
      );
    }

    // ---- 颜色换算（只服务强调色预设，不参与主题 token 计算）----
    function hexHsl(hex) {
      const m = String(hex || '').match(/^#([0-9a-fA-F]{6})$/);
      if (!m) return null;
      const v = [0, 2, 4].map(function (i) { return parseInt(m[1].slice(i, i + 2), 16) / 255; });
      const mx = Math.max(v[0], v[1], v[2]), mn = Math.min(v[0], v[1], v[2]);
      const l = (mx + mn) / 2;
      if (mx === mn) return [0, 0, l];
      const d = mx - mn;
      const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      let h;
      if (mx === v[0]) h = (v[1] - v[2]) / d + (v[1] < v[2] ? 6 : 0);
      else if (mx === v[1]) h = (v[2] - v[0]) / d + 2;
      else h = (v[0] - v[1]) / d + 4;
      return [(h * 60) % 360, s, l];
    }
    function hslHex(h, s, l) {
      const k = function (n) {
        const m = (n + h / 30) % 12;
        const a = s * Math.min(l, 1 - l);
        const v = l - a * Math.max(-1, Math.min(m - 3, Math.min(9 - m, 1)));
        return Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
      };
      return '#' + k(0) + k(8) + k(4);
    }
    function hueGap(a, b) {
      const d = Math.abs(a - b) % 360;
      return Math.min(d, 360 - d);
    }

    // 强调色预设的取色规则（v54）：
    //   1) 先放用户当前的自定义色（否则选中态看不见）；
    //   2) 再放当前主题自带的语义色（品牌 / 成功 / 警告 / 危险 / 链接 / 业务）；
    //   3) 主题自带色通常只有「品牌 + 绿 + 琥珀」三族，直接摆会是一排同色系圆点，
    //      不足时按品牌色的饱和度做色相环偏移补齐 —— 依旧全部由 token 推导，
    //      不含任何写死色值；单色主题（CRT / 荧光）也不会退化成一排灰点。
    function accentOptions(themeId, scheme, current) {
      const tk = tokensFor(themeId, scheme);
      const keys = [
        '--dsw-alias-brand-primary', '--dsw-alias-brand-primary-invert',
        '--dsw-alias-state-business-primary', '--dsw-alias-state-success-primary',
        '--dsw-alias-state-warn-primary', '--dsw-alias-state-error-primary',
        '--dsw-alias-link',
      ];
      const out = [];
      const picked = [];
      const push = function (v) {
        const s = String(v || '');
        // 有的主题这几个槽给的是 rgba()，色板收不了，直接跳过
        if (!/^#[0-9a-fA-F]{6}$/.test(s)) return;
        const hsl = hexHsl(s);
        if (!hsl) return;
        for (let i = 0; i < picked.length; i++) {
          // 同色相 + 近明度视为重复：三个红点摆一排等于没有选择
          if (hueGap(picked[i][0], hsl[0]) < 16 && Math.abs(picked[i][2] - hsl[2]) < 0.1) return;
        }
        picked.push(hsl);
        out.push(s);
      };
      if (current) push(current);
      keys.forEach(function (k) { push(tk[k]); });
      const brand = hexHsl(tk['--dsw-alias-brand-primary']);
      if (brand) {
        // 单色主题品牌色饱和度≈0，纯旋转会得到一排灰点；明度也压在可视区间内
        const s = brand[1] < 0.12 ? 0.55 : brand[1];
        const l = Math.min(0.62, Math.max(0.38, brand[2]));
        const offsets = [45, 90, 135, 180, 225, 270, 315];
        for (let i = 0; i < offsets.length && out.length < 8; i++) {
          push(hslHex((brand[0] + offsets[i]) % 360, s, l));
        }
      }
      return out.slice(0, 8);
    }

    // 主题卡：预览块用「该主题自己的」token 上色 —— 这是面板里唯一引用非当前
    // token 的地方（不这样 11 张卡长得一模一样，用户没有选择依据）。
    // schema 由调用方传入当前实际明暗，避免把 dark 值画到浅色模式上。
    // Built-in theme names live in the dictionary: THEMES stores '@theme.<key>' and renders via t().
    function themeLabelOf(raw) {
      return raw && raw.charAt(0) === '@' ? t('theme.' + raw.slice(7)) : raw;
    }

    // 主题卡：预览条是这套主题的「缩略图」——左侧竖条用该主题的品牌色，底色 / 表面层 /
    // 正文色各取该主题自己那套 token。旧版预览只有一条 layer-2 灰杠 + 一枚小圆点，
    // 12 张卡在浅色主题下几乎一模一样，只能靠读名字分辨。
    // 颜色一律经 --zp-th-* 内联变量交给 CSS：PANEL_CSS 里保持零色值，明暗两态同一套规则。
    function Swatch(props) {
      const def = props.def || {};
      const tk = def[props.scheme] || def.dark || {};
      const label = themeLabelOf(def.label || props.id);
      const active = props.active;
      // 自定义主题若缺某个 token（旧版本存下来的草稿），不写空值：让 CSS 的 var() 兜底。
      const pv = {};
      [['--zp-th-bg', '--dsw-alias-bg-base'], ['--zp-th-line', '--dsw-alias-border-l2'],
        ['--zp-th-surface', '--dsw-alias-bg-layer-2'], ['--zp-th-ink', '--dsw-alias-label-primary'],
        ['--zp-th-accent', '--dsw-alias-brand-primary']].forEach(function (pair) {
        if (tk[pair[1]]) pv[pair[0]] = tk[pair[1]];
      });
      return h('button', {
        type: 'button', className: 'zp-th', 'data-on': active ? '1' : '0',
        'aria-pressed': active, title: label + ' (' + props.id + ')',
        onClick: function () { props.onPick(props.id); },
      },
        h('span', { className: 'zp-th-p', 'aria-hidden': 'true', style: pv },
          h('span', { className: 'zp-th-c' }),
          h('span', { className: 'zp-th-b' })
        ),
        h('span', { className: 'zp-th-n' },
          h('span', { className: 'zp-th-nm' }, label),
          h('span', { className: 'zp-th-id' }, props.id)
        )
      );
    }

    // ---------- 自定义主题编辑器 ----------
    // 浮层只画左侧面板，右半区全透明 + pointer-events:none，
    // 让用户一边调色一边看到真实界面在变 —— 真实界面就是预览，不造假组件。
    function contrastRatio(a, b) {
      const toL = function (hex) {
        const c = parseHexColor(hex);
        if (!c) return null;
        const f = c.map(function (v) {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
      };
      const l1 = toL(a), l2 = toL(b);
      if (l1 == null || l2 == null) return null;
      const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
      return (hi + 0.05) / (lo + 0.05);
    }

    // 锚点行：hex 输入框有本地缓冲，才能逐字输入。
    // 之前直接把受控值绑到 draft 且只在 /^#[0-9a-f]{6}$/ 时才提交：
    // 输入中途一律不合法 → 每次按键都被 React 回弹，实际只剩「选中单个字符替换」能用。
    function AnchorRow(props) {
      const cur = props.value;
      const [text, setText] = useState(cur);
      const [bad, setBad] = useState(false);
      useEffect(function () { setText(cur); setBad(false); }, [cur]);
      const submit = function (raw) {
        const v = String(raw || '').trim();
        const hex = /^#/.test(v) ? v : '#' + v;
        if (/^#[0-9a-fA-F]{6}$/.test(hex)) { setBad(false); props.onChange(hex.toLowerCase()); }
        else setBad(true);
      };
      return h('div', { className: 'zp-ed-item' + (props.dirty ? ' is-dirty' : '') },
        h('div', { className: 'zp-ed-lbl', title: props.anchor }, props.label),
        h('input', {
          type: 'color', className: 'zp-color', value: cur,
          'aria-label': t('panel.ed.pickerAria', { label: props.label }),
          onChange: function (ev) { props.onChange(ev.target.value); },
        }),
        h('input', {
          type: 'text', className: 'zp-txt zp-ed-hex', value: text, maxLength: 7,
          spellCheck: false, 'aria-label': t('panel.ed.hexAria', { label: props.label }),
          'aria-invalid': bad ? 'true' : 'false',
          onChange: function (ev) { setText(ev.target.value); submit(ev.target.value); },
          onBlur: function () { submit(text); if (!/^#[0-9a-fA-F]{6}$/.test(text)) setText(cur); },
        }),
        props.ratio == null
          ? h('span', { className: 'zp-ed-ratio' }, '')
          : h('span', { className: 'zp-ed-ratio' + (props.low ? ' is-low' : ''), 'aria-live': 'polite' },
              props.ratio.toFixed(1) + ':1' + (props.low ? t('panel.ed.low') : '')),
        h('button', {
          type: 'button', className: 'zp-ed-reset', disabled: !props.dirty,
          'aria-label': t('panel.ed.resetAria', { label: props.label }),
          title: props.dirty ? t('panel.ed.resetTitleDirty') : t('panel.ed.resetTitleClean'),
          onClick: function () { if (props.dirty) props.onChange(''); },
        }, '↺')
      );
    }

    // 弹层通用可访问性：打开即聚焦、Tab 在面板内循环、Escape 关闭、关闭后把焦点还给打开它的元素。
    // 编辑器先有这套行为，JSON 弹层漏了 —— 现在两者共用同一份实现。
    // requestClose 用 ref 传：它每次渲染都是新闭包，塞进 [] 依赖会拿到过期版本。
    function useModalA11y(panelRef, requestCloseRef, initialFocusRef) {
      useEffect(function () {
        const prev = document.activeElement;
        const el = panelRef.current;
        try {
          if (initialFocusRef && initialFocusRef.current) initialFocusRef.current.focus();
          else if (el) {
            const first = el.querySelector('button, input, select, textarea');
            if (first) first.focus();
          }
        } catch (e) { /* ignore */ }
        const onKey = function (ev) {
          // 中文输入法组词时按 Esc 是「取消候选词」，不能当成关闭弹层。
          if (ev.key === 'Escape') {
            if (ev.isComposing) return;
            ev.preventDefault(); ev.stopPropagation();
            try { if (requestCloseRef && requestCloseRef.current) requestCloseRef.current(); } catch (e) { /* ignore */ }
            return;
          }
          if (ev.key !== 'Tab' || !el) return;
          // 焦点被点到面板外（穿透区）时，Tab 直接回收进面板，别在背景里游走。
          if (!el.contains(document.activeElement)) {
            const firstIn = el.querySelector('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if (firstIn) { ev.preventDefault(); firstIn.focus(); }
            return;
          }
          const nodes = Array.prototype.slice.call(el.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])'))
            .filter(function (n) { return !n.disabled && n.offsetParent !== null; });
          if (!nodes.length) return;
          const first = nodes[0];
          const last = nodes[nodes.length - 1];
          if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
          else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
        };
        document.addEventListener('keydown', onKey, true);
        return function () {
          document.removeEventListener('keydown', onKey, true);
          try { if (prev && prev.focus) prev.focus(); } catch (e) { /* ignore */ }
        };
      }, []);
    }

    function ThemeEditor(props) {
      const [draft, setDraft] = useState(function () { return JSON.parse(JSON.stringify(props.spec)); });
      // 模态语义（打开聚焦 / Tab 环 / Esc / 焦点归还）由 useModalA11y 统一提供，
      // 第三个参数是「打开时要聚焦的元素」——这里给名称输入框，而不是 DOM 第一个 button（× ）。
      const panelRef = useRef(null);
      const nameRef = useRef(null);
      const requestCloseRef = useRef(null);
      useModalA11y(panelRef, requestCloseRef, nameRef);
      // 默认打开浅色：自定义主题的主体就是浅色锚点，深色由 autoDark 反推。
      // 从深色开始会让用户误以为"改浅色没反应"（其实是被反推覆盖了）。
      const [editScheme, setEditScheme] = useState('light');
      // 未保存改动与「放弃确认」：× / Esc / 取消 三条路径都会丢弃 draft，
      // 以前它们直接 onClose，调色 20 分钟误按一次就全没，且没有任何提示。
      const [dirty, setDirty] = useState(false);
      const [confirmDiscard, setConfirmDiscard] = useState(false);
      // 显示「这一套实际算出来的值」而不是 base 主题原值：
      // autoDark 时深色格子里显示的就是反推结果，用户可以直接在它基础上调。
      const baseTokens = React.useMemo(function () { return buildCustomTokens(draft, editScheme); }, [draft, editScheme]);
      const bg = (draft.bg && typeof draft.bg === 'object')
        ? draft.bg
        : { source: '', key: '', opacity: null, style: '' };
      const setBg = function (patch) {
        const n = JSON.parse(JSON.stringify(draft));
        n.bg = Object.assign({ source: '', key: '', opacity: null, style: '' }, n.bg || {}, patch);
        commit(n);
      };
      const handleBgFile = function (ev) {
        const file = ev.target.files && ev.target.files[0];
        try { ev.target.value = ''; } catch (e) { /* ignore */ }
        if (!file) return;
        if (file.size > IMG_MAX_BYTES) {
          // 以前这里只 console.warn：用户选了张 4 MB 的图，界面毫无反应，
          // 只会以为「这个功能坏了」。与另外两处入口统一成同一条提示。
          try { window.alert(t('panel.alert.imgMax')); } catch (e) { /* ignore */ }
          return;
        }
        const reader = new FileReader();
        reader.onload = function () {
          const url = String(reader.result || '');
          if (url.indexOf('data:image/') !== 0) return;
          const key = 'img_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          const prevKey = draft.bg && draft.bg.key;
          idbPut(key, url).then(function () {
            imageCache.set(key, url);
            // 换图即回收：不删旧键的话，每换一次就在 IDB 里多压一张 1280 宽的图。
            if (prevKey && prevKey !== key) {
              try { idbDelete(prevKey).then(function () { imageCache.delete(prevKey); }).catch(function () { /* ignore */ }); } catch (e) { /* ignore */ }
            }
            setBg({ source: 'image', key: key });
          }).catch(function (e) {
            try { window.alert(t('panel.alert.imgStore')); } catch (e2) { /* ignore */ }
          });
        };
        reader.readAsDataURL(file);
      };
      const anchors = draft[editScheme] || {};

      // 编辑器内的 AI 生成与图片取色：结果直接填进当前 draft，不新建主题。
      // 用户的实际流程是"新建 → 打开编辑器 → 填色 → 微调 → 保存"，
      // 所以这两件事本来就该发生在编辑器里，而不是设置面板。
      const [aiPrompt, setAiPrompt] = useState('');
      const [aiBusy, setAiBusy] = useState(false);
      const [aiResult, setAiResult] = useState(null);
      const [aiErr, setAiErr] = useState('');
      const [palette, setPalette] = useState(null);
      const [paletteBusy, setPaletteBusy] = useState(false);
      const [paletteErr, setPaletteErr] = useState('');

      const draftRef = useRef(draft);
      draftRef.current = draft;
      const commit = function (next) {
        setDraft(next);
        setDirty(true);
        props.onPreview(next, editScheme);
      };
      // 切 scheme 的场景：先落 draft，再按目标 scheme 预览一次。
      // 以前是 commit() + onPreview() 各一次 → 预设/填入要跑两遍 applyTokens（26–45KB CSS 重建两次）。
      const commitWith = function (next, scheme) {
        setDraft(next);
        setDirty(true);
        if (scheme && scheme !== editScheme) setEditScheme(scheme);
        props.onPreview(next, scheme || editScheme);
      };
      requestCloseRef.current = function () {
        if (dirty) setConfirmDiscard(true);
        else props.onClose();
      };
      const setAnchor = function (key, value) {
        const next = JSON.parse(JSON.stringify(draft));
        next[editScheme] = Object.assign({}, next[editScheme]);
        if (value) next[editScheme][key] = value;
        else delete next[editScheme][key];
        commit(next);
      };
      // 应用风格预设：一次填齐锚点 + 圆角 + 字体 + autoDark。
      // 深色系预设自带 dark 表（autoDark=false），所以预览切到深色；浅色系反之。
      const applyPreset = function (p) {
        if (!p) return;
        const n = JSON.parse(JSON.stringify(draft));
        // 替换而不是合并：预设是一整套配色。若只 merge，先套「赛博终端」再套「玻璃拟态」时，
        // 玻璃拟态没有 dark 表，赛博留下的深色锚点会继续支配深色态（浅色对、深色错）。
        n.light = Object.assign({}, p.light);
        n.dark = p.dark ? Object.assign({}, p.dark) : {};
        n.autoDark = p.autoDark;
        n.radiusScale = p.radius;
        n.font = { body: p.body || '', chat: p.chat || '' };
        const scheme = p.autoDark ? 'light' : 'dark';
        commitWith(n, scheme);
        if (p.autoDark && props.onSwitchToLight) props.onSwitchToLight();
      };
      // AI 生成的锚点一律落进 light（模型只给浅色），并强制打开 autoDark，
      // 否则深色模式下这些值不参与计算，用户会看到"只变了一点点"。
      const applyAiToDraft = function () {
        if (!aiResult) return;
        const n = JSON.parse(JSON.stringify(draft));
        n.light = Object.assign({}, n.light || {}, aiResult.light);
        if (aiResult.font) {
          n.font = Object.assign({}, n.font || {}, {
            body: aiResult.font.body || (n.font && n.font.body) || '',
            chat: aiResult.font.chat || (n.font && n.font.chat) || '',
          });
        }
        if (typeof aiResult.radiusScale === 'number') n.radiusScale = aiResult.radiusScale;
        // 名称：system 提示本来就要求模型给 label，但此前只把它显示在预览里，没写回 draft，
        // 于是「名称」输入框一直停在「自定义 N」。只在用户还没自己命名时采用建议名，
        // 避免把已经手输的名字覆盖掉。
        const suggested = cleanAiLabel(aiResult.label, aiPrompt);
        if (suggested && (!n.label || /^自定义\s*\d*$/.test(String(n.label).trim()))) n.label = suggested;
        n.autoDark = true;
        // AI 给的是浅色锚点；autoDark 下必须切到浅色预览，否则深色模式下看不到变化。
        commitWith(n, 'light');
        if (props.onSwitchToLight) props.onSwitchToLight();
        setAiResult(null); setAiPrompt('');
      };
      const aiGenerate = function () {
        const prompt = String(aiPrompt || '').trim();
        if (!prompt) return;
        setAiBusy(true); setAiErr(''); setAiResult(null);
        // query string 传参：宿主会在 handler 之前截走 POST body。
        fetch('/dsh-zhuoer-theme/api/gen-theme?prompt=' + encodeURIComponent(prompt), { method: 'GET', headers: { 'x-zhuoer-client': '1' } })
          .then(function (resp) { return resp.json(); })
          .then(function (data) {
            if (!data || !data.ok) {
              throw new Error((data && (data.message || data.error)) || t('panel.ai.failed'));
            }
            const parsed = extractAiTheme(data.text);
            if (!parsed) throw new Error(t('panel.ai.badJson'));
            setAiResult(parsed);
          })
          .catch(function (e) { setAiErr((e && e.message) || t('panel.ai.failed')); })
          .then(function () { setAiBusy(false); });
      };
      const pickPalette = function (ev) {
        const file = ev.target.files && ev.target.files[0];
        try { ev.target.value = ''; } catch (e) { /* ignore */ }
        if (!file) return;
        setPaletteBusy(true); setPaletteErr('');
        imageToImageData(file, 960).then(function (data) {
          const colors = extractPalette(data, 6);
          if (!colors.length) { setPaletteErr(t('panel.palette.noColors')); setPalette(null); }
          else setPalette(colors);
          setPaletteBusy(false);
        }).catch(function (e) {
          setPaletteErr((e && e.message) || t('panel.palette.failed')); setPaletteBusy(false);
        });
      };
      const applyPaletteToDraft = function () {
        if (!palette) return;
        const anchorsFromImage = paletteToAnchors(palette);
        if (!anchorsFromImage) { setPaletteErr(t('panel.palette.notEnough')); return; }
        const n = JSON.parse(JSON.stringify(draft));
        n.light = Object.assign({}, n.light || {}, anchorsFromImage);
        n.autoDark = true;
        // 取到的是照片原色，切浅色预览才能看见（否则被深色反推盖住）。
        commitWith(n, 'light');
        if (props.onSwitchToLight) props.onSwitchToLight();
        setPalette(null);
      };

      return h('div', { className: 'zp-ed', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('panel.ed.dialogAria') },
        h('div', { className: 'zp-ed-panel', ref: panelRef },
          h('div', { className: 'zp-ed-hd' },
            h('div', { className: 'zp-ed-ttl' }, t('panel.ed.title')),
            h('button', {
              type: 'button', className: 'zp-ed-x', 'aria-label': t('panel.ed.closeAria'),
              title: t('panel.ed.closeTitle'),
              onClick: function () { requestCloseRef.current(); },
            }, '×')
          ),
          h('div', { className: 'zp-ed-sec' }, h('div', { className: 'zp-sec-hd' }, h('div', { className: 'zp-sec-t' }, t('panel.ed.secAppearance')), h('div', { className: 'zp-sec-n' }, t('panel.ed.clonedFrom', { theme: THEMES[props.spec.base] ? (THEMES[props.spec.base].label || props.spec.base) : props.spec.base })))),
          h(Row, { label: t('panel.ed.name') },
            h('input', {
              type: 'text', className: 'zp-txt', value: draft.label, maxLength: 24,
              ref: nameRef, 'aria-label': t('panel.ed.nameAria'),
              onChange: function (ev) { const n = JSON.parse(JSON.stringify(draft)); n.label = ev.target.value; setDraft(n); setDirty(true); },
            })
          ),
          h(Row, { label: t('panel.ed.dark') },
            h('label', { className: 'zp-chk' },
              h('input', {
                type: 'checkbox', checked: draft.autoDark === true,
                onChange: function (ev) {
                  const n = JSON.parse(JSON.stringify(draft));
                  n.autoDark = Boolean(ev.target.checked);
                  commit(n);
                },
              }),
              h('span', null, t('panel.ed.autoDark'))
            )
          ),
          h(Row, { label: t('panel.ed.editRow') },
            h(Pills, {
              label: t('panel.ed.schemeAria'),
              opts: [['light', t('panel.ed.light')], ['dark', t('panel.ed.dark')]],
              value: editScheme,
              onChange: function (v) {
                setEditScheme(v);
                // 切明暗立刻按新 scheme 预览，否则面板显示浅色、界面仍是深色
                props.onPreview(JSON.parse(JSON.stringify(draftRef.current)), v);
              },
            })
          ),
          h('div', { className: 'zp-ed-sec' }, h('div', { className: 'zp-sec-hd' }, h('div', { className: 'zp-sec-t' }, t('panel.ed.anchors')), h('div', { className: 'zp-sec-n' }, t('panel.ed.anchorsNote')))),
          h('div', { className: 'zp-ed-list' },
            ANCHOR_GROUPS.map(function (g) {
              const own = anchors[g.anchor];
              const cur = own || baseTokens[g.anchor] || '#000000';
              const bgHex = anchors['--dsw-alias-bg-base'] || baseTokens['--dsw-alias-bg-base'] || '#000000';
              const ratio = g.key === 'bg' ? null : contrastRatio(cur, bgHex);
              return h(AnchorRow, {
                key: g.key, label: t('anchor.' + g.key), anchor: g.anchor, value: cur,
                ratio: ratio, low: ratio != null && ratio < 4.5,
                dirty: Boolean(own),
                onChange: function (v) { setAnchor(g.anchor, v); },
              });
            })
          ),
          h('div', { className: 'zp-ed-sec' }, h('div', { className: 'zp-sec-hd' }, h('div', { className: 'zp-sec-t' }, t('panel.ed.presets')), h('div', { className: 'zp-sec-n' }, t('panel.ed.presetsNote')))),
          h(Row, { label: t('panel.ed.presets') },
            h('div', { className: 'zp-presets' },
              STYLE_PRESETS.map(function (p) {
                return h('button', {
                  type: 'button', className: 'zp-preset', key: p.id,
                  title: t('panel.ed.presetTitle', { label: t('preset.' + p.id), radius: p.radius, body: p.body === '__mono__' ? t('panel.ed.mono') : p.body }),
                  onClick: function () { applyPreset(p); },
                }, t('preset.' + p.id));
              })
            )
          ),
          h('div', { className: 'zp-ed-sec' }, h('div', { className: 'zp-sec-hd' }, h('div', { className: 'zp-sec-t' }, t('panel.ed.aiSection')), h('div', { className: 'zp-sec-n' }, t('panel.ed.aiNote')))),
          h(Row, { label: t('panel.ed.aiRow') },
            h('div', { className: 'zp-ed-ai' },
              h('textarea', {
                className: 'zp-json', rows: 3, 'aria-label': t('panel.ed.aiPromptAria'),
                placeholder: t('panel.ed.aiPromptPh'),
                value: aiPrompt,
                onChange: function (ev) { setAiPrompt(ev.target.value); },
              }),
              h('div', { className: 'zp-cus-acts' },
                h('button', {
                  type: 'button', className: 'zp-btn zp-btn-pri',
                  disabled: aiBusy,
                  onClick: function () { aiGenerate(); },
                }, aiBusy ? t('panel.ed.generating') : t('panel.ed.generate')),
                aiErr ? h('span', { className: 'zp-ed-err', role: 'alert' }, aiErr) : null
              ),
              aiResult
                ? h('div', null,
                    h('div', { className: 'zp-hint' }, t('panel.ed.aiPreview', { label: aiResult.label }) +
                      (aiResult.dropped && aiResult.dropped.length ? t('panel.ed.aiDropped', { n: aiResult.dropped.length }) : '')),
                    h('div', { className: 'zp-pal' },
                      Object.keys(aiResult.light).map(function (k) {
                        const grp = ANCHOR_GROUPS.filter(function (g) { return g.anchor === k; })[0];
                        return h('div', { className: 'zp-pal-item', key: k },
                          h('span', { className: 'zp-pal-sw', style: { background: aiResult.light[k] } }),
                          h('span', { className: 'zp-pal-name' }, grp ? t('anchor.' + grp.key) : k.replace('--dsw-alias-', '')),
                          h('span', { className: 'zp-pal-hex' }, aiResult.light[k])
                        );
                      })
                    ),
                    h('div', { className: 'zp-cus-acts' },
                      h('button', {
                        type: 'button', className: 'zp-btn zp-btn-pri',
                        onClick: function () { applyAiToDraft(); },
                      }, t('panel.ed.applyCurrent')),
                      h('button', {
                        type: 'button', className: 'zp-btn',
                        onClick: function () { setAiResult(null); },
                      }, t('panel.ed.drop'))
                    )
                  )
                : null
            )
          ),
          h(Row, { label: t('panel.ed.pickFromImage') },
            h('div', { className: 'zp-ed-ai' },
              h('label', { className: 'zp-btn zp-file' }, paletteBusy ? t('panel.ed.picking') : t('panel.ed.pickImage'),
                h('input', { type: 'file', accept: 'image/*', onChange: function (ev) { pickPalette(ev); } })
              ),
              paletteErr ? h('span', { className: 'zp-ed-err', role: 'alert' }, paletteErr) : null,
              palette
                ? h('div', { className: 'zp-pal' },
                    palette.map(function (c) {
                      return h('div', { className: 'zp-pal-item', key: c.hex },
                        h('span', { className: 'zp-pal-sw', style: { background: c.hex } }),
                        h('span', { className: 'zp-pal-hex' }, c.hex),
                        h('span', { className: 'zp-pal-share' }, Math.round(c.share * 100) + '%')
                      );
                    })
                  )
                : null,
              palette
                ? h('div', { className: 'zp-cus-acts' },
                    h('button', {
                      type: 'button', className: 'zp-btn zp-btn-pri',
                      onClick: function () { applyPaletteToDraft(); },
                    }, t('panel.ed.applyCurrent')),
                    h('button', {
                      type: 'button', className: 'zp-btn',
                      onClick: function () { setPalette(null); setPaletteErr(''); },
                    }, t('panel.ed.clear'))
                  )
                : null
            )
          ),

          h('div', { className: 'zp-ed-sec' }, h('div', { className: 'zp-sec-hd' }, h('div', { className: 'zp-sec-t' }, t('panel.ed.bgSection')), h('div', { className: 'zp-sec-n' }, t('panel.ed.bgNote')))),
          h(Row, { label: t('panel.ed.bgSection') },
            h(Pills, {
              label: t('panel.ed.bgSourceAria'),
              opts: [['', t('panel.ed.bgFollowGlobal')], ['theme', t('panel.ed.bgThemeOwn')], ['image', t('panel.ed.bgCustom')], ['none', t('panel.ed.bgNone')]],
              value: (bg.source || ''),
              onChange: function (v) { setBg({ source: v, key: v === 'image' ? bg.key : '' }); },
            })
          ),
          bg.source === 'image'
            ? h(Row, { label: t('panel.ed.imageRow') },
                h('label', { className: 'zp-btn zp-file' }, t('panel.ed.pickImage'),
                  h('input', {
                    type: 'file', accept: 'image/*',
                    onChange: function (ev) { handleBgFile(ev); },
                  })
                ),
                (bg.key && imageCache.has(bg.key))
                  ? h('img', { className: 'zp-thumb', alt: t('panel.ed.bgPreviewAlt'), src: imageCache.get(bg.key) })
                  : h('span', { className: 'zp-hint' }, t('panel.ed.bgStoredHint'))
              )
            : null,
          (bg.source && bg.source !== 'none')
            ? h(Row, { label: t('panel.ed.opacityRow') },
                h('input', {
                  type: 'range', className: 'zp-range', min: 0, max: 100,
                  value: typeof bg.opacity === 'number' ? bg.opacity : 85,
                  style: { '--zp-pct': (typeof bg.opacity === 'number' ? bg.opacity : 85) + '%' },
                  'aria-label': t('panel.ed.bgOpacityAria'),
                  onChange: function (ev) { setBg({ opacity: Number(ev.target.value) || 0 }); },
                }),
                h('span', { className: 'zp-val' }, (typeof bg.opacity === 'number' ? bg.opacity : 85) + '%')
              )
            : null,
          h('div', { className: 'zp-ed-sec' }, h('div', { className: 'zp-sec-hd' }, h('div', { className: 'zp-sec-t' }, t('panel.ed.shapeSection')), h('div', { className: 'zp-sec-n' }, t('panel.ed.shapeNote')))),
          h(Row, { label: t('panel.ed.radiusRow') },
            h(Pills, {
              label: t('panel.ed.radiusAria'),
              opts: [[0, t('panel.ed.radiusSquare')], [0.6, t('panel.ed.radiusSmall')], [1, t('panel.ed.radiusNormal')], [1.5, t('panel.ed.radiusLarge')], [2, t('panel.ed.radiusXL')]],
              value: draft.radiusScale == null ? 1 : draft.radiusScale,
              onChange: function (v) {
                const n = JSON.parse(JSON.stringify(draft));
                n.radiusScale = v;
                commit(n);
              },
            })
          ),
          h(Row, { label: t('panel.ed.sharpRow') },
            h('label', { className: 'zp-chk' },
              h('input', {
                type: 'checkbox', checked: pref.sharp === true,
                onChange: function (ev) { set({ sharp: Boolean(ev.target.checked) }); },
              }),
              t('panel.ed.sharpOn')
            ),
            h('span', { className: 'zp-hint' }, t('panel.ed.sharpNote'))
          ),
          h(Row, { label: t('panel.ed.bodyFont') },
            h(Select, {
              label: t('panel.ed.bodyFont'),
              value: (draft.font && draft.font.body) || '',
              options: FONT_CHOICES,
              emptyLabel: t('panel.ed.followBase', { theme: THEMES[props.spec.base] ? (THEMES[props.spec.base].label || props.spec.base) : props.spec.base }),
              onChange: function (v) {
                const n = JSON.parse(JSON.stringify(draft));
                n.font = n.font || {};
                n.font.body = v === '__empty__' ? '' : v;
                commit(n);
              },
            })
          ),
          h(Row, { label: t('panel.ed.chatFont') },
            h(Select, {
              label: t('panel.ed.chatFont'),
              value: (draft.font && draft.font.chat) || '',
              options: FONT_CHOICES,
              emptyLabel: t('panel.ed.followBase', { theme: THEMES[props.spec.base] ? (THEMES[props.spec.base].label || props.spec.base) : props.spec.base }),
              onChange: function (v) {
                const n = JSON.parse(JSON.stringify(draft));
                n.font = n.font || {};
                n.font.chat = v === '__empty__' ? '' : v;
                commit(n);
              },
            })
          ),

          h('div', { className: 'zp-ed-ft' },
            confirmDiscard
              ? h('span', { className: 'zp-ed-confirm', role: 'alert' }, t('panel.ed.confirmDiscard'))
              : h('span', { className: 'zp-hint' }, dirty ? t('panel.ed.dirtyHint') : ''),
            confirmDiscard
              ? h('button', { type: 'button', className: 'zp-btn', onClick: function () { setConfirmDiscard(false); } }, t('panel.ed.keepEditing'))
              : h('button', { type: 'button', className: 'zp-btn', onClick: function () { requestCloseRef.current(); } }, t('panel.ed.cancel')),
            confirmDiscard
              ? h('button', { type: 'button', className: 'zp-btn', 'data-tone': 'danger', onClick: function () { props.onClose(); } }, t('panel.ed.discard'))
              : h('button', { type: 'button', className: 'zp-btn zp-btn-pri', onClick: function () { props.onSave(draft); } }, t('panel.ed.save'))
          )
        )
      );
    }

    // JSON 导入导出弹层。抽成独立组件是为了让它也能用 useModalA11y ——
    // 内联在 SkinSettings 里时没法条件调用 hook（hook 必须无条件调用）。
    function JsonModal(props) {
      const st = props.state;
      const panelRef = useRef(null);
      const closeRef = useRef(null);
      closeRef.current = function () { props.onClose(); };
      useModalA11y(panelRef, closeRef, null);
      return h('div', { className: 'zp-ed', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('panel.io.jsonAria') },
        h('div', { className: 'zp-ed-panel', ref: panelRef },
          h('div', { className: 'zp-ed-hd' },
            h('div', { className: 'zp-ed-ttl' }, st.mode === 'export' ? t('panel.io.exportTitle') : t('panel.io.importTitle')),
            h('button', {
              type: 'button', className: 'zp-ed-x', 'aria-label': t('panel.io.close'),
              onClick: function () { props.onClose(); },
            }, '×')
          ),
          st.err ? h('div', { className: 'zp-ed-err', role: 'alert' }, st.err) : null,
          h('textarea', {
            className: 'zp-json', rows: 14, spellCheck: false,
            value: st.text,
            'aria-label': t('panel.io.jsonAria'),
            onChange: function (ev) { props.onChange(ev.target.value); },
          }),
          h('div', { className: 'zp-hint' },
            st.mode === 'export'
              ? t('panel.io.exportHint')
              : t('panel.io.importHint')
          ),
          h('div', { className: 'zp-ed-ft' },
            h('button', { type: 'button', className: 'zp-btn', onClick: function () { props.onClose(); } }, t('panel.io.close')),
            st.mode === 'import'
              ? h('button', { type: 'button', className: 'zp-btn zp-btn-pri', onClick: function () { props.onImport(); } }, t('panel.io.import'))
              : null
          )
        )
      );
    }

    // 面板错误边界：主题面板里任何一处抛错（损坏的 JSON、派生失败）都不该把整个设置页拖黑。
    // 快捷导航早有 Boundary，主题面板此前是裸挂的。
    class PanelBoundary extends React.Component {
      constructor(props) { super(props); this.state = { err: null }; }
      static getDerivedStateFromError(err) { return { err: err }; }
      // 记一笔到控制台：getDerivedStateFromError 之后 React 会清掉调用栈，
      // 不在这里留痕的话，用户只能看到那一行 message。
      componentDidCatch(err) {
        try { console.error('[zhuoer-theme] 面板渲染出错', err); } catch (e) { /* ignore */ }
      }
      render() {
        if (this.state.err) {
          const msg = String((this.state.err && this.state.err.message) || this.state.err);
          const self = this;
          return h('div', { className: 'zp-root' },
            h('div', { className: 'zp-hint' }, t('panel.err.title', { msg: msg })),
            // 以前只有一句「刷新页面」；现在可以直接重试，草稿在编辑器里、重挂载后仍在 localStorage。
            h('div', { className: 'zp-cus-acts' },
              h('button', { type: 'button', className: 'zp-btn', onClick: function () { self.setState({ err: null }); } }, t('panel.err.retry')),
              h('button', { type: 'button', className: 'zp-btn', onClick: function () { try { window.location.reload(); } catch (e) { /* ignore */ } } }, t('panel.err.reload'))
            ),
            h('div', { className: 'zp-hint' }, t('panel.err.hint'))
          );
        }
        return this.props.children;
      }
    }

    function SkinSettings() {
      const [pref, setPref] = useState(readPref());
      // 正在编辑的自定义主题草稿（null = 不开编辑器）
      const [editing, setEditing] = useState(null);
      // 进编辑器前的明暗模式：编辑器里切「编辑深/浅」只是为了盯不同 scheme，
      // 不能让它顺手把应用的明暗偏好也改掉，保存时用这个还原。
      const [modeBeforeEdit, setModeBeforeEdit] = useState(null);
      // 本次编辑器里「新建/复制」出来的主题 id：取消时回收，不进列表、不留残渣。
      const [createdId, setCreatedId] = useState(null);
      const [themeBeforeEdit, setThemeBeforeEdit] = useState(null);
      // JSON 导入导出浮层：null = 关闭
      const [jsonIO, setJsonIO] = useState(null);
      // 两步确认的第二态：点「恢复默认设置」后进入待确认，3.5s 没第二下就撤销。
      // 重置会清掉底图（可能是一张用户找不到原图的自定义图），值得多问一次。
      const [resetArmed, setResetArmed] = useState(false);
      // 删除主题的两步确认：删除会连同该主题的底图一起清掉，底图没备份就找不回来，
      // 值得多问一次。照抄「恢复默认设置」的定时撤销模式（3.5 秒）。
      const [deleteArmed, setDeleteArmed] = useState(false);
      useEffect(function () {
        const fn = function () { setPref(readPref()); };
        listeners.add(fn);
        return function () { listeners.delete(fn); };
      }, []);
      useEffect(function () {
        if (!resetArmed) return undefined;
        const t = setTimeout(function () { setResetArmed(false); }, 3500);
        return function () { clearTimeout(t); };
      }, [resetArmed]);
      useEffect(function () {
        if (!deleteArmed) return undefined;
        const t = setTimeout(function () { setDeleteArmed(false); }, 3500);
        return function () { clearTimeout(t); };
      }, [deleteArmed]);
      // 换了主题（或删完回到内置主题）就撤销待确认态，避免「上一步的删除确认」被带到下一个主题上。
      useEffect(function () { setDeleteArmed(false); }, [pref.theme]);
      // 所有写入走同一个口子：先落 localStorage，再刷新本地 state，再通知 apply()
      // 重算 token —— 少一步界面就和存储不同步。
      const set = function (patch) { writePref(patch); setPref(readPref()); emitChange(); };
      // 对话宽度输入框：空 = 自适应（存 0），否则夹到宿主的 [640, 1600] 区间。
      // 边打字边裁剪会把「8」立刻变成「640」，所以只在失焦/回车时提交。
      const commitChatWidth = function (raw) {
        const s = String(raw == null ? '' : raw).trim();
        if (!s) { set({ chatWidth: 0 }); return; }
        const n = parseInt(s, 10);
        if (!isFinite(n)) { set({ chatWidth: 0 }); return; }
        set({ chatWidth: Math.max(640, Math.min(1600, Math.round(n))) });
      };

      // ---- 自定义主题的增删改 ----
      // 预览只 setPref（改组件 state，不落盘），保存才 writePref —— 否则「取消」会留下痕迹。
      const previewCustom = function (next, previewScheme) {
        const mergedCustoms = customs.map(function (c) { return c.id === next.id ? next : c; });
        const merged = Object.assign({}, pref, {
          theme: next.id,
          customThemes: mergedCustoms,
          mode: previewScheme === 'light' || previewScheme === 'dark' ? previewScheme : pref.mode,
        });
        setPref(merged);
        schedulePreview(merged);
      };
      // ---- 从图片取色（纯本地，不上传）----
      const openEditor = function (spec) {
        // 两个弹层互斥：同时开着会叠两层 aria-modal，键盘行为互相打架。
        setJsonIO(null);
        setModeBeforeEdit(pref.mode);
        setThemeBeforeEdit(pref.theme);
        setEditing(spec);
      };
      const newCustom = function () {
        if (customs.length >= CUSTOM_MAX) { alert(t('panel.custom.limitErr', { n: CUSTOM_MAX })); return; }
        const base = THEME_IDS.indexOf(pref.theme) !== -1 ? pref.theme : (currentCustom ? currentCustom.base : 'zhuoer');
        const spec = {
          id: 'c' + Date.now().toString(36), label: t('panel.custom.newLabel', { n: customs.length + 1 }),
          base: base, dark: {}, light: {},
        };
        setCreatedId(spec.id);
        set({ customThemes: customs.concat([spec]), theme: spec.id });
        openEditor(spec);
      };
      const saveCustom = function (draft) {
        const next = customs.map(function (c) { return c.id === draft.id ? draft : c; });
        // mode 用进编辑器前的值还原：预览期间它被临时改成正在编辑的 scheme。
        set({ customThemes: next, theme: draft.id, mode: modeBeforeEdit || pref.mode });
        setCreatedId(null);
        // 保存同样要把宿主明暗还原成编辑前的值，否则两端又会不一致。
        if (modeBeforeEdit) { try { writeHostMode(modeBeforeEdit); } catch (e) { /* ignore */ } }
        setEditing(null);
        setModeBeforeEdit(null);
      };
      const cancelCustom = function () {
        // 取消必须把宿主明暗一起还原：编辑期间「填入」会调 onSwitchToLight，
        // 那是真的把宿主 preference 写成 light —— 只重置本地 state 会让整个应用停在浅色。
        const back = modeBeforeEdit;
        // 取消 = 放弃这次编辑：本次新建/复制出来的那条要从列表里收走，主题回到进编辑器之前。
        if (createdId) {
          const rest = customs.filter(function (c) { return c.id !== createdId; });
          set({ customThemes: rest, theme: themeBeforeEdit || 'zhuoer' });
        }
        setCreatedId(null);
        setEditing(null);
        setModeBeforeEdit(null);
        if (back) { try { writeHostMode(back); } catch (e) { /* ignore */ } }
        setPref(readPref());
        applyTokens(themeRef, readPref());
      };
      const duplicateCustom = function () {
        if (!currentCustom) return;
        if (customs.length >= CUSTOM_MAX) { alert(t('panel.custom.limitErr', { n: CUSTOM_MAX })); return; }
        const copy = JSON.parse(JSON.stringify(currentCustom));
        copy.id = 'c' + Date.now().toString(36);
        copy.label = (currentCustom.label + t('panel.custom.copySuffix')).slice(0, 24);
        setCreatedId(copy.id);
        set({ customThemes: customs.concat([copy]), theme: copy.id });
        openEditor(copy);
      };
      const exportCustom = function () {
        if (!currentCustom) return;
        // 与编辑器互斥：同时开两个弹层会让 aria-modal 叠加、Tab 行为打架。
        setEditing(null);
        // 底图本体在本机 IndexedDB，JSON 里只有一个引用键；导出时把键摘掉，
        // 避免对方导入后拿到一个指向不存在图片的引用（表现为「导入成功但底图空白」）。
        const spec = JSON.parse(JSON.stringify(currentCustom));
        if (spec.bg && spec.bg.key) spec.bg = { source: 'none' };
        setJsonIO({ mode: 'export', text: JSON.stringify(spec, null, 2) });
      };
      const doImport = function () {
        let spec = null;
        try { spec = sanitizeCustomSpec(JSON.parse(jsonIO.text)); } catch (e) { spec = null; }
        if (!spec) {
          setJsonIO({ mode: 'import', text: jsonIO.text, err: t('panel.io.parseErr') });
          return;
        }
        if (customs.length >= CUSTOM_MAX) {
          setJsonIO({ mode: 'import', text: jsonIO.text, err: t('panel.custom.limitErr', { n: CUSTOM_MAX }) });
          return;
        }
        if (customs.some(function (c) { return c.id === spec.id; })) spec.id = 'c' + Date.now().toString(36);
        set({ customThemes: customs.concat([spec]), theme: spec.id });
        setJsonIO(null);
      };
      const deleteCustom = function () {
        if (!currentCustom) return;
        if (!deleteArmed) { setDeleteArmed(true); return; }
        setDeleteArmed(false);
        // 主题自带的底图一并从 IndexedDB 清掉，否则删一个主题留一张图，越堆越多
        const bgKey = currentCustom.bg && currentCustom.bg.key;
        if (bgKey) {
          try {
            idbDelete(bgKey).then(function () { imageCache.delete(bgKey); }).catch(function () { /* ignore */ });
          } catch (e) { /* ignore */ }
        }
        set({
          customThemes: customs.filter(function (c) { return c.id !== currentCustom.id; }),
          theme: currentCustom.base,
        });
        setEditing(null);
      };

      // 顺序与宿主「设置-通用设置」的三态一致：浅色 / 深色 / 跟随系统。
      // 模式选项文案随语言变化：用函数在渲染时取。
      const modes = function () { return [['light', t('panel.theme.optLight')], ['dark', t('panel.theme.optDark')], ['auto', t('panel.theme.optAuto')]]; };
      // 选项文案随语言变化：用函数在渲染时取，避免把语言烤进常量。
        const sources = function () { return [['none', t('panel.bg.optNone')], ['theme', t('panel.bg.optTheme')], ['image', t('panel.bg.optImage')]]; };
      const styles = function () { return [['fade', t('panel.bg.optFade')], ['full', t('panel.bg.optFull')]]; };
      // 字号档位文案随语言变化：用函数在渲染时取词。
    const scales = function () {
      return [[90, t('panel.scale.small')], [100, t('panel.scale.default')], [110, t('panel.scale.large')], [125, t('panel.scale.xl')], [140, t('panel.scale.xxl')]];
    };
      const labelOf = function (list, v) {
        for (let i = 0; i < list.length; i++) { if (list[i][0] === v) return list[i][1]; }
        return String(v);
      };

      // liveScheme 由 applyTokens 写入：面板拿不到 ctx.theme，
      // 只能靠这条共享值判断「当前实际是深还是浅」。
      const scheme = liveScheme;
      // 三态显示以宿主偏好为准（通用设置里改过，这里立即跟着变）；宿主不可用时退回本地 pref。
      const modeNow = hostMode() || pref.mode;
      // 写入方向：先改宿主偏好（另一个设置页会同步），再落本地镜像，保持两端一致。
      function syncMode(v) {
        writeHostMode(v);
        set({ mode: v });
      }
      const customs = pref.customThemes || [];
      const currentCustom = customSpec(pref);
      const themeDef = THEMES[pref.theme] || {};
      const themeName = themeLabelOf((currentCustom && currentCustom.label) || themeDef.label || pref.theme);
      const accents = accentOptions(effectiveThemeId(pref), scheme, pref.accent);
      const accentNow = pref.accent || accents[0] || '#000000';
      const bgOn = pref.bgSource !== 'none';
      const scalePx = Math.round(16 * pref.fontScale / 100);

      // 底图：压到最长边 1280 + JPEG 0.72，原图动辄几 MB，直接塞 localStorage 会超限。
      const pickImage = function (file) {
        if (file.size > IMG_MAX_BYTES) {
          try { window.alert(t('panel.alert.imgMax')); } catch (e) { /* ignore */ }
          return;
        }
        const reader = new FileReader();
        reader.onload = function () {
          try {
            const img = new Image();
            img.onload = function () {
              const max = 1280;
              const scale = Math.min(1, max / Math.max(img.width, img.height));
              const cv = document.createElement('canvas');
              cv.width = Math.round(img.width * scale);
              cv.height = Math.round(img.height * scale);
              const cx = cv.getContext('2d');
              if (cx) cx.drawImage(img, 0, 0, cv.width, cv.height);
              const dataUrl = cv.toDataURL('image/jpeg', 0.72);
              // 先试写再真写：放不下时给明确提示，而不是让 setItem 静默失败
              try {
                const probeKey = STORE + ':probe';
                window.localStorage.setItem(probeKey, dataUrl);
                window.localStorage.removeItem(probeKey);
              } catch (err) {
                try { window.alert(t('panel.alert.imgStore')); } catch (e2) { /* ignore */ }
                return;
              }
              set({ bgImage: dataUrl, bgSource: 'image' });
            };
            img.src = String(reader.result);
          } catch (e) { set({ bgImage: String(reader.result), bgSource: 'image' }); }
        };
        reader.readAsDataURL(file);
      };

      // 品牌位图片：比底图小得多（徽标高约 24px），压到最长边 512 就够，直接存 localStorage。
      // 存 PNG 而不是 JPEG：换掉的 logo 大多是透明底，转 JPEG 会糊成一块白/黑。
      const pickBrand = function (file) {
        if (file.size > IMG_MAX_BYTES) {
          try { window.alert(t('panel.alert.imgMax')); } catch (e) { /* ignore */ }
          return;
        }
        const reader = new FileReader();
        reader.onload = function () {
          try {
            const img = new Image();
            img.onload = function () {
              const max = 512;
              const scale = Math.min(1, max / Math.max(img.width, img.height));
              const cv = document.createElement('canvas');
              cv.width = Math.max(1, Math.round(img.width * scale));
              cv.height = Math.max(1, Math.round(img.height * scale));
              const cx = cv.getContext('2d');
              if (cx) cx.drawImage(img, 0, 0, cv.width, cv.height);
              set({ brandImage: cv.toDataURL('image/png'), brandLogo: true });
            };
            img.src = String(reader.result);
          } catch (e) { /* ignore */ }
        };
        reader.readAsDataURL(file);
      };

      // 重置 = 删掉存储键本身，而不是写一份「默认值对象」：
      // readPref 对缺字段有内置默认，删键才是真正的「回到初始状态」，
      // 也避免以后新增字段时重置漏写一个。
      const resetAll = function () {
        try { window.localStorage.removeItem(STORE); } catch (e) { /* ignore */ }
        // localStorage 之外还有 IDB：主题底图本体在那里，不清就是无主数据。
        try { idbClearAll().then(function () { imageCache.clear(); }).catch(function () { /* ignore */ }); } catch (e) { /* ignore */ }
        setPref(readPref());
        emitChange();
        setResetArmed(false);
      };

      return h('div', { className: 'zp-root' },
        h('style', null, PANEL_CSS),
        jsonIO
          ? h(JsonModal, {
              state: jsonIO,
              onClose: function () { setJsonIO(null); },
              onChange: function (text) { setJsonIO({ mode: jsonIO.mode, text: text }); },
              onImport: doImport,
            })
          : null,
        editing
          ? h(ThemeEditor, {
              key: editing.id,
              spec: editing,
              scheme: scheme,
              onPreview: previewCustom,
              onSave: saveCustom,
              onClose: cancelCustom,
              // 填入取色/AI 结果时把应用明暗切到浅色，
              // 否则深色系统下用户看到的是反推结果，会以为"取色取错了"。
              // 同时更新 modeBeforeEdit：保存时会用 "modeBeforeEdit || pref.mode" 还原，
              // 不同步的话刚切到浅色，一保存又被拉回原来的深色。
              onSwitchToLight: function () {
                if (modeNow !== 'light') { setModeBeforeEdit('light'); syncMode('light'); }
              },
            })
          : null,
        h('div', { className: 'zp-hd' },
          h('div', { className: 'zp-hd-row' },
            h('div', { className: 'zp-hd-t' }, t('panel.header.title')),
            h('span', { className: 'zp-tag' }, themeName)
          ),
          h('div', { className: 'zp-hd-m' },
            h('span', null, labelOf(modes(), modeNow)),
            h('span', null, t('panel.header.count', { n: THEME_IDS.length })),
            h('span', { className: 'zp-live' }, t('panel.header.live'))
          )
        ),

        h(Section, { title: t('panel.theme.title'), note: t('panel.theme.note') },
          h(Row, { label: t('panel.theme.modeRow') },
            h(Pills, { label: t('panel.theme.modeAria'), opts: modes(), value: modeNow,
              onChange: function (v) { syncMode(v); } })
          ),
          h('div', { className: 'zp-ths' },
            THEME_IDS.map(function (id) {
              return h(Swatch, {
                key: id, id: id, def: THEMES[id], scheme: scheme,
                active: pref.theme === id,
                onPick: function (x) { set({ theme: x }); },
              });
            }),
            customs.map(function (spec) {
              return h(Swatch, {
                key: spec.id, id: spec.id, scheme: scheme,
                def: {
                  label: spec.label,
                  dark: buildCustomTokens(spec, 'dark'),
                  light: buildCustomTokens(spec, 'light'),
                },
                active: pref.theme === spec.id,
                onPick: function (x) { set({ theme: x }); },
              });
            }),
            h('button', {
              type: 'button', className: 'zp-th zp-th-add', title: t('panel.theme.addTitle'),
              onClick: newCustom,
            },
              h('span', { className: 'zp-th-p zp-th-p-add', 'aria-hidden': 'true' }, '+'),
              h('span', { className: 'zp-th-n' }, h('span', { className: 'zp-th-nm' }, t('panel.theme.addLabel')))
            )
          ),
          currentCustom
            ? h('div', { className: 'zp-cus-acts' },
                h('button', { type: 'button', className: 'zp-btn', onClick: function () { openEditor(currentCustom); } }, t('panel.theme.edit')),
                h('button', { type: 'button', className: 'zp-btn', onClick: duplicateCustom }, t('panel.theme.duplicate')),
                h('button', { type: 'button', className: 'zp-btn', onClick: exportCustom }, t('panel.theme.exportJson')),
                h('button', {
                  type: 'button', className: 'zp-btn' + (deleteArmed ? ' is-armed' : ''), 'data-tone': 'danger',
                  onClick: deleteCustom,
                }, deleteArmed ? t('panel.theme.deleteConfirm') : t('panel.theme.delete'))
              )
            : null,
          h('div', { className: 'zp-cus-acts' },
            h('button', {
              type: 'button', className: 'zp-btn',
              onClick: function () { setEditing(null); setJsonIO({ mode: 'import', text: '' }); },
            }, t('panel.theme.importJson'))
          )
        ),

        h(Section, { title: t('panel.bg.title'), note: t('panel.bg.note') },
          h(Row, { label: t('panel.bg.sourceRow') },
            h(Pills, { label: t('panel.bg.sourceAria'), opts: sources(), value: pref.bgSource,
              onChange: function (v) { set({ bgSource: v }); } })
          ),
          pref.bgSource === 'image'
            ? h(Row, { label: t('panel.bg.imageRow') },
                h('label', { className: 'zp-btn zp-file' }, t('panel.bg.pick'),
                  h('input', {
                    type: 'file', accept: 'image/*',
                    onChange: function (ev) {
                      const file = ev.target.files && ev.target.files[0];
                      // 选同一个文件不会再触发 change，先清空 value 才能重选
                      try { ev.target.value = ''; } catch (e) { /* ignore */ }
                      if (file) pickImage(file);
                    },
                  })
                ),
                pref.bgImage ? h('img', { className: 'zp-thumb', alt: t('panel.bg.previewAlt'), src: pref.bgImage }) : null,
                pref.bgImage
                  ? h('button', {
                      type: 'button', className: 'zp-btn',
                      onClick: function () { set({ bgImage: '', bgSource: 'none' }); },
                    }, t('panel.bg.remove'))
                  : h('span', { className: 'zp-hint' }, t('panel.bg.formatHint'))
              )
            : null,
          h('div', null,
            h(Row, { label: t('panel.bg.styleRow') },
              h(Pills, { label: t('panel.bg.styleAria'), opts: styles(), value: pref.bgStyle,
                onChange: function (v) { set({ bgStyle: v }); } })
            ),
            h(Row, { label: t('panel.bg.opacityRow') },
              h('input', {
                type: 'range', className: 'zp-range', min: 0, max: 100,
                value: pref.bgOpacity, 'aria-label': t('panel.bg.opacityAria'),
                // 已选段长度交给 CSS 渐变：读起来是「填到哪了」，不是一根无信息的灰轨
                style: { '--zp-pct': (Number(pref.bgOpacity) || 0) + '%' },
                onChange: function (ev) { set({ bgOpacity: Number(ev.target.value) || 0 }); },
              }),
              h('span', { className: 'zp-val' }, pref.bgOpacity + '%'),
              // 滑块 85% ≠ 实际 85% 不透明度（实现是 可见度 × 0.7）。上限写在旁边而不是塞进
              // 行标签：塞进 4.8em 的标签列会把这一行撑成三行，整块的行高跟着变形。
              h('span', { className: 'zp-hint' }, t('panel.bg.opacityCap'))
            ),
            h(Row, { label: t('panel.bg.showRow') },
              h('label', { className: 'zp-chk' },
                h('input', {
                  type: 'checkbox', checked: pref.bgOnEmpty !== false,
                  onChange: function (ev) { set({ bgOnEmpty: Boolean(ev.target.checked) }); },
                }),
                t('panel.bg.showEmpty')
              ),
              h('label', { className: 'zp-chk' },
                h('input', {
                  type: 'checkbox', checked: pref.bgOnSession !== false,
                  onChange: function (ev) { set({ bgOnSession: Boolean(ev.target.checked) }); },
                }),
                t('panel.bg.showSession')
              )
            )
          ),
          bgOn ? null : h('div', { className: 'zp-hint' }, t('panel.bg.offHint'))
        ),

        h(Section, { title: t('panel.brand.title'), note: t('panel.brand.note') },
          h(Row, { label: t('panel.brand.toggle') },
            h('label', { className: 'zp-chk' },
              h('input', {
                type: 'checkbox', checked: pref.brandLogo === true,
                onChange: function (ev) { set({ brandLogo: Boolean(ev.target.checked) }); },
              }),
              t('panel.brand.toggleHint')
            ),
            pref.brandLogo && !pref.brandImage
              ? h('span', { className: 'zp-hint' }, t('panel.brand.builtinHint'))
              : null
          ),
          h(Row, { label: t('panel.brand.imageRow') },
            h('label', { className: 'zp-btn zp-file' }, pref.brandImage ? t('panel.brand.repick') : t('panel.brand.pick'),
              h('input', {
                type: 'file', accept: 'image/png,image/jpeg,image/webp',
                onChange: function (ev) {
                  const file = ev.target.files && ev.target.files[0];
                  // 选同一个文件不会再触发 change，先清空 value 才能重选
                  try { ev.target.value = ''; } catch (e) { /* ignore */ }
                  if (file) pickBrand(file);
                },
              })
            ),
            pref.brandImage ? h('img', { className: 'zp-thumb', alt: t('panel.brand.previewAlt'), src: pref.brandImage }) : null,
            pref.brandImage
              ? h('button', {
                  type: 'button', className: 'zp-btn',
                  onClick: function () { set({ brandImage: '', brandLogo: false }); },
                }, t('panel.brand.remove'))
              : h('span', { className: 'zp-hint' }, t('panel.brand.autoHint'))
          ),
          pref.brandLogo && pref.brandImage
            ? h('div', { className: 'zp-hint' }, t('panel.brand.replacedHint'))
            : null
        ),

        h(Section, { title: t('panel.type.title'), note: t('panel.type.note') },
          h(Row, { label: t('panel.type.sizeRow') },
            h(Pills, { label: t('panel.type.sizeAria'), opts: scales(), value: pref.fontScale,
              onChange: function (v) { set({ fontScale: v }); } }),
            h('span', { className: 'zp-hint' }, t('panel.type.pxHint', { px: scalePx })),
            pref.fontScale !== 100 && HOST_TEXT_STATS && HOST_TEXT_STATS.rules === 0
              ? h('span', { className: 'zp-hint is-warn' }, t('panel.type.scaleMiss'))
              : null
          ),
          h(Row, { label: t('panel.type.widthRow') },
            // 非受控输入：边打字边裁剪会把「8」立刻变成「640」，用户只会觉得输不进去。
            // 失焦或回车才提交，清空即恢复自适应。
            h('input', {
              type: 'number', className: 'zp-txt zp-num', min: 640, max: 1600, step: 10,
              defaultValue: pref.chatWidth ? String(pref.chatWidth) : '',
              placeholder: t('panel.type.widthPh'),
              'aria-label': t('panel.type.widthAria'),
              onBlur: function (ev) { commitChatWidth(ev.target.value); },
              onKeyDown: function (ev) { if (ev.key === 'Enter') { try { ev.currentTarget.blur(); } catch (e) { /* ignore */ } } },
            }),
            h('span', { className: 'zp-hint' }, t('panel.type.widthHint'))
          ),
          h(Row, { label: t('panel.type.fontRow') },
            // 受控下拉：只列包内真正 @font-face 注册过的族名。自由输入一旦写错，
            // 浏览器会静默回落到系统默认，用户只会觉得「这个功能没用」。
            h(Select, {
              label: t('panel.type.fontAria'),
              value: pref.uiFont || '',
              options: FONT_CHOICES,
              emptyLabel: t('panel.type.fontPh'),
              onChange: function (v) { set({ uiFont: v === '__empty__' ? '' : v }); },
            }),
            h('span', { className: 'zp-hint' }, t('panel.type.fontHint'))
          )
        ),

        h(Section, { title: t('panel.accent.title'), note: t('panel.accent.note') },
          h(Row, { label: t('panel.accent.row') },
            h('div', { className: 'zp-sws' },
              accents.map(function (c) {
                const on = String(pref.accent || '').toLowerCase() === c.toLowerCase();
                return h('button', {
                  key: c, type: 'button', className: 'zp-sw',
                  'data-on': on ? '1' : '0', 'aria-pressed': on,
                  'aria-label': t('panel.accent.swatchAria', { hex: c }), title: c,
                  style: { background: c },
                  onClick: function () { set({ accent: c }); },
                });
              }),
              h('input', {
                type: 'color', className: 'zp-color', value: accentNow,
                'aria-label': t('panel.accent.custom'), title: t('panel.accent.custom'),
                onChange: function (ev) { set({ accent: String(ev.target.value || '') }); },
              }),
              pref.accent
                ? h('button', {
                    type: 'button', className: 'zp-btn',
                    onClick: function () { set({ accent: '' }); },
                  }, t('panel.accent.reset'))
                : null
            )
          )
        ),

        h(Section, { title: t('panel.qn.title'), note: t('panel.qn.note') },
          h(Row, { label: t('panel.qn.row') },
            h(Pills, {
              label: t('panel.qn.aria'),
              value: pref.quicknav || 'three',
              opts: [['three', t('panel.qn.optThree')], ['all', t('panel.qn.optAll')], ['off', t('panel.qn.optOff')]],
              onChange: function (v) { set({ quicknav: v }); },
            })
          )
        ),

        h('div', { className: 'zp-foot' },
          h('button', {
            type: 'button', className: 'zp-btn',
            'data-tone': resetArmed ? 'danger' : 'normal',
            onClick: function () { if (resetArmed) { resetAll(); } else { setResetArmed(true); } },
          }, resetArmed ? t('panel.reset.armed') : t('panel.reset.label')),
          h('div', { className: 'zp-hint', 'aria-live': 'polite' },
            resetArmed
              ? t('panel.reset.hint')
              : t('panel.foot.build', { ver: PVERSION })
          )
        )
      );
    }

    return {
      inject: ['slots', 'theme'],
      apply(ctx) {
        report({ phase: 'apply-entered' });
        // 捕获宿主主题服务（明暗三态的唯一真源）。
        // 订阅必须走 subscribeHostChange()：按偏好值去重 + 只注册一次 + 异步合并，
        // 否则会被 overrideTokens 回灌的 theme/change 拖进死循环（见该函数注释）。
        try { hostThemeApi = (ctx && ctx.theme) || hostThemeApi; } catch (e) { /* ignore */ }
        try { themeRef = hostThemeApi; } catch (e) { /* ignore */ }
        subscribeHostChange(ctx);
        // 延迟探针：等消息渲染完成后再扫「亮底」元素（内联 code 白底）。
        // 它会对全 DOM 逐元素 getComputedStyle，生产里纯属开销，只在 debug 下挂。
        if (zrDebug()) setTimeout(function () {
          try {
            const luma = function (bg) {
              const m = String(bg).match(/[\d.]+/g);
              if (!m || m.length < 3) return null;
              return 0.2126 * Number(m[0]) + 0.7152 * Number(m[1]) + 0.0722 * Number(m[2]);
            };
            const hits = [];
            const all = document.querySelectorAll('*');
            for (let i = 0; i < all.length && hits.length < 15; i++) {
              const el = all[i];
              let cs5;
              try { cs5 = getComputedStyle(el); } catch (e) { continue; }
              const l = luma(cs5.backgroundColor);
              if (l === null || l < 210) continue;
              hits.push({
                tag: el.tagName,
                cls: String(el.className || '').slice(0, 60),
                bg: cs5.backgroundColor,
                color: cs5.color,
                text: String(el.textContent || '').slice(0, 18),
              });
            }
            report({ phase: 'late-probe', total: all.length, hits: hits });
          } catch (e) { report({ phase: 'late-probe-failed', message: String((e && e.message) || e) }); }
        }, 8000);
        let theme = null;
        try { theme = ctx.get('theme'); } catch (e) { report({ phase: 'apply-get-theme-threw', message: String((e && e.message) || e) }); }
        const themeOk = theme && typeof theme.overrideTokens === 'function';
        report({ phase: 'apply-theme-probe', hasTheme: Boolean(theme), overrideTokens: themeOk, ctxTheme: typeof ctx.theme });
        if (!themeOk) {
          try { console.warn('[zhuoer-theme] ctx.theme.overrideTokens 不可用，主题不生效'); } catch (e) { /* ignore */ }
          return;
        }
        // 拖拽边线高亮：不靠类名认宿主的实现。
        // 可拖拽的边线一定带 cursor:col-resize / ew-resize（通行约定，且 cursor 会继承），
        // 所以在捕获阶段盯 pointerover / pointerdown，命中就按它的实时矩形挂一根高亮条。
        // 比猜 CSS Modules 的 _divider_ / _tabLayoutDivider_ 稳，换 DSH 版本也不会白干。
        const setupResizeHint = function () {
          let el = null;
          let bar = null;
          let on = false;
          let raf = 0;
          const isDragger = function (node) {
            if (!node || node.nodeType !== 1) return false;
            try {
              const cs = window.getComputedStyle(node);
              if (cs.cursor !== 'col-resize' && cs.cursor !== 'ew-resize') return false;
              const r = node.getBoundingClientRect();
              // 只认窄条：宽的容器（整个侧栏）即使也带这个 cursor 也不该整块高亮
              return r.width <= 12;
            } catch (e) { return false; }
          };
          const place = function () {
            if (!el || !bar) return;
            try {
              const r = el.getBoundingClientRect();
              if (!r.height) return;
              // 坐标空间对账：条子挂在 body 下，跟着 body{zoom} 一起被缩放；而 getBoundingClientRect
              // 返回的已经是缩放后的视觉像素。不除掉 zoom，偏差会随 x 线性放大——右侧 1500px 处能差
              // 出上百像素，表现就是「亮条和边线不重合、还挡在更右边」。
              const z = (isFinite(ZR_SCALE) && ZR_SCALE > 0) ? ZR_SCALE : 1;
              bar.style.top = (r.top / z) + 'px';
              bar.style.height = (r.height / z) + 'px';
              bar.style.left = ((r.left + r.width / 2) / z - 1) + 'px';
            } catch (e) { /* ignore */ }
          };
          // 拖拽中侧栏会变宽，条子得跟着走
          const tick = function () {
            if (!on) return;
            place();
            raf = window.requestAnimationFrame(tick);
          };
          const clear = function () {
            if (raf) { try { window.cancelAnimationFrame(raf); } catch (e) { /* ignore */ } raf = 0; }
            if (bar) { try { bar.remove(); } catch (e) { /* ignore */ } bar = null; }
            el = null;
            on = false;
          };
          const attach = function (node) {
            if (node === el) return;
            clear();
            if (!(node instanceof Element) || node === document.body || node === document.documentElement) return;
            el = node;
            bar = document.createElement('div');
            bar.className = 'zp-rz-bar';
            document.body.appendChild(bar);
            place();
          };
          const onOver = function (ev) {
            if (on) return;
            const t = ev.target;
            if (isDragger(t)) attach(t);
            else if (el && !el.contains(t)) clear();
          };
          const onDown = function (ev) {
            const t = ev.target;
            if (!isDragger(t)) return;
            attach(t);
            on = true;
            if (bar) bar.setAttribute('data-on', '1');
            tick();
          };
          const onUp = function () {
            if (!on) return;
            on = false;
            if (bar) bar.removeAttribute('data-on');
            try { window.cancelAnimationFrame(raf); } catch (e) { /* ignore */ } raf = 0;
          };
          // 拖拽时每帧 place 一次仍会慢半拍：快速拖动能看到条子落在边线后面。
          // 再挂一个 pointermove，命中即立刻重算（place 只读 rect 写三个样式，开销可忽略）。
          const onMove = function () { if (on) place(); };
          document.addEventListener('pointerover', onOver, true);
          document.addEventListener('pointerdown', onDown, true);
          document.addEventListener('pointermove', onMove, true);
          window.addEventListener('pointerup', onUp, true);
          return function () {
            try { document.removeEventListener('pointerover', onOver, true); } catch (e) { /* ignore */ }
            try { document.removeEventListener('pointerdown', onDown, true); } catch (e) { /* ignore */ }
            try { window.removeEventListener('pointerup', onUp, true); } catch (e) { /* ignore */ }
            try { document.removeEventListener('pointermove', onMove, true); } catch (e) { /* ignore */ }
            clear();
          };
        };
