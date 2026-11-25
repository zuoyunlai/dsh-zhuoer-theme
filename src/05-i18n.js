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
      },
      en: {
        'rail.ariaLabel': 'Right sidebar quick nav',
        'rail.anchorLabel': 'Quick nav anchor',
        'rail.empty': 'No right-sidebar tabs to jump to',
        'rail.noService': 'This host has no right-sidebar service',
        'rail.openFailed': 'Could not open that tab',
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

