    // ---------- 风格预设 ----------
    // 每套 = 7 个浅色锚点 + 圆角档 + 字体，有的再带一套深色锚点。
    // 为什么不是"只有颜色"：风格差异主要靠圆角与字体撑起来（直角+等宽=终端感，
    // 大圆角+无衬线=玻璃感），只换配色的话十几个风格会看起来像同一个主题。
    // 浅色系用 autoDark 反推深色；深色系（赛博/极光/开发者/深空）自带 dark 表，
    // 因为它们的美感就在"深底"，反推成浅色就没了。
    // #region presets
    const STYLE_PRESETS = [
      { id: 'glass', label: '玻璃拟态', radius: 2, body: 'DM Sans', chat: '', autoDark: true,
        light: { '--dsw-alias-bg-base': '#eef4fa', '--dsw-alias-label-primary': '#1a2b3c',
          '--dsw-alias-border-l1': '#cfdded', '--dsw-alias-brand-primary': '#4a7fd4',
          '--dsw-alias-trajectory-accent': '#8b6cd9', '--dsw-alias-state-error-primary': '#d93a45',
          '--dsw-alias-state-warn-primary': '#c47d16' } },
      { id: 'brutal', label: '新粗野主义', radius: 0, body: 'Space Grotesk', chat: '', autoDark: true,
        light: { '--dsw-alias-bg-base': '#fff8e7', '--dsw-alias-label-primary': '#0a0a0a',
          '--dsw-alias-border-l1': '#0a0a0a', '--dsw-alias-brand-primary': '#ff3d00',
          '--dsw-alias-trajectory-accent': '#0055ff', '--dsw-alias-state-error-primary': '#c00000',
          '--dsw-alias-state-warn-primary': '#8a4b00' } },
      { id: 'swiss', label: '瑞士国际', radius: 0, body: 'IBM Plex Sans', chat: '', autoDark: true,
        light: { '--dsw-alias-bg-base': '#f5f5f5', '--dsw-alias-label-primary': '#1a1a1a',
          '--dsw-alias-border-l1': '#d0d0d0', '--dsw-alias-brand-primary': '#e30613',
          '--dsw-alias-trajectory-accent': '#1a1a1a', '--dsw-alias-state-error-primary': '#e30613',
          '--dsw-alias-state-warn-primary': '#a36a00' } },
      { id: 'editorial', label: '编辑排版', radius: 1, body: 'Lora', chat: '', autoDark: true,
        light: { '--dsw-alias-bg-base': '#faf7f0', '--dsw-alias-label-primary': '#1a1614',
          '--dsw-alias-border-l1': '#e0d8c8', '--dsw-alias-brand-primary': '#8b1a1a',
          '--dsw-alias-trajectory-accent': '#2a2a2a', '--dsw-alias-state-error-primary': '#a52a2a',
          '--dsw-alias-state-warn-primary': '#8a5a00' } },
      { id: 'luxe', label: '奢华极简', radius: 1, body: 'Fraunces', chat: '', autoDark: true,
        light: { '--dsw-alias-bg-base': '#f7f4ef', '--dsw-alias-label-primary': '#1c1a17',
          '--dsw-alias-border-l1': '#ddd6c8', '--dsw-alias-brand-primary': '#a8894a',
          '--dsw-alias-trajectory-accent': '#2a2620', '--dsw-alias-state-error-primary': '#9e2b25',
          '--dsw-alias-state-warn-primary': '#8a6510' } },
      { id: 'organic', label: '有机自然', radius: 2, body: 'Atkinson Hyperlegible Next', chat: '', autoDark: true,
        light: { '--dsw-alias-bg-base': '#f2efe6', '--dsw-alias-label-primary': '#2a2f24',
          '--dsw-alias-border-l1': '#d5d0be', '--dsw-alias-brand-primary': '#5a7247',
          '--dsw-alias-trajectory-accent': '#b8956a', '--dsw-alias-state-error-primary': '#a83a2a',
          '--dsw-alias-state-warn-primary': '#9a6a10' } },
      { id: 'morandi', label: '莫兰迪柔和', radius: 2, body: 'DM Sans', chat: '', autoDark: true,
        light: { '--dsw-alias-bg-base': '#eeeae8', '--dsw-alias-label-primary': '#3a3532',
          '--dsw-alias-border-l1': '#d6cfc9', '--dsw-alias-brand-primary': '#a67c7c',
          '--dsw-alias-trajectory-accent': '#7d8a7a', '--dsw-alias-state-error-primary': '#a5564f',
          '--dsw-alias-state-warn-primary': '#9c7a3a' } },
      { id: 'paper', label: '纸张灰白', radius: 1, body: 'Geist', chat: '', autoDark: true,
        light: { '--dsw-alias-bg-base': '#f4f3f0', '--dsw-alias-label-primary': '#22211f',
          '--dsw-alias-border-l1': '#dcdad4', '--dsw-alias-brand-primary': '#4a5568',
          '--dsw-alias-trajectory-accent': '#718096', '--dsw-alias-state-error-primary': '#b03a2e',
          '--dsw-alias-state-warn-primary': '#946a1a' } },
      // ---- 深色系：自带 dark 表，autoDark 关闭 ----
      { id: 'cyber', label: '赛博终端', radius: 0, body: '__mono__', chat: '__mono__', autoDark: false,
        light: { '--dsw-alias-bg-base': '#f0fff4', '--dsw-alias-label-primary': '#0a1a0e',
          '--dsw-alias-border-l1': '#b8ddc0', '--dsw-alias-brand-primary': '#00853a',
          '--dsw-alias-trajectory-accent': '#0066b8', '--dsw-alias-state-error-primary': '#c02626',
          '--dsw-alias-state-warn-primary': '#8a6a00' },
        dark: { '--dsw-alias-bg-base': '#070b08', '--dsw-alias-label-primary': '#7dff9b',
          '--dsw-alias-border-l1': '#1d3a24', '--dsw-alias-brand-primary': '#00ff41',
          '--dsw-alias-trajectory-accent': '#00c8ff', '--dsw-alias-state-error-primary': '#ff4d4d',
          '--dsw-alias-state-warn-primary': '#ffcc00' } },
      { id: 'aurora', label: '极光界面', radius: 2, body: 'Geist', chat: '', autoDark: false,
        light: { '--dsw-alias-bg-base': '#f0f2fb', '--dsw-alias-label-primary': '#1b2140',
          '--dsw-alias-border-l1': '#ccd3ee', '--dsw-alias-brand-primary': '#6a4ce0',
          '--dsw-alias-trajectory-accent': '#0e9aa8', '--dsw-alias-state-error-primary': '#c0392b',
          '--dsw-alias-state-warn-primary': '#a07000' },
        dark: { '--dsw-alias-bg-base': '#0b1020', '--dsw-alias-label-primary': '#e8eaf6',
          '--dsw-alias-border-l1': '#2a3350', '--dsw-alias-brand-primary': '#7c5cff',
          '--dsw-alias-trajectory-accent': '#22d3ee', '--dsw-alias-state-error-primary': '#ff6b6b',
          '--dsw-alias-state-warn-primary': '#f0b429' } },
      { id: 'devterm', label: '开发者终端', radius: 0, body: '__mono__', chat: '__mono__', autoDark: false,
        light: { '--dsw-alias-bg-base': '#f6f6f6', '--dsw-alias-label-primary': '#252526',
          '--dsw-alias-border-l1': '#d4d4d4', '--dsw-alias-brand-primary': '#8a5a00',
          '--dsw-alias-trajectory-accent': '#00727a', '--dsw-alias-state-error-primary': '#a12a2a',
          '--dsw-alias-state-warn-primary': '#8a6a00' },
        dark: { '--dsw-alias-bg-base': '#1e1e1e', '--dsw-alias-label-primary': '#d4d4d4',
          '--dsw-alias-border-l1': '#3a3a3a', '--dsw-alias-brand-primary': '#e6a432',
          '--dsw-alias-trajectory-accent': '#4ec9b0', '--dsw-alias-state-error-primary': '#f48771',
          '--dsw-alias-state-warn-primary': '#dcdcaa' } },
      { id: 'deepspace', label: '深空黑', radius: 1, body: 'Geist', chat: '', autoDark: false,
        light: { '--dsw-alias-bg-base': '#f4f4f6', '--dsw-alias-label-primary': '#1a1a1e',
          '--dsw-alias-border-l1': '#d8d8de', '--dsw-alias-brand-primary': '#2f6ad9',
          '--dsw-alias-trajectory-accent': '#8040c0', '--dsw-alias-state-error-primary': '#c02b2b',
          '--dsw-alias-state-warn-primary': '#96700a' },
        dark: { '--dsw-alias-bg-base': '#0a0a0c', '--dsw-alias-label-primary': '#e6e6e8',
          '--dsw-alias-border-l1': '#242428', '--dsw-alias-brand-primary': '#5b8def',
          '--dsw-alias-trajectory-accent': '#a855f7', '--dsw-alias-state-error-primary': '#f0616d',
          '--dsw-alias-state-warn-primary': '#e0a030' } },
    ];
    // #endregion presets

    // 把模型返回的文本解析成主题：剥掉可能的 markdown 围栏，只收 ANCHOR_GROUPS 里
    // 真实存在的 anchor 与 #rrggbb 色值。模型编出来的 key 一律丢弃并记录在 dropped。
    // 提到模块级是因为编辑器和设置面板都要用（原来只在 SkinSettings 里）。
    // AI 建议主题名：清洗成可直接落进「名称」输入框的短标签。
    // 模型偶尔会带引号/书名号/序号/结尾标点，或者干脆不给 label；
    // 不给时退回用户描述的前 12 个字，仍比「自定义 3」有信息量。
    function cleanAiLabel(label, prompt) {
      const strip = function (s) {
        return String(s == null ? '' : s)
          .replace(/[\r\n\t]+/g, ' ')
          .trim()
          .replace(/^[「『“‘"'（(\[]+/, '')
          .replace(/[」』”’"'）)\]]+$/, '')
          .replace(/^\d+[.、)．]\s*/, '')
          .replace(/[，。；;,.!！?？:：]+$/, '')
          .trim();
      };
      const given = strip(label);
      if (given) return Array.from(given).slice(0, 12).join('');
      const fromPrompt = strip(prompt);
      return fromPrompt ? Array.from(fromPrompt).slice(0, 12).join('') : '';
    }

    function extractAiTheme(raw) {
      if (!raw || typeof raw !== 'string') return null;
      let s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      const start = s.indexOf('{');
      const end = s.lastIndexOf('}');
      if (start < 0 || end <= start) return null;
      let obj = null;
      try { obj = JSON.parse(s.slice(start, end + 1)); } catch (e) { return null; }
      if (!obj || typeof obj !== 'object') return null;
      const allowed = {};
      ANCHOR_GROUPS.forEach(function (g) { allowed[g.anchor] = true; });
      const light = {};
      const src = obj.light && typeof obj.light === 'object' ? obj.light : {};
      Object.keys(src).forEach(function (k) {
        if (!allowed[k]) return;
        const v = src[k];
        if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim())) light[k] = v.trim().toLowerCase();
      });
      if (Object.keys(light).length < 4) return null;
      const font = obj.font && typeof obj.font === 'object' ? obj.font : {};
      return {
        label: typeof obj.label === 'string' && obj.label.trim() ? obj.label.trim().slice(0, 24) : 'AI 主题',
        light: light,
        font: { body: typeof font.body === 'string' ? font.body : '', chat: typeof font.chat === 'string' ? font.chat : '' },
        radiusScale: typeof obj.radiusScale === 'number' ? Math.max(0, Math.min(3, obj.radiusScale)) : 1,
        dropped: Object.keys(src).filter(function (k) { return !light[k]; }),
      };
    }

    function tokensFor(themeId, scheme) {
      const t = THEMES[themeId] || THEMES[THEME_IDS[0]] || {};
      return (t && (t[scheme] || t.dark)) || {};
    }

    // ---------- 自定义主题 ----------
    // 用户只调「锚点」：每组一个色，组内其余 token 按与原锚点的 RGB 差值平移。
    // 用相对偏移而不是按比例，是为了保留底主题的层次关系 —— beacon 的层色是
    // 纯黑 +8、zhuoer 的是 +5，换底色时各自平移，不会糊成一片。
    // mode: 'shift' 平移差值 / 'same' 直接取锚点值（品牌色那类必须同色）
    const ANCHOR_GROUPS = [
      {
        key: 'bg', label: '底色', anchor: '--dsw-alias-bg-base',
        // 覆盖所有「跟着底色走」的内容层。刻意不含 toast/tooltip/bg-mask：
        // 它们在浅色主题里是刻意的反色/遮罩，跟着平移会失去对比。
        members: [
          ['--dsw-alias-bg-layer-1', 'shift'], ['--dsw-alias-bg-layer-2', 'shift'],
          ['--dsw-alias-bg-layer-3', 'shift'], ['--dsw-alias-bg-layer-4', 'shift'],
          ['--dsw-alias-bg-overlay', 'shift'], ['--dsw-alias-bg-skeleton', 'shift'],
          ['--dsw-alias-bg-module-platform', 'shift'],
          ['--dsw-alias-card-fill', 'shift'], ['--dsw-alias-card-tile-fill', 'shift'],
          ['--dsw-alias-settings-card-fill', 'shift'], ['--dsw-alias-onboarding-card-fill', 'shift'],
          ['--dsw-alias-markdown-code-block', 'shift'], ['--dsw-alias-markdown-code-block-banner', 'shift'],
          ['--dsw-alias-markdown-inline-code', 'shift'], ['--dsw-alias-menu-group-header-fill', 'shift'],
          ['--dsw-alias-interactive-bg-hover', 'shift'], ['--dsw-alias-interactive-bg-active', 'shift'],
          ['--dsw-alias-turn-trigger-bg', 'shift'], ['--dsw-alias-turn-trigger-bg-hover', 'shift'],
          ['--dsw-alias-scrollbar-bg-l1', 'shift'], ['--dsw-alias-scrollbar-bg-l2', 'shift'],
          // --dsw-specific-* 与 --dsw-hovercard/menu 是 DSH 自己的层色，同样是「跟着底色走」的：
          // 用户气泡、输入框、选择器、侧栏导航项、菜单表面、悬停卡。
          // 注意不含 --dsw-specific-sidebar-fill：它是 applyTokens 里现算的，纳入会被覆盖。
          ['--dsw-specific-bubble', 'shift'], ['--dsw-specific-input-major', 'shift'],
          ['--dsw-specific-selector', 'shift'], ['--dsw-specific-tip', 'shift'],
          ['--dsw-specific-menu', 'shift'], ['--dsw-specific-sidebar-nav-item-active', 'shift'],
          ['--dsw-menu-surface-fill', 'shift'],
          // 按钮的「表面类」：浮起/工具条/幽灵态，本质是比底色亮一档的面，跟着底色走。
          // 不含 button-contrast-fill（它是刻意的反色按钮）与 tool-bar-fill-invisible（比底色还深的隐藏态）。
          ['--dsw-alias-button-elevated-fill', 'shift'],
          ['--dsw-alias-button-floating-fill', 'shift'], ['--dsw-alias-button-floating-hover', 'shift'],
          ['--dsw-alias-button-ghost-active-fill', 'shift'], ['--dsw-alias-button-ghost-active-hover', 'shift'],
          ['--dsw-alias-button-ghost-active-border', 'shift'],
          ['--dsw-alias-button-tool-bar-fill', 'shift'], ['--dsw-alias-button-tool-bar-hover', 'shift'],
          // markdown 的行内块/引用/tag 底：都是"比底色亮一档"的面
          ['--dsw-alias-markdown-placeholder', 'shift'], ['--dsw-alias-markdown-citation', 'shift'],
          ['--dsw-alias-markdown-tag', 'shift'], ['--dsw-alias-tooltip-bg', 'shift'],
          // —— 补齐：themes.mjs 后派生出的 27 个 token 里「跟着底色走」的那批 ——
          // 关键坑：界面真正消费的正文卡读的是 --dsw-alias-hovercard-bg（带 alias），
          // 不带 alias 的 --dsw-hovercard-bg 在宿主里已经彻底不存在（扫 app.asar: defs=0 uses=0）。
          // 就会出现「变量已经变蓝、悬停卡还是暖米色」的错位（实测踩过）。两个都要进组。
          ['--dsw-alias-hovercard-bg', 'shift'],
          ['--dsw-alias-card-fill-hover', 'shift'],
          ['--dsw-alias-bg-document-preview', 'shift'], ['--dsw-alias-bg-multi-select', 'shift'],
          ['--dsw-alias-bg-document-selection', 'shift'],
          ['--dsw-alias-illustration-surface', 'shift'], ['--dsw-alias-illustration-backing', 'shift'],
          ['--dsw-alias-illustration-background', 'shift'], ['--dsw-alias-illustration-inset', 'shift'],
          ['--dsw-alias-onboarding-secondary-fill', 'shift'],
          ['--dsw-alias-tooltip-key-bg', 'shift'], ['--dsw-alias-json-tree-hover', 'shift'],
          ['--dsw-alias-interactive-bg-hover-solid', 'shift'],
          ['--dsw-alias-markdown-code-segment-selected', 'shift'],
          ['--dsw-alias-markdown-code-segment-unselected', 'shift'],
          ['--dsw-alias-scrollbar-hover-l1', 'shift'], ['--dsw-alias-scrollbar-hover-l2', 'shift'],
          ['--dsw-alias-switch-thumb', 'shift'],
          ['--dsw-specific-bubble-highlight', 'shift'],
          ['--dsw-specific-file-upload-track', 'shift'], ['--dsw-specific-guide-hero', 'shift'],
          ['--dsw-specific-login-input', 'shift'],
          ['--dsw-specific-sidebar-glass-fill', 'shift'], ['--dsw-specific-sidebar-glass-hover', 'shift'],
          ['--dsw-specific-sidebar-glass-collapsed-fill', 'shift'],
          ['--dsw-specific-sidebar-glass-collapsed-hover', 'shift'],
          ['--dsw-specific-sidebar-tint', 'shift'],
          ['--dsw-specific-sidebar-wash-top', 'shift'], ['--dsw-specific-sidebar-wash-top-clear', 'shift'],
          ['--dsw-specific-sidebar-wash-bottom', 'shift'], ['--dsw-specific-sidebar-wash-bottom-clear', 'shift'],
          // 遮罩层：不再豁免。明度锁死在 2%–10%，只借底色的色相与低饱和，
          // 这样弹窗外的幕布与面板同属一个色系，又仍然压得住内容。
          ['--dsw-alias-bg-mask-1', 'veil'], ['--dsw-alias-bg-mask-2', 'veil'],
          ['--dsw-alias-bg-mask-3', 'veil'], ['--dsw-alias-bg-mask-photo', 'veil'],
          ['--dsw-alias-bg-mask-drop', 'veil'],
          // 自带语义色的「浅色块」（diff 增删、危险/强调悬停）：它们必须还是红/绿，
          // 不能被底色染成蓝 —— 所以走 tint（保自己的 H/S，只搬底色的明度差），不走 shift。
          ['--dsw-alias-interactive-bg-hover-accent', 'tint'],
          ['--dsw-alias-interactive-bg-hover-danger', 'tint'],
          ['--dsw-alias-file-diff-added-bg', 'tint'], ['--dsw-alias-file-diff-deleted-bg', 'tint'],
          ['--dsw-alias-code-diff-added', 'tint'], ['--dsw-alias-code-diff-deleted', 'tint'],
          ['--dsw-alias-file-diff-added-gutter', 'tint'], ['--dsw-alias-file-diff-deleted-gutter', 'tint'],
          ['--dsw-alias-file-diff-added-marker', 'tint'], ['--dsw-alias-file-diff-deleted-marker', 'tint'],
        ],
      },
      {
        key: 'text', label: '文字', anchor: '--dsw-alias-label-primary',
        members: [
          ['--dsw-alias-label-secondary', 'shift'], ['--dsw-alias-label-tertiary', 'shift'],
          // label 家族实际是 primary/secondary/tertiary/caption/dimmed（没有 quaternary）
          ['--dsw-alias-label-caption', 'shift'], ['--dsw-alias-label-dimmed', 'shift'],
          ['--dsw-alias-label-primary-dimmed', 'shift'],
          // 反色按钮：深底上是浅按钮，跟正文色同向
          ['--dsw-alias-button-contrast-fill', 'shift'],
          // 这些文字 token 前缀不是 --dsw-alias-label-*，但 base 主题里它们的值就等于
          // label-primary/secondary/tertiary，本质是同一套文字层级，必须一起跟。
          // 注意前缀：hovercard 的文字是 --dsw-alias-hovercard-label-*（带 alias），
          // 而 hovercard 的底只有 --dsw-alias-hovercard-bg（带 alias）。
          // 旧版 DSH 那个不带 alias 的 --dsw-hovercard-bg 在当前安装的 app.asar 里已经不存在了
          // （scripts/token-surface.mjs 扫过：defs=0 uses=0），所以别再往那个名字上写。
          ['--dsw-alias-hovercard-label-primary', 'shift'], ['--dsw-alias-hovercard-label-secondary', 'shift'],
          ['--dsw-alias-hovercard-label-tertiary', 'shift'],
          ['--dsw-alias-toast-label', 'shift'], ['--dsw-alias-menu-icon', 'shift'],
          // 「深度求索中」这类运行态文字：DSH 在 .running 上把 label-shimmer 指向
          // label-deep-diving-shimmer，而这两个 token 的值精确等于 label-tertiary。
          // 不纳入的话，改文字色时它们保持 base 值，那块文字就不跟随。
          ['--dsw-alias-label-shimmer', 'shift'], ['--dsw-alias-label-deep-diving-shimmer', 'shift'],
          // —— 补齐：本质是次级/三级文字、但前缀不是 label-* 的那些 ——
          ['--dsw-alias-label-document-preview', 'shift'], ['--dsw-alias-label-deep-diving', 'shift'],
          ['--dsw-alias-label-primary-bluish', 'shift'],
          ['--dsw-alias-chart-tools', 'shift'], ['--dsw-alias-chart-messages', 'shift'],
          ['--dsw-alias-state-idle-primary', 'shift'],
          ['--dsw-alias-illustration-detail', 'shift'],
          ['--dsw-alias-json-tree-property', 'shift'], ['--dsw-alias-json-tree-punctuation', 'shift'],
          ['--dsw-alias-json-tree-icon', 'shift'],
        ],
      },
      {
        key: 'border', label: '边框', anchor: '--dsw-alias-border-l1',
        members: [
          ['--dsw-alias-border-l2', 'shift'], ['--dsw-alias-border-l3', 'shift'],
          ['--dsw-alias-border-l4', 'shift'], ['--dsw-alias-border-selected', 'shift'],
          // —— 补齐：card 描边、反色边框、暗色细边、插画投影 ——
          ['--dsw-alias-border-inverted', 'shift'], ['--dsw-alias-border-inverted2', 'shift'],
          ['--dsw-alias-settings-card-stroke', 'shift'],
          ['--dsw-alias-onboarding-checkbox-border', 'shift'],
          ['--dsw-alias-border-l2-darkmode-thin', 'shift'],
          ['--dsw-alias-illustration-shadow', 'shift'],
        ],
      },
      {
        key: 'brand', label: '品牌主色', anchor: '--dsw-alias-brand-primary',
        members: [
          ['--dsw-alias-button-primary-fill', 'same'], ['--dsw-alias-button-primary-hover', 'same'],
          ['--dsw-alias-button-info-fill', 'same'], ['--dsw-alias-button-info-hover', 'same'],
          ['--dsw-alias-brand-text', 'same'], ['--dsw-alias-brand-primary-invert', 'same'],
          // 品牌色的暗版（禁用/次要按钮底）按差值跟随品牌色，不做 same（同色会丢掉"暗一档"的层次）
          ['--dsw-alias-button-primary-dimmed', 'shift'],
          // —— 补齐：链接、chart 主序列、json 键值、toast 动作、侧栏强调 ——
          ['--dsw-alias-link', 'same'], ['--dsw-alias-toast-action', 'same'],
          ['--dsw-alias-chart-system', 'same'],
          ['--dsw-alias-json-tree-number', 'same'], ['--dsw-alias-json-tree-keyword', 'same'],
          ['--dsw-specific-sidebar-nav-item-active-accent', 'same'],
          // 这个 key 名是原始抽取里就带着重复后缀的（--dsw-alias-brand-primary-new-color
          // + primary-new-color）。查不到 DSH 侧的真名，就按原样保留，只让它跟品牌色走；
          // 它的值在所有主题里都精确等于 brand-primary，所以 same 是安全的。
          ['--dsw-alias-brand-primary-new-colorprimary-new-color', 'same'],
          ['--dsw-specific-sidebar-right-flash', 'shift'],
        ],
      },
      {
        // 次色：轨迹强调、引导强调、业务态。分开是为了「主色做按钮、次色做点缀」。
        key: 'brand2', label: '品牌次色', anchor: '--dsw-alias-trajectory-accent',
        members: [
          ['--dsw-alias-onboarding-accent', 'same'],
          ['--dsw-alias-state-business-primary', 'same'],
          ['--dsw-alias-state-business-tertiary', 'shift'],
        ],
      },
      {
        key: 'danger', label: '危险', anchor: '--dsw-alias-state-error-primary',
        members: [
          ['--dsw-alias-label-error', 'same'],
          // 危险态的浅色表层：保留红，只跟底色搬明度（shift 会把它染成底色色相）
          ['--dsw-alias-state-error-secondary', 'tint'],
          ['--dsw-alias-hovercard-state-error', 'tint'],
        ],
      },
      {
        key: 'warn', label: '警告', anchor: '--dsw-alias-state-warn-primary',
        members: [['--dsw-alias-state-warn-label', 'same'], ['--dsw-alias-state-warn-secondary', 'same'],
                  ['--dsw-alias-state-warn-tertiary', 'shift']],
      },
      {
        // 成功/完成：所有 base 主题里这一族都是同一个绿 #3fb950，所以单列一组。
        // 成员用 same（同色不偏移）——它们是同一个语义色的不同落点，不需要层次差。
        key: 'success', label: '成功', anchor: '--dsw-alias-state-success-primary',
        members: [
          ['--dsw-alias-state-success-secondary', 'same'],
          ['--dsw-alias-state-success-tertiary', 'same'],
          ['--dsw-alias-state-done-primary', 'same'],
          ['--dsw-alias-hovercard-state-done', 'same'],
          ['--dsw-alias-json-tree-string', 'same'],
        ],
      },
    ];

    // shift 旧实现是 RGB 逐通道加 delta：base 是暖色、锚点调成紫时，
    // 只要差值不大，平移后的成员仍然是暖的——切主题后弹出层/悬停色带着
    // 上一套的色相，看起来就像"复制了上一主题"。
    // 改成：亮度继承 base 成员的相对层次（成员 vs base 锚点的 L 差），
    // 色相与饱和度跟随新锚点。这样层次还在，色相一定跟着走。
    // 0.7.0 曾试过把这里换成 OKLCH（想修「提亮锚点时文字跌破 AA」），实测**否掉了**：
    // 全量前后对照 1181 个 token 变化，text 族修好 12 条 AA 却**造成 7 条倒退**
    // （beacon/light 5.02 → 3.82，不是临界而是明显破线）。用 12 换 7 不划算，
    // 且 ΔE 最大 30.8（border-selected 由红变黄），风险远大于收益。
    // 真正的原因是这些文字 token **没进 TEXT_FLOOR**，见下面的地板表扩展——那才是对准的修法。
    function shiftMember(memberHex, baseAnchorHex, newAnchorHex) {
      const m = hexHsl(memberHex);
      const ba = hexHsl(baseAnchorHex);
      const na = hexHsl(newAnchorHex);
      if (!m || !ba || !na) return memberHex;
      const dL = m[2] - ba[2];
      const l = Math.max(0.02, Math.min(0.98, na[2] + dL));
      // 饱和度保底取两者较大值，避免原本有色的成员被拉成灰
      const s = Math.min(1, Math.max(na[1] * 0.9, m[1]));
      return hslHex(na[0], s, l);
    }

    // tint：成员保留自己的色相与饱和度，只把「底色锚点的明度变化量」搬过去。
    // 语义色表层（diff 的绿/红、危险悬停的红）必须走这条：shift 会把色相换成锚点的，
    // 底色一改成蓝，diff 的新增行就跟着变蓝，读起来像「加了一行但看不出是绿的」。
    function tintMember(memberHex, baseAnchorHex, newAnchorHex) {
      const m = hexHsl(memberHex);
      const ba = hexHsl(baseAnchorHex);
      const na = hexHsl(newAnchorHex);
      if (!m || !ba || !na) return memberHex;
      const l = Math.max(0.02, Math.min(0.98, m[2] + (na[2] - ba[2])));
      return hslHex(m[0], m[1], l);
    }

    // 遮罩：功能上必须还是「暗幕」，但色相要跟底色走。
    // 否则暖色面板会压在一层冷黑幕上——实测「莫兰迪暖灰」深色：面板 #2b2522、幕外 #0b0d11，
    // 两者对比 1.29，视觉上像弹窗悬在另一个界面里。
    function veilMember(memberHex, baseAnchorHex, newAnchorHex) {
      const m = hexHsl(memberHex);
      const na = hexHsl(newAnchorHex);
      if (!m || !na) return memberHex;
      // 明度仍然锁在极暗（遮罩要能压住内容），只把色相/低饱和借过来。
      // 第一版把明度锁在 2%–10%、饱和度砍到 0.35，结果 #0b0d11 → #0f0e0d：
      // 数值上「跟了」，屏幕上仍是近黑 —— 对一个本就低饱和的暖灰主题等于没动。
      // 现在保证两件事：① 比底色暗一档但不贴黑（0.06–0.12）；② 饱和度兜底加一档，
      // 让幕布读起来是「同一色系的暗面」，而不是中性黑。
      const l = Math.max(0.06, Math.min(0.12, m[2]));
      const s = Math.min(0.5, Math.max(na[1] * 3, na[1] + 0.15));
      return hslHex(na[0], s, l);
    }
    // 一组锚点落到目标表上：锚点直写，成员按各自 mode 派生。
    // 锚点没变（用户没调这一组，或反推值恰好等于原值）时整组跳过 —— 保证
    // 「不调就与 base 逐字节相同」这条身份性质对新增成员也成立，
    // 也避免 hexHsl/hslHex 往返取整把 base 的值改掉 1 个色阶。
    function applyGroup(out, g, oldHex, nwHex) {
      out[g.anchor] = nwHex;
      if (!oldHex || String(oldHex).toLowerCase() === String(nwHex).toLowerCase()) return;
      g.members.forEach(function (pair) {
        const key = pair[0];
        const cur = out[key];
        if (!cur) return;
        if (pair[1] === 'same') { out[key] = nwHex; return; }
        if (pair[1] === 'tint') { out[key] = tintMember(cur, oldHex, nwHex); return; }
        if (pair[1] === 'veil') { out[key] = veilMember(cur, oldHex, nwHex); return; }
        out[key] = shiftMember(cur, oldHex, nwHex);
      });
    }

    // 反 L：保持色相与饱和度，把明度取反（浅底→深底、深字→浅字）。
    // 夹在 3%~97%，避免纯黑/纯白把层次压死。
    function flipLightness(hex) {
      const hsl = hexHsl(hex);
      if (!hsl) return hex;
      const l = Math.min(0.97, Math.max(0.03, 1 - hsl[2]));
      return hslHex(hsl[0], hsl[1], l);
    }

    // 底色的专用反推：只压缩、不贴底。
    // 底色和文字的需求相反——文字必须真正翻到对面才读得清；
    // 而浅底 L=0.93 用 1-L 会落到 0.07（近纯黑），照片的蓝调全没。
    // 这里把落点压进 [0.11, 0.22]，深色仍有色相与层次。
    function flipBgLightness(hex) {
      const hsl = hexHsl(hex);
      if (!hsl) return hex;
      const raw = Math.max(0, Math.min(1, 1 - hsl[2]));
      const l = 0.11 + raw * 0.11;
      return hslHex(hsl[0], hsl[1], l);
    }

    // 彩色底上的文字该用黑还是白：按 WCAG 相对亮度挑对比度更高的一侧。
    // 为什么需要它：--dsw-alias-label-primary-foreground / label-on-color 在宿主里是恒白或恒黑的，
    // 而强调色、风格预设、自定义主题都会改按钮底色（实测 cyber 预设深色下白字 on #00ff41 只有 1.37:1）。
    function pickOnColor(fillHex) {
      const L = zrHexLum(fillHex);
      if (L === null) return '#ffffff';
      const onWhite = 1.05 / (L + 0.05);
      const onInk = (L + 0.05) / 0.05;
      return onWhite >= onInk ? '#ffffff' : '#0b0b0c';
    }
    // 彩色底上的文字兜底：现值读不清（<4.5:1）就换成黑白里更稳的一侧。
    // 内置主题本来达标 → 幂等不改；预设/自定义/强调色路径靠它收口。
    function ensureReadableOn(out) {
      const fill = out['--dsw-alias-button-primary-fill'] || out['--dsw-alias-brand-primary'];
      if (!fill) return out;
      ['--dsw-alias-label-primary-foreground', '--dsw-alias-label-on-color'].forEach(function (k) {
        const cur = out[k];
        // 对比度认不出时（颜色非法）不当作 0 也不当作达标：统一走 null 判据。
        const ratio = zrContrast(fill, cur);
        if (cur && ratio !== null && ratio >= 4.5) return;
        out[k] = pickOnColor(fill);
      });
      return out;
    }

    // ---- 层次地板 / 文字对比地板 / 少量覆盖 ----
    // shiftMember 只保证「成员与锚点的明度差不变」。base 深色主题的层间差本来只有 2%，
    // 把底色提亮成暖灰后，这 2% 在屏幕上就没了（实测 header 块与页面底同为 #211d1b）。
    // 所以深色方案额外铺一条不含糊的阶梯。
    const DEPTH_LADDER = [
      // 第一版用 2.5/5/7.5/10%，实测 layer-1 对比只有 1.07——因为 zhuoer 深色底色本来就
      // 只有 0.117 的 HSL 明度，2.5% 落在一个色阶内，屏幕上等于没变。
      // 现在按「肉眼能分开」定档：4/8/12/16%（HSL 明度），并同步抬高卡片/菜单/代码块。
      ['--dsw-alias-bg-layer-1', 0.04], ['--dsw-alias-bg-layer-2', 0.08],
      ['--dsw-alias-bg-layer-3', 0.12], ['--dsw-alias-bg-layer-4', 0.16],
      ['--dsw-alias-card-fill', 0.055], ['--dsw-alias-settings-card-fill', 0.055],
      ['--dsw-alias-card-tile-fill', 0.05], ['--dsw-alias-hovercard-bg', 0.09],
      ['--dsw-specific-menu', 0.08], ['--dsw-menu-surface-fill', 0.08],
      ['--dsw-alias-markdown-code-block', 0.08],
    ];
    function enforceDepth(out, scheme, on) {
      if (!on || scheme !== 'dark') return out;
      const bg = hexHsl(out['--dsw-alias-bg-base']);
      if (!bg) return out;
      DEPTH_LADDER.forEach(function (pair) {
        const cur = hexHsl(out[pair[0]]);
        if (!cur) return;
        const target = Math.min(0.62, bg[2] + pair[1]);
        if (cur[2] >= target) return;
        out[pair[0]] = hslHex(cur[0], cur[1], target);
      });
      return out;
    }

    // 文字对比地板：shiftMember 把「锚点相对 base 的下移量」原样传给 secondary/tertiary，
    // 用户给的 primary 比 base 暗时整条文字阶梯一起沉到底色附近——
    // 实测第三方面板正文 2.33:1、标题 3.08:1、KPI 2.53:1，而 ensureReadableOn 只管彩底文字。
    const TEXT_FLOOR = [
      ['--dsw-alias-label-primary', 7],
      ['--dsw-alias-label-secondary', 6],
      ['--dsw-alias-label-tertiary', 4.5],
      ['--dsw-alias-label-caption', 4.5],
      ['--dsw-alias-label-dimmed', 4],
      ['--dsw-alias-label-primary-dimmed', 6],
      ['--dsw-alias-hovercard-label-secondary', 6],
      ['--dsw-alias-hovercard-label-tertiary', 4.5],
      ['--dsw-alias-toast-label', 6],
      ['--dsw-alias-menu-icon', 4.5],
      ['--dsw-alias-chart-tools', 4.5], ['--dsw-alias-chart-messages', 4.5],
      // 0.6.45 补：这些也是**渲染成文字**的键，但以前没进地板表。
      // 实测（全量前后对照）beacon/light 的 json-tree-*、state-idle-primary、label-shimmer、
      // label-deep-diving* 会被派生压到 3.82:1——用户只要提亮一次正文锚点就破 AA。
      // 注意：text 分组里还有边框/插画/按钮填充，那些**不是文字**，刻意不进来。
      ['--dsw-alias-hovercard-label-primary', 6],
      ['--dsw-alias-label-primary-bluish', 6],
      ['--dsw-alias-label-shimmer', 4.5],
      ['--dsw-alias-label-deep-diving', 4.5],
      ['--dsw-alias-label-deep-diving-shimmer', 4.5],
      ['--dsw-alias-label-document-preview', 4.5],
      ['--dsw-alias-state-idle-primary', 4.5],
      ['--dsw-alias-json-tree-property', 4.5],
      ['--dsw-alias-json-tree-punctuation', 4.5],
      ['--dsw-alias-json-tree-icon', 4.5],
    ];
    function relLumOf(hex) {
      const rgb = parseHexColor(hex);
      if (!rgb) return null;
      const ch = rgb.map(function (v) {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    }
    function contrastOn(a, b) {
      const la = relLumOf(a), lb = relLumOf(b);
      if (la === null || lb === null) return 0;
      const hi = Math.max(la, lb), lo = Math.min(la, lb);
      return (hi + 0.05) / (lo + 0.05);
    }
    // APCA Lc：作为 WCAG 比值之外的**副指标**（借 dsh-theme-palette 的实现）。
    // 为什么要有它：WCAG 比值在深色面上「达标」不等于「看得清」——
    // 同一对颜色在 4.6:1 时，亮色面上可能 Lc 只有 50 出头。
    // 本函数只用于**展示与观察**，不做门槛（门槛仍由 WCAG 地板负责）。
    // 返回 **Lc 本身**（亮底黑字为正、暗底浅字为负），精度 0.01 Lc。
    // 例：87.24 = 正文可读度良好；-66.04 = 暗底上的浅字；绝对值越大越清楚。
    function apcaContrast(fgHex, bgHex) {
      const TRC = 2.4, R = 0.2126729, G = 0.7151522, B = 0.072175;
      const NORM_BG = 0.56, NORM_TXT = 0.57, REV_TXT = 0.62, REV_BG = 0.65;
      const BLK_THRS = 0.022, BLK_CLMP = 1.414, SCALE = 1.14;
      const LO_OFF = 0.027, LO_CLIP = 0.1, DELTA_Y_MIN = 0.0005;
      const yOf = function (hex) {
        const rgb = parseHexColor(hex);
        if (!rgb) return null;
        const trc = rgb.map(function (v) { return Math.pow(v / 255, TRC); });
        return R * trc[0] + G * trc[1] + B * trc[2];
      };
      let txt = yOf(fgHex), bg = yOf(bgHex);
      if (txt === null || bg === null) return 0;
      txt = txt > BLK_THRS ? txt : txt + Math.pow(BLK_THRS - txt, BLK_CLMP);
      bg = bg > BLK_THRS ? bg : bg + Math.pow(BLK_THRS - bg, BLK_CLMP);
      if (Math.abs(bg - txt) < DELTA_Y_MIN) return 0;
      let out;
      if (bg > txt) {
        out = (Math.pow(bg, NORM_BG) - Math.pow(txt, NORM_TXT)) * SCALE;
        out = out < LO_CLIP ? 0 : out - LO_OFF;
      } else {
        out = (Math.pow(bg, REV_BG) - Math.pow(txt, REV_TXT)) * SCALE;
        out = out > -LO_CLIP ? 0 : out + LO_OFF;
      };
      // Lc = out × 100；保留 0.01 Lc 精度（直接 round(out×100) 会把每个 Lc 取整）。
      return Math.round(out * 10000) / 100;
    }
    // 文字地板：把「够不够读」拆成两步——先选**真正会承载文字的面**，再求最小改动量。
    // 旧实现有两个短板（palette 那边用更好的做法，这里借过来）：
    //   ① 只看 bg-base；文字同样会落在 layer-2 / hovercard 上，那些面没校验；
    //   ② 明度按 1% 步进试到够为止，结果不可预测（同一色可能被推过好几阶）。
    // 现在改成：候选面 = 底色 + 明度相近的抬升层（|ΔL| ≤ 0.15，避免把「深底 + 浅卡」这类
    // 跨明暗组合混进来破坏单调性），目标是**所有候选面**都达标；求解用二分（18 次）找最小 ΔL。
    function floorSurfaces(out, bgH) {
      const list = [out['--dsw-alias-bg-base']];
      ['--dsw-alias-bg-layer-2', '--dsw-alias-hovercard-bg', '--dsw-alias-card-fill'].forEach(function (k) {
        const h = hexHsl(out[k]);
        if (!h) return;
        if (Math.abs(h[2] - bgH[2]) <= 0.15) list.push(out[k]);
      });
      return list;
    }
    function solveFloor(cur, surfaces, target, darkBg) {
      const hsl = hexHsl(cur);
      if (!hsl) return '';
      const worst = function (hex) {
        let w = Infinity;
        surfaces.forEach(function (s) { const c = contrastOn(hex, s); if (c < w) w = c; });
        return w;
      };
      if (worst(cur) >= target) return cur;
      // 单调性：往远离底色的方向走，对比度只增不减
      const limit = darkBg ? 1 : 0;
      let lo = 0;
      let hi = Math.abs(limit - hsl[2]);
      for (let i = 0; i < 18; i++) {
        const mid = (lo + hi) / 2;
        const l = darkBg ? Math.min(1, hsl[2] + mid) : Math.max(0, hsl[2] - mid);
        if (worst(hslHex(hsl[0], hsl[1], l)) >= target) hi = mid; else lo = mid;
      }
      const lHit = darkBg ? Math.min(1, hsl[2] + hi) : Math.max(0, hsl[2] - hi);
      const hit = hslHex(hsl[0], hsl[1], lHit);
      return worst(hit) >= target ? hit : hslHex(hsl[0], hsl[1], limit);
    }
    function enforceTextFloor(out, on, skip) {
      if (!on) return out;
      const bg = out['--dsw-alias-bg-base'];
      const bgH = hexHsl(bg);
      if (!bg || !bgH) return out;
      const darkBg = bgH[2] < 0.5;
      const surfaces = floorSurfaces(out, bgH);
      TEXT_FLOOR.forEach(function (pair) {
        if (skip && skip[pair[0]]) return;   // 用户显式覆盖过的文字键不再被地板改
        const cur = out[pair[0]];
        if (!cur) return;
        let w = Infinity;
        surfaces.forEach(function (s) { const c = contrastOn(cur, s); if (c < w) w = c; });
        if (w >= pair[1]) return;
        const solved = solveFloor(cur, surfaces, pair[1], darkBg);
        if (solved) out[pair[0]] = solved;
      });
      return out;
    }

    // 少量覆盖：允许直接指定**非锚点** alias token（侧栏、卡片面、代码块底等），
    // 在派生与地板之后写入 —— 显式指定优先于派生。锚点本身不走这里（它们走 applyGroup），
    // 避免出现「锚点说一套、覆盖说另一套」。
    // 覆盖报告：最近一次派生里覆盖键的去向（卡片用它显示「改了几键、几键被回退」）
    let zrOverrideReport = { applied: [], softened: [], weak: [] };
    function overrideReport() { return zrOverrideReport; }
    // 前景文字 token 集合：只有它们受「覆盖值对比度」约束。
    // 底色/卡片面/遮罩/代码块底本来就是低对比的背景层，一并约束会被误判回退。
    const TEXT_TOKEN_SET = (function () {
      const set = {};
      ANCHOR_GROUPS.forEach(function (g) {
        if (g.key !== 'text') return;
        set[g.anchor] = true;
        (g.members || []).forEach(function (m) { set[m[0]] = true; });
      });
      return set;
    })();

    // 少量覆盖：允许直接指定**非锚点** alias token（侧栏、卡片面、代码块底等），
    // 在派生与地板之后写入 —— 显式指定优先于派生。锚点本身不走这里（它们走 applyGroup），
    // 避免出现「锚点说一套、覆盖说另一套」。
    // B 档对比度约束：覆盖落在**前景文字** token 上时，与底色之比 <3.0 → 回退到派生值
    // （记入 softened）；3.0–4.5 → 保留但记入 weak。覆盖主要来自 AI 生成与 JSON 导入
    // （编辑器只给 8 组锚点），这里兜住「AI 给了个几乎看不见的正文色」这类最坏情况。
    function applyOverrides(out, table) {
      zrOverrideReport = { applied: [], softened: [], weak: [] };
      if (!table || typeof table !== 'object') return out;
      const anchorSet = {};
      ANCHOR_GROUPS.forEach(function (g) { anchorSet[g.anchor] = true; });
      const refBg = out['--dsw-alias-bg-base'];
      Object.keys(table).forEach(function (k) {
        if (anchorSet[k]) return;
        if (!/^--dsw-(alias|specific)-[a-z0-9-]+$/.test(k)) return;
        if (!/^#[0-9a-fA-F]{6}$/.test(String(table[k]))) return;
        const next = String(table[k]);
        if (TEXT_TOKEN_SET[k]) {
          const r = contrastOn(next, refBg);
          if (r !== null && r < 3.0) {
            zrOverrideReport.softened.push({ token: k, tried: next, kept: out[k], ratio: Math.round(r * 100) / 100 });
            return;
          }
          if (r !== null && r < 4.5) zrOverrideReport.weak.push({ token: k, ratio: Math.round(r * 100) / 100 });
        }
        out[k] = next;
        zrOverrideReport.applied.push(k);
      });
      return out;
    }
    // 只存锚点，其余从 base 主题克隆后派生
    function buildCustomTokens(spec, scheme) {
      // 只调浅色时，深色由浅色整表反推：底色/文字/边框三组反明度，
      // 品牌与语义色保持浅色那套（反了会红变青、品牌色认不出来）。
      if (scheme === 'dark' && spec && spec.autoDark) {
        // 骨架用 base 主题的 dark：它本身就是一套正确的深色，
        // toast / tooltip / 按钮 / diff / chart 这些没被锚点覆盖的 token 都在里面。
        // 之前拿 light 整表反推，未覆盖的 token 还是浅色，界面上一堆亮块。
        const origDark = tokensFor(spec.base, 'dark');
        const out = Object.assign({}, origDark);
        const light = buildCustomTokens(Object.assign({}, spec, { autoDark: false }), 'light');
        // 只把「用户在浅色里实际调出来的锚点」反推成深色锚点，再按 base dark 的组内关系平移。
        ANCHOR_GROUPS.forEach(function (g) {
          const lightVal = light[g.anchor];
          if (!lightVal) return;
          // 底色用压缩反推（不贴纯黑），其余组用标准 1-L（文字要真的翻到对面）
          const nwHex = g.key === 'bg' ? flipBgLightness(lightVal) : flipLightness(lightVal);
          const oldHex = out[g.anchor];
          const old = parseHexColor(oldHex);
          const nw = parseHexColor(nwHex);
          if (!old || !nw) { out[g.anchor] = nwHex; return; }
          applyGroup(out, g, oldHex, nwHex);
        });
        // 反推之后，用户在深色里手调过的锚点优先（只覆盖那一组，其余继续反推）。
        // 这样面板显示的就是「反推值」，改了就变成「你的值」，撤销又回到反推。
        const darkOver = (spec && spec.dark) || {};
        ANCHOR_GROUPS.forEach(function (g) {
          const nwHex = darkOver[g.anchor];
          if (!nwHex) return;
          const nw = parseHexColor(nwHex);
          if (!nw) return;
          const oldHex2 = out[g.anchor];
          applyGroup(out, g, oldHex2, nwHex);
        });
        // 与浅色分支同样：只在底色/文字锚点被动过时才铺地板，避免改掉没调锚点的主题。
        const touchBg = String(out['--dsw-alias-bg-base']).toLowerCase() !== String(origDark['--dsw-alias-bg-base']).toLowerCase();
        const touchText = String(out['--dsw-alias-label-primary']).toLowerCase() !== String(origDark['--dsw-alias-label-primary']).toLowerCase();
        // 顺序：派生 → 深度 → 覆盖 → 地板。地板最后跑，才看得见覆盖后的面。
        // 跳过集合只收「真正写入生效」的覆盖键：被 B 档回退掉的键不算用户意图，
        // 必须交回地板管——否则会留下一个 2.7:1 的次级文字（第一次就踩了）。
        const darkOut = applyOverrides(enforceDepth(ensureReadableOn(out), 'dark', touchBg), darkOver);
        const darkSkip = {};
        zrOverrideReport.applied.forEach(function (k) { darkSkip[k] = true; });
        return enforceTextFloor(darkOut, touchText, darkSkip);
      }
      // 先留一份 base 原值：地板要不要跑，取决于锚点**值**是否真的变了，
      // 而不是「锚点键存在」。否则把原值写回去时地板仍会动手，等于悄悄改主题。
      const orig = tokensFor(spec.base, scheme);
      const base = Object.assign({}, orig);
      const anchors = (spec && spec[scheme]) || {};
      ANCHOR_GROUPS.forEach(function (g) {
        const nwHex = anchors[g.anchor];
        if (!nwHex) return;
        const nw = parseHexColor(nwHex);
        if (!nw) return;
        const oldHex3 = base[g.anchor];
        applyGroup(base, g, oldHex3, nwHex);
      });
      const touchBg2 = String(base['--dsw-alias-bg-base']).toLowerCase() !== String(orig['--dsw-alias-bg-base']).toLowerCase();
      const touchText2 = String(base['--dsw-alias-label-primary']).toLowerCase() !== String(orig['--dsw-alias-label-primary']).toLowerCase();
      const lightOut = applyOverrides(enforceDepth(ensureReadableOn(base), scheme, touchBg2), anchors);
      const lightSkip = {};
      zrOverrideReport.applied.forEach(function (k) { lightSkip[k] = true; });
      return enforceTextFloor(lightOut, touchText2, lightSkip);
    }

    // #endregion derive
    // 一条自定义主题的合法化：id/label/base 都收紧，锚点只接受 alias token + 6 位 hex
    function sanitizeCustomSpec(v) {
      if (!v || typeof v !== 'object') return null;
      if (typeof v.id !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(v.id)) return null;
      if (THEME_IDS.indexOf(v.id) !== -1) return null;
      const pick = function (o) {
        const out = {};
        if (o && typeof o === 'object') {
          Object.keys(o).forEach(function (k) {
            // 允许 alias 与 specific 两类：少量覆盖要靠 --dsw-specific-*（气泡/输入框/侧栏）
            // 才能真正改到「面」，只认 alias 时这些键会被静默丢弃。
            if (/^--dsw-(alias|specific)-[a-z0-9-]+$/.test(k) && /^#[0-9a-fA-F]{6}$/.test(String(o[k]))) out[k] = String(o[k]);
          });
        }
        return out;
      };
      const font = v.font && typeof v.font === 'object' ? v.font : {};
      return {
        id: v.id,
        label: typeof v.label === 'string' && v.label.trim() ? v.label.trim().slice(0, 24) : v.id,
        base: THEME_IDS.indexOf(v.base) !== -1 ? v.base : 'zhuoer',
        dark: pick(v.dark),
        light: pick(v.light),
        // 字体按主题存（空 = 跟随 base 主题的字体）
        font: {
          body: typeof font.body === 'string' ? font.body.slice(0, 80) : '',
          chat: typeof font.chat === 'string' ? font.chat.slice(0, 80) : '',
        },
        // 圆角缩放：1 = 跟随 base，0 = 全直角，2 = 双倍
        radiusScale: typeof v.radiusScale === 'number' && v.radiusScale >= 0 && v.radiusScale <= 3
          ? Math.round(v.radiusScale * 100) / 100 : 1,
        // 只调浅色、深色自动反推
        autoDark: v.autoDark === true,
        // 主题自带底图：source 为空 = 跟随全局；image 时只存 IDB 引用键，不存 dataURL
        bg: (function () {
          const b = v.bg && typeof v.bg === 'object' ? v.bg : {};
          return {
            source: b.source === 'image' || b.source === 'theme' || b.source === 'none' ? b.source : '',
            key: typeof b.key === 'string' && /^img_[a-z0-9]{4,32}$/.test(b.key) ? b.key : '',
            keyLight: typeof b.keyLight === 'string' && /^img_[a-z0-9]{4,32}$/.test(b.keyLight) ? b.keyLight : '',
            kind: b.kind === 'photo' ? 'photo' : (b.kind === 'texture' ? 'texture' : ''),
            opacity: typeof b.opacity === 'number' && b.opacity >= 0 && b.opacity <= 100 ? Math.round(b.opacity) : null,
            style: b.style === 'full' || b.style === 'fade' ? b.style : '',
          };
        })(),
      };
    }

    function customSpec(pref) {
      const list = (pref && pref.customThemes) || [];
      for (let i = 0; i < list.length; i++) if (list[i].id === pref.theme) return list[i];
      return null;
    }
    // 自定义主题的 SHAPES / FONTS / 底图都按它克隆的 base 查
    function effectiveThemeId(pref) {
      const c = customSpec(pref);
      return c ? c.base : pref.theme;
    }
    function tokensForPref(pref, scheme) {
      const c = customSpec(pref);
      return c ? buildCustomTokens(c, scheme) : tokensFor(pref.theme, scheme);
    }

    const listeners = new Set();
    function emitChange() { listeners.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } }); }

