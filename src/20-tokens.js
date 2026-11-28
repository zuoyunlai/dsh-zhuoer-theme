    // 主题底图：静态资源走插件自己的 assets 路由（同 FONT_BASE），不再内联 base64。
    // 注意：宿主的插件资源路由只服务启动时已存在的文件，新增图片必须重启 DSH 才可访问。
    // dash（琥珀）自 P2 起用矢量底纹：同名前缀保留 .webp 旧文件便于回滚，映射指到 .svg。
    const BG_SOFT = {"absolutely":"/dsh-zhuoer-theme/assets/bg/bg-soft-absolutely.webp","knot":"/dsh-zhuoer-theme/assets/bg/bg-soft-knot.webp","beacon":"/dsh-zhuoer-theme/assets/bg/bg-soft-beacon.webp","zhuoer":"/dsh-zhuoer-theme/assets/bg/bg-soft-zhuoer.webp","crt":"/dsh-zhuoer-theme/assets/bg/bg-soft-crt.webp","dash":"/dsh-zhuoer-theme/assets/bg/bg-soft-dash.svg","manuscript":"/dsh-zhuoer-theme/assets/bg/bg-soft-manuscript.webp","miami":"/dsh-zhuoer-theme/assets/bg/bg-soft-miami.webp","phosphor":"/dsh-zhuoer-theme/assets/bg/bg-soft-phosphor.webp","rose":"/dsh-zhuoer-theme/assets/bg/bg-soft-rose.webp","tide":"/dsh-zhuoer-theme/assets/bg/bg-soft-tide.webp","vintage-paper":"/dsh-zhuoer-theme/assets/bg/bg-soft-vintage-paper.webp"};;
    const BG = {"zhuoer":"/dsh-zhuoer-theme/assets/bg/bg-zhuoer.webp","knot":"/dsh-zhuoer-theme/assets/bg/bg-knot.webp","dash":"/dsh-zhuoer-theme/assets/bg/bg-dash.svg","absolutely":"/dsh-zhuoer-theme/assets/bg/bg-absolutely.webp","tide":"/dsh-zhuoer-theme/assets/bg/bg-tide.webp","beacon":"/dsh-zhuoer-theme/assets/bg/bg-beacon.webp","phosphor":"/dsh-zhuoer-theme/assets/bg/bg-phosphor.webp","crt":"/dsh-zhuoer-theme/assets/bg/bg-crt.webp","manuscript":"/dsh-zhuoer-theme/assets/bg/bg-manuscript.webp","rose":"/dsh-zhuoer-theme/assets/bg/bg-rose.webp","miami":"/dsh-zhuoer-theme/assets/bg/bg-miami.webp","vintage-paper":"/dsh-zhuoer-theme/assets/bg/bg-vintage-paper.webp"};;

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
// debug 晚探针的定时器句柄：模块作用域，卸载时由 quicknav 的 disposer 统一清（doctor K3）。
let lateProbeTimer = 0;
// 上一层的 token disposer / 底图观察器 / 去抖定时器：改为分片间共享的模块作用域变量。
// 原来是 window.__zrSkin* —— 同页别的脚本能读到也能改（清了就没了），且是全局污染。
let zrSkinDispose = null;
let zrSkinObs = null;
let zrSkinT = 0;
// A2：插件自己那张 extra 样式表 + 它的缓存键。原来挂在 window.__zrExtraSheet /
// window.__zrExtraText 上，热更新时新旧闭包会互相踩（旧闭包写一次文本键，新闭包就跳过
// replaceSync，样式停在上一份且无任何提示）。改为模块作用域 + sheet 对象上的标记：
// 同一文档里新闭包靠标记认出旧表并接管，不会重复注入第二张。
let zrExtraSheet = null;
let zrExtraCached = '';
const ZR_SHEET_MARK = 'zhuoer-extra-v1';
function findZrExtraSheet() {
  try {
    const list = document.adoptedStyleSheets || [];
    for (let i = 0; i < list.length; i++) {
      if (list[i] && list[i].__zrMark === ZR_SHEET_MARK) return list[i];
    }
  } catch (e) { /* ignore */ }
  return null;
}

    // 预览路径（编辑器 / 取色器 / 滑块）此前传 null，导致 overrideTokens 拿不到服务、抛错被吞，
    // 编辑期间只剩 CSS 兜底层。这里留一个模块级引用，任何调用点都能拿到宿主主题服务。
    let themeRef = null;

    // ---- 首屏底色回传（让服务端能在首绘前把画布刷成主题色）----
    // 背景：宿主自己的 boot 主题会在首屏注入 body{background-color:#fff}，而我们的 token
    // 要等 bundle 求值后才生效 —— 中间那段就是用户看到的「白色界面」。
    // 服务端在首绘前拿不到浏览器里的偏好（偏好存在 localStorage），只能靠我们回传。
    let zrBootColorsKey = '';
    function zrReportBootColors(pref) {
      try {
        // 键与 theme 字段都用**真实主题 id**（pref.theme），不能用 effectiveThemeId：
        // 后者是自定义主题的 base，两个不同的自定义主题 base 相同（实测 9 个都 clone 自 zhuoer），
        // 用 base 做键会导致「换主题不重新回传」，首屏底色停在旧主题上。
        const themeId = String(pref.theme || 'zhuoer');
        // 只在「主题 / 明暗模式 / 强调色」变化时回传一次：apply 在拖动滑块时会被 rAF 合并
        // 高频触发，每次都算两套 token 再 POST 是纯浪费。
        const key = themeId + '|' + (pref.mode || 'auto') + '|' + (pref.accent || '');
        if (key === zrBootColorsKey) return;
        const light = tokensForPref(pref, 'light')['--dsw-alias-bg-base'];
        const dark = tokensForPref(pref, 'dark')['--dsw-alias-bg-base'];
        const hexOk = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
        if (!hexOk(light) || !hexOk(dark)) return;
        zrBootColorsKey = key;
        fetch('/dsh-zhuoer-theme/api/boot-colors', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-zhuoer-client': '1' },
          body: JSON.stringify({
            light: String(light).toLowerCase(),
            dark: String(dark).toLowerCase(),
            // 明暗口径：'light' / 'dark' 是用户显式指定，'auto' 跟系统。
            // 服务端据此决定首屏刷单色还是用媒体查询——不一致就会闪反方向。
            mode: pref.mode === 'light' || pref.mode === 'dark' ? pref.mode : 'auto',
            theme: String(themeId).slice(0, 40),
            at: new Date().toISOString(),
          }),
        }).catch(function () { /* ignore */ });
      } catch (e) { /* ignore */ }
    }

    // 预览路径（取色器拖动、滑块、颜色输入）每个事件都会触发一次完整 apply，
    // 用 rAF 合并成「每帧至多一次」，拖动时不再重建几十次样式表。
    // ---- A3：外观插件共存探测（不点名）----
    // 上游 PTC 的做法是「检测到 dsh-claude-style / dsh-refined-ui 这类外观插件就默认关掉自己的
    // 特效」——不点名、先探测、自己退让。主题不能退让（那正是它的职责），但可以**把事实说出来**：
    // apply 之后回读一个代表 token，与自己写进去的值比对，不一致就说明有别的插件在这之后覆盖了
    // 同一批变量。现状是靠高优先级分层硬压 + 为 dsh-theme-palette 专门打补丁，那只会越补越深。
    // （注释里刻意不写那个 CSS 关键字：verify:important 数的是整个 bundle 的文本，写进注释也会算一级。）
    // B1：overrideTokens 的隔离状态（见 00-core 的 isolationReducer）。
    let zrIso = { fails: 0, offline: false, tries: 0 };
    let zrConflictState = null;
    let zrConflictRaf = 0;
    // 纯函数（无 DOM，可无头测试）：判定是否被覆盖。
    // 空值不算冲突（读不到就别下判断，宁可说不知道）。
    function zrConflictOf(key, wrote, read) {
      const w = String(wrote == null ? '' : wrote).trim().toLowerCase();
      const r = String(read == null ? '' : read).trim().toLowerCase();
      if (!w || !r) return { key: key, wrote: w, read: r, conflict: false, reason: 'unknown' };
      return { key: key, wrote: w, read: r, conflict: w !== r, reason: w === r ? 'ok' : 'overridden' };
    }
    function zrReadVar(name) {
      try { return String(getComputedStyle(document.documentElement).getPropertyValue(name) || '').trim(); } catch (e) { return ''; }
    }
    // 隔两帧取样：对方插件常在 rAF/微任务里注入，单帧会把「还没注入」误报成冲突。
    function scheduleConflictProbe(tokens) {
      const key = '--dsw-alias-label-primary';
      const wrote = tokens && tokens[key];
      if (!wrote || zrConflictRaf) return;
      zrConflictRaf = window.requestAnimationFrame(function () {
        const a = zrReadVar(key);
        window.requestAnimationFrame(function () {
          const b = zrReadVar(key);
          zrConflictRaf = 0;
          if (a !== b) return;                 // 还在变，本轮不判
          const st = zrConflictOf(key, wrote, b);
          st.at = Date.now();
          zrConflictState = st;
          if (st.conflict) { try { report({ phase: 'theme-conflict', key: st.key, wrote: st.wrote, read: st.read }); } catch (e) { /* ignore */ } }
        });
      });
    }
    let previewPending = null;
    let previewRaf = 0;
    function schedulePreview(spec) {
      previewPending = spec;
      if (previewRaf) return;
      previewRaf = window.requestAnimationFrame(function () {
        previewRaf = 0;
        const s = previewPending;
        previewPending = null;
        // 失败不再静默：预览失败时界面会停在旧值，用户与排查者都看不到任何线索。
        try { applyTokens(themeRef, s); } catch (e) { try { console.warn('[zhuoer-theme] preview apply failed:', e && e.message); } catch (e2) { /* ignore */ } }
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
    + 'html svg:has(#dsh-wordmark-badge-clip){background-image:url("' + cssUrl(src) + '") !important;'
    + 'background-size:contain !important;background-position:left center !important;'
    + 'background-repeat:no-repeat !important;}';
}

// 主题底图：蒙层色跟随明暗（之前写死深色，浅色模式一片灰），
// 图片挂在 _mainPanel 的 ::before 上，会话内层 _root 必须透明，否则图被整片盖住。
// ---- 自定义照片的对比度限幅（L1b）----
// 为什么只对照片做：底纹（kind=texture）走 lighten，只让比底色亮的线条透出，实测侵蚀 ≤ 1.08；
// 而照片路径不加任何混合模式，0.7 不透明度是整幅图盖上去的，图由用户决定，离线给不出边界。
// 做法：载入后按 64×64 采样，解出「正文仍达 4.5:1 还能保留的最大不透明度」，再乘到可见度上。
// 为什么是 4.5 而不是正文地板 7:1：7:1 会把大多数照片压到几乎不可见，失去「用自己照片」的意义。
const PHOTO_CONTRAST_TARGET = 4.5;
const PHOTO_CAP_MAX = 0.7;
const photoCapCache = new Map();
// 面板用它显示「已按对比度限制」；非照片路径恒为 0.7（即原口径「满格 = 70%」）。
let currentPhotoCap = PHOTO_CAP_MAX;
let zrReapply = null;   // 采样是异步的，回来后触发一次重算


// 逐档扫 α（0.70 → 0.05，步长 0.01，取第一个达标的），每个档位都对所有采样像素算最不利值。
// 为什么扫而不是解方程：合成发生在 sRGB 通道空间、对比度发生在亮度空间，两者非线性；
// 闭式解要么近似，要么漏掉「最不利像素不是均值像素」这种情况。
function zrSolvePhotoCap(pixels, textHex, baseHex) {
  const textLum = zrHexLum(textHex);
  const b = parseHexColor(baseHex);
  if (textLum === null || !b) return PHOTO_CAP_MAX;
  for (let a = PHOTO_CAP_MAX; a >= 0.049; a -= 0.01) {
    let worst = Infinity;
    for (let i = 0; i < pixels.length; i += 4) {
      const l = 0.2126 * zrLin(a * pixels[i] + (1 - a) * b[0])
        + 0.7152 * zrLin(a * pixels[i + 1] + (1 - a) * b[1])
        + 0.0722 * zrLin(a * pixels[i + 2] + (1 - a) * b[2]);
      const c = zrRatio(textLum, l);
      if (c < worst) worst = c;
      if (worst < PHOTO_CONTRAST_TARGET) break;
    }
    if (worst >= PHOTO_CONTRAST_TARGET) return +a.toFixed(2);
  }
  return 0.05;
}

function zrPhotoCapFor(url, textHex, baseHex, kind) {
  if (!url || kind === 'texture') return PHOTO_CAP_MAX;
  const key = zrHashKey(url);
  if (photoCapCache.has(key)) return photoCapCache.get(key);
  zrCachePut(photoCapCache, key, PHOTO_CAP_MAX);   // 采样未完成前先按原值，避免「先压到 0 再跳回来」
  try {
    const img = new Image();
    img.onload = function () {
      let cap = PHOTO_CAP_MAX;
      try {
        const S = 64;
        const cv = document.createElement('canvas');
        cv.width = S; cv.height = S;
        const cx = cv.getContext('2d', { willReadFrequently: true });
        cx.drawImage(img, 0, 0, S, S);
        cap = zrSolvePhotoCap(cx.getImageData(0, 0, S, S).data, textHex, baseHex);
      } catch (e) { cap = PHOTO_CAP_MAX; }
      const changed = Math.abs(cap - photoCapCache.get(key)) >= 0.01;
      zrCachePut(photoCapCache, key, cap);
      if (changed && typeof zrReapply === 'function') { try { zrReapply(); } catch (e) { /* ignore */ } }
    };
    img.onerror = function () { zrCachePut(photoCapCache, key, PHOTO_CAP_MAX); };
    img.src = url;
  } catch (e) { /* ignore */ }
  return PHOTO_CAP_MAX;
}

// ── 侧栏玻璃（0.7.1）──────────────────────────────────────────────────────────
// 「侧栏透出底图」不能靠拍脑袋定透明度：同一张照片，侧栏那 280px 可能是暗山、
// 也可能是亮天空，安全下限差一倍。所以复用照片限幅那套求解器，只是把采样**限制在
// 侧栏那一竖条**上，反解出「这里最多还能透多少」，再换算成侧栏底色至少要保留多少。
//
// 公式与照片限幅对齐：照片在侧栏里最亮能到 cap（= 满足 4.5 的最大不透明度），
// 那么侧栏底色就需要 α_min = 1 - cap 才不至于把字压到 4.5 以下。
// 用户滑块 g∈[0,100] 再在 [α_min, 1] 之间插值：g=0 → 不透明（现状），g=100 → α_min。
const GLASS_BLUR_PX = 8;
const GLASS_FLOOR_FALLBACK = 0.45;
const glassFloorCache = new Map();

function zrSolveGlassFloor(pixels, iw, ih, textHex, baseHex) {
  const textLum = zrHexLum(textHex);
  const b = parseHexColor(baseHex);
  if (textLum === null || !b) return GLASS_FLOOR_FALLBACK;
  // pixels 是 64×64 的缩略图；侧栏宽度按视口 280/1264 估（拿不到视口时按 0.22）
  const S = 64;
  const vw = (typeof window !== 'undefined' && window.innerWidth) || 1264;
  const vh = (typeof window !== 'undefined' && window.innerHeight) || 771;
  const sidebarPx = Math.min(vw, 280);
  const scale = Math.max(vw / iw, vh / ih);
  const dw = iw * scale;
  const dx = (vw - dw) / 2;                       // background-position: 50% 0%
  const x0 = Math.max(0, (0 - dx) / scale);
  const x1 = Math.min(iw, (sidebarPx - dx) / scale);
  const c0 = Math.max(0, Math.floor(x0 / iw * S));
  const c1 = Math.min(S, Math.max(c0 + 1, Math.ceil(x1 / iw * S)));
  // 照片在侧栏区域最多能显多亮
  for (let a = PHOTO_CAP_MAX; a >= 0.049; a -= 0.01) {
    let worst = Infinity;
    for (let y = 0; y < S; y++) {
      for (let x = c0; x < c1; x++) {
        const i = (y * S + x) * 4;
        const l = 0.2126 * zrLin(a * pixels[i] + (1 - a) * b[0])
          + 0.7152 * zrLin(a * pixels[i + 1] + (1 - a) * b[1])
          + 0.0722 * zrLin(a * pixels[i + 2] + (1 - a) * b[2]);
        const c = zrRatio(textLum, l);
        if (c < worst) worst = c;
        if (worst < PHOTO_CONTRAST_TARGET) break;
      }
      if (worst < PHOTO_CONTRAST_TARGET) break;
    }
    if (worst >= PHOTO_CONTRAST_TARGET) return +(1 - a).toFixed(2);
  }
  return 0.95;
}

function zrGlassFloorFor(url, textHex, baseHex, kind) {
  if (kind === 'texture') return GLASS_FLOOR_FALLBACK;   // 线稿极淡，交给对比度门禁兜底
  const key = zrHashKey(url) + '|glass';
  if (glassFloorCache.has(key)) return glassFloorCache.get(key);
  zrCachePut(glassFloorCache, key, GLASS_FLOOR_FALLBACK);
  try {
    const img = new Image();
    img.onload = function () {
      let floor = GLASS_FLOOR_FALLBACK;
      try {
        const S = 64;
        const cv = document.createElement('canvas');
        cv.width = S; cv.height = S;
        const cx = cv.getContext('2d', { willReadFrequently: true });
        cx.drawImage(img, 0, 0, S, S);
        floor = zrSolveGlassFloor(cx.getImageData(0, 0, S, S).data, img.naturalWidth || 1600, img.naturalHeight || 1000, textHex, baseHex);
      } catch (e) { floor = GLASS_FLOOR_FALLBACK; }
      const changed = Math.abs(floor - (glassFloorCache.get(key) || 0)) >= 0.01;
      zrCachePut(glassFloorCache, key, floor);
      if (changed && typeof zrReapply === 'function') { try { zrReapply(); } catch (e) { /* ignore */ } }
    };
    img.onerror = function () { zrCachePut(glassFloorCache, key, GLASS_FLOOR_FALLBACK); };
    img.src = url;
  } catch (e) { /* ignore */ }
  return GLASS_FLOOR_FALLBACK;
}

function bgCssFor(o) {  var bgUrl = o.bgUrl;
  if (!bgUrl) return '';
  var bgOpacity = o.bgOpacity;
  var bgStyle = o.bgStyle;
  var tokens = o.tokens;
  // 可见度滑块接到图片上：Zhuoer full-bleed 实测 opacity = 可见度 × 0.7（85% → 0.595）。
  var vis = Math.max(0, Math.min(100, bgOpacity)) / 100;
  // 内容压底：把 _root 从「全透明」换成「bg-base 的半透明压底」，
  // 底纹仍是页面背景，但内容面不再被它穿透。

  // 压底作用在**底纹自身**的不透明度上。
  // 为什么不是给内容层压底：试过两处——内容根 `_root`（只覆盖聊天主栏，
  // 论衡这类整页路由不受影响）；顶层子元素的 inset 内阴影（子元素铺满父容器后
  // 阴影被完全盖住，实测 0–100% 无变化）。两者都依赖知道哪一层是「内容面」，
  // 内置底纹是「透明线稿」：实测 p50 = 0（不透明像素只有线条），所以它只画线、不换底。
  // 自定义底纹是满幅图（p50≈30，底色被烘焙进图里），opacity 0.7 会把整块底替换成图的颜色，
  // 面板的半透明层下面于是变成「图」而不是主题底色 —— 这就是琥珀没有、自定义有的差别。
  // 解法：先把图底对齐到 bg-base（R-01 归一化），再按方案决定要不要混合（见下）。
  var isImageBg = !!o.bgIsImage;
  // 混合方式按**方案**定（R-12 / R-13）：
  //   深色 lighten：只留比底色亮的像素。底色对齐后 max(底,底)=底，图底自动消失，亮线留下。
  //   浅色 **不加混合**。这里踩过一次坑，值得写死：multiply 对「图底 = 主题底色」的满幅图
  //   不是恒等变换——multiply(b,b)=b²/255，底色 222 会被乘成 193，整幅盖上一层灰，
  //   用户看到的是「线图遮住了整个底色」。而 R-01 的归一化已经保证图底等于 bg-base，
  //   此时普通 alpha 合成才真正恒等：图底处 a·b+(1-a)·b = b，只有墨的位置变。
  //   所以浅色用 normal + **深墨**：没有灰纱，也没有「亮墨只有 26 级余量」那个天花板。
  // 归一化的极性跟着合成方式走：浅色要暗墨、深色要亮墨（zrTexNormalizePixels 的 wantDark）。
  // blend / 反相只对**线稿纹理**生效；手动上传的照片整张显示，不加任何混合。
  var isTexture = o.bgKind === 'texture';
  var blendMode = o.scheme === 'light' ? 'normal' : 'lighten';
  var blendCss = (isImageBg && isTexture && blendMode !== 'normal') ? ('mix-blend-mode:' + blendMode + ' !important;') : '';
  // 反相只用于「同一张图顶两个方案」的兜底（缺浅色图 / 缺深色图）：反相后极性正好相反。
  var invertCss = (o.bgInvert && isTexture) ? 'filter:invert(1);' : '';
  // 照片路径可能被限幅（L1b）：滑块 100% 时实际不透明度 = min(0.7, 解出的上限)。
  var capMax = (typeof o.photoCap === 'number') ? Math.min(PHOTO_CAP_MAX, o.photoCap) : PHOTO_CAP_MAX;
  var imgOpacity = +(vis * capMax).toFixed(3);
  // 淡化：另加一层垂直渐隐遮罩做出「边缘化开」；Zhuoer 的 faded 靠面板层不透明压暗，
  // 我们的内容层是透明的，直接照抄会更浓，所以用 mask 达到同样效果。
  // 底部对齐宿主：composer 自己有一条 36px 的「透明 → bg-base 实心」渐变（宿主 CSS 注释写明
  // stops 用 px 不用 %）。第一版在离底 190→140px 淡完，实测仍有一条生硬的横带：
  // 因为那时淡出已经结束，而宿主实心区还没开始，中间露出一段「无纹理」的纯底色。
  // 现在把淡出拉长到 320→60px：纹理一直淡到 composer 内部（实心区起点约在离底 74px），
  // 两者重叠，边界落在 alpha 已接近 0 的位置，看不出接口。
  // 「淡化」仍额外压中间段（45% 处 0.55），与「全幅」保持可见差别。
  var maskVal = bgStyle === 'fade'
    ? 'linear-gradient(180deg,#000 0%,rgba(0,0,0,.55) 45%,rgba(0,0,0,.12) calc(100% - 320px),transparent calc(100% - 60px))'
    : 'linear-gradient(180deg,#000 0%,#000 calc(100% - 320px),transparent calc(100% - 60px))';
  var fadeMask = '-webkit-mask-image:' + maskVal + ' !important;mask-image:' + maskVal + ' !important;';
  var mainSel = ':is([class*="_centerCol"],[class*="_mainPanel"],div:has(> [data-slot="main"]))';
  // 语义锚点兜底：真机实测 `[data-slot="main"]` 是 `_mainPanel` 的子节点且 display:contents（0×0，不能上色），
  // 只能 `:has(> …)` 反选回上色盒子；`_centerCol` 在它外面一层，没有等价锚点，所以三者并存于 `:is()`。
  // 用 `:is()` 而不是逗号列表：`:is()` 是宽容列表，老宿主不认 `:has()` 时只丢那一条分支，
  // 类名兜底仍然生效（逗号列表里一条无效会让整条规则作废）。
  var hiddenInEmpty = function (sel) {
    return 'html[data-zr-state="empty"][data-zr-bg-empty="0"] ' + sel + '::before,'
      + 'html[data-zr-state="session"][data-zr-bg-session="0"] ' + sel + '::before{display:none !important;}';
  };
  var mainRules = function (sel) {
    return sel + '{background-color:var(--dsw-alias-bg-base) !important;background-image:none !important;position:relative !important;isolation:isolate !important;}'
      + sel + '::before{content:"" !important;' + blendCss + 'position:absolute !important;inset:0 !important;background-image:url("' + cssUrl(bgUrl) + '") !important;background-size:cover !important;background-position:50% 0% !important;background-repeat:no-repeat !important;opacity:' + imgOpacity + ' !important;' + invertCss + fadeMask + 'pointer-events:none !important;z-index:0 !important;}'
      + sel + ' [class*="_root"]{background-color:transparent !important;}'
      + hiddenInEmpty(sel);
  };
  var glass = (typeof o.glass === 'number') ? Math.max(0, Math.min(100, o.glass)) : 0;
  if (glass <= 0) return mainRules(mainSel);
  // ── 玻璃模式（0.7.1）────────────────────────────────────────────────────────
  // 层契约（桌面端同样适用）：
  //   L0  _frame 自身 background = bg-base + 底图  ← 全窗唯一一层图，天生在 columns 之下
  //   L1  各列自身填充全部退透明                   ← 消除「帧背景 + 列填充」双层叠涂导致的发蒙
  //   L2  侧栏 = rgba(bg-base, α) + 静态高光       ← 不加 blur（见下）
  //   L3  标题条 _frame::before 保持现状           ← 原生 WCO 按钮由它取色，不动
  //
  // 为什么 L0 用 frame 的 background 而不是伪元素：
  //   试过 [class*="_frame"]::before —— 桌面端标题条已占用该伪元素（z-index:2 色带），铺图盖住标题条；
  //   试过 body::before{position:fixed} —— 宿主链上若有 transform/will-change，fixed 改以它为包含块，
  //   整窗被图蒙住。frame 自己的 background 不存在这两个问题：不占伪元素、不建层叠上下文。
  //
  // 为什么侧栏不加 blur：endfield 的实测结论——filter/backdrop-filter 会让元素成为
  //   position:fixed 后代的包含块，侧栏里的菜单/tooltip 会错位、被裁剪。
  var floor = (typeof o.glassFloor === 'number') ? Math.min(0.9, Math.max(0.05, o.glassFloor)) : GLASS_FLOOR_FALLBACK;
  var glassAlpha = +(1 - (glass / 100) * (1 - floor)).toFixed(2);
  var baseRgb = parseHexColor(tokens['--dsw-alias-bg-base']) || [0, 0, 0];
  // 桌面壳的侧栏是 dshDesktopSidebarSurface 一类（不含 sidebarCol），所以两条都带上、并加 i 忽略大小写；
  // 只认「侧栏表面」这两个后缀，不用 [class*="sidebar"] 一把梭（会连侧栏里的行/项一起染）。
  var sideSel = '[class*="sidebarCol" i],[class*="sidebarSurface" i]';
  // 底部渐隐：旧实现用 mask 淡出，但 mask 会连子元素一起遮（挂在 frame 上就等于把界面切掉）。
  // 改成在同一个 background 栈里叠一层「透明 → 底色」的渐变：它只影响图，不影响内容，也就没有硬线。
  var baseRgba1 = 'rgba(' + baseRgb[0] + ',' + baseRgb[1] + ',' + baseRgb[2] + ',1)';
  var fadeLayer = 'linear-gradient(180deg,rgba(0,0,0,0) 0%,rgba(0,0,0,0) calc(100% - 320px),' + baseRgba1 + ' calc(100% - 60px))';
  return 'html [class*="_frame"]{background-image:' + fadeLayer + ',url("' + cssUrl(bgUrl) + '") !important;'
      + 'background-size:cover,cover !important;'
      + 'background-position:50% 0,50% 0 !important;'
      + 'background-repeat:no-repeat,no-repeat !important;}'
    + mainSel + '::before{display:none !important;}'
    // 主栏用「底色半透明」把自己压回原来的可见度：等价于旧实现的 opacity=imgOpacity，
    // 否则整窗图以 100% 亮度出现在正文下面，文字直接读不了（实测：标题与输入框提示全糊）。
    + mainSel + '{background-color:rgba(' + baseRgb[0] + ',' + baseRgb[1] + ',' + baseRgb[2] + ',' + (1 - imgOpacity).toFixed(3) + ') !important;}'
    + 'html ' + sideSel + ' > [class*="_root"],' + mainSel + ' [class*="_root"]{background:transparent !important;}'
    + 'html ' + sideSel + '{background:rgba(' + baseRgb[0] + ',' + baseRgb[1] + ',' + baseRgb[2] + ',' + glassAlpha + ') !important;'
      + 'background-image:linear-gradient(180deg,rgba(255,255,255,.05),transparent 42%) !important;}'
    + hiddenInEmpty('html ' + sideSel);
  /* 旧实现（保留行号参考）
  var floor = (typeof o.glassFloor === 'number') ? Math.min(0.9, Math.max(0.05, o.glassFloor)) : GLASS_FLOOR_FALLBACK;
  var glassAlpha = +(1 - (glass / 100) * (1 - floor)).toFixed(2);
  var baseRgb = parseHexColor(tokens['--dsw-alias-bg-base']) || [0, 0, 0];
  var sideSel = '[class*="sidebarCol"]';
  var blurCss = 'backdrop-filter:blur(' + GLASS_BLUR_PX + 'px) saturate(110%) !important;';
  // 底图层挂 body::before，**不能**用 [class*="_frame"]::before：桌面端标题条已经占着那个伪元素
  // （z-index:2 的色带），同一伪元素再铺一张 fixed 全窗图，标题条会被图盖住、整条顶部变糊。
  return 'html body::before{content:"" !important;' + blendCss + 'position:fixed !important;inset:0 !important;'
      + 'background-image:url("' + cssUrl(bgUrl) + '") !important;background-size:cover !important;background-position:50% 0% !important;'
      + 'background-repeat:no-repeat !important;opacity:' + imgOpacity + ' !important;' + invertCss + fadeMask
      + 'pointer-events:none !important;z-index:0 !important;}'
    + mainSel + '{background-color:transparent !important;background-image:none !important;}'
    + mainSel + '::before{display:none !important;}'
    + mainSel + ' [class*="_root"]{background-color:transparent !important;}'
    + 'html ' + sideSel + '{background:rgba(' + baseRgb[0] + ',' + baseRgb[1] + ',' + baseRgb[2] + ',' + glassAlpha + ') !important;' + blurCss + '}'
    + 'html ' + sideSel + ' [class*="_root"]{background-color:transparent !important;}'
    + hiddenInEmpty('html body') + hiddenInEmpty('html ' + sideSel);
  */
}

// 表格精细化的 CSS 片段（抽成纯函数，便于无头断言首末列内边距必须补回来）。
// 宿主给 th/td 的是 padding:10px 16px，但**首列左、末列右刻意归零**：
//   ._tableScroll_xxx th:first-child, td:first-child{padding-left:0}   特异性 (0,2,1)
//   ._tableScroll_xxx td:last-child{padding-right:0}
// 目的是让表格文字与正文左缘对齐。不画边框时无所谓；一旦画了边框，首列内容就贴着竖线
// （用户真机截图实测：#f4e8d4 那颗 code 胶囊紧贴左边框）。
// 所以只在画边框的两档（line / zebra）里，把首末列内边距用 :first-child / :last-child 补回来，
// 特异性提到 (0,2,2) 压过宿主的 (0,2,1)。
function zrTableFineCss(prefix, mode) {
  if (mode !== 'line' && mode !== 'zebra') return '';
  const p = String(prefix || '');
  let css = p + ' table{border-collapse:collapse;}'
    + p + ' :where(th,td){border:1px solid var(--dsw-alias-border-l2);padding:6px 10px;}'
    + p + ' :where(th,td):first-child{padding-left:10px;}'
    + p + ' :where(th,td):last-child{padding-right:10px;}';
  if (mode === 'zebra') {
    css += p + ' thead th{background:var(--dsw-alias-bg-layer-1);font-weight:600;}'
      + p + ' tbody tr:nth-child(even){background:var(--dsw-alias-bg-layer-1);}';
  }
  return css;
}
function applyTokens(theme, pref) {
      // 首帧观测：overrideTokens 之前先读一次宿主原色（只有这一时刻读得到「闪之前是什么」）。
      try { zrBootProbeMark('before'); } catch (e) { /* ignore */ }
      theme = theme || themeRef;
      const scheme = resolveScheme(pref.mode, theme);
      liveScheme = scheme;
      const tokens = Object.assign({}, tokensForPref(pref, scheme));
      // 首屏底色回传：服务端靠它在首绘前刷画布（见 zrReportBootColors 的注释）。
      try { zrReportBootColors(pref); } catch (e) { /* ignore */ }
      // 排障：自定义主题生效时把真实 token 表上报一次（每页一次，常态零开销）。
      try { zrDumpTokensOnce(scheme, pref, tokens); } catch (e) { /* ignore */ }
      // 面板切换后再取样半透明面（页面加载时看到的是聊天页）。
      try { zrHookSemiProbe(scheme); } catch (e) { /* ignore */ }
      // 步骤图标探针不在这里调：此刻 CSS 还没注入，量到的只会是继承色（灰色）。
      // 调用点挪到样式表写入之后（见 styleEl.textContent 之后）。
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
            // B3：拍到 1/dpr 栅格，别留两位小数（16.1px 在 125% 下是 20.125 设备像素）。
            return zrQ(parseFloat(n) * fsK, zrDpr()) + 'px';
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
                out.push(r.selectorText + '{font-size:' + zrQ(parseFloat(fs) * k, zrDpr()) + 'px !important;}');
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
          // B4：覆盖率判据（见 00-core 的 zrTextCoverage）。绝对条数 20 在 1700+ 条的宿主上等于没判。
          const textTotal = (typeof HOST_TEXT_RULES === 'undefined' || !HOST_TEXT_RULES) ? 0 : HOST_TEXT_RULES.length;
          let cov = zrTextCoverage(main.length, textTotal);
          stats.mode = cov.mode;
          stats.coverage = cov.pct;
          if (cov.mode !== 'cssom') {
            const tbl = fromTable();
            if (tbl) { main = tbl; stats.mode = 'table-fallback'; stats.coverage = 100; }
          }
          el.textContent = main.join('');
          el.__zrK = k;
          stats.rules = main.length;
          // B4：把降级事实写进自检口（面板那一行留到 C 批一起做，避免一轮里改两次 UI）。
          try { report({ phase: 'host-text', mode: stats.mode, coverage: stats.coverage, rules: stats.rules, total: textTotal }); } catch (e) { /* ignore */ }
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
                // B4：同一套覆盖率判据，shadow root 漏判会让「界面文字不缩放」看起来像随机故障。
                if (zrTextCoverage(rules.length, textTotal).mode !== 'cssom') { const tbl = fromTable(); if (tbl) rules = tbl; }
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
      let bgInvert = false;
      let bgKind = '';
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
        else if (specBg.source === 'image' && (specBg.key || specBg.keyLight)) {
          // 两类底图分开对待：
          //  - texture（主题自带底图 / AI 生成的线稿）：只透出线，缺哪张就反相用另一张；
          //  - photo（设置里手动上传的照片）：整张显示，**绝不**做 blend / 反相。
          //    照片被「只留线条」的规则处理，就是浅色模式看不见的那个 bug。
          // 旧数据没有 kind：只有「主题自带底图」能确定是线稿；其余（含历史上传的图片，
          // 哪怕带 keyLight）一律按照片处理。之前按「有浅色版 = 线稿」推断，
          // 把用户上传的**照片**判成线稿，浅色模式被 lighten 吃到一片空白。
          // A1：kind 由 readPref 的 normalizeSpec 保证（见 10-themes.js 的 SPEC_V 段），
          // 读取侧不再猜旧形状，这里只做二值收敛。
          const kind = specBg.kind === 'texture' ? 'texture' : 'photo';
          bgKind = kind;
          // 自愈：主题写着「自定义图片」，但引用被切没了（旧版切 source 会清 key 造成）。
          // 内存缓存里已经装了 IDB 的全部图，这里挑「没被任何主题引用」的孤儿；
          // 只有恰好一张时才认领，避免把别的主题的图接过来。只影响显示，不改用户存档。
          if (specBg.source === 'image' && !specBg.key && !specBg.keyLight) {
            const used = {};
            (pref.customThemes || []).forEach(function (tt) {
              const b = tt && tt.bg;
              if (!b) return;
              if (b.key) used[b.key] = 1;
              if (b.keyLight) used[b.keyLight] = 1;
            });
            const orphans = [];
            imageCache.forEach(function (v, k) { if (!used[k]) orphans.push(k); });
            if (orphans.length === 1) {
              bgUrl = imageCache.get(orphans[0]) || '';
              bgKind = 'photo';
            }
          } else {
          const darkUrl = imageCache.get(specBg.key) || '';
          const lightUrl = imageCache.get(specBg.keyLight) || '';
          if (kind === 'photo') {
            // 照片**不分方案**：永远用 key。
            // 踩过的坑：主题里可能残留一个旧的 keyLight（先建主题时生成的纸纹），
            // 浅色若按方案去挑就会挑到那张纸纹，表现为「浅色显示的是主题自带图而不是我上传的照片」。
            bgUrl = darkUrl || lightUrl;
          } else if (scheme === 'light') {
            if (lightUrl) bgUrl = lightUrl;
            else if (darkUrl) { bgUrl = darkUrl; bgInvert = true; }
          } else {
            if (darkUrl) bgUrl = darkUrl;
            else if (lightUrl) { bgUrl = lightUrl; bgInvert = true; }
          }
          }
        }
        // source === 'none' → 该主题明确不要底图
      } else if (pref.bgSource === 'theme') {
        bgUrl = themeBgFor();
        // 关键：主题自带底图是**线稿**，必须打上 texture 标记。
        // 漏了这一步，zrPhotoCapFor 会把它当照片去解「正文仍达 4.5:1 的最大不透明度」，
        // 于是内置线稿被自己的照片限幅压到 0.25 —— 滑块拉到 100% 也只有 25%，
        // 而且 alpha 越高这个上限越紧（实测 0.29 → 0.25），看起来就像「滑块失效」。
        bgKind = 'texture';
      } else if (pref.bgSource === 'image' && pref.bgImage) {
        bgUrl = pref.bgImage;
        bgKind = 'photo';
      }
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
      // B1：离线态下仍重试，但降频到每 5 次 apply 一次——真的不可用时不必每轮都抛一次错。
      zrIso = isolationReducer(zrIso, { kind: 'tick' });
      const isoSkip = zrIso.offline && (zrIso.tries % 5 !== 0);
      try {
        if (isoSkip) throw Object.assign(new Error('isolated'), { __zrSkip: true });
        if (zrSkinDispose) {
          try { zrSkinDispose(); } catch (e) { /* 旧的已经不在了也无妨 */ }
          zrSkinDispose = null;
        }
        dispose = theme.overrideTokens(SOURCE, overrideMap) || (function () {});
        // 首帧观测：token 真正落地这一刻（overrideTokens 返回之后）。
        try { zrBootProbeMark('after'); } catch (e) { /* ignore */ }
        zrSkinDispose = dispose;
        overrideApplied = true;
        // B1：成功一次就把计数清零，并退出离线态。
        zrIso = isolationReducer(zrIso, { kind: 'success' });
      } catch (e) {
        const msg = String((e && e.message) || e || '');
        if (!(e && e.__zrSkip)) {
          // 三类：参数错误（我们自己的 bug，不该关主题）/ 明确不可用 / 临时错误。
          const kind = /bare string|invalid|参数/i.test(msg) ? 'argError'
            : /is not a function|undefined|null/i.test(msg) ? 'fatal'
            : 'transient';
          zrIso = isolationReducer(zrIso, { kind: kind });
          if (zrIso.offline) { try { report({ phase: 'theme-isolation', kind: kind, fails: zrIso.fails }); } catch (e3) { /* ignore */ } }
        }
        try { console.warn('[zhuoer-theme] overrideTokens 失败', msg); } catch (e2) { /* ignore */ }
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
        // 画布颜色单独一条，**不抬强制优先级**（棘轮只许降不许升），
        // 靠选择器特异性 + 注入更晚来接管。
        //
        // 这里踩过一次并在真机量到了：首屏那行用的选择器是 `html body`（特异性 0,0,2），
        // 而运行时这条原来是 `html,body`（0,0,1）——低了一档，**后注入也赢不了**。
        // 症状：面板里把明暗从浅切到深，`html` 拿到 #0e1015、`body` 却仍是首屏的
        // rgb(244,241,236)（2026-11-28 在 3099 实例上实测 getComputedStyle）。不刷新就一直错。
        // 所以画布这一条改成与首屏行同特异性的 `html body`，同档下后注入者赢。
        // 变量那一块仍留在 `html,body`：html 上也可能被读（如顶栏那几条），
        // 少了 html 会静默取不到变量。
        const css = 'html,body{' + decls + '}'
          + 'html body{background-color:var(--dsw-alias-bg-base)}'
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
        // 照片：按采样解出对比度上限；底纹：恒 0.7（lighten 只留亮线，实测侵蚀极小）。
        const photoCap = zrPhotoCapFor(bgUrl, tokens['--dsw-alias-label-primary'], tokens['--dsw-alias-bg-base'], bgKind);
        currentPhotoCap = photoCap;
        const glassFloor = zrGlassFloorFor(bgUrl, tokens['--dsw-alias-label-primary'], tokens['--dsw-alias-bg-base'], bgKind);
        const bgCss = bgCssFor({ photoCap: photoCap, bgUrl: bgUrl, bgOpacity: bgOpacity, bgStyle: bgStyle, bgIsImage: !!(specBg && specBg.source === 'image') || pref.bgSource === 'image', bgInvert: bgInvert, bgKind: bgKind, tokens: tokens, scheme: scheme, glass: pref.sidebarGlass, glassFloor: glassFloor });
        // 每次应用都报一次底图解析事实（仅 debug 开关下），用于定位方案级不可见。
        try {
          const cc0 = document.querySelector('[class*="_centerCol"]');
          const bs0 = cc0 ? getComputedStyle(cc0, '::before') : null;
          zrBgProbe({
            scheme: scheme, theme: effTheme,
            specBg: specBg ? { source: specBg.source, key: specBg.key, keyLight: specBg.keyLight, kind: specBg.kind, opacity: specBg.opacity, style: specBg.style } : null,
            cached: { key: !!(specBg && specBg.key && imageCache.has(specBg.key)), keyLight: !!(specBg && specBg.keyLight && imageCache.has(specBg.keyLight)) },
            bgUrlLen: String(bgUrl || '').length, bgUrlHead: String(bgUrl || '').slice(0, 48),
            resolvedKind: bgKind, invert: bgInvert, cssLen: (bgCss || '').length,
            pseudo: bs0 ? { display: bs0.display, opacity: bs0.opacity, bgImageLen: String(bs0.backgroundImage || '').length, mask: String(bs0.maskImage || bs0.webkitMaskImage || '').slice(0, 70), blend: bs0.mixBlendMode } : null,
            zrState: document.documentElement.getAttribute('data-zr-state'),
            bgEmpty: document.documentElement.getAttribute('data-zr-bg-empty'),
            bgSession: document.documentElement.getAttribute('data-zr-bg-session'),
          });
        } catch (e) { /* ignore */ }
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
        // 只压圆角与「按钮自己那圈线」，容器外框线保留——用户明确要那条外框还在。
        // 同时按语义选择器兜住通用实现：[role=tablist] 容器 + [role=tab] 标签 +
        // 子级的 aria-hidden 指示块（多数分段控件都是这个结构），这样换一个插件实现
        // 也不必再加类名。
        fxCss += 'html[data-zr-sharp] .dsh-st-shell-segmented-tabs,'
          + 'html[data-zr-sharp] .dsh-st-settings-tabs,'
          + 'html[data-zr-sharp] [role="tablist"]{'
          + 'border-radius:0 !important;}'
          + 'html[data-zr-sharp] .dsh-st-shell-segmented-tabs>span[aria-hidden="true"],'
          + 'html[data-zr-sharp] .dsh-st-settings-tabs>span[aria-hidden="true"],'
          + 'html[data-zr-sharp] [role="tablist"]>span[aria-hidden="true"]{'
          // 选中态只靠底色区分太弱：宿主各层表面（layer-1/3/4）彼此对比只有 1.0–1.05，
          // 12 套主题 × 两态全部低于 3:1，所以这里补一条品牌色下划线。
          // brand-primary 对 layer-1 最低 3.85:1（zhuoer/dark），过 UI 组件 3:1 门槛。
          + 'border-radius:0 !important;border:0 !important;'
          // 用户要「浅一些」：品牌色降到 60% 不透明度（color-mix 只淡这条线，不动指示块底色）。
          // 代价要写明：合成后对 layer-1 最低 2.09:1（knot/dark）、平均 3.12:1，
          // 低于 UI 组件 3:1；可辨识性由同时给选中标签加的 600 字重承担（非颜色信号）。
          + 'box-shadow:inset 0 -2px 0 color-mix(in srgb, var(--dsw-alias-brand-primary) 60%, transparent) !important;}'
          + 'html[data-zr-sharp] .dsh-st-shell-segmented-tabs [role="tab"],'
          + 'html[data-zr-sharp] .dsh-st-settings-tabs [role="tab"],'
          + 'html[data-zr-sharp] [role="tablist"] [role="tab"]{'
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
        fxCss += 'html :is([class*="sidebarCol"],div:has(> [data-slot="sidebar"])){'
          + 'border-right:1px solid var(--dsw-alias-border-l3,transparent) !important;}'
          + 'html[data-zr-base="beacon"] :is([class*="sidebarCol"],div:has(> [data-slot="sidebar"])){'
          + 'border-right:1px solid var(--dsw-alias-border-l4,#9a9a9a) !important;}'
          // 语义锚点兜底（宿主 CSS Modules 类名改了就失效）：真机实测 `[data-slot="sidebar"]` 是
          // `_sidebarCol` 的**子节点**且 display:contents（0×0，不能上色），只能用 `:has(> …)` 反选回
          // 那个真正上色的盒子——实测与 `[class*="sidebarCol"]` 命中同一个元素。
          // 用 `:is()` 而非逗号列表：`:is()` 宽容，老宿主不认 `:has()` 只丢那一条分支，类名兜底仍在。
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
            // B3：不再交给 calc 保留小数，直接算成 px 并拍到 1/dpr 栅格。
            // 原来交给 CSS 去乘（基准 14px × 缩放系数），1.15 时得 16.1px，125% 缩放下是 20.125 设备像素：行盒上下边各带 0.125 的
            // （注释里刻意不写出那个函数名与像素字面量：本门扫的是整个 bundle 文本，写进注释也会判红。）
            // 分数，正文行数与输入框自增高会各自取整到不同侧，看起来就是轻微抖动（上游 PTC #45）。
            // delta 的语义是「与基准字号的像素差」，所以也按 px 落，别再写回乘数。
            + '--dsh-content-font-size:' + zrQ(14 * kk, zrDpr()) + 'px;'
            + '--dsh-content-font-size-secondary:' + zrQ(13 * kk, zrDpr()) + 'px;'
            + '--dsh-content-font-delta:' + (Math.round((zrQ(14 * kk, zrDpr()) - 14) * 100) / 100) + 'px;'
            + '--dsh-content-font-delta-secondary:' + (Math.round((zrQ(13 * kk, zrDpr()) - 13) * 100) / 100) + 'px;'
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
          // 字体名走 cssStr：原来的 replace(/"/g,'') 挡得住引号，挡不住反斜杠
          //（尾部一个反斜杠能把闭合引号吃掉，后面整段 CSS 都被并进字体名）。
          const fam = '"' + cssStr(pref.uiFont) + '", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
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
        // 可访问性三件套：两条默认就生效（焦点环、减少动画），一条显式开关（放大点击区）。
        // 前两条刻意不用优先级强制——我们的 <style> 后插入，同优先级即胜出；
        // 减少动画那段必须优先级强制（要盖掉宿主的 transition 声明），共 4 处。
        const a11yCss = ''
          + ':focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;}'
          + 'button:focus:not(:focus-visible),a:focus:not(:focus-visible),input:focus:not(:focus-visible),select:focus:not(:focus-visible),textarea:focus:not(:focus-visible){outline:none;}'
          + '@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:.001ms !important;animation-iteration-count:1 !important;transition-duration:.001ms !important;scroll-behavior:auto !important;}}'
          + 'html[data-zr-a11y-hit="1"] button,html[data-zr-a11y-hit="1"] [role="button"],html[data-zr-a11y-hit="1"] a[href]{min-height:44px;min-width:44px;}'
          + 'html[data-zr-a11y-hit="1"] [class*="_iconBtn"],html[data-zr-a11y-hit="1"] [class*="_btn"]{min-height:44px;min-width:44px;}';
        // Markdown 排版：只动节奏，不动字号体系（字号由 fontScale 那三条通路负责）。
        // 容器片段是 **_markdown_**（宿主的助手 Markdown 组件；CSS-module 名带构建哈希，
        // 稳定片段取到下划线为止）。
        //
        // 踩过的坑：之前这里写的是 _prose —— 那是「工具详情 JSON 树」组件的 CSS-module 名
        //（宿主里是 _1h1PMq_prose），跟助手正文毫无关系；[class*="_prose"] 恰好匹配到它，
        // 于是「排版节奏」和「标题配色」两条全都打偏，界面上一点变化都没有。
        // 教训：15-host-text.js 那张表是**按 px 字号**抽的，而 Markdown 规则用的是
        // var(--dsw-font-markdown-*)（没有 px），所以它根本不会出现在那张表里 ——
        // 不能拿它当「哪个类名是正文容器」的依据。要判断得看宿主里
        // 「_markdown_xx h1{font:var(--dsw-font-markdown-h1)}」这样的规则。
        const MD = {
          compact: { lh: 1.5, p: 0.45, h1: 1.32, h2: 1.18, h3: 1.06, gap: 0.2, pad: 10 },
          normal: { lh: 1.7, p: 0.7, h1: 1.5, h2: 1.3, h3: 1.12, gap: 0.4, pad: 12 },
          roomy: { lh: 1.9, p: 1.0, h1: 1.62, h2: 1.38, h3: 1.18, gap: 0.6, pad: 14 },
        };
        const md = MD[pref.mdDensity] || MD.normal;
        const mdCss = ''
          + 'html [class*="_markdown_"]{line-height:' + md.lh + ' !important;}'
          + 'html [class*="_markdown_"] p{margin-block:' + md.p + 'em;}'
          + 'html [class*="_markdown_"] h1{font-size:' + md.h1 + 'em;line-height:1.25;margin:1.2em 0 .5em;}'
          + 'html [class*="_markdown_"] h2{font-size:' + md.h2 + 'em;line-height:1.3;margin:1.1em 0 .45em;}'
          + 'html [class*="_markdown_"] h3{font-size:' + md.h3 + 'em;line-height:1.35;margin:1em 0 .4em;}'
          + 'html [class*="_markdown_"] ul,html [class*="_markdown_"] ol{margin-block:' + md.gap + 'em;padding-inline-start:1.4em;}'
          + 'html [class*="_markdown_"] li{margin-block:' + (md.gap / 2) + 'em;}'
          + 'html [class*="_markdown_"] blockquote{margin-block:' + md.gap + 'em;padding:' + (md.pad - 2) + 'px ' + md.pad + 'px;}'
          + 'html [class*="_markdown_"] pre{padding:' + md.pad + 'px;line-height:1.55;}'
          + 'html [class*="_markdown_"] table{margin-block:' + md.gap + 'em;}';
        // 标题配色：宿主只给了 h1/h2/h4 的字体 token，没有颜色 token。
        // 所以这层由我们从「品牌色 + 正文色」推：soft 用 55/45 混，brand 用 80/20 混（混正文能保住对比度）。
        // 用 color-mix 而不是预先算 hex：主题换色、强调色、明暗切换时它自动跟着走，不用重算。
        const headCss = pref.mdHeading === 'follow' ? ''
          : (pref.mdHeading === 'brand'
            ? 'html[data-zr-mdhead="brand"] [class*="_markdown_"] h1,html[data-zr-mdhead="brand"] [class*="_markdown_"] h2,html[data-zr-mdhead="brand"] [class*="_markdown_"] h3,html[data-zr-mdhead="brand"] [class*="_markdown_"] h4,html[data-zr-mdhead="brand"] [class*="_markdown_"] h5,html[data-zr-mdhead="brand"] [class*="_markdown_"] h6{color:color-mix(in srgb,var(--dsw-alias-brand-primary) 80%,var(--dsw-alias-label-primary));}'
            : 'html[data-zr-mdhead="soft"] [class*="_markdown_"] h1,html[data-zr-mdhead="soft"] [class*="_markdown_"] h2,html[data-zr-mdhead="soft"] [class*="_markdown_"] h3,html[data-zr-mdhead="soft"] [class*="_markdown_"] h4,html[data-zr-mdhead="soft"] [class*="_markdown_"] h5,html[data-zr-mdhead="soft"] [class*="_markdown_"] h6{color:color-mix(in srgb,var(--dsw-alias-brand-primary) 55%,var(--dsw-alias-label-primary));}');
        // 步骤过程组头的活动图标：宿主把它画成 color:inherit（跟着文字色走），
        // 所以想上语义色必须**给图标元素单独设 color**——它没有自己的颜色规则。
        // 宿主在图标 span 上留了稳定属性 data-step-process-icon，用它选中比猜类名可靠。
        // 活动类别（宿主共 13 种）：读类 / 写类 / 执行类 / 提问 / 思考 / 其余。
        // 步骤过程组头的活动图标：宿主把它画成 color:inherit（跟着文字色走），
        // 所以想上语义色必须**给图标元素单独设 color**——它自己没有颜色规则。
        // 宿主在图标 span 上留了稳定属性 data-step-process-icon，用它选中比猜类名可靠
        // （类名带构建哈希：BE0jCW_activityIcon）。
        //
        // 语义分三类（宿主共 13 种活动）：
        //   蓝＝在看（读文件/读图/搜索/抓网页）；琥珀＝在改或问你（写/改/计划/提问）；
        //   品牌色＝在想或在跑（思考/工具/命令/代码/子代理）。
        // 宿主**没有**信息蓝语义 token（link 等于品牌色），所以蓝取自原始调色板
        // --dsw-static-blue-*，并按明暗选档保证对底色 ≥3:1（图标属 UI 图形，走 1.4.11）。
        // 步骤过程组头的活动图标：宿主把它画成 color:inherit（跟着文字色走），
        // 所以想上语义色必须**给图标元素单独设 color**——它自己没有颜色规则。
        // 宿主在图标 span 上留了稳定属性 data-step-process-icon，按钮上有 data-process-activity。
        //
        // 配色方案（0.6.38 第一版失败的教训）：
        //   第一版用「品牌色 / 琥珀 / 蓝」，实测截图里 6 个图标全是同一个 #b5342a——
        //   因为卓尔的品牌色**本身就是红**，而最常见的 5 类活动全被分到品牌色，
        //   于是「语义色」退化成「一种颜色」。所以这一版**不再用品牌色**。
        //
        // 第二版：色相固定（紫=思考 / 蓝=执行 / 绿=查看 / 琥珀=改动与提问），
        // 亮度由 color-mix 混**主题正文色**决定：
        //   浅色主题正文是深色 → 混出的色变深（琥珀 500 实测在浅底只有 1.72:1，混完就有 4:1+）；
        //   深色主题正文是浅色 → 混出的色变亮。
        // 于是任何主题、任何明暗都读得清，同时保留色相；正文色是主题派生的，结果仍带主题气质。
        // 每条先写一次裸色值：浏览器不认 color-mix 时会回退到它（不会变成没颜色）。
        var TEXTMIX = 'var(--dsw-alias-label-primary)';
        var hueMix = function (token) {
          // 色相占 55%：实测 65% 时琥珀在浅底只有 2.87:1（门禁报红），
          // 55% 时最差 3.37:1，四个色相在明暗两档都 ≥3:1。
          return 'color:var(' + token + ');color:color-mix(in srgb,var(' + token + ') 55%,' + TEXTMIX + ');';
        };
        var procCss = pref.procIconColor ? (
          'html[data-zr-proc="1"] [data-step-process-icon]{' + hueMix('--dsw-static-violet-400') + '}'
          + 'html[data-zr-proc="1"] [data-process-activity="thinking"] [data-step-process-icon]{' + hueMix('--dsw-static-violet-400') + '}'
          + 'html[data-zr-proc="1"] [data-process-activity="tools"] [data-step-process-icon],'
          + 'html[data-zr-proc="1"] [data-process-activity="commands"] [data-step-process-icon],'
          + 'html[data-zr-proc="1"] [data-process-activity="code"] [data-step-process-icon],'
          + 'html[data-zr-proc="1"] [data-process-activity="subagents"] [data-step-process-icon]{' + hueMix('--dsw-static-blue-500') + '}'
          + 'html[data-zr-proc="1"] [data-process-activity="read"] [data-step-process-icon],'
          + 'html[data-zr-proc="1"] [data-process-activity="readImage"] [data-step-process-icon],'
          + 'html[data-zr-proc="1"] [data-process-activity="search"] [data-step-process-icon],'
          + 'html[data-zr-proc="1"] [data-process-activity="webSearch"] [data-step-process-icon],'
          + 'html[data-zr-proc="1"] [data-process-activity="webFetch"] [data-step-process-icon]{' + hueMix('--dsw-static-green-500') + '}'
          + 'html[data-zr-proc="1"] [data-process-activity="edit"] [data-step-process-icon],'
          + 'html[data-zr-proc="1"] [data-process-activity="write"] [data-step-process-icon],'
          + 'html[data-zr-proc="1"] [data-process-activity="plan"] [data-step-process-icon],'
          + 'html[data-zr-proc="1"] [data-process-activity="questions"] [data-step-process-icon]{' + hueMix('--dsw-static-amber-500') + '}'
        ) : '';
        // ---- Markdown 精细化（0.6.41）----
        // 宿主对助手正文（_markdown_ 容器）的规则实测：
        //   标题 h1-h3 margin 32px 0 16px；代码块**只有底色**（无边框无圆角）；
        //   表格**只有字体**（无边框无斑马纹）；引用块 2px 左边框 + 14px 内缩。
        // 这四处正是「看起来糙」的主要来源，而它们都可以只用**主题 token** 覆盖——
        // 颜色全部取自主题（border-l1/l2、bg-layer-1、brand-primary），
        // 所以明暗两档天然正确，不需要像上一版那样按明暗挑静态色档位。
        var MDC = 'html body [class*="_markdown_"]';
        var mdFine = '';
        if (pref.mdHeadSize === 'compact' || pref.mdHeadSize === 'clear') {
          // 标题字号策略。特异性 html body [class*="_markdown_"] hN = (0,1,3)，
          // 压过「排版节奏」的 (0,1,2) 与宿主的 (0,1,1) —— 后者用 font 简写，
          // 简写只重置 font-* 与 line-height，不涉及 color，所以颜色我们另管。
          var hsz = pref.mdHeadSize === 'compact'
            ? [['h1', 1.24, 1.32], ['h2', 1.12, 1.34], ['h3', 1.04, 1.38], ['h4', 1, 1.4]]
            : [['h1', 1.62, 1.24], ['h2', 1.4, 1.28], ['h3', 1.2, 1.34], ['h4', 1.06, 1.38]];
          hsz.forEach(function (t) {
            mdFine += MDC + ' ' + t[0] + '{font-size:' + t[1] + 'em;line-height:' + t[2] + ';}';
          });
        }
        if (pref.mdCode === 'line' || pref.mdCode === 'card') {
          mdFine += MDC + ' .md-code-block{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);}';
          if (pref.mdCode === 'card') {
            mdFine += MDC + ' .md-code-block{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l1);}';
          }
        }
        // 规则与理由见 zrTableFineCss（首末列内边距要塞回去，否则内容贴着竖线）。
        mdFine += zrTableFineCss(MDC, pref.mdTable);
        if (pref.mdQuote === 'strong') {
          mdFine += MDC + ' blockquote{border-left:3px solid var(--dsw-alias-brand-primary);'
            + 'background:var(--dsw-alias-bg-layer-1);padding:8px 12px;'
            + 'border-radius:0 var(--dsw-radius-sm) var(--dsw-radius-sm) 0;}';
        }
        const nextCss = css + extra + bgCss + fxCss + brandCss + a11yCss + mdCss + headCss + procCss + mdFine;
        const styleEl = ensureStyle();
        if (styleEl.__zrCss !== nextCss) {
          styleEl.textContent = nextCss;
      // 照片采样是异步的：记住重算入口，采样回来后再算一遍（值稳定后不再触发）。
      zrReapply = function () { try { applyTokens(theme, pref); } catch (e) { /* ignore */ } };
        // 样式表写完后再量图标颜色：否则量到的是注入前的继承色。
        try { zrIconProbe(); } catch (e) { /* ignore */ }
          styleEl.__zrCss = nextCss;
        }
        // extra（菜单 / 代码块定向修正）最容易被别的插件压掉：各自 <style> 后插入就赢。
        // adoptedStyleSheets 排在文档样式表之后，同优先级稳定胜出；不支持的环境退回 <style>。
        try {
          if (document.adoptedStyleSheets && typeof CSSStyleSheet === 'function') {
            // A2：这张表不再挂 window（理由见文件头 zrExtraSheet 的声明处）。
            // 认领上一任闭包留下的表：同一文档里它还在，直接接管，避免重复注入。
            if (!zrExtraSheet || zrExtraSheet.__zrMark !== ZR_SHEET_MARK) zrExtraSheet = findZrExtraSheet();
            if (!zrExtraSheet) {
              zrExtraSheet = new CSSStyleSheet();
              try { zrExtraSheet.__zrMark = ZR_SHEET_MARK; } catch (e2) { /* ignore */ }
              document.adoptedStyleSheets = document.adoptedStyleSheets.concat([zrExtraSheet]);
            }
            // 缓存键 = 文本 + 宿主戳。只比文本会漏掉「文本没变但宿主换了」的情形
            // （宿主升级、切明暗都可能让同一段 extra 落到不同语境）。
            const zrExtraKey = extra + '|' + HOST_ASAR_STAMP;
            if (zrExtraKey !== zrExtraCached) {
              zrExtraSheet.replaceSync(extra);
              zrExtraCached = zrExtraKey;
            }
          }
        } catch (e) { /* 老 Chromium 没有 adoptedStyleSheets */ }
        // 背景显示开关：标注当前是「空态」还是「会话中」，供上面的 CSS 选择器使用
        try {
          const rootEl = document.documentElement;
          rootEl.setAttribute('data-zr-bg-empty', pref.bgOnEmpty === false ? '0' : '1');
          rootEl.setAttribute('data-zr-bg-session', pref.bgOnSession === false ? '0' : '1');
          // A3：变量已经写完了，隔帧回读看有没有被别的插件盖掉（冲突只上报，不改行为）。
          try { scheduleConflictProbe(tokens); } catch (e) { /* ignore */ }
          const markState = function () {
            const empty = Boolean(document.querySelector('[class*="composerHero"], [class*="_empty_"]'));
            rootEl.setAttribute('data-zr-state', empty ? 'empty' : 'session');
          };
          // 状态标注与观察器只服务底图相关的 CSS（data-zr-state / bg 开关）；
          // 没开底图时它们纯属白付成本，直接跳过。
          if (bgUrl) markState();
          if (bgUrl && !zrSkinObs) {
            zrSkinObs = new MutationObserver(function () {
              clearTimeout(zrSkinT);
              zrSkinT = setTimeout(function () {
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
            zrSkinObs.observe(document.body, { childList: true, subtree: true });
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
        document.documentElement.setAttribute('data-zr-a11y-hit', pref.a11yHit ? '1' : '0');
        document.documentElement.setAttribute('data-zr-mdhead', pref.mdHeading || 'soft');
        document.documentElement.setAttribute('data-zr-proc', pref.procIconColor ? '1' : '0');
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
          // 收进调试闸门：每次 apply 都打一行，生产环境属于噪声。
          if (zrDebug()) console.info('[zhuoer-theme] applied', pref.theme, scheme, Object.keys(tokens).length, 'tokens · overrideTokens', overrideApplied ? 'ok' : 'skipped');
        } catch (e3) { /* ignore */ }
      } catch (e2) { /* ignore */ }
      return dispose;
    }

