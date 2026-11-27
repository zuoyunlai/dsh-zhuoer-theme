    // ---- 对话内的主题卡片 ----
    // 用户在 DSH 对话框说「给我一套赛博朋克配色」→ 模型调 zhuoer_theme_generate（宿主侧）
    // → 工具结果经 presentationMeta 投影进 tool/result 的 data.meta →
    // 这里认领该事件，在对话流里渲染色卡；用户点「应用」才真正写盘并生效。
    //
    // 三个硬约束（宿主契约）：
    //   1. 卡片必须挂在会话事件上：uiConversation.events.register(def) + conversation.chat.node 插槽，
    //      插槽 key 必须等于 def.kind。
    //   2. tool/result 的 data.meta 就是 presentationMeta 的返回值，别无其它通道。
    //   3. 组件直接调本插件的模块级函数即可（按钮就是普通 onClick），不需要额外回调面。

    const THEME_META_KIND = 'dsh-zhuoer-theme';
    const THEME_CARD_KIND = 'dsh-zhuoer-theme-card';

    function zrRec(v) {
      return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
    }

    // 把工具结果的 meta 收成一份可渲染的 spec。
    // 只认 ANCHOR_GROUPS 里真实存在的锚点与 6 位 hex —— 与面板侧 extractAiTheme 同规则。
    function zrSpecFromMeta(meta) {
      const m = zrRec(meta);
      if (!m || m.kind !== THEME_META_KIND) return null;
      return zrSpecFromObj(m);
    }

    // 归一化一份规格对象（meta 与 PTC 文本两条路共用，避免两处规则漂移）。
    function zrSpecFromObj(o) {
      const m = zrRec(o);
      if (!m) return null;
      const src = zrRec(m.light) || {};
      const light = {};
      ANCHOR_GROUPS.forEach(function (g) {
        const v = src[g.anchor];
        if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim())) light[g.anchor] = v.trim().toLowerCase();
      });
      if (Object.keys(light).length < 4) return null;
      // 少量覆盖：锚点之外的 alias/specific 键（气泡、卡片面、代码块底、遮罩），最多 4 个。
      const zrExtras = function (src2, anchors) {
        const out = {};
        Object.keys(src2 || {}).forEach(function (k) {
          if (Object.keys(out).length >= 4) return;
          if (anchors[k]) return;
          if (!/^--dsw-(alias|specific)-[a-z0-9-]+$/.test(k)) return;
          const v = src2[k];
          if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim())) out[k] = v.trim().toLowerCase();
        });
        return out;
      };
      Object.assign(light, zrExtras(src, light));
      // 显式深色锚点：≥4 个才算给了，否则交给 autoDark 反推。
      const dsrc = zrRec(m.dark) || {};
      const dark = {};
      ANCHOR_GROUPS.forEach(function (g) {
        const v = dsrc[g.anchor];
        if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim())) dark[g.anchor] = v.trim().toLowerCase();
      });
      const darkOk = Object.keys(dark).length >= 4;
      if (darkOk) Object.assign(dark, zrExtras(dsrc, dark));
      const font = zrRec(m.font) || {};
      return {
        label: typeof m.label === 'string' && m.label.trim() ? m.label.trim().slice(0, 24) : 'AI',
        light: light,
        dark: darkOk ? dark : {},
        font: {
          body: typeof font.body === 'string' ? font.body : '',
          chat: typeof font.chat === 'string' ? font.chat : '',
        },
        radiusScale: typeof m.radiusScale === 'number' ? Math.max(0, Math.min(3, m.radiusScale)) : 1,
        // R-10：底纹强度档位（0/1/2）。宿主只透传数值，压深规则在客户端（上面 zrPressLightBase）。
        textureWeight: (typeof m.textureWeight === 'number' && isFinite(m.textureWeight))
          ? Math.min(2, Math.max(0, Math.round(m.textureWeight))) : 0,
        // R-08：宿主只传预设 id（它不持有配方），圆角与字体的真源在客户端 STYLE_PRESETS。
        preset: (function () {
          const p = typeof m.preset === 'string' ? m.preset : '';
          if (!p) return '';
          return STYLE_PRESETS.some(function (x) { return x.id === p; }) ? p : '';
        })(),
        textureDecision: m.textureDecision === 'want' ? 'want' : 'no',
        refName: m.ref && typeof m.ref.name === 'string' ? m.ref.name : '',
        texture: (function () {
          const tb = zrRec(m.texture);
          if (!tb || typeof tb.name !== 'string') return null;
          return { name: tb.name, mime: typeof tb.mime === 'string' ? tb.mime : '', bytes: typeof tb.bytes === 'number' ? tb.bytes : 0 };
        })(),
        textureLight: (function () {
          const tb = zrRec(m.textureLight);
          if (!tb || typeof tb.name !== 'string') return null;
          return { name: tb.name, mime: typeof tb.mime === 'string' ? tb.mime : '', bytes: typeof tb.bytes === 'number' ? tb.bytes : 0 };
        })(),
      };
    }


    // ---- 卡片的纯逻辑（抽到组件外，便于无头验证）----
    // R-06：明暗两套都能改。原来 setAnchor 只写 next.light，深色排是只读 hex，
    // 而面板一直支持「明暗分开编辑」——同一个功能两个入口行为不一致。
    function zrSetAnchor(spec, scheme, anchor, hex) {
      const next = JSON.parse(JSON.stringify(spec || {}));
      const key = scheme === 'dark' ? 'dark' : 'light';
      if (!next[key] || typeof next[key] !== 'object') next[key] = {};
      next[key][anchor] = String(hex || '').toLowerCase();
      // 来源标记不动：它记的是「这套色的出身」，手改单个锚点不该把它抹掉；
      // 编辑态本身已经在标签上写着「修改中」，用户看得见自己在改。
      return next;
    }

    // 「用取色 / 用模型配色」：两套对调，随时可逆（不重新取色，避免同一张图跑两次结果漂移）。
    // 返回 null 表示这份 spec 没有第二套（没走过取色），调用方据此不渲染按钮。
    function zrSwapSource(spec) {
      // 空对象不算「有第二套」：换过去会导致整套色板被清空。
      if (!spec || !spec.altLight || !Object.keys(spec.altLight).length) return null;
      const next = JSON.parse(JSON.stringify(spec));
      const keepLight = next.light, keepDark = next.dark;
      next.light = next.altLight;
      next.dark = next.altDark || {};
      next.altLight = keepLight;
      next.altDark = keepDark;
      next.src = next.src === 'sampled' ? 'model' : 'sampled';
      return next;
    }

    // PTC（run_code）子调用的 tool/ptc-dispatch 事件既没有 turn 也没有 presentationMeta，
    // 规格随渲染文本下发（见 theme-tool.js 的 SPEC_MARKER）。
    const SPEC_MARKER = 'DSH_THEME_SPEC:';

    function zrSpecFromPtcDispatch(event) {
      if (!event || event.type !== 'tool/ptc-dispatch') return null;
      const data = zrRec(event.data);
      if (!data || data.isError === true) return null;
      if (data.name !== 'zhuoer_theme_generate') return null;
      const content = Array.isArray(data.content) ? data.content : [];
      for (let i = 0; i < content.length; i++) {
        const block = zrRec(content[i]);
        if (!block || block.type !== 'text' || typeof block.text !== 'string') continue;
        const at = block.text.indexOf(SPEC_MARKER);
        if (at === -1) continue;
        const rest = block.text.slice(at + SPEC_MARKER.length);
        const nl = rest.indexOf('\n');
        const jsonText = (nl === -1 ? rest : rest.slice(0, nl)).trim();
        let obj = null;
        try { obj = JSON.parse(jsonText); } catch (e) { obj = null; }
        const spec = obj ? zrSpecFromObj(obj) : null;
        if (spec) return spec;
      }
      return null;
    }

    // 两条路都认：直连 tool/result 读 meta；PTC 子调用读渲染文本。
    function zrSpecFromEvent(event) {
      if (!event || (event.type !== 'tool/result' && event.type !== 'tool/ptc-dispatch')) return null;
      const data = zrRec(event.data);
      if (!data) return null;
      const fromMeta = zrSpecFromMeta(data.meta);
      if (fromMeta) return fromMeta;
      return zrSpecFromPtcDispatch(event);
    }

    // 底纹：从同源端点取回字节 → dataURL。客户端只关心 dataURL，落库与缓存由应用阶段处理。
    function zrFetchTexture(rec) {
      const tb = zrRec(rec);
      const name = tb && typeof tb.name === 'string' ? tb.name : '';
      if (!/^[a-f0-9]{16}\.(jpg|png|webp)$/.test(name)) return Promise.resolve('');
      return fetch('/dsh-zhuoer-theme/api/texture?name=' + encodeURIComponent(name), { headers: { 'x-zhuoer-client': '1' } })
        .then(function (r) { return r && r.ok ? r.blob() : null; })
        .then(function (blob) {
          if (!blob) return '';
          return new Promise(function (resolve) {
            try {
              const fr = new FileReader();
              fr.onload = function () { resolve(typeof fr.result === 'string' ? fr.result : ''); };
              fr.onerror = function () { resolve(''); };
              fr.readAsDataURL(blob);
            } catch (e) { resolve(''); }
          });
        })
        .catch(function () { return ''; });
    }

    // R-10：浅色底色「为底纹让路」的档位。
    // 为什么需要：底纹合成只保留比底色亮的像素，浅底明度 93~96% 时余量只有 20 级上下，
    // 归一化会把线差压掉一半（实测 k=0.687、可见差 14.3）；压到明度 87.8% 压缩就解除（可见差 22.5，+57%）。
    // 模型与取色都不会主动这么做——它们的目标是「亮且可读」，所以只能由参数显式指定。
    // 只压不减：底色已经够深就原样返回（重复应用幂等，不会越压越黑）。
    function zrPressLightBase(anchors, weight) {
      // 档位 → 目标 HSL 明度。0 = 不动；1 = 87.8%（实测压缩解除、可见差 +57%）；2 = 82.4%（底纹自身到上限）。
      const TIER_L = [1, 0.878, 0.824];
      const out = Object.assign({}, anchors || {});
      const w = Number(weight);
      if (!isFinite(w) || w <= 0) return out;
      const tier = Math.min(2, Math.round(w));
      const key = '--dsw-alias-bg-base';
      const hex = out[key];
      if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) return out;
      const hsl = hexHsl(hex);
      if (!hsl) return out;
      const target = TIER_L[tier];
      if (!(hsl[2] > target)) return out;
      out[key] = hslHex(hsl[0], hsl[1], target);
      return out;
    }
    // 预设 id → 圆角与字体的缺省值。客户端持有配方，宿主只传 id（见 R-08）。
    function zrPresetDefaults(id) {
      if (!id) return null;
      const p = STYLE_PRESETS.filter(function (x) { return x.id === id; })[0];
      if (!p) return null;
      const fam = function (v) { return v === '__mono__' ? 'JetBrains Mono' : (v || ''); };
      return {
        radiusScale: typeof p.radius === 'number' ? p.radius : 1,
        font: { body: fam(p.body), chat: fam(p.chat) },
      };
    }

    // 这套 spec 会克隆哪个 base 主题。zrApplyThemeSpec 与 zrResolveBg 共用这一处判据，
    // 否则会出现「底纹按 A 主题的底色对齐、主题却克隆了 B」的静默漂移。
    function zrBaseThemeId() {
      const pref = readPref();
      const cur = customSpec(pref);
      return THEME_IDS.indexOf(pref.theme) !== -1 ? pref.theme : (cur ? cur.base : 'zhuoer');
    }

    // 深色、浅色各取一张：与内置主题一致（BG / BG_SOFT），一张深图铺在浅底上会发闷。
    // R-01：取回后先按该方案的 bg-base 归一化（对齐底色 + 极性翻转）。
    // 不做这一步，「浅底 + 暗线」的图在浅色模式里会被 lighten 合成整片吃掉，且没有任何报错。
    function zrResolveBg(spec) {
      const baseId = zrBaseThemeId();
      return Promise.all([zrFetchTexture(spec && spec.texture), zrFetchTexture(spec && spec.textureLight)])
        .then(function (r) {
          return Promise.all([
            zrTexNormalizeUrl(r[0], zrTexTargetBg(spec, 'dark', baseId)),
            zrTexNormalizeUrl(r[1], zrTexTargetBg(spec, 'light', baseId)),
          ]);
        })
        .then(function (n) { return { dark: n[0] || '', light: n[1] || '' }; });
    }


    // R-03：把「最终生效」的这份色板回传插件数据目录（POST → last-theme.json）。
    // 为什么必须由客户端回传：按图取色与底纹归一化都发生在客户端，服务端先写的
    // SPEC_MARKER 只是模型原色；这一份才是用户眼前这套，对话之外要读的就是它。
    // 失败静默：落盘是「可审」，不该影响主题生效。
    function zrReportEffective(saved, spec) {
      try {
        if (!saved || typeof saved !== 'object') return;
        const body = JSON.stringify({
          id: saved.id,
          label: saved.label,
          base: saved.base,
          light: saved.light || {},
          dark: saved.dark || {},
          font: saved.font || {},
          radiusScale: saved.radiusScale,
          preset: (spec && spec.preset) || '',
          textureWeight: (spec && typeof spec.textureWeight === 'number') ? spec.textureWeight : 0,
          autoDark: !!saved.autoDark,
          bg: saved.bg ? { source: saved.bg.source, key: saved.bg.key, keyLight: saved.bg.keyLight } : null,
          textureDecision: (spec && spec.textureDecision === 'want') ? 'want' : 'no',
          sampled: !!(spec && spec.sampled),
          scheme: (typeof liveScheme === 'string' ? liveScheme : ''),
          at: new Date().toISOString(),
        });
        fetch('/dsh-zhuoer-theme/api/last-theme', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-zhuoer-client': '1' },
          body: body,
        }).catch(function () { /* ignore */ });
      } catch (e) { /* ignore */ }
    }

    // 写盘 + 立即应用。必须复用 sanitizeCustomSpec，否则这条路会绕过主题规格校验。
    // 写入顺序与面板一致：先落 localStorage → 再重算 token → 再通知监听者。
    function zrApplyThemeSpec(spec) {
      const pref = readPref();
      const list = pref.customThemes || [];
      if (list.length >= CUSTOM_MAX) {
        const e = new Error('custom-theme-limit'); e.code = 'limit'; throw e;
      }
      // 自定义主题的 base 只能取内置主题：当前若停在自定义主题上，就退回它的 base。
      // 判据与 zrResolveBg 共用 zrBaseThemeId，避免底纹与主题克隆到不同的 base。
      const base = zrBaseThemeId();
      let id = '';
      do {
        id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      } while (THEME_IDS.indexOf(id) !== -1 || list.some(function (c) { return c.id === id; }));
      // 预设只补「模型没给」的那部分：显式给了字体/圆角就以模型为准。
      const pd = zrPresetDefaults(spec.preset);
      const candidate = {
        id: id,
        label: spec.label,
        base: base,
        // 模型给了完整深色表就用它（autoDark 关掉），否则退回由浅色反推。
        dark: spec.dark || {},
        // R-10：要底纹时才给底色让路；不需要底纹就一个字都不动。
        light: zrPressLightBase(spec.light, spec.textureDecision === 'want' ? spec.textureWeight : 0),
        font: (function () {
          const f = spec.font || {};
          if (f.body || f.chat) return { body: f.body || '', chat: f.chat || '' };
          return pd ? { body: pd.font.body, chat: pd.font.chat } : { body: '', chat: '' };
        })(),
        radiusScale: typeof spec.radiusScale === 'number' ? spec.radiusScale : (pd ? pd.radiusScale : 1),
        autoDark: !(spec.dark && Object.keys(spec.dark).length >= 4),
        // 有 AI 底纹就绑上：先塞内存 Map（applyTokens 同步读它），IDB 落库异步补。
        bg: (function () {
          const url = typeof (spec && spec.textureDataUrl) === 'string' ? spec.textureDataUrl : '';
          const urlL = typeof (spec && spec.textureLightDataUrl) === 'string' ? spec.textureLightDataUrl : '';
          // 没有底纹就显式写 'none'：对话框生成的主题**不继承**全局底图。
          // 空 source 的历史语义是「跟随全局」，那是老数据的约定；新主题一律从「不用底图」起步。
          if (!url && !urlL) return { source: 'none', key: '', keyLight: '', opacity: null, style: '', kind: '' };
          const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          let key = '';
          let keyLight = '';
          if (url) {
            key = 'img_' + stamp;
            imageCache.set(key, url);
            try { idbPut(key, url).catch(function () { /* 落库失败不影响本次应用 */ }); } catch (e) { /* ignore */ }
          }
          if (urlL) {
            keyLight = 'img_' + stamp + 'b';
            imageCache.set(keyLight, urlL);
            try { idbPut(keyLight, urlL).catch(function () { /* 落库失败不影响本次应用 */ }); } catch (e) { /* ignore */ }
          }
          return { source: 'image', key: key, keyLight: keyLight, opacity: null, style: '', kind: 'texture' };
        })(),
      };
      const safe = sanitizeCustomSpec(candidate);
      if (!safe) { const e = new Error('invalid-theme-spec'); e.code = 'invalid'; throw e; }
      writePref({ customThemes: list.concat([safe]), theme: safe.id });
      applyTokens(themeRef, readPref());
      emitChange();
      // 生效之后才回传：这份色板就是「用户点应用之后界面上的那套」。
      zrReportEffective(safe, spec);
      return safe;
    }

    // 卡片纯样式：不依赖面板是否挂载过（PANEL_CSS 只随设置面板注入）。
    // 走插件既有的 adoptedStyleSheets 惯例，避免往 body 追加节点。
    const THEME_CARD_CSS = [
      '.zrc{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:10px 12px;',
      'background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);',
      'font-size:12px;line-height:1.5;max-width:520px;}',
      '.zrc-hd{display:flex;align-items:center;gap:8px;margin-bottom:8px;}',
      '.zrc-name{font-weight:600;font-size:13px;}',
      '.zrc-tag{font-size:11px;color:var(--dsw-alias-label-secondary);}',
      '.zrc-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;}',
      '.zrc-cell{display:flex;flex-direction:column;gap:4px;}',
      '.zrc-sw{height:26px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);}',
      '.zrc-lb{font-size:10px;color:var(--dsw-alias-label-secondary);',
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.zrc-hex{font-family:ui-monospace,monospace;font-size:10px;color:var(--dsw-alias-label-secondary);}',
      '.zrc-acts{display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap;}',
      '.zrc-btn{display:inline-flex;align-items:center;min-height:24px;padding:4px 12px;border-radius:8px;',
      'cursor:pointer;font:inherit;font-size:12px;background:var(--dsw-alias-bg-layer-2);',
      'color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);}',
      '.zrc-btn:hover{background:var(--dsw-alias-interactive-bg-hover);}',
      '.zrc-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;}',
      '.zrc-btn[data-pri="1"]{background:var(--dsw-alias-button-primary-fill);',
      'color:var(--dsw-alias-label-primary-foreground,var(--dsw-alias-bg-base));border-color:transparent;}',
      '.zrc-ok{color:var(--dsw-alias-state-success-primary);}',
        '.zrc-texnote{margin-top:6px;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-tertiary);}',
      '.zrc-err{color:var(--dsw-alias-state-error-primary);}',
      // R-09：底纹缺失、被后一张卡取代这类「不是错误但必须说」的提示走警示色，不抢错误红。
      '.zrc-warn{margin-top:6px;font-size:11px;line-height:1.5;color:var(--dsw-alias-state-warn-primary);}',
      '.zrc-stale{opacity:.6;}',
      '.zrc-inp{width:100%;padding:3px 6px;border-radius:6px;font:inherit;font-size:11px;',
      'background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);',
      'color:var(--dsw-alias-label-primary);}',
    ].join('');

    let zrCardSheet = null;
    function zrEnsureCardCss() {
      try {
        if (document.adoptedStyleSheets && typeof CSSStyleSheet === 'function') {
          if (!zrCardSheet) { zrCardSheet = new CSSStyleSheet(); zrCardSheet.replaceSync(THEME_CARD_CSS); }
          if (Array.prototype.indexOf.call(document.adoptedStyleSheets, zrCardSheet) === -1) {
            document.adoptedStyleSheets = Array.prototype.slice.call(document.adoptedStyleSheets).concat([zrCardSheet]);
          }
          return;
        }
      } catch (e) { /* 老 Chromium 没有 adoptedStyleSheets */ }
    }

    // 事件定义：认领本插件工具的结果，产出对话流里的一个节点。
    function zrThemeCardDefinition() {
      return {
        kind: THEME_CARD_KIND,
        target: 'chat',
        match: function (event) {
          const spec = zrSpecFromEvent(event);
          if (!spec) return null;
          return { id: 'zhuoer-theme:' + event.seq, role: 'start' };
        },
        start: function (_context, match) {
          const spec = zrSpecFromEvent(match && match.event);
          if (!spec) throw new Error('zhuoer theme card requires a theme spec');
          return { seq: match.event.seq, spec: spec };
        },
        update: function (context) { return context.state; },
        buildViewNode: function (context) {
          const s = context.state;
          if (!s) return null;
          return {
            key: context.key,
            kind: THEME_CARD_KIND,
            id: context.id,
            target: 'chat',
            anchorSeq: s.seq,
            location: { kind: 'session' },
            visibility: 'visible',
            data: { spec: s.spec },
          };
        },
      };
    }

    // R-09：同一会话只留一张「活」卡。历史卡不消失（消息还在），但被取代的要标出来，
    // 否则用户在一串三色卡里点「应用」，很可能是照着上一张的色板点的。
    let zrCardSeq = 0;
    const zrCardLive = { id: 0, subs: new Set() };
    // 「用户要了底纹，但两张都没取回来」的判据（纯函数，便于无头验证）。
    // 一张取到就算成功：另一张缺了会由客户端反相兜底，不需要在这里报。
    function zrTexMissing(wanted, darkUrl, lightUrl) {
      return !!wanted && !darkUrl && !lightUrl;
    }

    function zrClaimCard() {
      const id = ++zrCardSeq;
      zrCardLive.id = id;
      zrCardLive.subs.forEach(function (fn) { try { fn(id); } catch (e) { /* ignore */ } });
      return id;
    }

    function ThemeCardNode(props) {
      const node = props && props.node;
      const data = node && node.data;
      const incoming = data && data.spec ? data.spec : null;
      const [spec, setSpec] = useState(incoming);
      const [draft, setDraft] = useState(incoming);
      // 参考图取色：图片由 /api/texture 回传，本地 canvas 采样（与面板同一算法），
      // 采样成功后直接用真实颜色覆盖锚点——这才是「按图配色」，不是模型猜色。
      React.useEffect(function () {
        if (!spec || !spec.refName) return undefined;
        let dead = false;
        const url = '/dsh-zhuoer-theme/api/texture?name=' + encodeURIComponent(spec.refName);
        fetch(url, { headers: { 'x-zhuoer-client': '1' } })
          .then(function (r) { return r && r.ok ? r.blob() : null; })
          .then(function (blob) {
            if (!blob || dead) return null;
            const file = new File([blob], 'ref', { type: blob.type || 'image/jpeg' });
            return imageToImageData(file, 640);
          })
          .then(function (img) {
            if (!img || dead) return;
            // R-05：对话走保真档（大面积单色照片不再塌成一格灰绿）；面板仍走快档。
            const palette = extractPalette(img, 6, { tier: 'faithful' });
            const lightAnchors = paletteToAnchors(palette, 'light');
            const darkAnchors = paletteToAnchors(palette, 'dark');
            if (!lightAnchors || !darkAnchors) return;
            // 明暗各出一套：与「对话里 AI 生成」保持一致，深色不是由浅色反推的。
            // R-06：取色结果不能「静默替换」模型配色——两套都留着，卡片上标明来源并可一键换回。
            // 存法：light/dark 是当前生效那套，altLight/altDark 是另一套；切换 = 对调。
            const next = Object.assign({}, spec, {
              light: lightAnchors, dark: darkAnchors, autoDark: false, sampled: true,
              sampledHex: palette.map(function (c) { return c.hex; }).slice(0, 6),
              src: 'sampled',
              altLight: Object.assign({}, spec.light || {}),
              altDark: Object.assign({}, spec.dark || {}),
            });
            setSpec(next);
            setDraft(next);
          })
          .catch(function () { /* 取色失败就保留模型给的锚点 */ });
        return function () { dead = true; };
      }, [spec && spec.refName]);
      const [mode, setMode] = useState('view');
      const [done, setDone] = useState(false);
      const [err, setErr] = useState('');
      // R-09：底纹取不到要说话；被后面新生成的卡取代也要说话。
      const [texNote, setTexNote] = useState('');
      const [superseded, setSuperseded] = useState(false);
      useEffect(function () { zrEnsureCardCss(); }, []);
      // 挂载即登记为「当前活卡」，并订阅后续登记：别人成为活卡时，我标记自己被取代。
      useEffect(function () {
        const myId = zrClaimCard();
        const fn = function (liveId) { setSuperseded(liveId !== myId); };
        zrCardLive.subs.add(fn);
        return function () { zrCardLive.subs.delete(fn); };
      }, []);
      if (!spec) return null;

      const applied = function (target) {
        setErr('');
        // 底纹要先取回字节再写盘，所以这一步是异步的；取不到就退化成纯配色，不影响应用。
        zrResolveBg(target).then(function (bgs) {
        // R-09：用户要了底纹却一张都没取回来时明说，别静默退化成纯配色（原来是无声的）。
        setTexNote(zrTexMissing(target.texture || target.textureLight, bgs.dark, bgs.light) ? t('panel.chat.texMissing') : '');
        const t2 = Object.assign({}, target, { textureDataUrl: bgs.dark, textureLightDataUrl: bgs.light });
        try {
          const safe = zrApplyThemeSpec(t2);
          // 应用后重建 spec：除锚点外，来源标记与「另一套配色」也要带过去，否则一次应用就把换回入口丢掉了。
          const next = { label: safe.label, light: Object.assign({}, target.light), dark: Object.assign({}, target.dark || {}), font: target.font, radiusScale: target.radiusScale, textureWeight: target.textureWeight, texture: target.texture || null, textureLight: target.textureLight || null, textureDecision: target.textureDecision, sampled: !!target.sampled, sampledHex: target.sampledHex, src: target.src, altLight: target.altLight, altDark: target.altDark };
          setSpec(next);
          setDraft(next);
          setDone(true);
          setMode('view');
        } catch (e) {
          setErr(e && e.code === 'limit' ? t('panel.chat.limitErr', { n: CUSTOM_MAX }) : t('panel.chat.fail'));
        }
        });
      };
      const startEdit = function () {
        setErr(''); setDone(false);
        setDraft(JSON.parse(JSON.stringify(spec)));
        setMode('edit');
      };
      const setAnchor = function (scheme, anchor, hex) {
        setDraft(zrSetAnchor(draft, scheme, anchor, hex));
      };
      const swapSource = function () {
        const next = zrSwapSource(draft);
        if (next) setDraft(next);
      };
      // view 态只换「显示的是哪套」，不写盘：用户点「应用」才落成主题（否则每点一次就吃掉一个自定义主题名额）。
      const swapInView = function () {
        const next = zrSwapSource(spec);
        if (next) setSpec(next);
      };
      const view = mode === 'edit' ? draft : spec;

      // 被取代的卡整体降透明：既看得出「它已经不是当前那张」，也不至于读不了。
      return h('div', { className: 'zrc' + (superseded ? ' zrc-stale' : ''), 'data-zhuoer-card': 'theme' },
        h('style', null, THEME_CARD_CSS),
        h('div', { className: 'zrc-hd' },
          h('span', { className: 'zrc-name' }, view.label || spec.label),
          h('span', { className: 'zrc-tag' }, mode === 'edit' ? t('panel.chat.editing') : t('panel.chat.preview')),
          // 配色来源必须写在卡片上：取色会把模型配色整表替换掉，用户有权知道眼前是哪一套。
          view.src
            ? h('span', { className: 'zrc-tag zrc-src' }, view.src === 'sampled' ? t('panel.chat.srcSampled') : t('panel.chat.srcModel'))
            : null,
        ),
        h('div', { className: 'zrc-grid' },
          ANCHOR_GROUPS.map(function (g) {
            const hex = (view.light && view.light[g.anchor]) || '#000000';
            return h('div', { className: 'zrc-cell', key: g.key },
              h('div', { className: 'zrc-sw', style: { background: hex }, 'aria-hidden': 'true' }),
              h('div', { className: 'zrc-lb' }, t('anchor.' + g.key)),
              mode === 'edit'
                ? h('input', {
                    type: 'color', className: 'zrc-inp', 'aria-label': t('anchor.' + g.key),
                    value: /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#000000',
                    onChange: function (ev) { setAnchor('light', g.anchor, ev.target.value); },
                  })
                : h('div', { className: 'zrc-hex' }, hex),
            );
          })
        ),
        (view.dark && Object.keys(view.dark).length >= 4)
          ? h('div', null,
              h('div', { className: 'zrc-lb', style: { marginTop: '8px' } }, t('panel.ed.dark')),
              h('div', { className: 'zrc-grid' },
                ANCHOR_GROUPS.map(function (g) {
                  const dh = view.dark[g.anchor] || '#000000';
                  return h('div', { className: 'zrc-cell', key: 'd-' + g.key },
                    h('div', { className: 'zrc-sw', style: { background: dh }, 'aria-hidden': 'true' }),
                    h('div', { className: 'zrc-lb' }, t('anchor.' + g.key)),
                    mode === 'edit'
                      ? h('input', {
                          type: 'color', className: 'zrc-inp', 'aria-label': t('panel.ed.dark') + ' ' + t('anchor.' + g.key),
                          value: /^#[0-9a-fA-F]{6}$/.test(dh) ? dh : '#000000',
                          onChange: function (ev) { setAnchor('dark', g.anchor, ev.target.value); },
                        })
                      : h('div', { className: 'zrc-hex' }, dh),
                  );
                })
              )
            )
          : null,
        mode === 'edit'
          ? h('div', { className: 'zrc-acts' },
              h('input', {
                type: 'text', className: 'zrc-inp', style: { maxWidth: '180px' },
                'aria-label': t('panel.chat.nameAria'), value: draft.label,
                onChange: function (ev) { const n = JSON.parse(JSON.stringify(draft)); n.label = String(ev.target.value).slice(0, 24); setDraft(n); },
              }),
              draft.altLight
                ? h('button', { type: 'button', className: 'zrc-btn', onClick: swapSource }, draft.src === 'sampled' ? t('panel.chat.useModel') : t('panel.chat.useSampled'))
                : null,
              h('button', { type: 'button', className: 'zrc-btn', 'data-pri': '1', disabled: superseded, onClick: function () { applied(draft); } }, t('panel.chat.applyEdited')),
              h('button', { type: 'button', className: 'zrc-btn', onClick: function () { setMode('view'); } }, t('panel.chat.cancel')),
            )
          : h('div', { className: 'zrc-acts' },
              done
                ? (function () {
                    const rep = typeof overrideReport === 'function' ? overrideReport() : null;
                    if (!rep || !rep.applied || !rep.applied.length) return h('span', { className: 'zrc-ok' }, t('panel.chat.applied'));
                    const soft = rep.softened && rep.softened.length ? ' · ' + t('panel.chat.ovSoft').replace('{s}', String(rep.softened.length)) : '';
                    return h('span', { className: 'zrc-ok' }, t('panel.chat.ovApplied').replace('{n}', String(rep.applied.length)) + soft);
                  })()
                : h('button', { type: 'button', className: 'zrc-btn', 'data-pri': '1', disabled: superseded, onClick: function () { applied(spec); } }, t('panel.chat.apply')),
              h('button', { type: 'button', className: 'zrc-btn', onClick: startEdit }, t('panel.chat.modify')),
              spec.altLight
                ? h('button', { type: 'button', className: 'zrc-btn', onClick: swapInView }, spec.src === 'sampled' ? t('panel.chat.useModel') : t('panel.chat.useSampled'))
                : null,
            ),
        spec.textureDecision === 'no' && !spec.texture
          ? h('div', { className: 'zrc-texnote' }, t('panel.chat.texOff'))
          : null,
        spec.sampledHex && spec.sampledHex.length
          ? h('div', { className: 'zrc-texnote' }, t('panel.chat.sampled') + '：' + spec.sampledHex.join(' · '))
          : null,
        superseded ? h('div', { className: 'zrc-warn' }, t('panel.chat.superseded')) : null,
        texNote ? h('div', { className: 'zrc-warn', role: 'alert' }, texNote) : null,
        err ? h('div', { className: 'zrc-err', role: 'alert' }, err) : null,
      );
    }

    // 注册：事件定义 + 插槽视图。
    // 注意 inject 必须用它自己的 ctx（owner）做 slots 注册，否则注册会挂到错误的 owner 上。
    function registerThemeCard(ctx) {
      if (!ctx || typeof ctx.inject !== 'function') return;
      try {
        ctx.inject(['uiConversation'], function (owner) {
          let uiConversation = null;
          try { uiConversation = owner.get('uiConversation'); } catch (e) { uiConversation = null; }
          if (!uiConversation || !uiConversation.events || typeof uiConversation.events.register !== 'function') return;
          try {
            owner.effect(function () {
              return uiConversation.events.register(zrThemeCardDefinition());
            }, 'zhuoer-theme: chat card definition');
          } catch (e) { /* ignore */ }
          try {
            const ownerRegister = owner.slots.register.bind(owner.slots);
            owner.slots.inject('conversation.chat.node', function () {
              return ownerRegister({ name: 'conversation.chat.node', key: THEME_CARD_KIND }, ThemeCardNode);
            });
          } catch (e) { /* ignore */ }
        });
      } catch (e) { /* 卡片注册失败不影响皮肤 */ }
    }
