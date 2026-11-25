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

