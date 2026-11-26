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
      // 显式深色锚点：≥4 个才算给了，否则交给 autoDark 反推。
      const dsrc = zrRec(m.dark) || {};
      const dark = {};
      ANCHOR_GROUPS.forEach(function (g) {
        const v = dsrc[g.anchor];
        if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim())) dark[g.anchor] = v.trim().toLowerCase();
      });
      const darkOk = Object.keys(dark).length >= 4;
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
        textureDecision: m.textureDecision === 'want' ? 'want' : 'no',
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

    // 深色、浅色各取一张：与内置主题一致（BG / BG_SOFT），一张深图铺在浅底上会发闷。
    function zrResolveBg(spec) {
      return Promise.all([zrFetchTexture(spec && spec.texture), zrFetchTexture(spec && spec.textureLight)])
        .then(function (r) { return { dark: r[0] || '', light: r[1] || '' }; });
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
      const cur = customSpec(pref);
      const base = THEME_IDS.indexOf(pref.theme) !== -1 ? pref.theme : (cur ? cur.base : 'zhuoer');
      let id = '';
      do {
        id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      } while (THEME_IDS.indexOf(id) !== -1 || list.some(function (c) { return c.id === id; }));
      const candidate = {
        id: id,
        label: spec.label,
        base: base,
        // 模型给了完整深色表就用它（autoDark 关掉），否则退回由浅色反推。
        dark: spec.dark || {},
        light: spec.light,
        font: spec.font || { body: '', chat: '' },
        radiusScale: typeof spec.radiusScale === 'number' ? spec.radiusScale : 1,
        autoDark: !(spec.dark && Object.keys(spec.dark).length >= 4),
        // 有 AI 底纹就绑上：先塞内存 Map（applyTokens 同步读它），IDB 落库异步补。
        bg: (function () {
          const url = typeof (spec && spec.textureDataUrl) === 'string' ? spec.textureDataUrl : '';
          const urlL = typeof (spec && spec.textureLightDataUrl) === 'string' ? spec.textureLightDataUrl : '';
          if (!url && !urlL) return { source: '', key: '', keyLight: '', opacity: null, style: '' };
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
          return { source: 'image', key: key, keyLight: keyLight, opacity: null, style: '' };
        })(),
      };
      const safe = sanitizeCustomSpec(candidate);
      if (!safe) { const e = new Error('invalid-theme-spec'); e.code = 'invalid'; throw e; }
      writePref({ customThemes: list.concat([safe]), theme: safe.id });
      applyTokens(themeRef, readPref());
      emitChange();
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

    function ThemeCardNode(props) {
      const node = props && props.node;
      const data = node && node.data;
      const incoming = data && data.spec ? data.spec : null;
      const [spec, setSpec] = useState(incoming);
      const [draft, setDraft] = useState(incoming);
      const [mode, setMode] = useState('view');
      const [done, setDone] = useState(false);
      const [err, setErr] = useState('');
      useEffect(function () { zrEnsureCardCss(); }, []);
      if (!spec) return null;

      const applied = function (target) {
        setErr('');
        // 底纹要先取回字节再写盘，所以这一步是异步的；取不到就退化成纯配色，不影响应用。
        zrResolveBg(target).then(function (bgs) {
        const t2 = Object.assign({}, target, { textureDataUrl: bgs.dark, textureLightDataUrl: bgs.light });
        try {
          const safe = zrApplyThemeSpec(t2);
          const next = { label: safe.label, light: Object.assign({}, target.light), dark: Object.assign({}, target.dark || {}), font: target.font, radiusScale: target.radiusScale, texture: target.texture || null, textureLight: target.textureLight || null, textureDecision: target.textureDecision };
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
      const setAnchor = function (anchor, hex) {
        const next = JSON.parse(JSON.stringify(draft));
        next.light[anchor] = String(hex || '').toLowerCase();
        setDraft(next);
      };
      const view = mode === 'edit' ? draft : spec;

      return h('div', { className: 'zrc', 'data-zhuoer-card': 'theme' },
        h('style', null, THEME_CARD_CSS),
        h('div', { className: 'zrc-hd' },
          h('span', { className: 'zrc-name' }, view.label || spec.label),
          h('span', { className: 'zrc-tag' }, mode === 'edit' ? t('panel.chat.editing') : t('panel.chat.preview')),
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
                    onChange: function (ev) { setAnchor(g.anchor, ev.target.value); },
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
                    h('div', { className: 'zrc-hex' }, dh),
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
              h('button', { type: 'button', className: 'zrc-btn', 'data-pri': '1', onClick: function () { applied(draft); } }, t('panel.chat.applyEdited')),
              h('button', { type: 'button', className: 'zrc-btn', onClick: function () { setMode('view'); } }, t('panel.chat.cancel')),
            )
          : h('div', { className: 'zrc-acts' },
              done
                ? h('span', { className: 'zrc-ok' }, t('panel.chat.applied'))
                : h('button', { type: 'button', className: 'zrc-btn', 'data-pri': '1', onClick: function () { applied(spec); } }, t('panel.chat.apply')),
              h('button', { type: 'button', className: 'zrc-btn', onClick: startEdit }, t('panel.chat.modify')),
            ),
        spec.textureDecision === 'no' && !spec.texture
          ? h('div', { className: 'zrc-texnote' }, t('panel.chat.texOff'))
          : null,
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
