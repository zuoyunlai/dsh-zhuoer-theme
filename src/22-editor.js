    // ---------- 自定义主题编辑器 ----------
    // 浮层只画左侧面板，右半区全透明 + pointer-events:none，
    // 让用户一边调色一边看到真实界面在变 —— 真实界面就是预览，不造假组件。

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
        // 默认值一直可见：实线方块是当前值，旁边虚线方块是克隆主题的默认值。
        // 改了哪一行，不用展开/悬浮就能同时看到两个状态。
        h('span', {
          className: 'zp-ed-def',
          style: { background: props.defaultValue || 'transparent' },
          title: t('panel.ed.defaultAria', { hex: props.defaultValue || '' }),
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

    // 8 个锚点按 5 个语义带呈现：带是给人读的分组，不是新的数据层。
    // 顺序照着「先底子、后字、再线、品牌、最后语义」的调色直觉。
    const ANCHOR_BANDS = [
      { key: 'base', groups: ['bg'] },
      { key: 'text', groups: ['text'] },
      { key: 'line', groups: ['border'] },
      { key: 'brand', groups: ['brand', 'brand2'] },
      { key: 'semantic', groups: ['danger', 'warn', 'success'] },
    ];

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
      // 例外：自带 dark 表（autoDark=false）的主题跟随宿主当前明暗打开，
      // 这样试样和右侧真实界面是同一态；autoDark 主题仍从浅色（源锚点）开始。
      const [editScheme, setEditScheme] = useState(function () {
        const spec = props.spec || {};
        const hasDark = spec.autoDark === false && spec.dark && Object.keys(spec.dark).length;
        return hasDark && props.scheme === 'dark' ? 'dark' : 'light';
      });
      // 未保存改动与「放弃确认」：× / Esc / 取消 三条路径都会丢弃 draft，
      // 以前它们直接 onClose，调色 20 分钟误按一次就全没，且没有任何提示。
      const [dirty, setDirty] = useState(false);
      // 「高级」抽屉：把 8 组锚点背后的 156 个 token 暴露出来，逐个可改。
      const [advOpen, setAdvOpen] = useState(false);
      const [advGroup, setAdvGroup] = useState({});
      const [confirmDiscard, setConfirmDiscard] = useState(false);
      // 撤销栈：只存草稿快照，不碰已保存的主题。最多 30 步，够覆盖一次连续微调。
      const [history, setHistory] = useState([]);
      // AI 与取色是「先给一组起点」的次要入口，默认收起，不抢锚点的注意力。
      const [toolsOpen, setToolsOpen] = useState(false);
      // 显示「这一套实际算出来的值」而不是 base 主题原值：
      // autoDark 时深色格子里显示的就是反推结果，用户可以直接在它基础上调。
      const baseTokens = React.useMemo(function () { return buildCustomTokens(draft, editScheme); }, [draft, editScheme]);
      // 当前明暗的「默认值」= 把当前明暗的覆盖清空后再算一遍。
      // 这样 autoDark 的深色默认值也是真实反推值，而不是 base 主题的深色原值。
      const defaultTokens = React.useMemo(function () {
        const clean = JSON.parse(JSON.stringify(draft));
        clean[editScheme] = {};
        return buildCustomTokens(clean, editScheme);
      }, [draft, editScheme]);
      const specVars = specimenVars(baseTokens);
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
            setBg({ source: 'image', key: key, keyLight: '', kind: 'photo' });
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
      // 每一步草稿修改前先压栈；同一份快照连续出现（例如连续键入同一个字符）不重复记。
      const pushHistory = function (prev) {
        const snap = JSON.stringify(prev);
        setHistory(function (h) {
          if (h.length && h[h.length - 1] === snap) return h;
          const next = h.concat([snap]);
          return next.length > 30 ? next.slice(next.length - 30) : next;
        });
      };
      const commit = function (next) {
        pushHistory(draftRef.current);
        setDraft(next);
        setDirty(true);
        props.onPreview(next, editScheme);
      };
      // 切 scheme 的场景：先落 draft，再按目标 scheme 预览一次。
      // 预设/填入只跑一遍 applyTokens（26–45KB CSS 重建两次在这里合并掉）。
      const commitWith = function (next, scheme) {
        pushHistory(draftRef.current);
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
      const undo = function () {
        if (!history.length) return;
        const prev = JSON.parse(history[history.length - 1]);
        setHistory(history.slice(0, -1));
        setDraft(prev);
        setDirty(true);
        props.onPreview(prev, editScheme);
      };
      // 只清当前明暗的锚点覆盖；base / 字体 / 圆角 / 底图保持不动。
      const resetAllAnchors = function () {
        if (!Object.keys(anchors).length) return;
        const next = JSON.parse(JSON.stringify(draft));
        next[editScheme] = {};
        commit(next);
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
      // 会话随机数：AI 生成会消耗宿主模型额度，服务端要求带上它。取一次缓存住即可。
      let aiNonce = '';
      const fetchAiNonce = function (force) {
        if (aiNonce && !force) return Promise.resolve(aiNonce);
        return fetch('/dsh-zhuoer-theme/api/nonce', { headers: { 'x-zhuoer-client': '1' } })
          .then(function (r) { return r.json(); })
          .then(function (d) { aiNonce = (d && d.nonce) || ''; return aiNonce; });
      };
      // 一次生成 = 领 nonce → 请求 → 解析。403 说明 nonce 过期（插件重载过），
      // 这时丢掉缓存重领一次再试——只重试这一次，避免和服务端互相踢皮球。
      const callGenTheme = function (prompt, nonce) {
        return fetch('/dsh-zhuoer-theme/api/gen-theme?prompt=' + encodeURIComponent(prompt), { method: 'GET', headers: { 'x-zhuoer-client': '1', 'x-zhuoer-nonce': nonce } })
          .then(function (resp) {
            return resp.json().then(function (data) { return { status: resp.status, data: data }; });
          });
      };
      const aiGenerate = function () {
        const prompt = String(aiPrompt || '').trim();
        if (!prompt) return;
        setAiBusy(true); setAiErr(''); setAiResult(null);
        // C2：记下起点，收尾时按最小可见时长补齐（见 00-core 的 zrDwellDelay）。
        const aiStartedAt = Date.now();
        // query string 传参：宿主会在 handler 之前截走 POST body。
        fetchAiNonce()
          .then(function (nonce) { return callGenTheme(prompt, nonce); })
          .then(function (r1) {
            if (!zrIsStaleNonce(r1.status)) return r1;
            // nonce 过期：清掉缓存重领一次（服务端每次装载插件都会换 sessionNonce）。
            aiNonce = '';
            return fetchAiNonce(true).then(function (nonce2) { return callGenTheme(prompt, nonce2); });
          })
          .then(function (r) {
            const data = r && r.data;
            if (!data || !data.ok) {
              throw new Error((data && (data.message || data.error)) || t('panel.ai.failed'));
            }
            const parsed = extractAiTheme(data.text);
            if (!parsed) throw new Error(t('panel.ai.badJson'));
            setAiResult(parsed);
          })
          .catch(function (e) { setAiErr((e && e.message) || t('panel.ai.failed')); })
          .then(function () {
            const wait = zrDwellDelay(Date.now() - aiStartedAt, ZR_DWELL_MS);
            if (wait > 0) setTimeout(function () { setAiBusy(false); }, wait);
            else setAiBusy(false);
          });
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

      // C1：拖宽 / 方向键微调 / 双击复位。
      // 拖动期间只改 CSS 变量（不写 localStorage），松手才落盘——否则每移动一像素就序列化一次 JSON。
      const setEdW = function (w, persist) {
        const v = zrClampEdW(w);
        try { if (panelRef.current) panelRef.current.style.setProperty('--zp-ed-w', v + 'px'); } catch (e) { /* ignore */ }
        if (persist) { try { writePref({ editorWidth: v }); } catch (e) { /* ignore */ } }
        return v;
      };
      const edWnow = function () {
        try { return panelRef.current ? panelRef.current.getBoundingClientRect().width : 0; } catch (e) { return 0; }
      };
      const onRzDown = function (ev) {
        try {
          const startX = ev.clientX;
          const base = edWnow() || zrClampEdW(readPref().editorWidth);
          const move = function (e2) { setEdW(base + (e2.clientX - startX), false); };
          const up = function () {
            document.removeEventListener('pointermove', move, true);
            document.removeEventListener('pointerup', up, true);
            setEdW(edWnow(), true);
          };
          document.addEventListener('pointermove', move, true);
          document.addEventListener('pointerup', up, true);
          if (ev.preventDefault) ev.preventDefault();
        } catch (e) { /* ignore */ }
      };
      const onRzKey = function (ev) {
        const cur = edWnow() || zrClampEdW(readPref().editorWidth);
        const step = ev.shiftKey ? 32 : 8;
        if (ev.key === 'ArrowLeft') { setEdW(cur - step, true); if (ev.preventDefault) ev.preventDefault(); }
        else if (ev.key === 'ArrowRight') { setEdW(cur + step, true); if (ev.preventDefault) ev.preventDefault(); }
        else if (ev.key === 'Home') { setEdW(ZR_ED_W_MIN, true); if (ev.preventDefault) ev.preventDefault(); }
        else if (ev.key === 'End') { setEdW(ZR_ED_W_MAX, true); if (ev.preventDefault) ev.preventDefault(); }
      };

      return h('div', { className: 'zp-ed', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('panel.ed.dialogAria') },
        h('div', {
          className: 'zp-ed-panel',
          ref: panelRef,
          // C1：宽度从偏好读，首帧就是上次的宽度（不靠 effect，避免 392 → 500 跳一帧）。
          style: { '--zp-ed-w': zrClampEdW(readPref().editorWidth) + 'px' },
        },
          h('button', {
            type: 'button', className: 'zp-ed-rz', tabIndex: 0,
            'aria-label': t('panel.ed.dialogAria'),
            onPointerDown: onRzDown, onKeyDown: onRzKey,
            onDoubleClick: function () { setEdW(ZR_ED_W_DEFAULT, true); },
          }),
          h('div', { className: 'zp-ed-hd' },
            h('div', { className: 'zp-ed-ttl' }, t('panel.ed.title')),
            h('button', {
              type: 'button', className: 'zp-ed-x', 'aria-label': t('panel.ed.closeAria'),
              title: t('panel.ed.closeTitle'),
              onClick: function () { requestCloseRef.current(); },
            }, '×')
          ),

          // 1. 基色：先定从哪套主题出发、编辑哪一态。试样紧跟在下面，改任何锚点先在这里显形。
          h('div', { className: 'zp-ed-sec' },
            h('div', { className: 'zp-sec-hd' },
              h('h3', { className: 'zp-sec-t' }, t('panel.ed.baseSection')),
              h('div', { className: 'zp-sec-n' }, t('panel.ed.previewNote'))
            ),
            h(Specimen, { className: 'zp-ed-spec', vars: specVars }),
            h(Row, { label: t('panel.ed.name') },
              h('input', {
                type: 'text', className: 'zp-txt', value: draft.label, maxLength: 24,
                ref: nameRef, 'aria-label': t('panel.ed.nameAria'),
                onChange: function (ev) { const n = JSON.parse(JSON.stringify(draft)); n.label = ev.target.value; setDraft(n); setDirty(true); },
              })
            ),
            h(Row, { label: t('panel.ed.base') },
              h(Select, {
                label: t('panel.ed.baseAria'),
                value: draft.base,
                options: THEME_IDS.map(function (id) { return [id, themeLabelOf((THEMES[id] && THEMES[id].label) || id)]; }),
                noEmpty: true,
                onChange: function (v) {
                  const n = JSON.parse(JSON.stringify(draft));
                  n.base = v === '__empty__' ? 'zhuoer' : v;
                  commit(n);
                },
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
            )
          ),

          // 2. 锚点：8 个锚点按 5 个语义带分组；每行永远显示当前色与默认色。
          h('div', { className: 'zp-ed-sec' },
            h('div', { className: 'zp-sec-hd' },
              h('h3', { className: 'zp-sec-t' }, t('panel.ed.anchors')),
              h('div', { className: 'zp-sec-n' }, t('panel.ed.anchorsNote'))
            ),
            h('div', { className: 'zp-bands' },
              ANCHOR_BANDS.map(function (band) {
                const bgHex = baseTokens['--dsw-alias-bg-base'] || anchors['--dsw-alias-bg-base'] || '#000000';
                const groups = band.groups.map(function (key) {
                  return ANCHOR_GROUPS.filter(function (g) { return g.key === key; })[0];
                }).filter(Boolean);
                return h('div', { key: band.key, className: 'zp-band' },
                  h('div', { className: 'zp-band-hd' }, t('panel.ed.band.' + band.key)),
                  h('div', { className: 'zp-ed-list' },
                    groups.map(function (g) {
                      const own = anchors[g.anchor];
                      const cur = baseTokens[g.anchor] || own || '#000000';
                      const def = defaultTokens[g.anchor] || cur;
                      const ratio = g.key === 'bg' ? null : zrContrast(cur, bgHex);
                      return h(AnchorRow, {
                        key: g.key, label: t('anchor.' + g.key), anchor: g.anchor, value: cur,
                        defaultValue: def,
                        ratio: ratio, low: ratio != null && ratio < 4.5,
                        dirty: Boolean(own),
                        onChange: function (v) { setAnchor(g.anchor, v); },
                      });
                    })
                  )
                );
              })
            )
          ),

          // 3. 底图：只影响本主题。
          h('div', { className: 'zp-ed-sec' },
            h('div', { className: 'zp-sec-hd' },
              h('h3', { className: 'zp-sec-t' }, t('panel.ed.bgSection')),
              h('div', { className: 'zp-sec-n' }, t('panel.ed.bgNote'))
            ),
            h(Row, { label: t('panel.ed.bgSection') },
              h(Pills, {
                label: t('panel.ed.bgSourceAria'),
                // 顺序按「最常用 → 最少用」排，并把抽象词换成大白话：
                // 用户不需要知道「跟随全局」是什么意思，只有老数据还在用它时才看得见它。
                opts: (function () {
                  const list = [['none', t('panel.ed.bgNone')], ['theme', t('panel.ed.bgThemeOwn')], ['image', t('panel.ed.bgCustom')]];
                  if (!bg.source) list.push(['', t('panel.ed.bgFollowGlobal')]);
                  return list;
                })(),
                value: (bg.source || ''),
                onChange: function (v) {
                  // 只切「用哪种底图」，**不动**已存的图片引用。
                  // 旧实现在这里把 key 清成 ''：切到「主题自带」再切回来，图片就永久丢了
                  // （IDB 里的图还在，但主题不再引它，等于变成孤儿）。
                  setBg({ source: v });
                },
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
              : null
          ),

          // 4. 形状与字体：圆角、第三方控件、两套字体。
          h('div', { className: 'zp-ed-sec' },
            h('div', { className: 'zp-sec-hd' },
              h('h3', { className: 'zp-sec-t' }, t('panel.ed.shapeSection')),
              h('div', { className: 'zp-sec-n' }, t('panel.ed.shapeNote'))
            ),
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
                  // 2026-11-26 修：「sharp」是**全局偏好**（存在 pref 里），不属于单条自定义主题的 draft。
                  // 这一行原先从面板里复制进来，直接引用了面板作用域的 pref/set —— 编辑器里两者都不存在，
                  // 于是点「新建主题」/「编辑」一打开编辑器就抛 ReferenceError: pref is not defined。
                  type: 'checkbox', checked: props.sharp === true,
                  onChange: function (ev) { props.onSharp(Boolean(ev.target.checked)); },
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
                emptyLabel: t('panel.ed.followBase', { theme: themeLabelOf((THEMES[draft.base] && THEMES[draft.base].label) || draft.base) }),
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
                emptyLabel: t('panel.ed.followBase', { theme: themeLabelOf((THEMES[draft.base] && THEMES[draft.base].label) || draft.base) }),
                onChange: function (v) {
                  const n = JSON.parse(JSON.stringify(draft));
                  n.font = n.font || {};
                  n.font.chat = v === '__empty__' ? '' : v;
                  commit(n);
                },
              })
            )
          ),

          // 5. AI 与取色：次要入口，默认收起。结果仍是先预览、点「填入」才改草稿。
          h('div', { className: 'zp-ed-sec' },
            h('div', { className: 'zp-sec-hd' },
              h('h3', { className: 'zp-sec-t' }, t('panel.ed.aiSection')),
              h('div', { className: 'zp-sec-n' }, t('panel.ed.aiNote'))
            ),
            h('button', {
              type: 'button', className: 'zp-adv-toggle',
              'aria-expanded': toolsOpen ? 'true' : 'false',
              onClick: function () { setToolsOpen(!toolsOpen); },
            }, toolsOpen ? t('panel.ed.toolsHide') : t('panel.ed.toolsShow')),
            toolsOpen
              ? h('div', { className: 'zp-ed-list' },
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
                  )
                )
              : null
          ),

          // 6. 高级 token：仍然保留，但默认收起。
          h('div', { className: 'zp-ed-sec' },
            h('div', { className: 'zp-sec-hd' },
              h('h3', { className: 'zp-sec-t' }, t('panel.ed.advanced')),
              h('div', { className: 'zp-sec-n' }, t('panel.ed.advancedNote'))
            ),
            h('button', {
              type: 'button', className: 'zp-adv-toggle',
              'aria-expanded': advOpen ? 'true' : 'false',
              onClick: function () { setAdvOpen(!advOpen); },
            }, advOpen ? t('panel.ed.advHide') : t('panel.ed.advShow')),
            advOpen
              ? ANCHOR_GROUPS.map(function (g) {
                  const key = g.key;
                  const open = Boolean(advGroup[key]);
                  const bgAll = baseTokens['--dsw-alias-bg-base'] || anchors['--dsw-alias-bg-base'] || '#000000';
                  return h('div', { key: key, className: 'zp-adv-grp' },
                    h('button', {
                      type: 'button', className: 'zp-adv-hd',
                      'aria-expanded': open ? 'true' : 'false',
                      onClick: function () {
                        const n = Object.assign({}, advGroup); n[key] = !open; setAdvGroup(n);
                      },
                    },
                      h('span', { className: 'zp-adv-chev', 'aria-hidden': 'true' }, open ? '▾' : '▸'),
                      h('span', { className: 'zp-adv-nm' }, t('anchor.' + key)),
                      h('span', { className: 'zp-adv-n' }, String(g.members.length))
                    ),
                    open
                      ? h('div', { className: 'zp-ed-list' },
                          g.members.map(function (m) {
                            const token = m[0];
                            const own = anchors[token];
                            const cur = baseTokens[token] || own || '';
                            if (!cur) return null;
                            const def = defaultTokens[token] || cur;
                            const ratio = zrContrast(cur, bgAll);
                            return h(AnchorRow, {
                              key: token, label: token.replace('--dsw-alias-', '').replace('--dsw-', ''),
                              anchor: token, value: cur, defaultValue: def,
                              ratio: ratio, low: ratio != null && ratio < 4.5,
                              dirty: Boolean(own),
                              onChange: function (v) { setAnchor(token, v); },
                            });
                          })
                        )
                      : null
                  );
                })
              : null
          ),

          // 应用 / 重置 / 撤销：副动作一行，主动作一行；放弃确认占用主动作行。
          h('div', { className: 'zp-ed-ft' },
            confirmDiscard
              ? h('div', { className: 'zp-ed-ft-row' },
                  h('span', { className: 'zp-ed-confirm', role: 'alert' }, t('panel.ed.confirmDiscard')),
                  h('button', { type: 'button', className: 'zp-btn', onClick: function () { setConfirmDiscard(false); } }, t('panel.ed.keepEditing')),
                  h('button', { type: 'button', className: 'zp-btn', 'data-tone': 'danger', onClick: function () { props.onClose(); } }, t('panel.ed.discard'))
                )
              : h('div', { className: 'zp-ed-ft-row is-aux' },
                  h('button', {
                    type: 'button', className: 'zp-btn', disabled: !history.length,
                    onClick: undo,
                  }, t('panel.ed.undo')),
                  h('button', {
                    type: 'button', className: 'zp-btn', disabled: !Object.keys(anchors).length,
                    title: t('panel.ed.resetAllTitle'),
                    onClick: resetAllAnchors,
                  }, t('panel.ed.resetAll')),
                  h('span', { className: 'zp-ed-ft-note' }, dirty ? t('panel.ed.dirtyHint') : '')
                ),
            confirmDiscard
              ? null
              : h('div', { className: 'zp-ed-ft-row' },
                  h('button', { type: 'button', className: 'zp-btn', onClick: function () { requestCloseRef.current(); } }, t('panel.ed.cancel')),
                  h('button', { type: 'button', className: 'zp-btn zp-btn-pri', onClick: function () { props.onSave(draft); } }, t('panel.ed.save'))
                )
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
      // 读取侧截断提示：被丢的主题 id 存在 pref 里，用户点「知道了」才清掉（不自动消失，避免再次静默）。
      const [droppedDismissed, setDroppedDismissed] = useState(false);
      // 屏读播报：切主题 / 改模式后把结果说给辅助技术听（视觉用户看不到这块）。
      const [liveMsg, setLiveMsg] = useState('');
      // 窄屏判定：按**面板自身宽度**（不是视口）。宿主设置栏可能很窄，视口却宽；
      // 反过来把窗口拉窄时宿主又不渲染设置弹层。ResizeObserver 量自己的盒子才准。
      const rootRef = useRef(null);
      useEffect(function () {
        const el = rootRef.current;
        if (!el || typeof ResizeObserver !== 'function') return undefined;
        const mark = function () {
          const w = el.getBoundingClientRect().width;
          if (w > 0 && w < 360) el.setAttribute('data-zr-narrow', '1');
          else el.removeAttribute('data-zr-narrow');
        };
        mark();
        const ro = new ResizeObserver(mark);
        try { ro.observe(el); } catch (e) { return undefined; }
        return function () { try { ro.disconnect(); } catch (e) { /* ignore */ } };
      }, []);
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
          // 新建主题默认「不用底图」。
          // 老数据里的空 source 含义是「跟随全局底图」，那是历史语义，不迁移、不改变观感；
          // 但新主题不该在用户没选过的情况下突然继承一张全局底图。
          bg: { source: 'none' },
        };
        setCreatedId(spec.id);
        set({ customThemes: customs.concat([spec]), theme: spec.id });
        openEditor(spec);
      };
      // 风格预设从编辑器挪到面板后：点一下 = 用这套配方新建一条自定义主题，
      // 随后直接打开编辑器继续微调。预设里的 __mono__ 是下拉里的「等宽」占位，
      // 落进主题前换成真正的等宽族名，否则 applyTokens 会拿到一个不存在的字族。
      const newFromPreset = function (p) {
        if (!p) return;
        if (customs.length >= CUSTOM_MAX) { alert(t('panel.custom.limitErr', { n: CUSTOM_MAX })); return; }
        const base = THEME_IDS.indexOf(pref.theme) !== -1 ? pref.theme : (currentCustom ? currentCustom.base : 'zhuoer');
        const fam = function (v) { return v === '__mono__' ? 'JetBrains Mono' : (v || ''); };
        const spec = {
          id: 'c' + Date.now().toString(36),
          label: t('preset.' + p.id),
          base: base,
          light: Object.assign({}, p.light),
          dark: p.dark ? Object.assign({}, p.dark) : {},
          autoDark: p.autoDark === true,
          radiusScale: p.radius,
          font: { body: fam(p.body), chat: fam(p.chat) },
          bg: { source: 'none' },
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
      // 自定义配色区里的试样用「这套自定义主题在当前明暗下算出来的 token」上色。
      const currentCustomTokens = currentCustom ? buildCustomTokens(currentCustom, scheme) : null;
      const themeDef = THEMES[pref.theme] || {};
      const themeName = themeLabelOf((currentCustom && currentCustom.label) || themeDef.label || pref.theme);
      const accents = accentOptions(effectiveThemeId(pref), scheme, pref.accent);
      const accentNow = pref.accent || accents[0] || '#000000';
      const bgOn = pref.bgSource !== 'none';
      // 底图不透明度有两个来源：全局 pref.bgOpacity 与「自定义主题自带的 bg.opacity」。
      // 后者在 bgCssFor 里**覆盖**前者（specBg.opacity 优先），所以面板滑块必须显示并编辑
      // 真正生效的那个数——否则用户拖了半天没反应，还以为滑块坏了（2026-11-27 实测报障）。
      const specBgOpacity = (currentCustom && currentCustom.bg && typeof currentCustom.bg.opacity === 'number')
        ? currentCustom.bg.opacity : null;
      const shownBgOpacity = specBgOpacity === null ? pref.bgOpacity : specBgOpacity;
      const setBgOpacity = function (v) {
        if (specBgOpacity === null) { set({ bgOpacity: v }); return; }
        const next = (pref.customThemes || []).map(function (c) {
          if (c.id !== currentCustom.id) return c;
          return Object.assign({}, c, { bg: Object.assign({}, c.bg, { opacity: v }) });
        });
        // 同时把全局值跟上：切到别的主题时滑块停在同一个位置，不会突然跳。
        set({ customThemes: next, bgOpacity: v });
      };
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

      return h('div', { className: 'zp-root', ref: rootRef },
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
              // sharp 是全局偏好，编辑器只读它、并把开关结果交回面板写入（别让编辑器直接碰 pref/set）。
              sharp: pref.sharp === true,
              onSharp: function (v) { set({ sharp: v }); },
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
            // 当前主题名前的 3px 书脊取当前主题/强调色的真实值，是一条会随主题变化的细线。
            h('span', { className: 'zp-hd-cur', style: { '--zp-hd-accent': accentNow } }, themeName)
          ),
          h('div', { className: 'zp-hd-m' },
            h('span', null, labelOf(modes(), modeNow)),
            h('span', null, t('panel.header.count', { n: THEME_IDS.length })),
            h('span', { className: 'zp-live' }, t('panel.header.live'))
          )
        ),
        // 视觉隐藏的播报区：只在内容变化时被屏读读出。
        h('div', { className: 'zp-sr', 'aria-live': 'polite', 'aria-atomic': 'true' }, liveMsg),
        (!droppedDismissed && pref.droppedCustomIds && pref.droppedCustomIds.length)
          ? h('div', { className: 'zp-note', role: 'status' },
              t('panel.custom.dropped', { n: pref.droppedCustomIds.length, max: CUSTOM_MAX, ids: pref.droppedCustomIds.join(', ') }),
              h('button', { type: 'button', className: 'zp-btn', onClick: function () { setDroppedDismissed(true); } }, t('panel.custom.droppedClose'))
            )
          : null,

        // 1. 主题库：内置 + 自定义 + 新建，全部用界面试样呈现。
        h(Section, { title: t('panel.theme.title'), note: t('panel.theme.note') },
          h(Row, { label: t('panel.theme.modeRow') },
            h(Pills, { label: t('panel.theme.modeAria'), opts: modes(), value: modeNow,
              onChange: function (v) { syncMode(v); } })
          ),
          h('div', { className: 'zp-ths', role: 'radiogroup', 'aria-label': t('panel.theme.title') },
            THEME_IDS.map(function (id) {
              return h(Swatch, {
                key: id, id: id, def: THEMES[id], scheme: scheme,
                active: pref.theme === id,
                onPick: function (x) { set({ theme: x }); setLiveMsg(t('panel.a11y.live', { label: themeLabelOf((THEMES[x] && THEMES[x].label) || x) })); },
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
                onPick: function (x) { set({ theme: x }); setLiveMsg(t('panel.a11y.live', { label: themeLabelOf((THEMES[x] && THEMES[x].label) || x) })); },
              });
            }),
            h('button', {
              type: 'button', className: 'zp-th zp-th-add', title: t('panel.theme.addTitle'),
              onClick: newCustom,
            },
              h('span', { className: 'zp-th-p-add', 'aria-hidden': 'true' }, '+'),
              h('span', { className: 'zp-th-n' }, h('span', { className: 'zp-th-nm' }, t('panel.theme.addLabel')))
            )
          ),
          h('div', { className: 'zp-cus-acts' },
            h('button', {
              type: 'button', className: 'zp-btn',
              onClick: function () { setEditing(null); setJsonIO({ mode: 'import', text: '' }); },
            }, t('panel.theme.importJson'))
          )
        ),

        // 2. 风格预设：配方签 = 三段色脊（底 / 品牌 / 次色）+ 名称。
        // 选中后生成一套可继续微调的自定义主题，而不是在编辑器深处再放一排按钮。
        h(Section, { title: t('panel.ed.presets'), note: t('panel.presets.note') },
          h('div', { className: 'zp-recipes' },
            STYLE_PRESETS.map(function (p) {
              const light = p.light || {};
              const pv = {};
              if (light['--dsw-alias-bg-base']) pv['--zp-pre-bg'] = light['--dsw-alias-bg-base'];
              if (light['--dsw-alias-brand-primary']) pv['--zp-pre-brand'] = light['--dsw-alias-brand-primary'];
              const accent = light['--dsw-alias-trajectory-accent'] || light['--dsw-alias-brand-primary'];
              if (accent) pv['--zp-pre-accent'] = accent;
              return h('button', {
                key: p.id, type: 'button', className: 'zp-recipe', style: pv,
                title: t('panel.ed.presetTitle', {
                  label: t('preset.' + p.id), radius: p.radius,
                  body: p.body === '__mono__' ? t('panel.ed.mono') : (p.body || ''),
                }),
                onClick: function () { newFromPreset(p); },
              },
                h('span', { className: 'zp-recipe-spine', 'aria-hidden': 'true' }),
                h('span', { className: 'zp-recipe-nm' }, t('preset.' + p.id))
              );
            })
          )
        ),

        // 3. 自定义配色：选中自定义主题时给出「编辑 / 复制 / 导出 / 删除」；
        // 内置主题下只留一个明确的「新建」入口，不把动作按钮悬在半空。
        h(Section, { title: t('panel.custom.title'), note: t('panel.custom.note') },
          currentCustom
            ? h('div', { className: 'zp-cus' },
                h('div', { className: 'zp-cus-hd' },
                  currentCustomTokens
                    ? h(Specimen, { className: 'zp-cus-pv', vars: specimenVars(currentCustomTokens) })
                    : null,
                  h('div', { className: 'zp-cus-info' },
                    h('div', { className: 'zp-cus-nm' }, themeName),
                    h('div', { className: 'zp-cus-note' },
                      t('panel.custom.basedOn', {
                        theme: themeLabelOf((THEMES[currentCustom.base] && THEMES[currentCustom.base].label) || currentCustom.base),
                      }))
                  )
                ),
                h('div', { className: 'zp-cus-acts' },
                  h('button', { type: 'button', className: 'zp-btn zp-btn-pri', onClick: function () { openEditor(currentCustom); } }, t('panel.theme.edit')),
                  h('button', { type: 'button', className: 'zp-btn', onClick: duplicateCustom }, t('panel.theme.duplicate')),
                  h('button', { type: 'button', className: 'zp-btn', onClick: exportCustom }, t('panel.theme.exportJson')),
                  h('button', {
                    type: 'button', className: 'zp-btn' + (deleteArmed ? ' is-armed' : ''), 'data-tone': 'danger',
                    onClick: deleteCustom,
                  }, deleteArmed ? t('panel.theme.deleteConfirm') : t('panel.theme.delete'))
                )
              )
            : h('div', { className: 'zp-cus' },
                h('div', { className: 'zp-hint' }, t('panel.custom.empty')),
                h('div', { className: 'zp-cus-acts' },
                  h('button', { type: 'button', className: 'zp-btn zp-btn-pri', onClick: newCustom }, t('panel.theme.addLabel'))
                )
              )
        ),

        // 4. 全局偏好：一条连续的台账，组内聚、组间用 1px 细线呼吸。
        h(Section, { title: t('panel.prefs.title'), note: t('panel.prefs.note') },
          h(PrefGroup, { title: t('panel.bg.title'), note: t('panel.bg.note') },
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
            h('div', { className: 'zp-grp-b' },
              h(Row, { label: t('panel.bg.styleRow') },
                h(Pills, { label: t('panel.bg.styleAria'), opts: styles(), value: pref.bgStyle,
                  onChange: function (v) { set({ bgStyle: v }); } })
              ),
              h(Row, { label: t('panel.bg.opacityRow') },
                h('input', {
                  type: 'range', className: 'zp-range', min: 0, max: 100,
                  value: shownBgOpacity, 'aria-label': t('panel.bg.opacityAria'),
                  // 已选段长度交给 CSS 渐变：读起来是「填到哪了」，不是一根无信息的灰轨
                  style: { '--zp-pct': (Number(shownBgOpacity) || 0) + '%' },
                  onChange: function (ev) { setBgOpacity(Number(ev.target.value) || 0); },
                }),
                h('span', { className: 'zp-val' }, shownBgOpacity + '%'),
                // 滑块 85% ≠ 实际 85% 不透明度（实现是 可见度 × 0.7）。上限写在旁边而不是塞进
                // 行标签：塞进 4.8em 的标签列会把这一行撑成三行，整块的行高跟着变形。
                h('span', { className: 'zp-hint' }, currentPhotoCap < 0.699
                  ? t('panel.bg.opacityCapCapped', { p: Math.round(currentPhotoCap * 100) })
                  : t('panel.bg.opacityCap'))
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

          h(PrefGroup, { title: t('panel.brand.title'), note: t('panel.brand.note') },
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

          h(PrefGroup, { title: t('panel.type.title'), note: t('panel.type.note') },
            h(Row, { label: t('panel.type.sizeRow') },
              h(Pills, { label: t('panel.type.sizeAria'), opts: scales(), value: pref.fontScale,
                onChange: function (v) { set({ fontScale: v }); } }),
              h('span', { className: 'zp-hint' }, t('panel.type.pxHint', { px: scalePx })),
              // C4：告警接到 B4 的覆盖率判据上。以前只在「一条规则都没读到」时告警，
              // 而表回退（读到一部分、不足 70%）恰恰是最难自己发现的情形：字号滑块有反应，
              // 但界面文字（字面量 px 那些）只跟上了一小半。这种「半生效」必须说出来。
              pref.fontScale !== 100 && HOST_TEXT_STATS
                && (HOST_TEXT_STATS.rules === 0 || HOST_TEXT_STATS.mode !== 'cssom')
                ? h('span', { className: 'zp-hint is-warn' }, t('panel.type.scaleMiss'))
                : null
            ),
            h(Row, { label: t('panel.type.mdRow') },
              h(Pills, {
                label: t('panel.type.mdAria'),
                opts: [['compact', t('panel.type.mdCompact')], ['normal', t('panel.type.mdNormal')], ['roomy', t('panel.type.mdRoomy')]],
                value: pref.mdDensity || 'normal',
                onChange: function (v) { set({ mdDensity: v }); },
              }),
              h('span', { className: 'zp-hint' }, t('panel.type.mdNote'))
            ),
            h(Row, { label: t('panel.type.mdHeadRow') },
              h(Pills, {
                label: t('panel.type.mdHeadAria'),
                opts: [['follow', t('panel.type.mdHeadFollow')], ['soft', t('panel.type.mdHeadSoft')], ['brand', t('panel.type.mdHeadBrand')]],
                value: pref.mdHeading || 'soft',
                onChange: function (v) { set({ mdHeading: v }); },
              }),
              h('span', { className: 'zp-hint' }, t('panel.type.mdHeadNote'))
            ),
            h(Row, { label: t('panel.a11y.procRow') },
              h('label', { className: 'zp-chk' },
                h('input', {
                  type: 'checkbox', checked: pref.procIconColor === true,
                  onChange: function (ev) { set({ procIconColor: Boolean(ev.target.checked) }); },
                }),
                h('span', null, t('panel.a11y.procOn'))
              ),
              h('span', { className: 'zp-hint' }, t('panel.a11y.procNote'))
            ),
            h(Row, { label: t('panel.a11y.hitRow') },
              h('label', { className: 'zp-chk' },
                h('input', {
                  type: 'checkbox', checked: pref.a11yHit === true,
                  onChange: function (ev) { set({ a11yHit: Boolean(ev.target.checked) }); },
                }),
                h('span', null, t('panel.a11y.hitOn'))
              ),
              h('span', { className: 'zp-hint' }, t('panel.a11y.hitNote'))
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

          // Markdown 精细化：标题字号 / 代码块 / 表格 / 引用块。
          // 与上面的「排版节奏」分工：节奏管行距与间距（整体松紧），这里管**元素长相**。
          h(PrefGroup, { title: t('panel.mdfine.title'), note: t('panel.mdfine.note') },
            h(Row, { label: t('panel.mdfine.headRow') },
              h(Pills, {
                label: t('panel.mdfine.headAria'),
                opts: [['theme', t('panel.mdfine.headTheme')], ['compact', t('panel.mdfine.headCompact')], ['clear', t('panel.mdfine.headClear')]],
                value: pref.mdHeadSize || 'theme',
                onChange: function (v) { set({ mdHeadSize: v }); },
              }),
              h('span', { className: 'zp-hint' }, t('panel.mdfine.headNote'))
            ),
            h(Row, { label: t('panel.mdfine.codeRow') },
              h(Pills, {
                label: t('panel.mdfine.codeAria'),
                opts: [['none', t('panel.mdfine.codeNone')], ['line', t('panel.mdfine.codeLine')], ['card', t('panel.mdfine.codeCard')]],
                value: pref.mdCode || 'none',
                onChange: function (v) { set({ mdCode: v }); },
              }),
              h('span', { className: 'zp-hint' }, t('panel.mdfine.codeNote'))
            ),
            h(Row, { label: t('panel.mdfine.tableRow') },
              h(Pills, {
                label: t('panel.mdfine.tableAria'),
                opts: [['plain', t('panel.mdfine.tablePlain')], ['line', t('panel.mdfine.tableLine')], ['zebra', t('panel.mdfine.tableZebra')]],
                value: pref.mdTable || 'plain',
                onChange: function (v) { set({ mdTable: v }); },
              }),
              h('span', { className: 'zp-hint' }, t('panel.mdfine.tableNote'))
            ),
            h(Row, { label: t('panel.mdfine.quoteRow') },
              h(Pills, {
                label: t('panel.mdfine.quoteAria'),
                opts: [['plain', t('panel.mdfine.quotePlain')], ['strong', t('panel.mdfine.quoteStrong')]],
                value: pref.mdQuote || 'plain',
                onChange: function (v) { set({ mdQuote: v }); },
              }),
              h('span', { className: 'zp-hint' }, t('panel.mdfine.quoteNote'))
            )
          ),

          h(PrefGroup, { title: t('panel.accent.title'), note: t('panel.accent.note') },
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

          h(PrefGroup, { title: t('panel.qn.title'), note: t('panel.qn.note') },
            h(Row, { label: t('panel.qn.row') },
              h(Pills, {
                label: t('panel.qn.aria'),
                value: pref.quicknav || 'three',
                opts: [['three', t('panel.qn.optThree')], ['all', t('panel.qn.optAll')], ['off', t('panel.qn.optOff')]],
                onChange: function (v) { set({ quicknav: v }); },
              })
            )
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
        // 对话内的主题卡片：模型在聊天里生成主题后，卡片渲染色板并提供「应用」。
        // 与面板里的 AI 生成并存——面板那条路保持原样，这里只是多一个入口。
        try { registerThemeCard(ctx); } catch (e) { /* 卡片注册失败不影响皮肤 */ }
        // 捕获宿主主题服务（明暗三态的唯一真源）。
        // 订阅必须走 subscribeHostChange()：按偏好值去重 + 只注册一次 + 异步合并，
        // 否则会被 overrideTokens 回灌的 theme/change 拖进死循环（见该函数注释）。
        try { hostThemeApi = (ctx && ctx.theme) || hostThemeApi; } catch (e) { /* ignore */ }
        try { themeRef = hostThemeApi; } catch (e) { /* ignore */ }
        subscribeHostChange(ctx);
        // 全局 error 监听走 effect：卸载/HMR 时回收，不再泄漏到下一个实例（doctor K3）。
        try {
          if (typeof ctx.effect === 'function') {
            ctx.effect(function () {
              window.addEventListener('error', onWindowError);
              return function () { try { window.removeEventListener('error', onWindowError); } catch (e) { /* ignore */ } };
            }, 'zhuoer-theme: window error listener');
          }
        } catch (e) { /* ignore */ }
        // 延迟探针：等消息渲染完成后再扫「亮底」元素（内联 code 白底）。
        // 它会对全 DOM 逐元素 getComputedStyle，生产里纯属开销，只在 debug 下挂。
        if (zrDebug()) lateProbeTimer = setTimeout(function () {
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
