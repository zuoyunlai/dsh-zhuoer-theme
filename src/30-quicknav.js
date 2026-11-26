    /* ===== 右侧栏快捷导航（并入自 dsh-rightbar-quicknav 0.3.9） =====
     * 不能靠「同文件再 load 一次」：宿主只为 bundle 里声明的那一个插件 id 建实例，
     * 第二个模块的 factory 永远不会被 apply。所以把它的 factory 体整体包成一个
     * 函数，在本插件 apply 的作用域里手动调用，共享同一个 ctx 与 React。
     * 服务就绪由 ctx.inject 保证（只影响它自己，不塞进本插件的 inject 列表 ——
     * 否则任一服务缺失会把整个主题插件一起拖成不激活）。 */
    function makeQuicknavModule(ReactLib) {
      // 形参不能叫 React：下面原样保留的 factory 体里自己还有一行
      // const React = require('react')，同名会直接报重复声明。
      const require = function (name) {
        return name === 'react' ? ReactLib : undefined;
      };
    'use strict'
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } = React

    /* ================= 常量 ================= */

    const TAG = '[zhuoer-theme:quicknav]'
    // 与包版本同源：0.3.9 曾是一个独立常量，逃过了 verify-version 的门（那里只查三位 patch），
    // 结果控制台打的和 package.json 对不上。合并进同一包之后没必要再有第二个版本号。
    const QUICKNAV_VERSION = PVERSION

    /** 每格图标按钮边长 / 轨道内边距 / 图标本身。 */
    const ITEM = 26
    const RAIL_PAD = 4
    const ICON = 16
    /** 轨道总宽（左右内边距 + 图标格 + 边框）。 */
    const RAIL_W = ITEM + RAIL_PAD * 2 + 2
    /** 轨道右缘与视口右缘留白 / 轨道顶部与展开按钮底部的间距。 */
    const RIGHT_GAP = 10
    const TOP_GAP = 50
    /** 收起态只露几格；悬停向下展开全部。 */
    const COLLAPSED_COUNT = 3
    /** 标题气泡的 DOM id 前缀（每实例唯一：shell.overlay 是 list 槽，可能有多实例）。 */
    const TIP_ID_PREFIX = 'dsh-rqn-tip-'
    /** locale 命名空间（若宿主 locale 服务可用则注册）。 */
    const NS = 'rightbarQuicknav'
    /** 宿主展开按钮的稳定属性（优先用它定位，避开文案与类名）。 */
    const TOGGLE_ATTR = 'data-sidebar-right-expand'
    /** 收起延时（毫秒）。 */
    const CLOSE_DELAY = 200
    /** 兜底位置：宿主展开按钮找不到时的默认顶部坐标。 */
    const DEFAULT_TOP = 64

    /* ---- 三态与主题设置共享（同一个 localStorage key，由设置面板写入） ---- */
    const SKIN_STORE = 'dsh-zhuoer-theme:v1'
    const SKIN_PREF_EVENT = 'dsh-zhuoer-theme:pref'
    /** 读主题里的「关闭 / 显示三个 / 全部显示」；非法值一律回落到 three。 */
    function readQuicknavMode() {
      try {
        const raw = window.localStorage.getItem(SKIN_STORE)
        const o = raw ? JSON.parse(raw) : null
        const v = o && o.quicknav
        return v === 'off' || v === 'all' ? v : 'three'
      } catch (e) {
        return 'three'
      }
    }

    /* ================= 词典与语言（真源在 05-i18n.js） =================
     * 词典与「当前语言」都是模块级共享状态：面板也要用，留在轨道的闭包里取不到。
     * 这里只保留别名，调用点（t('rail.…')）一个字都不用改。 */

    const DICT = I18N
    const t = zrT

    /** 轨道实例序号：保证同一 profile 下多个实例的 DOM id 不重复。 */
    let instanceSeq = 0

    /* ================= 工具 ================= */

    /** 取服务（惰性解析，读不到当缺失，不崩）。 */
    function serviceOf(ctx, name) {
      if (!ctx) return undefined
      try {
        if (typeof ctx.get === 'function') {
          const v = ctx.get(name)
          if (v !== undefined && v !== null) return v
        }
      } catch (e) {
        /* fallthrough */
      }
      try {
        return ctx[name]
      } catch (e) {
        return undefined
      }
    }

    /** 系统是否要求减弱动效。 */
    function prefersReduced() {
      try {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      } catch (e) {
        return false
      }
    }

    /** 定位宿主的「打开右侧边栏」按钮元素（只读属性与身份，不读几何）。 */
    function findToggleEl() {
      // ① 宿主稳定属性优先：与语言、类名都无关
      try {
        const el = document.querySelector('[' + TOGGLE_ATTR + ']')
        if (el) return el
      } catch (e) {
        /* ignore */
      }
      // ② 回退：按 aria-label 文案匹配（只读属性，不触发布局）
      let nodes = []
      try {
        nodes = Array.prototype.slice.call(document.querySelectorAll('[aria-label]'))
      } catch (e) {
        return null
      }
      const expand = []
      const collapse = []
      for (const el of nodes) {
        try {
          if (el.closest && el.closest('.dsh-rqn-rail')) continue
        } catch (e) {
          /* ignore */
        }
        let label = ''
        try {
          label = String(el.getAttribute('aria-label') || '')
        } catch (e) {
          label = ''
        }
        if (!/侧边栏|侧栏|sidebar/i.test(label)) continue
        // 「收起 / collapse」的是右栏面板内的按钮，不是我们要的展开按钮
        if (/收起|折叠|关闭|collapse|hide|close/i.test(label)) collapse.push(el)
        else expand.push(el)
      }
      // 优先展开按钮；多个时取最靠上（顶栏那个），需要时读一次几何
      const pick = (list) => {
        if (!list.length) return null
        if (list.length === 1) return list[0]
        let best = null
        let bestTop = Infinity
        for (const el of list) {
          let r = null
          try {
            r = el.getBoundingClientRect()
          } catch (e) {
            continue
          }
          if (!r) continue
          if (r.top < bestTop) {
            bestTop = r.top
            best = el
          }
        }
        return best || list[0]
      }
      return pick(expand) || pick(collapse)
    }

    /* ================= 图标 ================= */

    /** 缺省图标：立方体（对齐官方 guide 的占位）。 */
    function CubeIcon({ size }) {
      const s = size || ICON
      return h(
        'svg',
        {
          width: s,
          height: s,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.25,
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
        h('path', { d: 'M8 1.8 14 5v6L8 14.2 2 11V5Z' }),
        h('path', { d: 'M2 5l6 3 6-3' }),
        h('path', { d: 'M8 8v6.2' }),
      )
    }

    /* ============ 语义默认图标（条目自身没带图标时使用） ============ */

    /**
     * 图标形状表：统一 16×16 视框、stroke=currentColor、1.25 描边，
     * 与宿主图标同视觉语言（矢量、无依赖、跟随文字色）。
     * rects: [x,y,w,h,rx] / circles: [cx,cy,r] / paths: [d,...]
     */
    const GLYPH = {
      image: { rects: [[1.6, 2.6, 12.8, 10.8, 2]], circles: [[5.2, 6.1, 1.05]], paths: ['M2.2 11.9l3.3-3 2.3 1.8 2.3-2.3 3.3 3.1'] },
      file: { paths: ['M4.2 2h4.6L12 5.2V14H4.2z', 'M8.6 2v3.3H12'] },
      folder: { paths: ['M2 4.6h4.1l1.5 1.9H14V13H2z'] },
      git: { circles: [[4.8, 3.6, 1.3], [4.8, 12.4, 1.3], [11.2, 6.2, 1.3]], paths: ['M4.8 4.9v6.2', 'M11.2 7.5v.9a2.4 2.4 0 0 1-2.4 2.4H6.1'] },
      terminal: { rects: [[1.6, 3, 12.8, 10, 2]], paths: ['M4.6 6.6l1.9 1.7-1.9 1.7', 'M8.6 10.4h3'] },
      tasks: { paths: ['M2.8 4.3l1.3 1.3 2-2.1', 'M2.8 11l1.3 1.3 2-2.1', 'M9 4.8h4.2', 'M9 11.5h4.2'] },
      globe: { circles: [[8, 8, 6.1]], paths: ['M1.9 8h12.2', 'M8 1.9c2.3 2.5 2.3 9.7 0 12.2', 'M8 1.9c-2.3 2.5-2.3 9.7 0 12.2'] },
      search: { circles: [[7, 7, 4.1]], paths: ['M10.1 10.1L14 14'] },
      chart: { paths: ['M2.4 13.2h11.2', 'M4.6 13V8.4', 'M8 13V4.6', 'M11.4 13V6.6'] },
      code: { paths: ['M5.6 5.2L2.6 8l3 2.8', 'M10.4 5.2l3 2.8-3 2.8', 'M9.2 3.2L6.8 12.8'] },
      chat: { paths: ['M2.6 3.6h10.8v7.1H7.3L3.9 13.6v-2.9H2.6z'] },
      doc: { paths: ['M3 3.2h10', 'M3 6.6h10', 'M3 10h6.6', 'M3 13.2h4'] },
      sparkle: { paths: ['M8 2l1.5 4.5L14 8l-4.5 1.5L8 14l-1.5-4.5L2 8l4.5-1.5z'] },
      plug: { paths: ['M6 2v3.6', 'M10 2v3.6', 'M4.2 5.6h7.6v2.9a3.8 3.8 0 0 1-7.6 0z', 'M8 12.3V14'] },
      sliders: { circles: [[6, 5.1, 1.5], [10.2, 10.9, 1.5]], paths: ['M2.2 5.1h2.3', 'M7.5 5.1h6.3', 'M2.2 10.9h6.5', 'M11.7 10.9h2.1'] },
      layers: { paths: ['M8 2.2l5.6 2.9L8 8 2.4 5.1z', 'M2.4 8.1L8 11l5.6-2.9'] },
      db: { paths: ['M2.6 4.3c0-.9 2.4-1.6 5.4-1.6s5.4.7 5.4 1.6', 'M2.6 4.3v7.4c0 .9 2.4 1.6 5.4 1.6s5.4-.7 5.4-1.6V4.3', 'M2.6 8c0 .9 2.4 1.6 5.4 1.6s5.4-.7 5.4-1.6'] },
      grid: { rects: [[2.6, 2.6, 4.6, 4.6, 1], [8.8, 2.6, 4.6, 4.6, 1], [2.6, 8.8, 4.6, 4.6, 1], [8.8, 8.8, 4.6, 4.6, 1]] },
      hexagon: { paths: ['M8 2l5.2 3v6L8 14l-5.2-3V5z'] },
      dot: { circles: [[8, 8, 5.4]] },
    }

    /** 渲染一个语义图标。 */
    function GlyphIcon({ size, name }) {
      const spec = GLYPH[name] || GLYPH.dot
      const s = size || ICON
      const kids = []
      ;(spec.rects || []).forEach((r, i) =>
        kids.push(h('rect', { key: 'r' + i, x: r[0], y: r[1], width: r[2], height: r[3], rx: r[4] || 0 })),
      )
      ;(spec.circles || []).forEach((c, i) => kids.push(h('circle', { key: 'c' + i, cx: c[0], cy: c[1], r: c[2] })))
      ;(spec.paths || []).forEach((d, i) => kids.push(h('path', { key: 'p' + i, d })))
      return h(
        'svg',
        {
          width: s,
          height: s,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.25,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
        kids,
      )
    }

    /**
     * 关键词 → 图标。按 `kind` 与标题（含中英）一起匹配，先匹配先得。
     * 顺序有意义：更具体的规则放前面（例如 gallery 先于 studio）。
     */
    const ICON_RULES = [
      [/image|photo|picture|gallery|canvas|图像|图片|图库|画廊|画布|绘画|出图/, 'image'],
      [/git|diff|commit|branch|版本|变更|分支|提交/, 'git'],
      [/terminal|shell|console|终端|命令行|控制台/, 'terminal'],
      [/task|todo|automation|schedule|任务|待办|计划|定时|自动化/, 'tasks'],
      [/memory|context|mnemon|viking|记忆|上下文|知识库/, 'db'],
      [/browser|web(?!hook)|url|网页|浏览|浏览器/, 'globe'],
      [/search|find|query|搜索|检索|查找/, 'search'],
      [/chart|usage|metric|token|stat|统计|用量|图表|分析/, 'chart'],
      [/settings|config|preference|theme|palette|设置|配置|偏好|主题|配色/, 'sliders'],
      [/skill|prompt|persona|技能|提示词|角色/, 'sparkle'],
      [/mcp|server|protocol|插件|扩展|协议|服务/, 'plug'],
      [/code|dev|develop|开发|源码|代码/, 'code'],
      [/chat|message|session|conversation|对话|会话|消息/, 'chat'],
      [/doc|note|readme|markdown|文档|笔记|说明/, 'doc'],
      [/file|asset|resource|folder|文件|资源|目录/, 'file'],
      [/db|data|sql|数据库|数据/, 'db'],
    ]

    /** 无关键词命中时的中性图标池：按 kind 哈希取，保证不同条目不会长成同一个。 */
    const NEUTRAL_ICONS = ['layers', 'grid', 'hexagon', 'dot']

    /** 给一个条目挑默认图标名（纯函数，便于测试）。 */
    function pickIconName(kind, title) {
      const hay = String(kind || '') + ' ' + String(title || '')
      const s = hay.toLowerCase()
      for (let i = 0; i < ICON_RULES.length; i++) {
        if (ICON_RULES[i][0].test(s)) return ICON_RULES[i][1]
      }
      const key = String(kind || title || '')
      let sum = 0
      for (let i = 0; i < key.length; i++) sum = (sum * 31 + key.charCodeAt(i)) % 100003
      return NEUTRAL_ICONS[sum % NEUTRAL_ICONS.length]
    }

    /** 条目的语义默认图标元素。 */
    function defaultIcon(kind, title, size) {
      return h(GlyphIcon, { size: size || ICON, name: pickIconName(kind, title) })
    }

    /** 外部条目图标：抛错时回落到调用方给的默认图标。 */
    function safeIcon(IconComp, size, fallback) {
      try {
        const el = h(IconComp, { size })
        return el || fallback || h(CubeIcon, { size })
      } catch (e) {
        return fallback || h(CubeIcon, { size })
      }
    }

    /* ================= 错误边界 ================= */

    /**
     * 组件渲染期抛错时回落为空，而不是让整条 slot 条目白屏
     * （同族 dsh-pet 的 PetBoundary 同思路）。
     */
    class Boundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { failed: false }
      }
      static getDerivedStateFromError() {
        return { failed: true }
      }
      componentDidCatch(error) {
        try {
          console.error(TAG, '渲染失败，轨道已隐藏：', error)
        } catch (e) {
          /* ignore */
        }
      }
      render() {
        if (this.state.failed) return null
        return this.props.children
      }
    }

    /* ================= 轨道 ================= */

    function Rail(props) {
      const ctx = (props && props.ctx) || null
      const [entries, setEntries] = useState([])
      const [hover, setHover] = useState(null)
      const [expanded, setExpanded] = useState(false)
      const [tip, setTip] = useState(null)
      const [activeIndex, setActiveIndex] = useState(0)
      const [focusIndex, setFocusIndex] = useState(null)
      const [flash, setFlash] = useState(null)
      const [, setLangTick] = useState(0)
      const [mode, setMode] = useState(readQuicknavMode)

      const railRef = useRef(null)
      const tipRef = useRef(null)
      const btnRefs = useRef([])
      const closeTimer = useRef(0)
      const flashTimer = useRef(0)
      /** 每实例唯一的 tooltip id（shell.overlay 是 list 槽，可能挂多个实例）。 */
      const tipIdRef = useRef(null)
      if (tipIdRef.current === null) {
        instanceSeq += 1
        tipIdRef.current = TIP_ID_PREFIX + instanceSeq
      }
      const tipId = tipIdRef.current

      const tabsReg = serviceOf(ctx, 'sidebarRightTabs')
      const sidebarRight = serviceOf(ctx, 'sidebarRight')

      /* ---------- 条目与语言 ---------- */

      /**
       * 条目来自官方注册表；语言变化时重取（title() 是活值，重取即本地化）。
       * 注册表订阅 + locale/change 事件都在这里收口，避免多次重渲染。
       */
      useEffect(() => {
        const detectLang = () => {
          try {
            const loc = serviceOf(ctx, 'locale')
            const snap = loc && typeof loc.getSnapshot === 'function' ? loc.getSnapshot() : null
            const active = snap && snap.active ? String(snap.active).toLowerCase() : ''
            // 宿主有语言偏好就听宿主的：只有 zh* 算中文，其余一律英文
            // （含 en / en-US 以及宿主以后新增的 ja、es 等，都比中文更可能被看懂）
            const next = active ? (active.indexOf('zh') === 0 ? 'zh' : 'en') : zrLang()
            if (next !== zrLang()) {
              zrSetLang(next)
              setLangTick((n) => n + 1)
            }
          } catch (e) {
            /* keep previous */
          }
        }
        const readEntries = () => {
          try {
            const list = (tabsReg && typeof tabsReg.guide === 'function' ? tabsReg.guide() : []) || []
            setEntries(list.filter((e) => e && e.kind))
          } catch (e) {
            try {
              console.error(TAG, 'guide() 读取失败：', e)
            } catch (e2) {
              /* ignore */
            }
            setEntries([])
          }
          // 条目集合变了 ⇒ 旧的悬停项可能已不存在，气泡不能变成孤儿（审计 P1）
          setTip(null)
          setHover(null)
        }
        detectLang()
        readEntries()
        const offs = []
        try {
          if (tabsReg && typeof tabsReg.subscribe === 'function') {
            offs.push(
              tabsReg.subscribe(() => {
                detectLang()
                readEntries()
              }),
            )
          }
        } catch (e) {
          /* ignore */
        }
        try {
          if (ctx && typeof ctx.on === 'function') {
            const off = ctx.on('locale/change', () => {
              detectLang()
              // 设置面板也要跟着换语言：它订阅的是 emitChange 那条广播，
              // 只刷快捷导航的话，面板开着时文案会停在旧语言直到重开。
              try { emitChange() } catch (e) { /* ignore */ }
              readEntries()
            })
            if (typeof off === 'function') offs.push(off)
          }
        } catch (e) {
          /* ignore */
        }
        return () => offs.forEach((d) => {
          try {
            d()
          } catch (e) {
            /* ignore */
          }
        })
      }, [ctx, tabsReg])

      /* ---------- 定位宿主展开按钮（事件驱动，稳态零轮询零布局） ---------- */

      const anchorRef = useRef(null)
      const keyRef = useRef('')
      const warnedRef = useRef(false)
      const roRef = useRef(null)
      const moRef = useRef(null)
      const rafRef = useRef(0)

      const hideRail = useCallback(() => {
        const node = railRef.current
        if (node && node.style.display !== 'none') node.style.display = 'none'
      }, [])

      /** 默认位置（宿主按钮找不到时的兜底）：右上角下移一段。 */
      const placeDefault = useCallback(() => {
        const node = railRef.current
        if (!node) return
        try {
          const vw = window.innerWidth || 1200
          node.style.left = Math.max(4, Math.round(vw - RAIL_W - RIGHT_GAP)) + 'px'
          node.style.top = Math.round(DEFAULT_TOP) + 'px'
          node.style.display = 'flex'
        } catch (e) {
          hideRail()
        }
      }, [hideRail])

      const placeRail = useCallback(
        (el) => {
          const node = railRef.current
          if (!node) return
          try {
            const r = el.getBoundingClientRect()
            const vh = window.innerHeight || 800
            // 有效性闸门：**只查纵向**（必须在顶栏区域内、没被裁掉）。
            // 横向不设限 —— 轨道是视口锚定（右缘固定 RIGHT_GAP），锚点的横向位置与落点无关；
            // 早前用「右缘 < 55% 视口宽」做闸门，窗口一缩小按钮往左挪就越线，轨道整条消失（2026-11-06 用户实测）。
            if (r.width < 8 || r.height < 8 || r.top > 96 || r.bottom > vh - 40) {
              hideRail()
              return
            }
            node.style.left = Math.max(4, Math.round((window.innerWidth || 1200) - RAIL_W - RIGHT_GAP)) + 'px'
            node.style.top = Math.round(r.bottom + TOP_GAP) + 'px'
            node.style.display = 'flex'
          } catch (e) {
            hideRail()
          }
        },
        [hideRail],
      )

      /**
       * 廉价通道：只读属性与身份，不触发布局；
       * 只有「锚点身份 / 右栏开合 / 有无座位」三者任一变化时才做一次几何测量。
       * force=true 用于「几何必然变了」的场景（窗口缩放），必须重定位，不能被变更键挡掉。
       */
      const cheapPass = useCallback(
        (force) => {
          const el = findToggleEl()
          let expandedNow = false
          try {
            expandedNow = sidebarRight && typeof sidebarRight.isExpanded === 'function' ? sidebarRight.isExpanded() : false
          } catch (e) {
            expandedNow = false
          }
          let seat = 'unknown'
          try {
            const m = sidebarRight && sidebarRight.mounted
            if (m && typeof m.getSnapshot === 'function') seat = m.getSnapshot() === undefined ? 'none' : 'ok'
          } catch (e) {
            seat = 'unknown'
          }
          const key = (el ? '1' : '0') + '|' + expandedNow + '|' + seat
          // 锚点身份也进判定：换了锚点必须重新定位并重新挂观察（审计 P1）
          const anchorChanged = el !== anchorRef.current
          if (!force && key === keyRef.current && !anchorChanged) return
          keyRef.current = key
        if (expandedNow || seat === 'none') {
          hideRail()
          anchorRef.current = null
          return
        }
        if (!el) {
          // 兜底：宿主若改了按钮文案/属性，轨道仍以默认位置出现（而不是整条消失）
          if (!warnedRef.current) {
            warnedRef.current = true
            try {
              console.warn(TAG, '找不到宿主展开按钮（' + TOGGLE_ATTR + ' 与 aria-label 均未命中），轨道改用默认位置。')
            } catch (e) {
              /* ignore */
            }
          }
          placeDefault()
          anchorRef.current = null
          return
        }
        placeRail(el)
        anchorRef.current = el
        // 锚点换了才重新挂尺寸观察（不轮询）
        if (roRef.current) {
          try {
            roRef.current.disconnect()
          } catch (e) {
            /* ignore */
          }
          try {
            roRef.current.observe(el)
          } catch (e) {
            /* ignore */
          }
        }
      }, [sidebarRight, hideRail, placeRail])

      const schedulePass = useCallback(
        (force) => {
          if (rafRef.current) return
          try {
            rafRef.current = requestAnimationFrame(() => {
              rafRef.current = 0
              cheapPass(force)
            })
          } catch (e) {
            rafRef.current = 0
            cheapPass(force)
          }
        },
        [cheapPass],
      )

      /* 首次定位必须在绘制前完成，避免左上角闪一帧。
         依赖必须带 mode：mode === 'off' 时组件返回 null，DOM 不存在，
         railRef.current 为空 → hideRail / cheapPass 都会早退；从 off 切回来时
         DOM 重建，但这个 effect 若只依赖 [] 就不会再跑，left/top 一直为空，
         position:fixed 于是停在 (0,0)（表现为「打开后跑到左上角」）。 */
      useLayoutEffect(() => {
        hideRail()
        cheapPass(true)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [mode])

      useEffect(() => {
        let disposed = false

        /* DOM 变化 → 只跑廉价通道（身份没变就不碰布局）。
           注意：MutationObserver 会把 (mutations, observer) 当参数传进来，
           这里必须显式传 force=false，否则每次 DOM 变动都会强制重测几何。 */
        try {
          const mo = new MutationObserver(() => schedulePass(false))
          mo.observe(document.body, { childList: true, subtree: true })
          moRef.current = mo
        } catch (e) {
          moRef.current = null
        }

        /* 锚点尺寸变化 → 重新测量一次（唯一读几何的路径） */
        try {
          if (window.ResizeObserver) {
            const ro = new ResizeObserver(() => {
              const el = anchorRef.current
              if (el && !disposed) placeRail(el)
            })
            roRef.current = ro
          }
        } catch (e) {
          roRef.current = null
        }

        window.addEventListener('resize', () => schedulePass(true), true)

        return () => {
          disposed = true
          if (rafRef.current) {
            try {
              cancelAnimationFrame(rafRef.current)
            } catch (e) {
              /* ignore */
            }
            rafRef.current = 0
          }
          if (moRef.current) {
            try {
              moRef.current.disconnect()
            } catch (e) {
              /* ignore */
            }
            moRef.current = null
          }
          if (roRef.current) {
            try {
              roRef.current.disconnect()
            } catch (e) {
              /* ignore */
            }
            roRef.current = null
          }
          window.removeEventListener('resize', schedulePass, true)
        }
      }, [schedulePass, placeRail])

      /* 座位变化（会话切换 / 退屏）→ 重新判定可见性：mounted 是可订阅的响应式 store */
      useEffect(() => {
        const m = sidebarRight && sidebarRight.mounted
        if (!m || typeof m.subscribe !== 'function') return undefined
        let off = null
        try {
          off = m.subscribe(() => {
            schedulePass(true)
          })
        } catch (e) {
          off = null
        }
        return () => {
          if (typeof off === 'function') {
            try {
              off()
            } catch (e) {
              /* ignore */
            }
          }
        }
      }, [sidebarRight, cheapPass, schedulePass])

      /* ---------- 交互 ---------- */

      const cancelCollapse = useCallback(() => {
        if (closeTimer.current) {
          clearTimeout(closeTimer.current)
          closeTimer.current = 0
        }
      }, [])

      const scheduleCollapse = useCallback(() => {
        cancelCollapse()
        closeTimer.current = setTimeout(() => {
          closeTimer.current = 0
          // 「全部显示」模式不收起，只清悬停态
          if (readQuicknavMode() === 'all') {
            setHover(null)
            setTip(null)
            return
          }
          setExpanded(false)
          setHover(null)
          setTip(null)
        }, CLOSE_DELAY)
      }, [cancelCollapse])

      /* 卸载时清掉两个定时器：组件消失后仍回调 setState 会警告并泄漏（doctor K3）。 */
      useEffect(() => () => {
        try { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = 0 } } catch (e) { /* ignore */ }
        try { if (flashTimer.current) { clearTimeout(flashTimer.current); flashTimer.current = 0 } } catch (e) { /* ignore */ }
      }, [])

      /* 主题设置改了三态要立刻生效：同窗口靠自定义事件，跨窗口靠 storage */
      useEffect(() => {
        const onPref = () => setMode(readQuicknavMode())
        window.addEventListener(SKIN_PREF_EVENT, onPref)
        window.addEventListener('storage', onPref)
        return () => {
          window.removeEventListener(SKIN_PREF_EVENT, onPref)
          window.removeEventListener('storage', onPref)
        }
      }, [])

      useEffect(() => cancelCollapse, [cancelCollapse])
      useEffect(
        () => () => {
          if (flashTimer.current) clearTimeout(flashTimer.current)
        },
        [],
      )

      const showFlash = useCallback((msg) => {
        setFlash(msg)
        if (flashTimer.current) clearTimeout(flashTimer.current)
        flashTimer.current = setTimeout(() => {
          flashTimer.current = 0
          setFlash(null)
        }, 2400)
      }, [])

      const goTab = useCallback(
        (kind) => {
          // 点击时重新解析服务：不在渲染期捕获引用（审计 P2-1）
          const svc = serviceOf(ctx, 'sidebarRight')
          if (!svc || typeof svc.openTab !== 'function') {
            try {
              console.warn(TAG, '当前宿主没有 sidebarRight.openTab，无法直达。')
            } catch (e) {
              /* ignore */
            }
            showFlash(t('rail.noService'))
            return
          }
          try {
            svc.openTab(kind)
          } catch (e) {
            try {
              console.error(TAG, 'openTab("' + kind + '") 失败：', e)
            } catch (e2) {
              /* ignore */
            }
            showFlash(t('rail.openFailed'))
          }
        },
        [ctx, showFlash],
      )

      /* 收起态只渲染前 3 项 → 高度自然精确、无裁切、无隐藏可聚焦项（审计 P1-6 / P2-2） */
      const items = useMemo(() => {
        const list = entries.filter((e) => e && e.kind)
        // all：常驻全部条目，不参与收起
        if (mode === 'all') return list
        return expanded ? list : list.slice(0, COLLAPSED_COUNT)
      }, [entries, expanded, mode])

      /* 可见项变少时把活动项夹回范围内，避免 toolbar 失去唯一 Tab 停靠点 */
      const act = items.length ? Math.min(activeIndex, items.length - 1) : 0
      /* 方向键按「全部条目」算下标：收起态先展开再移动，不会跳过被折叠的条目（审计 P2） */
      const totalCount = entries.length
      const actFull = totalCount ? Math.min(activeIndex, totalCount - 1) : 0

      const onKeyDown = useCallback(
        (e) => {
          const n = totalCount
          if (e.key === 'Escape') {
            setTip(null)
            setHover(null)
            return
          }
          if (!n) return
          let next = -1
          if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (actFull + 1) % n
          else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (actFull - 1 + n) % n
          else if (e.key === 'Home') next = 0
          else if (e.key === 'End') next = n - 1
          else return
          e.preventDefault()
          setActiveIndex(next)
          setExpanded(true)
          try {
            requestAnimationFrame(() => {
              const el = btnRefs.current[next]
              if (el && el.focus) el.focus()
            })
          } catch (err) {
            /* ignore */
          }
        },
        [totalCount, actFull],
      )

      /* ---------- 渲染 ---------- */

      /**
       * 气泡配色 + 定位：
       *  - 底色**由轨道实际底色按明暗方向微调**（深色模式调浅一档、亮色模式调深一档），
       *    再不用边框，靠这点明度差把它和背景分开（2026-11-06 用户要求）；
       *  - 用 JS 混色而不是 color-mix，避免宿主浏览器差异，也便于把尖头染成同色；
       *  - 坐标每次按当前布局重测（不用悬停瞬间的快照）。
       */
      const tipStyle = useCallback(() => {
        // 解析 rgb()/rgba() 字面量
        const parseRgb = (s) => {
          const m = String(s || '').match(/rgba?\(([^)]+)\)/)
          if (!m) return null
          const p = m[1].split(',').map((v) => parseFloat(v))
          if (p.length < 3 || p.some((v) => !isFinite(v))) return null
          return { r: p[0], g: p[1], b: p[2] }
        }
        const railEl = railRef.current
        if (!railEl) return null
        let base = ''
        try {
          base = getComputedStyle(railEl).backgroundColor
        } catch (e) {
          return null
        }
        const c = parseRgb(base)
        if (!c) return null
        // 深色模式往白偏（变浅），亮色模式往黑偏（变深）
        let dark = false
        try {
          dark = !!(document.body && document.body.hasAttribute('data-ds-dark-theme'))
        } catch (e) {
          dark = false
        }
        const target = dark ? 255 : 0
        const ratio = dark ? 0.1 : 0.08
        const mix = (v) => Math.round(v + (target - v) * ratio)
        return 'rgb(' + mix(c.r) + ',' + mix(c.g) + ',' + mix(c.b) + ')'
      }, [])

      useLayoutEffect(() => {
        const el = tipRef.current
        if (!tip || !el) return
        const btn = btnRefs.current[tip.index]
        if (!btn) return
        try {
          const r = btn.getBoundingClientRect()
          const bg = tipStyle() || ''
          if (bg) {
            el.style.background = bg
            el.style.backgroundColor = bg
          }
          const tail = el.querySelector('[data-rqn-tail]')
          const w = el.offsetWidth || 0
          const leftSpace = r.left - 10
          const flip = w > 0 && leftSpace - w < 8
          el.style.top = r.top + r.height / 2 + 'px'
          if (flip) {
            // 左侧放不下 → 翻到图标右侧，尖头朝左
            el.style.left = r.right + 10 + 'px'
            el.style.transform = 'translate(0, -50%)'
            if (tail) {
              tail.style.right = 'auto'
              tail.style.left = '-5px'
              tail.style.borderRight = '5px solid ' + (bg || 'transparent')
              tail.style.borderLeft = '0'
            }
          } else {
            el.style.left = leftSpace + 'px'
            el.style.transform = 'translate(-100%, -50%)'
            if (tail) {
              tail.style.left = 'auto'
              tail.style.right = '-5px'
              tail.style.borderLeft = '5px solid ' + (bg || 'transparent')
              tail.style.borderRight = '0'
            }
          }
        } catch (e) {
          /* ignore */
        }
      }, [tip, expanded, entries, tipStyle])

      const reduced = prefersReduced()
      const kids = []
      let lastProvider = null

      items.forEach((entry, i) => {
        let title = ''
        try {
          title = typeof entry.title === 'function' ? String(entry.title()) : String(entry.title || entry.kind)
        } catch (e) {
          title = entry.kind
        }
        const provider = entry.providerId || ''
        if (lastProvider !== null && provider !== lastProvider) {
          kids.push(
            h('div', {
              key: 'sep-' + i,
              role: 'separator',
              'aria-hidden': 'true',
              style: {
                width: 18,
                height: 1,
                margin: '2px 0',
                flex: 'none',
                alignSelf: 'center',
                background: 'var(--dsw-alias-border-l1, rgba(127,127,127,.28))',
              },
            }),
          )
        }
        lastProvider = provider
        const active = i === hover
        const focused = i === focusIndex
        const described = tip && tip.index === i ? tipId : undefined

        kids.push(
          h(
            'button',
            {
              key: (provider || '') + '/' + (entry.id || i),
              ref: (el) => {
                btnRefs.current[i] = el
              },
              type: 'button',
              className: 'dsh-rqn-item' + (active ? ' is-hover' : ''),
              'aria-label': title,
              'aria-describedby': described,
              // roving tabindex：toolbar 只占一个 Tab 停靠点
              tabIndex: i === act ? 0 : -1,
              onClick: (e) => {
                e.preventDefault()
                e.stopPropagation()
                goTab(entry.kind)
              },
              onMouseEnter: () => {
                setHover(i)
                setExpanded(true)
                cancelCollapse()
                setTip({ index: i, title: title })
              },
              onMouseLeave: () => {
                setHover((cur) => (cur === i ? null : cur))
                setTip((cur) => (cur && cur.index === i ? null : cur))
              },
              onFocus: (e) => {
                // 只有键盘焦点才画焦点轮廓：鼠标点击不该留下键盘焦点环
                let keyboard = true
                try {
                  keyboard = !e.currentTarget.matches || e.currentTarget.matches(':focus-visible')
                } catch (err) {
                  keyboard = true
                }
                setFocusIndex(keyboard ? i : null)
                setActiveIndex(i)
                setExpanded(true)
                setTip({ index: i, title: title })
              },
              onBlur: () => {
                setFocusIndex((cur) => (cur === i ? null : cur))
                setTip((cur) => (cur && cur.index === i ? null : cur))
              },
              style: {
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: ITEM,
                height: ITEM,
                padding: 0,
                margin: 0,
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                background: active
                  ? 'var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.16))'
                  : 'transparent',
                color: active
                  ? 'var(--dsw-alias-label-primary, #f5f6f7)'
                  : 'var(--dsw-alias-label-secondary, #8a8f98)',
                transition: reduced ? 'none' : 'background .12s ease, color .12s ease',
                // 焦点轮廓：类样式在宿主上不生效（宿主无 styles 服务），故内联
                outline: focused ? '2px solid var(--dsw-alias-brand-primary, #4c78ff)' : 'none',
                outlineOffset: focused ? '1px' : '0',
              },
            },
            h(
              'span',
              { style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: ICON, height: ICON } },
              // 条目自带图标就用自带的（可能是彩色位图/SVG，不改造）；
              // 没带图标则按 kind/title 语义给一个，避免所有条目都长成同一个立方体。
              entry.icon && typeof entry.icon === 'function'
                ? safeIcon(entry.icon, ICON, defaultIcon(entry.kind, title, ICON))
                : defaultIcon(entry.kind, title, ICON),
            ),
          ),
        )
      })

      if (!items.length) {
        kids.push(
          h(
            'div',
            {
              key: 'empty',
              role: 'status',
              style: {
                fontSize: 12,
                lineHeight: 1.35,
                color: 'var(--dsw-alias-label-tertiary, #9aa0a6)',
                maxWidth: 160,
                padding: '4px 6px',
                textAlign: 'center',
              },
            },
            t('rail.empty'),
          ),
        )
      }

      const tipEl = tip
        ? h(
            'div',
            {
              id: tipId,
              ref: tipRef,
              role: 'tooltip',
              style: {
                position: 'fixed',
                zIndex: 901,
                top: 0,
                left: 0,
                transform: 'translate(-100%, -50%)',
                padding: '4px 8px',
                borderRadius: 8,
                // 单行不换行，宽度自适应内容（2026-11-06 用户要求）
                whiteSpace: 'nowrap',
                fontSize: 12,
                lineHeight: 1.3,
                pointerEvents: 'none',
                // 底色由 effect 按「轨道实际底色 + 明暗方向」混色写入；无边框（2026-11-06 用户要求）
                background: 'inherit',
                border: 'none',
                color: 'var(--dsw-alias-label-primary, #f5f6f7)',
                boxShadow: '0 2px 8px rgba(0,0,0,.14)',
              },
            },
            tip.title,
            // 小尖头：指向图标一侧（贴在气泡右缘，向外指）
            h('span', {
              'data-rqn-tail': '1',
              'aria-hidden': 'true',
              style: {
                position: 'absolute',
                top: '50%',
                right: '-5px',
                width: 0,
                height: 0,
                transform: 'translateY(-50%)',
                borderTop: '5px solid transparent',
                borderBottom: '5px solid transparent',
                borderLeft: '5px solid transparent',
              },
            }),
          )
        : null

      const flashEl = flash
        ? h(
            'div',
            {
              role: 'status',
              style: {
                marginTop: 4,
                padding: '4px 6px',
                borderRadius: 6,
                fontSize: 11,
                lineHeight: 1.3,
                color: 'var(--dsw-alias-state-error-primary, #ef4444)',
                background: 'var(--dsw-alias-state-error-secondary, rgba(239,68,68,.12))',
                maxWidth: 180,
              },
            },
            flash,
          )
        : null

      // 关闭态：不渲染任何东西（hooks 已全部调用完，这里 return null 合法）
      if (mode === 'off') return null

      return h(
        'div',
        {
          ref: railRef,
          className: 'dsh-rqn-rail',
          // 没有条目时不用 toolbar（空工具栏不合语义），改用 group + status 文案
          role: items.length ? 'toolbar' : 'group',
          'aria-orientation': items.length ? 'vertical' : undefined,
          'aria-label': t('rail.ariaLabel'),
          'aria-expanded': items.length ? (expanded ? 'true' : 'false') : undefined,
          onMouseEnter: () => {
            cancelCollapse()
            setExpanded(true)
          },
          onMouseLeave: scheduleCollapse,
          onKeyDown: onKeyDown,
          style: {
            // left / top / display 由 effect 命令式写入：
            // 不放进 React style 里，否则每次重渲染都会被 React 覆盖回初值。
            position: 'fixed',
            zIndex: 900,
            boxSizing: 'border-box',
            width: RAIL_W,
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1,
            padding: RAIL_PAD,
            borderRadius: 12,
            // 底色与主栏同色（--dsw-alias-bg-base），阴影只做轻微托起
            // （2026-11-06 用户反馈：亮色模式下原来的 0 10px 28px 太重，只要一点点）
            background: 'var(--dsw-alias-bg-base, #1b1c1f)',
            border: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.18))',
            boxShadow: '0 2px 8px rgba(0,0,0,.10)',
            fontFamily: 'inherit',
          },
        },
        kids,
        tipEl,
        flashEl,
      )
    }

    /* ================= 插件入口 ================= */

    return {
      // 服务进 inject：缺失时插件静默不激活，而不是运行时才发现（审计 P1-1）
      inject: ['slots', 'sidebarRightTabs', 'sidebarRight'],
      apply(ctx) {
        try {
          console.info(TAG, 'v' + QUICKNAV_VERSION + ' loaded · rail mode')
        } catch (e) {
          /* ignore */
        }

        /* locale 命名空间：宿主 locale 服务可用时注册，让槽位标签可被宿主本地化。
           注册失败则不声明 locale 字段（声明了却没注册会被宿主判为装配失败）。 */
        let localeReady = false
        try {
          const loc = serviceOf(ctx, 'locale')
          if (loc && typeof loc.register === 'function') {
            const off = loc.register(NS, {
              en: {
                'rail.ariaLabel': DICT.en['rail.ariaLabel'],
                'rail.anchorLabel': DICT.en['rail.anchorLabel'],
              },
              zh: {
                'rail.ariaLabel': DICT.zh['rail.ariaLabel'],
                'rail.anchorLabel': DICT.zh['rail.anchorLabel'],
              },
            })
            localeReady = true
            ctx.effect(() => () => {
              if (typeof off === 'function') {
                try {
                  off()
                } catch (e) {
                  /* ignore */
                }
              }
            }, 'dsh-rqn: locale disposer')
          }
        } catch (e) {
          localeReady = false
        }

        const mountSlot = (slot, spec, Component, extraProps) => {
          try {
            ctx.slots.inject(slot, () =>
              ctx.slots.register(spec, (props) =>
                h(Boundary, null, h(Component, Object.assign({}, props, extraProps || {}))),
              ),
            )
          } catch (e) {
            try {
              console.warn(TAG, '这个宿主没有 "' + slot + '" 插槽，快捷导航无法挂载。')
            } catch (e2) {
              /* ignore */
            }
          }
        }

        // 图标轨本体：帧级浮动层，fixed 定位在宿主展开按钮正下方
        const spec = { name: 'shell.overlay', id: 'dsh-rqn-rail', order: 300, label: t('rail.ariaLabel') }
        if (localeReady) spec.locale = NS
        mountSlot('shell.overlay', spec, Rail, { ctx })
      },
    }
    }

        let disposeLayer = function () {};
        const apply = function () {
          const pref = readPref();
          const prev = disposeLayer;
          disposeLayer = applyTokens(theme, pref);
          try { prev(); } catch (e) { /* ignore */ }
        };
        ctx.effect(function () {
          apply();
          // 底图在 IndexedDB 里，异步读完再触发一次重算。
          // 首屏先按"无底图"渲染，避免为了等图片把界面白屏卡住。
          try { preloadBgImages(); } catch (e) { /* ignore */ }
          // 右侧栏快捷导航：只在这里挂一次（effect 只跑一次，apply 会被主题切换重复调用）
          try {
            const qn = makeQuicknavModule(React);
            const need = ['slots', 'sidebarRightTabs', 'sidebarRight'];
            const boot = function () { try { qn.apply(ctx); } catch (e) { try { console.warn('[zhuoer-theme] 快捷导航未激活:', e && e.message); } catch (e2) {} } };
            if (typeof ctx.inject === 'function') ctx.inject(need, boot); else boot();
          } catch (e) { /* ignore */ }
          const disposeResizeHint = setupResizeHint();
          const onMedia = function () { apply(); };
          let mq = null;
          try { mq = window.matchMedia('(prefers-color-scheme: dark)'); if (mq && mq.addEventListener) mq.addEventListener('change', onMedia); } catch (e) { /* ignore */ }
          listeners.add(apply);
          return function () {
            listeners.delete(apply);
            try { if (mq && mq.removeEventListener) mq.removeEventListener('change', onMedia); } catch (e) { /* ignore */ }
            try { disposeLayer(); } catch (e) { /* ignore */ }
            try { disposeResizeHint(); } catch (e) { /* ignore */ }
            try { const el = document.getElementById(STYLE_ID); if (el) el.remove(); } catch (e) { /* ignore */ }
            // 插件卸载/HMR：观察器与去抖/合并定时器都要断开，否则会继续挂在 document.body 上。
            try { clearTimeout(zrSkinT); zrSkinT = 0; } catch (e) { /* ignore */ }
            try { clearTimeout(lateProbeTimer); lateProbeTimer = 0; } catch (e) { /* ignore */ }
            try { if (zrSkinObs) { zrSkinObs.disconnect(); zrSkinObs = null; } } catch (e) { /* ignore */ }
            try { clearTimeout(hostReapplyTimer); hostReapplyTimer = 0; } catch (e) { /* ignore */ }
          };
        }, 'dsh-zhuoer-theme: token layer');

        try {
          ctx.slots.inject('settings.section', function () {
            return ctx.slots.register({
              name: 'settings.section',
              id: 'zhuoer-theme',
              order: 4,
              label: function () { return t('panel.section.title'); },
              // 注意：register() 上的 icon 字段是**无效**的（0.6.2 试过，宿主直接丢弃）。
              // 分区图标走另一个槽 settings.section.icon，见下面那段。
              inject: function () { return {}; },
            }, function (props) { return h(PanelBoundary, null, h(SkinSettings, props)); });
          });

          // 分区图标：宿主渲染导航行时是
          //   renderSlot('settings.section.icon', { size, active }, { only: row.id, fallback: 齿轮 })
          // 所以注册 id 必须等于分区 id（zhuoer-theme），宿主才会把这一份塞进我们那一行；
          // 没有贡献时它用内置齿轮兜底 —— 这就是 0.6.2 之前一直显示齿轮的真正原因。
          ctx.slots.inject('settings.section.icon', function () {
            return ctx.slots.register({
              name: 'settings.section.icon',
              id: 'zhuoer-theme',
            }, function (props) {
              var size = (props && props.size) || 16;
              return h('img', {
                src: BRAND_LOGO,
                width: size,
                height: size,
                alt: '',
                'aria-hidden': 'true',
                style: { display: 'block', borderRadius: Math.max(2, Math.round(size / 8)) + 'px' },
              });
            });
          });
        } catch (e) {
          try { console.warn('[zhuoer-theme] 设置页注册失败', (e && e.message) || e); } catch (e2) { /* ignore */ }
        }
      },
    };
  },
});
