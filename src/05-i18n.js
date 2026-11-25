    /* ================= 多语言真源（i18n） =================
     * 为什么单独一片：右侧栏轨道在 makeQuicknavModule 的闭包里、设置面板在 factory 层，
     * 两处都要取词。词典若留在其中一边，另一边就取不到 —— 0.6.x 之前只有轨道有 zh/en，
     * 面板 200 多条中文只能硬编码，根因就是位置错了。
     *
     * 规则（与 30-quicknav 里的原有行为一致，不要改）：
     *   - 只有宿主语言以 zh 开头才算中文，其余（en / en-US / 将来新增的 ja、es）一律英文；
     *   - 缺键回落到英文，再回落键名本身（开发期一眼看出漏翻）；
     *   - 占位符只支持 {name} 形式，一次替换，不做 ICU / 复数。
     */
    const I18N = {
      zh: {
        // 右侧栏轨道（宿主侧已按 rail.* 注册过本地化，键名不可改）
        'rail.ariaLabel': '右侧栏快捷导航',
        'rail.anchorLabel': '快捷导航锚点',
        'rail.empty': '右侧栏还没有可直达的标签页',
        'rail.noService': '当前宿主没有右侧栏服务，无法直达',
        'rail.openFailed': '打开失败：该标签当前不可用',

        // 设置面板 · 品牌位（P1 试点）
        'panel.brand.title': '品牌位',
        'panel.brand.note': '左上角 deepseek HARNESS 徽标；关闭时用宿主原生',
        'panel.brand.toggle': '启用',
        'panel.brand.toggleHint': '用自定义图片替换',
        'panel.brand.builtinHint': '用主题自带 logo（选图则用你的）',
        'panel.brand.imageRow': '图片',
        'panel.brand.pick': '选择图片…',
        'panel.brand.repick': '更换图片…',
        'panel.brand.previewAlt': '当前品牌位预览',
        'panel.brand.remove': '移除',
        'panel.brand.autoHint': '不选图 = 用主题自带 logo；上传则压到最长边 512px',
        'panel.brand.replacedHint': '已替换。宿主若升级改动徽标结构，这里会静默回退到原生。',

        // 设置面板 · 外观头部 + 配色主题
        'panel.header.title': '外观',
        'panel.header.count': '共 {n} 套配色',
        'panel.header.live': '改动即时生效',
        'panel.theme.title': '配色主题',
        'panel.theme.note': '选中即应用，深浅模式决定取哪一套 token',
        'panel.theme.modeRow': '模式',
        'panel.theme.modeAria': '明暗模式',
        'panel.theme.optLight': '浅色',
        'panel.theme.optDark': '深色',
        'panel.theme.optAuto': '跟随系统',
        'panel.theme.addTitle': '新建自定义主题（克隆当前主题）',
        'panel.theme.addLabel': '新建主题',
        'panel.theme.edit': '编辑配色',
        'panel.theme.duplicate': '复制',
        'panel.theme.exportJson': '导出 JSON',
        'panel.theme.delete': '删除',
        'panel.theme.importJson': '导入 JSON',

        // 设置面板 · 背景底图
        'panel.bg.title': '背景底图',
        'panel.bg.note': '只铺主栏，左栏与输入框保持主题实色',
        'panel.bg.sourceRow': '来源',
        'panel.bg.sourceAria': '底图来源',
        'panel.bg.optNone': '无',
        'panel.bg.optTheme': '主题底图',
        'panel.bg.optImage': '自定义图片',
        'panel.bg.imageRow': '图片',
        'panel.bg.pick': '选择图片…',
        'panel.bg.previewAlt': '当前底图预览',
        'panel.bg.remove': '移除',
        'panel.bg.formatHint': 'JPEG / PNG / WebP · 最大 8 MiB',
        'panel.bg.styleRow': '样式',
        'panel.bg.styleAria': '底图样式',
        'panel.bg.optFade': '淡化',
        'panel.bg.optFull': '全幅',
        'panel.bg.opacityRow': '可见度',
        'panel.bg.opacityAria': '底图可见度',
        'panel.bg.showRow': '显示',
        'panel.bg.showEmpty': '新建会话页',
        'panel.bg.showSession': '会话中',
        'panel.bg.offHint': '当前未启用底图，以上样式会在选中来源后生效。',
        // 设置面板 · 下拉 / 编辑器（P1c 批次一）
        'panel.section.title': 'Zhuoer 主题',
        'panel.sel.follow': '跟随主题',
        'panel.sel.current': '{value}（当前）',
        'panel.ed.pickerAria': '{label} 取色器',
        'panel.ed.hexAria': '{label} 十六进制色值',
        'panel.ed.low': ' 偏低',
        'panel.ed.resetAria': '恢复{label}为克隆主题的值',
        'panel.ed.resetTitleDirty': '恢复为克隆主题的值',
        'panel.ed.resetTitleClean': '当前就是克隆主题的值',
        'panel.ed.dialogAria': '自定义主题编辑器',
        'panel.ed.title': '编辑配色',
        'panel.ed.closeAria': '关闭编辑器',
        'panel.ed.closeTitle': '关闭（有未保存改动会先确认）',
        'panel.ed.secAppearance': '外观',
        'panel.ed.clonedFrom': '克隆自 {theme}，其余 token 按差值派生',
        'panel.ed.name': '名称',
        'panel.ed.nameAria': '主题名称',
        'panel.ed.dark': '深色',
        'panel.ed.autoDark': '由浅色自动反推（底色/文字/边框反明度，品牌与语义色沿用）',
        'panel.ed.editRow': '编辑',
        'panel.ed.schemeAria': '编辑明暗',
        'panel.ed.light': '浅色',
        'panel.ed.anchors': '配色锚点',
        'panel.ed.anchorsNote': '改这里，右侧真实界面实时跟着变；只有「保存」才落盘',
        'panel.ed.confirmDiscard': '有未保存改动，确定放弃？',
        'panel.ed.dirtyHint': '有未保存改动',
        'panel.ed.keepEditing': '继续编辑',
        'panel.ed.cancel': '取消',
        'panel.ed.discard': '放弃改动',
        'panel.ed.save': '保存',
        'panel.ai.failed': '生成失败',
        'panel.ai.badJson': '模型没返回可解析的主题 JSON，换个说法再试',
        'panel.palette.noColors': '这张图没取到可用颜色',
        'panel.palette.failed': '取色失败',
        'panel.palette.notEnough': '色值不足以分配锚点',
        'panel.ed.presets': '风格预设',
        'panel.ed.presetsNote': '整套替换：锚点、圆角、字体一起换',
        'panel.ed.presetTitle': '{label} · 直角/圆角 {radius} · {body}',
        'panel.ed.mono': '等宽',
        'panel.ed.aiSection': 'AI 与取色',
        'panel.ed.aiNote': '生成结果先预览，点「填入」才改草稿',
        'panel.ed.aiRow': 'AI 生成',
        'panel.ed.aiPromptAria': '风格描述',
        'panel.ed.aiPromptPh': '描述风格，例如：复古终端，灰底，黄色主色蓝色次色，等宽字体，直角边框',
        'panel.ed.generating': '生成中…',
        'panel.ed.generate': '生成',
        'panel.ed.aiPreview': '「{label}」',
        'panel.ed.aiDropped': '（丢弃 {n} 个不认识的 key）',
        'panel.ed.applyCurrent': '填入当前主题',
        'panel.ed.drop': '丢弃',
        'panel.ed.pickFromImage': '从图片取色',
        'panel.ed.picking': '取色中…',
        'panel.ed.pickImage': '选择图片…',
        'panel.ed.clear': '清除',
        'panel.ed.bgSection': '底图',
        'panel.ed.bgNote': '单张 ≤ 3 MiB，存本机 IndexedDB',
        'panel.ed.bgSourceAria': '主题底图来源',
        'panel.ed.bgFollowGlobal': '跟随全局',
        'panel.ed.bgThemeOwn': '主题自带',
        'panel.ed.bgCustom': '自定义图片',
        'panel.ed.bgNone': '无',
        'panel.ed.imageRow': '图片',
        'panel.ed.bgPreviewAlt': '主题底图预览',
        'panel.ed.bgStoredHint': '存 IndexedDB，单张 ≤ 3 MiB',
        'panel.ed.opacityRow': '可见度',
        'panel.ed.bgOpacityAria': '主题底图可见度',
        'panel.ed.shapeSection': '形状与字体',
        'panel.ed.shapeNote': '只影响本主题，不动其他主题',
        'panel.ed.radiusRow': '圆角',
        'panel.ed.radiusAria': '圆角大小',
        'panel.ed.radiusSquare': '直角',
        'panel.ed.radiusSmall': '小',
        'panel.ed.radiusNormal': '标准',
        'panel.ed.radiusLarge': '大',
        'panel.ed.radiusXL': '特大',
        'panel.ed.bodyFont': '正文字体',
        'panel.ed.chatFont': '聊天字体',
        'panel.ed.followBase': '跟随 {theme}',
      },
      en: {
        'rail.ariaLabel': 'Right sidebar quick nav',
        'rail.anchorLabel': 'Quick nav anchor',
        'rail.empty': 'No right-sidebar tabs to jump to',
        'rail.noService': 'This host has no right-sidebar service',
        'rail.openFailed': 'Could not open that tab',

        // Settings panel · brand slot (P1 pilot)
        'panel.brand.title': 'Brand slot',
        'panel.brand.note': 'The deepseek HARNESS badge in the top-left; off means the host default',
        'panel.brand.toggle': 'Enable',
        'panel.brand.toggleHint': 'Replace it with your own image',
        'panel.brand.builtinHint': 'Using the built-in logo (pick an image to override)',
        'panel.brand.imageRow': 'Image',
        'panel.brand.pick': 'Choose image…',
        'panel.brand.repick': 'Change image…',
        'panel.brand.previewAlt': 'Current brand image preview',
        'panel.brand.remove': 'Remove',
        'panel.brand.autoHint': 'No image = built-in logo; uploads are downscaled to 512px max edge',
        'panel.brand.replacedHint': 'Replaced. If a host upgrade changes the badge structure, this silently falls back to native.',

        // Settings panel · appearance header + color theme
        'panel.header.title': 'Appearance',
        'panel.header.count': '{n} palettes',
        'panel.header.live': 'Changes apply instantly',
        'panel.theme.title': 'Color theme',
        'panel.theme.note': 'Picking applies immediately; light/dark decides which token set is used',
        'panel.theme.modeRow': 'Mode',
        'panel.theme.modeAria': 'Color mode',
        'panel.theme.optLight': 'Light',
        'panel.theme.optDark': 'Dark',
        'panel.theme.optAuto': 'Follow system',
        'panel.theme.addTitle': 'Create a custom theme (cloned from the current one)',
        'panel.theme.addLabel': 'New theme',
        'panel.theme.edit': 'Edit colors',
        'panel.theme.duplicate': 'Duplicate',
        'panel.theme.exportJson': 'Export JSON',
        'panel.theme.delete': 'Delete',
        'panel.theme.importJson': 'Import JSON',

        // Settings panel · background image
        'panel.bg.title': 'Background image',
        'panel.bg.note': 'Only the main column; sidebar and composer keep the theme solid color',
        'panel.bg.sourceRow': 'Source',
        'panel.bg.sourceAria': 'Background source',
        'panel.bg.optNone': 'None',
        'panel.bg.optTheme': 'Theme texture',
        'panel.bg.optImage': 'Custom image',
        'panel.bg.imageRow': 'Image',
        'panel.bg.pick': 'Choose image…',
        'panel.bg.previewAlt': 'Current background preview',
        'panel.bg.remove': 'Remove',
        'panel.bg.formatHint': 'JPEG / PNG / WebP · up to 8 MiB',
        'panel.bg.styleRow': 'Style',
        'panel.bg.styleAria': 'Background style',
        'panel.bg.optFade': 'Faded',
        'panel.bg.optFull': 'Full bleed',
        'panel.bg.opacityRow': 'Visibility',
        'panel.bg.opacityAria': 'Background visibility',
        'panel.bg.showRow': 'Show on',
        'panel.bg.showEmpty': 'New session page',
        'panel.bg.showSession': 'In session',
        'panel.bg.offHint': 'Background is off; these styles apply once you pick a source.',
        // Settings panel · select / editor (P1c batch 1)
        'panel.section.title': 'Zhuoer theme',
        'panel.sel.follow': 'Follow theme',
        'panel.sel.current': '{value} (current)',
        'panel.ed.pickerAria': '{label} color picker',
        'panel.ed.hexAria': '{label} hex value',
        'panel.ed.low': ' low',
        'panel.ed.resetAria': 'Reset {label} to the cloned theme value',
        'panel.ed.resetTitleDirty': 'Reset to the cloned theme value',
        'panel.ed.resetTitleClean': 'Already the cloned theme value',
        'panel.ed.dialogAria': 'Custom theme editor',
        'panel.ed.title': 'Edit colors',
        'panel.ed.closeAria': 'Close editor',
        'panel.ed.closeTitle': 'Close (unsaved changes are confirmed first)',
        'panel.ed.secAppearance': 'Appearance',
        'panel.ed.clonedFrom': 'Cloned from {theme}; other tokens are derived by delta',
        'panel.ed.name': 'Name',
        'panel.ed.nameAria': 'Theme name',
        'panel.ed.dark': 'Dark',
        'panel.ed.autoDark': 'Derived from the light scheme (background/text/border inverted; brand and semantic colors kept)',
        'panel.ed.editRow': 'Edit',
        'panel.ed.schemeAria': 'Editing scheme',
        'panel.ed.light': 'Light',
        'panel.ed.anchors': 'Color anchors',
        'panel.ed.anchorsNote': 'Edits preview on the live UI on the right; nothing is persisted until Save',
        'panel.ed.confirmDiscard': 'Unsaved changes — discard them?',
        'panel.ed.dirtyHint': 'Unsaved changes',
        'panel.ed.keepEditing': 'Keep editing',
        'panel.ed.cancel': 'Cancel',
        'panel.ed.discard': 'Discard changes',
        'panel.ed.save': 'Save',
        'panel.ai.failed': 'Generation failed',
        'panel.ai.badJson': 'The model did not return parsable theme JSON — try rephrasing',
        'panel.palette.noColors': 'No usable colors found in this image',
        'panel.palette.failed': 'Color extraction failed',
        'panel.palette.notEnough': 'Not enough colors to assign anchors',
        'panel.ed.presets': 'Style presets',
        'panel.ed.presetsNote': 'Replaces everything: anchors, radii and fonts at once',
        'panel.ed.presetTitle': '{label} · radius {radius} · {body}',
        'panel.ed.mono': 'monospace',
        'panel.ed.aiSection': 'AI & color picking',
        'panel.ed.aiNote': 'Results are previewed first; only Apply touches the draft',
        'panel.ed.aiRow': 'AI generation',
        'panel.ed.aiPromptAria': 'Style description',
        'panel.ed.aiPromptPh': 'Describe the style, e.g. retro terminal, grey background, yellow primary, blue secondary, monospace, square corners',
        'panel.ed.generating': 'Generating…',
        'panel.ed.generate': 'Generate',
        'panel.ed.aiPreview': '“{label}”',
        'panel.ed.aiDropped': ' ({n} unknown keys dropped)',
        'panel.ed.applyCurrent': 'Apply to current theme',
        'panel.ed.drop': 'Discard',
        'panel.ed.pickFromImage': 'Pick colors from image',
        'panel.ed.picking': 'Extracting…',
        'panel.ed.pickImage': 'Choose image…',
        'panel.ed.clear': 'Clear',
        'panel.ed.bgSection': 'Background image',
        'panel.ed.bgNote': 'One image ≤ 3 MiB, stored in local IndexedDB',
        'panel.ed.bgSourceAria': 'Theme background source',
        'panel.ed.bgFollowGlobal': 'Follow global',
        'panel.ed.bgThemeOwn': 'Theme built-in',
        'panel.ed.bgCustom': 'Custom image',
        'panel.ed.bgNone': 'None',
        'panel.ed.imageRow': 'Image',
        'panel.ed.bgPreviewAlt': 'Theme background preview',
        'panel.ed.bgStoredHint': 'Stored in IndexedDB, ≤ 3 MiB per image',
        'panel.ed.opacityRow': 'Visibility',
        'panel.ed.bgOpacityAria': 'Theme background visibility',
        'panel.ed.shapeSection': 'Shape & fonts',
        'panel.ed.shapeNote': 'Affects this theme only',
        'panel.ed.radiusRow': 'Corner radius',
        'panel.ed.radiusAria': 'Corner radius size',
        'panel.ed.radiusSquare': 'Square',
        'panel.ed.radiusSmall': 'Small',
        'panel.ed.radiusNormal': 'Normal',
        'panel.ed.radiusLarge': 'Large',
        'panel.ed.radiusXL': 'Extra large',
        'panel.ed.bodyFont': 'Body font',
        'panel.ed.chatFont': 'Chat font',
        'panel.ed.followBase': 'Follow {theme}',
      },
    }

    /** 当前界面语言（模块级，面板与轨道共用）。 */
    let ZR_LANG = (function () {
      try {
        const l = typeof navigator !== 'undefined' && navigator.language ? String(navigator.language).toLowerCase() : ''
        return l.indexOf('zh') === 0 ? 'zh' : 'en'
      } catch (e) {
        return 'en'
      }
    })()

    /** 取当前语言。 */
    function zrLang() {
      return ZR_LANG
    }

    /** 设当前语言（非 zh 一律记 en）。语言变化的重渲染由调用方负责。 */
    function zrSetLang(next) {
      ZR_LANG = next === 'zh' ? 'zh' : 'en'
    }

    /** 取词。vars 里的值按 {name} 替换；缺键回落 en，再回落键名。 */
    function zrT(key, vars) {
      const dict = I18N[ZR_LANG] || I18N.zh
      let s = dict[key] || I18N.en[key] || key
      if (vars) {
        s = String(s).replace(/\{([a-zA-Z0-9_]+)\}/g, function (m, name) {
          return vars[name] === undefined ? m : String(vars[name])
        })
      }
      return s
    }

    /**
     * factory 层别名：设置面板直接写 t('panel.…')。
     * 0.6.11 漏了这一行 —— 面板调 t() 时 ReferenceError，被 PanelBoundary 兜成
     * 「重试 / 刷新页面」，而当时的像素与 CSS 门比的是**旧采集**，所以假绿了。
     * 0.6.13 补上；门也补了「采集比源码旧」的告警（见 verify-visual / verify-css-snapshot）。
     */
    const t = zrT

    /**
     * 从宿主 locale 服务读语言；读不到返回 null（调用方保留上一值）。
     * 宿主语言可能由用户在宿主设置里改，所以每次 locale/change 都要重读。
     */
    function zrLangFromHost(ctx) {
      try {
        let loc = null
        if (ctx && typeof ctx.get === 'function') loc = ctx.get('locale')
        if (!loc && ctx) {
          try {
            loc = ctx.locale
          } catch (e) {
            loc = null
          }
        }
        const snap = loc && typeof loc.getSnapshot === 'function' ? loc.getSnapshot() : null
        const active = snap && snap.active ? String(snap.active).toLowerCase() : ''
        if (!active) return null
        return active.indexOf('zh') === 0 ? 'zh' : 'en'
      } catch (e) {
        return null
      }
    }

    /**
     * 把宿主会读的键注册进 locale 服务，让槽位标签可被本地化。
     * 返回 disposer；宿主没这个服务时返回 null。注册失败不要声明 locale 字段
     * （声明了却没注册，宿主会判装配失败）。
     */
    function zrRegisterLocale(ctx, ns, keys) {
      try {
        let loc = null
        if (ctx && typeof ctx.get === 'function') loc = ctx.get('locale')
        if (!loc && ctx) {
          try {
            loc = ctx.locale
          } catch (e) {
            loc = null
          }
        }
        if (!loc || typeof loc.register !== 'function') return null
        const bundle = { zh: {}, en: {} }
        for (const k of keys) {
          if (I18N.zh[k] !== undefined) bundle.zh[k] = I18N.zh[k]
          if (I18N.en[k] !== undefined) bundle.en[k] = I18N.en[k]
        }
        return loc.register(ns, bundle)
      } catch (e) {
        return null
      }
    }

