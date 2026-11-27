/**
 * dsh-zhuoer-theme · Client 半边：Zhuoer 配色主题（DSH 皮肤）
 *
 * 做法：不注册新主题 —— 用 ctx.theme.overrideTokens() 把 Zhuoer 的调色板映射成
 * DSH 的 --dsw-alias-* token。唯一的例外是明暗三态（浅色 / 深色 / 跟随系统）：
 * 它和宿主「设置-通用设置」写的是同一份 preference，所以走 ctx.theme.setTheme()
 * 读写，不另存第二套（详见 #region mode-sync）。
 * 主题数据来自 Zhuoer Control UI（MIT）的 ui/public/themes/*.css + base.css。
 * 主题的唯一真源是 ./themes.mjs —— 改主题只改它，再 npm run sync:themes 生成这里的
 * 内联副本（宿主把插件合并进 /plugins/??a,b,c 加载，import.meta.url 不可靠，不能运行时 import）。
 *
 * 两条门禁，改完代码跑 npm run verify:all：
 *   verify:themes  内联副本与 themes.mjs 逐 token 相等 / token 齐全 / 对比度达标
 *   verify:host    宿主选择器与属性 与 contracts/host-contract.json 对账
 * 新增 [class*="xxx"] 或 [data-xxx] 这类宿主依赖时，verify:host 会要求登记用途与失效后果。
 */
window.__ModuleLoader__.load({
  id: 'dsh-zhuoer-theme',
  factory(require) {
    'use strict';
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useState, useRef } = React;

    // 复现用：卡片标题悬停态检查
    const SOURCE = 'dsh-zhuoer-theme';
    const STORE = 'dsh-zhuoer-theme:v1';

    // ---- 自检回传：把客户端执行情况 POST 给宿主端点（失败静默） ----
    const REPORT_URL = '/dsh-zhuoer-theme/api/report';
    function report(payload) {
      // 默认不落盘。探针在开发期有用，但在生产里是纯开销：每次 apply 数条 POST + 写盘，
      // 日志一天能涨到 MB 级（实测 297 次 apply 约 1,780 条记录）。
      // 需要复现时：localStorage['dsh-zhuoer-theme:debug'] = '1' 再刷新。
      if (typeof zrDebug === 'function' && !zrDebug()) return;
      try {
        fetch(REPORT_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-zhuoer-client': '1' },
          body: JSON.stringify(Object.assign({ at: new Date().toISOString(), href: String(location && location.href || '').slice(0, 200) }, payload)),
        }).catch(function () {});
      } catch (e) { /* ignore */ }
    }
    // ---- 一次性 token 快照（排障用）----
    // 自定义主题生效时上报一次真实 token 表，每页只报一次。
    // 目的：确认「规则改完了但界面没变」到底是规则没跑，还是那块界面根本不读这些 token。
    let zrDumpDone = false;
    function zrDumpTokensOnce(scheme, pref, tokens) {
      if (zrDumpDone) return;
      // 排障已完成（底纹满幅 vs 线稿那条根因），探针收回到调试开关后面：
      // 需要复现时 localStorage['dsh-zhuoer-theme:debug'] = '1' 再刷新。
      if (!zrDebug()) return;
      let c = null;
      try { c = customSpec(pref); } catch (e) { c = null; }
      if (!c) return;
      zrDumpDone = true;
      const keys = [
        '--dsw-alias-bg-base', '--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2',
        '--dsw-alias-bg-layer-3', '--dsw-alias-bg-layer-4', '--dsw-alias-bg-mask-1',
        '--dsw-alias-settings-card-fill', '--dsw-alias-card-fill', '--dsw-specific-bubble',
        '--dsw-alias-label-primary', '--dsw-alias-label-secondary', '--dsw-alias-label-tertiary',
      ];
      const t = {};
      keys.forEach(function (k) { t[k] = String(tokens[k] || ''); });
      const info = {
        phase: 'token-dump',
        scheme: scheme,
        base: c.base,
        autoDark: !!c.autoDark,
        lightKeys: Object.keys(c.light || {}),
        darkKeys: Object.keys(c.dark || {}),
        tokens: t,
        // 一次把「所有自定义主题」的锚点也带回来：
        // 用户反馈「三套有问题、一套没问题」，只报当前生效那套看不出差别。
        themes: (function () {
          const list = (pref && pref.customThemes) || [];
          return list.map(function (c) {
            return {
              id: c && c.id, label: c && c.label, base: c && c.base,
              autoDark: !!(c && c.autoDark),
              light: (c && c.light) || {}, dark: (c && c.dark) || {},
              // 底纹是逐主题配置的：同样一套锚点，开不开底纹观感差很多。
              bg: c && c.bg ? { source: c.bg.source, opacity: c.bg.opacity, style: c.bg.style, key: c.bg.key ? 1 : 0, keyLight: c.bg.keyLight ? 1 : 0 } : null,
            };
          });
        })(),
        // 半透明面的取样：用户反馈「透明底卡片文字发虚、不透明卡片正常」。
        // 光有 token 值判断不了，必须知道那些元素到底用了什么类名与 alpha。
        semi: (function () {
          const out = [];
          try {
            const root = document.querySelector('[class*="_centerCol"]') || document.body;
            if (!root) return out;
            const els = root.querySelectorAll('div,section,article,li');
            for (let i = 0; i < els.length && out.length < 12; i++) {
              const el = els[i];
              let cs = null;
              try { cs = getComputedStyle(el); } catch (e) { continue; }
              const bg = String(cs.backgroundColor || '');
              const m = bg.match(/rgba?\(([^)]+)\)/);
              if (!m) continue;
              const parts = m[1].split(',').map(function (x) { return parseFloat(x); });
              const a = parts.length > 3 ? parts[3] : 1;
              if (!(a > 0.02 && a < 0.98)) continue;
              const r = el.getBoundingClientRect();
              if (r.width < 160 || r.height < 50) continue;
              out.push({
                cls: String(el.className || '').slice(0, 100),
                bg: bg, alpha: a,
                w: Math.round(r.width), h: Math.round(r.height),
                color: String(cs.color || ''),
              });
            }
          } catch (e) { /* ignore */ }
          return out;
        })(),
      };
      // 不走 report()：那条通道默认被 zrDebug() 关掉，而这次就是要它在常态下报一次。
      try {
        fetch(REPORT_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-zhuoer-client': '1' },
          body: JSON.stringify(Object.assign({ at: new Date().toISOString() }, info)),
        }).catch(function () {});
      } catch (e) { /* ignore */ }
    }

    // ---- 半透明面取样（排障用）----
    // 为什么需要：用户反馈「底纹之上每一层都半透明，文字对比被冲淡」。
    // 只看 token 判断不了，必须知道那些容器到底用了 rgba / 背景图 / backdrop 还是 opacity。
    function zrSemiProbe() {
      const out = [];
      try {
        const root = document.querySelector('[class*="_centerCol"]');
        if (!root) return out;
        const els = root.querySelectorAll('div,section,article,li,main');
        for (let i = 0; i < els.length && out.length < 15; i++) {
          const el = els[i];
          let cs = null;
          try { cs = getComputedStyle(el); } catch (e) { continue; }
          const r = el.getBoundingClientRect();
          if (r.width < 120 || r.height < 30) continue;
          const bg = String(cs.backgroundColor || '');
          const m = bg.match(/rgba?\(([^)]+)\)/);
          let a = 1;
          if (m) {
            const p = m[1].split(',').map(function (x) { return parseFloat(x); });
            a = p.length > 3 ? p[3] : 1;
          }
          const img = String(cs.backgroundImage || 'none');
          const bd = String(cs.backdropFilter || 'none');
          const op = parseFloat(cs.opacity || '1');
          const translucent = a > 0.02 && a < 0.98;
          const hasImg = img !== 'none';
          const hasBd = bd !== 'none';
          const lowOp = op < 0.95;
          if (!translucent && !hasImg && !hasBd && !lowOp) continue;
          out.push({
            cls: String(el.className || '').slice(0, 110),
            bg: bg, alpha: a,
            img: hasImg ? img.slice(0, 70) : '',
            bd: hasBd ? bd : '',
            op: op,
            color: String(cs.color || ''),
            w: Math.round(r.width), h: Math.round(r.height),
          });
        }
      } catch (e) { /* ignore */ }
      return out;
    }

    // 底图解析探针：只在 debug 开关下上报，用来定位「某个方案下底图不出现」。
    // 记录：主题 bg 原始字段、内存缓存是否命中、解析出的 URL、以及伪元素的实际计算样式。
    function zrBgProbe(payload) {
      if (!zrDebug()) return;
      try {
        fetch(REPORT_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-zhuoer-client': '1' },
          body: JSON.stringify(Object.assign({ at: new Date().toISOString(), phase: 'bg-probe' }, payload)),
        }).catch(function () {});
      } catch (e) { /* ignore */ }
    }

    // 步骤图标探针：报告图标元素的**实际计算颜色**，用来核对「语义色有没有真的上上去」。
    function zrIconProbe() {
      // 不受 zrDebug 门控：每次会话最多发 6 次，量的是「图标实际计算颜色」这一个事实。
      // 用 MutationObserver 采样（与 zrHookSemiProbe 同一手法）：插件初始化时聊天区还没渲染，
      // 一次性取样只会得到 0 个图标；等 DOM 稳定后再取，才能覆盖历史上出现过的各类活动。
      try { if (window.__zrIconProbed) return; window.__zrIconProbed = true; } catch (e2) { /* ignore */ }
      try {
        let sent = 0;
        const seen = {};
        const fire = function () {
          if (sent >= 6) return;
          const list = [];
          for (const el of Array.from(document.querySelectorAll('[data-step-process-icon]'))) {
            const btn = el.closest('[data-process-activity]');
            const act = btn ? btn.getAttribute('data-process-activity') : '?';
            const cs = getComputedStyle(el);
            const key = act + '=' + cs.color;
            if (seen[key]) continue;
            seen[key] = 1;
            list.push({ activity: act, color: cs.color, text: btn ? String(btn.innerText || '').slice(0, 16) : '' });
          }
          if (!list.length) return;
          sent++;
          fetch(REPORT_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-zhuoer-client': '1' },
            body: JSON.stringify({ at: new Date().toISOString(), phase: 'icon-probe', n: sent, icons: list }),
          }).catch(function () {});
        };
        setTimeout(fire, 900);
        const root = document.body;
        if (root && typeof MutationObserver === 'function') {
          let t = 0;
          const mo = new MutationObserver(function () { clearTimeout(t); t = setTimeout(fire, 1200); });
          mo.observe(root, { childList: true, subtree: true });
          setTimeout(function () { mo.disconnect(); }, 120000);
        }
      } catch (e) { /* ignore */ }
    }

    // 面板切换后再取样：页面加载时看到的是聊天页，抓不到插件面板。
    function zrHookSemiProbe(scheme) {
      if (!zrDebug()) return;
      try {
        if (window.__zrSemiHooked) return;
        window.__zrSemiHooked = true;
        let sent = 0;
        let timer = 0;
        const fire = function () {
          if (sent >= 6) return;
          sent++;
          const semi = zrSemiProbe();
          try {
            fetch(REPORT_URL, {
              method: 'POST',
              headers: { 'content-type': 'application/json', 'x-zhuoer-client': '1' },
              body: JSON.stringify({ at: new Date().toISOString(), phase: 'semi-probe', scheme: scheme, n: sent, semi: semi }),
            }).catch(function () {});
          } catch (e) { /* ignore */ }
        };
        const root = document.querySelector('[class*="_centerCol"]');
        if (root && typeof MutationObserver === 'function') {
          const mo = new MutationObserver(function () {
            clearTimeout(timer);
            timer = setTimeout(fire, 1500);
          });
          mo.observe(root, { childList: true, subtree: true });
        }
        setTimeout(fire, 2500);
      } catch (e) { /* ignore */ }
    }

    // 版本号唯一源：面板文案与自检回传都用它，别再出现「构建 0.1.101」这种漂移。
    const PVERSION = '0.6.44';
    // 诊断探针总闸：默认关闭，开启方式 localStorage['dsh-zhuoer-theme:debug'] = '1'。
    // 下面若干探针会在每次 apply 时全文档遍历 DOM、逐元素 getComputedStyle、扫 styleSheets，
    // 是「启动 / 切主题卡顿」的主要来源之一，只在排障时打开。
    function zrDebug() {
      try { return window.localStorage.getItem('dsh-zhuoer-theme:debug') === '1'; } catch (e) { return false; }
    }
    report({ phase: 'bundle-evaluated' });
    report({ phase: 'factory-entered' });
    // 全局 error 监听：句柄留成模块级，apply() 里挂进 ctx.effect，卸载/HMR 时随 effect 回收（doctor K3）。
    const onWindowError = function (ev) {
      report({ phase: 'window-error', message: String((ev && ev.message) || ev).slice(0, 300), file: String((ev && ev.filename) || '').slice(0, 200), line: ev && ev.lineno });
    };

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
    // >>> i18n:begin
    const I18N = {
      zh: {
        'rail.ariaLabel': '右侧栏快捷导航',
        'rail.anchorLabel': '快捷导航锚点',
        'rail.empty': '右侧栏还没有可直达的标签页',
        'rail.noService': '当前宿主没有右侧栏服务，无法直达',
        'rail.openFailed': '打开失败：该标签当前不可用',
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
        'panel.header.title': '外观',
        'panel.header.count': '共 {n} 套配色',
        'panel.header.live': '改动即时生效',
        'panel.theme.title': '配色主题',
        'panel.theme.note': '选中即应用；深浅模式决定这组配色的哪一套生效',
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
        'panel.bg.opacityCap': '满格 = 70% 不透明度',
        'panel.bg.opacityAria': '底图可见度（滑块 100% 对应实际不透明度 70%）',
        'panel.bg.showRow': '显示',
        'panel.bg.showEmpty': '新建会话页',
        'panel.bg.showSession': '会话中',
        'panel.bg.offHint': '当前未启用底图，以上样式会在选中来源后生效。',
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
        'panel.ed.advanced': '高级 · 逐个 token',
        'panel.ed.advancedNote': '锚点背后的 156 个 token；文字类低于 3:1 会自动回退',
        'panel.ed.advShow': '展开全部 token',
        'panel.ed.advHide': '收起',
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
        'panel.chat.apply': '应用',
        'panel.chat.modify': '修改',
        'panel.chat.applied': '已应用到 DSH',
        'panel.chat.ovApplied': '已应用 · 覆盖 {n} 键',
        'panel.chat.sampled': '已按参考图取色',
        'panel.chat.ovSoft': '{s} 键因对比度回退',
        'panel.chat.preview': '预览',
        'panel.chat.editing': '修改中',
        'panel.chat.cancel': '取消',
        'panel.chat.applyEdited': '应用这套',
        'panel.chat.nameAria': '主题名',
        'panel.chat.fail': '应用失败',
        'panel.chat.limitErr': '自定义主题已达上限（{n} 套），先删一套再试',
        'panel.chat.texOff': '底纹：未启用 · 想要就说「加个底纹」',
        'panel.ed.drop': '丢弃',
        'panel.ed.pickFromImage': '从图片取色',
        'panel.ed.picking': '取色中…',
        'panel.ed.pickImage': '选择图片…',
        'panel.ed.clear': '清除',
        'panel.ed.bgSection': '底图',
        'panel.ed.bgNote': '单张 ≤ 3 MiB，存本机 IndexedDB',
        'panel.ed.bgSourceAria': '主题底图来源',
        'panel.ed.bgFollowGlobal': '跟随全局',
        'panel.ed.bgThemeOwn': '用主题底纹',
        'panel.ed.bgCustom': '用我的照片',
        'panel.ed.bgNone': '不用底图',
        'panel.ed.imageRow': '图片',
        'panel.ed.bgPreviewAlt': '主题底图预览',
        'panel.ed.bgStoredHint': '存 IndexedDB，单张 ≤ 3 MiB',
        'panel.ed.opacityRow': '可见度',
        'panel.ed.bgOpacityAria': '主题底图可见度',
        'panel.ed.shapeSection': '形状与字体',
        'panel.ed.shapeNote': '只影响本主题，不动其他主题',
        'panel.ed.radiusRow': '圆角',
        'panel.ed.sharpRow': '第三方控件',
        'panel.ed.sharpOn': '压平第三方插件的硬编码圆角与描边',
        'panel.ed.sharpNote': '只影响自带圆角/边线的插件控件（如左侧栏分段按钮）；主题本身是直角时自动生效。',
        'panel.ed.radiusAria': '圆角大小',
        'panel.ed.radiusSquare': '直角',
        'panel.ed.radiusSmall': '小',
        'panel.ed.radiusNormal': '标准',
        'panel.ed.radiusLarge': '大',
        'panel.ed.radiusXL': '特大',
        'panel.ed.bodyFont': '正文字体',
        'panel.ed.chatFont': '聊天字体',
        'panel.ed.followBase': '跟随 {theme}',
        'panel.type.title': '排版',
        'panel.type.note': '放大文字（界面文字 + 对话正文），不改布局尺寸——几何缩放会和宿主的侧栏拖拽打架，这条路已被门禁禁止',
        'panel.type.sizeRow': '正文字号',
        'panel.type.sizeAria': '正文字号',
        'panel.a11y.hitRow': '点击区',
        'panel.a11y.procRow': '步骤图标',
        'panel.a11y.procOn': '用语义色',
        'panel.a11y.procNote': '想=紫 / 跑=蓝 / 看=绿 / 改与问=琥珀',
        'panel.type.mdHeadRow': '标题配色',
        'panel.type.mdHeadAria': 'Markdown 标题配色',
        'panel.type.mdHeadFollow': '跟随正文',
        'panel.type.mdHeadSoft': '品牌色·淡',
        'panel.type.mdHeadBrand': '品牌色',
        'panel.type.mdHeadNote': '从主题的品牌色与正文色推导，换主题/换强调色会自动跟着变',
        'panel.type.mdRow': '排版节奏',
        'panel.type.mdAria': 'Markdown 排版节奏',
        'panel.type.mdCompact': '紧凑',
        'panel.type.mdNormal': '标准',
        'panel.type.mdRoomy': '舒展',
        'panel.type.mdNote': '只改行高/段距/标题尺度，字号仍由上一行控制',
        'panel.a11y.hitOn': '放大到 44×44',
        'panel.a11y.hitNote': '图标按钮最小 44px，触屏更稳；会略微撑开布局',
        'panel.type.pxHint': '正文约 {px}px',
        'panel.type.scaleMiss': '界面文字缩放未生效：没从宿主样式表里读到可缩放的 font-size 规则（把这条告诉我，我来补通路）',
        'panel.type.widthRow': '对话宽度',
        'panel.type.widthAria': '对话正文宽度（像素）',
        'panel.type.widthPh': '920',
        'panel.type.widthHint': '留空 = 默认 920px（窗口放不下时自动收窄）；填 640–1600 覆盖它。只改宽度变量，不动布局',
        'panel.type.fontRow': '字体',
        'panel.type.fontPh': '用主题自带字体',
        'panel.type.fontAria': '界面字体族',
        'panel.type.fontHint': '只列随插件分发的字体，选不到不会静默回落到系统默认',
        'panel.scale.small': '小',
        'panel.scale.default': '默认',
        'panel.scale.large': '大',
        'panel.scale.xl': '特大',
        'panel.scale.xxl': '超大',
        'panel.accent.title': '强调色',
        'panel.accent.note': '替换主题品牌色，作用于按钮与链接',
        'panel.accent.row': '颜色',
        'panel.accent.swatchAria': '强调色 {hex}',
        'panel.accent.custom': '自定义强调色',
        'panel.accent.reset': '恢复主题色',
        'panel.qn.title': '右侧栏快捷导航',
        'panel.qn.note': '顶栏「打开右侧边栏」下方的图标轨，点一下直达对应标签',
        'panel.qn.row': '显示',
        'panel.qn.aria': '快捷导航显示方式',
        'panel.qn.optThree': '三个 · 悬停展开',
        'panel.qn.optAll': '全部显示',
        'panel.qn.optOff': '关闭',
        'panel.reset.armed': '再点一次确认',
        'panel.reset.label': '恢复默认设置',
        'panel.reset.hint': '将清除主题、模式、底图、字号、强调色与字体的全部自定义',
        'theme.zhuoer': 'Zhuoer 原版红',
        'theme.absolutely': 'Absolutely · 极简',
        'theme.beacon': '灯塔 · Beacon',
        'theme.crt': 'CRT · 终端',
        'theme.dash': 'Dash · 琥珀',
        'theme.knot': 'Knot · 绳结',
        'theme.manuscript': '手稿 · Manuscript',
        'theme.miami': '迈阿密 · Miami',
        'theme.phosphor': '荧光 · Phosphor',
        'theme.rose': '桃红 · Rose',
        'theme.tide': '潮汐 · Tide',
        'theme.vintagePaper': '复古纸 · Vintage Paper',
        'panel.foot.build': '构建 {ver} · 持续保持样式表末位，压制并存插件的覆盖 · 偏好只存本机 localStorage',
        'panel.io.jsonAria': '主题 JSON',
        'panel.io.exportTitle': '导出主题 JSON',
        'panel.io.importTitle': '导入主题 JSON',
        'panel.io.close': '关闭',
        'panel.io.exportHint': '全选复制即可分享；只含当前这套主题的锚点（不含派生出的 224 个 token），自定义底图不会随 JSON 导出。',
        'panel.io.importHint': '粘贴对方导出的 JSON，导入后自动加进主题列表。',
        'panel.io.import': '导入',
        'panel.io.parseErr': 'JSON 解析失败或字段不合法（需要 id/label/base + dark/light 里的 --dsw-alias-* 颜色）',
        'panel.err.title': '主题面板渲染出错：{msg}',
        'panel.err.retry': '重试',
        'panel.err.reload': '刷新页面',
        'panel.err.hint': '如果反复出现，把上面的信息发给作者。',
        'panel.custom.newLabel': '自定义 {n}',
        'panel.custom.copySuffix': ' 副本',
        'panel.custom.limitErr': '自定义主题最多 {n} 套，已达上限；先删掉一套再新建或导入。',
        'panel.custom.dropped': '有 {n} 套自定义主题超出上限 {max}，已被忽略：{ids}',
        'panel.custom.droppedClose': '知道了',
        'panel.a11y.live': '已切换到 {label}',
        'panel.theme.deleteConfirm': '再点一次删除',
        'panel.alert.imgMax': '图片不能超过 3 MiB',
        'panel.alert.imgStore': '这张图太大，浏览器本地存储放不下，请换一张更小的图片。',
        'anchor.bg': '底色',
        'anchor.text': '文字',
        'anchor.border': '边框',
        'anchor.brand': '品牌主色',
        'anchor.brand2': '品牌次色',
        'anchor.danger': '危险',
        'anchor.warn': '警告',
        'anchor.success': '成功',
        'preset.glass': '玻璃拟态',
        'preset.brutal': '新粗野主义',
        'preset.swiss': '瑞士国际',
        'preset.editorial': '编辑排版',
        'preset.luxe': '奢华极简',
        'preset.organic': '有机自然',
        'preset.morandi': '莫兰迪柔和',
        'preset.paper': '纸张灰白',
        'preset.cyber': '赛博终端',
        'preset.aurora': '极光界面',
        'preset.devterm': '开发者终端',
        'preset.deepspace': '深空黑',
        'panel.mdfine.title': 'Markdown 精细化',
        'panel.mdfine.note': '只改元素长相：标题字号、代码块、表格、引用块',
        'panel.mdfine.headRow': '标题字号',
        'panel.mdfine.headAria': 'Markdown 标题字号',
        'panel.mdfine.headTheme': '跟随主题',
        'panel.mdfine.headCompact': '紧凑',
        'panel.mdfine.headClear': '分级明显',
        'panel.mdfine.headNote': '跟随主题＝用宿主定义的标题字号；分级明显＝标题之间拉得更开',
        'panel.mdfine.codeRow': '代码块',
        'panel.mdfine.codeAria': 'Markdown 代码块样式',
        'panel.mdfine.codeNone': '无边框',
        'panel.mdfine.codeLine': '细边框',
        'panel.mdfine.codeCard': '卡片',
        'panel.mdfine.codeNote': '卡片＝加底色与圆角，代码块从正文里浮出来',
        'panel.mdfine.tableRow': '表格',
        'panel.mdfine.tableAria': 'Markdown 表格样式',
        'panel.mdfine.tablePlain': '默认',
        'panel.mdfine.tableLine': '带线',
        'panel.mdfine.tableZebra': '斑马纹',
        'panel.mdfine.tableNote': '带线＝单元格加边框；斑马纹＝再加隔行底色与表头底色',
        'panel.mdfine.quoteRow': '引用块',
        'panel.mdfine.quoteAria': 'Markdown 引用块样式',
        'panel.mdfine.quotePlain': '默认',
        'panel.mdfine.quoteStrong': '加重',
        'panel.mdfine.quoteNote': '加重＝左边框加粗并加淡底色',
        'panel.presets.note': '选中一套风格，会新建一套可继续微调的自定义主题。',
        'panel.custom.title': '自定义配色',
        'panel.custom.note': '在自定义主题上逐色微调；保存后写入本机。',
        'panel.custom.empty': '当前是内置主题。新建一套后，可以逐组改锚点色。',
        'panel.custom.basedOn': '基于 {theme}',
        'panel.prefs.title': '全局偏好',
        'panel.prefs.note': '这些设置跨主题生效。',
        'panel.ed.baseSection': '基色与明暗',
        'panel.ed.base': '克隆来源',
        'panel.ed.baseAria': '克隆来源主题',
        'panel.ed.previewNote': '实时预览：改锚点先落在这里，保存后才写入本机。',
        'panel.ed.band.base': '背景与表面',
        'panel.ed.band.text': '文字',
        'panel.ed.band.line': '描边',
        'panel.ed.band.brand': '品牌',
        'panel.ed.band.semantic': '语义色',
        'panel.ed.defaultAria': '默认 {hex}',
        'panel.ed.undo': '撤销',
        'panel.ed.resetAll': '恢复克隆值',
        'panel.ed.resetAllTitle': '清空当前明暗的锚点覆盖',
        'panel.ed.toolsShow': '展开 AI 与取色',
        'panel.ed.toolsHide': '收起 AI 与取色',
        'panel.bg.opacityCapCapped': '满格 = {p}% 不透明度（已按对比度限制）',
      },
      en: {
        'rail.ariaLabel': 'Right sidebar quick nav',
        'rail.anchorLabel': 'Quick nav anchor',
        'rail.empty': 'No right-sidebar tabs to jump to',
        'rail.noService': 'This host has no right-sidebar service',
        'rail.openFailed': 'Could not open that tab',
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
        'panel.header.title': 'Appearance',
        'panel.header.count': '{n} palettes',
        'panel.header.live': 'Changes apply instantly',
        'panel.theme.title': 'Color theme',
        'panel.theme.note': 'Picking applies immediately; light/dark decides which of the two palettes applies',
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
        'panel.bg.opacityCap': 'full = 70% opacity',
        'panel.bg.opacityAria': 'Background visibility (100% on the slider equals 70% actual opacity)',
        'panel.bg.showRow': 'Show on',
        'panel.bg.showEmpty': 'New session page',
        'panel.bg.showSession': 'In session',
        'panel.bg.offHint': 'Background is off; these styles apply once you pick a source.',
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
        'panel.ed.advanced': 'Advanced · per token',
        'panel.ed.advancedNote': 'All 156 tokens behind the anchors; text below 3:1 reverts automatically',
        'panel.ed.advShow': 'Show all tokens',
        'panel.ed.advHide': 'Collapse',
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
        'panel.chat.apply': 'Apply',
        'panel.chat.modify': 'Modify',
        'panel.chat.applied': 'Applied to DSH',
        'panel.chat.ovApplied': 'Applied · overrides {n}',
        'panel.chat.sampled': 'Sampled from the reference image',
        'panel.chat.ovSoft': '{s} reverted for contrast',
        'panel.chat.preview': 'Preview',
        'panel.chat.editing': 'Editing',
        'panel.chat.cancel': 'Cancel',
        'panel.chat.applyEdited': 'Apply these',
        'panel.chat.nameAria': 'Theme name',
        'panel.chat.fail': 'Failed to apply',
        'panel.chat.limitErr': 'Custom theme limit reached ({n}); delete one first',
        'panel.ed.drop': 'Discard',
        'panel.ed.pickFromImage': 'Pick colors from image',
        'panel.ed.picking': 'Extracting…',
        'panel.ed.pickImage': 'Choose image…',
        'panel.ed.clear': 'Clear',
        'panel.ed.bgSection': 'Background image',
        'panel.ed.bgNote': 'One image ≤ 3 MiB, stored in local IndexedDB',
        'panel.ed.bgSourceAria': 'Theme background source',
        'panel.ed.bgFollowGlobal': 'Follow global',
        'panel.ed.bgThemeOwn': 'Theme texture',
        'panel.ed.bgCustom': 'My photo',
        'panel.ed.bgNone': 'No background',
        'panel.ed.imageRow': 'Image',
        'panel.ed.bgPreviewAlt': 'Theme background preview',
        'panel.ed.bgStoredHint': 'Stored in IndexedDB, ≤ 3 MiB per image',
        'panel.ed.opacityRow': 'Visibility',
        'panel.ed.bgOpacityAria': 'Theme background visibility',
        'panel.ed.shapeSection': 'Shape & fonts',
        'panel.ed.shapeNote': 'Affects this theme only',
        'panel.ed.radiusRow': 'Corner radius',
        'panel.ed.sharpRow': 'Third-party controls',
        'panel.ed.sharpOn': 'Flatten hard-coded radii and outlines in plugin UI',
        'panel.ed.sharpNote': 'Only affects plugin controls that bring their own radius/borders (for example the sidebar segmented buttons). Turns on automatically when the theme itself is square.',
        'panel.ed.radiusAria': 'Corner radius size',
        'panel.ed.radiusSquare': 'Square',
        'panel.ed.radiusSmall': 'Small',
        'panel.ed.radiusNormal': 'Normal',
        'panel.ed.radiusLarge': 'Large',
        'panel.ed.radiusXL': 'Extra large',
        'panel.ed.bodyFont': 'Body font',
        'panel.ed.chatFont': 'Chat font',
        'panel.ed.followBase': 'Follow {theme}',
        'panel.type.title': 'Typography',
        'panel.type.note': 'Enlarges text (UI copy and message body) without touching layout geometry — geometric zoom fights the host’s sidebar drag and is banned by the gate',
        'panel.type.sizeRow': 'Message text size',
        'panel.type.sizeAria': 'Message text size',
        'panel.a11y.hitRow': 'Hit target',
        'panel.a11y.procRow': 'Step icons',
        'panel.a11y.procOn': 'Semantic colours',
        'panel.a11y.procNote': 'Think = violet / run = blue / read = green / write & ask = amber',
        'panel.type.mdHeadRow': 'Heading colour',
        'panel.type.mdHeadAria': 'Markdown heading colour',
        'panel.type.mdHeadFollow': 'Follow body',
        'panel.type.mdHeadSoft': 'Brand (soft)',
        'panel.type.mdHeadBrand': 'Brand',
        'panel.type.mdHeadNote': 'Derived from the theme brand and body colours — follows theme/accent changes',
        'panel.type.mdRow': 'Reading rhythm',
        'panel.type.mdAria': 'Markdown reading rhythm',
        'panel.type.mdCompact': 'Compact',
        'panel.type.mdNormal': 'Standard',
        'panel.type.mdRoomy': 'Roomy',
        'panel.type.mdNote': 'Line height, paragraph spacing and heading scale only — font size stays with the row above',
        'panel.a11y.hitOn': 'Enlarge to 44×44',
        'panel.a11y.hitNote': 'Icon buttons get a 44px floor for touch; layout widens slightly',
        'panel.type.pxHint': '≈{px}px body text',
        'panel.type.scaleMiss': 'UI text scaling did not take effect: no scalable font-size rule was found in the host stylesheets (please report this line)',
        'panel.type.widthRow': 'Transcript width',
        'panel.type.widthAria': 'Transcript width in pixels',
        'panel.type.widthPh': '920',
        'panel.type.widthHint': 'Empty = 920 px by default (narrows automatically on small windows); enter 640–1600 to override. Only the width variable changes, never layout',
        'panel.type.fontRow': 'Font',
        'panel.type.fontPh': 'Use the theme’s own font',
        'panel.type.fontAria': 'UI font family',
        'panel.type.fontHint': 'Lists only fonts shipped with the plugin; an unavailable family never silently falls back',
        'panel.scale.small': 'Small',
        'panel.scale.default': 'Default',
        'panel.scale.large': 'Large',
        'panel.scale.xl': 'Extra large',
        'panel.scale.xxl': 'Huge',
        'panel.accent.title': 'Accent color',
        'panel.accent.note': 'Replaces the theme brand color on buttons and links',
        'panel.accent.row': 'Color',
        'panel.accent.swatchAria': 'Accent {hex}',
        'panel.accent.custom': 'Custom accent color',
        'panel.accent.reset': 'Restore theme color',
        'panel.qn.title': 'Right sidebar quick nav',
        'panel.qn.note': 'The icon rail under “Open right sidebar”; one click jumps to the matching tab',
        'panel.qn.row': 'Show',
        'panel.qn.aria': 'Quick nav display mode',
        'panel.qn.optThree': 'Three · expand on hover',
        'panel.qn.optAll': 'Show all',
        'panel.qn.optOff': 'Off',
        'panel.reset.armed': 'Click again to confirm',
        'panel.reset.label': 'Restore default settings',
        'panel.reset.hint': 'Clears all theme, mode, background, font size, accent color and font customizations',
        'theme.zhuoer': 'Zhuoer 原版红',
        'theme.absolutely': 'Absolutely · 极简',
        'theme.beacon': '灯塔 · Beacon',
        'theme.crt': 'CRT · 终端',
        'theme.dash': 'Dash · 琥珀',
        'theme.knot': 'Knot · 绳结',
        'theme.manuscript': '手稿 · Manuscript',
        'theme.miami': '迈阿密 · Miami',
        'theme.phosphor': '荧光 · Phosphor',
        'theme.rose': '桃红 · Rose',
        'theme.tide': '潮汐 · Tide',
        'theme.vintagePaper': 'Vintage Paper',
        'panel.foot.build': 'Build {ver} · keeps our stylesheet last so it wins over other plugins · settings stay in local localStorage',
        'panel.io.jsonAria': 'Theme JSON',
        'panel.io.exportTitle': 'Export theme JSON',
        'panel.io.importTitle': 'Import theme JSON',
        'panel.io.close': 'Close',
        'panel.io.exportHint': 'Select all and copy to share; contains this theme’s anchors only (not the 224 derived tokens). A custom background image is not included.',
        'panel.io.importHint': 'Paste JSON exported by someone else; it is added to the theme list.',
        'panel.io.import': 'Import',
        'panel.io.parseErr': 'JSON could not be parsed or is invalid (needs id/label/base plus --dsw-alias-* colors under dark/light)',
        'panel.err.title': 'The theme panel crashed: {msg}',
        'panel.err.retry': 'Retry',
        'panel.err.reload': 'Reload page',
        'panel.err.hint': 'If this keeps happening, send the message above to the author.',
        'panel.custom.newLabel': 'Custom {n}',
        'panel.custom.copySuffix': ' copy',
        'panel.custom.limitErr': 'At most {n} custom themes; delete one before creating or importing another.',
        'panel.custom.dropped': '{n} custom theme(s) exceed the limit of {max} and were ignored: {ids}',
        'panel.custom.droppedClose': 'Got it',
        'panel.a11y.live': 'Switched to {label}',
        'panel.theme.deleteConfirm': 'Click again to delete',
        'panel.alert.imgMax': 'Image must be under 3 MiB',
        'panel.alert.imgStore': 'This image is too large for local browser storage; please pick a smaller one.',
        'anchor.bg': 'Background',
        'anchor.text': 'Text',
        'anchor.border': 'Border',
        'anchor.brand': 'Brand primary',
        'anchor.brand2': 'Brand secondary',
        'anchor.danger': 'Danger',
        'anchor.warn': 'Warning',
        'anchor.success': 'Success',
        'preset.glass': 'Glassmorphism',
        'preset.brutal': 'Neo-brutalism',
        'preset.swiss': 'Swiss International',
        'preset.editorial': 'Editorial',
        'preset.luxe': 'Luxury minimal',
        'preset.organic': 'Organic',
        'preset.morandi': 'Morandi',
        'preset.paper': 'Paper',
        'preset.cyber': 'Cyber terminal',
        'preset.aurora': 'Aurora',
        'preset.devterm': 'Developer terminal',
        'preset.deepspace': 'Deep space',
        'panel.chat.texOff': 'Texture: not enabled · say "add a texture" if you want one',
        'panel.mdfine.title': 'Markdown refinement',
        'panel.mdfine.note': 'Element looks only: heading size, code block, table, quote',
        'panel.mdfine.headRow': 'Heading size',
        'panel.mdfine.headAria': 'Markdown heading size',
        'panel.mdfine.headTheme': 'Follow theme',
        'panel.mdfine.headCompact': 'Compact',
        'panel.mdfine.headClear': 'Clear levels',
        'panel.mdfine.headNote': 'Follow theme uses the host heading sizes; Clear levels spaces them out further',
        'panel.mdfine.codeRow': 'Code block',
        'panel.mdfine.codeAria': 'Markdown code block style',
        'panel.mdfine.codeNone': 'No border',
        'panel.mdfine.codeLine': 'Thin border',
        'panel.mdfine.codeCard': 'Card',
        'panel.mdfine.codeNote': 'Card adds a background and radius so the block lifts off the text',
        'panel.mdfine.tableRow': 'Table',
        'panel.mdfine.tableAria': 'Markdown table style',
        'panel.mdfine.tablePlain': 'Default',
        'panel.mdfine.tableLine': 'Bordered',
        'panel.mdfine.tableZebra': 'Zebra',
        'panel.mdfine.tableNote': 'Bordered adds cell borders; Zebra adds row shading and a header background',
        'panel.mdfine.quoteRow': 'Quote',
        'panel.mdfine.quoteAria': 'Markdown quote style',
        'panel.mdfine.quotePlain': 'Default',
        'panel.mdfine.quoteStrong': 'Strong',
        'panel.mdfine.quoteNote': 'Strong thickens the left rule and adds a tinted background',
        'panel.presets.note': 'Pick a style to start a customizable theme you can keep tuning.',
        'panel.custom.title': 'Custom colors',
        'panel.custom.note': 'Tune a custom theme color by color; saving writes it to this device.',
        'panel.custom.empty': 'This is a built-in theme. Create a custom one to tune its anchor colors.',
        'panel.custom.basedOn': 'Based on {theme}',
        'panel.prefs.title': 'Global preferences',
        'panel.prefs.note': 'These settings apply across themes.',
        'panel.ed.baseSection': 'Base & mode',
        'panel.ed.base': 'Base theme',
        'panel.ed.baseAria': 'Base theme',
        'panel.ed.previewNote': 'Live preview: anchor changes show here first; saving writes them to this device.',
        'panel.ed.band.base': 'Background & surfaces',
        'panel.ed.band.text': 'Text',
        'panel.ed.band.line': 'Borders',
        'panel.ed.band.brand': 'Brand',
        'panel.ed.band.semantic': 'Semantic colors',
        'panel.ed.defaultAria': 'Default {hex}',
        'panel.ed.undo': 'Undo',
        'panel.ed.resetAll': 'Reset to base',
        'panel.ed.resetAllTitle': 'Clear anchor overrides for this mode',
        'panel.ed.toolsShow': 'Show AI & image tools',
        'panel.ed.toolsHide': 'Hide AI & image tools',
        'panel.bg.opacityCapCapped': 'full = {p}% opacity (capped for contrast)',
      },
      de: {
        'rail.ariaLabel': 'Schnellnavigation in der rechten Seitenleiste',
        'rail.anchorLabel': 'Anker der Schnellnavigation',
        'rail.empty': 'Keine Tabs in der rechten Seitenleiste zum Anspringen',
        'rail.noService': 'Dieser Host hat keinen Dienst für die rechte Seitenleiste',
        'rail.openFailed': 'Dieser Tab ließ sich nicht öffnen',
        'panel.brand.title': 'Markenplatz',
        'panel.brand.note': 'Das deepseek HARNESS-Badge oben links; aus bedeutet die Standarddarstellung des Hosts',
        'panel.brand.toggle': 'Aktivieren',
        'panel.brand.toggleHint': 'Durch ein eigenes Bild ersetzen',
        'panel.brand.builtinHint': 'Standardlogo wird verwendet (Bild wählen zum Ersetzen)',
        'panel.brand.imageRow': 'Bild',
        'panel.brand.pick': 'Bild wählen…',
        'panel.brand.repick': 'Bild ändern…',
        'panel.brand.previewAlt': 'Vorschau des aktuellen Markenbilds',
        'panel.brand.remove': 'Entfernen',
        'panel.brand.autoHint': 'Kein Bild = Standardlogo; Uploads werden auf maximal 512 px Kantenlänge verkleinert',
        'panel.brand.replacedHint': 'Ersetzt. Ändert ein Host-Update die Badge-Struktur, wird stillschweigend auf das Original zurückgefallen',
        'panel.header.title': 'Darstellung',
        'panel.header.count': '{n} Paletten',
        'panel.header.live': 'Änderungen wirken sofort',
        'panel.theme.title': 'Farbthema',
        'panel.theme.note': 'Die Auswahl wirkt sofort; hell/dunkel entscheidet, welche der beiden Paletten gilt',
        'panel.theme.modeRow': 'Modus',
        'panel.theme.modeAria': 'Farbmodus',
        'panel.theme.optLight': 'Hell',
        'panel.theme.optDark': 'Dunkel',
        'panel.theme.optAuto': 'System folgen',
        'panel.theme.addTitle': 'Eigenes Thema erstellen (Kopie des aktuellen)',
        'panel.theme.addLabel': 'Neues Thema',
        'panel.theme.edit': 'Farben bearbeiten',
        'panel.theme.duplicate': 'Duplizieren',
        'panel.theme.exportJson': 'JSON exportieren',
        'panel.theme.delete': 'Löschen',
        'panel.theme.importJson': 'JSON importieren',
        'panel.bg.title': 'Hintergrundbild',
        'panel.bg.note': 'Nur die Hauptspalte; Seitenleiste und Eingabefeld behalten die Volltonfarbe des Themas',
        'panel.bg.sourceRow': 'Quelle',
        'panel.bg.sourceAria': 'Hintergrundquelle',
        'panel.bg.optNone': 'Keins',
        'panel.bg.optTheme': 'Thementextur',
        'panel.bg.optImage': 'Eigenes Bild',
        'panel.bg.imageRow': 'Bild',
        'panel.bg.pick': 'Bild wählen…',
        'panel.bg.previewAlt': 'Vorschau des aktuellen Hintergrunds',
        'panel.bg.remove': 'Entfernen',
        'panel.bg.formatHint': 'JPEG / PNG / WebP · bis 8 MiB',
        'panel.bg.styleRow': 'Stil',
        'panel.bg.styleAria': 'Hintergrundstil',
        'panel.bg.optFade': 'Ausgeblendet',
        'panel.bg.optFull': 'Randlos',
        'panel.bg.opacityRow': 'Sichtbarkeit',
        'panel.bg.opacityCap': 'randlos = 70 % Deckkraft',
        'panel.bg.opacityAria': 'Sichtbarkeit des Hintergrunds (100 % am Regler entsprechen 70 % realer Deckkraft)',
        'panel.bg.showRow': 'Anzeigen in',
        'panel.bg.showEmpty': 'Neue Sitzungsseite',
        'panel.bg.showSession': 'In der Sitzung',
        'panel.bg.offHint': 'Der Hintergrund ist aus; diese Stile greifen, sobald du eine Quelle wählst',
        'panel.section.title': 'Zhuoer-Thema',
        'panel.sel.follow': 'Dem Thema folgen',
        'panel.sel.current': '{value} (aktuell)',
        'panel.ed.pickerAria': 'Farbwähler für {label}',
        'panel.ed.hexAria': 'Hex-Wert von {label}',
        'panel.ed.low': ' niedrig',
        'panel.ed.resetAria': '{label} auf den Wert des kopierten Themas zurücksetzen',
        'panel.ed.resetTitleDirty': 'Auf den Wert des kopierten Themas zurücksetzen',
        'panel.ed.resetTitleClean': 'Bereits der Wert des kopierten Themas',
        'panel.ed.dialogAria': 'Editor für eigene Themen',
        'panel.ed.title': 'Farben bearbeiten',
        'panel.ed.closeAria': 'Editor schließen',
        'panel.ed.closeTitle': 'Schließen (ungespeicherte Änderungen werden bestätigt)',
        'panel.ed.secAppearance': 'Darstellung',
        'panel.ed.clonedFrom': 'Kopiert von {theme}; die übrigen Tokens werden per Differenz abgeleitet',
        'panel.ed.name': 'Name',
        'panel.ed.nameAria': 'Themenname',
        'panel.ed.dark': 'Dunkel',
        'panel.ed.autoDark': 'Aus dem hellen Schema abgeleitet (Hintergrund/Text/Rahmen invertiert; Marke- und Semantikfarben bleiben)',
        'panel.ed.editRow': 'Bearbeiten',
        'panel.ed.schemeAria': 'Bearbeitetes Schema',
        'panel.ed.light': 'Hell',
        'panel.ed.anchors': 'Farbanker',
        'panel.ed.anchorsNote': 'Änderungen sind sofort in der echten Oberfläche rechts sichtbar; gespeichert wird erst mit „Speichern“',
        'panel.ed.advanced': 'Erweitert · Token für Token',
        'panel.ed.advancedNote': 'Alle 156 Tokens hinter den Ankern; Text unter 3:1 fällt automatisch zurück',
        'panel.ed.advShow': 'Alle Tokens anzeigen',
        'panel.ed.advHide': 'Einklappen',
        'panel.ed.confirmDiscard': 'Ungespeicherte Änderungen – verwerfen?',
        'panel.ed.dirtyHint': 'Ungespeicherte Änderungen',
        'panel.ed.keepEditing': 'Weiter bearbeiten',
        'panel.ed.cancel': 'Abbrechen',
        'panel.ed.discard': 'Änderungen verwerfen',
        'panel.ed.save': 'Speichern',
        'panel.ai.failed': 'Erzeugung fehlgeschlagen',
        'panel.ai.badJson': 'Das Modell lieferte kein parsebares Themen-JSON – formuliere die Beschreibung neu',
        'panel.palette.noColors': 'In diesem Bild wurden keine brauchbaren Farben gefunden',
        'panel.palette.failed': 'Farbextraktion fehlgeschlagen',
        'panel.palette.notEnough': 'Zu wenige Farben, um die Anker zu belegen',
        'panel.ed.presets': 'Stil-Voreinstellungen',
        'panel.ed.presetsNote': 'Ersetzt alles auf einmal: Anker, Radien und Schriften',
        'panel.ed.presetTitle': '{label} · Radius {radius} · {body}',
        'panel.ed.mono': 'Dicktengleich',
        'panel.ed.aiSection': 'KI und Farbwahl',
        'panel.ed.aiNote': 'Zuerst wird eine Vorschau gezeigt; erst „Anwenden“ ändert den Entwurf',
        'panel.ed.aiRow': 'KI-Erzeugung',
        'panel.ed.aiPromptAria': 'Stilbeschreibung',
        'panel.ed.aiPromptPh': 'Beschreibe den Stil, z. B. Retro-Terminal, grauer Hintergrund, gelbe Primärfarbe, blaue Sekundärfarbe, dicktengleich, eckige Ecken',
        'panel.ed.generating': 'Wird erzeugt…',
        'panel.ed.generate': 'Erzeugen',
        'panel.ed.aiPreview': '„{label}“',
        'panel.ed.aiDropped': ' ({n} unbekannte Schlüssel verworfen)',
        'panel.ed.applyCurrent': 'Auf das aktuelle Thema anwenden',
        'panel.chat.apply': 'Anwenden',
        'panel.chat.modify': 'Ändern',
        'panel.chat.applied': 'Auf DSH angewendet',
        'panel.chat.ovApplied': 'Angewendet · {n} Überschreibungen',
        'panel.chat.sampled': 'Farben aus dem Referenzbild entnommen',
        'panel.chat.ovSoft': '{s} wegen Kontrast zurückgesetzt',
        'panel.chat.preview': 'Vorschau',
        'panel.chat.editing': 'Bearbeitung',
        'panel.chat.cancel': 'Abbrechen',
        'panel.chat.applyEdited': 'Diese anwenden',
        'panel.chat.nameAria': 'Themenname',
        'panel.chat.fail': 'Anwenden fehlgeschlagen',
        'panel.chat.limitErr': 'Limit für eigene Themes erreicht ({n}); lösche zuerst eines',
        'panel.ed.drop': 'Verwerfen',
        'panel.ed.pickFromImage': 'Farben aus einem Bild entnehmen',
        'panel.ed.picking': 'Wird entnommen…',
        'panel.ed.pickImage': 'Bild wählen…',
        'panel.ed.clear': 'Leeren',
        'panel.ed.bgSection': 'Hintergrundbild',
        'panel.ed.bgNote': 'Ein Bild ≤ 3 MiB, gespeichert im lokalen IndexedDB',
        'panel.ed.bgSourceAria': 'Hintergrundquelle des Themas',
        'panel.ed.bgFollowGlobal': 'Global folgen',
        'panel.ed.bgThemeOwn': 'Thementextur',
        'panel.ed.bgCustom': 'Mein Foto',
        'panel.ed.bgNone': 'Kein Hintergrund',
        'panel.ed.imageRow': 'Bild',
        'panel.ed.bgPreviewAlt': 'Vorschau des Themenhintergrunds',
        'panel.ed.bgStoredHint': 'Im IndexedDB gespeichert, ≤ 3 MiB je Bild',
        'panel.ed.opacityRow': 'Sichtbarkeit',
        'panel.ed.bgOpacityAria': 'Sichtbarkeit des Themenhintergrunds',
        'panel.ed.shapeSection': 'Formen und Schriften',
        'panel.ed.shapeNote': 'Betrifft nur dieses Thema',
        'panel.ed.radiusRow': 'Eckenradius',
        'panel.ed.sharpRow': 'Bedienelemente anderer Plugins',
        'panel.ed.sharpOn': 'Fest verdrahtete Radien und Rahmen in der Plugin-Oberfläche abflachen',
        'panel.ed.sharpNote': 'Betrifft nur Bedienelemente von Plugins, die eigene Radien oder Rahmen mitbringen (z. B. die Segment-Schalter der Seitenleiste). Schaltet sich automatisch ein, wenn das Thema selbst eckig ist',
        'panel.ed.radiusAria': 'Größe des Eckenradius',
        'panel.ed.radiusSquare': 'Eckig',
        'panel.ed.radiusSmall': 'Klein',
        'panel.ed.radiusNormal': 'Normal',
        'panel.ed.radiusLarge': 'Groß',
        'panel.ed.radiusXL': 'Sehr groß',
        'panel.ed.bodyFont': 'Textschrift',
        'panel.ed.chatFont': 'Chat-Schrift',
        'panel.ed.followBase': '{theme} folgen',
        'panel.type.title': 'Typografie',
        'panel.type.note': 'Vergrößert Text (Oberfläche und Nachrichtentext), ohne die Layoutgeometrie anzufassen: geometrischer Zoom bringt das Ziehen der Host-Seitenleiste durcheinander und ist durch das Gate verboten',
        'panel.type.sizeRow': 'Schriftgröße des Nachrichtentexts',
        'panel.type.sizeAria': 'Schriftgröße des Nachrichtentexts',
        'panel.a11y.hitRow': 'Trefferfläche',
        'panel.a11y.procRow': 'Schritt-Symbole',
        'panel.a11y.procOn': 'Semantische Farben',
        'panel.a11y.procNote': 'Denken = Violett / Ausführen = Blau / Lesen = Grün / Schreiben und Fragen = Bernstein',
        'panel.type.mdHeadRow': 'Farbe der Überschriften',
        'panel.type.mdHeadAria': 'Farbe der Markdown-Überschriften',
        'panel.type.mdHeadFollow': 'Wie der Text',
        'panel.type.mdHeadSoft': 'Marke (weich)',
        'panel.type.mdHeadBrand': 'Marke',
        'panel.type.mdHeadNote': 'Aus Marken- und Textfarbe des Themas abgeleitet – folgt Themen- und Akzentänderungen',
        'panel.type.mdRow': 'Lese-Rhythmus',
        'panel.type.mdAria': 'Lese-Rhythmus von Markdown',
        'panel.type.mdCompact': 'Kompakt',
        'panel.type.mdNormal': 'Standard',
        'panel.type.mdRoomy': 'Weitläufig',
        'panel.type.mdNote': 'Nur Zeilenhöhe, Absatzabstand und Überschriftengröße – die Schriftgröße bleibt in der Zeile darüber',
        'panel.a11y.hitOn': 'Auf 44×44 vergrößern',
        'panel.a11y.hitNote': 'Symbolschalter bekommen eine Mindestgröße von 44 px fürs Tippen; das Layout wird etwas breiter',
        'panel.type.pxHint': 'Text ≈ {px} px',
        'panel.type.scaleMiss': 'Die Skalierung des Oberflächentexts hat nicht gegriffen: In den Stylesheets des Hosts wurde keine skalierbare font-size-Regel gefunden (bitte diese Zeile melden)',
        'panel.type.widthRow': 'Breite des Verlaufs',
        'panel.type.widthAria': 'Breite des Verlaufs in Pixeln',
        'panel.type.widthPh': '920',
        'panel.type.widthHint': 'Leer = 920 px Standard (verengt sich in kleinen Fenstern automatisch); 640–1600 überschreibt. Geändert wird nur die Breitenvariable, nie das Layout',
        'panel.type.fontRow': 'Schrift',
        'panel.type.fontPh': 'Schrift des Themas verwenden',
        'panel.type.fontAria': 'Schriftfamilie der Oberfläche',
        'panel.type.fontHint': 'Es werden nur mit dem Plugin mitgelieferte Schriften gelistet; eine nicht verfügbare Familie fällt nie stillschweigend zurück',
        'panel.scale.small': 'Klein',
        'panel.scale.default': 'Standard',
        'panel.scale.large': 'Groß',
        'panel.scale.xl': 'Sehr groß',
        'panel.scale.xxl': 'Riesig',
        'panel.accent.title': 'Akzentfarbe',
        'panel.accent.note': 'Ersetzt die Markenfarbe des Themas an Buttons und Links',
        'panel.accent.row': 'Farbe',
        'panel.accent.swatchAria': 'Akzent {hex}',
        'panel.accent.custom': 'Eigene Akzentfarbe',
        'panel.accent.reset': 'Themenfarbe wiederherstellen',
        'panel.qn.title': 'Schnellnavigation in der rechten Seitenleiste',
        'panel.qn.note': 'Die Icon-Schiene unter „Rechte Seitenleiste öffnen“; ein Klick springt zum passenden Tab',
        'panel.qn.row': 'Anzeigen',
        'panel.qn.aria': 'Anzeigemodus der Schnellnavigation',
        'panel.qn.optThree': 'Drei · klappt beim Überfahren auf',
        'panel.qn.optAll': 'Alle anzeigen',
        'panel.qn.optOff': 'Aus',
        'panel.reset.armed': 'Noch einmal klicken zum Bestätigen',
        'panel.reset.label': 'Standardeinstellungen wiederherstellen',
        'panel.reset.hint': 'Löscht alle Anpassungen an Thema, Modus, Hintergrund, Schriftgröße, Akzentfarbe und Schrift',
        'theme.zhuoer': 'Zhuoer 原版红',
        'theme.absolutely': 'Absolutely · 极简',
        'theme.beacon': '灯塔 · Beacon',
        'theme.crt': 'CRT · 终端',
        'theme.dash': 'Dash · 琥珀',
        'theme.knot': 'Knot · 绳结',
        'theme.manuscript': '手稿 · Manuscript',
        'theme.miami': '迈阿密 · Miami',
        'theme.phosphor': '荧光 · Phosphor',
        'theme.rose': '桃红 · Rose',
        'theme.tide': '潮汐 · Tide',
        'theme.vintagePaper': 'Vintage Paper',
        'panel.foot.build': 'Build {ver} · hält unser Stylesheet zuletzt, damit es andere Plugins überstimmt · Einstellungen bleiben im lokalen localStorage',
        'panel.io.jsonAria': 'Themen-JSON',
        'panel.io.exportTitle': 'Themen-JSON exportieren',
        'panel.io.importTitle': 'Themen-JSON importieren',
        'panel.io.close': 'Schließen',
        'panel.io.exportHint': 'Alles markieren und zum Teilen kopieren; enthält nur die Anker dieses Themas (nicht die 224 abgeleiteten Tokens). Ein eigenes Hintergrundbild ist nicht enthalten',
        'panel.io.importHint': 'JSON einfügen, das jemand exportiert hat; es wird der Themenliste hinzugefügt',
        'panel.io.import': 'Importieren',
        'panel.io.parseErr': 'JSON konnte nicht gelesen werden oder ist ungültig (nötig sind id/label/base sowie --dsw-alias-*-Farben unter dark/light)',
        'panel.err.title': 'Das Themen-Panel ist abgestürzt: {msg}',
        'panel.err.retry': 'Erneut versuchen',
        'panel.err.reload': 'Seite neu laden',
        'panel.err.hint': 'Falls das weiterhin passiert, schicke die obige Meldung an die Autorin oder den Autor',
        'panel.custom.newLabel': 'Eigenes {n}',
        'panel.custom.copySuffix': ' Kopie',
        'panel.custom.limitErr': 'Höchstens {n} eigene Themes; lösche eines, bevor du ein weiteres anlegst oder importierst',
        'panel.custom.dropped': '{n} eigene Themes überschreiten das Limit von {max} und wurden ignoriert: {ids}',
        'panel.custom.droppedClose': 'Verstanden',
        'panel.a11y.live': 'Zu {label} gewechselt',
        'panel.theme.deleteConfirm': 'Noch einmal klicken zum Löschen',
        'panel.alert.imgMax': 'Das Bild muss kleiner als 3 MiB sein',
        'panel.alert.imgStore': 'Dieses Bild ist zu groß für den lokalen Browserspeicher; bitte ein kleineres wählen',
        'anchor.bg': 'Hintergrund',
        'anchor.text': 'Text',
        'anchor.border': 'Rahmen',
        'anchor.brand': 'Primäre Markenfarbe',
        'anchor.brand2': 'Sekundäre Markenfarbe',
        'anchor.danger': 'Gefahr',
        'anchor.warn': 'Warnung',
        'anchor.success': 'Erfolg',
        'preset.glass': 'Glasmorphismus',
        'preset.brutal': 'Neobrutalismus',
        'preset.swiss': 'International Style',
        'preset.editorial': 'Editorial',
        'preset.luxe': 'Minimaler Luxus',
        'preset.organic': 'Organisch',
        'preset.morandi': 'Morandi',
        'preset.paper': 'Papier',
        'preset.cyber': 'Cyber-Terminal',
        'preset.aurora': 'Polarlicht',
        'preset.devterm': 'Entwicklerterminal',
        'preset.deepspace': 'Tiefenraum',
        'panel.chat.texOff': 'Textur: nicht aktiviert · sag „Textur hinzufügen“, wenn du eine möchtest',
        'panel.mdfine.title': 'Markdown-Verfeinerung',
        'panel.mdfine.note': 'Nur das Aussehen: Überschriftengröße, Codeblock, Tabelle, Zitat',
        'panel.mdfine.headRow': 'Überschriftengröße',
        'panel.mdfine.headAria': 'Größe der Markdown-Überschriften',
        'panel.mdfine.headTheme': 'Wie das Thema',
        'panel.mdfine.headCompact': 'Kompakt',
        'panel.mdfine.headClear': 'Klare Stufen',
        'panel.mdfine.headNote': 'Wie das Thema nutzt die Größen des Hosts; Klare Stufen spreizt die Überschriften weiter auseinander',
        'panel.mdfine.codeRow': 'Codeblock',
        'panel.mdfine.codeAria': 'Stil des Markdown-Codeblocks',
        'panel.mdfine.codeNone': 'Ohne Rahmen',
        'panel.mdfine.codeLine': 'Dünner Rahmen',
        'panel.mdfine.codeCard': 'Karte',
        'panel.mdfine.codeNote': 'Karte ergänzt Fläche und Radius – der Block hebt sich vom Text ab',
        'panel.mdfine.tableRow': 'Tabelle',
        'panel.mdfine.tableAria': 'Stil der Markdown-Tabelle',
        'panel.mdfine.tablePlain': 'Standard',
        'panel.mdfine.tableLine': 'Mit Linien',
        'panel.mdfine.tableZebra': 'Zebra',
        'panel.mdfine.tableNote': 'Mit Linien setzt Zellrahmen; Zebra ergänzt Zeilenschattierung und Kopfzeile',
        'panel.mdfine.quoteRow': 'Zitat',
        'panel.mdfine.quoteAria': 'Stil des Markdown-Zitats',
        'panel.mdfine.quotePlain': 'Standard',
        'panel.mdfine.quoteStrong': 'Deutlich',
        'panel.mdfine.quoteNote': 'Deutlich verdickt den linken Strich und legt einen zarten Hintergrund dazu',
        'panel.presets.note': 'Wähle einen Stil, um ein anpassbares Thema zu erstellen, das du weiter verfeinern kannst.',
        'panel.custom.title': 'Eigene Farben',
        'panel.custom.note': 'Passe ein eigenes Thema Farbe für Farbe an; beim Speichern wird es auf diesem Gerät abgelegt.',
        'panel.custom.empty': 'Dies ist ein eingebautes Thema. Erstelle ein eigenes, um seine Ankerfarben anzupassen.',
        'panel.custom.basedOn': 'Basiert auf {theme}',
        'panel.prefs.title': 'Globale Einstellungen',
        'panel.prefs.note': 'Diese Einstellungen gelten für alle Themen.',
        'panel.ed.baseSection': 'Basis und Modus',
        'panel.ed.base': 'Basis-Thema',
        'panel.ed.baseAria': 'Basis-Thema',
        'panel.ed.previewNote': 'Live-Vorschau: Ankeränderungen erscheinen zuerst hier; beim Speichern werden sie auf diesem Gerät abgelegt.',
        'panel.ed.band.base': 'Hintergrund und Flächen',
        'panel.ed.band.text': 'Text',
        'panel.ed.band.line': 'Rahmen',
        'panel.ed.band.brand': 'Marke',
        'panel.ed.band.semantic': 'Semantische Farben',
        'panel.ed.defaultAria': 'Standard {hex}',
        'panel.ed.undo': 'Rückgängig',
        'panel.ed.resetAll': 'Auf Basis zurücksetzen',
        'panel.ed.resetAllTitle': 'Anker-Überschreibungen dieses Modus löschen',
        'panel.ed.toolsShow': 'KI- und Bildwerkzeuge einblenden',
        'panel.ed.toolsHide': 'KI- und Bildwerkzeuge ausblenden',
        'panel.bg.opacityCapCapped': 'randlos = {p} % Deckkraft (kontrastbedingt begrenzt)',
      },
      es: {
        'rail.ariaLabel': 'Navegación rápida de la barra lateral derecha',
        'rail.anchorLabel': 'Ancla de navegación rápida',
        'rail.empty': 'No hay pestañas en la barra lateral derecha a las que saltar',
        'rail.noService': 'Este host no tiene servicio de barra lateral derecha',
        'rail.openFailed': 'No se pudo abrir esa pestaña',
        'panel.brand.title': 'Espacio de marca',
        'panel.brand.note': 'La insignia deepseek HARNESS de la esquina superior izquierda; desactivado = la del host',
        'panel.brand.toggle': 'Activar',
        'panel.brand.toggleHint': 'Sustituirlo por tu propia imagen',
        'panel.brand.builtinHint': 'Usando el logotipo integrado (elige una imagen para sustituirlo)',
        'panel.brand.imageRow': 'Imagen',
        'panel.brand.pick': 'Elegir imagen…',
        'panel.brand.repick': 'Cambiar imagen…',
        'panel.brand.previewAlt': 'Vista previa de la imagen de marca actual',
        'panel.brand.remove': 'Quitar',
        'panel.brand.autoHint': 'Sin imagen = logotipo integrado; las subidas se reducen a 512 px de lado máximo',
        'panel.brand.replacedHint': 'Sustituido. Si una actualización del host cambia la estructura de la insignia, vuelve silenciosamente a la original',
        'panel.header.title': 'Apariencia',
        'panel.header.count': '{n} paletas',
        'panel.header.live': 'Los cambios se aplican al instante',
        'panel.theme.title': 'Tema de color',
        'panel.theme.note': 'Al elegir se aplica de inmediato; claro/oscuro decide cuál de las dos paletas se usa',
        'panel.theme.modeRow': 'Modo',
        'panel.theme.modeAria': 'Modo de color',
        'panel.theme.optLight': 'Claro',
        'panel.theme.optDark': 'Oscuro',
        'panel.theme.optAuto': 'Seguir al sistema',
        'panel.theme.addTitle': 'Crear un tema personalizado (clonado del actual)',
        'panel.theme.addLabel': 'Nuevo tema',
        'panel.theme.edit': 'Editar colores',
        'panel.theme.duplicate': 'Duplicar',
        'panel.theme.exportJson': 'Exportar JSON',
        'panel.theme.delete': 'Eliminar',
        'panel.theme.importJson': 'Importar JSON',
        'panel.bg.title': 'Imagen de fondo',
        'panel.bg.note': 'Solo la columna principal; la barra lateral y el compositor mantienen el color sólido del tema',
        'panel.bg.sourceRow': 'Origen',
        'panel.bg.sourceAria': 'Origen del fondo',
        'panel.bg.optNone': 'Ninguno',
        'panel.bg.optTheme': 'Textura del tema',
        'panel.bg.optImage': 'Imagen personalizada',
        'panel.bg.imageRow': 'Imagen',
        'panel.bg.pick': 'Elegir imagen…',
        'panel.bg.previewAlt': 'Vista previa del fondo actual',
        'panel.bg.remove': 'Quitar',
        'panel.bg.formatHint': 'JPEG / PNG / WebP · hasta 8 MiB',
        'panel.bg.styleRow': 'Estilo',
        'panel.bg.styleAria': 'Estilo del fondo',
        'panel.bg.optFade': 'Atenuado',
        'panel.bg.optFull': 'A sangre',
        'panel.bg.opacityRow': 'Visibilidad',
        'panel.bg.opacityCap': 'a sangre = 70 % de opacidad',
        'panel.bg.opacityAria': 'Visibilidad del fondo (100 % en el control equivale a 70 % de opacidad real)',
        'panel.bg.showRow': 'Mostrar en',
        'panel.bg.showEmpty': 'Página de sesión nueva',
        'panel.bg.showSession': 'En sesión',
        'panel.bg.offHint': 'El fondo está desactivado; estos estilos se aplican cuando elijas un origen',
        'panel.section.title': 'Tema Zhuoer',
        'panel.sel.follow': 'Seguir al tema',
        'panel.sel.current': '{value} (actual)',
        'panel.ed.pickerAria': 'Selector de color de {label}',
        'panel.ed.hexAria': 'Valor hexadecimal de {label}',
        'panel.ed.low': ' bajo',
        'panel.ed.resetAria': 'Restablecer {label} al valor del tema clonado',
        'panel.ed.resetTitleDirty': 'Restablecer al valor del tema clonado',
        'panel.ed.resetTitleClean': 'Ya es el valor del tema clonado',
        'panel.ed.dialogAria': 'Editor de tema personalizado',
        'panel.ed.title': 'Editar colores',
        'panel.ed.closeAria': 'Cerrar el editor',
        'panel.ed.closeTitle': 'Cerrar (los cambios sin guardar se confirman antes)',
        'panel.ed.secAppearance': 'Apariencia',
        'panel.ed.clonedFrom': 'Clonado de {theme}; el resto de tokens se deriva por diferencia',
        'panel.ed.name': 'Nombre',
        'panel.ed.nameAria': 'Nombre del tema',
        'panel.ed.dark': 'Oscuro',
        'panel.ed.autoDark': 'Derivado del esquema claro (fondo/texto/borde invertidos; se mantienen el color de marca y los semánticos)',
        'panel.ed.editRow': 'Editar',
        'panel.ed.schemeAria': 'Esquema en edición',
        'panel.ed.light': 'Claro',
        'panel.ed.anchors': 'Anclajes de color',
        'panel.ed.anchorsNote': 'Los cambios se previsualizan en la interfaz real de la derecha; no se guarda nada hasta pulsar Guardar',
        'panel.ed.advanced': 'Avanzado · token a token',
        'panel.ed.advancedNote': 'Los 156 tokens que hay detrás de los anclajes; el texto por debajo de 3:1 se revierte solo',
        'panel.ed.advShow': 'Mostrar todos los tokens',
        'panel.ed.advHide': 'Contraer',
        'panel.ed.confirmDiscard': 'Hay cambios sin guardar. ¿Descartarlos?',
        'panel.ed.dirtyHint': 'Cambios sin guardar',
        'panel.ed.keepEditing': 'Seguir editando',
        'panel.ed.cancel': 'Cancelar',
        'panel.ed.discard': 'Descartar cambios',
        'panel.ed.save': 'Guardar',
        'panel.ai.failed': 'Error al generar',
        'panel.ai.badJson': 'El modelo no devolvió un JSON de tema válido: prueba a reformularlo',
        'panel.palette.noColors': 'No se han encontrado colores utilizables en esta imagen',
        'panel.palette.failed': 'Error al extraer los colores',
        'panel.palette.notEnough': 'No hay suficientes colores para asignar a los anclajes',
        'panel.ed.presets': 'Estilos predefinidos',
        'panel.ed.presetsNote': 'Sustituye todo de golpe: anclajes, radios y fuentes',
        'panel.ed.presetTitle': '{label} · radio {radius} · {body}',
        'panel.ed.mono': 'monoespaciada',
        'panel.ed.aiSection': 'IA y extracción de color',
        'panel.ed.aiNote': 'Primero se previsualiza; solo Aplicar toca el borrador',
        'panel.ed.aiRow': 'Generación con IA',
        'panel.ed.aiPromptAria': 'Descripción del estilo',
        'panel.ed.aiPromptPh': 'Describe el estilo, p. ej. terminal retro, fondo gris, primario amarillo, secundario azul, monoespaciada, esquinas rectas',
        'panel.ed.generating': 'Generando…',
        'panel.ed.generate': 'Generar',
        'panel.ed.aiPreview': '«{label}»',
        'panel.ed.aiDropped': ' ({n} claves desconocidas descartadas)',
        'panel.ed.applyCurrent': 'Aplicar al tema actual',
        'panel.chat.apply': 'Aplicar',
        'panel.chat.modify': 'Modificar',
        'panel.chat.applied': 'Aplicado a DSH',
        'panel.chat.ovApplied': 'Aplicado · {n} anulaciones',
        'panel.chat.sampled': 'Colores extraídos de la imagen de referencia',
        'panel.chat.ovSoft': '{s} revertidos por contraste',
        'panel.chat.preview': 'Vista previa',
        'panel.chat.editing': 'Editando',
        'panel.chat.cancel': 'Cancelar',
        'panel.chat.applyEdited': 'Aplicar estos',
        'panel.chat.nameAria': 'Nombre del tema',
        'panel.chat.fail': 'No se pudo aplicar',
        'panel.chat.limitErr': 'Se alcanzó el límite de temas personalizados ({n}); elimina uno primero',
        'panel.ed.drop': 'Descartar',
        'panel.ed.pickFromImage': 'Extraer colores de una imagen',
        'panel.ed.picking': 'Extrayendo…',
        'panel.ed.pickImage': 'Elegir imagen…',
        'panel.ed.clear': 'Limpiar',
        'panel.ed.bgSection': 'Imagen de fondo',
        'panel.ed.bgNote': 'Una imagen de ≤ 3 MiB, guardada en el IndexedDB local',
        'panel.ed.bgSourceAria': 'Origen del fondo del tema',
        'panel.ed.bgFollowGlobal': 'Seguir al global',
        'panel.ed.bgThemeOwn': 'Textura del tema',
        'panel.ed.bgCustom': 'Mi foto',
        'panel.ed.bgNone': 'Sin fondo',
        'panel.ed.imageRow': 'Imagen',
        'panel.ed.bgPreviewAlt': 'Vista previa del fondo del tema',
        'panel.ed.bgStoredHint': 'Guardada en IndexedDB, ≤ 3 MiB por imagen',
        'panel.ed.opacityRow': 'Visibilidad',
        'panel.ed.bgOpacityAria': 'Visibilidad del fondo del tema',
        'panel.ed.shapeSection': 'Forma y tipografías',
        'panel.ed.shapeNote': 'Solo afecta a este tema',
        'panel.ed.radiusRow': 'Radio de las esquinas',
        'panel.ed.sharpRow': 'Controles de otros plugins',
        'panel.ed.sharpOn': 'Aplanar radios y bordes escritos a fuego en la interfaz de plugins',
        'panel.ed.sharpNote': 'Solo afecta a los controles de plugins que traen su propio radio o borde (por ejemplo, los botones segmentados de la barra lateral). Se activa solo cuando el tema es recto',
        'panel.ed.radiusAria': 'Tamaño del radio',
        'panel.ed.radiusSquare': 'Recto',
        'panel.ed.radiusSmall': 'Pequeño',
        'panel.ed.radiusNormal': 'Normal',
        'panel.ed.radiusLarge': 'Grande',
        'panel.ed.radiusXL': 'Muy grande',
        'panel.ed.bodyFont': 'Fuente del texto',
        'panel.ed.chatFont': 'Fuente del chat',
        'panel.ed.followBase': 'Seguir a {theme}',
        'panel.type.title': 'Tipografía',
        'panel.type.note': 'Amplía el texto (interfaz y cuerpo del mensaje) sin tocar la geometría del diseño: el zoom geométrico estorba al arrastre de la barra lateral del host y está prohibido por la puerta de calidad',
        'panel.type.sizeRow': 'Tamaño del texto del mensaje',
        'panel.type.sizeAria': 'Tamaño del texto del mensaje',
        'panel.a11y.hitRow': 'Área táctil',
        'panel.a11y.procRow': 'Iconos de paso',
        'panel.a11y.procOn': 'Colores semánticos',
        'panel.a11y.procNote': 'pensar = violeta / ejecutar = azul / leer = verde / escribir y preguntar = ámbar',
        'panel.type.mdHeadRow': 'Color de los títulos',
        'panel.type.mdHeadAria': 'Color de los títulos Markdown',
        'panel.type.mdHeadFollow': 'Seguir al texto',
        'panel.type.mdHeadSoft': 'Marca (suave)',
        'panel.type.mdHeadBrand': 'Marca',
        'panel.type.mdHeadNote': 'Se deriva de los colores de marca y de texto del tema: sigue los cambios de tema y de acento',
        'panel.type.mdRow': 'Ritmo de lectura',
        'panel.type.mdAria': 'Ritmo de lectura de Markdown',
        'panel.type.mdCompact': 'Compacto',
        'panel.type.mdNormal': 'Estándar',
        'panel.type.mdRoomy': 'Amplio',
        'panel.type.mdNote': 'Solo interlineado, espacio entre párrafos y escala de títulos; el tamaño de letra lo sigue controlando la fila anterior',
        'panel.a11y.hitOn': 'Ampliar a 44×44',
        'panel.a11y.hitNote': 'Los botones de icono ganan un mínimo de 44 px para el tacto; el diseño se ensancha un poco',
        'panel.type.pxHint': 'Texto ≈{px} px',
        'panel.type.scaleMiss': 'El escalado del texto de la interfaz no ha tenido efecto: no se ha encontrado ninguna regla de font-size ampliable en las hojas de estilo del host (informa de esta línea)',
        'panel.type.widthRow': 'Ancho de la conversación',
        'panel.type.widthAria': 'Ancho de la conversación en píxeles',
        'panel.type.widthPh': '920',
        'panel.type.widthHint': 'Vacío = 920 px por defecto (se estrecha solo en ventanas pequeñas); escribe 640–1600 para sobrescribirlo. Solo cambia la variable de ancho, nunca el diseño',
        'panel.type.fontRow': 'Fuente',
        'panel.type.fontPh': 'Usar la fuente del tema',
        'panel.type.fontAria': 'Familia tipográfica de la interfaz',
        'panel.type.fontHint': 'Solo se listan las fuentes incluidas con el plugin; una familia no disponible nunca vuelve en silencio a la anterior',
        'panel.scale.small': 'Pequeño',
        'panel.scale.default': 'Normal',
        'panel.scale.large': 'Grande',
        'panel.scale.xl': 'Muy grande',
        'panel.scale.xxl': 'Enorme',
        'panel.accent.title': 'Color de acento',
        'panel.accent.note': 'Sustituye el color de marca del tema en botones y enlaces',
        'panel.accent.row': 'Color',
        'panel.accent.swatchAria': 'Acento {hex}',
        'panel.accent.custom': 'Color de acento personalizado',
        'panel.accent.reset': 'Restaurar el color del tema',
        'panel.qn.title': 'Navegación rápida de la barra lateral derecha',
        'panel.qn.note': 'El carril de iconos bajo «Abrir barra lateral derecha»; un clic salta a la pestaña correspondiente',
        'panel.qn.row': 'Mostrar',
        'panel.qn.aria': 'Modo de la navegación rápida',
        'panel.qn.optThree': 'Tres · se despliegan al pasar el cursor',
        'panel.qn.optAll': 'Mostrar todo',
        'panel.qn.optOff': 'Desactivada',
        'panel.reset.armed': 'Pulsa otra vez para confirmar',
        'panel.reset.label': 'Restaurar los ajustes por defecto',
        'panel.reset.hint': 'Borra todas las personalizaciones de tema, modo, fondo, tamaño de letra, color de acento y tipografía',
        'theme.zhuoer': 'Zhuoer 原版红',
        'theme.absolutely': 'Absolutely · 极简',
        'theme.beacon': '灯塔 · Beacon',
        'theme.crt': 'CRT · 终端',
        'theme.dash': 'Dash · 琥珀',
        'theme.knot': 'Knot · 绳结',
        'theme.manuscript': '手稿 · Manuscript',
        'theme.miami': '迈阿密 · Miami',
        'theme.phosphor': '荧光 · Phosphor',
        'theme.rose': '桃红 · Rose',
        'theme.tide': '潮汐 · Tide',
        'theme.vintagePaper': 'Vintage Paper',
        'panel.foot.build': 'Compilación {ver} · mantiene nuestra hoja de estilos al final para que gane a otros plugins · los ajustes se guardan en el localStorage local',
        'panel.io.jsonAria': 'JSON del tema',
        'panel.io.exportTitle': 'Exportar el JSON del tema',
        'panel.io.importTitle': 'Importar el JSON del tema',
        'panel.io.close': 'Cerrar',
        'panel.io.exportHint': 'Selecciona todo y copia para compartir; contiene solo los anclajes de este tema (no los 224 tokens derivados). No se incluye la imagen de fondo personalizada',
        'panel.io.importHint': 'Pega un JSON exportado por otra persona; se añadirá a la lista de temas',
        'panel.io.import': 'Importar',
        'panel.io.parseErr': 'No se ha podido analizar el JSON o no es válido (hace falta id/label/base y los colores --dsw-alias-* bajo dark/light)',
        'panel.err.title': 'El panel de temas ha fallado: {msg}',
        'panel.err.retry': 'Reintentar',
        'panel.err.reload': 'Recargar la página',
        'panel.err.hint': 'Si sigue pasando, envía el mensaje anterior al autor',
        'panel.custom.newLabel': 'Personalizado {n}',
        'panel.custom.copySuffix': ' copia',
        'panel.custom.limitErr': 'Como máximo {n} temas personalizados; elimina uno antes de crear o importar otro',
        'panel.custom.dropped': '{n} temas personalizados superan el límite de {max} y se han ignorado: {ids}',
        'panel.custom.droppedClose': 'Entendido',
        'panel.a11y.live': 'Cambiado a {label}',
        'panel.theme.deleteConfirm': 'Pulsa otra vez para eliminar',
        'panel.alert.imgMax': 'La imagen debe pesar menos de 3 MiB',
        'panel.alert.imgStore': 'Esta imagen es demasiado grande para el almacenamiento local del navegador; elige una más pequeña',
        'anchor.bg': 'Fondo',
        'anchor.text': 'Texto',
        'anchor.border': 'Borde',
        'anchor.brand': 'Color de marca principal',
        'anchor.brand2': 'Color de marca secundario',
        'anchor.danger': 'Peligro',
        'anchor.warn': 'Advertencia',
        'anchor.success': 'Éxito',
        'preset.glass': 'Cristal',
        'preset.brutal': 'Neo-brutalismo',
        'preset.swiss': 'Suizo internacional',
        'preset.editorial': 'Editorial',
        'preset.luxe': 'Lujo minimalista',
        'preset.organic': 'Orgánico',
        'preset.morandi': 'Morandi',
        'preset.paper': 'Papel',
        'preset.cyber': 'Terminal futurista',
        'preset.aurora': 'Aurora',
        'preset.devterm': 'Terminal de desarrollo',
        'preset.deepspace': 'Espacio profundo',
        'panel.chat.texOff': 'Textura: no activada · di «añade una textura» si la quieres',
        'panel.mdfine.title': 'Refinado de Markdown',
        'panel.mdfine.note': 'Solo el aspecto: tamaño de títulos, bloque de código, tabla y cita',
        'panel.mdfine.headRow': 'Tamaño de títulos',
        'panel.mdfine.headAria': 'Tamaño de títulos Markdown',
        'panel.mdfine.headTheme': 'Según el tema',
        'panel.mdfine.headCompact': 'Compacto',
        'panel.mdfine.headClear': 'Niveles marcados',
        'panel.mdfine.headNote': 'Según el tema usa los tamaños del host; Niveles marcados separa más los títulos',
        'panel.mdfine.codeRow': 'Bloque de código',
        'panel.mdfine.codeAria': 'Estilo del bloque de código Markdown',
        'panel.mdfine.codeNone': 'Sin borde',
        'panel.mdfine.codeLine': 'Borde fino',
        'panel.mdfine.codeCard': 'Tarjeta',
        'panel.mdfine.codeNote': 'Tarjeta añade fondo y radio, y el bloque se despega del texto',
        'panel.mdfine.tableRow': 'Tabla',
        'panel.mdfine.tableAria': 'Estilo de tabla Markdown',
        'panel.mdfine.tablePlain': 'Normal',
        'panel.mdfine.tableLine': 'Con bordes',
        'panel.mdfine.tableZebra': 'Cebra',
        'panel.mdfine.tableNote': 'Con bordes añade bordes a las celdas; Zebra suma filas alternas y fondo de cabecera',
        'panel.mdfine.quoteRow': 'Cita',
        'panel.mdfine.quoteAria': 'Estilo de cita Markdown',
        'panel.mdfine.quotePlain': 'Normal',
        'panel.mdfine.quoteStrong': 'Marcada',
        'panel.mdfine.quoteNote': 'Marcada engrosa la línea izquierda y añade un fondo tenue',
        'panel.presets.note': 'Elige un estilo para crear un tema personalizable que puedes seguir ajustando.',
        'panel.custom.title': 'Colores personalizados',
        'panel.custom.note': 'Ajusta un tema personalizado color a color; al guardar se escribe en este dispositivo.',
        'panel.custom.empty': 'Este es un tema integrado. Crea uno personalizado para ajustar sus anclajes de color.',
        'panel.custom.basedOn': 'Basado en {theme}',
        'panel.prefs.title': 'Preferencias globales',
        'panel.prefs.note': 'Estos ajustes se aplican a todos los temas.',
        'panel.ed.baseSection': 'Base y modo',
        'panel.ed.base': 'Tema base',
        'panel.ed.baseAria': 'Tema base',
        'panel.ed.previewNote': 'Vista previa en vivo: los cambios de anclaje aparecen aquí primero; al guardar se escriben en este dispositivo.',
        'panel.ed.band.base': 'Fondo y superficies',
        'panel.ed.band.text': 'Texto',
        'panel.ed.band.line': 'Bordes',
        'panel.ed.band.brand': 'Marca',
        'panel.ed.band.semantic': 'Colores semánticos',
        'panel.ed.defaultAria': 'Predeterminado {hex}',
        'panel.ed.undo': 'Deshacer',
        'panel.ed.resetAll': 'Restaurar valor base',
        'panel.ed.resetAllTitle': 'Borrar los cambios de anclaje de este modo',
        'panel.ed.toolsShow': 'Mostrar herramientas de IA e imagen',
        'panel.ed.toolsHide': 'Ocultar herramientas de IA e imagen',
        'panel.bg.opacityCapCapped': 'a sangre = {p} % de opacidad (limitado por contraste)',
      },
      fr: {
        'rail.ariaLabel': 'Navigation rapide de la barre latérale droite',
        'rail.anchorLabel': 'Ancre de navigation rapide',
        'rail.empty': 'Aucun onglet de la barre latérale droite vers lequel aller',
        'rail.noService': 'Cet hôte n\'a pas de service de barre latérale droite',
        'rail.openFailed': 'Impossible d\'ouvrir cet onglet',
        'panel.brand.title': 'Emplacement de marque',
        'panel.brand.note': 'Le badge deepseek HARNESS en haut à gauche ; désactivé = celui de l\'hôte',
        'panel.brand.toggle': 'Activer',
        'panel.brand.toggleHint': 'Remplacer par votre propre image',
        'panel.brand.builtinHint': 'Logo intégré utilisé (choisissez une image pour le remplacer)',
        'panel.brand.imageRow': 'Image',
        'panel.brand.pick': 'Choisir une image…',
        'panel.brand.repick': 'Changer l\'image…',
        'panel.brand.previewAlt': 'Aperçu de l\'image de marque actuelle',
        'panel.brand.remove': 'Retirer',
        'panel.brand.autoHint': 'Pas d\'image = logo intégré ; les envois sont réduits à 512 px de côté maximal',
        'panel.brand.replacedHint': 'Remplacé. Si une mise à jour de l\'hôte change la structure du badge, retour silencieux à l\'original',
        'panel.header.title': 'Apparence',
        'panel.header.count': '{n} palettes',
        'panel.header.live': 'Les changements s\'appliquent immédiatement',
        'panel.theme.title': 'Thème de couleurs',
        'panel.theme.note': 'Le choix s\'applique aussitôt ; clair/sombre décide laquelle des deux palettes est active',
        'panel.theme.modeRow': 'Mode',
        'panel.theme.modeAria': 'Mode de couleur',
        'panel.theme.optLight': 'Clair',
        'panel.theme.optDark': 'Sombre',
        'panel.theme.optAuto': 'Suivre le système',
        'panel.theme.addTitle': 'Créer un thème personnalisé (cloné depuis l\'actuel)',
        'panel.theme.addLabel': 'Nouveau thème',
        'panel.theme.edit': 'Modifier les couleurs',
        'panel.theme.duplicate': 'Dupliquer',
        'panel.theme.exportJson': 'Exporter le JSON',
        'panel.theme.delete': 'Supprimer',
        'panel.theme.importJson': 'Importer un JSON',
        'panel.bg.title': 'Image de fond',
        'panel.bg.note': 'Colonne principale uniquement ; la barre latérale et la zone de saisie gardent la couleur pleine du thème',
        'panel.bg.sourceRow': 'Source',
        'panel.bg.sourceAria': 'Source du fond',
        'panel.bg.optNone': 'Aucun',
        'panel.bg.optTheme': 'Texture du thème',
        'panel.bg.optImage': 'Image personnalisée',
        'panel.bg.imageRow': 'Image',
        'panel.bg.pick': 'Choisir une image…',
        'panel.bg.previewAlt': 'Aperçu du fond actuel',
        'panel.bg.remove': 'Retirer',
        'panel.bg.formatHint': 'JPEG / PNG / WebP · jusqu\'à 8 MiB',
        'panel.bg.styleRow': 'Style',
        'panel.bg.styleAria': 'Style du fond',
        'panel.bg.optFade': 'Estompé',
        'panel.bg.optFull': 'Plein écran',
        'panel.bg.opacityRow': 'Visibilité',
        'panel.bg.opacityCap': 'plein écran = 70 % d\'opacité',
        'panel.bg.opacityAria': 'Visibilité du fond (100 % sur le curseur = 70 % d\'opacité réelle)',
        'panel.bg.showRow': 'Afficher dans',
        'panel.bg.showEmpty': 'Page de nouvelle session',
        'panel.bg.showSession': 'En session',
        'panel.bg.offHint': 'Le fond est désactivé ; ces styles s\'appliquent dès que vous choisissez une source',
        'panel.section.title': 'Thème Zhuoer',
        'panel.sel.follow': 'Suivre le thème',
        'panel.sel.current': '{value} (actuel)',
        'panel.ed.pickerAria': 'Sélecteur de couleur pour {label}',
        'panel.ed.hexAria': 'Valeur hexadécimale de {label}',
        'panel.ed.low': ' faible',
        'panel.ed.resetAria': 'Réinitialiser {label} à la valeur du thème cloné',
        'panel.ed.resetTitleDirty': 'Réinitialiser à la valeur du thème cloné',
        'panel.ed.resetTitleClean': 'Déjà la valeur du thème cloné',
        'panel.ed.dialogAria': 'Éditeur de thème personnalisé',
        'panel.ed.title': 'Modifier les couleurs',
        'panel.ed.closeAria': 'Fermer l\'éditeur',
        'panel.ed.closeTitle': 'Fermer (les modifications non enregistrées sont confirmées d\'abord)',
        'panel.ed.secAppearance': 'Apparence',
        'panel.ed.clonedFrom': 'Cloné depuis {theme} ; les autres jetons sont dérivés par delta',
        'panel.ed.name': 'Nom',
        'panel.ed.nameAria': 'Nom du thème',
        'panel.ed.dark': 'Sombre',
        'panel.ed.autoDark': 'Dérivé du schéma clair (fond/texte/bordure inversés ; la couleur de marque et les couleurs sémantiques sont conservées)',
        'panel.ed.editRow': 'Modifier',
        'panel.ed.schemeAria': 'Schéma en cours de modification',
        'panel.ed.light': 'Clair',
        'panel.ed.anchors': 'Ancres de couleur',
        'panel.ed.anchorsNote': 'Les modifications s\'aperçoivent sur l\'interface réelle à droite ; rien n\'est enregistré avant « Enregistrer »',
        'panel.ed.advanced': 'Avancé · jeton par jeton',
        'panel.ed.advancedNote': 'Les 156 jetons derrière les ancres ; le texte sous 3:1 revient automatiquement à sa valeur',
        'panel.ed.advShow': 'Afficher tous les jetons',
        'panel.ed.advHide': 'Replier',
        'panel.ed.confirmDiscard': 'Modifications non enregistrées — les abandonner ?',
        'panel.ed.dirtyHint': 'Modifications non enregistrées',
        'panel.ed.keepEditing': 'Continuer à modifier',
        'panel.ed.cancel': 'Annuler',
        'panel.ed.discard': 'Abandonner les modifications',
        'panel.ed.save': 'Enregistrer',
        'panel.ai.failed': 'Échec de la génération',
        'panel.ai.badJson': 'Le modèle n\'a pas renvoyé de JSON de thème exploitable — reformulez la demande',
        'panel.palette.noColors': 'Aucune couleur exploitable n\'a été trouvée dans cette image',
        'panel.palette.failed': 'Échec de l\'extraction des couleurs',
        'panel.palette.notEnough': 'Pas assez de couleurs pour attribuer les ancres',
        'panel.ed.presets': 'Préréglages de style',
        'panel.ed.presetsNote': 'Remplace tout d\'un coup : ancres, rayons et polices',
        'panel.ed.presetTitle': '{label} · rayon {radius} · {body}',
        'panel.ed.mono': 'à chasse fixe',
        'panel.ed.aiSection': 'IA et prélèvement de couleurs',
        'panel.ed.aiNote': 'Résultat prévisualisé d\'abord ; seul « Appliquer » touche au brouillon',
        'panel.ed.aiRow': 'Génération par IA',
        'panel.ed.aiPromptAria': 'Description du style',
        'panel.ed.aiPromptPh': 'Décrivez le style, p. ex. terminal rétro, fond gris, primaire jaune, secondaire bleu, à chasse fixe, angles droits',
        'panel.ed.generating': 'Génération…',
        'panel.ed.generate': 'Générer',
        'panel.ed.aiPreview': '« {label} »',
        'panel.ed.aiDropped': ' ({n} clés inconnues ignorées)',
        'panel.ed.applyCurrent': 'Appliquer au thème actuel',
        'panel.chat.apply': 'Appliquer',
        'panel.chat.modify': 'Modifier',
        'panel.chat.applied': 'Appliqué à DSH',
        'panel.chat.ovApplied': 'Appliqué · {n} surcharges',
        'panel.chat.sampled': 'Couleurs prélevées sur l\'image de référence',
        'panel.chat.ovSoft': '{s} restaurés pour le contraste',
        'panel.chat.preview': 'Aperçu',
        'panel.chat.editing': 'Modification',
        'panel.chat.cancel': 'Annuler',
        'panel.chat.applyEdited': 'Appliquer ceux-ci',
        'panel.chat.nameAria': 'Nom du thème',
        'panel.chat.fail': 'Échec de l\'application',
        'panel.chat.limitErr': 'Limite de thèmes personnalisés atteinte ({n}) ; supprimez-en un d\'abord',
        'panel.ed.drop': 'Abandonner',
        'panel.ed.pickFromImage': 'Prélever les couleurs d\'une image',
        'panel.ed.picking': 'Extraction…',
        'panel.ed.pickImage': 'Choisir une image…',
        'panel.ed.clear': 'Effacer',
        'panel.ed.bgSection': 'Image de fond',
        'panel.ed.bgNote': 'Une image ≤ 3 MiB, stockée dans l\'IndexedDB local',
        'panel.ed.bgSourceAria': 'Source du fond du thème',
        'panel.ed.bgFollowGlobal': 'Suivre le global',
        'panel.ed.bgThemeOwn': 'Texture du thème',
        'panel.ed.bgCustom': 'Ma photo',
        'panel.ed.bgNone': 'Pas de fond',
        'panel.ed.imageRow': 'Image',
        'panel.ed.bgPreviewAlt': 'Aperçu du fond du thème',
        'panel.ed.bgStoredHint': 'Stockée dans l\'IndexedDB, ≤ 3 MiB par image',
        'panel.ed.opacityRow': 'Visibilité',
        'panel.ed.bgOpacityAria': 'Visibilité du fond du thème',
        'panel.ed.shapeSection': 'Formes et polices',
        'panel.ed.shapeNote': 'N\'affecte que ce thème',
        'panel.ed.radiusRow': 'Rayon des coins',
        'panel.ed.sharpRow': 'Contrôles des autres plugins',
        'panel.ed.sharpOn': 'Aplatir les rayons et bordures codés en dur dans l\'interface des plugins',
        'panel.ed.sharpNote': 'N\'affecte que les contrôles de plugins qui apportent leur propre rayon ou bordure (par ex. les boutons segmentés de la barre latérale). S\'active automatiquement quand le thème est carré',
        'panel.ed.radiusAria': 'Taille du rayon',
        'panel.ed.radiusSquare': 'Carré',
        'panel.ed.radiusSmall': 'Petit',
        'panel.ed.radiusNormal': 'Normal',
        'panel.ed.radiusLarge': 'Grand',
        'panel.ed.radiusXL': 'Très grand',
        'panel.ed.bodyFont': 'Police du texte',
        'panel.ed.chatFont': 'Police de la discussion',
        'panel.ed.followBase': 'Suivre {theme}',
        'panel.type.title': 'Typographie',
        'panel.type.note': 'Agrandit le texte (interface et corps des messages) sans toucher à la géométrie de la mise en page : le zoom géométrique gêne le glissement de la barre latérale de l\'hôte et est interdit par la porte de qualité',
        'panel.type.sizeRow': 'Taille du texte des messages',
        'panel.type.sizeAria': 'Taille du texte des messages',
        'panel.a11y.hitRow': 'Zone tactile',
        'panel.a11y.procRow': 'Icônes d\'étape',
        'panel.a11y.procOn': 'Couleurs sémantiques',
        'panel.a11y.procNote': 'réfléchir = violet / exécuter = bleu / lire = vert / écrire et demander = ambre',
        'panel.type.mdHeadRow': 'Couleur des titres',
        'panel.type.mdHeadAria': 'Couleur des titres Markdown',
        'panel.type.mdHeadFollow': 'Suivre le texte',
        'panel.type.mdHeadSoft': 'Marque (douce)',
        'panel.type.mdHeadBrand': 'Marque',
        'panel.type.mdHeadNote': 'Dérivée des couleurs de marque et de texte du thème — suit les changements de thème et d\'accent',
        'panel.type.mdRow': 'Rythme de lecture',
        'panel.type.mdAria': 'Rythme de lecture Markdown',
        'panel.type.mdCompact': 'Compact',
        'panel.type.mdNormal': 'Standard',
        'panel.type.mdRoomy': 'Aéré',
        'panel.type.mdNote': 'Interligne, espacement des paragraphes et échelle des titres seulement — la taille des caractères reste réglée ci-dessus',
        'panel.a11y.hitOn': 'Agrandir à 44×44',
        'panel.a11y.hitNote': 'Les boutons d\'icône gagnent un minimum de 44 px pour le tactile ; la mise en page s\'élargit un peu',
        'panel.type.pxHint': 'Texte ≈ {px} px',
        'panel.type.scaleMiss': 'La mise à l\'échelle du texte de l\'interface n\'a pas pris effet : aucune règle de font-size agrandissable n\'a été trouvée dans les feuilles de style de l\'hôte (merci de signaler cette ligne)',
        'panel.type.widthRow': 'Largeur de la discussion',
        'panel.type.widthAria': 'Largeur de la discussion en pixels',
        'panel.type.widthPh': '920',
        'panel.type.widthHint': 'Vide = 920 px par défaut (rétrécit automatiquement sur les petites fenêtres) ; saisissez 640–1600 pour remplacer. Seule la variable de largeur change, jamais la mise en page',
        'panel.type.fontRow': 'Police',
        'panel.type.fontPh': 'Utiliser la police du thème',
        'panel.type.fontAria': 'Famille de police de l\'interface',
        'panel.type.fontHint': 'Seules les polices livrées avec le plugin sont listées ; une famille indisponible ne retombe jamais silencieusement',
        'panel.scale.small': 'Petit',
        'panel.scale.default': 'Normal',
        'panel.scale.large': 'Grand',
        'panel.scale.xl': 'Très grand',
        'panel.scale.xxl': 'Énorme',
        'panel.accent.title': 'Couleur d\'accent',
        'panel.accent.note': 'Remplace la couleur de marque du thème sur les boutons et les liens',
        'panel.accent.row': 'Couleur',
        'panel.accent.swatchAria': 'Accent {hex}',
        'panel.accent.custom': 'Couleur d\'accent personnalisée',
        'panel.accent.reset': 'Rétablir la couleur du thème',
        'panel.qn.title': 'Navigation rapide de la barre latérale droite',
        'panel.qn.note': 'Le rail d\'icônes sous « Ouvrir la barre latérale droite » ; un clic saute vers l\'onglet correspondant',
        'panel.qn.row': 'Afficher',
        'panel.qn.aria': 'Mode d\'affichage de la navigation rapide',
        'panel.qn.optThree': 'Trois · se déploient au survol',
        'panel.qn.optAll': 'Tout afficher',
        'panel.qn.optOff': 'Désactivée',
        'panel.reset.armed': 'Cliquez encore pour confirmer',
        'panel.reset.label': 'Rétablir les réglages par défaut',
        'panel.reset.hint': 'Efface toutes les personnalisation de thème, de mode, de fond, de taille de texte, de couleur d\'accent et de police',
        'theme.zhuoer': 'Zhuoer 原版红',
        'theme.absolutely': 'Absolutely · 极简',
        'theme.beacon': '灯塔 · Beacon',
        'theme.crt': 'CRT · 终端',
        'theme.dash': 'Dash · 琥珀',
        'theme.knot': 'Knot · 绳结',
        'theme.manuscript': '手稿 · Manuscript',
        'theme.miami': '迈阿密 · Miami',
        'theme.phosphor': '荧光 · Phosphor',
        'theme.rose': '桃红 · Rose',
        'theme.tide': '潮汐 · Tide',
        'theme.vintagePaper': 'Vintage Paper',
        'panel.foot.build': 'Compilation {ver} · garde notre feuille de styles en dernier pour qu\'elle l\'emporte sur les autres plugins · les réglages restent dans le localStorage local',
        'panel.io.jsonAria': 'JSON du thème',
        'panel.io.exportTitle': 'Exporter le JSON du thème',
        'panel.io.importTitle': 'Importer le JSON du thème',
        'panel.io.close': 'Fermer',
        'panel.io.exportHint': 'Tout sélectionner et copier pour partager ; ne contient que les ancres de ce thème (pas les 224 jetons dérivés). L\'image de fond personnalisée n\'est pas incluse',
        'panel.io.importHint': 'Collez un JSON exporté par quelqu\'un d\'autre ; il sera ajouté à la liste des thèmes',
        'panel.io.import': 'Importer',
        'panel.io.parseErr': 'JSON illisible ou invalide (il faut id/label/base plus les couleurs --dsw-alias-* sous dark/light)',
        'panel.err.title': 'Le panneau de thèmes a planté : {msg}',
        'panel.err.retry': 'Réessayer',
        'panel.err.reload': 'Recharger la page',
        'panel.err.hint': 'Si cela persiste, envoyez le message ci-dessus à l\'auteur',
        'panel.custom.newLabel': 'Personnalisé {n}',
        'panel.custom.copySuffix': ' copie',
        'panel.custom.limitErr': 'Au plus {n} thèmes personnalisés ; supprimez-en un avant d\'en créer ou d\'en importer un autre',
        'panel.custom.dropped': '{n} thèmes personnalisés dépassent la limite de {max} et ont été ignorés : {ids}',
        'panel.custom.droppedClose': 'Compris',
        'panel.a11y.live': 'Basculé vers {label}',
        'panel.theme.deleteConfirm': 'Cliquez encore pour supprimer',
        'panel.alert.imgMax': 'L\'image doit peser moins de 3 MiB',
        'panel.alert.imgStore': 'Cette image est trop volumineuse pour le stockage local du navigateur ; choisissez-en une plus petite',
        'anchor.bg': 'Fond',
        'anchor.text': 'Texte',
        'anchor.border': 'Bordure',
        'anchor.brand': 'Couleur de marque principale',
        'anchor.brand2': 'Couleur de marque secondaire',
        'anchor.danger': 'Danger',
        'anchor.warn': 'Avertissement',
        'anchor.success': 'Succès',
        'preset.glass': 'Vitrail',
        'preset.brutal': 'Néo-brutalisme',
        'preset.swiss': 'Suisse international',
        'preset.editorial': 'Éditorial',
        'preset.luxe': 'Luxe minimal',
        'preset.organic': 'Organique',
        'preset.morandi': 'Morandi',
        'preset.paper': 'Papier',
        'preset.cyber': 'Terminal cyber',
        'preset.aurora': 'Aurore',
        'preset.devterm': 'Terminal développeur',
        'preset.deepspace': 'Espace profond',
        'panel.chat.texOff': 'Texture : désactivée · dites « ajoute une texture » si vous en voulez une',
        'panel.mdfine.title': 'Finitions Markdown',
        'panel.mdfine.note': 'L\'apparence seule : taille des titres, bloc de code, tableau, citation',
        'panel.mdfine.headRow': 'Taille des titres',
        'panel.mdfine.headAria': 'Taille des titres Markdown',
        'panel.mdfine.headTheme': 'Selon le thème',
        'panel.mdfine.headCompact': 'Compact',
        'panel.mdfine.headClear': 'Niveaux nets',
        'panel.mdfine.headNote': 'Selon le thème utilise les tailles du host ; Niveaux nets espace davantage les titres',
        'panel.mdfine.codeRow': 'Bloc de code',
        'panel.mdfine.codeAria': 'Style du bloc de code Markdown',
        'panel.mdfine.codeNone': 'Sans bordure',
        'panel.mdfine.codeLine': 'Bordure fine',
        'panel.mdfine.codeCard': 'Carte',
        'panel.mdfine.codeNote': 'Carte ajoute un fond et des angles arrondis : le bloc se détache du texte',
        'panel.mdfine.tableRow': 'Tableau',
        'panel.mdfine.tableAria': 'Style de tableau Markdown',
        'panel.mdfine.tablePlain': 'Normal',
        'panel.mdfine.tableLine': 'Bordé',
        'panel.mdfine.tableZebra': 'Zébré',
        'panel.mdfine.tableNote': 'Bordé ajoute des bordures aux cellules ; Zébré ajoute des lignes alternées et un en-tête',
        'panel.mdfine.quoteRow': 'Citation',
        'panel.mdfine.quoteAria': 'Style de citation Markdown',
        'panel.mdfine.quotePlain': 'Normal',
        'panel.mdfine.quoteStrong': 'Marquée',
        'panel.mdfine.quoteNote': 'Marquée épaissit le trait de gauche et ajoute un fond teinté',
        'panel.presets.note': 'Choisissez un style pour créer un thème personnalisable que vous pourrez ajuster.',
        'panel.custom.title': 'Couleurs personnalisées',
        'panel.custom.note': 'Ajustez un thème personnalisé couleur par couleur ; l\'enregistrement l\'écrit sur cet appareil.',
        'panel.custom.empty': 'Ceci est un thème intégré. Créez-en un personnalisé pour ajuster ses ancres de couleur.',
        'panel.custom.basedOn': 'D\'après {theme}',
        'panel.prefs.title': 'Préférences globales',
        'panel.prefs.note': 'Ces réglages s\'appliquent à tous les thèmes.',
        'panel.ed.baseSection': 'Base et mode',
        'panel.ed.base': 'Thème de base',
        'panel.ed.baseAria': 'Thème de base',
        'panel.ed.previewNote': 'Aperçu en direct : les changements d\'ancres apparaissent ici d\'abord ; l\'enregistrement les écrit sur cet appareil.',
        'panel.ed.band.base': 'Fond et surfaces',
        'panel.ed.band.text': 'Texte',
        'panel.ed.band.line': 'Bordures',
        'panel.ed.band.brand': 'Marque',
        'panel.ed.band.semantic': 'Couleurs sémantiques',
        'panel.ed.defaultAria': 'Par défaut {hex}',
        'panel.ed.undo': 'Défaire',
        'panel.ed.resetAll': 'Rétablir la base',
        'panel.ed.resetAllTitle': 'Effacer les ancres modifiées dans ce mode',
        'panel.ed.toolsShow': 'Afficher les outils IA et image',
        'panel.ed.toolsHide': 'Masquer les outils IA et image',
        'panel.bg.opacityCapCapped': 'plein écran = {p} % d\'opacité (limité pour le contraste)',
      },
      ja: {
        'rail.ariaLabel': '右サイドバーのクイックナビ',
        'rail.anchorLabel': 'クイックナビのアンカー',
        'rail.empty': '移動できる右サイドバーのタブがありません',
        'rail.noService': 'このホストには右サイドバー機能がありません',
        'rail.openFailed': 'そのタブを開けませんでした',
        'panel.brand.title': 'ブランド枠',
        'panel.brand.note': '左上の deepseek HARNESS バッジ。オフならホスト既定の表示',
        'panel.brand.toggle': '有効にする',
        'panel.brand.toggleHint': '任意の画像に差し替えます',
        'panel.brand.builtinHint': '内蔵ロゴを使用中（画像を選ぶと差し替わります）',
        'panel.brand.imageRow': '画像',
        'panel.brand.pick': '画像を選ぶ…',
        'panel.brand.repick': '画像を変更…',
        'panel.brand.previewAlt': '現在のブランド画像',
        'panel.brand.remove': '削除',
        'panel.brand.autoHint': '画像なし＝内蔵ロゴ。アップロードは最長辺 512px に縮小されます',
        'panel.brand.replacedHint': '差し替え済み。ホストの更新でバッジ構造が変わると自動的に元の表示に戻ります',
        'panel.header.title': '外観',
        'panel.header.count': '{n} 套配色',
        'panel.header.live': '変更は即座に適用',
        'panel.theme.title': '配色をテーマ',
        'panel.theme.note': '選ぶと即座に適用。ライト／ダークで 2 組のうちどちらを使うかが決まります',
        'panel.theme.modeRow': 'モード',
        'panel.theme.modeAria': '配色モード',
        'panel.theme.optLight': 'ライト',
        'panel.theme.optDark': 'ダーク',
        'panel.theme.optAuto': 'システムに合わせる',
        'panel.theme.addTitle': 'カスタムテーマを作成（現在のテーマから複製）',
        'panel.theme.addLabel': '新しいテーマ',
        'panel.theme.edit': '配色を編集',
        'panel.theme.duplicate': '複製',
        'panel.theme.exportJson': 'JSON を書き出す',
        'panel.theme.delete': '削除',
        'panel.theme.importJson': 'JSON を読み込む',
        'panel.bg.title': '背景画像',
        'panel.bg.note': 'メイン列のみ。サイドバーと入力欄はテーマの単色のまま',
        'panel.bg.sourceRow': 'ソース',
        'panel.bg.sourceAria': '背景のソース',
        'panel.bg.optNone': 'なし',
        'panel.bg.optTheme': 'テーマのテクスチャ',
        'panel.bg.optImage': 'カスタム画像',
        'panel.bg.imageRow': '画像',
        'panel.bg.pick': '画像を選ぶ…',
        'panel.bg.previewAlt': '現在の背景',
        'panel.bg.remove': '削除',
        'panel.bg.formatHint': 'JPEG / PNG / WebP · 最大 8 MiB',
        'panel.bg.styleRow': 'スタイル',
        'panel.bg.styleAria': '背景のスタイル',
        'panel.bg.optFade': 'フェード',
        'panel.bg.optFull': '全画面',
        'panel.bg.opacityRow': '濃度',
        'panel.bg.opacityCap': '全画面＝不透明度 70%',
        'panel.bg.opacityAria': '背景の濃度（スライダー 100%＝実際の不透明度 70%）',
        'panel.bg.showRow': '表示場所',
        'panel.bg.showEmpty': '新しいセッション画面',
        'panel.bg.showSession': 'セッション中',
        'panel.bg.offHint': '背景はオフ。ソースを選ぶとこれらの設定が使われます',
        'panel.section.title': 'Zhuoer テーマ',
        'panel.sel.follow': 'テーマに合わせる',
        'panel.sel.current': '{value}（現在）',
        'panel.ed.pickerAria': '{label} カラーピッカー',
        'panel.ed.hexAria': '{label} の 16 進値',
        'panel.ed.low': '低い',
        'panel.ed.resetAria': '{label} を複製元の値に戻す',
        'panel.ed.resetTitleDirty': '複製元の値に戻す',
        'panel.ed.resetTitleClean': 'すでに複製元の値です',
        'panel.ed.dialogAria': 'カスタムテーマエディター',
        'panel.ed.title': '配色を編集',
        'panel.ed.closeAria': 'エディターを閉じる',
        'panel.ed.closeTitle': '閉じる（未保存の変更は確認されます）',
        'panel.ed.secAppearance': '外観',
        'panel.ed.clonedFrom': '{theme} から複製。ほかの token は差分で派生します',
        'panel.ed.name': '名前',
        'panel.ed.nameAria': 'テーマ名',
        'panel.ed.dark': 'ダーク',
        'panel.ed.autoDark': 'ライトから逆算（背景・文字・枠は反転、ブランドと意味色は維持）',
        'panel.ed.editRow': '編集',
        'panel.ed.schemeAria': '編集するモード',
        'panel.ed.light': 'ライト',
        'panel.ed.anchors': 'アンカー色',
        'panel.ed.anchorsNote': '変更は右側の実画面でプレビュー。保存するまで反映されません',
        'panel.ed.advanced': '詳細 · token 単位',
        'panel.ed.advancedNote': 'アンカー背後の 156 token。文字が 3:1 を下回ると自動で元に戻ります',
        'panel.ed.advShow': 'すべての token を表示',
        'panel.ed.advHide': '閉じる',
        'panel.ed.confirmDiscard': '未保存の変更があります。破棄しますか？',
        'panel.ed.dirtyHint': '未保存の変更',
        'panel.ed.keepEditing': '編集を続ける',
        'panel.ed.cancel': 'キャンセル',
        'panel.ed.discard': '変更を破棄',
        'panel.ed.save': '保存',
        'panel.ai.failed': '生成に失敗しました',
        'panel.ai.badJson': 'モデルが解析可能なテーマ JSON を返しませんでした。表現を変えてお試しください',
        'panel.palette.noColors': 'この画像から使える色が見つかりません',
        'panel.palette.failed': '色の抽出に失敗しました',
        'panel.palette.notEnough': 'アンカーに割り当てる十分な色がありません',
        'panel.ed.presets': 'スタイルプリセット',
        'panel.ed.presetsNote': 'アンカー・角丸・フォントをまとめて置き換えます',
        'panel.ed.presetTitle': '{label} · 角丸 {radius} · {body}',
        'panel.ed.mono': '等幅',
        'panel.ed.aiSection': 'AI と色の抽出',
        'panel.ed.aiNote': 'まずプレビュー。適用は下書きにのみ反映されます',
        'panel.ed.aiRow': 'AI 生成',
        'panel.ed.aiPromptAria': 'スタイルの説明',
        'panel.ed.aiPromptPh': 'スタイルを説明してください（例：レトロ端末、灰色の背景、黄色の主色、青い副色、等幅フォント、角のない角）',
        'panel.ed.generating': '生成中…',
        'panel.ed.generate': '生成',
        'panel.ed.aiPreview': '「{label}」',
        'panel.ed.aiDropped': '（不明のキー {n} 件を破棄）',
        'panel.ed.applyCurrent': '現在のテーマに適用',
        'panel.chat.apply': '適用',
        'panel.chat.modify': '変更',
        'panel.chat.applied': 'DSH に適用しました',
        'panel.chat.ovApplied': '適用済み · {n} 件の上書き',
        'panel.chat.sampled': '参考画像から色を取得しました',
        'panel.chat.ovSoft': 'コントラストのため {s} 件を元に戻しました',
        'panel.chat.preview': 'プレビュー',
        'panel.chat.editing': '編集中',
        'panel.chat.cancel': 'キャンセル',
        'panel.chat.applyEdited': 'これを適用',
        'panel.chat.nameAria': 'テーマ名',
        'panel.chat.fail': '適用に失敗しました',
        'panel.chat.limitErr': 'カスタムテーマの上限（{n}）に達しました。先に 1 つ削除してください',
        'panel.ed.drop': '破棄',
        'panel.ed.pickFromImage': '画像から色を抽出',
        'panel.ed.picking': '抽出中…',
        'panel.ed.pickImage': '画像を選ぶ…',
        'panel.ed.clear': 'クリア',
        'panel.ed.bgSection': '背景画像',
        'panel.ed.bgNote': '1 枚 3 MiB 以下。本地の IndexedDB に保存されます',
        'panel.ed.bgSourceAria': 'テーマの背景ソース',
        'panel.ed.bgFollowGlobal': '全体設定に従う',
        'panel.ed.bgThemeOwn': 'テーマのテクスチャ',
        'panel.ed.bgCustom': '自分の写真',
        'panel.ed.bgNone': '背景なし',
        'panel.ed.imageRow': '画像',
        'panel.ed.bgPreviewAlt': 'テーマの背景プレビュー',
        'panel.ed.bgStoredHint': 'IndexedDB に保存。1 枚あたり 3 MiB 以下',
        'panel.ed.opacityRow': '濃度',
        'panel.ed.bgOpacityAria': 'テーマの背景の濃度',
        'panel.ed.shapeSection': '形状とフォント',
        'panel.ed.shapeNote': 'このテーマにだけ反映されます',
        'panel.ed.radiusRow': '角丸',
        'panel.ed.sharpRow': '他プラグインの制御',
        'panel.ed.sharpOn': 'プラグイン UI のハードコードされた角丸と枠を平たくする',
        'panel.ed.sharpNote': '角丸や枠を自前で持つプラグインの制御にだけ影響します（例：サイドバーのセグメントボタン）。テーマ自体が直角のときは自動的に有効になります',
        'panel.ed.radiusAria': '角丸の大きさ',
        'panel.ed.radiusSquare': '直角',
        'panel.ed.radiusSmall': '小',
        'panel.ed.radiusNormal': '標準',
        'panel.ed.radiusLarge': '大',
        'panel.ed.radiusXL': '特大',
        'panel.ed.bodyFont': '本文フォント',
        'panel.ed.chatFont': 'チャットフォント',
        'panel.ed.followBase': '{theme} に合わせる',
        'panel.type.title': 'タイポグラフィ',
        'panel.type.note': 'レイアウト寸法を変えずに文字（UI と本文）を拡大します。幾何学的ズームはホストのサイドバードラッグと衝突するため門禁で禁止しています',
        'panel.type.sizeRow': 'メッセージ文字サイズ',
        'panel.type.sizeAria': 'メッセージ文字サイズ',
        'panel.a11y.hitRow': 'クリック領域',
        'panel.a11y.procRow': 'ステップアイコン',
        'panel.a11y.procOn': '意味の色を使う',
        'panel.a11y.procNote': '思考=紫 / 実行=青 / 閲覧=緑 / 変更と質問=琥珀',
        'panel.type.mdHeadRow': '見出しの色',
        'panel.type.mdHeadAria': 'Markdown の見出し色',
        'panel.type.mdHeadFollow': '本文に合わせる',
        'panel.type.mdHeadSoft': 'ブランド（淡）',
        'panel.type.mdHeadBrand': 'ブランド',
        'panel.type.mdHeadNote': 'テーマのブランド色と本文色から導出。テーマやアクセント色の変更に追従します',
        'panel.type.mdRow': '読みやすさの調整',
        'panel.type.mdAria': 'Markdown の読みやすさの調整',
        'panel.type.mdCompact': 'コンパクト',
        'panel.type.mdNormal': '標準',
        'panel.type.mdRoomy': 'ゆったり',
        'panel.type.mdNote': '行間・段落の間隔・見出しの大きさだけ。文字サイズは上の行のままです',
        'panel.a11y.hitOn': '44×44 に拡大',
        'panel.a11y.hitNote': 'アイコンボタンの最小サイズを 44px に。レイアウトはわずかに広がります',
        'panel.type.pxHint': '本文 ≈{px}px',
        'panel.type.scaleMiss': 'UI の文字拡大が効いていません：ホストのスタイルシートに拡大可能な font-size ルールが見つかりません（この行を報告してください）',
        'panel.type.widthRow': '本文の幅',
        'panel.type.widthAria': '本文の幅（ピクセル）',
        'panel.type.widthPh': '920',
        'panel.type.widthHint': '空欄＝既定の 920px（画面が狭いと自動的に縮みます）。640〜1600 を入力すると上書きします。幅の変数だけを変え、レイアウトは変えません',
        'panel.type.fontRow': 'フォント',
        'panel.type.fontPh': 'テーマのフォントを使う',
        'panel.type.fontAria': 'UI フォント',
        'panel.type.fontHint': 'プラグイン同梱のフォントだけを一覧します。使えないフォントが黙って既定に戻ることはありません',
        'panel.scale.small': '小',
        'panel.scale.default': '標準',
        'panel.scale.large': '大',
        'panel.scale.xl': '特大',
        'panel.scale.xxl': '特大',
        'panel.accent.title': 'アクセントカラー',
        'panel.accent.note': 'ボタンとリンクのテーマブランド色を置き換えます',
        'panel.accent.row': '色',
        'panel.accent.swatchAria': 'アクセント {hex}',
        'panel.accent.custom': '任意のアクセント色',
        'panel.accent.reset': 'テーマの色に戻す',
        'panel.qn.title': '右サイドバーのクイックナビ',
        'panel.qn.note': '「右サイドバーを開く」の下にあるアイコンレール。ワンクリックで対応するタブへ移動します',
        'panel.qn.row': '表示',
        'panel.qn.aria': 'クイックナビの表示モード',
        'panel.qn.optThree': '3 つ · ホバーで展開',
        'panel.qn.optAll': 'すべて表示',
        'panel.qn.optOff': 'オフ',
        'panel.reset.armed': 'もう一度クリックで確定',
        'panel.reset.label': '既定の設定に戻す',
        'panel.reset.hint': 'テーマ・モード・背景・文字サイズ・アクセント色・フォントの設定をすべて消去します',
        'theme.zhuoer': 'Zhuoer 原版红',
        'theme.absolutely': 'Absolutely · 极简',
        'theme.beacon': '灯塔 · Beacon',
        'theme.crt': 'CRT · 终端',
        'theme.dash': 'Dash · 琥珀',
        'theme.knot': 'Knot · 绳结',
        'theme.manuscript': '手稿 · Manuscript',
        'theme.miami': '迈阿密 · Miami',
        'theme.phosphor': '荧光 · Phosphor',
        'theme.rose': '桃红 · Rose',
        'theme.tide': '潮汐 · Tide',
        'theme.vintagePaper': 'Vintage Paper',
        'panel.foot.build': 'ビルド {ver} · スタイルシートを最後に適用して他プラグインより優先 · 設定はローカルの localStorage に保存されます',
        'panel.io.jsonAria': 'テーマ JSON',
        'panel.io.exportTitle': 'テーマ JSON を書き出す',
        'panel.io.importTitle': 'テーマ JSON を読み込む',
        'panel.io.close': '閉じる',
        'panel.io.exportHint': '全選択してコピーして共有できます。含まれるのはこのテーマのアンカーだけで、派生した 224 token は含みません。カスタム背景画像も含まれません',
        'panel.io.importHint': '他の人が書き出した JSON を貼り付けると、テーマの一覧に追加されます',
        'panel.io.import': '読み込む',
        'panel.io.parseErr': 'JSON を解析できないか不正です（id／label／base と dark／light 配下の --dsw-alias-* の色が必要）',
        'panel.err.title': 'テーマパネルがクラッシュしました：{msg}',
        'panel.err.retry': '再試行',
        'panel.err.reload': 'ページを再読み込み',
        'panel.err.hint': '続く場合は上のメッセージを作者に送ってください',
        'panel.custom.newLabel': 'カスタム {n}',
        'panel.custom.copySuffix': 'コピー',
        'panel.custom.limitErr': 'カスタムテーマは最大 {n} 件です。作成・読み込みの前に 1 件削除してください',
        'panel.custom.dropped': 'カスタムテーマ {n} 件が上限 {max} を超えたため無視されました：{ids}',
        'panel.custom.droppedClose': '了解',
        'panel.a11y.live': '{label} に切り替えました',
        'panel.theme.deleteConfirm': 'もう一度クリックで削除',
        'panel.alert.imgMax': '画像は 3 MiB 未満にしてください',
        'panel.alert.imgStore': 'この画像はブラウザのローカル保存領域には大きすぎます。もう少し小さいものを選んでください',
        'anchor.bg': '背景',
        'anchor.text': '文字',
        'anchor.border': '枠',
        'anchor.brand': 'ブランド主色',
        'anchor.brand2': 'ブランド副色',
        'anchor.danger': '危険',
        'anchor.warn': '警告',
        'anchor.success': '成功',
        'preset.glass': 'ガラスモーフィズム',
        'preset.brutal': 'ネオブルータリズム',
        'preset.swiss': 'スイスインターナショナル',
        'preset.editorial': 'エディトリアル',
        'preset.luxe': 'ラグジュアリーミニマル',
        'preset.organic': 'オーガニック',
        'preset.morandi': 'モランディ',
        'preset.paper': 'ペーパー',
        'preset.cyber': 'サイバーターミナル',
        'preset.aurora': 'オーロラ',
        'preset.devterm': '開発者ターミナル',
        'preset.deepspace': 'ディープスペース',
        'panel.chat.texOff': 'テクスチャ：未使用 · 必要なら「テクスチャを追加」と伝えてください',
        'panel.mdfine.title': 'Markdown の微調整',
        'panel.mdfine.note': '見た目だけ：見出しサイズ、コードブロック、表、引用',
        'panel.mdfine.headRow': '見出しサイズ',
        'panel.mdfine.headAria': 'Markdown の見出しサイズ',
        'panel.mdfine.headTheme': 'テーマに合わせる',
        'panel.mdfine.headCompact': 'コンパクト',
        'panel.mdfine.headClear': '段階を明確化',
        'panel.mdfine.headNote': 'テーマに合わせる＝ホストの見出しサイズを使う／段階を明確化＝見出し間の差を広く',
        'panel.mdfine.codeRow': 'コードブロック',
        'panel.mdfine.codeAria': 'Markdown のコードブロックスタイル',
        'panel.mdfine.codeNone': '枠なし',
        'panel.mdfine.codeLine': '細い枠',
        'panel.mdfine.codeCard': 'カード',
        'panel.mdfine.codeNote': 'カードは背景と角丸を足し、本文から浮かせる',
        'panel.mdfine.tableRow': '表',
        'panel.mdfine.tableAria': 'Markdown の表スタイル',
        'panel.mdfine.tablePlain': '標準',
        'panel.mdfine.tableLine': '罫線',
        'panel.mdfine.tableZebra': '斑馬',
        'panel.mdfine.tableNote': '罫線＝セルに境界線／斑馬はさらに交互の背景とヘッダ背景',
        'panel.mdfine.quoteRow': '引用',
        'panel.mdfine.quoteAria': 'Markdown の引用スタイル',
        'panel.mdfine.quotePlain': '標準',
        'panel.mdfine.quoteStrong': '強調',
        'panel.mdfine.quoteNote': '強調は左罫を太くし淡い背景を足す',
        'panel.presets.note': 'スタイルを選ぶと、あとから微調整できるカスタムテーマが新規作成されます。',
        'panel.custom.title': 'カスタム配色',
        'panel.custom.note': 'カスタムテーマを色ごとに微調整します。保存するとこの端末に書き込まれます。',
        'panel.custom.empty': '現在は組み込みテーマです。新規作成するとアンカー色を個別に調整できます。',
        'panel.custom.basedOn': '{theme} をベースに',
        'panel.prefs.title': '全体の設定',
        'panel.prefs.note': 'これらの設定はすべてのテーマに適用されます。',
        'panel.ed.baseSection': 'ベースと表示モード',
        'panel.ed.base': 'ベーステーマ',
        'panel.ed.baseAria': 'ベーステーマ',
        'panel.ed.previewNote': 'リアルタイムプレビュー。アンカーの変更はまずここに反映され、保存すると端末に書き込まれます。',
        'panel.ed.band.base': '背景と表面',
        'panel.ed.band.text': '文字',
        'panel.ed.band.line': '境界線',
        'panel.ed.band.brand': 'ブランド',
        'panel.ed.band.semantic': 'セマンティックカラー',
        'panel.ed.defaultAria': '既定 {hex}',
        'panel.ed.undo': '元に戻す',
        'panel.ed.resetAll': 'ベース値に戻す',
        'panel.ed.resetAllTitle': 'この表示モードのアンカー上書きを消去',
        'panel.ed.toolsShow': 'AI と画像ツールを開く',
        'panel.ed.toolsHide': 'AI と画像ツールを閉じる',
        'panel.bg.opacityCapCapped': '全画面＝不透明度 {p}%（コントラストのため制限）',
      },
      pt: {
        'rail.ariaLabel': 'Navegação rápida da barra lateral direita',
        'rail.anchorLabel': 'Ancora da navegação rápida',
        'rail.empty': 'Não há separadores na barra lateral direita para saltar',
        'rail.noService': 'Este host não tem serviço de barra lateral direita',
        'rail.openFailed': 'Não foi possível abrir esse separador',
        'panel.brand.title': 'Espaço de marca',
        'panel.brand.note': 'O emblema deepseek HARNESS no canto superior esquerdo; desativado = o do host',
        'panel.brand.toggle': 'Ativar',
        'panel.brand.toggleHint': 'Substituir pela sua própria imagem',
        'panel.brand.builtinHint': 'A usar o logótipo incluído (escolha uma imagem para substituir)',
        'panel.brand.imageRow': 'Imagem',
        'panel.brand.pick': 'Escolher imagem…',
        'panel.brand.repick': 'Trocar imagem…',
        'panel.brand.previewAlt': 'Pré-visualização da imagem de marca atual',
        'panel.brand.remove': 'Remover',
        'panel.brand.autoHint': 'Sem imagem = logótipo incluído; os envios são reduzidos a 512 px no lado maior',
        'panel.brand.replacedHint': 'Substituído. Se uma atualização do host mudar a estrutura do emblema, volta silenciosamente ao original',
        'panel.header.title': 'Aparência',
        'panel.header.count': '{n} paletas',
        'panel.header.live': 'As alterações aplicam-se de imediato',
        'panel.theme.title': 'Tema de cor',
        'panel.theme.note': 'A escolha aplica-se logo; claro/escuro decide qual das duas paletas fica em uso',
        'panel.theme.modeRow': 'Modo',
        'panel.theme.modeAria': 'Modo de cor',
        'panel.theme.optLight': 'Claro',
        'panel.theme.optDark': 'Escuro',
        'panel.theme.optAuto': 'Seguir o sistema',
        'panel.theme.addTitle': 'Criar um tema personalizado (clonado do atual)',
        'panel.theme.addLabel': 'Novo tema',
        'panel.theme.edit': 'Editar cores',
        'panel.theme.duplicate': 'Duplicar',
        'panel.theme.exportJson': 'Exportar JSON',
        'panel.theme.delete': 'Eliminar',
        'panel.theme.importJson': 'Importar JSON',
        'panel.bg.title': 'Imagem de fundo',
        'panel.bg.note': 'Apenas a coluna principal; a barra lateral e a caixa de escrita mantêm a cor sólida do tema',
        'panel.bg.sourceRow': 'Origem',
        'panel.bg.sourceAria': 'Origem do fundo',
        'panel.bg.optNone': 'Nenhum',
        'panel.bg.optTheme': 'Textura do tema',
        'panel.bg.optImage': 'Imagem personalizada',
        'panel.bg.imageRow': 'Imagem',
        'panel.bg.pick': 'Escolher imagem…',
        'panel.bg.previewAlt': 'Pré-visualização do fundo atual',
        'panel.bg.remove': 'Remover',
        'panel.bg.formatHint': 'JPEG / PNG / WebP · até 8 MiB',
        'panel.bg.styleRow': 'Estilo',
        'panel.bg.styleAria': 'Estilo do fundo',
        'panel.bg.optFade': 'Esbatido',
        'panel.bg.optFull': 'Sem margens',
        'panel.bg.opacityRow': 'Visibilidade',
        'panel.bg.opacityCap': 'sem margens = 70 % de opacidade',
        'panel.bg.opacityAria': 'Visibilidade do fundo (100 % no cursor = 70 % de opacidade real)',
        'panel.bg.showRow': 'Mostrar em',
        'panel.bg.showEmpty': 'Página de nova sessão',
        'panel.bg.showSession': 'Em sessão',
        'panel.bg.offHint': 'O fundo está desligado; estes estilos aplicam-se assim que escolher uma origem',
        'panel.section.title': 'Tema Zhuoer',
        'panel.sel.follow': 'Seguir o tema',
        'panel.sel.current': '{value} (atual)',
        'panel.ed.pickerAria': 'Seletor de cor de {label}',
        'panel.ed.hexAria': 'Valor hexadecimal de {label}',
        'panel.ed.low': ' baixo',
        'panel.ed.resetAria': 'Repor {label} ao valor do tema clonado',
        'panel.ed.resetTitleDirty': 'Repor ao valor do tema clonado',
        'panel.ed.resetTitleClean': 'Já é o valor do tema clonado',
        'panel.ed.dialogAria': 'Editor de tema personalizado',
        'panel.ed.title': 'Editar cores',
        'panel.ed.closeAria': 'Fechar o editor',
        'panel.ed.closeTitle': 'Fechar (alterações por guardar são confirmadas primeiro)',
        'panel.ed.secAppearance': 'Aparência',
        'panel.ed.clonedFrom': 'Clonado de {theme}; os restantes tokens são derivados por diferença',
        'panel.ed.name': 'Nome',
        'panel.ed.nameAria': 'Nome do tema',
        'panel.ed.dark': 'Escuro',
        'panel.ed.autoDark': 'Derivado do esquema claro (fundo/texto/moldura invertidos; cor de marca e cores semânticas mantidas)',
        'panel.ed.editRow': 'Editar',
        'panel.ed.schemeAria': 'Esquema em edição',
        'panel.ed.light': 'Claro',
        'panel.ed.anchors': 'Âncoras de cor',
        'panel.ed.anchorsNote': 'As alterações mostram-se na interface real à direita; nada é gravado até carregar em Guardar',
        'panel.ed.advanced': 'Avançado · token a token',
        'panel.ed.advancedNote': 'Todos os 156 tokens por trás das âncoras; texto abaixo de 3:1 volta automaticamente ao valor anterior',
        'panel.ed.advShow': 'Mostrar todos os tokens',
        'panel.ed.advHide': 'Recolher',
        'panel.ed.confirmDiscard': 'Há alterações por guardar — descartá-las?',
        'panel.ed.dirtyHint': 'Alterações por guardar',
        'panel.ed.keepEditing': 'Continuar a editar',
        'panel.ed.cancel': 'Cancelar',
        'panel.ed.discard': 'Descartar alterações',
        'panel.ed.save': 'Guardar',
        'panel.ai.failed': 'Falha na geração',
        'panel.ai.badJson': 'O modelo não devolveu JSON de tema analisável — tente reformular',
        'panel.palette.noColors': 'Não foram encontradas cores utilizáveis nesta imagem',
        'panel.palette.failed': 'Falha ao extrair as cores',
        'panel.palette.notEnough': 'Cores insuficientes para atribuir às âncoras',
        'panel.ed.presets': 'Predefinições de estilo',
        'panel.ed.presetsNote': 'Substitui tudo de uma vez: âncoras, raios e tipos de letra',
        'panel.ed.presetTitle': '{label} · raio {radius} · {body}',
        'panel.ed.mono': 'monoespaçado',
        'panel.ed.aiSection': 'IA e extração de cores',
        'panel.ed.aiNote': 'O resultado é pré-visualizado primeiro; só «Aplicar» toca no rascunho',
        'panel.ed.aiRow': 'Geração por IA',
        'panel.ed.aiPromptAria': 'Descrição do estilo',
        'panel.ed.aiPromptPh': 'Descreva o estilo, p. ex. terminal retro, fundo cinzento, primário amarelo, secundário azul, monoespaçado, cantos retos',
        'panel.ed.generating': 'A gerar…',
        'panel.ed.generate': 'Gerar',
        'panel.ed.aiPreview': '«{label}»',
        'panel.ed.aiDropped': ' ({n} chaves desconhecidas descartadas)',
        'panel.ed.applyCurrent': 'Aplicar ao tema atual',
        'panel.chat.apply': 'Aplicar',
        'panel.chat.modify': 'Modificar',
        'panel.chat.applied': 'Aplicado ao DSH',
        'panel.chat.ovApplied': 'Aplicado · {n} substituições',
        'panel.chat.sampled': 'Cores extraídas da imagem de referência',
        'panel.chat.ovSoft': '{s} revertidos por contraste',
        'panel.chat.preview': 'Pré-visualização',
        'panel.chat.editing': 'A editar',
        'panel.chat.cancel': 'Cancelar',
        'panel.chat.applyEdited': 'Aplicar estes',
        'panel.chat.nameAria': 'Nome do tema',
        'panel.chat.fail': 'Falha ao aplicar',
        'panel.chat.limitErr': 'Atingiu o limite de temas personalizados ({n}); elimine um primeiro',
        'panel.ed.drop': 'Descartar',
        'panel.ed.pickFromImage': 'Extrair cores de uma imagem',
        'panel.ed.picking': 'A extrair…',
        'panel.ed.pickImage': 'Escolher imagem…',
        'panel.ed.clear': 'Limpar',
        'panel.ed.bgSection': 'Imagem de fundo',
        'panel.ed.bgNote': 'Uma imagem ≤ 3 MiB, guardada no IndexedDB local',
        'panel.ed.bgSourceAria': 'Origem do fundo do tema',
        'panel.ed.bgFollowGlobal': 'Seguir o global',
        'panel.ed.bgThemeOwn': 'Textura do tema',
        'panel.ed.bgCustom': 'A minha foto',
        'panel.ed.bgNone': 'Sem fundo',
        'panel.ed.imageRow': 'Imagem',
        'panel.ed.bgPreviewAlt': 'Pré-visualização do fundo do tema',
        'panel.ed.bgStoredHint': 'Guardada no IndexedDB, ≤ 3 MiB por imagem',
        'panel.ed.opacityRow': 'Visibilidade',
        'panel.ed.bgOpacityAria': 'Visibilidade do fundo do tema',
        'panel.ed.shapeSection': 'Formas e tipos de letra',
        'panel.ed.shapeNote': 'Affects apenas este tema',
        'panel.ed.radiusRow': 'Raio dos cantos',
        'panel.ed.sharpRow': 'Controlos de outros plugins',
        'panel.ed.sharpOn': 'Achatar raios e molduras fixos no código da interface de plugins',
        'panel.ed.sharpNote': 'Affects apenas os controlos de plugins que trazem o próprio raio ou moldura (por exemplo os botões segmentados da barra lateral). Liga-se automaticamente quando o tema é reto',
        'panel.ed.radiusAria': 'Tamanho do raio',
        'panel.ed.radiusSquare': 'Reto',
        'panel.ed.radiusSmall': 'Pequeno',
        'panel.ed.radiusNormal': 'Normal',
        'panel.ed.radiusLarge': 'Grande',
        'panel.ed.radiusXL': 'Muito grande',
        'panel.ed.bodyFont': 'Tipo de letra do texto',
        'panel.ed.chatFont': 'Tipo de letra da conversa',
        'panel.ed.followBase': 'Seguir {theme}',
        'panel.type.title': 'Tipografia',
        'panel.type.note': 'Aumenta o texto (interface e corpo das mensagens) sem mexer na geometria do desenho: o zoom geométrico atrapalha o arrastar da barra lateral do host e está proibido pela porta de qualidade',
        'panel.type.sizeRow': 'Tamanho do texto das mensagens',
        'panel.type.sizeAria': 'Tamanho do texto das mensagens',
        'panel.a11y.hitRow': 'Área de toque',
        'panel.a11y.procRow': 'Ícones de passo',
        'panel.a11y.procOn': 'Cores semânticas',
        'panel.a11y.procNote': 'pensar = violeta / executar = azul / ler = verde / escrever e perguntar = âmbar',
        'panel.type.mdHeadRow': 'Cor dos títulos',
        'panel.type.mdHeadAria': 'Cor dos títulos Markdown',
        'panel.type.mdHeadFollow': 'Seguir o texto',
        'panel.type.mdHeadSoft': 'Marca (suave)',
        'panel.type.mdHeadBrand': 'Marca',
        'panel.type.mdHeadNote': 'Derivada das cores de marca e de texto do tema — segue as mudanças de tema e de destaque',
        'panel.type.mdRow': 'Ritmo de leitura',
        'panel.type.mdAria': 'Ritmo de leitura do Markdown',
        'panel.type.mdCompact': 'Compacto',
        'panel.type.mdNormal': 'Padrão',
        'panel.type.mdRoomy': 'Espaço',
        'panel.type.mdNote': 'Apenas entrelinha, espaçamento de parágrafos e escala dos títulos — o tamanho da letra continua na linha acima',
        'panel.a11y.hitOn': 'Aumentar para 44×44',
        'panel.a11y.hitNote': 'Os botões de ícone ganham um mínimo de 44 px para o toque; o desenho alarga-se um pouco',
        'panel.type.pxHint': 'Texto ≈ {px} px',
        'panel.type.scaleMiss': 'O dimensionamento do texto da interface não teve efeito: não foi encontrada nenhuma regra de font-size escalável nas folhas de estilo do host (envie esta linha, por favor)',
        'panel.type.widthRow': 'Largura da conversa',
        'panel.type.widthAria': 'Largura da conversa em píxeis',
        'panel.type.widthPh': '920',
        'panel.type.widthHint': 'Vazio = 920 px por omissão (estreita-se sozinho em janelas pequenas); escreva 640–1600 para substituir. Só muda a variável de largura, nunca o desenho',
        'panel.type.fontRow': 'Tipo de letra',
        'panel.type.fontPh': 'Usar o tipo de letra do tema',
        'panel.type.fontAria': 'Família de letra da interface',
        'panel.type.fontHint': 'Só são listados os tipos de letra fornecidos com o plugin; uma família indisponível nunca volta atrás em silêncio',
        'panel.scale.small': 'Pequeno',
        'panel.scale.default': 'Normal',
        'panel.scale.large': 'Grande',
        'panel.scale.xl': 'Muito grande',
        'panel.scale.xxl': 'Enorme',
        'panel.accent.title': 'Cor de destaque',
        'panel.accent.note': 'Substitui a cor de marca do tema nos botões e nas ligações',
        'panel.accent.row': 'Cor',
        'panel.accent.swatchAria': 'Destaque {hex}',
        'panel.accent.custom': 'Cor de destaque personalizada',
        'panel.accent.reset': 'Restaurar a cor do tema',
        'panel.qn.title': 'Navegação rápida da barra lateral direita',
        'panel.qn.note': 'A barra de ícones por baixo de «Abrir a barra lateral direita»; um clique salta para o separador correspondente',
        'panel.qn.row': 'Mostrar',
        'panel.qn.aria': 'Modo de exibição da navegação rápida',
        'panel.qn.optThree': 'Três · expandem ao pairar o rato',
        'panel.qn.optAll': 'Mostrar todos',
        'panel.qn.optOff': 'Desligada',
        'panel.reset.armed': 'Clique outra vez para confirmar',
        'panel.reset.label': 'Repor as predefinições',
        'panel.reset.hint': 'Limpa todas as personalizações de tema, modo, fundo, tamanho de letra, cor de destaque e tipo de letra',
        'theme.zhuoer': 'Zhuoer 原版红',
        'theme.absolutely': 'Absolutely · 极简',
        'theme.beacon': '灯塔 · Beacon',
        'theme.crt': 'CRT · 终端',
        'theme.dash': 'Dash · 琥珀',
        'theme.knot': 'Knot · 绳结',
        'theme.manuscript': '手稿 · Manuscript',
        'theme.miami': '迈阿密 · Miami',
        'theme.phosphor': '荧光 · Phosphor',
        'theme.rose': '桃红 · Rose',
        'theme.tide': '潮汐 · Tide',
        'theme.vintagePaper': 'Vintage Paper',
        'panel.foot.build': 'Compilação {ver} · mantém a nossa folha de estilos no fim para ganhar aos outros plugins · as definições ficam no localStorage local',
        'panel.io.jsonAria': 'JSON do tema',
        'panel.io.exportTitle': 'Exportar o JSON do tema',
        'panel.io.importTitle': 'Importar o JSON do tema',
        'panel.io.close': 'Fechar',
        'panel.io.exportHint': 'Selecione tudo e copie para partilhar; contém apenas as âncoras deste tema (não os 224 tokens derivados). A imagem de fundo personalizada não é incluída',
        'panel.io.importHint': 'Cole um JSON exportado por outra pessoa; será acrescentado à lista de temas',
        'panel.io.import': 'Importar',
        'panel.io.parseErr': 'Não foi possível analisar o JSON ou é inválido (precisa de id/label/base e das cores --dsw-alias-* em dark/light)',
        'panel.err.title': 'O painel de temas falhou: {msg}',
        'panel.err.retry': 'Tentar de novo',
        'panel.err.reload': 'Recarregar a página',
        'panel.err.hint': 'Se continuar, envie a mensagem acima ao autor',
        'panel.custom.newLabel': 'Personalizado {n}',
        'panel.custom.copySuffix': ' cópia',
        'panel.custom.limitErr': 'No máximo {n} temas personalizados; elimine um antes de criar ou importar outro',
        'panel.custom.dropped': '{n} temas personalizados ultrapassam o limite de {max} e foram ignorados: {ids}',
        'panel.custom.droppedClose': 'Entendido',
        'panel.a11y.live': 'Mudou para {label}',
        'panel.theme.deleteConfirm': 'Clique outra vez para eliminar',
        'panel.alert.imgMax': 'A imagem tem de ter menos de 3 MiB',
        'panel.alert.imgStore': 'Esta imagem é demasiado grande para o armazenamento local do navegador; escolha uma menor',
        'anchor.bg': 'Fundo',
        'anchor.text': 'Texto',
        'anchor.border': 'Moldura',
        'anchor.brand': 'Cor de marca principal',
        'anchor.brand2': 'Cor de marca secundária',
        'anchor.danger': 'Perigo',
        'anchor.warn': 'Aviso',
        'anchor.success': 'Sucesso',
        'preset.glass': 'Glassmorphism',
        'preset.brutal': 'Neo-brutalismo',
        'preset.swiss': 'Suíça internacional',
        'preset.editorial': 'Editorial',
        'preset.luxe': 'Luxo minimalista',
        'preset.organic': 'Orgânico',
        'preset.morandi': 'Morandi',
        'preset.paper': 'Papel',
        'preset.cyber': 'Terminal futurista',
        'preset.aurora': 'Aurora',
        'preset.devterm': 'Terminal de programador',
        'preset.deepspace': 'Espaço profundo',
        'panel.chat.texOff': 'Textura: desativada · diga «adiciona uma textura» se quiser uma',
        'panel.mdfine.title': 'Refinamento de Markdown',
        'panel.mdfine.note': 'Apenas a aparência: tamanho dos títulos, bloco de código, tabela e citação',
        'panel.mdfine.headRow': 'Tamanho dos títulos',
        'panel.mdfine.headAria': 'Tamanho dos títulos Markdown',
        'panel.mdfine.headTheme': 'Según o tema',
        'panel.mdfine.headCompact': 'Compacto',
        'panel.mdfine.headClear': 'Níveis marcados',
        'panel.mdfine.headNote': 'Según o tema usa os tamanhos do host; Níveis marcados afasta mais os títulos',
        'panel.mdfine.codeRow': 'Bloco de código',
        'panel.mdfine.codeAria': 'Estilo do bloco de código Markdown',
        'panel.mdfine.codeNone': 'Sem borda',
        'panel.mdfine.codeLine': 'Borda fina',
        'panel.mdfine.codeCard': 'Cartão',
        'panel.mdfine.codeNote': 'Cartão adiciona fundo e cantos arredondados, separando o bloco do texto',
        'panel.mdfine.tableRow': 'Tabela',
        'panel.mdfine.tableAria': 'Estilo da tabela Markdown',
        'panel.mdfine.tablePlain': 'Normal',
        'panel.mdfine.tableLine': 'Com linhas',
        'panel.mdfine.tableZebra': 'Zebra',
        'panel.mdfine.tableNote': 'Com linhas acrescenta bordas às células; Zebra soma linhas alternadas e fundo do cabeçalho',
        'panel.mdfine.quoteRow': 'Citação',
        'panel.mdfine.quoteAria': 'Estilo da citação Markdown',
        'panel.mdfine.quotePlain': 'Normal',
        'panel.mdfine.quoteStrong': 'Destacada',
        'panel.mdfine.quoteNote': 'Destacada engrossa a barra esquerda e adiciona fundo suave',
        'panel.presets.note': 'Escolha um estilo para criar um tema personalizável que pode continuar a ajustar.',
        'panel.custom.title': 'Cores personalizadas',
        'panel.custom.note': 'Ajuste um tema personalizado cor a cor; ao guardar, fica escrito neste dispositivo.',
        'panel.custom.empty': 'Este é um tema integrado. Crie um personalizado para ajustar as suas âncoras de cor.',
        'panel.custom.basedOn': 'Baseado em {theme}',
        'panel.prefs.title': 'Preferências globais',
        'panel.prefs.note': 'Estas definições aplicam-se a todos os temas.',
        'panel.ed.baseSection': 'Base e modo',
        'panel.ed.base': 'Tema base',
        'panel.ed.baseAria': 'Tema base',
        'panel.ed.previewNote': 'Pré-visualização ao vivo: as alterações às âncoras aparecem aqui primeiro; ao guardar, ficam escritas neste dispositivo.',
        'panel.ed.band.base': 'Fundo e superfícies',
        'panel.ed.band.text': 'Texto',
        'panel.ed.band.line': 'Contornos',
        'panel.ed.band.brand': 'Marca',
        'panel.ed.band.semantic': 'Cores semânticas',
        'panel.ed.defaultAria': 'Predefinido {hex}',
        'panel.ed.undo': 'Desfazer',
        'panel.ed.resetAll': 'Repor valor base',
        'panel.ed.resetAllTitle': 'Limpar as âncoras alteradas neste modo',
        'panel.ed.toolsShow': 'Mostrar ferramentas de IA e imagem',
        'panel.ed.toolsHide': 'Ocultar ferramentas de IA e imagem',
        'panel.bg.opacityCapCapped': 'sem margens = {p} % de opacidade (limitado por contraste)',
      },
      ru: {
        'rail.ariaLabel': 'Быстрая навигация по правой боковой панели',
        'rail.anchorLabel': 'Якорь быстрой навигации',
        'rail.empty': 'На правой боковой панели нет вкладок для перехода',
        'rail.noService': 'У этого хоста нет правой боковой панели',
        'rail.openFailed': 'Не удалось открыть эту вкладку',
        'panel.brand.title': 'Место под бренд',
        'panel.brand.note': 'Значок deepseek HARNESS в левом верхнем углу; выключено — значит стандартный значок хоста',
        'panel.brand.toggle': 'Включить',
        'panel.brand.toggleHint': 'Заменить своим изображением',
        'panel.brand.builtinHint': 'Используется встроенный логотип (выберите изображение, чтобы заменить)',
        'panel.brand.imageRow': 'Изображение',
        'panel.brand.pick': 'Выбрать изображение…',
        'panel.brand.repick': 'Сменить изображение…',
        'panel.brand.previewAlt': 'Предпросмотр текущего изображения бренда',
        'panel.brand.remove': 'Убрать',
        'panel.brand.autoHint': 'Без изображения — встроенный логотип; загруженные файлы уменьшаются до 512 px по длинной стороне',
        'panel.brand.replacedHint': 'Заменено. Если после обновления хоста изменится структура значка, оно тихо вернётся к исходному',
        'panel.header.title': 'Оформление',
        'panel.header.count': '{n} палитр',
        'panel.header.live': 'Изменения применяются сразу',
        'panel.theme.title': 'Цветовая тема',
        'panel.theme.note': 'Выбор применяется сразу; светлая/тёмная решает, какая из двух палитр действует',
        'panel.theme.modeRow': 'Режим',
        'panel.theme.modeAria': 'Цветовой режим',
        'panel.theme.optLight': 'Светлая',
        'panel.theme.optDark': 'Тёмная',
        'panel.theme.optAuto': 'Как в системе',
        'panel.theme.addTitle': 'Создать свою тему (копия текущей)',
        'panel.theme.addLabel': 'Новая тема',
        'panel.theme.edit': 'Изменить цвета',
        'panel.theme.duplicate': 'Дублировать',
        'panel.theme.exportJson': 'Экспорт JSON',
        'panel.theme.delete': 'Удалить',
        'panel.theme.importJson': 'Импорт JSON',
        'panel.bg.title': 'Фоновое изображение',
        'panel.bg.note': 'Только основная колонка; боковая панель и поле ввода остаются сплошным цветом темы',
        'panel.bg.sourceRow': 'Источник',
        'panel.bg.sourceAria': 'Источник фона',
        'panel.bg.optNone': 'Нет',
        'panel.bg.optTheme': 'Текстура темы',
        'panel.bg.optImage': 'Своё изображение',
        'panel.bg.imageRow': 'Изображение',
        'panel.bg.pick': 'Выбрать изображение…',
        'panel.bg.previewAlt': 'Предпросмотр текущего фона',
        'panel.bg.remove': 'Убрать',
        'panel.bg.formatHint': 'JPEG / PNG / WebP · до 8 МиБ',
        'panel.bg.styleRow': 'Стиль',
        'panel.bg.styleAria': 'Стиль фона',
        'panel.bg.optFade': 'Затухание',
        'panel.bg.optFull': 'Во всю площадь',
        'panel.bg.opacityRow': 'Видимость',
        'panel.bg.opacityCap': 'во всю площадь = 70 % непрозрачности',
        'panel.bg.opacityAria': 'Видимость фона (100 % на ползунке = 70 % фактической непрозрачности)',
        'panel.bg.showRow': 'Показывать в',
        'panel.bg.showEmpty': 'Страница новой сессии',
        'panel.bg.showSession': 'В сессии',
        'panel.bg.offHint': 'Фон выключен; эти стили заработают, как только выберете источник',
        'panel.section.title': 'Тема Zhuoer',
        'panel.sel.follow': 'Как в теме',
        'panel.sel.current': '{value} (текущая)',
        'panel.ed.pickerAria': 'Палитра цвета: {label}',
        'panel.ed.hexAria': 'Hex-значение: {label}',
        'panel.ed.low': ' низкий',
        'panel.ed.resetAria': 'Сбросить {label} к значению скопированной темы',
        'panel.ed.resetTitleDirty': 'Сбросить к значению скопированной темы',
        'panel.ed.resetTitleClean': 'Уже значение скопированной темы',
        'panel.ed.dialogAria': 'Редактор своих тем',
        'panel.ed.title': 'Изменить цвета',
        'panel.ed.closeAria': 'Закрыть редактор',
        'panel.ed.closeTitle': 'Закрыть (несохранённые изменения подтверждаются)',
        'panel.ed.secAppearance': 'Оформление',
        'panel.ed.clonedFrom': 'Скопировано из {theme}; остальные токены выводятся по разнице',
        'panel.ed.name': 'Название',
        'panel.ed.nameAria': 'Название темы',
        'panel.ed.dark': 'Тёмная',
        'panel.ed.autoDark': 'Выводится из светлой схемы (фон/текст/рамка инвертируются; фирменные и смысловые цвета сохраняются)',
        'panel.ed.editRow': 'Редактировать',
        'panel.ed.schemeAria': 'Редактируемая схема',
        'panel.ed.light': 'Светлая',
        'panel.ed.anchors': 'Цветовые якоря',
        'panel.ed.anchorsNote': 'Изменения видны на настоящем интерфейсе справа; до «Сохранить» ничего не записывается',
        'panel.ed.advanced': 'Дополнительно · по токенам',
        'panel.ed.advancedNote': 'Все 156 токенов за якорями; текст ниже 3:1 откатывается автоматически',
        'panel.ed.advShow': 'Показать все токены',
        'panel.ed.advHide': 'Свернуть',
        'panel.ed.confirmDiscard': 'Есть несохранённые изменения — отменить их?',
        'panel.ed.dirtyHint': 'Несохранённые изменения',
        'panel.ed.keepEditing': 'Продолжить редактирование',
        'panel.ed.cancel': 'Отмена',
        'panel.ed.discard': 'Отменить изменения',
        'panel.ed.save': 'Сохранить',
        'panel.ai.failed': 'Не удалось создать тему',
        'panel.ai.badJson': 'Модель вернула нечитаемый JSON темы — попробуйте переформулировать',
        'panel.palette.noColors': 'На этом изображении не нашлось пригодных цветов',
        'panel.palette.failed': 'Не удалось извлечь цвета',
        'panel.palette.notEnough': 'Недостаточно цветов, чтобы заполнить якоря',
        'panel.ed.presets': 'Стилевые пресеты',
        'panel.ed.presetsNote': 'Заменяет всё разом: якоря, радиусы и шрифты',
        'panel.ed.presetTitle': '{label} · радиус {radius} · {body}',
        'panel.ed.mono': 'моноширинный',
        'panel.ed.aiSection': 'ИИ и подбор цвета',
        'panel.ed.aiNote': 'Сначала показывается предпросмотр; только «Применить» меняет черновик',
        'panel.ed.aiRow': 'Создание через ИИ',
        'panel.ed.aiPromptAria': 'Описание стиля',
        'panel.ed.aiPromptPh': 'Опишите стиль, например: ретро-терминал, серый фон, жёлтый основной, синий дополнительный, моноширинный, прямые углы',
        'panel.ed.generating': 'Создание…',
        'panel.ed.generate': 'Создать',
        'panel.ed.aiPreview': '«{label}»',
        'panel.ed.aiDropped': ' (отброшено неизвестных ключей: {n})',
        'panel.ed.applyCurrent': 'Применить к текущей теме',
        'panel.chat.apply': 'Применить',
        'panel.chat.modify': 'Изменить',
        'panel.chat.applied': 'Применено в DSH',
        'panel.chat.ovApplied': 'Применено · переопределений: {n}',
        'panel.chat.sampled': 'Цвета взяты с эталонного изображения',
        'panel.chat.ovSoft': '{s} откачено из-за контраста',
        'panel.chat.preview': 'Предпросмотр',
        'panel.chat.editing': 'Правка',
        'panel.chat.cancel': 'Отмена',
        'panel.chat.applyEdited': 'Применить это',
        'panel.chat.nameAria': 'Название темы',
        'panel.chat.fail': 'Не удалось применить',
        'panel.chat.limitErr': 'Достигнут предел своих тем ({n}); сначала удалите одну',
        'panel.ed.drop': 'Отбросить',
        'panel.ed.pickFromImage': 'Взять цвета с изображения',
        'panel.ed.picking': 'Извлечение…',
        'panel.ed.pickImage': 'Выбрать изображение…',
        'panel.ed.clear': 'Очистить',
        'panel.ed.bgSection': 'Фоновое изображение',
        'panel.ed.bgNote': 'Одно изображение ≤ 3 МиБ хранится в локальной IndexedDB',
        'panel.ed.bgSourceAria': 'Источник фона темы',
        'panel.ed.bgFollowGlobal': 'Как в общих настройках',
        'panel.ed.bgThemeOwn': 'Текстура темы',
        'panel.ed.bgCustom': 'Моё фото',
        'panel.ed.bgNone': 'Без фона',
        'panel.ed.imageRow': 'Изображение',
        'panel.ed.bgPreviewAlt': 'Предпросмотр фона темы',
        'panel.ed.bgStoredHint': 'Хранится в IndexedDB, ≤ 3 МиБ на изображение',
        'panel.ed.opacityRow': 'Видимость',
        'panel.ed.bgOpacityAria': 'Видимость фона темы',
        'panel.ed.shapeSection': 'Формы и шрифты',
        'panel.ed.shapeNote': 'Влияет только на эту тему',
        'panel.ed.radiusRow': 'Скругление углов',
        'panel.ed.sharpRow': 'Элементы других плагинов',
        'panel.ed.sharpOn': 'Сплющить жёстко зашитые радиусы и рамки в интерфейсе плагинов',
        'panel.ed.sharpNote': 'Влияет только на элементы плагинов со своими радиусами или рамками (например, сегментированные кнопки боковой панели). Включается автоматически, когда сама тема угловатая',
        'panel.ed.radiusAria': 'Размер скругления',
        'panel.ed.radiusSquare': 'Прямые углы',
        'panel.ed.radiusSmall': 'Малый',
        'panel.ed.radiusNormal': 'Обычный',
        'panel.ed.radiusLarge': 'Большой',
        'panel.ed.radiusXL': 'Очень большой',
        'panel.ed.bodyFont': 'Шрифт текста',
        'panel.ed.chatFont': 'Шрифт чата',
        'panel.ed.followBase': 'Как в {theme}',
        'panel.type.title': 'Типографика',
        'panel.type.note': 'Увеличивает текст (интерфейс и сообщения), не трогая геометрию вёрстки: геометрический зум мешает перетаскиванию боковой панели хоста и запрещён проверкой',
        'panel.type.sizeRow': 'Размер текста сообщений',
        'panel.type.sizeAria': 'Размер текста сообщений',
        'panel.a11y.hitRow': 'Область нажатия',
        'panel.a11y.procRow': 'Иконки шагов',
        'panel.a11y.procOn': 'Семантические цвета',
        'panel.a11y.procNote': 'размышление = фиолетовый / выполнение = синий / чтение = зелёный / запись и вопрос = янтарный',
        'panel.type.mdHeadRow': 'Цвет заголовков',
        'panel.type.mdHeadAria': 'Цвет заголовков Markdown',
        'panel.type.mdHeadFollow': 'Как основной текст',
        'panel.type.mdHeadSoft': 'Фирменный (мягко)',
        'panel.type.mdHeadBrand': 'Фирменный',
        'panel.type.mdHeadNote': 'Вычисляется из фирменного и текстового цветов темы — следует за сменой темы и акцента',
        'panel.type.mdRow': 'Ритм чтения',
        'panel.type.mdAria': 'Ритм чтения Markdown',
        'panel.type.mdCompact': 'Плотный',
        'panel.type.mdNormal': 'Обычный',
        'panel.type.mdRoomy': 'Свободный',
        'panel.type.mdNote': 'Только межстрочный интервал, отступы абзацев и масштаб заголовков — размер шрифта остаётся в строке выше',
        'panel.a11y.hitOn': 'Увеличить до 44×44',
        'panel.a11y.hitNote': 'У кнопок-иконок появляется минимум 44 px для касания; вёрстка немного расширяется',
        'panel.type.pxHint': 'Текст ≈ {px} px',
        'panel.type.scaleMiss': 'Масштабирование текста интерфейса не сработало: в таблицах стилей хоста не найдено масштабируемого правила font-size (сообщите, пожалуйста, эту строку)',
        'panel.type.widthRow': 'Ширина переписки',
        'panel.type.widthAria': 'Ширина переписки в пикселях',
        'panel.type.widthPh': '920',
        'panel.type.widthHint': 'Пусто = 920 px по умолчанию (в узких окнах сужается сама); введите 640–1600, чтобы переопределить. Меняется только переменная ширины, никогда — вёрстка',
        'panel.type.fontRow': 'Шрифт',
        'panel.type.fontPh': 'Использовать шрифт темы',
        'panel.type.fontAria': 'Шрифт интерфейса',
        'panel.type.fontHint': 'Показываются только шрифты, поставляемые с плагином; недоступное семейство никогда не подменяется молча',
        'panel.scale.small': 'Мелкий',
        'panel.scale.default': 'Обычный',
        'panel.scale.large': 'Крупный',
        'panel.scale.xl': 'Очень крупный',
        'panel.scale.xxl': 'Огромный',
        'panel.accent.title': 'Акцентный цвет',
        'panel.accent.note': 'Заменяет фирменный цвет темы на кнопках и ссылках',
        'panel.accent.row': 'Цвет',
        'panel.accent.swatchAria': 'Акцент {hex}',
        'panel.accent.custom': 'Свой акцентный цвет',
        'panel.accent.reset': 'Вернуть цвет темы',
        'panel.qn.title': 'Быстрая навигация по правой боковой панели',
        'panel.qn.note': 'Панель значков под «Открыть правую боковую панель»; один щелчок переключает на нужную вкладку',
        'panel.qn.row': 'Показывать',
        'panel.qn.aria': 'Режим показа быстрой навигации',
        'panel.qn.optThree': 'Три · раскрываются при наведении',
        'panel.qn.optAll': 'Показывать все',
        'panel.qn.optOff': 'Выключено',
        'panel.reset.armed': 'Нажмите ещё раз для подтверждения',
        'panel.reset.label': 'Вернуть настройки по умолчанию',
        'panel.reset.hint': 'Сбрасывает все настройки темы, режима, фона, размера шрифта, акцентного цвета и шрифта',
        'theme.zhuoer': 'Zhuoer 原版红',
        'theme.absolutely': 'Absolutely · 极简',
        'theme.beacon': '灯塔 · Beacon',
        'theme.crt': 'CRT · 终端',
        'theme.dash': 'Dash · 琥珀',
        'theme.knot': 'Knot · 绳结',
        'theme.manuscript': '手稿 · Manuscript',
        'theme.miami': '迈阿密 · Miami',
        'theme.phosphor': '荧光 · Phosphor',
        'theme.rose': '桃红 · Rose',
        'theme.tide': '潮汐 · Tide',
        'theme.vintagePaper': 'Vintage Paper',
        'panel.foot.build': 'Сборка {ver} · наш таблица стилей идёт последней и побеждает другие плагины · настройки лежат в локальном localStorage',
        'panel.io.jsonAria': 'JSON темы',
        'panel.io.exportTitle': 'Экспорт JSON темы',
        'panel.io.importTitle': 'Импорт JSON темы',
        'panel.io.close': 'Закрыть',
        'panel.io.exportHint': 'Выделите всё и скопируйте, чтобы поделиться; в файле только якоря этой темы (не 224 производных токена). Своё фоновое изображение не включается',
        'panel.io.importHint': 'Вставьте JSON, выгруженный кем-то ещё, — тема добавится в список',
        'panel.io.import': 'Импорт',
        'panel.io.parseErr': 'JSON не разобран или недействителен (нужны id/label/base и цвета --dsw-alias-* в dark/light)',
        'panel.err.title': 'Панель тем упала: {msg}',
        'panel.err.retry': 'Повторить',
        'panel.err.reload': 'Перезагрузить страницу',
        'panel.err.hint': 'Если это повторяется, отправьте сообщение выше автору',
        'panel.custom.newLabel': 'Своя {n}',
        'panel.custom.copySuffix': ' копия',
        'panel.custom.limitErr': 'Не больше {n} своих тем; удалите одну, прежде чем создавать или импортировать следующую',
        'panel.custom.dropped': 'Своих тем сверх предела {max} — {n}, они проигнорированы: {ids}',
        'panel.custom.droppedClose': 'Понятно',
        'panel.a11y.live': 'Переключено на {label}',
        'panel.theme.deleteConfirm': 'Нажмите ещё раз для удаления',
        'panel.alert.imgMax': 'Изображение должно быть меньше 3 МиБ',
        'panel.alert.imgStore': 'Это изображение слишком велико для локального хранилища браузера; выберите поменьше',
        'anchor.bg': 'Фон',
        'anchor.text': 'Текст',
        'anchor.border': 'Рамка',
        'anchor.brand': 'Основной фирменный цвет',
        'anchor.brand2': 'Дополнительный фирменный цвет',
        'anchor.danger': 'Опасность',
        'anchor.warn': 'Предупреждение',
        'anchor.success': 'Успех',
        'preset.glass': 'Стекломорфизм',
        'preset.brutal': 'Необрутализм',
        'preset.swiss': 'Швейцарский стиль',
        'preset.editorial': 'Редакционный',
        'preset.luxe': 'Минималистичная роскошь',
        'preset.organic': 'Органичный',
        'preset.morandi': 'Моранди',
        'preset.paper': 'Бумага',
        'preset.cyber': 'Кибертерминал',
        'preset.aurora': 'Сияние',
        'preset.devterm': 'Терминал разработчика',
        'preset.deepspace': 'Глубокий космос',
        'panel.chat.texOff': 'Текстура: не включена · скажите «добавь текстуру», если она нужна',
        'panel.mdfine.title': 'Тонкая настройка Markdown',
        'panel.mdfine.note': 'Только внешний вид: размер заголовков, блок кода, таблица, цитата',
        'panel.mdfine.headRow': 'Размер заголовков',
        'panel.mdfine.headAria': 'Размер заголовков Markdown',
        'panel.mdfine.headTheme': 'Как в теме',
        'panel.mdfine.headCompact': 'Компактно',
        'panel.mdfine.headClear': 'Чёткие уровни',
        'panel.mdfine.headNote': 'Как в теме — размеры заголовков хоста; Чёткие уровни разводит заголовки сильнее',
        'panel.mdfine.codeRow': 'Блок кода',
        'panel.mdfine.codeAria': 'Стиль блока кода Markdown',
        'panel.mdfine.codeNone': 'Без рамки',
        'panel.mdfine.codeLine': 'Тонкая рамка',
        'panel.mdfine.codeCard': 'Карточка',
        'panel.mdfine.codeNote': 'Карточка добавляет фон и скругление — блок отделяется от текста',
        'panel.mdfine.tableRow': 'Таблица',
        'panel.mdfine.tableAria': 'Стиль таблицы Markdown',
        'panel.mdfine.tablePlain': 'Обычная',
        'panel.mdfine.tableLine': 'С границами',
        'panel.mdfine.tableZebra': 'Зебра',
        'panel.mdfine.tableNote': 'С границами — рамки у ячеек; Зебра добавляет чередование строк и фон заголовка',
        'panel.mdfine.quoteRow': 'Цитата',
        'panel.mdfine.quoteAria': 'Стиль цитаты Markdown',
        'panel.mdfine.quotePlain': 'Обычная',
        'panel.mdfine.quoteStrong': 'Выделенная',
        'panel.mdfine.quoteNote': 'Выделенная утолщает левую линию и добавляет лёгкий фон',
        'panel.presets.note': 'Выберите стиль, чтобы создать настраиваемую тему, которую можно продолжить дорабатывать.',
        'panel.custom.title': 'Свои цвета',
        'panel.custom.note': 'Настройте свою тему по цветам; при сохранении она записывается на это устройство.',
        'panel.custom.empty': 'Сейчас выбрана встроенная тема. Создайте свою, чтобы настроить цвета-якоря.',
        'panel.custom.basedOn': 'На основе {theme}',
        'panel.prefs.title': 'Общие настройки',
        'panel.prefs.note': 'Эти настройки действуют для всех тем.',
        'panel.ed.baseSection': 'База и режим',
        'panel.ed.base': 'Базовая тема',
        'panel.ed.baseAria': 'Базовая тема',
        'panel.ed.previewNote': 'Живой предпросмотр: изменения якорей сначала видны здесь; при сохранении они записываются на это устройство.',
        'panel.ed.band.base': 'Фон и поверхности',
        'panel.ed.band.text': 'Текст',
        'panel.ed.band.line': 'Границы',
        'panel.ed.band.brand': 'Бренд',
        'panel.ed.band.semantic': 'Семантические цвета',
        'panel.ed.defaultAria': 'По умолчанию {hex}',
        'panel.ed.undo': 'Отменить',
        'panel.ed.resetAll': 'Вернуть базовые значения',
        'panel.ed.resetAllTitle': 'Очистить переопределения якорей для этого режима',
        'panel.ed.toolsShow': 'Показать инструменты ИИ и изображений',
        'panel.ed.toolsHide': 'Скрыть инструменты ИИ и изображений',
        'panel.bg.opacityCapCapped': 'во всю площадь = {p} % непрозрачности (ограничено ради контраста)',
      },
    }
    // <<< i18n:end <<<

    /** 宿主支持的 UI 语言（app.asar 里那份清单：[\"en\",\"zh\",\"ja\",\"es\",\"fr\",\"de\",\"ru\",\"pt\"]）。
     *  插件的语言集必须与它一致——门禁 verify:i18n 会查「宿主有的语言必须都有词典」。 */
    const ZR_LOCALES = ['en', 'zh', 'ja', 'es', 'fr', 'de', 'ru', 'pt']
    /** 把任意语言标记映射到本插件支持的某一门（认不出来一律英文）。 */
    function zrNormalizeLang(tag) {
      const s = String(tag || '').toLowerCase().replace('_', '-')
      if (!s) return 'en'
      if (s === 'zh' || s.indexOf('zh-') === 0 || s.indexOf('zh_') === 0) return 'zh'
      const base = s.split('-')[0]
      return ZR_LOCALES.indexOf(base) !== -1 ? base : 'en'
    }
    /** 当前界面语言（模块级，面板与轨道共用）。 */
    let ZR_LANG = (function () {
      try {
        const l = typeof navigator !== 'undefined' && navigator.language ? String(navigator.language) : ''
        return zrNormalizeLang(l)
      } catch (e) {
        return 'en'
      }
    })()

    /** 取当前语言。 */
    function zrLang() {
      return ZR_LANG
    }

    /** 设当前语言（不在支持列表里的一律记 en）。语言变化的重渲染由调用方负责。 */
    function zrSetLang(next) {
      ZR_LANG = zrNormalizeLang(next)
    }

    /** 取词。vars 里的值按 {name} 替换；缺键回落 en，再回落键名。 */
    function zrT(key, vars) {
      const dict = I18N[ZR_LANG] || I18N.en
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
        // 可选依赖只走 ctx.get()：直接读 ctx.locale 在未 inject 时会抛
        // 「cannot get property \"locale\" without inject」（plugin_doctor K1）。
        if (ctx && typeof ctx.get === 'function') {
          try { loc = ctx.get('locale') } catch (e) { loc = null }
        }
        const snap = loc && typeof loc.getSnapshot === 'function' ? loc.getSnapshot() : null
        const active = snap && snap.active ? String(snap.active).toLowerCase() : ''
        if (!active) return null
        return zrNormalizeLang(active)
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
        // 可选依赖只走 ctx.get()：直接读 ctx.locale 在未 inject 时会抛
        // 「cannot get property \"locale\" without inject」（plugin_doctor K1）。
        if (ctx && typeof ctx.get === 'function') {
          try { loc = ctx.get('locale') } catch (e) { loc = null }
        }
        if (!loc || typeof loc.register !== 'function') return null
        // 8 种语言全部注册进去：宿主按当前语言挑，缺哪门就回落 en。
        const bundle = {}
        for (const lang of ZR_LOCALES) {
          const src = I18N[lang]
          if (!src) continue
          const dst = {}
          for (const k of keys) {
            if (src[k] !== undefined) dst[k] = src[k]
            else if (I18N.en[k] !== undefined) dst[k] = I18N.en[k]
          }
          bundle[lang] = dst
        }
        return loc.register(ns, bundle)
      } catch (e) {
        return null
      }
    }

const THEMES = {"zhuoer":{"dark":{"--dsw-alias-bg-base":"#0e1015","--dsw-alias-bg-layer-1":"#13151a","--dsw-alias-bg-layer-2":"#17191e","--dsw-alias-bg-layer-3":"#1a1c21","--dsw-alias-bg-layer-4":"#1e1f24","--dsw-alias-bg-overlay":"#1c1e23","--dsw-alias-bg-skeleton":"#181a1f","--dsw-alias-bg-module-platform":"#181a1f","--dsw-alias-bg-mask-drop":"#0b0d11","--dsw-alias-label-primary":"#bcbcc0","--dsw-alias-label-primary-dimmed":"#f0f0f2","--dsw-alias-label-primary-foreground":"#ffffff","--dsw-alias-label-primary-inverted":"#f0f0f2","--dsw-alias-label-secondary":"#8b8b94","--dsw-alias-label-tertiary":"#83838b","--dsw-alias-label-caption":"#7f7f87","--dsw-alias-label-dimmed":"#7f7f88","--dsw-alias-label-error":"#ef4444","--dsw-alias-brand-primary":"#d13c3c","--dsw-alias-brand-primary-invert":"#ff5c5c","--dsw-alias-brand-text":"#d13c3c","--dsw-alias-link":"#d13c3c","--dsw-alias-border-l1":"#1f2126","--dsw-alias-border-l2":"#26282d","--dsw-alias-border-l3":"#2d2f34","--dsw-alias-border-l4":"#38393e","--dsw-alias-interactive-bg-hover":"#1a1c21","--dsw-alias-interactive-bg-hover-solid":"#1e1f24","--dsw-alias-interactive-bg-active":"#212328","--dsw-alias-interactive-bg-hover-accent":"#29161a","--dsw-alias-interactive-bg-hover-danger":"#2e171c","--dsw-alias-button-primary-fill":"#d13c3c","--dsw-alias-button-primary-hover":"#ff5c5c","--dsw-alias-button-primary-dimmed":"#2d171b","--dsw-alias-button-elevated-fill":"#17191e","--dsw-alias-button-floating-fill":"#1c1e23","--dsw-alias-button-floating-hover":"#212328","--dsw-alias-button-contrast-fill":"#f4f4f5","--dsw-alias-button-ghost-active-fill":"#1c1e23","--dsw-alias-button-ghost-active-hover":"#212328","--dsw-alias-button-ghost-active-border":"#2a2c30","--dsw-alias-state-error-primary":"#ef4444","--dsw-alias-state-error-secondary":"#37191d","--dsw-alias-state-success-primary":"#3fb950","--dsw-alias-state-warn-primary":"#f59e0b","--dsw-alias-state-warn-label":"#f59e0b","--dsw-alias-markdown-code-block":"#17191e","--dsw-alias-markdown-code-block-banner":"#1c1e23","--dsw-alias-markdown-citation":"#181a1f","--dsw-alias-markdown-placeholder":"#1a1c21","--dsw-alias-markdown-tag":"#1e1f24","--dsw-alias-markdown-code-segment-selected":"#1c1e23","--dsw-alias-markdown-code-segment-unselected":"#15171c","--dsw-alias-scrollbar-bg-l1":"#1c1e23","--dsw-alias-scrollbar-bg-l2":"#23252a","--dsw-alias-scrollbar-hover-l1":"#26282d","--dsw-alias-scrollbar-hover-l2":"#2d2f34","--dsw-alias-switch-thumb":"#6e6f73","--dsw-alias-toast-bg":"#23252a","--dsw-alias-toast-label":"#bcbcc0","--dsw-alias-tooltip-bg":"#26282d","--dsw-alias-menu-group-header-fill":"#17191e","--dsw-menu-surface-fill":"#1a1c21","--dsw-specific-sidebar-fill":"#15171c","--dsw-specific-sidebar-nav-item-active":"#1f2126","--dsw-specific-bubble":"#17191e","--dsw-specific-input-major":"#181a1f","--dsw-specific-menu":"#1a1c21","--dsw-specific-selector":"#181a1f","--dsw-specific-tip":"#17191e","--dsw-alias-file-diff-added-bg":"#14241c","--dsw-alias-file-diff-deleted-bg":"#29161b","--dsw-alias-code-diff-added":"#172e20","--dsw-alias-code-diff-deleted":"#37191d","--dsw-font-markdown-base-strong-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small":"12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11":"11px/14px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16":"16px/24px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4":"600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2":"700 calc(19px + calc(14px - 14px)) / calc(28px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong":"600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic":"italic 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1":"700 calc(21px + calc(14px - 14px)) / calc(30px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3":"700 calc(18px + calc(14px - 14px)) / calc(26px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base":"14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16":"500 16px/24px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12":"12px/18px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong":"600 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24":"600 24px/32px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14":"500 14px/22px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic":"italic 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11":"500 11px/14px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic":"italic 600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic":"italic 600 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table":"min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13":"13px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14":"14px/22px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12":"500 12px/18px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head":"500 min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13":"500 13px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18":"500 16px/28px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family-brand":"\"Manrope\", \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20":"500 20px/28px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-elevation-soft":"0 0 0 .5px rgba(28, 18, 18, 0.20), 0 4px 16px rgba(28, 18, 18, 0.30)","--dsw-elevation-panel":"0 0 0 .5px rgba(28, 18, 18, 0.20), 0 12px 32px rgba(28, 18, 18, 0.40)","--dsw-elevation-prominent":"0 0 0 .5px rgba(28, 18, 18, 0.20), 0 24px 48px rgba(28, 18, 18, 0.50)","--dsw-alias-markdown-inline-code":"#1e1f24","--dsw-alias-json-tree-hover":"#1a1c21","--dsw-alias-json-tree-property":"#8b8b94","--dsw-alias-json-tree-punctuation":"#72727b","--dsw-alias-json-tree-number":"#d13c3c","--dsw-alias-json-tree-keyword":"#d13c3c","--dsw-alias-json-tree-icon":"#72727b","--dsw-alias-state-idle-primary":"#72727b","--dsw-alias-state-done-primary":"#3fb950","--dsw-alias-state-business-primary":"#d13c3c","--dsw-alias-state-warn-secondary":"#f59e0b","--dsw-alias-state-warn-tertiary":"#f59e0b","--dsw-alias-state-success-secondary":"#3fb950","--dsw-alias-state-success-tertiary":"#3fb950","--dsw-alias-border-selected":"#d13c3c","--dsw-alias-border-inverted":"#1f2126","--dsw-alias-border-inverted2":"#1f2126","--dsw-alias-card-fill":"#13151a","--dsw-alias-card-tile-fill":"#17191e","--dsw-alias-settings-card-fill":"#13151a","--dsw-alias-settings-card-stroke":"#26282d","--dsw-alias-onboarding-card-fill":"#13151a","--dsw-alias-label-document-preview":"#8b8b94","--dsw-alias-label-primary-bluish":"#bcbcc0","--dsw-alias-label-shimmer":"#72727b","--dsw-alias-label-deep-diving-shimmer":"#72727b","--dsw-alias-label-on-color":"#ffffff","--dsw-alias-hovercard-label-primary":"#bcbcc0","--dsw-alias-hovercard-label-secondary":"#8b8b94","--dsw-alias-hovercard-label-tertiary":"#72727b","--dsw-alias-hovercard-state-error":"#ef4444","--dsw-alias-hovercard-state-done":"#3fb950","--dsw-alias-bg-mask-1":"#0b0d11","--dsw-alias-bg-mask-2":"#0b0d11","--dsw-alias-bg-mask-3":"#0b0d11","--dsw-alias-bg-mask-photo":"#0b0d11","--dsw-alias-bg-document-selection":"#29161a","--dsw-alias-button-info-fill":"#d13c3c","--dsw-alias-button-info-hover":"#ff5c5c","--dsw-alias-button-tool-bar-fill":"#1c1e23","--dsw-alias-button-tool-bar-fill-invisible":"#0b0d11","--dsw-alias-button-tool-bar-hover":"#212328","--dsw-alias-chart-tools":"#72727b","--dsw-alias-chart-messages":"#8b8b94","--dsw-alias-chart-system":"#d13c3c","--dsw-alias-illustration-surface":"#17191e","--dsw-alias-illustration-shadow":"#26282d","--dsw-alias-illustration-backing":"#1a1c21","--dsw-alias-trajectory-accent":"#d13c3c","--dsw-alias-menu-icon":"#8b8b94","--dsw-alias-tooltip-label":"#ffffff","--dsw-alias-tooltip-key-bg":"#1a1c21","--dsw-alias-toast-action":"#d13c3c","--dsw-alias-onboarding-accent":"#d13c3c","--dsw-alias-onboarding-checkbox-border":"#2d2f34","--dsw-alias-turn-trigger-bg":"#1a1c21","--dsw-alias-turn-trigger-bg-hover":"#1e1f24","--dsw-alias-file-diff-added-gutter":"#14241c","--dsw-alias-file-diff-deleted-gutter":"#29161b","--dsw-alias-file-diff-added-marker":"#172e20","--dsw-alias-file-diff-deleted-marker":"#37191d","--dsw-alias-bg-document-preview":"#17191e","--dsw-alias-bg-multi-select":"#1a1c21","--dsw-alias-border-l2-darkmode-thin":"#1f2125","--dsw-alias-card-fill-hover":"#1e2027","--dsw-alias-hovercard-bg":"#1f2126","--dsw-alias-illustration-background":"#13151a","--dsw-alias-illustration-detail":"#8b8b94","--dsw-alias-illustration-inset":"#1a1c21","--dsw-alias-json-tree-string":"#3fb950","--dsw-alias-label-deep-diving":"#72727b","--dsw-alias-onboarding-secondary-fill":"#17191e","--dsw-alias-state-business-tertiary":"#e38686","--dsw-specific-bubble-highlight":"#24272f","--dsw-specific-file-upload-track":"#17191e","--dsw-specific-guide-hero":"#13151a","--dsw-specific-login-input":"#17191e","--dsw-specific-sidebar-glass-fill":"#1c1e25","--dsw-specific-sidebar-glass-hover":"#181a1f","--dsw-specific-sidebar-glass-collapsed-fill":"#191c22","--dsw-specific-sidebar-glass-collapsed-hover":"#181a1f","--dsw-specific-sidebar-nav-item-active-accent":"#d13c3c","--dsw-specific-sidebar-right-flash":"#b02a2a","--dsw-specific-sidebar-tint":"#15171c","--dsw-specific-sidebar-wash-top":"#15171c","--dsw-specific-sidebar-wash-top-clear":"#15171c","--dsw-specific-sidebar-wash-bottom":"#15171c","--dsw-specific-sidebar-wash-bottom-clear":"#15171c","--dsw-alias-brand-primary-new-colorprimary-new-color":"#d13c3c","--dsw-linear-gradient-think":"linear-gradient(180deg, #0e1015 20.19%, #0e101500 100%)","--dsw-linear-think-select":"linear-gradient(180deg, #17191e 20.19%, #17191e00 100%)"},"light":{"--dsw-alias-bg-base":"#f4f1ec","--dsw-alias-bg-layer-1":"#f0ede8","--dsw-alias-bg-layer-2":"#efece7","--dsw-alias-bg-layer-3":"#edeae5","--dsw-alias-bg-layer-4":"#ebe8e3","--dsw-alias-bg-overlay":"#edeae5","--dsw-alias-bg-skeleton":"#edeae5","--dsw-alias-bg-module-platform":"#efece7","--dsw-alias-bg-mask-drop":"#c3c1bd","--dsw-alias-label-primary":"#403c35","--dsw-alias-label-primary-dimmed":"#211e1a","--dsw-alias-label-primary-foreground":"#ffffff","--dsw-alias-label-primary-inverted":"#211e1a","--dsw-alias-label-secondary":"#6e6960","--dsw-alias-label-tertiary":"#6e6963","--dsw-alias-label-caption":"#726e67","--dsw-alias-label-dimmed":"#6f6b63","--dsw-alias-label-error":"#cf2121","--dsw-alias-brand-primary":"#bd4531","--dsw-alias-brand-primary-invert":"#bd4531","--dsw-alias-brand-text":"#bd4531","--dsw-alias-link":"#bd4531","--dsw-alias-border-l1":"#e6e3dd","--dsw-alias-border-l2":"#e0ddd8","--dsw-alias-border-l3":"#dbd8d2","--dsw-alias-border-l4":"#d4d0cb","--dsw-alias-interactive-bg-hover":"#edeae5","--dsw-alias-interactive-bg-hover-solid":"#e9e6e1","--dsw-alias-interactive-bg-active":"#e7e4df","--dsw-alias-interactive-bg-hover-accent":"#efe0d9","--dsw-alias-interactive-bg-hover-danger":"#f2ddd8","--dsw-alias-button-primary-fill":"#bd4531","--dsw-alias-button-primary-hover":"#bd4531","--dsw-alias-button-primary-dimmed":"#eddcd6","--dsw-alias-button-elevated-fill":"#f0ede8","--dsw-alias-button-floating-fill":"#efece7","--dsw-alias-button-floating-hover":"#e9e6e1","--dsw-alias-button-contrast-fill":"#5b5750","--dsw-alias-button-ghost-active-fill":"#ebe8e3","--dsw-alias-button-ghost-active-hover":"#e7e4df","--dsw-alias-button-ghost-active-border":"#dedbd6","--dsw-alias-state-error-primary":"#cf2121","--dsw-alias-state-error-secondary":"#f1d9d4","--dsw-alias-state-success-primary":"#2a7c35","--dsw-alias-state-warn-primary":"#92400e","--dsw-alias-state-warn-label":"#92400e","--dsw-alias-markdown-code-block":"#efece7","--dsw-alias-markdown-code-block-banner":"#edeae5","--dsw-alias-markdown-citation":"#efece7","--dsw-alias-markdown-placeholder":"#edeae5","--dsw-alias-markdown-tag":"#ebe8e3","--dsw-alias-markdown-code-segment-selected":"#edeae5","--dsw-alias-markdown-code-segment-unselected":"#f0ede8","--dsw-alias-scrollbar-bg-l1":"#ebe8e3","--dsw-alias-scrollbar-bg-l2":"#e6e3dd","--dsw-alias-scrollbar-hover-l1":"#e2dfda","--dsw-alias-scrollbar-hover-l2":"#ddd9d4","--dsw-alias-switch-thumb":"#ffffff","--dsw-alias-toast-bg":"#5b5750","--dsw-alias-toast-label":"#f4f1ec","--dsw-alias-tooltip-bg":"#605d56","--dsw-alias-menu-group-header-fill":"#efece7","--dsw-menu-surface-fill":"#efece7","--dsw-specific-sidebar-fill":"#efece7","--dsw-specific-sidebar-nav-item-active":"#e9e6e1","--dsw-specific-bubble":"#efece7","--dsw-specific-input-major":"#efece7","--dsw-specific-menu":"#efece7","--dsw-specific-selector":"#efece7","--dsw-specific-tip":"#efece7","--dsw-alias-file-diff-added-bg":"#e6ede0","--dsw-alias-file-diff-deleted-bg":"#f2e1dc","--dsw-alias-code-diff-added":"#deead9","--dsw-alias-code-diff-deleted":"#f1d9d4","--dsw-font-markdown-base-strong-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small":"12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11":"11px/14px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16":"16px/24px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4":"600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2":"700 calc(19px + calc(14px - 14px)) / calc(28px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong":"600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic":"italic 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1":"700 calc(21px + calc(14px - 14px)) / calc(30px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3":"700 calc(18px + calc(14px - 14px)) / calc(26px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base":"14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16":"500 16px/24px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12":"12px/18px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong":"600 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24":"600 24px/32px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14":"500 14px/22px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic":"italic 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11":"500 11px/14px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic":"italic 600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic":"italic 600 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table":"min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13":"13px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14":"14px/22px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12":"500 12px/18px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head":"500 min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13":"500 13px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18":"500 16px/28px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family-brand":"\"Manrope\", \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20":"500 20px/28px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-elevation-soft":"0 0 0 .5px rgba(40, 28, 26, 0.15), 0 4px 14px rgba(40, 28, 26, 0.07)","--dsw-elevation-panel":"0 0 0 .5px rgba(40, 28, 26, 0.15), 0 12px 30px rgba(40, 28, 26, 0.09)","--dsw-elevation-prominent":"0 0 0 .5px rgba(40, 28, 26, 0.15), 0 24px 50px rgba(40, 28, 26, 0.11)","--dsw-alias-markdown-inline-code":"#ebe8e3","--dsw-alias-json-tree-hover":"#edeae5","--dsw-alias-json-tree-property":"#6e6960","--dsw-alias-json-tree-punctuation":"#908b83","--dsw-alias-json-tree-number":"#bd4531","--dsw-alias-json-tree-keyword":"#bd4531","--dsw-alias-json-tree-icon":"#908b83","--dsw-alias-state-idle-primary":"#908b83","--dsw-alias-state-done-primary":"#3fb950","--dsw-alias-state-business-primary":"#bd4531","--dsw-alias-state-warn-secondary":"#92400e","--dsw-alias-state-warn-tertiary":"#92400e","--dsw-alias-state-success-secondary":"#3fb950","--dsw-alias-state-success-tertiary":"#3fb950","--dsw-alias-border-selected":"#bd4531","--dsw-alias-border-inverted":"#e6e3dd","--dsw-alias-border-inverted2":"#e6e3dd","--dsw-alias-card-fill":"#f0ede8","--dsw-alias-card-tile-fill":"#efece7","--dsw-alias-settings-card-fill":"#f0ede8","--dsw-alias-settings-card-stroke":"#e0ddd8","--dsw-alias-onboarding-card-fill":"#f0ede8","--dsw-alias-label-document-preview":"#6e6960","--dsw-alias-label-primary-bluish":"#403c35","--dsw-alias-label-shimmer":"#908b83","--dsw-alias-label-deep-diving-shimmer":"#908b83","--dsw-alias-label-on-color":"#ffffff","--dsw-alias-hovercard-label-primary":"#403c35","--dsw-alias-hovercard-label-secondary":"#6e6960","--dsw-alias-hovercard-label-tertiary":"#908b83","--dsw-alias-hovercard-state-error":"#dc2626","--dsw-alias-hovercard-state-done":"#3fb950","--dsw-alias-bg-mask-1":"#c3c1bd","--dsw-alias-bg-mask-2":"#c3c1bd","--dsw-alias-bg-mask-3":"#c3c1bd","--dsw-alias-bg-mask-photo":"#c3c1bd","--dsw-alias-bg-document-selection":"#efe0d9","--dsw-alias-button-info-fill":"#bd4531","--dsw-alias-button-info-hover":"#bd4531","--dsw-alias-button-tool-bar-fill":"#efece7","--dsw-alias-button-tool-bar-fill-invisible":"#c3c1bd","--dsw-alias-button-tool-bar-hover":"#e9e6e1","--dsw-alias-chart-tools":"#908b83","--dsw-alias-chart-messages":"#6e6960","--dsw-alias-chart-system":"#bd4531","--dsw-alias-illustration-surface":"#efece7","--dsw-alias-illustration-shadow":"#e0ddd8","--dsw-alias-illustration-backing":"#edeae5","--dsw-alias-trajectory-accent":"#bd4531","--dsw-alias-menu-icon":"#6e6960","--dsw-alias-tooltip-label":"#ffffff","--dsw-alias-tooltip-key-bg":"#edeae5","--dsw-alias-toast-action":"#bd4531","--dsw-alias-onboarding-accent":"#bd4531","--dsw-alias-onboarding-checkbox-border":"#dbd8d2","--dsw-alias-turn-trigger-bg":"#edeae5","--dsw-alias-turn-trigger-bg-hover":"#e9e6e1","--dsw-alias-file-diff-added-gutter":"#e6ede0","--dsw-alias-file-diff-deleted-gutter":"#f2e1dc","--dsw-alias-file-diff-added-marker":"#deead9","--dsw-alias-file-diff-deleted-marker":"#f1d9d4","--dsw-alias-bg-document-preview":"#efece7","--dsw-alias-bg-multi-select":"#edeae5","--dsw-alias-border-l2-darkmode-thin":"#d9d6cf","--dsw-alias-card-fill-hover":"#f5f3f0","--dsw-alias-hovercard-bg":"#ebe8e3","--dsw-alias-illustration-background":"#f0ede8","--dsw-alias-illustration-detail":"#6e6960","--dsw-alias-illustration-inset":"#edeae5","--dsw-alias-json-tree-string":"#3fb950","--dsw-alias-label-deep-diving":"#908b83","--dsw-alias-onboarding-secondary-fill":"#efece7","--dsw-alias-state-business-tertiary":"#da7f70","--dsw-specific-bubble-highlight":"#fbfaf9","--dsw-specific-file-upload-track":"#efece7","--dsw-specific-guide-hero":"#f0ede8","--dsw-specific-login-input":"#efece7","--dsw-specific-sidebar-glass-fill":"#f5f3f0","--dsw-specific-sidebar-glass-hover":"#edeae5","--dsw-specific-sidebar-glass-collapsed-fill":"#f3f1ed","--dsw-specific-sidebar-glass-collapsed-hover":"#edeae5","--dsw-specific-sidebar-nav-item-active-accent":"#bd4531","--dsw-specific-sidebar-right-flash":"#953627","--dsw-specific-sidebar-tint":"#efece7","--dsw-specific-sidebar-wash-top":"#efece7","--dsw-specific-sidebar-wash-top-clear":"#efece7","--dsw-specific-sidebar-wash-bottom":"#efece7","--dsw-specific-sidebar-wash-bottom-clear":"#efece7","--dsw-alias-brand-primary-new-colorprimary-new-color":"#bd4531","--dsw-linear-gradient-think":"linear-gradient(180deg, #f4f1ec 20.19%, #f4f1ec00 100%)","--dsw-linear-think-select":"linear-gradient(180deg, #efece7 20.19%, #efece700 100%)"},"label":"@theme.zhuoer"},"absolutely":{"dark":{"--dsw-alias-bg-base":"#1b1b1a","--dsw-alias-bg-layer-1":"#212120","--dsw-alias-bg-layer-2":"#252523","--dsw-alias-bg-layer-3":"#292927","--dsw-alias-bg-layer-4":"#2c2c2b","--dsw-alias-bg-overlay":"#2b2b29","--dsw-alias-bg-skeleton":"#272725","--dsw-alias-bg-module-platform":"#272725","--dsw-alias-bg-mask-drop":"#161615","--dsw-alias-label-primary":"#ddddd7","--dsw-alias-label-primary-dimmed":"#e8e8e2","--dsw-alias-label-primary-foreground":"#241f1b","--dsw-alias-label-primary-inverted":"#e8e8e2","--dsw-alias-label-secondary":"#a09f98","--dsw-alias-label-tertiary":"#8a8a84","--dsw-alias-label-caption":"#93928b","--dsw-alias-label-dimmed":"#878681","--dsw-alias-label-error":"#df6767","--dsw-alias-brand-primary":"#d97757","--dsw-alias-brand-primary-invert":"#d97757","--dsw-alias-brand-text":"#d97757","--dsw-alias-link":"#d97757","--dsw-alias-border-l1":"#2e2e2d","--dsw-alias-border-l2":"#363634","--dsw-alias-border-l3":"#3e3e3c","--dsw-alias-border-l4":"#4a4a47","--dsw-alias-interactive-bg-hover":"#292927","--dsw-alias-interactive-bg-hover-solid":"#2c2c2b","--dsw-alias-interactive-bg-active":"#30302f","--dsw-alias-interactive-bg-hover-accent":"#362823","--dsw-alias-interactive-bg-hover-danger":"#351e1d","--dsw-alias-button-primary-fill":"#d97757","--dsw-alias-button-primary-hover":"#e68b6b","--dsw-alias-button-primary-dimmed":"#392a24","--dsw-alias-button-elevated-fill":"#252523","--dsw-alias-button-floating-fill":"#2b2b29","--dsw-alias-button-floating-hover":"#30302f","--dsw-alias-button-contrast-fill":"#f3f3ee","--dsw-alias-button-ghost-active-fill":"#2b2b29","--dsw-alias-button-ghost-active-hover":"#30302f","--dsw-alias-button-ghost-active-border":"#3a3a38","--dsw-alias-state-error-primary":"#df6767","--dsw-alias-state-error-secondary":"#3c1f1e","--dsw-alias-state-success-primary":"#3fb950","--dsw-alias-state-warn-primary":"#f59e0b","--dsw-alias-state-warn-label":"#f59e0b","--dsw-alias-markdown-code-block":"#252523","--dsw-alias-markdown-code-block-banner":"#2b2b29","--dsw-alias-markdown-citation":"#272725","--dsw-alias-markdown-placeholder":"#292927","--dsw-alias-markdown-tag":"#2c2c2b","--dsw-alias-markdown-code-segment-selected":"#2b2b29","--dsw-alias-markdown-code-segment-unselected":"#232322","--dsw-alias-scrollbar-bg-l1":"#2b2b29","--dsw-alias-scrollbar-bg-l2":"#323231","--dsw-alias-scrollbar-hover-l1":"#363634","--dsw-alias-scrollbar-hover-l2":"#3e3e3c","--dsw-alias-switch-thumb":"#868682","--dsw-alias-toast-bg":"#323231","--dsw-alias-toast-label":"#ddddd7","--dsw-alias-tooltip-bg":"#363634","--dsw-alias-menu-group-header-fill":"#252523","--dsw-menu-surface-fill":"#292927","--dsw-specific-sidebar-fill":"#232322","--dsw-specific-sidebar-nav-item-active":"#2e2e2d","--dsw-specific-bubble":"#252523","--dsw-specific-input-major":"#272725","--dsw-specific-menu":"#292927","--dsw-specific-selector":"#272725","--dsw-specific-tip":"#252523","--dsw-alias-file-diff-added-bg":"#1f2e20","--dsw-alias-file-diff-deleted-bg":"#311d1d","--dsw-alias-code-diff-added":"#213724","--dsw-alias-code-diff-deleted":"#3c1f1e","--dsw-font-markdown-base-strong-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small":"12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11":"11px/14px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16":"16px/24px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4":"600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2":"700 calc(19px + calc(14px - 14px)) / calc(28px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong":"600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic":"italic 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1":"700 calc(21px + calc(14px - 14px)) / calc(30px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3":"700 calc(18px + calc(14px - 14px)) / calc(26px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base":"14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16":"500 16px/24px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12":"12px/18px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong":"600 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24":"600 24px/32px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14":"500 14px/22px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic":"italic 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11":"500 11px/14px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic":"italic 600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic":"italic 600 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table":"min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13":"13px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14":"14px/22px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12":"500 12px/18px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head":"500 min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13":"500 13px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18":"500 16px/28px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family-brand":"\"Manrope\", \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20":"500 20px/28px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-elevation-soft":"0 0 0 .5px rgba(28, 20, 18, 0.20), 0 4px 16px rgba(28, 20, 18, 0.30)","--dsw-elevation-panel":"0 0 0 .5px rgba(28, 20, 18, 0.20), 0 12px 32px rgba(28, 20, 18, 0.40)","--dsw-elevation-prominent":"0 0 0 .5px rgba(28, 20, 18, 0.20), 0 24px 48px rgba(28, 20, 18, 0.50)","--dsw-alias-markdown-inline-code":"#2c2c2b","--dsw-alias-json-tree-hover":"#292927","--dsw-alias-json-tree-property":"#a09f98","--dsw-alias-json-tree-punctuation":"#85857f","--dsw-alias-json-tree-number":"#d97757","--dsw-alias-json-tree-keyword":"#d97757","--dsw-alias-json-tree-icon":"#85857f","--dsw-alias-state-idle-primary":"#85857f","--dsw-alias-state-done-primary":"#3fb950","--dsw-alias-state-business-primary":"#d97757","--dsw-alias-state-warn-secondary":"#f59e0b","--dsw-alias-state-warn-tertiary":"#f59e0b","--dsw-alias-state-success-secondary":"#3fb950","--dsw-alias-state-success-tertiary":"#3fb950","--dsw-alias-border-selected":"#d97757","--dsw-alias-border-inverted":"#2e2e2d","--dsw-alias-border-inverted2":"#2e2e2d","--dsw-alias-card-fill":"#212120","--dsw-alias-card-tile-fill":"#252523","--dsw-alias-settings-card-fill":"#212120","--dsw-alias-settings-card-stroke":"#363634","--dsw-alias-onboarding-card-fill":"#212120","--dsw-alias-label-document-preview":"#a09f98","--dsw-alias-label-primary-bluish":"#ddddd7","--dsw-alias-label-shimmer":"#85857f","--dsw-alias-label-deep-diving-shimmer":"#85857f","--dsw-alias-label-on-color":"#241f1b","--dsw-alias-hovercard-label-primary":"#ddddd7","--dsw-alias-hovercard-label-secondary":"#a09f98","--dsw-alias-hovercard-label-tertiary":"#85857f","--dsw-alias-hovercard-state-error":"#d32f2f","--dsw-alias-hovercard-state-done":"#3fb950","--dsw-alias-bg-mask-1":"#161615","--dsw-alias-bg-mask-2":"#161615","--dsw-alias-bg-mask-3":"#161615","--dsw-alias-bg-mask-photo":"#161615","--dsw-alias-bg-document-selection":"#362823","--dsw-alias-button-info-fill":"#d97757","--dsw-alias-button-info-hover":"#d97757","--dsw-alias-button-tool-bar-fill":"#2b2b29","--dsw-alias-button-tool-bar-fill-invisible":"#161615","--dsw-alias-button-tool-bar-hover":"#30302f","--dsw-alias-chart-tools":"#85857f","--dsw-alias-chart-messages":"#a09f98","--dsw-alias-chart-system":"#d97757","--dsw-alias-illustration-surface":"#252523","--dsw-alias-illustration-shadow":"#363634","--dsw-alias-illustration-backing":"#292927","--dsw-alias-trajectory-accent":"#d97757","--dsw-alias-menu-icon":"#a09f98","--dsw-alias-tooltip-label":"#241f1b","--dsw-alias-tooltip-key-bg":"#292927","--dsw-alias-toast-action":"#d97757","--dsw-alias-onboarding-accent":"#d97757","--dsw-alias-onboarding-checkbox-border":"#3e3e3c","--dsw-alias-turn-trigger-bg":"#292927","--dsw-alias-turn-trigger-bg-hover":"#2c2c2b","--dsw-alias-file-diff-added-gutter":"#1f2e20","--dsw-alias-file-diff-deleted-gutter":"#311d1d","--dsw-alias-file-diff-added-marker":"#213724","--dsw-alias-file-diff-deleted-marker":"#3c1f1e","--dsw-alias-bg-document-preview":"#252523","--dsw-alias-bg-multi-select":"#292927","--dsw-alias-border-l2-darkmode-thin":"#2e2e2c","--dsw-alias-card-fill-hover":"#2d2d2a","--dsw-alias-hovercard-bg":"#2e2e2d","--dsw-alias-illustration-background":"#212120","--dsw-alias-illustration-detail":"#a09f98","--dsw-alias-illustration-inset":"#292927","--dsw-alias-json-tree-string":"#3fb950","--dsw-alias-label-deep-diving":"#85857f","--dsw-alias-onboarding-secondary-fill":"#252523","--dsw-alias-state-business-tertiary":"#eab4a2","--dsw-specific-bubble-highlight":"#353532","--dsw-specific-file-upload-track":"#252523","--dsw-specific-guide-hero":"#212120","--dsw-specific-login-input":"#252523","--dsw-specific-sidebar-glass-fill":"#2b2b2a","--dsw-specific-sidebar-glass-hover":"#272725","--dsw-specific-sidebar-glass-collapsed-fill":"#282827","--dsw-specific-sidebar-glass-collapsed-hover":"#272725","--dsw-specific-sidebar-nav-item-active-accent":"#d97757","--dsw-specific-sidebar-right-flash":"#ce562f","--dsw-specific-sidebar-tint":"#232322","--dsw-specific-sidebar-wash-top":"#232322","--dsw-specific-sidebar-wash-top-clear":"#232322","--dsw-specific-sidebar-wash-bottom":"#232322","--dsw-specific-sidebar-wash-bottom-clear":"#232322","--dsw-alias-brand-primary-new-colorprimary-new-color":"#d97757","--dsw-linear-gradient-think":"linear-gradient(180deg, #1b1b1a 20.19%, #1b1b1a00 100%)","--dsw-linear-think-select":"linear-gradient(180deg, #252523 20.19%, #25252300 100%)"},"light":{"--dsw-alias-bg-base":"#f7f6f5","--dsw-alias-bg-layer-1":"#f3f2f1","--dsw-alias-bg-layer-2":"#f1f0ef","--dsw-alias-bg-layer-3":"#efeeed","--dsw-alias-bg-layer-4":"#edeceb","--dsw-alias-bg-overlay":"#efeeed","--dsw-alias-bg-skeleton":"#efeeed","--dsw-alias-bg-module-platform":"#f1f0ef","--dsw-alias-bg-mask-drop":"#c6c5c4","--dsw-alias-label-primary":"#353531","--dsw-alias-label-primary-dimmed":"#20201e","--dsw-alias-label-primary-foreground":"#ffffff","--dsw-alias-label-primary-inverted":"#20201e","--dsw-alias-label-secondary":"#5e5e58","--dsw-alias-label-tertiary":"#6f6f6b","--dsw-alias-label-caption":"#70706b","--dsw-alias-label-dimmed":"#706f6b","--dsw-alias-label-error":"#d32222","--dsw-alias-brand-primary":"#a5654b","--dsw-alias-brand-primary-invert":"#cc7d5d","--dsw-alias-brand-text":"#a5654b","--dsw-alias-link":"#a5654b","--dsw-alias-border-l1":"#e7e7e5","--dsw-alias-border-l2":"#e2e1df","--dsw-alias-border-l3":"#dcdbda","--dsw-alias-border-l4":"#d4d3d2","--dsw-alias-interactive-bg-hover":"#efeeed","--dsw-alias-interactive-bg-hover-solid":"#ebeae9","--dsw-alias-interactive-bg-active":"#e9e8e7","--dsw-alias-interactive-bg-hover-accent":"#efe8e4","--dsw-alias-interactive-bg-hover-danger":"#f4e1e0","--dsw-alias-button-primary-fill":"#a5654b","--dsw-alias-button-primary-hover":"#995d45","--dsw-alias-button-primary-dimmed":"#ede5e1","--dsw-alias-button-elevated-fill":"#f3f2f1","--dsw-alias-button-floating-fill":"#f1f0ef","--dsw-alias-button-floating-hover":"#ebeae9","--dsw-alias-button-contrast-fill":"#52524e","--dsw-alias-button-ghost-active-fill":"#edeceb","--dsw-alias-button-ghost-active-hover":"#e9e8e7","--dsw-alias-button-ghost-active-border":"#e0dfdd","--dsw-alias-state-error-primary":"#d32222","--dsw-alias-state-error-secondary":"#f4dddc","--dsw-alias-state-success-primary":"#2a7c35","--dsw-alias-state-warn-primary":"#92400e","--dsw-alias-state-warn-label":"#92400e","--dsw-alias-markdown-code-block":"#f1f0ef","--dsw-alias-markdown-code-block-banner":"#efeeed","--dsw-alias-markdown-citation":"#f1f0ef","--dsw-alias-markdown-placeholder":"#efeeed","--dsw-alias-markdown-tag":"#edeceb","--dsw-alias-markdown-code-segment-selected":"#efeeed","--dsw-alias-markdown-code-segment-unselected":"#f3f2f1","--dsw-alias-scrollbar-bg-l1":"#edeceb","--dsw-alias-scrollbar-bg-l2":"#e7e7e5","--dsw-alias-scrollbar-hover-l1":"#e4e3e1","--dsw-alias-scrollbar-hover-l2":"#dedddc","--dsw-alias-switch-thumb":"#ffffff","--dsw-alias-toast-bg":"#52524e","--dsw-alias-toast-label":"#f7f6f5","--dsw-alias-tooltip-bg":"#585854","--dsw-alias-menu-group-header-fill":"#f1f0ef","--dsw-menu-surface-fill":"#f1f0ef","--dsw-specific-sidebar-fill":"#f1f0ef","--dsw-specific-sidebar-nav-item-active":"#ebeae9","--dsw-specific-bubble":"#f1f0ef","--dsw-specific-input-major":"#f1f0ef","--dsw-specific-menu":"#f1f0ef","--dsw-specific-selector":"#f1f0ef","--dsw-specific-tip":"#f1f0ef","--dsw-alias-file-diff-added-bg":"#e8f1e8","--dsw-alias-file-diff-deleted-bg":"#f5e5e4","--dsw-alias-code-diff-added":"#e1efe1","--dsw-alias-code-diff-deleted":"#f4dddc","--dsw-font-markdown-base-strong-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small":"12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11":"11px/14px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16":"16px/24px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4":"600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2":"700 calc(19px + calc(14px - 14px)) / calc(28px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong":"600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic":"italic 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1":"700 calc(21px + calc(14px - 14px)) / calc(30px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3":"700 calc(18px + calc(14px - 14px)) / calc(26px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base":"14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16":"500 16px/24px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12":"12px/18px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong":"600 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24":"600 24px/32px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14":"500 14px/22px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic":"italic 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11":"500 11px/14px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic":"italic 600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic":"italic 600 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table":"min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13":"13px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14":"14px/22px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12":"500 12px/18px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head":"500 min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13":"500 13px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18":"500 16px/28px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family-brand":"\"Manrope\", \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20":"500 20px/28px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-elevation-soft":"0 0 0 .5px rgba(40, 30, 26, 0.15), 0 4px 14px rgba(40, 30, 26, 0.07)","--dsw-elevation-panel":"0 0 0 .5px rgba(40, 30, 26, 0.15), 0 12px 30px rgba(40, 30, 26, 0.09)","--dsw-elevation-prominent":"0 0 0 .5px rgba(40, 30, 26, 0.15), 0 24px 50px rgba(40, 30, 26, 0.11)","--dsw-alias-markdown-inline-code":"#edeceb","--dsw-alias-json-tree-hover":"#efeeed","--dsw-alias-json-tree-property":"#5e5e58","--dsw-alias-json-tree-punctuation":"#84847f","--dsw-alias-json-tree-number":"#a5654b","--dsw-alias-json-tree-keyword":"#a5654b","--dsw-alias-json-tree-icon":"#84847f","--dsw-alias-state-idle-primary":"#84847f","--dsw-alias-state-done-primary":"#3fb950","--dsw-alias-state-business-primary":"#a5654b","--dsw-alias-state-warn-secondary":"#92400e","--dsw-alias-state-warn-tertiary":"#92400e","--dsw-alias-state-success-secondary":"#3fb950","--dsw-alias-state-success-tertiary":"#3fb950","--dsw-alias-border-selected":"#a5654b","--dsw-alias-border-inverted":"#e7e7e5","--dsw-alias-border-inverted2":"#e7e7e5","--dsw-alias-card-fill":"#f3f2f1","--dsw-alias-card-tile-fill":"#f1f0ef","--dsw-alias-settings-card-fill":"#f3f2f1","--dsw-alias-settings-card-stroke":"#e2e1df","--dsw-alias-onboarding-card-fill":"#f3f2f1","--dsw-alias-label-document-preview":"#5e5e58","--dsw-alias-label-primary-bluish":"#353531","--dsw-alias-label-shimmer":"#84847f","--dsw-alias-label-deep-diving-shimmer":"#84847f","--dsw-alias-label-on-color":"#ffffff","--dsw-alias-hovercard-label-primary":"#353531","--dsw-alias-hovercard-label-secondary":"#5e5e58","--dsw-alias-hovercard-label-tertiary":"#84847f","--dsw-alias-hovercard-state-error":"#dc2626","--dsw-alias-hovercard-state-done":"#3fb950","--dsw-alias-bg-mask-1":"#c6c5c4","--dsw-alias-bg-mask-2":"#c6c5c4","--dsw-alias-bg-mask-3":"#c6c5c4","--dsw-alias-bg-mask-photo":"#c6c5c4","--dsw-alias-bg-document-selection":"#efe8e4","--dsw-alias-button-info-fill":"#a5654b","--dsw-alias-button-info-hover":"#cc7d5d","--dsw-alias-button-tool-bar-fill":"#f1f0ef","--dsw-alias-button-tool-bar-fill-invisible":"#c6c5c4","--dsw-alias-button-tool-bar-hover":"#ebeae9","--dsw-alias-chart-tools":"#84847f","--dsw-alias-chart-messages":"#5e5e58","--dsw-alias-chart-system":"#a5654b","--dsw-alias-illustration-surface":"#f1f0ef","--dsw-alias-illustration-shadow":"#e2e1df","--dsw-alias-illustration-backing":"#efeeed","--dsw-alias-trajectory-accent":"#a5654b","--dsw-alias-menu-icon":"#5e5e58","--dsw-alias-tooltip-label":"#ffffff","--dsw-alias-tooltip-key-bg":"#efeeed","--dsw-alias-toast-action":"#a5654b","--dsw-alias-onboarding-accent":"#a5654b","--dsw-alias-onboarding-checkbox-border":"#dcdbda","--dsw-alias-turn-trigger-bg":"#efeeed","--dsw-alias-turn-trigger-bg-hover":"#ebeae9","--dsw-alias-file-diff-added-gutter":"#e8f1e8","--dsw-alias-file-diff-deleted-gutter":"#f5e5e4","--dsw-alias-file-diff-added-marker":"#e1efe1","--dsw-alias-file-diff-deleted-marker":"#f4dddc","--dsw-alias-bg-document-preview":"#f1f0ef","--dsw-alias-bg-multi-select":"#efeeed","--dsw-alias-border-l2-darkmode-thin":"#dbd9d7","--dsw-alias-card-fill-hover":"#f8f8f7","--dsw-alias-hovercard-bg":"#edeceb","--dsw-alias-illustration-background":"#f3f2f1","--dsw-alias-illustration-detail":"#5e5e58","--dsw-alias-illustration-inset":"#efeeed","--dsw-alias-json-tree-string":"#3fb950","--dsw-alias-label-deep-diving":"#84847f","--dsw-alias-onboarding-secondary-fill":"#f1f0ef","--dsw-alias-state-business-tertiary":"#c79884","--dsw-specific-bubble-highlight":"#fafafa","--dsw-specific-file-upload-track":"#f1f0ef","--dsw-specific-guide-hero":"#f3f2f1","--dsw-specific-login-input":"#f1f0ef","--dsw-specific-sidebar-glass-fill":"#f8f8f7","--dsw-specific-sidebar-glass-hover":"#efeeed","--dsw-specific-sidebar-glass-collapsed-fill":"#f6f5f4","--dsw-specific-sidebar-glass-collapsed-hover":"#efeeed","--dsw-specific-sidebar-nav-item-active-accent":"#a5654b","--dsw-specific-sidebar-right-flash":"#82503b","--dsw-specific-sidebar-tint":"#f1f0ef","--dsw-specific-sidebar-wash-top":"#f1f0ef","--dsw-specific-sidebar-wash-top-clear":"#f1f0ef","--dsw-specific-sidebar-wash-bottom":"#f1f0ef","--dsw-specific-sidebar-wash-bottom-clear":"#f1f0ef","--dsw-alias-brand-primary-new-colorprimary-new-color":"#a5654b","--dsw-linear-gradient-think":"linear-gradient(180deg, #f7f6f5 20.19%, #f7f6f500 100%)","--dsw-linear-think-select":"linear-gradient(180deg, #f1f0ef 20.19%, #f1f0ef00 100%)"},"label":"@theme.absolutely"},"beacon":{"dark":{"--dsw-alias-bg-base":"#000000","--dsw-alias-bg-layer-1":"#080808","--dsw-alias-bg-layer-2":"#0d0d0d","--dsw-alias-bg-layer-3":"#121212","--dsw-alias-bg-layer-4":"#171717","--dsw-alias-bg-overlay":"#141414","--dsw-alias-bg-skeleton":"#0f0f0f","--dsw-alias-bg-module-platform":"#0f0f0f","--dsw-alias-bg-mask-drop":"#000000","--dsw-alias-label-primary":"#ffffff","--dsw-alias-label-primary-dimmed":"#ffffff","--dsw-alias-label-primary-foreground":"#000000","--dsw-alias-label-primary-inverted":"#ffffff","--dsw-alias-label-secondary":"#c9c9c9","--dsw-alias-label-tertiary":"#a1a1a1","--dsw-alias-label-caption":"#b5b5b5","--dsw-alias-label-dimmed":"#8d8d8d","--dsw-alias-label-error":"#ffabab","--dsw-alias-brand-primary":"#ffc233","--dsw-alias-brand-primary-invert":"#ffc233","--dsw-alias-brand-text":"#ffc233","--dsw-alias-link":"#ffc233","--dsw-alias-border-l1":"#191919","--dsw-alias-border-l2":"#242424","--dsw-alias-border-l3":"#2e2e2e","--dsw-alias-border-l4":"#3d3d3d","--dsw-alias-interactive-bg-hover":"#121212","--dsw-alias-interactive-bg-hover-solid":"#171717","--dsw-alias-interactive-bg-active":"#1c1c1c","--dsw-alias-interactive-bg-hover-accent":"#241b07","--dsw-alias-interactive-bg-hover-danger":"#241818","--dsw-alias-button-primary-fill":"#ffc233","--dsw-alias-button-primary-hover":"#ffd45e","--dsw-alias-button-primary-dimmed":"#291f08","--dsw-alias-button-elevated-fill":"#0d0d0d","--dsw-alias-button-floating-fill":"#141414","--dsw-alias-button-floating-hover":"#1c1c1c","--dsw-alias-button-contrast-fill":"#ffffff","--dsw-alias-button-ghost-active-fill":"#141414","--dsw-alias-button-ghost-active-hover":"#1c1c1c","--dsw-alias-button-ghost-active-border":"#292929","--dsw-alias-state-error-primary":"#ffabab","--dsw-alias-state-error-secondary":"#2e1f1f","--dsw-alias-state-success-primary":"#3fb950","--dsw-alias-state-warn-primary":"#ffc233","--dsw-alias-state-warn-label":"#ffc233","--dsw-alias-markdown-code-block":"#0d0d0d","--dsw-alias-markdown-code-block-banner":"#141414","--dsw-alias-markdown-citation":"#0f0f0f","--dsw-alias-markdown-placeholder":"#121212","--dsw-alias-markdown-tag":"#171717","--dsw-alias-markdown-code-segment-selected":"#141414","--dsw-alias-markdown-code-segment-unselected":"#0a0a0a","--dsw-alias-scrollbar-bg-l1":"#141414","--dsw-alias-scrollbar-bg-l2":"#1f1f1f","--dsw-alias-scrollbar-hover-l1":"#242424","--dsw-alias-scrollbar-hover-l2":"#2e2e2e","--dsw-alias-switch-thumb":"#8c8c8c","--dsw-alias-toast-bg":"#1f1f1f","--dsw-alias-toast-label":"#ffffff","--dsw-alias-tooltip-bg":"#242424","--dsw-alias-menu-group-header-fill":"#0d0d0d","--dsw-menu-surface-fill":"#121212","--dsw-specific-sidebar-fill":"#0a0a0a","--dsw-specific-sidebar-nav-item-active":"#191919","--dsw-specific-bubble":"#0d0d0d","--dsw-specific-input-major":"#0f0f0f","--dsw-specific-menu":"#121212","--dsw-specific-selector":"#0f0f0f","--dsw-specific-tip":"#0d0d0d","--dsw-alias-file-diff-added-bg":"#08160a","--dsw-alias-file-diff-deleted-bg":"#1f1515","--dsw-alias-code-diff-added":"#0b210e","--dsw-alias-code-diff-deleted":"#2e1f1f","--dsw-font-markdown-base-strong-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small":"12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11":"11px/14px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16":"16px/24px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4":"600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2":"700 calc(19px + calc(14px - 14px)) / calc(28px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong":"600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic":"italic 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1":"700 calc(21px + calc(14px - 14px)) / calc(30px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3":"700 calc(18px + calc(14px - 14px)) / calc(26px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base":"14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16":"500 16px/24px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12":"12px/18px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong":"600 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24":"600 24px/32px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14":"500 14px/22px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic":"italic 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11":"500 11px/14px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic":"italic 600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic":"italic 600 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table":"min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13":"13px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14":"14px/22px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12":"500 12px/18px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head":"500 min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13":"500 13px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18":"500 16px/28px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family-brand":"\"Manrope\", \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20":"500 20px/28px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-elevation-soft":"0 0 0 .5px rgba(28, 25, 18, 0.20), 0 4px 16px rgba(28, 25, 18, 0.30)","--dsw-elevation-panel":"0 0 0 .5px rgba(28, 25, 18, 0.20), 0 12px 32px rgba(28, 25, 18, 0.40)","--dsw-elevation-prominent":"0 0 0 .5px rgba(28, 25, 18, 0.20), 0 24px 48px rgba(28, 25, 18, 0.50)","--dsw-alias-markdown-inline-code":"#171717","--dsw-alias-json-tree-hover":"#121212","--dsw-alias-json-tree-property":"#c9c9c9","--dsw-alias-json-tree-punctuation":"#a1a1a1","--dsw-alias-json-tree-number":"#ffc233","--dsw-alias-json-tree-keyword":"#ffc233","--dsw-alias-json-tree-icon":"#a1a1a1","--dsw-alias-state-idle-primary":"#a1a1a1","--dsw-alias-state-done-primary":"#3fb950","--dsw-alias-state-business-primary":"#ffc233","--dsw-alias-state-warn-secondary":"#ffc233","--dsw-alias-state-warn-tertiary":"#ffc233","--dsw-alias-state-success-secondary":"#3fb950","--dsw-alias-state-success-tertiary":"#3fb950","--dsw-alias-border-selected":"#ffc233","--dsw-alias-border-inverted":"#191919","--dsw-alias-border-inverted2":"#191919","--dsw-alias-card-fill":"#080808","--dsw-alias-card-tile-fill":"#0d0d0d","--dsw-alias-settings-card-fill":"#080808","--dsw-alias-settings-card-stroke":"#242424","--dsw-alias-onboarding-card-fill":"#080808","--dsw-alias-label-document-preview":"#c9c9c9","--dsw-alias-label-primary-bluish":"#ffffff","--dsw-alias-label-shimmer":"#a1a1a1","--dsw-alias-label-deep-diving-shimmer":"#a1a1a1","--dsw-alias-label-on-color":"#000000","--dsw-alias-hovercard-label-primary":"#ffffff","--dsw-alias-hovercard-label-secondary":"#c9c9c9","--dsw-alias-hovercard-label-tertiary":"#a1a1a1","--dsw-alias-hovercard-state-error":"#ffabab","--dsw-alias-hovercard-state-done":"#3fb950","--dsw-alias-bg-mask-1":"#000000","--dsw-alias-bg-mask-2":"#000000","--dsw-alias-bg-mask-3":"#000000","--dsw-alias-bg-mask-photo":"#000000","--dsw-alias-bg-document-selection":"#241b07","--dsw-alias-button-info-fill":"#ffc233","--dsw-alias-button-info-hover":"#ffc233","--dsw-alias-button-tool-bar-fill":"#141414","--dsw-alias-button-tool-bar-fill-invisible":"#000000","--dsw-alias-button-tool-bar-hover":"#1c1c1c","--dsw-alias-chart-tools":"#a1a1a1","--dsw-alias-chart-messages":"#c9c9c9","--dsw-alias-chart-system":"#ffc233","--dsw-alias-illustration-surface":"#0d0d0d","--dsw-alias-illustration-shadow":"#242424","--dsw-alias-illustration-backing":"#121212","--dsw-alias-trajectory-accent":"#ffc233","--dsw-alias-menu-icon":"#c9c9c9","--dsw-alias-tooltip-label":"#000000","--dsw-alias-tooltip-key-bg":"#121212","--dsw-alias-toast-action":"#ffc233","--dsw-alias-onboarding-accent":"#ffc233","--dsw-alias-onboarding-checkbox-border":"#2e2e2e","--dsw-alias-turn-trigger-bg":"#121212","--dsw-alias-turn-trigger-bg-hover":"#171717","--dsw-alias-file-diff-added-gutter":"#08160a","--dsw-alias-file-diff-deleted-gutter":"#1f1515","--dsw-alias-file-diff-added-marker":"#0b210e","--dsw-alias-file-diff-deleted-marker":"#2e1f1f","--dsw-alias-bg-document-preview":"#0d0d0d","--dsw-alias-bg-multi-select":"#121212","--dsw-alias-border-l2-darkmode-thin":"#1c1c1c","--dsw-alias-card-fill-hover":"#151515","--dsw-alias-hovercard-bg":"#191919","--dsw-alias-illustration-background":"#080808","--dsw-alias-illustration-detail":"#c9c9c9","--dsw-alias-illustration-inset":"#121212","--dsw-alias-json-tree-string":"#3fb950","--dsw-alias-label-deep-diving":"#a1a1a1","--dsw-alias-onboarding-secondary-fill":"#0d0d0d","--dsw-alias-state-business-tertiary":"#ffdd8f","--dsw-specific-bubble-highlight":"#1c1c1c","--dsw-specific-file-upload-track":"#0d0d0d","--dsw-specific-guide-hero":"#080808","--dsw-specific-login-input":"#0d0d0d","--dsw-specific-sidebar-glass-fill":"#121212","--dsw-specific-sidebar-glass-hover":"#0f0f0f","--dsw-specific-sidebar-glass-collapsed-fill":"#0f0f0f","--dsw-specific-sidebar-glass-collapsed-hover":"#0f0f0f","--dsw-specific-sidebar-nav-item-active-accent":"#ffc233","--dsw-specific-sidebar-right-flash":"#ffb300","--dsw-specific-sidebar-tint":"#0a0a0a","--dsw-specific-sidebar-wash-top":"#0a0a0a","--dsw-specific-sidebar-wash-top-clear":"#0a0a0a","--dsw-specific-sidebar-wash-bottom":"#0a0a0a","--dsw-specific-sidebar-wash-bottom-clear":"#0a0a0a","--dsw-alias-brand-primary-new-colorprimary-new-color":"#ffc233","--dsw-linear-gradient-think":"linear-gradient(180deg, #000000 20.19%, #00000000 100%)","--dsw-linear-think-select":"linear-gradient(180deg, #0d0d0d 20.19%, #0d0d0d00 100%)"},"light":{"--dsw-alias-bg-base":"#f8f8f8","--dsw-alias-bg-layer-1":"#f3f3f3","--dsw-alias-bg-layer-2":"#f1f1f1","--dsw-alias-bg-layer-3":"#eeeeee","--dsw-alias-bg-layer-4":"#ececec","--dsw-alias-bg-overlay":"#eeeeee","--dsw-alias-bg-skeleton":"#eeeeee","--dsw-alias-bg-module-platform":"#f1f1f1","--dsw-alias-bg-mask-drop":"#c6c6c6","--dsw-alias-label-primary":"#000000","--dsw-alias-label-primary-dimmed":"#000000","--dsw-alias-label-primary-foreground":"#ffffff","--dsw-alias-label-primary-inverted":"#000000","--dsw-alias-label-secondary":"#3a3a3a","--dsw-alias-label-tertiary":"#6a6a6a","--dsw-alias-label-caption":"#575757","--dsw-alias-label-dimmed":"#6e6e6e","--dsw-alias-label-error":"#8c0f0f","--dsw-alias-brand-primary":"#6e4a00","--dsw-alias-brand-primary-invert":"#6e4a00","--dsw-alias-brand-text":"#6e4a00","--dsw-alias-link":"#6e4a00","--dsw-alias-border-l1":"#e4e4e4","--dsw-alias-border-l2":"#dddddd","--dsw-alias-border-l3":"#d5d5d5","--dsw-alias-border-l4":"#cbcbcb","--dsw-alias-interactive-bg-hover":"#eeeeee","--dsw-alias-interactive-bg-hover-solid":"#e9e9e9","--dsw-alias-interactive-bg-active":"#e7e7e7","--dsw-alias-interactive-bg-hover-accent":"#eae7df","--dsw-alias-interactive-bg-hover-danger":"#ede1e1","--dsw-alias-button-primary-fill":"#6e4a00","--dsw-alias-button-primary-hover":"#6e4a00","--dsw-alias-button-primary-dimmed":"#e7e3da","--dsw-alias-button-elevated-fill":"#f3f3f3","--dsw-alias-button-floating-fill":"#f1f1f1","--dsw-alias-button-floating-hover":"#e9e9e9","--dsw-alias-button-contrast-fill":"#252525","--dsw-alias-button-ghost-active-fill":"#ececec","--dsw-alias-button-ghost-active-hover":"#e7e7e7","--dsw-alias-button-ghost-active-border":"#dadada","--dsw-alias-state-error-primary":"#8c0f0f","--dsw-alias-state-error-secondary":"#ebdcdc","--dsw-alias-state-success-primary":"#2a7c35","--dsw-alias-state-warn-primary":"#613d00","--dsw-alias-state-warn-label":"#613d00","--dsw-alias-markdown-code-block":"#f1f1f1","--dsw-alias-markdown-code-block-banner":"#eeeeee","--dsw-alias-markdown-citation":"#f1f1f1","--dsw-alias-markdown-placeholder":"#eeeeee","--dsw-alias-markdown-tag":"#ececec","--dsw-alias-markdown-code-segment-selected":"#eeeeee","--dsw-alias-markdown-code-segment-unselected":"#f3f3f3","--dsw-alias-scrollbar-bg-l1":"#ececec","--dsw-alias-scrollbar-bg-l2":"#e4e4e4","--dsw-alias-scrollbar-hover-l1":"#dfdfdf","--dsw-alias-scrollbar-hover-l2":"#d8d8d8","--dsw-alias-switch-thumb":"#ffffff","--dsw-alias-toast-bg":"#252525","--dsw-alias-toast-label":"#f8f8f8","--dsw-alias-tooltip-bg":"#2d2d2d","--dsw-alias-menu-group-header-fill":"#f1f1f1","--dsw-menu-surface-fill":"#f1f1f1","--dsw-specific-sidebar-fill":"#f1f1f1","--dsw-specific-sidebar-nav-item-active":"#e9e9e9","--dsw-specific-bubble":"#f1f1f1","--dsw-specific-input-major":"#f1f1f1","--dsw-specific-menu":"#f1f1f1","--dsw-specific-selector":"#f1f1f1","--dsw-specific-tip":"#f1f1f1","--dsw-alias-file-diff-added-bg":"#e9f3eb","--dsw-alias-file-diff-deleted-bg":"#efe5e5","--dsw-alias-code-diff-added":"#e2f0e4","--dsw-alias-code-diff-deleted":"#ebdcdc","--dsw-font-markdown-base-strong-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small":"12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11":"11px/14px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16":"16px/24px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4":"600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2":"700 calc(19px + calc(14px - 14px)) / calc(28px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong":"600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic":"italic 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1":"700 calc(21px + calc(14px - 14px)) / calc(30px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3":"700 calc(18px + calc(14px - 14px)) / calc(26px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base":"14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16":"500 16px/24px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12":"12px/18px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong":"600 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24":"600 24px/32px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14":"500 14px/22px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic":"italic 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11":"500 11px/14px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic":"italic 600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic":"italic 600 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table":"min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13":"13px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14":"14px/22px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12":"500 12px/18px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head":"500 min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13":"500 13px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18":"500 16px/28px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family-brand":"\"Manrope\", \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20":"500 20px/28px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-elevation-soft":"0 0 0 .5px rgba(40, 36, 26, 0.15), 0 4px 14px rgba(40, 36, 26, 0.07)","--dsw-elevation-panel":"0 0 0 .5px rgba(40, 36, 26, 0.15), 0 12px 30px rgba(40, 36, 26, 0.09)","--dsw-elevation-prominent":"0 0 0 .5px rgba(40, 36, 26, 0.15), 0 24px 50px rgba(40, 36, 26, 0.11)","--dsw-alias-markdown-inline-code":"#ececec","--dsw-alias-json-tree-hover":"#eeeeee","--dsw-alias-json-tree-property":"#3a3a3a","--dsw-alias-json-tree-punctuation":"#6a6a6a","--dsw-alias-json-tree-number":"#6e4a00","--dsw-alias-json-tree-keyword":"#6e4a00","--dsw-alias-json-tree-icon":"#6a6a6a","--dsw-alias-state-idle-primary":"#6a6a6a","--dsw-alias-state-done-primary":"#3fb950","--dsw-alias-state-business-primary":"#6e4a00","--dsw-alias-state-warn-secondary":"#613d00","--dsw-alias-state-warn-tertiary":"#613d00","--dsw-alias-state-success-secondary":"#3fb950","--dsw-alias-state-success-tertiary":"#3fb950","--dsw-alias-border-selected":"#6e4a00","--dsw-alias-border-inverted":"#e4e4e4","--dsw-alias-border-inverted2":"#e4e4e4","--dsw-alias-card-fill":"#f3f3f3","--dsw-alias-card-tile-fill":"#f1f1f1","--dsw-alias-settings-card-fill":"#f3f3f3","--dsw-alias-settings-card-stroke":"#dddddd","--dsw-alias-onboarding-card-fill":"#f3f3f3","--dsw-alias-label-document-preview":"#3a3a3a","--dsw-alias-label-primary-bluish":"#000000","--dsw-alias-label-shimmer":"#6a6a6a","--dsw-alias-label-deep-diving-shimmer":"#6a6a6a","--dsw-alias-label-on-color":"#ffffff","--dsw-alias-hovercard-label-primary":"#000000","--dsw-alias-hovercard-label-secondary":"#3a3a3a","--dsw-alias-hovercard-label-tertiary":"#6a6a6a","--dsw-alias-hovercard-state-error":"#8c0f0f","--dsw-alias-hovercard-state-done":"#3fb950","--dsw-alias-bg-mask-1":"#c6c6c6","--dsw-alias-bg-mask-2":"#c6c6c6","--dsw-alias-bg-mask-3":"#c6c6c6","--dsw-alias-bg-mask-photo":"#c6c6c6","--dsw-alias-bg-document-selection":"#eae7df","--dsw-alias-button-info-fill":"#6e4a00","--dsw-alias-button-info-hover":"#6e4a00","--dsw-alias-button-tool-bar-fill":"#f1f1f1","--dsw-alias-button-tool-bar-fill-invisible":"#c6c6c6","--dsw-alias-button-tool-bar-hover":"#e9e9e9","--dsw-alias-chart-tools":"#6a6a6a","--dsw-alias-chart-messages":"#3a3a3a","--dsw-alias-chart-system":"#6e4a00","--dsw-alias-illustration-surface":"#f1f1f1","--dsw-alias-illustration-shadow":"#dddddd","--dsw-alias-illustration-backing":"#eeeeee","--dsw-alias-trajectory-accent":"#6e4a00","--dsw-alias-menu-icon":"#3a3a3a","--dsw-alias-tooltip-label":"#ffffff","--dsw-alias-tooltip-key-bg":"#eeeeee","--dsw-alias-toast-action":"#6e4a00","--dsw-alias-onboarding-accent":"#6e4a00","--dsw-alias-onboarding-checkbox-border":"#d5d5d5","--dsw-alias-turn-trigger-bg":"#eeeeee","--dsw-alias-turn-trigger-bg-hover":"#e9e9e9","--dsw-alias-file-diff-added-gutter":"#e9f3eb","--dsw-alias-file-diff-deleted-gutter":"#efe5e5","--dsw-alias-file-diff-added-marker":"#e2f0e4","--dsw-alias-file-diff-deleted-marker":"#ebdcdc","--dsw-alias-bg-document-preview":"#f1f1f1","--dsw-alias-bg-multi-select":"#eeeeee","--dsw-alias-border-l2-darkmode-thin":"#d5d5d5","--dsw-alias-card-fill-hover":"#f9f9f9","--dsw-alias-hovercard-bg":"#ececec","--dsw-alias-illustration-background":"#f3f3f3","--dsw-alias-illustration-detail":"#3a3a3a","--dsw-alias-illustration-inset":"#eeeeee","--dsw-alias-json-tree-string":"#3fb950","--dsw-alias-label-deep-diving":"#6a6a6a","--dsw-alias-onboarding-secondary-fill":"#f1f1f1","--dsw-alias-state-business-tertiary":"#ca8800","--dsw-specific-bubble-highlight":"#fafafa","--dsw-specific-file-upload-track":"#f1f1f1","--dsw-specific-guide-hero":"#f3f3f3","--dsw-specific-login-input":"#f1f1f1","--dsw-specific-sidebar-glass-fill":"#f9f9f9","--dsw-specific-sidebar-glass-hover":"#eeeeee","--dsw-specific-sidebar-glass-collapsed-fill":"#f6f6f6","--dsw-specific-sidebar-glass-collapsed-hover":"#eeeeee","--dsw-specific-sidebar-nav-item-active-accent":"#6e4a00","--dsw-specific-sidebar-right-flash":"#3b2800","--dsw-specific-sidebar-tint":"#f1f1f1","--dsw-specific-sidebar-wash-top":"#f1f1f1","--dsw-specific-sidebar-wash-top-clear":"#f1f1f1","--dsw-specific-sidebar-wash-bottom":"#f1f1f1","--dsw-specific-sidebar-wash-bottom-clear":"#f1f1f1","--dsw-alias-brand-primary-new-colorprimary-new-color":"#6e4a00","--dsw-linear-gradient-think":"linear-gradient(180deg, #f8f8f8 20.19%, #f8f8f800 100%)","--dsw-linear-think-select":"linear-gradient(180deg, #f1f1f1 20.19%, #f1f1f100 100%)"},"label":"@theme.beacon"},"crt":{"dark":{"--dsw-alias-bg-base":"#090a09","--dsw-alias-bg-layer-1":"#0f100f","--dsw-alias-bg-layer-2":"#121312","--dsw-alias-bg-layer-3":"#161716","--dsw-alias-bg-layer-4":"#1a1b1a","--dsw-alias-bg-overlay":"#181918","--dsw-alias-bg-skeleton":"#141514","--dsw-alias-bg-module-platform":"#141514","--dsw-alias-bg-mask-drop":"#070807","--dsw-alias-label-primary":"#c6c6c6","--dsw-alias-label-primary-dimmed":"#ececec","--dsw-alias-label-primary-foreground":"#111111","--dsw-alias-label-primary-inverted":"#ececec","--dsw-alias-label-secondary":"#999999","--dsw-alias-label-tertiary":"#808080","--dsw-alias-label-caption":"#8b8b8b","--dsw-alias-label-dimmed":"#7d7d7d","--dsw-alias-label-error":"#d84f49","--dsw-alias-brand-primary":"#e8e8e8","--dsw-alias-brand-primary-invert":"#e8e8e8","--dsw-alias-brand-text":"#e8e8e8","--dsw-alias-link":"#e8e8e8","--dsw-alias-border-l1":"#1c1d1c","--dsw-alias-border-l2":"#232423","--dsw-alias-border-l3":"#2b2c2b","--dsw-alias-border-l4":"#363736","--dsw-alias-interactive-bg-hover":"#161716","--dsw-alias-interactive-bg-hover-solid":"#1a1b1a","--dsw-alias-interactive-bg-active":"#1e1f1e","--dsw-alias-interactive-bg-hover-accent":"#282928","--dsw-alias-interactive-bg-hover-danger":"#25100e","--dsw-alias-button-primary-fill":"#e8e8e8","--dsw-alias-button-primary-hover":"#ffffff","--dsw-alias-button-primary-dimmed":"#2d2e2d","--dsw-alias-button-elevated-fill":"#121312","--dsw-alias-button-floating-fill":"#181918","--dsw-alias-button-floating-hover":"#1e1f1e","--dsw-alias-button-contrast-fill":"#ececec","--dsw-alias-button-ghost-active-fill":"#181918","--dsw-alias-button-ghost-active-hover":"#1e1f1e","--dsw-alias-button-ghost-active-border":"#272827","--dsw-alias-state-error-primary":"#d84f49","--dsw-alias-state-error-secondary":"#2d120f","--dsw-alias-state-success-primary":"#3fb950","--dsw-alias-state-warn-primary":"#f59e0b","--dsw-alias-state-warn-label":"#f59e0b","--dsw-alias-markdown-code-block":"#121312","--dsw-alias-markdown-code-block-banner":"#181918","--dsw-alias-markdown-citation":"#141514","--dsw-alias-markdown-placeholder":"#161716","--dsw-alias-markdown-tag":"#1a1b1a","--dsw-alias-markdown-code-segment-selected":"#181918","--dsw-alias-markdown-code-segment-unselected":"#111211","--dsw-alias-scrollbar-bg-l1":"#181918","--dsw-alias-scrollbar-bg-l2":"#202120","--dsw-alias-scrollbar-hover-l1":"#232423","--dsw-alias-scrollbar-hover-l2":"#2b2c2b","--dsw-alias-switch-thumb":"#717171","--dsw-alias-toast-bg":"#202120","--dsw-alias-toast-label":"#c6c6c6","--dsw-alias-tooltip-bg":"#232423","--dsw-alias-menu-group-header-fill":"#121312","--dsw-menu-surface-fill":"#161716","--dsw-specific-sidebar-fill":"#111211","--dsw-specific-sidebar-nav-item-active":"#1c1d1c","--dsw-specific-bubble":"#121312","--dsw-specific-input-major":"#141514","--dsw-specific-menu":"#161716","--dsw-specific-selector":"#141514","--dsw-specific-tip":"#121312","--dsw-alias-file-diff-added-bg":"#0f1f12","--dsw-alias-file-diff-deleted-bg":"#210f0d","--dsw-alias-code-diff-added":"#132a16","--dsw-alias-code-diff-deleted":"#2d120f","--dsw-font-markdown-base-strong-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small":"12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11":"11px/14px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16":"16px/24px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4":"600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2":"700 calc(19px + calc(14px - 14px)) / calc(28px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong":"600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic":"italic 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1":"700 calc(21px + calc(14px - 14px)) / calc(30px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3":"700 calc(18px + calc(14px - 14px)) / calc(26px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base":"14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16":"500 16px/24px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12":"12px/18px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong":"600 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24":"600 24px/32px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14":"500 14px/22px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic":"italic 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11":"500 11px/14px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic":"italic 600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic":"italic 600 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table":"min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13":"13px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14":"14px/22px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12":"500 12px/18px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head":"500 min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13":"500 13px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18":"500 16px/28px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family-brand":"\"Manrope\", \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20":"500 20px/28px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-elevation-soft":"0 0 0 .5px rgba(28, 18, 18, 0.20), 0 4px 16px rgba(28, 18, 18, 0.30)","--dsw-elevation-panel":"0 0 0 .5px rgba(28, 18, 18, 0.20), 0 12px 32px rgba(28, 18, 18, 0.40)","--dsw-elevation-prominent":"0 0 0 .5px rgba(28, 18, 18, 0.20), 0 24px 48px rgba(28, 18, 18, 0.50)","--dsw-alias-markdown-inline-code":"#1a1b1a","--dsw-alias-json-tree-hover":"#161716","--dsw-alias-json-tree-property":"#999999","--dsw-alias-json-tree-punctuation":"#7c7c7c","--dsw-alias-json-tree-number":"#e8e8e8","--dsw-alias-json-tree-keyword":"#e8e8e8","--dsw-alias-json-tree-icon":"#7c7c7c","--dsw-alias-state-idle-primary":"#7c7c7c","--dsw-alias-state-done-primary":"#3fb950","--dsw-alias-state-business-primary":"#e8e8e8","--dsw-alias-state-warn-secondary":"#f59e0b","--dsw-alias-state-warn-tertiary":"#f59e0b","--dsw-alias-state-success-secondary":"#3fb950","--dsw-alias-state-success-tertiary":"#3fb950","--dsw-alias-border-selected":"#e8e8e8","--dsw-alias-border-inverted":"#1c1d1c","--dsw-alias-border-inverted2":"#1c1d1c","--dsw-alias-card-fill":"#0f100f","--dsw-alias-card-tile-fill":"#121312","--dsw-alias-settings-card-fill":"#0f100f","--dsw-alias-settings-card-stroke":"#232423","--dsw-alias-onboarding-card-fill":"#0f100f","--dsw-alias-label-document-preview":"#999999","--dsw-alias-label-primary-bluish":"#c6c6c6","--dsw-alias-label-shimmer":"#7c7c7c","--dsw-alias-label-deep-diving-shimmer":"#7c7c7c","--dsw-alias-label-on-color":"#111111","--dsw-alias-hovercard-label-primary":"#c6c6c6","--dsw-alias-hovercard-label-secondary":"#999999","--dsw-alias-hovercard-label-tertiary":"#7c7c7c","--dsw-alias-hovercard-state-error":"#d0342d","--dsw-alias-hovercard-state-done":"#3fb950","--dsw-alias-bg-mask-1":"#070807","--dsw-alias-bg-mask-2":"#070807","--dsw-alias-bg-mask-3":"#070807","--dsw-alias-bg-mask-photo":"#070807","--dsw-alias-bg-document-selection":"#282928","--dsw-alias-button-info-fill":"#e8e8e8","--dsw-alias-button-info-hover":"#e8e8e8","--dsw-alias-button-tool-bar-fill":"#181918","--dsw-alias-button-tool-bar-fill-invisible":"#070807","--dsw-alias-button-tool-bar-hover":"#1e1f1e","--dsw-alias-chart-tools":"#7c7c7c","--dsw-alias-chart-messages":"#999999","--dsw-alias-chart-system":"#e8e8e8","--dsw-alias-illustration-surface":"#121312","--dsw-alias-illustration-shadow":"#232423","--dsw-alias-illustration-backing":"#161716","--dsw-alias-trajectory-accent":"#e8e8e8","--dsw-alias-menu-icon":"#999999","--dsw-alias-tooltip-label":"#111111","--dsw-alias-tooltip-key-bg":"#161716","--dsw-alias-toast-action":"#e8e8e8","--dsw-alias-onboarding-accent":"#e8e8e8","--dsw-alias-onboarding-checkbox-border":"#2b2c2b","--dsw-alias-turn-trigger-bg":"#161716","--dsw-alias-turn-trigger-bg-hover":"#1a1b1a","--dsw-alias-file-diff-added-gutter":"#0f1f12","--dsw-alias-file-diff-deleted-gutter":"#210f0d","--dsw-alias-file-diff-added-marker":"#132a16","--dsw-alias-file-diff-deleted-marker":"#2d120f","--dsw-alias-bg-document-preview":"#121312","--dsw-alias-bg-multi-select":"#161716","--dsw-alias-border-l2-darkmode-thin":"#1b1c1b","--dsw-alias-card-fill-hover":"#191b19","--dsw-alias-hovercard-bg":"#1c1d1c","--dsw-alias-illustration-background":"#0f100f","--dsw-alias-illustration-detail":"#999999","--dsw-alias-illustration-inset":"#161716","--dsw-alias-json-tree-string":"#3fb950","--dsw-alias-label-deep-diving":"#7c7c7c","--dsw-alias-onboarding-secondary-fill":"#121312","--dsw-alias-state-business-tertiary":"#fafafa","--dsw-specific-bubble-highlight":"#212321","--dsw-specific-file-upload-track":"#121312","--dsw-specific-guide-hero":"#0f100f","--dsw-specific-login-input":"#121312","--dsw-specific-sidebar-glass-fill":"#181a18","--dsw-specific-sidebar-glass-hover":"#141514","--dsw-specific-sidebar-glass-collapsed-fill":"#161716","--dsw-specific-sidebar-glass-collapsed-hover":"#141514","--dsw-specific-sidebar-nav-item-active-accent":"#e8e8e8","--dsw-specific-sidebar-right-flash":"#cfcfcf","--dsw-specific-sidebar-tint":"#111211","--dsw-specific-sidebar-wash-top":"#111211","--dsw-specific-sidebar-wash-top-clear":"#111211","--dsw-specific-sidebar-wash-bottom":"#111211","--dsw-specific-sidebar-wash-bottom-clear":"#111211","--dsw-alias-brand-primary-new-colorprimary-new-color":"#e8e8e8","--dsw-linear-gradient-think":"linear-gradient(180deg, #090a09 20.19%, #090a0900 100%)","--dsw-linear-think-select":"linear-gradient(180deg, #121312 20.19%, #12131200 100%)"},"light":{"--dsw-alias-bg-base":"#f4f4f4","--dsw-alias-bg-layer-1":"#f0f0f0","--dsw-alias-bg-layer-2":"#eeeeee","--dsw-alias-bg-layer-3":"#ececec","--dsw-alias-bg-layer-4":"#ebebeb","--dsw-alias-bg-overlay":"#ececec","--dsw-alias-bg-skeleton":"#ececec","--dsw-alias-bg-module-platform":"#eeeeee","--dsw-alias-bg-mask-drop":"#c3c3c3","--dsw-alias-label-primary":"#373737","--dsw-alias-label-primary-dimmed":"#1b1b1b","--dsw-alias-label-primary-foreground":"#ffffff","--dsw-alias-label-primary-inverted":"#1b1b1b","--dsw-alias-label-secondary":"#5f5f5f","--dsw-alias-label-tertiary":"#707070","--dsw-alias-label-caption":"#707070","--dsw-alias-label-dimmed":"#6f6f6f","--dsw-alias-label-error":"#d12222","--dsw-alias-brand-primary":"#1f1f1f","--dsw-alias-brand-primary-invert":"#1f1f1f","--dsw-alias-brand-text":"#1f1f1f","--dsw-alias-link":"#1f1f1f","--dsw-alias-border-l1":"#e5e5e5","--dsw-alias-border-l2":"#dfdfdf","--dsw-alias-border-l3":"#dadada","--dsw-alias-border-l4":"#d2d2d2","--dsw-alias-interactive-bg-hover":"#ececec","--dsw-alias-interactive-bg-hover-solid":"#e9e9e9","--dsw-alias-interactive-bg-active":"#e7e7e7","--dsw-alias-interactive-bg-hover-accent":"#dfdfdf","--dsw-alias-interactive-bg-hover-danger":"#f2dfdf","--dsw-alias-button-primary-fill":"#1f1f1f","--dsw-alias-button-primary-hover":"#1f1f1f","--dsw-alias-button-primary-dimmed":"#dadada","--dsw-alias-button-elevated-fill":"#f0f0f0","--dsw-alias-button-floating-fill":"#eeeeee","--dsw-alias-button-floating-hover":"#e9e9e9","--dsw-alias-button-contrast-fill":"#535353","--dsw-alias-button-ghost-active-fill":"#ebebeb","--dsw-alias-button-ghost-active-hover":"#e7e7e7","--dsw-alias-button-ghost-active-border":"#dddddd","--dsw-alias-state-error-primary":"#d12222","--dsw-alias-state-error-secondary":"#f1dbdb","--dsw-alias-state-success-primary":"#2a7c35","--dsw-alias-state-warn-primary":"#92400e","--dsw-alias-state-warn-label":"#92400e","--dsw-alias-markdown-code-block":"#eeeeee","--dsw-alias-markdown-code-block-banner":"#ececec","--dsw-alias-markdown-citation":"#eeeeee","--dsw-alias-markdown-placeholder":"#ececec","--dsw-alias-markdown-tag":"#ebebeb","--dsw-alias-markdown-code-segment-selected":"#ececec","--dsw-alias-markdown-code-segment-unselected":"#f0f0f0","--dsw-alias-scrollbar-bg-l1":"#ebebeb","--dsw-alias-scrollbar-bg-l2":"#e5e5e5","--dsw-alias-scrollbar-hover-l1":"#e1e1e1","--dsw-alias-scrollbar-hover-l2":"#dbdbdb","--dsw-alias-switch-thumb":"#ffffff","--dsw-alias-toast-bg":"#535353","--dsw-alias-toast-label":"#f4f4f4","--dsw-alias-tooltip-bg":"#595959","--dsw-alias-menu-group-header-fill":"#eeeeee","--dsw-menu-surface-fill":"#eeeeee","--dsw-specific-sidebar-fill":"#eeeeee","--dsw-specific-sidebar-nav-item-active":"#e9e9e9","--dsw-specific-bubble":"#eeeeee","--dsw-specific-input-major":"#eeeeee","--dsw-specific-menu":"#eeeeee","--dsw-specific-selector":"#eeeeee","--dsw-specific-tip":"#eeeeee","--dsw-alias-file-diff-added-bg":"#e6efe7","--dsw-alias-file-diff-deleted-bg":"#f2e4e4","--dsw-alias-code-diff-added":"#deede0","--dsw-alias-code-diff-deleted":"#f1dbdb","--dsw-font-markdown-base-strong-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small":"12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11":"11px/14px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16":"16px/24px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4":"600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2":"700 calc(19px + calc(14px - 14px)) / calc(28px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong":"600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic":"italic 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1":"700 calc(21px + calc(14px - 14px)) / calc(30px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3":"700 calc(18px + calc(14px - 14px)) / calc(26px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base":"14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16":"500 16px/24px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12":"12px/18px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong":"600 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24":"600 24px/32px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14":"500 14px/22px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic":"italic 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11":"500 11px/14px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic":"italic 600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic":"italic 600 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table":"min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13":"13px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14":"14px/22px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12":"500 12px/18px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head":"500 min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13":"500 13px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18":"500 16px/28px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family-brand":"\"Manrope\", \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20":"500 20px/28px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-elevation-soft":"0 0 0 .5px rgba(40, 26, 26, 0.15), 0 4px 14px rgba(40, 26, 26, 0.07)","--dsw-elevation-panel":"0 0 0 .5px rgba(40, 26, 26, 0.15), 0 12px 30px rgba(40, 26, 26, 0.09)","--dsw-elevation-prominent":"0 0 0 .5px rgba(40, 26, 26, 0.15), 0 24px 50px rgba(40, 26, 26, 0.11)","--dsw-alias-markdown-inline-code":"#ebebeb","--dsw-alias-json-tree-hover":"#ececec","--dsw-alias-json-tree-property":"#5f5f5f","--dsw-alias-json-tree-punctuation":"#848484","--dsw-alias-json-tree-number":"#1f1f1f","--dsw-alias-json-tree-keyword":"#1f1f1f","--dsw-alias-json-tree-icon":"#848484","--dsw-alias-state-idle-primary":"#848484","--dsw-alias-state-done-primary":"#3fb950","--dsw-alias-state-business-primary":"#1f1f1f","--dsw-alias-state-warn-secondary":"#92400e","--dsw-alias-state-warn-tertiary":"#92400e","--dsw-alias-state-success-secondary":"#3fb950","--dsw-alias-state-success-tertiary":"#3fb950","--dsw-alias-border-selected":"#1f1f1f","--dsw-alias-border-inverted":"#e5e5e5","--dsw-alias-border-inverted2":"#e5e5e5","--dsw-alias-card-fill":"#f0f0f0","--dsw-alias-card-tile-fill":"#eeeeee","--dsw-alias-settings-card-fill":"#f0f0f0","--dsw-alias-settings-card-stroke":"#dfdfdf","--dsw-alias-onboarding-card-fill":"#f0f0f0","--dsw-alias-label-document-preview":"#5f5f5f","--dsw-alias-label-primary-bluish":"#373737","--dsw-alias-label-shimmer":"#848484","--dsw-alias-label-deep-diving-shimmer":"#848484","--dsw-alias-label-on-color":"#ffffff","--dsw-alias-hovercard-label-primary":"#373737","--dsw-alias-hovercard-label-secondary":"#5f5f5f","--dsw-alias-hovercard-label-tertiary":"#848484","--dsw-alias-hovercard-state-error":"#dc2626","--dsw-alias-hovercard-state-done":"#3fb950","--dsw-alias-bg-mask-1":"#c3c3c3","--dsw-alias-bg-mask-2":"#c3c3c3","--dsw-alias-bg-mask-3":"#c3c3c3","--dsw-alias-bg-mask-photo":"#c3c3c3","--dsw-alias-bg-document-selection":"#dfdfdf","--dsw-alias-button-info-fill":"#1f1f1f","--dsw-alias-button-info-hover":"#1f1f1f","--dsw-alias-button-tool-bar-fill":"#eeeeee","--dsw-alias-button-tool-bar-fill-invisible":"#c3c3c3","--dsw-alias-button-tool-bar-hover":"#e9e9e9","--dsw-alias-chart-tools":"#848484","--dsw-alias-chart-messages":"#5f5f5f","--dsw-alias-chart-system":"#1f1f1f","--dsw-alias-illustration-surface":"#eeeeee","--dsw-alias-illustration-shadow":"#dfdfdf","--dsw-alias-illustration-backing":"#ececec","--dsw-alias-trajectory-accent":"#1f1f1f","--dsw-alias-menu-icon":"#5f5f5f","--dsw-alias-tooltip-label":"#ffffff","--dsw-alias-tooltip-key-bg":"#ececec","--dsw-alias-toast-action":"#1f1f1f","--dsw-alias-onboarding-accent":"#1f1f1f","--dsw-alias-onboarding-checkbox-border":"#dadada","--dsw-alias-turn-trigger-bg":"#ececec","--dsw-alias-turn-trigger-bg-hover":"#e9e9e9","--dsw-alias-file-diff-added-gutter":"#e6efe7","--dsw-alias-file-diff-deleted-gutter":"#f2e4e4","--dsw-alias-file-diff-added-marker":"#deede0","--dsw-alias-file-diff-deleted-marker":"#f1dbdb","--dsw-alias-bg-document-preview":"#eeeeee","--dsw-alias-bg-multi-select":"#ececec","--dsw-alias-border-l2-darkmode-thin":"#d7d7d7","--dsw-alias-card-fill-hover":"#f6f6f6","--dsw-alias-hovercard-bg":"#ebebeb","--dsw-alias-illustration-background":"#f0f0f0","--dsw-alias-illustration-detail":"#5f5f5f","--dsw-alias-illustration-inset":"#ececec","--dsw-alias-json-tree-string":"#3fb950","--dsw-alias-label-deep-diving":"#848484","--dsw-alias-onboarding-secondary-fill":"#eeeeee","--dsw-alias-state-business-tertiary":"#4d4d4d","--dsw-specific-bubble-highlight":"#fafafa","--dsw-specific-file-upload-track":"#eeeeee","--dsw-specific-guide-hero":"#f0f0f0","--dsw-specific-login-input":"#eeeeee","--dsw-specific-sidebar-glass-fill":"#f6f6f6","--dsw-specific-sidebar-glass-hover":"#ececec","--dsw-specific-sidebar-glass-collapsed-fill":"#f3f3f3","--dsw-specific-sidebar-glass-collapsed-hover":"#ececec","--dsw-specific-sidebar-nav-item-active-accent":"#1f1f1f","--dsw-specific-sidebar-right-flash":"#050505","--dsw-specific-sidebar-tint":"#eeeeee","--dsw-specific-sidebar-wash-top":"#eeeeee","--dsw-specific-sidebar-wash-top-clear":"#eeeeee","--dsw-specific-sidebar-wash-bottom":"#eeeeee","--dsw-specific-sidebar-wash-bottom-clear":"#eeeeee","--dsw-alias-brand-primary-new-colorprimary-new-color":"#1f1f1f","--dsw-linear-gradient-think":"linear-gradient(180deg, #f4f4f4 20.19%, #f4f4f400 100%)","--dsw-linear-think-select":"linear-gradient(180deg, #eeeeee 20.19%, #eeeeee00 100%)"},"label":"@theme.crt"},"dash":{"dark":{"--dsw-alias-bg-base":"#1a1210","--dsw-alias-bg-layer-1":"#201715","--dsw-alias-bg-layer-2":"#241b18","--dsw-alias-bg-layer-3":"#271f1c","--dsw-alias-bg-layer-4":"#2b221f","--dsw-alias-bg-overlay":"#29211d","--dsw-alias-bg-skeleton":"#251d1a","--dsw-alias-bg-module-platform":"#251d1a","--dsw-alias-bg-mask-drop":"#150e0d","--dsw-alias-label-primary":"#d8c8b8","--dsw-alias-label-primary-dimmed":"#ece0d8","--dsw-alias-label-primary-foreground":"#1a1210","--dsw-alias-label-primary-inverted":"#ece0d8","--dsw-alias-label-secondary":"#a39182","--dsw-alias-label-tertiary":"#9b8d80","--dsw-alias-label-caption":"#958477","--dsw-alias-label-dimmed":"#907f72","--dsw-alias-label-error":"#dc5b5b","--dsw-alias-brand-primary":"#cf8b4d","--dsw-alias-brand-primary-invert":"#cf8b4d","--dsw-alias-brand-text":"#cf8b4d","--dsw-alias-link":"#cf8b4d","--dsw-alias-border-l1":"#2d2421","--dsw-alias-border-l2":"#352b28","--dsw-alias-border-l3":"#3c332e","--dsw-alias-border-l4":"#483e38","--dsw-alias-interactive-bg-hover":"#271f1c","--dsw-alias-interactive-bg-hover-solid":"#2b221f","--dsw-alias-interactive-bg-active":"#2f2622","--dsw-alias-interactive-bg-hover-accent":"#332319","--dsw-alias-interactive-bg-hover-danger":"#341614","--dsw-alias-button-primary-fill":"#cf8b4d","--dsw-alias-button-primary-hover":"#cf8b4d","--dsw-alias-button-primary-dimmed":"#37251a","--dsw-alias-button-elevated-fill":"#241b18","--dsw-alias-button-floating-fill":"#29211d","--dsw-alias-button-floating-hover":"#2f2622","--dsw-alias-button-contrast-fill":"#f0e4da","--dsw-alias-button-ghost-active-fill":"#29211d","--dsw-alias-button-ghost-active-hover":"#2f2622","--dsw-alias-button-ghost-active-border":"#382f2b","--dsw-alias-state-error-primary":"#dc5b5b","--dsw-alias-state-error-secondary":"#3b1716","--dsw-alias-state-success-primary":"#3fb950","--dsw-alias-state-warn-primary":"#f59e0b","--dsw-alias-state-warn-label":"#f59e0b","--dsw-alias-markdown-code-block":"#241b18","--dsw-alias-markdown-code-block-banner":"#29211d","--dsw-alias-markdown-citation":"#251d1a","--dsw-alias-markdown-placeholder":"#271f1c","--dsw-alias-markdown-tag":"#2b221f","--dsw-alias-markdown-code-segment-selected":"#29211d","--dsw-alias-markdown-code-segment-unselected":"#221917","--dsw-alias-scrollbar-bg-l1":"#29211d","--dsw-alias-scrollbar-bg-l2":"#312824","--dsw-alias-scrollbar-hover-l1":"#352b28","--dsw-alias-scrollbar-hover-l2":"#3c332e","--dsw-alias-switch-thumb":"#83766c","--dsw-alias-toast-bg":"#312824","--dsw-alias-toast-label":"#d8c8b8","--dsw-alias-tooltip-bg":"#352b28","--dsw-alias-menu-group-header-fill":"#241b18","--dsw-menu-surface-fill":"#271f1c","--dsw-specific-sidebar-fill":"#221917","--dsw-specific-sidebar-nav-item-active":"#2d2421","--dsw-specific-bubble":"#241b18","--dsw-specific-input-major":"#251d1a","--dsw-specific-menu":"#271f1c","--dsw-specific-selector":"#251d1a","--dsw-specific-tip":"#241b18","--dsw-alias-file-diff-added-bg":"#1e2618","--dsw-alias-file-diff-deleted-bg":"#301514","--dsw-alias-code-diff-added":"#21301c","--dsw-alias-code-diff-deleted":"#3b1716","--dsw-font-markdown-base-strong-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small":"12px/20px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11":"11px/14px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16":"16px/24px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4":"600 14px / calc(24px + calc(14px - 14px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2":"700 calc(19px + calc(14px - 14px)) / calc(28px + calc(14px - 14px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong":"600 14px / calc(24px + calc(14px - 14px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic":"italic 14px / calc(24px + calc(14px - 14px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1":"700 calc(21px + calc(14px - 14px)) / calc(30px + calc(14px - 14px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3":"700 calc(18px + calc(14px - 14px)) / calc(26px + calc(14px - 14px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base":"14px / calc(24px + calc(14px - 14px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16":"500 16px/24px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12":"12px/18px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong":"600 12px/20px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24":"600 24px/32px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14":"500 14px/22px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic":"italic 12px/20px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11":"500 11px/14px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic":"italic 600 14px / calc(24px + calc(14px - 14px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic":"italic 600 12px/20px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table":"min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13":"13px/20px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14":"14px/22px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12":"500 12px/18px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head":"500 min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13":"500 13px/20px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18":"500 16px/28px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family-brand":"\"Manrope\", \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20":"500 20px/28px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-elevation-soft":"0 0 0 .5px rgba(28, 23, 18, 0.20), 0 4px 16px rgba(28, 23, 18, 0.30)","--dsw-elevation-panel":"0 0 0 .5px rgba(28, 23, 18, 0.20), 0 12px 32px rgba(28, 23, 18, 0.40)","--dsw-elevation-prominent":"0 0 0 .5px rgba(28, 23, 18, 0.20), 0 24px 48px rgba(28, 23, 18, 0.50)","--dsw-alias-markdown-inline-code":"#2b221f","--dsw-alias-json-tree-hover":"#271f1c","--dsw-alias-json-tree-property":"#a39182","--dsw-alias-json-tree-punctuation":"#88786b","--dsw-alias-json-tree-number":"#cf8b4d","--dsw-alias-json-tree-keyword":"#cf8b4d","--dsw-alias-json-tree-icon":"#88786b","--dsw-alias-state-idle-primary":"#88786b","--dsw-alias-state-done-primary":"#3fb950","--dsw-alias-state-business-primary":"#cf8b4d","--dsw-alias-state-warn-secondary":"#f59e0b","--dsw-alias-state-warn-tertiary":"#f59e0b","--dsw-alias-state-success-secondary":"#3fb950","--dsw-alias-state-success-tertiary":"#3fb950","--dsw-alias-border-selected":"#cf8b4d","--dsw-alias-border-inverted":"#2d2421","--dsw-alias-border-inverted2":"#2d2421","--dsw-alias-card-fill":"#201715","--dsw-alias-card-tile-fill":"#241b18","--dsw-alias-settings-card-fill":"#201715","--dsw-alias-settings-card-stroke":"#352b28","--dsw-alias-onboarding-card-fill":"#201715","--dsw-alias-label-document-preview":"#a39182","--dsw-alias-label-primary-bluish":"#d8c8b8","--dsw-alias-label-shimmer":"#88786b","--dsw-alias-label-deep-diving-shimmer":"#88786b","--dsw-alias-label-on-color":"#1a1210","--dsw-alias-hovercard-label-primary":"#d8c8b8","--dsw-alias-hovercard-label-secondary":"#a39182","--dsw-alias-hovercard-label-tertiary":"#88786b","--dsw-alias-hovercard-state-error":"#d32f2f","--dsw-alias-hovercard-state-done":"#3fb950","--dsw-alias-bg-mask-1":"#150e0d","--dsw-alias-bg-mask-2":"#150e0d","--dsw-alias-bg-mask-3":"#150e0d","--dsw-alias-bg-mask-photo":"#150e0d","--dsw-alias-bg-document-selection":"#332319","--dsw-alias-button-info-fill":"#cf8b4d","--dsw-alias-button-info-hover":"#cf8b4d","--dsw-alias-button-tool-bar-fill":"#29211d","--dsw-alias-button-tool-bar-fill-invisible":"#150e0d","--dsw-alias-button-tool-bar-hover":"#2f2622","--dsw-alias-chart-tools":"#88786b","--dsw-alias-chart-messages":"#a39182","--dsw-alias-chart-system":"#cf8b4d","--dsw-alias-illustration-surface":"#241b18","--dsw-alias-illustration-shadow":"#352b28","--dsw-alias-illustration-backing":"#271f1c","--dsw-alias-trajectory-accent":"#cf8b4d","--dsw-alias-menu-icon":"#a39182","--dsw-alias-tooltip-label":"#1a1210","--dsw-alias-tooltip-key-bg":"#271f1c","--dsw-alias-toast-action":"#cf8b4d","--dsw-alias-onboarding-accent":"#cf8b4d","--dsw-alias-onboarding-checkbox-border":"#3c332e","--dsw-alias-turn-trigger-bg":"#271f1c","--dsw-alias-turn-trigger-bg-hover":"#2b221f","--dsw-alias-file-diff-added-gutter":"#1e2618","--dsw-alias-file-diff-deleted-gutter":"#301514","--dsw-alias-file-diff-added-marker":"#21301c","--dsw-alias-file-diff-deleted-marker":"#3b1716","--dsw-alias-bg-document-preview":"#241b18","--dsw-alias-bg-multi-select":"#271f1c","--dsw-alias-border-l2-darkmode-thin":"#2c2421","--dsw-alias-card-fill-hover":"#2d221e","--dsw-alias-hovercard-bg":"#2d2421","--dsw-alias-illustration-background":"#201715","--dsw-alias-illustration-detail":"#a39182","--dsw-alias-illustration-inset":"#271f1c","--dsw-alias-json-tree-string":"#3fb950","--dsw-alias-label-deep-diving":"#88786b","--dsw-alias-onboarding-secondary-fill":"#241b18","--dsw-alias-state-business-tertiary":"#e2ba95","--dsw-specific-bubble-highlight":"#362924","--dsw-specific-file-upload-track":"#241b18","--dsw-specific-guide-hero":"#201715","--dsw-specific-login-input":"#241b18","--dsw-specific-sidebar-glass-fill":"#2b201d","--dsw-specific-sidebar-glass-hover":"#251d1a","--dsw-specific-sidebar-glass-collapsed-fill":"#281d1b","--dsw-specific-sidebar-glass-collapsed-hover":"#251d1a","--dsw-specific-sidebar-nav-item-active-accent":"#cf8b4d","--dsw-specific-sidebar-right-flash":"#b87131","--dsw-specific-sidebar-tint":"#221917","--dsw-specific-sidebar-wash-top":"#221917","--dsw-specific-sidebar-wash-top-clear":"#221917","--dsw-specific-sidebar-wash-bottom":"#221917","--dsw-specific-sidebar-wash-bottom-clear":"#221917","--dsw-alias-brand-primary-new-colorprimary-new-color":"#cf8b4d","--dsw-linear-gradient-think":"linear-gradient(180deg, #1a1210 20.19%, #1a121000 100%)","--dsw-linear-think-select":"linear-gradient(180deg, #241b18 20.19%, #241b1800 100%)"},"light":{"--dsw-alias-bg-base":"#ebe5e0","--dsw-alias-bg-layer-1":"#e8e2dc","--dsw-alias-bg-layer-2":"#e6e0da","--dsw-alias-bg-layer-3":"#e5ded9","--dsw-alias-bg-layer-4":"#e3dcd7","--dsw-alias-bg-overlay":"#e5ded9","--dsw-alias-bg-skeleton":"#e5ded9","--dsw-alias-bg-module-platform":"#e6e0da","--dsw-alias-bg-mask-drop":"#bcb7b3","--dsw-alias-label-primary":"#4a3828","--dsw-alias-label-primary-dimmed":"#2c2118","--dsw-alias-label-primary-foreground":"#ffffff","--dsw-alias-label-primary-inverted":"#2c2118","--dsw-alias-label-secondary":"#725d4d","--dsw-alias-label-tertiary":"#6e6157","--dsw-alias-label-caption":"#736256","--dsw-alias-label-dimmed":"#726459","--dsw-alias-label-error":"#c11f1f","--dsw-alias-brand-primary":"#8a512c","--dsw-alias-brand-primary-invert":"#8a512c","--dsw-alias-brand-text":"#8a512c","--dsw-alias-link":"#8a512c","--dsw-alias-border-l1":"#ded7d1","--dsw-alias-border-l2":"#d9d2cc","--dsw-alias-border-l3":"#d4cdc6","--dsw-alias-border-l4":"#cec6bf","--dsw-alias-interactive-bg-hover":"#e5ded9","--dsw-alias-interactive-bg-hover-solid":"#e1dbd5","--dsw-alias-interactive-bg-active":"#e0d9d3","--dsw-alias-interactive-bg-hover-accent":"#e1d6ce","--dsw-alias-interactive-bg-hover-danger":"#ead2cd","--dsw-alias-button-primary-fill":"#8a512c","--dsw-alias-button-primary-hover":"#8a512c","--dsw-alias-button-primary-dimmed":"#dfd3ca","--dsw-alias-button-elevated-fill":"#e8e2dc","--dsw-alias-button-floating-fill":"#e6e0da","--dsw-alias-button-floating-hover":"#e1dbd5","--dsw-alias-button-contrast-fill":"#625244","--dsw-alias-button-ghost-active-fill":"#e3dcd7","--dsw-alias-button-ghost-active-hover":"#e0d9d3","--dsw-alias-button-ghost-active-border":"#d8d0ca","--dsw-alias-state-error-primary":"#c11f1f","--dsw-alias-state-error-secondary":"#e9ceca","--dsw-alias-state-success-primary":"#287532","--dsw-alias-state-warn-primary":"#92400e","--dsw-alias-state-warn-label":"#92400e","--dsw-alias-markdown-code-block":"#e6e0da","--dsw-alias-markdown-code-block-banner":"#e5ded9","--dsw-alias-markdown-citation":"#e6e0da","--dsw-alias-markdown-placeholder":"#e5ded9","--dsw-alias-markdown-tag":"#e3dcd7","--dsw-alias-markdown-code-segment-selected":"#e5ded9","--dsw-alias-markdown-code-segment-unselected":"#e8e2dc","--dsw-alias-scrollbar-bg-l1":"#e3dcd7","--dsw-alias-scrollbar-bg-l2":"#ded7d1","--dsw-alias-scrollbar-hover-l1":"#dbd4ce","--dsw-alias-scrollbar-hover-l2":"#d6cfc8","--dsw-alias-switch-thumb":"#ffffff","--dsw-alias-toast-bg":"#625244","--dsw-alias-toast-label":"#ebe5e0","--dsw-alias-tooltip-bg":"#675749","--dsw-alias-menu-group-header-fill":"#e6e0da","--dsw-menu-surface-fill":"#e6e0da","--dsw-specific-sidebar-fill":"#e6e0da","--dsw-specific-sidebar-nav-item-active":"#e1dbd5","--dsw-specific-bubble":"#e6e0da","--dsw-specific-input-major":"#e6e0da","--dsw-specific-menu":"#e6e0da","--dsw-specific-selector":"#e6e0da","--dsw-specific-tip":"#e6e0da","--dsw-alias-file-diff-added-bg":"#dde1d4","--dsw-alias-file-diff-deleted-bg":"#ead6d1","--dsw-alias-code-diff-added":"#d6e0cf","--dsw-alias-code-diff-deleted":"#e9ceca","--dsw-font-markdown-base-strong-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small":"12px/20px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11":"11px/14px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16":"16px/24px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4":"600 14px / calc(24px + calc(14px - 14px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2":"700 calc(19px + calc(14px - 14px)) / calc(28px + calc(14px - 14px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong":"600 14px / calc(24px + calc(14px - 14px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic":"italic 14px / calc(24px + calc(14px - 14px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1":"700 calc(21px + calc(14px - 14px)) / calc(30px + calc(14px - 14px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3":"700 calc(18px + calc(14px - 14px)) / calc(26px + calc(14px - 14px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base":"14px / calc(24px + calc(14px - 14px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16":"500 16px/24px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12":"12px/18px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong":"600 12px/20px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24":"600 24px/32px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14":"500 14px/22px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic":"italic 12px/20px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11":"500 11px/14px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic":"italic 600 14px / calc(24px + calc(14px - 14px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic":"italic 600 12px/20px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table":"min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13":"13px/20px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14":"14px/22px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12":"500 12px/18px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head":"500 min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13":"500 13px/20px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18":"500 16px/28px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family-brand":"\"Manrope\", \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20":"500 20px/28px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-elevation-soft":"0 0 0 .5px rgba(40, 32, 26, 0.15), 0 4px 14px rgba(40, 32, 26, 0.07)","--dsw-elevation-panel":"0 0 0 .5px rgba(40, 32, 26, 0.15), 0 12px 30px rgba(40, 32, 26, 0.09)","--dsw-elevation-prominent":"0 0 0 .5px rgba(40, 32, 26, 0.15), 0 24px 50px rgba(40, 32, 26, 0.11)","--dsw-alias-markdown-inline-code":"#e3dcd7","--dsw-alias-json-tree-hover":"#e5ded9","--dsw-alias-json-tree-property":"#725d4d","--dsw-alias-json-tree-punctuation":"#907f72","--dsw-alias-json-tree-number":"#8a512c","--dsw-alias-json-tree-keyword":"#8a512c","--dsw-alias-json-tree-icon":"#907f72","--dsw-alias-state-idle-primary":"#907f72","--dsw-alias-state-done-primary":"#3fb950","--dsw-alias-state-business-primary":"#8a512c","--dsw-alias-state-warn-secondary":"#92400e","--dsw-alias-state-warn-tertiary":"#92400e","--dsw-alias-state-success-secondary":"#3fb950","--dsw-alias-state-success-tertiary":"#3fb950","--dsw-alias-border-selected":"#8a512c","--dsw-alias-border-inverted":"#ded7d1","--dsw-alias-border-inverted2":"#ded7d1","--dsw-alias-card-fill":"#e8e2dc","--dsw-alias-card-tile-fill":"#e6e0da","--dsw-alias-settings-card-fill":"#e8e2dc","--dsw-alias-settings-card-stroke":"#d9d2cc","--dsw-alias-onboarding-card-fill":"#e8e2dc","--dsw-alias-label-document-preview":"#725d4d","--dsw-alias-label-primary-bluish":"#4a3828","--dsw-alias-label-shimmer":"#907f72","--dsw-alias-label-deep-diving-shimmer":"#907f72","--dsw-alias-label-on-color":"#ffffff","--dsw-alias-hovercard-label-primary":"#4a3828","--dsw-alias-hovercard-label-secondary":"#725d4d","--dsw-alias-hovercard-label-tertiary":"#907f72","--dsw-alias-hovercard-state-error":"#dc2626","--dsw-alias-hovercard-state-done":"#3fb950","--dsw-alias-bg-mask-1":"#bcb7b3","--dsw-alias-bg-mask-2":"#bcb7b3","--dsw-alias-bg-mask-3":"#bcb7b3","--dsw-alias-bg-mask-photo":"#bcb7b3","--dsw-alias-bg-document-selection":"#e1d6ce","--dsw-alias-button-info-fill":"#8a512c","--dsw-alias-button-info-hover":"#8a512c","--dsw-alias-button-tool-bar-fill":"#e6e0da","--dsw-alias-button-tool-bar-fill-invisible":"#bcb7b3","--dsw-alias-button-tool-bar-hover":"#e1dbd5","--dsw-alias-chart-tools":"#907f72","--dsw-alias-chart-messages":"#725d4d","--dsw-alias-chart-system":"#8a512c","--dsw-alias-illustration-surface":"#e6e0da","--dsw-alias-illustration-shadow":"#d9d2cc","--dsw-alias-illustration-backing":"#e5ded9","--dsw-alias-trajectory-accent":"#8a512c","--dsw-alias-menu-icon":"#725d4d","--dsw-alias-tooltip-label":"#ffffff","--dsw-alias-tooltip-key-bg":"#e5ded9","--dsw-alias-toast-action":"#8a512c","--dsw-alias-onboarding-accent":"#8a512c","--dsw-alias-onboarding-checkbox-border":"#d4cdc6","--dsw-alias-turn-trigger-bg":"#e5ded9","--dsw-alias-turn-trigger-bg-hover":"#e1dbd5","--dsw-alias-file-diff-added-gutter":"#dde1d4","--dsw-alias-file-diff-deleted-gutter":"#ead6d1","--dsw-alias-file-diff-added-marker":"#d6e0cf","--dsw-alias-file-diff-deleted-marker":"#e9ceca","--dsw-alias-bg-document-preview":"#e6e0da","--dsw-alias-bg-multi-select":"#e5ded9","--dsw-alias-border-l2-darkmode-thin":"#d2cac3","--dsw-alias-card-fill-hover":"#ece8e3","--dsw-alias-hovercard-bg":"#e3dcd7","--dsw-alias-illustration-background":"#e8e2dc","--dsw-alias-illustration-detail":"#725d4d","--dsw-alias-illustration-inset":"#e5ded9","--dsw-alias-json-tree-string":"#3fb950","--dsw-alias-label-deep-diving":"#907f72","--dsw-alias-onboarding-secondary-fill":"#e6e0da","--dsw-alias-state-business-tertiary":"#c67c4c","--dsw-specific-bubble-highlight":"#f2efec","--dsw-specific-file-upload-track":"#e6e0da","--dsw-specific-guide-hero":"#e8e2dc","--dsw-specific-login-input":"#e6e0da","--dsw-specific-sidebar-glass-fill":"#ece8e3","--dsw-specific-sidebar-glass-hover":"#e5ded9","--dsw-specific-sidebar-glass-collapsed-fill":"#eae5e0","--dsw-specific-sidebar-glass-collapsed-hover":"#e5ded9","--dsw-specific-sidebar-nav-item-active-accent":"#8a512c","--dsw-specific-sidebar-right-flash":"#633a20","--dsw-specific-sidebar-tint":"#e6e0da","--dsw-specific-sidebar-wash-top":"#e6e0da","--dsw-specific-sidebar-wash-top-clear":"#e6e0da","--dsw-specific-sidebar-wash-bottom":"#e6e0da","--dsw-specific-sidebar-wash-bottom-clear":"#e6e0da","--dsw-alias-brand-primary-new-colorprimary-new-color":"#8a512c","--dsw-linear-gradient-think":"linear-gradient(180deg, #ebe5e0 20.19%, #ebe5e000 100%)","--dsw-linear-think-select":"linear-gradient(180deg, #e6e0da 20.19%, #e6e0da00 100%)"},"label":"@theme.dash"},"knot":{"dark":{"--dsw-alias-bg-base":"#080808","--dsw-alias-bg-layer-1":"#0e0e0e","--dsw-alias-bg-layer-2":"#121212","--dsw-alias-bg-layer-3":"#151516","--dsw-alias-bg-layer-4":"#19191a","--dsw-alias-bg-overlay":"#171718","--dsw-alias-bg-skeleton":"#131314","--dsw-alias-bg-module-platform":"#131314","--dsw-alias-bg-mask-drop":"#060606","--dsw-alias-label-primary":"#c6c6cb","--dsw-alias-label-primary-dimmed":"#f0f0f2","--dsw-alias-label-primary-foreground":"#fafafa","--dsw-alias-label-primary-inverted":"#f0f0f2","--dsw-alias-label-secondary":"#8a8a94","--dsw-alias-label-tertiary":"#7d7d86","--dsw-alias-label-caption":"#7d7d86","--dsw-alias-label-dimmed":"#77777f","--dsw-alias-label-error":"#da4e4e","--dsw-alias-brand-primary":"#d92a3f","--dsw-alias-brand-primary-invert":"#e5243b","--dsw-alias-brand-text":"#d92a3f","--dsw-alias-link":"#d92a3f","--dsw-alias-border-l1":"#1b1b1b","--dsw-alias-border-l2":"#232323","--dsw-alias-border-l3":"#2a2a2b","--dsw-alias-border-l4":"#363637","--dsw-alias-interactive-bg-hover":"#151516","--dsw-alias-interactive-bg-hover-solid":"#19191a","--dsw-alias-interactive-bg-active":"#1d1d1d","--dsw-alias-interactive-bg-hover-accent":"#250d10","--dsw-alias-interactive-bg-hover-danger":"#240d0d","--dsw-alias-button-primary-fill":"#d92a3f","--dsw-alias-button-primary-hover":"#c22537","--dsw-alias-button-primary-dimmed":"#290d11","--dsw-alias-button-elevated-fill":"#121212","--dsw-alias-button-floating-fill":"#171718","--dsw-alias-button-floating-hover":"#1d1d1d","--dsw-alias-button-contrast-fill":"#f5f5f7","--dsw-alias-button-ghost-active-fill":"#171718","--dsw-alias-button-ghost-active-hover":"#1d1d1d","--dsw-alias-button-ghost-active-border":"#262627","--dsw-alias-state-error-primary":"#da4e4e","--dsw-alias-state-error-secondary":"#2d0f0f","--dsw-alias-state-success-primary":"#3fb950","--dsw-alias-state-warn-primary":"#f59e0b","--dsw-alias-state-warn-label":"#f59e0b","--dsw-alias-markdown-code-block":"#121212","--dsw-alias-markdown-code-block-banner":"#171718","--dsw-alias-markdown-citation":"#131314","--dsw-alias-markdown-placeholder":"#151516","--dsw-alias-markdown-tag":"#19191a","--dsw-alias-markdown-code-segment-selected":"#171718","--dsw-alias-markdown-code-segment-unselected":"#101010","--dsw-alias-scrollbar-bg-l1":"#171718","--dsw-alias-scrollbar-bg-l2":"#1f1f1f","--dsw-alias-scrollbar-hover-l1":"#232323","--dsw-alias-scrollbar-hover-l2":"#2a2a2b","--dsw-alias-switch-thumb":"#717173","--dsw-alias-toast-bg":"#1f1f1f","--dsw-alias-toast-label":"#c6c6cb","--dsw-alias-tooltip-bg":"#232323","--dsw-alias-menu-group-header-fill":"#121212","--dsw-menu-surface-fill":"#151516","--dsw-specific-sidebar-fill":"#101010","--dsw-specific-sidebar-nav-item-active":"#1b1b1b","--dsw-specific-bubble":"#121212","--dsw-specific-input-major":"#131314","--dsw-specific-menu":"#151516","--dsw-specific-selector":"#131314","--dsw-specific-tip":"#121212","--dsw-alias-file-diff-added-bg":"#0f1d11","--dsw-alias-file-diff-deleted-bg":"#200d0d","--dsw-alias-code-diff-added":"#122815","--dsw-alias-code-diff-deleted":"#2d0f0f","--dsw-font-markdown-base-strong-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small":"12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11":"11px/14px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16":"16px/24px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4":"600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2":"700 calc(19px + calc(14px - 14px)) / calc(28px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong":"600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic":"italic 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1":"700 calc(21px + calc(14px - 14px)) / calc(30px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3":"700 calc(18px + calc(14px - 14px)) / calc(26px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base":"14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16":"500 16px/24px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12":"12px/18px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong":"600 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24":"600 24px/32px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14":"500 14px/22px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic":"italic 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11":"500 11px/14px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic":"italic 600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic":"italic 600 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table":"min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13":"13px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14":"14px/22px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12":"500 12px/18px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head":"500 min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13":"500 13px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18":"500 16px/28px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family-brand":"\"Manrope\", \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20":"500 20px/28px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-elevation-soft":"0 0 0 .5px rgba(28, 18, 19, 0.20), 0 4px 16px rgba(28, 18, 19, 0.30)","--dsw-elevation-panel":"0 0 0 .5px rgba(28, 18, 19, 0.20), 0 12px 32px rgba(28, 18, 19, 0.40)","--dsw-elevation-prominent":"0 0 0 .5px rgba(28, 18, 19, 0.20), 0 24px 48px rgba(28, 18, 19, 0.50)","--dsw-alias-markdown-inline-code":"#19191a","--dsw-alias-json-tree-hover":"#151516","--dsw-alias-json-tree-property":"#8a8a94","--dsw-alias-json-tree-punctuation":"#707078","--dsw-alias-json-tree-number":"#d92a3f","--dsw-alias-json-tree-keyword":"#d92a3f","--dsw-alias-json-tree-icon":"#707078","--dsw-alias-state-idle-primary":"#707078","--dsw-alias-state-done-primary":"#3fb950","--dsw-alias-state-business-primary":"#d92a3f","--dsw-alias-state-warn-secondary":"#f59e0b","--dsw-alias-state-warn-tertiary":"#f59e0b","--dsw-alias-state-success-secondary":"#3fb950","--dsw-alias-state-success-tertiary":"#3fb950","--dsw-alias-border-selected":"#d92a3f","--dsw-alias-border-inverted":"#1b1b1b","--dsw-alias-border-inverted2":"#1b1b1b","--dsw-alias-card-fill":"#0e0e0e","--dsw-alias-card-tile-fill":"#121212","--dsw-alias-settings-card-fill":"#0e0e0e","--dsw-alias-settings-card-stroke":"#232323","--dsw-alias-onboarding-card-fill":"#0e0e0e","--dsw-alias-label-document-preview":"#8a8a94","--dsw-alias-label-primary-bluish":"#c6c6cb","--dsw-alias-label-shimmer":"#707078","--dsw-alias-label-deep-diving-shimmer":"#707078","--dsw-alias-label-on-color":"#fafafa","--dsw-alias-hovercard-label-primary":"#c6c6cb","--dsw-alias-hovercard-label-secondary":"#8a8a94","--dsw-alias-hovercard-label-tertiary":"#707078","--dsw-alias-hovercard-state-error":"#d32f2f","--dsw-alias-hovercard-state-done":"#3fb950","--dsw-alias-bg-mask-1":"#060606","--dsw-alias-bg-mask-2":"#060606","--dsw-alias-bg-mask-3":"#060606","--dsw-alias-bg-mask-photo":"#060606","--dsw-alias-bg-document-selection":"#250d10","--dsw-alias-button-info-fill":"#d92a3f","--dsw-alias-button-info-hover":"#e5243b","--dsw-alias-button-tool-bar-fill":"#171718","--dsw-alias-button-tool-bar-fill-invisible":"#060606","--dsw-alias-button-tool-bar-hover":"#1d1d1d","--dsw-alias-chart-tools":"#707078","--dsw-alias-chart-messages":"#8a8a94","--dsw-alias-chart-system":"#d92a3f","--dsw-alias-illustration-surface":"#121212","--dsw-alias-illustration-shadow":"#232323","--dsw-alias-illustration-backing":"#151516","--dsw-alias-trajectory-accent":"#d92a3f","--dsw-alias-menu-icon":"#8a8a94","--dsw-alias-tooltip-label":"#fafafa","--dsw-alias-tooltip-key-bg":"#151516","--dsw-alias-toast-action":"#d92a3f","--dsw-alias-onboarding-accent":"#d92a3f","--dsw-alias-onboarding-checkbox-border":"#2a2a2b","--dsw-alias-turn-trigger-bg":"#151516","--dsw-alias-turn-trigger-bg-hover":"#19191a","--dsw-alias-file-diff-added-gutter":"#0f1d11","--dsw-alias-file-diff-deleted-gutter":"#200d0d","--dsw-alias-file-diff-added-marker":"#122815","--dsw-alias-file-diff-deleted-marker":"#2d0f0f","--dsw-alias-bg-document-preview":"#121212","--dsw-alias-bg-multi-select":"#151516","--dsw-alias-border-l2-darkmode-thin":"#1b1b1b","--dsw-alias-card-fill-hover":"#1a1a1a","--dsw-alias-hovercard-bg":"#1b1b1b","--dsw-alias-illustration-background":"#0e0e0e","--dsw-alias-illustration-detail":"#8a8a94","--dsw-alias-illustration-inset":"#151516","--dsw-alias-json-tree-string":"#3fb950","--dsw-alias-label-deep-diving":"#707078","--dsw-alias-onboarding-secondary-fill":"#121212","--dsw-alias-state-business-tertiary":"#e77885","--dsw-specific-bubble-highlight":"#212121","--dsw-specific-file-upload-track":"#121212","--dsw-specific-guide-hero":"#0e0e0e","--dsw-specific-login-input":"#121212","--dsw-specific-sidebar-glass-fill":"#181818","--dsw-specific-sidebar-glass-hover":"#131314","--dsw-specific-sidebar-glass-collapsed-fill":"#151515","--dsw-specific-sidebar-glass-collapsed-hover":"#131314","--dsw-specific-sidebar-nav-item-active-accent":"#d92a3f","--dsw-specific-sidebar-right-flash":"#b11f31","--dsw-specific-sidebar-tint":"#101010","--dsw-specific-sidebar-wash-top":"#101010","--dsw-specific-sidebar-wash-top-clear":"#101010","--dsw-specific-sidebar-wash-bottom":"#101010","--dsw-specific-sidebar-wash-bottom-clear":"#101010","--dsw-alias-brand-primary-new-colorprimary-new-color":"#d92a3f","--dsw-linear-gradient-think":"linear-gradient(180deg, #080808 20.19%, #08080800 100%)","--dsw-linear-think-select":"linear-gradient(180deg, #121212 20.19%, #12121200 100%)"},"light":{"--dsw-alias-bg-base":"#f4f4f7","--dsw-alias-bg-layer-1":"#f0f0f3","--dsw-alias-bg-layer-2":"#eeeef2","--dsw-alias-bg-layer-3":"#ededf0","--dsw-alias-bg-layer-4":"#ebebee","--dsw-alias-bg-overlay":"#ededf0","--dsw-alias-bg-skeleton":"#ededf0","--dsw-alias-bg-module-platform":"#eeeef2","--dsw-alias-bg-mask-drop":"#c3c3c6","--dsw-alias-label-primary":"#3a3a42","--dsw-alias-label-primary-dimmed":"#18181b","--dsw-alias-label-primary-foreground":"#ffffff","--dsw-alias-label-primary-inverted":"#18181b","--dsw-alias-label-secondary":"#68676f","--dsw-alias-label-tertiary":"#6d6b72","--dsw-alias-label-caption":"#6e6d73","--dsw-alias-label-dimmed":"#706f77","--dsw-alias-label-error":"#d12222","--dsw-alias-brand-primary":"#c41e30","--dsw-alias-brand-primary-invert":"#c41e30","--dsw-alias-brand-text":"#c41e30","--dsw-alias-link":"#c41e30","--dsw-alias-border-l1":"#e5e5e9","--dsw-alias-border-l2":"#e0e0e3","--dsw-alias-border-l3":"#dadade","--dsw-alias-border-l4":"#d3d3d6","--dsw-alias-interactive-bg-hover":"#ededf0","--dsw-alias-interactive-bg-hover-solid":"#e9e9ec","--dsw-alias-interactive-bg-active":"#e7e7ea","--dsw-alias-interactive-bg-hover-accent":"#efdfe3","--dsw-alias-interactive-bg-hover-danger":"#f2dfe2","--dsw-alias-button-primary-fill":"#c41e30","--dsw-alias-button-primary-hover":"#c41e30","--dsw-alias-button-primary-dimmed":"#eedadf","--dsw-alias-button-elevated-fill":"#f0f0f3","--dsw-alias-button-floating-fill":"#eeeef2","--dsw-alias-button-floating-hover":"#e9e9ec","--dsw-alias-button-contrast-fill":"#56565d","--dsw-alias-button-ghost-active-fill":"#ebebee","--dsw-alias-button-ghost-active-hover":"#e7e7ea","--dsw-alias-button-ghost-active-border":"#dedee1","--dsw-alias-state-error-primary":"#d12222","--dsw-alias-state-error-secondary":"#f1dbde","--dsw-alias-state-success-primary":"#2a7c35","--dsw-alias-state-warn-primary":"#92400e","--dsw-alias-state-warn-label":"#92400e","--dsw-alias-markdown-code-block":"#eeeef2","--dsw-alias-markdown-code-block-banner":"#ededf0","--dsw-alias-markdown-citation":"#eeeef2","--dsw-alias-markdown-placeholder":"#ededf0","--dsw-alias-markdown-tag":"#ebebee","--dsw-alias-markdown-code-segment-selected":"#ededf0","--dsw-alias-markdown-code-segment-unselected":"#f0f0f3","--dsw-alias-scrollbar-bg-l1":"#ebebee","--dsw-alias-scrollbar-bg-l2":"#e5e5e9","--dsw-alias-scrollbar-hover-l1":"#e1e1e5","--dsw-alias-scrollbar-hover-l2":"#dcdcdf","--dsw-alias-switch-thumb":"#ffffff","--dsw-alias-toast-bg":"#56565d","--dsw-alias-toast-label":"#f4f4f7","--dsw-alias-tooltip-bg":"#5b5b63","--dsw-alias-menu-group-header-fill":"#eeeef2","--dsw-menu-surface-fill":"#eeeef2","--dsw-specific-sidebar-fill":"#eeeef2","--dsw-specific-sidebar-nav-item-active":"#e9e9ec","--dsw-specific-bubble":"#eeeef2","--dsw-specific-input-major":"#eeeef2","--dsw-specific-menu":"#eeeef2","--dsw-specific-selector":"#eeeef2","--dsw-specific-tip":"#eeeef2","--dsw-alias-file-diff-added-bg":"#e6efea","--dsw-alias-file-diff-deleted-bg":"#f2e4e6","--dsw-alias-code-diff-added":"#deede3","--dsw-alias-code-diff-deleted":"#f1dbde","--dsw-font-markdown-base-strong-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small":"12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11":"11px/14px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16":"16px/24px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4":"600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2":"700 calc(19px + calc(14px - 14px)) / calc(28px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong":"600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic":"italic 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1":"700 calc(21px + calc(14px - 14px)) / calc(30px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3":"700 calc(18px + calc(14px - 14px)) / calc(26px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base":"14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16":"500 16px/24px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12":"12px/18px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong":"600 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24":"600 24px/32px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14":"500 14px/22px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic":"italic 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11":"500 11px/14px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic":"italic 600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic":"italic 600 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table":"min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13":"13px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14":"14px/22px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12":"500 12px/18px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head":"500 min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13":"500 13px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18":"500 16px/28px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family-brand":"\"Manrope\", \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20":"500 20px/28px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-elevation-soft":"0 0 0 .5px rgba(40, 26, 27, 0.15), 0 4px 14px rgba(40, 26, 27, 0.07)","--dsw-elevation-panel":"0 0 0 .5px rgba(40, 26, 27, 0.15), 0 12px 30px rgba(40, 26, 27, 0.09)","--dsw-elevation-prominent":"0 0 0 .5px rgba(40, 26, 27, 0.15), 0 24px 50px rgba(40, 26, 27, 0.11)","--dsw-alias-markdown-inline-code":"#ebebee","--dsw-alias-json-tree-hover":"#ededf0","--dsw-alias-json-tree-property":"#68676f","--dsw-alias-json-tree-punctuation":"#8b8a91","--dsw-alias-json-tree-number":"#c41e30","--dsw-alias-json-tree-keyword":"#c41e30","--dsw-alias-json-tree-icon":"#8b8a91","--dsw-alias-state-idle-primary":"#8b8a91","--dsw-alias-state-done-primary":"#3fb950","--dsw-alias-state-business-primary":"#c41e30","--dsw-alias-state-warn-secondary":"#92400e","--dsw-alias-state-warn-tertiary":"#92400e","--dsw-alias-state-success-secondary":"#3fb950","--dsw-alias-state-success-tertiary":"#3fb950","--dsw-alias-border-selected":"#c41e30","--dsw-alias-border-inverted":"#e5e5e9","--dsw-alias-border-inverted2":"#e5e5e9","--dsw-alias-card-fill":"#f0f0f3","--dsw-alias-card-tile-fill":"#eeeef2","--dsw-alias-settings-card-fill":"#f0f0f3","--dsw-alias-settings-card-stroke":"#e0e0e3","--dsw-alias-onboarding-card-fill":"#f0f0f3","--dsw-alias-label-document-preview":"#68676f","--dsw-alias-label-primary-bluish":"#3a3a42","--dsw-alias-label-shimmer":"#8b8a91","--dsw-alias-label-deep-diving-shimmer":"#8b8a91","--dsw-alias-label-on-color":"#ffffff","--dsw-alias-hovercard-label-primary":"#3a3a42","--dsw-alias-hovercard-label-secondary":"#68676f","--dsw-alias-hovercard-label-tertiary":"#8b8a91","--dsw-alias-hovercard-state-error":"#dc2626","--dsw-alias-hovercard-state-done":"#3fb950","--dsw-alias-bg-mask-1":"#c3c3c6","--dsw-alias-bg-mask-2":"#c3c3c6","--dsw-alias-bg-mask-3":"#c3c3c6","--dsw-alias-bg-mask-photo":"#c3c3c6","--dsw-alias-bg-document-selection":"#efdfe3","--dsw-alias-button-info-fill":"#c41e30","--dsw-alias-button-info-hover":"#c41e30","--dsw-alias-button-tool-bar-fill":"#eeeef2","--dsw-alias-button-tool-bar-fill-invisible":"#c3c3c6","--dsw-alias-button-tool-bar-hover":"#e9e9ec","--dsw-alias-chart-tools":"#8b8a91","--dsw-alias-chart-messages":"#68676f","--dsw-alias-chart-system":"#c41e30","--dsw-alias-illustration-surface":"#eeeef2","--dsw-alias-illustration-shadow":"#e0e0e3","--dsw-alias-illustration-backing":"#ededf0","--dsw-alias-trajectory-accent":"#c41e30","--dsw-alias-menu-icon":"#68676f","--dsw-alias-tooltip-label":"#ffffff","--dsw-alias-tooltip-key-bg":"#ededf0","--dsw-alias-toast-action":"#c41e30","--dsw-alias-onboarding-accent":"#c41e30","--dsw-alias-onboarding-checkbox-border":"#dadade","--dsw-alias-turn-trigger-bg":"#ededf0","--dsw-alias-turn-trigger-bg-hover":"#e9e9ec","--dsw-alias-file-diff-added-gutter":"#e6efea","--dsw-alias-file-diff-deleted-gutter":"#f2e4e6","--dsw-alias-file-diff-added-marker":"#deede3","--dsw-alias-file-diff-deleted-marker":"#f1dbde","--dsw-alias-bg-document-preview":"#eeeef2","--dsw-alias-bg-multi-select":"#ededf0","--dsw-alias-border-l2-darkmode-thin":"#d8d8dc","--dsw-alias-card-fill-hover":"#f7f7f9","--dsw-alias-hovercard-bg":"#ebebee","--dsw-alias-illustration-background":"#f0f0f3","--dsw-alias-illustration-detail":"#68676f","--dsw-alias-illustration-inset":"#ededf0","--dsw-alias-json-tree-string":"#3fb950","--dsw-alias-label-deep-diving":"#8b8a91","--dsw-alias-onboarding-secondary-fill":"#eeeef2","--dsw-alias-state-business-tertiary":"#e55868","--dsw-specific-bubble-highlight":"#f9f9fb","--dsw-specific-file-upload-track":"#eeeef2","--dsw-specific-guide-hero":"#f0f0f3","--dsw-specific-login-input":"#eeeef2","--dsw-specific-sidebar-glass-fill":"#f7f7f9","--dsw-specific-sidebar-glass-hover":"#ededf0","--dsw-specific-sidebar-glass-collapsed-fill":"#f4f4f6","--dsw-specific-sidebar-glass-collapsed-hover":"#ededf0","--dsw-specific-sidebar-nav-item-active-accent":"#c41e30","--dsw-specific-sidebar-right-flash":"#981725","--dsw-specific-sidebar-tint":"#eeeef2","--dsw-specific-sidebar-wash-top":"#eeeef2","--dsw-specific-sidebar-wash-top-clear":"#eeeef2","--dsw-specific-sidebar-wash-bottom":"#eeeef2","--dsw-specific-sidebar-wash-bottom-clear":"#eeeef2","--dsw-alias-brand-primary-new-colorprimary-new-color":"#c41e30","--dsw-linear-gradient-think":"linear-gradient(180deg, #f4f4f7 20.19%, #f4f4f700 100%)","--dsw-linear-think-select":"linear-gradient(180deg, #eeeef2 20.19%, #eeeef200 100%)"},"label":"@theme.knot"},"manuscript":{"dark":{"--dsw-alias-bg-base":"#211e18","--dsw-alias-bg-layer-1":"#26231d","--dsw-alias-bg-layer-2":"#2a2720","--dsw-alias-bg-layer-3":"#2e2a23","--dsw-alias-bg-layer-4":"#312e27","--dsw-alias-bg-overlay":"#302c25","--dsw-alias-bg-skeleton":"#2c2922","--dsw-alias-bg-module-platform":"#2c2922","--dsw-alias-bg-mask-drop":"#1a1813","--dsw-alias-label-primary":"#d8d0bc","--dsw-alias-label-primary-dimmed":"#efe8d6","--dsw-alias-label-primary-foreground":"#101c33","--dsw-alias-label-primary-inverted":"#efe8d6","--dsw-alias-label-secondary":"#ab9f84","--dsw-alias-label-tertiary":"#948c75","--dsw-alias-label-caption":"#9d9279","--dsw-alias-label-dimmed":"#938872","--dsw-alias-label-error":"#db6f67","--dsw-alias-brand-primary":"#8fa8e0","--dsw-alias-brand-primary-invert":"#8fa8e0","--dsw-alias-brand-text":"#8fa8e0","--dsw-alias-link":"#8fa8e0","--dsw-alias-border-l1":"#333028","--dsw-alias-border-l2":"#3b372f","--dsw-alias-border-l3":"#423e36","--dsw-alias-border-l4":"#4d493f","--dsw-alias-interactive-bg-hover":"#2e2a23","--dsw-alias-interactive-bg-hover-solid":"#312e27","--dsw-alias-interactive-bg-active":"#35322a","--dsw-alias-interactive-bg-hover-accent":"#303134","--dsw-alias-interactive-bg-hover-danger":"#39221b","--dsw-alias-button-primary-fill":"#8fa8e0","--dsw-alias-button-primary-hover":"#a8bce9","--dsw-alias-button-primary-dimmed":"#333438","--dsw-alias-button-elevated-fill":"#2a2720","--dsw-alias-button-floating-fill":"#302c25","--dsw-alias-button-floating-hover":"#35322a","--dsw-alias-button-contrast-fill":"#efe8d6","--dsw-alias-button-ghost-active-fill":"#302c25","--dsw-alias-button-ghost-active-hover":"#35322a","--dsw-alias-button-ghost-active-border":"#3e3a32","--dsw-alias-state-error-primary":"#db6f67","--dsw-alias-state-error-secondary":"#3f231c","--dsw-alias-state-success-primary":"#3fb950","--dsw-alias-state-warn-primary":"#f59e0b","--dsw-alias-state-warn-label":"#f59e0b","--dsw-alias-markdown-code-block":"#2a2720","--dsw-alias-markdown-code-block-banner":"#302c25","--dsw-alias-markdown-citation":"#2c2922","--dsw-alias-markdown-placeholder":"#2e2a23","--dsw-alias-markdown-tag":"#312e27","--dsw-alias-markdown-code-segment-selected":"#302c25","--dsw-alias-markdown-code-segment-unselected":"#28251f","--dsw-alias-scrollbar-bg-l1":"#302c25","--dsw-alias-scrollbar-bg-l2":"#37332c","--dsw-alias-scrollbar-hover-l1":"#3b372f","--dsw-alias-scrollbar-hover-l2":"#423e36","--dsw-alias-switch-thumb":"#868072","--dsw-alias-toast-bg":"#37332c","--dsw-alias-toast-label":"#d8d0bc","--dsw-alias-tooltip-bg":"#3b372f","--dsw-alias-menu-group-header-fill":"#2a2720","--dsw-menu-surface-fill":"#2e2a23","--dsw-specific-sidebar-fill":"#28251f","--dsw-specific-sidebar-nav-item-active":"#333028","--dsw-specific-bubble":"#2a2720","--dsw-specific-input-major":"#2c2922","--dsw-specific-menu":"#2e2a23","--dsw-specific-selector":"#2c2922","--dsw-specific-tip":"#2a2720","--dsw-alias-file-diff-added-bg":"#25311f","--dsw-alias-file-diff-deleted-bg":"#35211b","--dsw-alias-code-diff-added":"#263a22","--dsw-alias-code-diff-deleted":"#3f231c","--dsw-font-markdown-base-strong-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-small":"12px/20px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-m-18-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-table-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xxxs-11":"11px/14px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-base-16":"16px/24px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-h4":"600 14px / calc(24px + calc(14px - 14px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-small-strong-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-h2":"700 calc(19px + calc(14px - 14px)) / calc(28px + calc(14px - 14px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-base-strong":"600 14px / calc(24px + calc(14px - 14px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-small-strong-italic-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-base-italic-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-base-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xxxs-strong-11-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-base-italic":"italic 14px / calc(24px + calc(14px - 14px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-h1":"700 calc(21px + calc(14px - 14px)) / calc(30px + calc(14px - 14px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-small-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-s-14-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-h3":"700 calc(18px + calc(14px - 14px)) / calc(26px + calc(14px - 14px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xxxs-11-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-base":"14px / calc(24px + calc(14px - 14px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xs-strong-13-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-base-strong-16":"500 16px/24px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xxs-12":"12px/18px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-small-strong":"600 12px/20px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-base-strong-16-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-s-strong-14-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xl-24":"600 24px/32px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-s-strong-14":"500 14px/22px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-base-strong-italic-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-l-20-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xxs-strong-12-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-small-italic":"italic 12px/20px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xxxs-strong-11":"500 11px/14px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xs-13-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-base-strong-italic":"italic 600 14px / calc(24px + calc(14px - 14px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-small-strong-italic":"italic 600 12px/20px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-table":"min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-h2-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xl-24-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xs-13":"13px/20px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-base-16-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-s-14":"14px/22px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-h1-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-table-head-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-h3-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xxs-strong-12":"500 12px/18px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-table-head":"500 min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xs-strong-13":"500 13px/20px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-m-18":"500 16px/28px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-small-italic-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-family-brand":"\"Manrope\", \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-l-20":"500 20px/28px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-h4-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xxs-12-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-elevation-soft":"0 0 0 .5px rgba(18, 21, 28, 0.20), 0 4px 16px rgba(18, 21, 28, 0.30)","--dsw-elevation-panel":"0 0 0 .5px rgba(18, 21, 28, 0.20), 0 12px 32px rgba(18, 21, 28, 0.40)","--dsw-elevation-prominent":"0 0 0 .5px rgba(18, 21, 28, 0.20), 0 24px 48px rgba(18, 21, 28, 0.50)","--dsw-alias-markdown-inline-code":"#312e27","--dsw-alias-json-tree-hover":"#2e2a23","--dsw-alias-json-tree-property":"#ab9f84","--dsw-alias-json-tree-punctuation":"#8f856e","--dsw-alias-json-tree-number":"#8fa8e0","--dsw-alias-json-tree-keyword":"#8fa8e0","--dsw-alias-json-tree-icon":"#8f856e","--dsw-alias-state-idle-primary":"#8f856e","--dsw-alias-state-done-primary":"#3fb950","--dsw-alias-state-business-primary":"#8fa8e0","--dsw-alias-state-warn-secondary":"#f59e0b","--dsw-alias-state-warn-tertiary":"#f59e0b","--dsw-alias-state-success-secondary":"#3fb950","--dsw-alias-state-success-tertiary":"#3fb950","--dsw-alias-border-selected":"#8fa8e0","--dsw-alias-border-inverted":"#333028","--dsw-alias-border-inverted2":"#333028","--dsw-alias-card-fill":"#26231d","--dsw-alias-card-tile-fill":"#2a2720","--dsw-alias-settings-card-fill":"#26231d","--dsw-alias-settings-card-stroke":"#3b372f","--dsw-alias-onboarding-card-fill":"#26231d","--dsw-alias-label-document-preview":"#ab9f84","--dsw-alias-label-primary-bluish":"#d8d0bc","--dsw-alias-label-shimmer":"#8f856e","--dsw-alias-label-deep-diving-shimmer":"#8f856e","--dsw-alias-label-on-color":"#101c33","--dsw-alias-hovercard-label-primary":"#d8d0bc","--dsw-alias-hovercard-label-secondary":"#ab9f84","--dsw-alias-hovercard-label-tertiary":"#8f856e","--dsw-alias-hovercard-state-error":"#c93a30","--dsw-alias-hovercard-state-done":"#3fb950","--dsw-alias-bg-mask-1":"#1a1813","--dsw-alias-bg-mask-2":"#1a1813","--dsw-alias-bg-mask-3":"#1a1813","--dsw-alias-bg-mask-photo":"#1a1813","--dsw-alias-bg-document-selection":"#303134","--dsw-alias-button-info-fill":"#8fa8e0","--dsw-alias-button-info-hover":"#8fa8e0","--dsw-alias-button-tool-bar-fill":"#302c25","--dsw-alias-button-tool-bar-fill-invisible":"#1a1813","--dsw-alias-button-tool-bar-hover":"#35322a","--dsw-alias-chart-tools":"#8f856e","--dsw-alias-chart-messages":"#ab9f84","--dsw-alias-chart-system":"#8fa8e0","--dsw-alias-illustration-surface":"#2a2720","--dsw-alias-illustration-shadow":"#3b372f","--dsw-alias-illustration-backing":"#2e2a23","--dsw-alias-trajectory-accent":"#8fa8e0","--dsw-alias-menu-icon":"#ab9f84","--dsw-alias-tooltip-label":"#101c33","--dsw-alias-tooltip-key-bg":"#2e2a23","--dsw-alias-toast-action":"#8fa8e0","--dsw-alias-onboarding-accent":"#8fa8e0","--dsw-alias-onboarding-checkbox-border":"#423e36","--dsw-alias-turn-trigger-bg":"#2e2a23","--dsw-alias-turn-trigger-bg-hover":"#312e27","--dsw-alias-file-diff-added-gutter":"#25311f","--dsw-alias-file-diff-deleted-gutter":"#35211b","--dsw-alias-file-diff-added-marker":"#263a22","--dsw-alias-file-diff-deleted-marker":"#3f231c","--dsw-alias-bg-document-preview":"#2a2720","--dsw-alias-bg-multi-select":"#2e2a23","--dsw-alias-border-l2-darkmode-thin":"#322f28","--dsw-alias-card-fill-hover":"#332f27","--dsw-alias-hovercard-bg":"#333028","--dsw-alias-illustration-background":"#26231d","--dsw-alias-illustration-detail":"#ab9f84","--dsw-alias-illustration-inset":"#2e2a23","--dsw-alias-json-tree-string":"#3fb950","--dsw-alias-label-deep-diving":"#8f856e","--dsw-alias-onboarding-secondary-fill":"#2a2720","--dsw-alias-state-business-tertiary":"#d7e0f4","--dsw-specific-bubble-highlight":"#3b372d","--dsw-specific-file-upload-track":"#2a2720","--dsw-specific-guide-hero":"#26231d","--dsw-specific-login-input":"#2a2720","--dsw-specific-sidebar-glass-fill":"#312d26","--dsw-specific-sidebar-glass-hover":"#2c2922","--dsw-specific-sidebar-glass-collapsed-fill":"#2e2a23","--dsw-specific-sidebar-glass-collapsed-hover":"#2c2922","--dsw-specific-sidebar-nav-item-active-accent":"#8fa8e0","--dsw-specific-sidebar-right-flash":"#6789d5","--dsw-specific-sidebar-tint":"#28251f","--dsw-specific-sidebar-wash-top":"#28251f","--dsw-specific-sidebar-wash-top-clear":"#28251f","--dsw-specific-sidebar-wash-bottom":"#28251f","--dsw-specific-sidebar-wash-bottom-clear":"#28251f","--dsw-alias-brand-primary-new-colorprimary-new-color":"#8fa8e0","--dsw-linear-gradient-think":"linear-gradient(180deg, #211e18 20.19%, #211e1800 100%)","--dsw-linear-think-select":"linear-gradient(180deg, #2a2720 20.19%, #2a272000 100%)"},"light":{"--dsw-alias-bg-base":"#f1f0ea","--dsw-alias-bg-layer-1":"#edece6","--dsw-alias-bg-layer-2":"#ebeae4","--dsw-alias-bg-layer-3":"#e9e8e2","--dsw-alias-bg-layer-4":"#e7e6e0","--dsw-alias-bg-overlay":"#e9e8e2","--dsw-alias-bg-skeleton":"#e9e8e2","--dsw-alias-bg-module-platform":"#ebeae4","--dsw-alias-bg-mask-drop":"#c1c0bb","--dsw-alias-label-primary":"#322d22","--dsw-alias-label-primary-dimmed":"#1d1a12","--dsw-alias-label-primary-foreground":"#ffffff","--dsw-alias-label-primary-inverted":"#1d1a12","--dsw-alias-label-secondary":"#6a604e","--dsw-alias-label-tertiary":"#706a5e","--dsw-alias-label-caption":"#736b5c","--dsw-alias-label-dimmed":"#6f695d","--dsw-alias-label-error":"#bc2f26","--dsw-alias-brand-primary":"#31549b","--dsw-alias-brand-primary-invert":"#31549b","--dsw-alias-brand-text":"#31549b","--dsw-alias-link":"#31549b","--dsw-alias-border-l1":"#e2e0da","--dsw-alias-border-l2":"#dcdbd4","--dsw-alias-border-l3":"#d6d5ce","--dsw-alias-border-l4":"#cfcdc6","--dsw-alias-interactive-bg-hover":"#e9e8e2","--dsw-alias-interactive-bg-hover-solid":"#e6e4de","--dsw-alias-interactive-bg-active":"#e4e2dc","--dsw-alias-interactive-bg-hover-accent":"#dee0e2","--dsw-alias-interactive-bg-hover-danger":"#ecddd6","--dsw-alias-button-primary-fill":"#31549b","--dsw-alias-button-primary-hover":"#31549b","--dsw-alias-button-primary-dimmed":"#dadde1","--dsw-alias-button-elevated-fill":"#edece6","--dsw-alias-button-floating-fill":"#ebeae4","--dsw-alias-button-floating-hover":"#e6e4de","--dsw-alias-button-contrast-fill":"#4f4a40","--dsw-alias-button-ghost-active-fill":"#e7e6e0","--dsw-alias-button-ghost-active-hover":"#e4e2dc","--dsw-alias-button-ghost-active-border":"#dad9d2","--dsw-alias-state-error-primary":"#bc2f26","--dsw-alias-state-error-secondary":"#ebd9d2","--dsw-alias-state-success-primary":"#2a7c35","--dsw-alias-state-warn-primary":"#92400e","--dsw-alias-state-warn-label":"#92400e","--dsw-alias-markdown-code-block":"#ebeae4","--dsw-alias-markdown-code-block-banner":"#e9e8e2","--dsw-alias-markdown-citation":"#ebeae4","--dsw-alias-markdown-placeholder":"#e9e8e2","--dsw-alias-markdown-tag":"#e7e6e0","--dsw-alias-markdown-code-segment-selected":"#e9e8e2","--dsw-alias-markdown-code-segment-unselected":"#edece6","--dsw-alias-scrollbar-bg-l1":"#e7e6e0","--dsw-alias-scrollbar-bg-l2":"#e2e0da","--dsw-alias-scrollbar-hover-l1":"#deddd6","--dsw-alias-scrollbar-hover-l2":"#d8d7d0","--dsw-alias-switch-thumb":"#ffffff","--dsw-alias-toast-bg":"#4f4a40","--dsw-alias-toast-label":"#f1f0ea","--dsw-alias-tooltip-bg":"#545046","--dsw-alias-menu-group-header-fill":"#ebeae4","--dsw-menu-surface-fill":"#ebeae4","--dsw-specific-sidebar-fill":"#ebeae4","--dsw-specific-sidebar-nav-item-active":"#e6e4de","--dsw-specific-bubble":"#ebeae4","--dsw-specific-input-major":"#ebeae4","--dsw-specific-menu":"#ebeae4","--dsw-specific-selector":"#ebeae4","--dsw-specific-tip":"#ebeae4","--dsw-alias-file-diff-added-bg":"#e3ecde","--dsw-alias-file-diff-deleted-bg":"#ede1da","--dsw-alias-code-diff-added":"#dce9d8","--dsw-alias-code-diff-deleted":"#ebd9d2","--dsw-font-markdown-base-strong-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-small":"12px/20px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-m-18-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-table-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xxxs-11":"11px/14px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-base-16":"16px/24px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-h4":"600 14px / calc(24px + calc(14px - 14px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-small-strong-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-h2":"700 calc(19px + calc(14px - 14px)) / calc(28px + calc(14px - 14px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-base-strong":"600 14px / calc(24px + calc(14px - 14px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-small-strong-italic-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-base-italic-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-base-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xxxs-strong-11-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-base-italic":"italic 14px / calc(24px + calc(14px - 14px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-h1":"700 calc(21px + calc(14px - 14px)) / calc(30px + calc(14px - 14px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-small-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-s-14-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-h3":"700 calc(18px + calc(14px - 14px)) / calc(26px + calc(14px - 14px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xxxs-11-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-base":"14px / calc(24px + calc(14px - 14px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xs-strong-13-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-base-strong-16":"500 16px/24px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xxs-12":"12px/18px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-small-strong":"600 12px/20px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-base-strong-16-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-s-strong-14-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xl-24":"600 24px/32px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-s-strong-14":"500 14px/22px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-base-strong-italic-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-l-20-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xxs-strong-12-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-small-italic":"italic 12px/20px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xxxs-strong-11":"500 11px/14px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xs-13-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-base-strong-italic":"italic 600 14px / calc(24px + calc(14px - 14px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-small-strong-italic":"italic 600 12px/20px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-table":"min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-h2-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xl-24-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xs-13":"13px/20px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-base-16-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-s-14":"14px/22px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-h1-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-table-head-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-h3-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xxs-strong-12":"500 12px/18px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-table-head":"500 min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xs-strong-13":"500 13px/20px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-m-18":"500 16px/28px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-small-italic-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-family-brand":"\"Manrope\", \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-l-20":"500 20px/28px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-h4-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xxs-12-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-elevation-soft":"0 0 0 .5px rgba(26, 31, 40, 0.15), 0 4px 14px rgba(26, 31, 40, 0.07)","--dsw-elevation-panel":"0 0 0 .5px rgba(26, 31, 40, 0.15), 0 12px 30px rgba(26, 31, 40, 0.09)","--dsw-elevation-prominent":"0 0 0 .5px rgba(26, 31, 40, 0.15), 0 24px 50px rgba(26, 31, 40, 0.11)","--dsw-alias-markdown-inline-code":"#e7e6e0","--dsw-alias-json-tree-hover":"#e9e8e2","--dsw-alias-json-tree-property":"#6a604e","--dsw-alias-json-tree-punctuation":"#8c8475","--dsw-alias-json-tree-number":"#31549b","--dsw-alias-json-tree-keyword":"#31549b","--dsw-alias-json-tree-icon":"#8c8475","--dsw-alias-state-idle-primary":"#8c8475","--dsw-alias-state-done-primary":"#3fb950","--dsw-alias-state-business-primary":"#31549b","--dsw-alias-state-warn-secondary":"#92400e","--dsw-alias-state-warn-tertiary":"#92400e","--dsw-alias-state-success-secondary":"#3fb950","--dsw-alias-state-success-tertiary":"#3fb950","--dsw-alias-border-selected":"#31549b","--dsw-alias-border-inverted":"#e2e0da","--dsw-alias-border-inverted2":"#e2e0da","--dsw-alias-card-fill":"#edece6","--dsw-alias-card-tile-fill":"#ebeae4","--dsw-alias-settings-card-fill":"#edece6","--dsw-alias-settings-card-stroke":"#dcdbd4","--dsw-alias-onboarding-card-fill":"#edece6","--dsw-alias-label-document-preview":"#6a604e","--dsw-alias-label-primary-bluish":"#322d22","--dsw-alias-label-shimmer":"#8c8475","--dsw-alias-label-deep-diving-shimmer":"#8c8475","--dsw-alias-label-on-color":"#ffffff","--dsw-alias-hovercard-label-primary":"#322d22","--dsw-alias-hovercard-label-secondary":"#6a604e","--dsw-alias-hovercard-label-tertiary":"#8c8475","--dsw-alias-hovercard-state-error":"#bc2f26","--dsw-alias-hovercard-state-done":"#3fb950","--dsw-alias-bg-mask-1":"#c1c0bb","--dsw-alias-bg-mask-2":"#c1c0bb","--dsw-alias-bg-mask-3":"#c1c0bb","--dsw-alias-bg-mask-photo":"#c1c0bb","--dsw-alias-bg-document-selection":"#dee0e2","--dsw-alias-button-info-fill":"#31549b","--dsw-alias-button-info-hover":"#31549b","--dsw-alias-button-tool-bar-fill":"#ebeae4","--dsw-alias-button-tool-bar-fill-invisible":"#c1c0bb","--dsw-alias-button-tool-bar-hover":"#e6e4de","--dsw-alias-chart-tools":"#8c8475","--dsw-alias-chart-messages":"#6a604e","--dsw-alias-chart-system":"#31549b","--dsw-alias-illustration-surface":"#ebeae4","--dsw-alias-illustration-shadow":"#dcdbd4","--dsw-alias-illustration-backing":"#e9e8e2","--dsw-alias-trajectory-accent":"#31549b","--dsw-alias-menu-icon":"#6a604e","--dsw-alias-tooltip-label":"#ffffff","--dsw-alias-tooltip-key-bg":"#e9e8e2","--dsw-alias-toast-action":"#31549b","--dsw-alias-onboarding-accent":"#31549b","--dsw-alias-onboarding-checkbox-border":"#d6d5ce","--dsw-alias-turn-trigger-bg":"#e9e8e2","--dsw-alias-turn-trigger-bg-hover":"#e6e4de","--dsw-alias-file-diff-added-gutter":"#e3ecde","--dsw-alias-file-diff-deleted-gutter":"#ede1da","--dsw-alias-file-diff-added-marker":"#dce9d8","--dsw-alias-file-diff-deleted-marker":"#ebd9d2","--dsw-alias-bg-document-preview":"#ebeae4","--dsw-alias-bg-multi-select":"#e9e8e2","--dsw-alias-border-l2-darkmode-thin":"#d5d4cc","--dsw-alias-card-fill-hover":"#f2f1ed","--dsw-alias-hovercard-bg":"#e7e6e0","--dsw-alias-illustration-background":"#edece6","--dsw-alias-illustration-detail":"#6a604e","--dsw-alias-illustration-inset":"#e9e8e2","--dsw-alias-json-tree-string":"#3fb950","--dsw-alias-label-deep-diving":"#8c8475","--dsw-alias-onboarding-secondary-fill":"#ebeae4","--dsw-alias-state-business-tertiary":"#5c81cc","--dsw-specific-bubble-highlight":"#f8f8f6","--dsw-specific-file-upload-track":"#ebeae4","--dsw-specific-guide-hero":"#edece6","--dsw-specific-login-input":"#ebeae4","--dsw-specific-sidebar-glass-fill":"#f2f1ed","--dsw-specific-sidebar-glass-hover":"#e9e8e2","--dsw-specific-sidebar-glass-collapsed-fill":"#efefea","--dsw-specific-sidebar-glass-collapsed-hover":"#e9e8e2","--dsw-specific-sidebar-nav-item-active-accent":"#31549b","--dsw-specific-sidebar-right-flash":"#253f74","--dsw-specific-sidebar-tint":"#ebeae4","--dsw-specific-sidebar-wash-top":"#ebeae4","--dsw-specific-sidebar-wash-top-clear":"#ebeae4","--dsw-specific-sidebar-wash-bottom":"#ebeae4","--dsw-specific-sidebar-wash-bottom-clear":"#ebeae4","--dsw-alias-brand-primary-new-colorprimary-new-color":"#31549b","--dsw-linear-gradient-think":"linear-gradient(180deg, #f1f0ea 20.19%, #f1f0ea00 100%)","--dsw-linear-think-select":"linear-gradient(180deg, #ebeae4 20.19%, #ebeae400 100%)"},"label":"@theme.manuscript"},"miami":{"dark":{"--dsw-alias-bg-base":"#140f1e","--dsw-alias-bg-layer-1":"#1a1524","--dsw-alias-bg-layer-2":"#1d1828","--dsw-alias-bg-layer-3":"#211c2c","--dsw-alias-bg-layer-4":"#252030","--dsw-alias-bg-overlay":"#231e2e","--dsw-alias-bg-skeleton":"#1f1a2a","--dsw-alias-bg-module-platform":"#1f1a2a","--dsw-alias-bg-mask-drop":"#100c18","--dsw-alias-label-primary":"#cfc7e8","--dsw-alias-label-primary-dimmed":"#efeaf9","--dsw-alias-label-primary-foreground":"#3c0a24","--dsw-alias-label-primary-inverted":"#efeaf9","--dsw-alias-label-secondary":"#968bbd","--dsw-alias-label-tertiary":"#887ea5","--dsw-alias-label-caption":"#897fad","--dsw-alias-label-dimmed":"#847ca0","--dsw-alias-label-error":"#ef5d78","--dsw-alias-brand-primary":"#f472b6","--dsw-alias-brand-primary-invert":"#f472b6","--dsw-alias-brand-text":"#f472b6","--dsw-alias-link":"#f472b6","--dsw-alias-border-l1":"#272132","--dsw-alias-border-l2":"#2e293a","--dsw-alias-border-l3":"#363042","--dsw-alias-border-l4":"#413b4e","--dsw-alias-interactive-bg-hover":"#211c2c","--dsw-alias-interactive-bg-hover-solid":"#252030","--dsw-alias-interactive-bg-active":"#292334","--dsw-alias-interactive-bg-hover-accent":"#331d33","--dsw-alias-interactive-bg-hover-danger":"#331a2b","--dsw-alias-button-primary-fill":"#f472b6","--dsw-alias-button-primary-hover":"#f78fc5","--dsw-alias-button-primary-dimmed":"#381f36","--dsw-alias-button-elevated-fill":"#1d1828","--dsw-alias-button-floating-fill":"#231e2e","--dsw-alias-button-floating-hover":"#292334","--dsw-alias-button-contrast-fill":"#efeaf9","--dsw-alias-button-ghost-active-fill":"#231e2e","--dsw-alias-button-ghost-active-hover":"#292334","--dsw-alias-button-ghost-active-border":"#322c3e","--dsw-alias-state-error-primary":"#ef5d78","--dsw-alias-state-error-secondary":"#3b1d2e","--dsw-alias-state-success-primary":"#3fb950","--dsw-alias-state-warn-primary":"#f59e0b","--dsw-alias-state-warn-label":"#f59e0b","--dsw-alias-markdown-code-block":"#1d1828","--dsw-alias-markdown-code-block-banner":"#231e2e","--dsw-alias-markdown-citation":"#1f1a2a","--dsw-alias-markdown-placeholder":"#211c2c","--dsw-alias-markdown-tag":"#252030","--dsw-alias-markdown-code-segment-selected":"#231e2e","--dsw-alias-markdown-code-segment-unselected":"#1b1626","--dsw-alias-scrollbar-bg-l1":"#231e2e","--dsw-alias-scrollbar-bg-l2":"#2a2536","--dsw-alias-scrollbar-hover-l1":"#2e293a","--dsw-alias-scrollbar-hover-l2":"#363042","--dsw-alias-switch-thumb":"#7b748d","--dsw-alias-toast-bg":"#2a2536","--dsw-alias-toast-label":"#cfc7e8","--dsw-alias-tooltip-bg":"#2e293a","--dsw-alias-menu-group-header-fill":"#1d1828","--dsw-menu-surface-fill":"#211c2c","--dsw-specific-sidebar-fill":"#1b1626","--dsw-specific-sidebar-nav-item-active":"#272132","--dsw-specific-bubble":"#1d1828","--dsw-specific-input-major":"#1f1a2a","--dsw-specific-menu":"#211c2c","--dsw-specific-selector":"#1f1a2a","--dsw-specific-tip":"#1d1828","--dsw-alias-file-diff-added-bg":"#192324","--dsw-alias-file-diff-deleted-bg":"#2e1829","--dsw-alias-code-diff-added":"#1c2e27","--dsw-alias-code-diff-deleted":"#3b1d2e","--dsw-font-markdown-base-strong-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small":"12px/20px \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11":"11px/14px \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16":"16px/24px \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4":"600 14px / calc(24px + calc(14px - 14px)) \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2":"700 calc(19px + calc(14px - 14px)) / calc(28px + calc(14px - 14px)) \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong":"600 14px / calc(24px + calc(14px - 14px)) \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic":"italic 14px / calc(24px + calc(14px - 14px)) \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1":"700 calc(21px + calc(14px - 14px)) / calc(30px + calc(14px - 14px)) \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3":"700 calc(18px + calc(14px - 14px)) / calc(26px + calc(14px - 14px)) \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base":"14px / calc(24px + calc(14px - 14px)) \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16":"500 16px/24px \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12":"12px/18px \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong":"600 12px/20px \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24":"600 24px/32px \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14":"500 14px/22px \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic":"italic 12px/20px \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11":"500 11px/14px \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic":"italic 600 14px / calc(24px + calc(14px - 14px)) \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic":"italic 600 12px/20px \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table":"min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13":"13px/20px \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14":"14px/22px \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12":"500 12px/18px \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head":"500 min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13":"500 13px/20px \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18":"500 16px/28px \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family-brand":"\"Manrope\", \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20":"500 20px/28px \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-elevation-soft":"0 0 0 .5px rgba(28, 18, 23, 0.20), 0 4px 16px rgba(28, 18, 23, 0.30)","--dsw-elevation-panel":"0 0 0 .5px rgba(28, 18, 23, 0.20), 0 12px 32px rgba(28, 18, 23, 0.40)","--dsw-elevation-prominent":"0 0 0 .5px rgba(28, 18, 23, 0.20), 0 24px 48px rgba(28, 18, 23, 0.50)","--dsw-alias-markdown-inline-code":"#252030","--dsw-alias-json-tree-hover":"#211c2c","--dsw-alias-json-tree-property":"#968bbd","--dsw-alias-json-tree-punctuation":"#7c729d","--dsw-alias-json-tree-number":"#f472b6","--dsw-alias-json-tree-keyword":"#f472b6","--dsw-alias-json-tree-icon":"#7c729d","--dsw-alias-state-idle-primary":"#7c729d","--dsw-alias-state-done-primary":"#3fb950","--dsw-alias-state-business-primary":"#f472b6","--dsw-alias-state-warn-secondary":"#f59e0b","--dsw-alias-state-warn-tertiary":"#f59e0b","--dsw-alias-state-success-secondary":"#3fb950","--dsw-alias-state-success-tertiary":"#3fb950","--dsw-alias-border-selected":"#f472b6","--dsw-alias-border-inverted":"#272132","--dsw-alias-border-inverted2":"#272132","--dsw-alias-card-fill":"#1a1524","--dsw-alias-card-tile-fill":"#1d1828","--dsw-alias-settings-card-fill":"#1a1524","--dsw-alias-settings-card-stroke":"#2e293a","--dsw-alias-onboarding-card-fill":"#1a1524","--dsw-alias-label-document-preview":"#968bbd","--dsw-alias-label-primary-bluish":"#cfc7e8","--dsw-alias-label-shimmer":"#7c729d","--dsw-alias-label-deep-diving-shimmer":"#7c729d","--dsw-alias-label-on-color":"#3c0a24","--dsw-alias-hovercard-label-primary":"#cfc7e8","--dsw-alias-hovercard-label-secondary":"#968bbd","--dsw-alias-hovercard-label-tertiary":"#7c729d","--dsw-alias-hovercard-state-error":"#ef5d78","--dsw-alias-hovercard-state-done":"#3fb950","--dsw-alias-bg-mask-1":"#100c18","--dsw-alias-bg-mask-2":"#100c18","--dsw-alias-bg-mask-3":"#100c18","--dsw-alias-bg-mask-photo":"#100c18","--dsw-alias-bg-document-selection":"#331d33","--dsw-alias-button-info-fill":"#f472b6","--dsw-alias-button-info-hover":"#f472b6","--dsw-alias-button-tool-bar-fill":"#231e2e","--dsw-alias-button-tool-bar-fill-invisible":"#100c18","--dsw-alias-button-tool-bar-hover":"#292334","--dsw-alias-chart-tools":"#7c729d","--dsw-alias-chart-messages":"#968bbd","--dsw-alias-chart-system":"#f472b6","--dsw-alias-illustration-surface":"#1d1828","--dsw-alias-illustration-shadow":"#2e293a","--dsw-alias-illustration-backing":"#211c2c","--dsw-alias-trajectory-accent":"#f472b6","--dsw-alias-menu-icon":"#968bbd","--dsw-alias-tooltip-label":"#3c0a24","--dsw-alias-tooltip-key-bg":"#211c2c","--dsw-alias-toast-action":"#f472b6","--dsw-alias-onboarding-accent":"#f472b6","--dsw-alias-onboarding-checkbox-border":"#363042","--dsw-alias-turn-trigger-bg":"#211c2c","--dsw-alias-turn-trigger-bg-hover":"#252030","--dsw-alias-file-diff-added-gutter":"#192324","--dsw-alias-file-diff-deleted-gutter":"#2e1829","--dsw-alias-file-diff-added-marker":"#1c2e27","--dsw-alias-file-diff-deleted-marker":"#3b1d2e","--dsw-alias-bg-document-preview":"#1d1828","--dsw-alias-bg-multi-select":"#211c2c","--dsw-alias-border-l2-darkmode-thin":"#272331","--dsw-alias-card-fill-hover":"#241e32","--dsw-alias-hovercard-bg":"#272132","--dsw-alias-illustration-background":"#1a1524","--dsw-alias-illustration-detail":"#968bbd","--dsw-alias-illustration-inset":"#211c2c","--dsw-alias-json-tree-string":"#3fb950","--dsw-alias-label-deep-diving":"#7c729d","--dsw-alias-onboarding-secondary-fill":"#1d1828","--dsw-alias-state-business-tertiary":"#fbc7e2","--dsw-specific-bubble-highlight":"#2b233b","--dsw-specific-file-upload-track":"#1d1828","--dsw-specific-guide-hero":"#1a1524","--dsw-specific-login-input":"#1d1828","--dsw-specific-sidebar-glass-fill":"#221c30","--dsw-specific-sidebar-glass-hover":"#1f1a2a","--dsw-specific-sidebar-glass-collapsed-fill":"#201a2c","--dsw-specific-sidebar-glass-collapsed-hover":"#1f1a2a","--dsw-specific-sidebar-nav-item-active-accent":"#f472b6","--dsw-specific-sidebar-right-flash":"#f0439e","--dsw-specific-sidebar-tint":"#1b1626","--dsw-specific-sidebar-wash-top":"#1b1626","--dsw-specific-sidebar-wash-top-clear":"#1b1626","--dsw-specific-sidebar-wash-bottom":"#1b1626","--dsw-specific-sidebar-wash-bottom-clear":"#1b1626","--dsw-alias-brand-primary-new-colorprimary-new-color":"#f472b6","--dsw-linear-gradient-think":"linear-gradient(180deg, #140f1e 20.19%, #140f1e00 100%)","--dsw-linear-think-select":"linear-gradient(180deg, #1d1828 20.19%, #1d182800 100%)"},"light":{"--dsw-alias-bg-base":"#f6f2f5","--dsw-alias-bg-layer-1":"#f2eef1","--dsw-alias-bg-layer-2":"#f0ecf0","--dsw-alias-bg-layer-3":"#efeaee","--dsw-alias-bg-layer-4":"#ede8ec","--dsw-alias-bg-overlay":"#efeaee","--dsw-alias-bg-skeleton":"#efeaee","--dsw-alias-bg-module-platform":"#f0ecf0","--dsw-alias-bg-mask-drop":"#c5c2c4","--dsw-alias-label-primary":"#3c3244","--dsw-alias-label-primary-dimmed":"#241c2b","--dsw-alias-label-primary-foreground":"#ffffff","--dsw-alias-label-primary-inverted":"#241c2b","--dsw-alias-label-secondary":"#6b5f74","--dsw-alias-label-tertiary":"#756b7a","--dsw-alias-label-caption":"#766c7c","--dsw-alias-label-dimmed":"#736879","--dsw-alias-label-error":"#c22f4f","--dsw-alias-brand-primary":"#b0246f","--dsw-alias-brand-primary-invert":"#b0246f","--dsw-alias-brand-text":"#b0246f","--dsw-alias-link":"#b0246f","--dsw-alias-border-l1":"#e7e3e7","--dsw-alias-border-l2":"#e2dde2","--dsw-alias-border-l3":"#dcd7dc","--dsw-alias-border-l4":"#d5cfd5","--dsw-alias-interactive-bg-hover":"#efeaee","--dsw-alias-interactive-bg-hover-solid":"#ebe6ea","--dsw-alias-interactive-bg-active":"#e9e5e9","--dsw-alias-interactive-bg-hover-accent":"#efdde8","--dsw-alias-interactive-bg-hover-danger":"#f1dfe4","--dsw-alias-button-primary-fill":"#b0246f","--dsw-alias-button-primary-hover":"#b0246f","--dsw-alias-button-primary-dimmed":"#eed9e5","--dsw-alias-button-elevated-fill":"#f2eef1","--dsw-alias-button-floating-fill":"#f0ecf0","--dsw-alias-button-floating-hover":"#ebe6ea","--dsw-alias-button-contrast-fill":"#584f5f","--dsw-alias-button-ghost-active-fill":"#ede8ec","--dsw-alias-button-ghost-active-hover":"#e9e5e9","--dsw-alias-button-ghost-active-border":"#e0dbe0","--dsw-alias-state-error-primary":"#c22f4f","--dsw-alias-state-error-secondary":"#f0dbe1","--dsw-alias-state-success-primary":"#2a7c35","--dsw-alias-state-warn-primary":"#92400e","--dsw-alias-state-warn-label":"#92400e","--dsw-alias-markdown-code-block":"#f0ecf0","--dsw-alias-markdown-code-block-banner":"#efeaee","--dsw-alias-markdown-citation":"#f0ecf0","--dsw-alias-markdown-placeholder":"#efeaee","--dsw-alias-markdown-tag":"#ede8ec","--dsw-alias-markdown-code-segment-selected":"#efeaee","--dsw-alias-markdown-code-segment-unselected":"#f2eef1","--dsw-alias-scrollbar-bg-l1":"#ede8ec","--dsw-alias-scrollbar-bg-l2":"#e7e3e7","--dsw-alias-scrollbar-hover-l1":"#e3dfe3","--dsw-alias-scrollbar-hover-l2":"#ded9de","--dsw-alias-switch-thumb":"#ffffff","--dsw-alias-toast-bg":"#584f5f","--dsw-alias-toast-label":"#f6f2f5","--dsw-alias-tooltip-bg":"#5d5564","--dsw-alias-menu-group-header-fill":"#f0ecf0","--dsw-menu-surface-fill":"#f0ecf0","--dsw-specific-sidebar-fill":"#f0ecf0","--dsw-specific-sidebar-nav-item-active":"#ebe6ea","--dsw-specific-bubble":"#f0ecf0","--dsw-specific-input-major":"#f0ecf0","--dsw-specific-menu":"#f0ecf0","--dsw-specific-selector":"#f0ecf0","--dsw-specific-tip":"#f0ecf0","--dsw-alias-file-diff-added-bg":"#e7ede8","--dsw-alias-file-diff-deleted-bg":"#f2e2e8","--dsw-alias-code-diff-added":"#e0ebe1","--dsw-alias-code-diff-deleted":"#f0dbe1","--dsw-font-markdown-base-strong-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small":"12px/20px \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11":"11px/14px \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16":"16px/24px \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4":"600 14px / calc(24px + calc(14px - 14px)) \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2":"700 calc(19px + calc(14px - 14px)) / calc(28px + calc(14px - 14px)) \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong":"600 14px / calc(24px + calc(14px - 14px)) \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic":"italic 14px / calc(24px + calc(14px - 14px)) \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1":"700 calc(21px + calc(14px - 14px)) / calc(30px + calc(14px - 14px)) \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3":"700 calc(18px + calc(14px - 14px)) / calc(26px + calc(14px - 14px)) \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base":"14px / calc(24px + calc(14px - 14px)) \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16":"500 16px/24px \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12":"12px/18px \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong":"600 12px/20px \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24":"600 24px/32px \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14":"500 14px/22px \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic":"italic 12px/20px \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11":"500 11px/14px \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic":"italic 600 14px / calc(24px + calc(14px - 14px)) \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic":"italic 600 12px/20px \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table":"min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13":"13px/20px \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14":"14px/22px \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12":"500 12px/18px \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head":"500 min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13":"500 13px/20px \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18":"500 16px/28px \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family-brand":"\"Manrope\", \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20":"500 20px/28px \"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12-font-family":"\"Space Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-elevation-soft":"0 0 0 .5px rgba(40, 26, 34, 0.15), 0 4px 14px rgba(40, 26, 34, 0.07)","--dsw-elevation-panel":"0 0 0 .5px rgba(40, 26, 34, 0.15), 0 12px 30px rgba(40, 26, 34, 0.09)","--dsw-elevation-prominent":"0 0 0 .5px rgba(40, 26, 34, 0.15), 0 24px 50px rgba(40, 26, 34, 0.11)","--dsw-alias-markdown-inline-code":"#ede8ec","--dsw-alias-json-tree-hover":"#efeaee","--dsw-alias-json-tree-property":"#6b5f74","--dsw-alias-json-tree-punctuation":"#8e8494","--dsw-alias-json-tree-number":"#b0246f","--dsw-alias-json-tree-keyword":"#b0246f","--dsw-alias-json-tree-icon":"#8e8494","--dsw-alias-state-idle-primary":"#8e8494","--dsw-alias-state-done-primary":"#3fb950","--dsw-alias-state-business-primary":"#b0246f","--dsw-alias-state-warn-secondary":"#92400e","--dsw-alias-state-warn-tertiary":"#92400e","--dsw-alias-state-success-secondary":"#3fb950","--dsw-alias-state-success-tertiary":"#3fb950","--dsw-alias-border-selected":"#b0246f","--dsw-alias-border-inverted":"#e7e3e7","--dsw-alias-border-inverted2":"#e7e3e7","--dsw-alias-card-fill":"#f2eef1","--dsw-alias-card-tile-fill":"#f0ecf0","--dsw-alias-settings-card-fill":"#f2eef1","--dsw-alias-settings-card-stroke":"#e2dde2","--dsw-alias-onboarding-card-fill":"#f2eef1","--dsw-alias-label-document-preview":"#6b5f74","--dsw-alias-label-primary-bluish":"#3c3244","--dsw-alias-label-shimmer":"#8e8494","--dsw-alias-label-deep-diving-shimmer":"#8e8494","--dsw-alias-label-on-color":"#ffffff","--dsw-alias-hovercard-label-primary":"#3c3244","--dsw-alias-hovercard-label-secondary":"#6b5f74","--dsw-alias-hovercard-label-tertiary":"#8e8494","--dsw-alias-hovercard-state-error":"#c22f4f","--dsw-alias-hovercard-state-done":"#3fb950","--dsw-alias-bg-mask-1":"#c5c2c4","--dsw-alias-bg-mask-2":"#c5c2c4","--dsw-alias-bg-mask-3":"#c5c2c4","--dsw-alias-bg-mask-photo":"#c5c2c4","--dsw-alias-bg-document-selection":"#efdde8","--dsw-alias-button-info-fill":"#b0246f","--dsw-alias-button-info-hover":"#b0246f","--dsw-alias-button-tool-bar-fill":"#f0ecf0","--dsw-alias-button-tool-bar-fill-invisible":"#c5c2c4","--dsw-alias-button-tool-bar-hover":"#ebe6ea","--dsw-alias-chart-tools":"#8e8494","--dsw-alias-chart-messages":"#6b5f74","--dsw-alias-chart-system":"#b0246f","--dsw-alias-illustration-surface":"#f0ecf0","--dsw-alias-illustration-shadow":"#e2dde2","--dsw-alias-illustration-backing":"#efeaee","--dsw-alias-trajectory-accent":"#b0246f","--dsw-alias-menu-icon":"#6b5f74","--dsw-alias-tooltip-label":"#ffffff","--dsw-alias-tooltip-key-bg":"#efeaee","--dsw-alias-toast-action":"#b0246f","--dsw-alias-onboarding-accent":"#b0246f","--dsw-alias-onboarding-checkbox-border":"#dcd7dc","--dsw-alias-turn-trigger-bg":"#efeaee","--dsw-alias-turn-trigger-bg-hover":"#ebe6ea","--dsw-alias-file-diff-added-gutter":"#e7ede8","--dsw-alias-file-diff-deleted-gutter":"#f2e2e8","--dsw-alias-file-diff-added-marker":"#e0ebe1","--dsw-alias-file-diff-deleted-marker":"#f0dbe1","--dsw-alias-bg-document-preview":"#f0ecf0","--dsw-alias-bg-multi-select":"#efeaee","--dsw-alias-border-l2-darkmode-thin":"#dbd5db","--dsw-alias-card-fill-hover":"#f7f5f7","--dsw-alias-hovercard-bg":"#ede8ec","--dsw-alias-illustration-background":"#f2eef1","--dsw-alias-illustration-detail":"#6b5f74","--dsw-alias-illustration-inset":"#efeaee","--dsw-alias-json-tree-string":"#3fb950","--dsw-alias-label-deep-diving":"#8e8494","--dsw-alias-onboarding-secondary-fill":"#f0ecf0","--dsw-alias-state-business-tertiary":"#dc549d","--dsw-specific-bubble-highlight":"#fbf9fb","--dsw-specific-file-upload-track":"#f0ecf0","--dsw-specific-guide-hero":"#f2eef1","--dsw-specific-login-input":"#f0ecf0","--dsw-specific-sidebar-glass-fill":"#f7f5f7","--dsw-specific-sidebar-glass-hover":"#efeaee","--dsw-specific-sidebar-glass-collapsed-fill":"#f4f2f4","--dsw-specific-sidebar-glass-collapsed-hover":"#efeaee","--dsw-specific-sidebar-nav-item-active-accent":"#b0246f","--dsw-specific-sidebar-right-flash":"#861b54","--dsw-specific-sidebar-tint":"#f0ecf0","--dsw-specific-sidebar-wash-top":"#f0ecf0","--dsw-specific-sidebar-wash-top-clear":"#f0ecf0","--dsw-specific-sidebar-wash-bottom":"#f0ecf0","--dsw-specific-sidebar-wash-bottom-clear":"#f0ecf0","--dsw-alias-brand-primary-new-colorprimary-new-color":"#b0246f","--dsw-linear-gradient-think":"linear-gradient(180deg, #f6f2f5 20.19%, #f6f2f500 100%)","--dsw-linear-think-select":"linear-gradient(180deg, #f0ecf0 20.19%, #f0ecf000 100%)"},"label":"@theme.miami"},"phosphor":{"dark":{"--dsw-alias-bg-base":"#0a0f0a","--dsw-alias-bg-layer-1":"#101510","--dsw-alias-bg-layer-2":"#141914","--dsw-alias-bg-layer-3":"#181e18","--dsw-alias-bg-layer-4":"#1c221c","--dsw-alias-bg-overlay":"#1a201a","--dsw-alias-bg-skeleton":"#161c16","--dsw-alias-bg-module-platform":"#161c16","--dsw-alias-bg-mask-drop":"#080c08","--dsw-alias-label-primary":"#cfe0cf","--dsw-alias-label-primary-dimmed":"#e8f5e9","--dsw-alias-label-primary-foreground":"#07120a","--dsw-alias-label-primary-inverted":"#e8f5e9","--dsw-alias-label-secondary":"#93ac95","--dsw-alias-label-tertiary":"#788d79","--dsw-alias-label-caption":"#859c87","--dsw-alias-label-dimmed":"#6f8370","--dsw-alias-label-error":"#db5454","--dsw-alias-brand-primary":"#4ade80","--dsw-alias-brand-primary-invert":"#4ade80","--dsw-alias-brand-text":"#4ade80","--dsw-alias-link":"#4ade80","--dsw-alias-border-l1":"#1e241e","--dsw-alias-border-l2":"#262c26","--dsw-alias-border-l3":"#2d352d","--dsw-alias-border-l4":"#394139","--dsw-alias-interactive-bg-hover":"#181e18","--dsw-alias-interactive-bg-hover-solid":"#1c221c","--dsw-alias-interactive-bg-active":"#202620","--dsw-alias-interactive-bg-hover-accent":"#132c1b","--dsw-alias-interactive-bg-hover-danger":"#26130f","--dsw-alias-button-primary-fill":"#4ade80","--dsw-alias-button-primary-hover":"#6ee79b","--dsw-alias-button-primary-dimmed":"#14301d","--dsw-alias-button-elevated-fill":"#141914","--dsw-alias-button-floating-fill":"#1a201a","--dsw-alias-button-floating-hover":"#202620","--dsw-alias-button-contrast-fill":"#e8f5e9","--dsw-alias-button-ghost-active-fill":"#1a201a","--dsw-alias-button-ghost-active-hover":"#202620","--dsw-alias-button-ghost-active-border":"#2a302a","--dsw-alias-state-error-primary":"#db5454","--dsw-alias-state-error-secondary":"#2e1511","--dsw-alias-state-success-primary":"#3fb950","--dsw-alias-state-warn-primary":"#f59e0b","--dsw-alias-state-warn-label":"#f59e0b","--dsw-alias-markdown-code-block":"#141914","--dsw-alias-markdown-code-block-banner":"#1a201a","--dsw-alias-markdown-citation":"#161c16","--dsw-alias-markdown-placeholder":"#181e18","--dsw-alias-markdown-tag":"#1c221c","--dsw-alias-markdown-code-segment-selected":"#1a201a","--dsw-alias-markdown-code-segment-unselected":"#121712","--dsw-alias-scrollbar-bg-l1":"#1a201a","--dsw-alias-scrollbar-bg-l2":"#222822","--dsw-alias-scrollbar-hover-l1":"#262c26","--dsw-alias-scrollbar-hover-l2":"#2d352d","--dsw-alias-switch-thumb":"#768276","--dsw-alias-toast-bg":"#222822","--dsw-alias-toast-label":"#cfe0cf","--dsw-alias-tooltip-bg":"#262c26","--dsw-alias-menu-group-header-fill":"#141914","--dsw-menu-surface-fill":"#181e18","--dsw-specific-sidebar-fill":"#121712","--dsw-specific-sidebar-nav-item-active":"#1e241e","--dsw-specific-bubble":"#141914","--dsw-specific-input-major":"#161c16","--dsw-specific-menu":"#181e18","--dsw-specific-selector":"#161c16","--dsw-specific-tip":"#141914","--dsw-alias-file-diff-added-bg":"#102312","--dsw-alias-file-diff-deleted-bg":"#22130e","--dsw-alias-code-diff-added":"#142e17","--dsw-alias-code-diff-deleted":"#2e1511","--dsw-font-markdown-base-strong-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small":"12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11":"11px/14px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16":"16px/24px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4":"600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2":"700 calc(19px + calc(14px - 14px)) / calc(28px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong":"600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic":"italic 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1":"700 calc(21px + calc(14px - 14px)) / calc(30px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3":"700 calc(18px + calc(14px - 14px)) / calc(26px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base":"14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16":"500 16px/24px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12":"12px/18px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong":"600 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24":"600 24px/32px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14":"500 14px/22px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic":"italic 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11":"500 11px/14px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic":"italic 600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic":"italic 600 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table":"min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13":"13px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14":"14px/22px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12":"500 12px/18px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head":"500 min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13":"500 13px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18":"500 16px/28px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family-brand":"\"Manrope\", \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20":"500 20px/28px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-elevation-soft":"0 0 0 .5px rgba(18, 28, 22, 0.20), 0 4px 16px rgba(18, 28, 22, 0.30)","--dsw-elevation-panel":"0 0 0 .5px rgba(18, 28, 22, 0.20), 0 12px 32px rgba(18, 28, 22, 0.40)","--dsw-elevation-prominent":"0 0 0 .5px rgba(18, 28, 22, 0.20), 0 24px 48px rgba(18, 28, 22, 0.50)","--dsw-alias-markdown-inline-code":"#1c221c","--dsw-alias-json-tree-hover":"#181e18","--dsw-alias-json-tree-property":"#93ac95","--dsw-alias-json-tree-punctuation":"#788d79","--dsw-alias-json-tree-number":"#4ade80","--dsw-alias-json-tree-keyword":"#4ade80","--dsw-alias-json-tree-icon":"#788d79","--dsw-alias-state-idle-primary":"#788d79","--dsw-alias-state-done-primary":"#3fb950","--dsw-alias-state-business-primary":"#4ade80","--dsw-alias-state-warn-secondary":"#f59e0b","--dsw-alias-state-warn-tertiary":"#f59e0b","--dsw-alias-state-success-secondary":"#3fb950","--dsw-alias-state-success-tertiary":"#3fb950","--dsw-alias-border-selected":"#4ade80","--dsw-alias-border-inverted":"#1e241e","--dsw-alias-border-inverted2":"#1e241e","--dsw-alias-card-fill":"#101510","--dsw-alias-card-tile-fill":"#141914","--dsw-alias-settings-card-fill":"#101510","--dsw-alias-settings-card-stroke":"#262c26","--dsw-alias-onboarding-card-fill":"#101510","--dsw-alias-label-document-preview":"#93ac95","--dsw-alias-label-primary-bluish":"#cfe0cf","--dsw-alias-label-shimmer":"#788d79","--dsw-alias-label-deep-diving-shimmer":"#788d79","--dsw-alias-label-on-color":"#07120a","--dsw-alias-hovercard-label-primary":"#cfe0cf","--dsw-alias-hovercard-label-secondary":"#93ac95","--dsw-alias-hovercard-label-tertiary":"#788d79","--dsw-alias-hovercard-state-error":"#d32f2f","--dsw-alias-hovercard-state-done":"#3fb950","--dsw-alias-bg-mask-1":"#080c08","--dsw-alias-bg-mask-2":"#080c08","--dsw-alias-bg-mask-3":"#080c08","--dsw-alias-bg-mask-photo":"#080c08","--dsw-alias-bg-document-selection":"#132c1b","--dsw-alias-button-info-fill":"#4ade80","--dsw-alias-button-info-hover":"#4ade80","--dsw-alias-button-tool-bar-fill":"#1a201a","--dsw-alias-button-tool-bar-fill-invisible":"#080c08","--dsw-alias-button-tool-bar-hover":"#202620","--dsw-alias-chart-tools":"#788d79","--dsw-alias-chart-messages":"#93ac95","--dsw-alias-chart-system":"#4ade80","--dsw-alias-illustration-surface":"#141914","--dsw-alias-illustration-shadow":"#262c26","--dsw-alias-illustration-backing":"#181e18","--dsw-alias-trajectory-accent":"#4ade80","--dsw-alias-menu-icon":"#93ac95","--dsw-alias-tooltip-label":"#07120a","--dsw-alias-tooltip-key-bg":"#181e18","--dsw-alias-toast-action":"#4ade80","--dsw-alias-onboarding-accent":"#4ade80","--dsw-alias-onboarding-checkbox-border":"#2d352d","--dsw-alias-turn-trigger-bg":"#181e18","--dsw-alias-turn-trigger-bg-hover":"#1c221c","--dsw-alias-file-diff-added-gutter":"#102312","--dsw-alias-file-diff-deleted-gutter":"#22130e","--dsw-alias-file-diff-added-marker":"#142e17","--dsw-alias-file-diff-deleted-marker":"#2e1511","--dsw-alias-bg-document-preview":"#141914","--dsw-alias-bg-multi-select":"#181e18","--dsw-alias-border-l2-darkmode-thin":"#1f241f","--dsw-alias-card-fill-hover":"#1b221b","--dsw-alias-hovercard-bg":"#1e241e","--dsw-alias-illustration-background":"#101510","--dsw-alias-illustration-detail":"#93ac95","--dsw-alias-illustration-inset":"#181e18","--dsw-alias-json-tree-string":"#3fb950","--dsw-alias-label-deep-diving":"#788d79","--dsw-alias-onboarding-secondary-fill":"#141914","--dsw-alias-state-business-tertiary":"#98ecb6","--dsw-specific-bubble-highlight":"#222a22","--dsw-specific-file-upload-track":"#141914","--dsw-specific-guide-hero":"#101510","--dsw-specific-login-input":"#141914","--dsw-specific-sidebar-glass-fill":"#192019","--dsw-specific-sidebar-glass-hover":"#161c16","--dsw-specific-sidebar-glass-collapsed-fill":"#161d16","--dsw-specific-sidebar-glass-collapsed-hover":"#161c16","--dsw-specific-sidebar-nav-item-active-accent":"#4ade80","--dsw-specific-sidebar-right-flash":"#26cf64","--dsw-specific-sidebar-tint":"#121712","--dsw-specific-sidebar-wash-top":"#121712","--dsw-specific-sidebar-wash-top-clear":"#121712","--dsw-specific-sidebar-wash-bottom":"#121712","--dsw-specific-sidebar-wash-bottom-clear":"#121712","--dsw-alias-brand-primary-new-colorprimary-new-color":"#4ade80","--dsw-linear-gradient-think":"linear-gradient(180deg, #0a0f0a 20.19%, #0a0f0a00 100%)","--dsw-linear-think-select":"linear-gradient(180deg, #141914 20.19%, #14191400 100%)"},"light":{"--dsw-alias-bg-base":"#f1f4f1","--dsw-alias-bg-layer-1":"#edf0ed","--dsw-alias-bg-layer-2":"#ebeeeb","--dsw-alias-bg-layer-3":"#e9ece9","--dsw-alias-bg-layer-4":"#e7eae7","--dsw-alias-bg-overlay":"#e9ece9","--dsw-alias-bg-skeleton":"#e9ece9","--dsw-alias-bg-module-platform":"#ebeeeb","--dsw-alias-bg-mask-drop":"#c1c3c1","--dsw-alias-label-primary":"#2a352b","--dsw-alias-label-primary-dimmed":"#16201a","--dsw-alias-label-primary-foreground":"#ffffff","--dsw-alias-label-primary-inverted":"#16201a","--dsw-alias-label-secondary":"#566b58","--dsw-alias-label-tertiary":"#647365","--dsw-alias-label-caption":"#5f6f61","--dsw-alias-label-dimmed":"#637265","--dsw-alias-label-error":"#cf2121","--dsw-alias-brand-primary":"#10693a","--dsw-alias-brand-primary-invert":"#10693a","--dsw-alias-brand-text":"#10693a","--dsw-alias-link":"#10693a","--dsw-alias-border-l1":"#e1e5e1","--dsw-alias-border-l2":"#dbdfdb","--dsw-alias-border-l3":"#d5d9d5","--dsw-alias-border-l4":"#cdd2cd","--dsw-alias-interactive-bg-hover":"#e9ece9","--dsw-alias-interactive-bg-hover-solid":"#e5e9e5","--dsw-alias-interactive-bg-active":"#e3e7e3","--dsw-alias-interactive-bg-hover-accent":"#dbe6df","--dsw-alias-interactive-bg-hover-danger":"#efdfdd","--dsw-alias-button-primary-fill":"#10693a","--dsw-alias-button-primary-hover":"#10693a","--dsw-alias-button-primary-dimmed":"#d6e3db","--dsw-alias-button-elevated-fill":"#edf0ed","--dsw-alias-button-floating-fill":"#ebeeeb","--dsw-alias-button-floating-hover":"#e5e9e5","--dsw-alias-button-contrast-fill":"#485249","--dsw-alias-button-ghost-active-fill":"#e7eae7","--dsw-alias-button-ghost-active-hover":"#e3e7e3","--dsw-alias-button-ghost-active-border":"#d9ddd9","--dsw-alias-state-error-primary":"#cf2121","--dsw-alias-state-error-secondary":"#eedbd9","--dsw-alias-state-success-primary":"#2a7c35","--dsw-alias-state-warn-primary":"#92400e","--dsw-alias-state-warn-label":"#92400e","--dsw-alias-markdown-code-block":"#ebeeeb","--dsw-alias-markdown-code-block-banner":"#e9ece9","--dsw-alias-markdown-citation":"#ebeeeb","--dsw-alias-markdown-placeholder":"#e9ece9","--dsw-alias-markdown-tag":"#e7eae7","--dsw-alias-markdown-code-segment-selected":"#e9ece9","--dsw-alias-markdown-code-segment-unselected":"#edf0ed","--dsw-alias-scrollbar-bg-l1":"#e7eae7","--dsw-alias-scrollbar-bg-l2":"#e1e5e1","--dsw-alias-scrollbar-hover-l1":"#dde1dd","--dsw-alias-scrollbar-hover-l2":"#d7dbd7","--dsw-alias-switch-thumb":"#ffffff","--dsw-alias-toast-bg":"#485249","--dsw-alias-toast-label":"#f1f4f1","--dsw-alias-tooltip-bg":"#4e574f","--dsw-alias-menu-group-header-fill":"#ebeeeb","--dsw-menu-surface-fill":"#ebeeeb","--dsw-specific-sidebar-fill":"#ebeeeb","--dsw-specific-sidebar-nav-item-active":"#e5e9e5","--dsw-specific-bubble":"#ebeeeb","--dsw-specific-input-major":"#ebeeeb","--dsw-specific-menu":"#ebeeeb","--dsw-specific-selector":"#ebeeeb","--dsw-specific-tip":"#ebeeeb","--dsw-alias-file-diff-added-bg":"#e3efe4","--dsw-alias-file-diff-deleted-bg":"#efe4e1","--dsw-alias-code-diff-added":"#dcedde","--dsw-alias-code-diff-deleted":"#eedbd9","--dsw-font-markdown-base-strong-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small":"12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11":"11px/14px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16":"16px/24px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4":"600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2":"700 calc(19px + calc(14px - 14px)) / calc(28px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong":"600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic":"italic 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1":"700 calc(21px + calc(14px - 14px)) / calc(30px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3":"700 calc(18px + calc(14px - 14px)) / calc(26px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base":"14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16":"500 16px/24px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12":"12px/18px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong":"600 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24":"600 24px/32px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14":"500 14px/22px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic":"italic 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11":"500 11px/14px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic":"italic 600 14px / calc(24px + calc(14px - 14px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic":"italic 600 12px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table":"min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13":"13px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14":"14px/22px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12":"500 12px/18px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head":"500 min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13":"500 13px/20px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18":"500 16px/28px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family-brand":"\"Manrope\", \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20":"500 20px/28px \"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12-font-family":"\"Instrument Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-elevation-soft":"0 0 0 .5px rgba(26, 40, 33, 0.15), 0 4px 14px rgba(26, 40, 33, 0.07)","--dsw-elevation-panel":"0 0 0 .5px rgba(26, 40, 33, 0.15), 0 12px 30px rgba(26, 40, 33, 0.09)","--dsw-elevation-prominent":"0 0 0 .5px rgba(26, 40, 33, 0.15), 0 24px 50px rgba(26, 40, 33, 0.11)","--dsw-alias-markdown-inline-code":"#e7eae7","--dsw-alias-json-tree-hover":"#e9ece9","--dsw-alias-json-tree-property":"#566b58","--dsw-alias-json-tree-punctuation":"#7d8d7e","--dsw-alias-json-tree-number":"#10693a","--dsw-alias-json-tree-keyword":"#10693a","--dsw-alias-json-tree-icon":"#7d8d7e","--dsw-alias-state-idle-primary":"#7d8d7e","--dsw-alias-state-done-primary":"#3fb950","--dsw-alias-state-business-primary":"#10693a","--dsw-alias-state-warn-secondary":"#92400e","--dsw-alias-state-warn-tertiary":"#92400e","--dsw-alias-state-success-secondary":"#3fb950","--dsw-alias-state-success-tertiary":"#3fb950","--dsw-alias-border-selected":"#10693a","--dsw-alias-border-inverted":"#e1e5e1","--dsw-alias-border-inverted2":"#e1e5e1","--dsw-alias-card-fill":"#edf0ed","--dsw-alias-card-tile-fill":"#ebeeeb","--dsw-alias-settings-card-fill":"#edf0ed","--dsw-alias-settings-card-stroke":"#dbdfdb","--dsw-alias-onboarding-card-fill":"#edf0ed","--dsw-alias-label-document-preview":"#566b58","--dsw-alias-label-primary-bluish":"#2a352b","--dsw-alias-label-shimmer":"#7d8d7e","--dsw-alias-label-deep-diving-shimmer":"#7d8d7e","--dsw-alias-label-on-color":"#ffffff","--dsw-alias-hovercard-label-primary":"#2a352b","--dsw-alias-hovercard-label-secondary":"#566b58","--dsw-alias-hovercard-label-tertiary":"#7d8d7e","--dsw-alias-hovercard-state-error":"#dc2626","--dsw-alias-hovercard-state-done":"#3fb950","--dsw-alias-bg-mask-1":"#c1c3c1","--dsw-alias-bg-mask-2":"#c1c3c1","--dsw-alias-bg-mask-3":"#c1c3c1","--dsw-alias-bg-mask-photo":"#c1c3c1","--dsw-alias-bg-document-selection":"#dbe6df","--dsw-alias-button-info-fill":"#10693a","--dsw-alias-button-info-hover":"#10693a","--dsw-alias-button-tool-bar-fill":"#ebeeeb","--dsw-alias-button-tool-bar-fill-invisible":"#c1c3c1","--dsw-alias-button-tool-bar-hover":"#e5e9e5","--dsw-alias-chart-tools":"#7d8d7e","--dsw-alias-chart-messages":"#566b58","--dsw-alias-chart-system":"#10693a","--dsw-alias-illustration-surface":"#ebeeeb","--dsw-alias-illustration-shadow":"#dbdfdb","--dsw-alias-illustration-backing":"#e9ece9","--dsw-alias-trajectory-accent":"#10693a","--dsw-alias-menu-icon":"#566b58","--dsw-alias-tooltip-label":"#ffffff","--dsw-alias-tooltip-key-bg":"#e9ece9","--dsw-alias-toast-action":"#10693a","--dsw-alias-onboarding-accent":"#10693a","--dsw-alias-onboarding-checkbox-border":"#d5d9d5","--dsw-alias-turn-trigger-bg":"#e9ece9","--dsw-alias-turn-trigger-bg-hover":"#e5e9e5","--dsw-alias-file-diff-added-gutter":"#e3efe4","--dsw-alias-file-diff-deleted-gutter":"#efe4e1","--dsw-alias-file-diff-added-marker":"#dcedde","--dsw-alias-file-diff-deleted-marker":"#eedbd9","--dsw-alias-bg-document-preview":"#ebeeeb","--dsw-alias-bg-multi-select":"#e9ece9","--dsw-alias-border-l2-darkmode-thin":"#d3d8d3","--dsw-alias-card-fill-hover":"#f3f5f3","--dsw-alias-hovercard-bg":"#e7eae7","--dsw-alias-illustration-background":"#edf0ed","--dsw-alias-illustration-detail":"#566b58","--dsw-alias-illustration-inset":"#e9ece9","--dsw-alias-json-tree-string":"#3fb950","--dsw-alias-label-deep-diving":"#7d8d7e","--dsw-alias-onboarding-secondary-fill":"#ebeeeb","--dsw-alias-state-business-tertiary":"#1cb966","--dsw-specific-bubble-highlight":"#f9faf9","--dsw-specific-file-upload-track":"#ebeeeb","--dsw-specific-guide-hero":"#edf0ed","--dsw-specific-login-input":"#ebeeeb","--dsw-specific-sidebar-glass-fill":"#f3f5f3","--dsw-specific-sidebar-glass-hover":"#e9ece9","--dsw-specific-sidebar-glass-collapsed-fill":"#f1f3f1","--dsw-specific-sidebar-glass-collapsed-hover":"#e9ece9","--dsw-specific-sidebar-nav-item-active-accent":"#10693a","--dsw-specific-sidebar-right-flash":"#093d22","--dsw-specific-sidebar-tint":"#ebeeeb","--dsw-specific-sidebar-wash-top":"#ebeeeb","--dsw-specific-sidebar-wash-top-clear":"#ebeeeb","--dsw-specific-sidebar-wash-bottom":"#ebeeeb","--dsw-specific-sidebar-wash-bottom-clear":"#ebeeeb","--dsw-alias-brand-primary-new-colorprimary-new-color":"#10693a","--dsw-linear-gradient-think":"linear-gradient(180deg, #f1f4f1 20.19%, #f1f4f100 100%)","--dsw-linear-think-select":"linear-gradient(180deg, #ebeeeb 20.19%, #ebeeeb00 100%)"},"label":"@theme.phosphor"},"rose":{"dark":{"--dsw-alias-bg-base":"#191724","--dsw-alias-bg-layer-1":"#1f1d2a","--dsw-alias-bg-layer-2":"#22202e","--dsw-alias-bg-layer-3":"#262432","--dsw-alias-bg-layer-4":"#2a2836","--dsw-alias-bg-overlay":"#282634","--dsw-alias-bg-skeleton":"#242230","--dsw-alias-bg-module-platform":"#242230","--dsw-alias-bg-mask-drop":"#14121d","--dsw-alias-label-primary":"#d5d2eb","--dsw-alias-label-primary-dimmed":"#efedfa","--dsw-alias-label-primary-foreground":"#3f2224","--dsw-alias-label-primary-inverted":"#efedfa","--dsw-alias-label-secondary":"#9b97b4","--dsw-alias-label-tertiary":"#8e8ca3","--dsw-alias-label-caption":"#8e8aa6","--dsw-alias-label-dimmed":"#848197","--dsw-alias-label-error":"#eb6f92","--dsw-alias-brand-primary":"#ebbcba","--dsw-alias-brand-primary-invert":"#ebbcba","--dsw-alias-brand-text":"#ebbcba","--dsw-alias-link":"#ebbcba","--dsw-alias-border-l1":"#2c2a38","--dsw-alias-border-l2":"#333140","--dsw-alias-border-l3":"#3b3948","--dsw-alias-border-l4":"#464454","--dsw-alias-interactive-bg-hover":"#262432","--dsw-alias-interactive-bg-hover-solid":"#2a2836","--dsw-alias-interactive-bg-active":"#2e2c3a","--dsw-alias-interactive-bg-hover-accent":"#362e39","--dsw-alias-interactive-bg-hover-danger":"#362333","--dsw-alias-button-primary-fill":"#ebbcba","--dsw-alias-button-primary-hover":"#f2d0ce","--dsw-alias-button-primary-dimmed":"#3b313c","--dsw-alias-button-elevated-fill":"#22202e","--dsw-alias-button-floating-fill":"#282634","--dsw-alias-button-floating-hover":"#2e2c3a","--dsw-alias-button-contrast-fill":"#efedfa","--dsw-alias-button-ghost-active-fill":"#282634","--dsw-alias-button-ghost-active-hover":"#2e2c3a","--dsw-alias-button-ghost-active-border":"#373544","--dsw-alias-state-error-primary":"#eb6f92","--dsw-alias-state-error-secondary":"#3f2738","--dsw-alias-state-success-primary":"#3fb950","--dsw-alias-state-warn-primary":"#f59e0b","--dsw-alias-state-warn-label":"#f59e0b","--dsw-alias-markdown-code-block":"#22202e","--dsw-alias-markdown-code-block-banner":"#282634","--dsw-alias-markdown-citation":"#242230","--dsw-alias-markdown-placeholder":"#262432","--dsw-alias-markdown-tag":"#2a2836","--dsw-alias-markdown-code-segment-selected":"#282634","--dsw-alias-markdown-code-segment-unselected":"#211e2c","--dsw-alias-scrollbar-bg-l1":"#282634","--dsw-alias-scrollbar-bg-l2":"#302d3c","--dsw-alias-scrollbar-hover-l1":"#333140","--dsw-alias-scrollbar-hover-l2":"#3b3948","--dsw-alias-switch-thumb":"#807e91","--dsw-alias-toast-bg":"#302d3c","--dsw-alias-toast-label":"#d5d2eb","--dsw-alias-tooltip-bg":"#333140","--dsw-alias-menu-group-header-fill":"#22202e","--dsw-menu-surface-fill":"#262432","--dsw-specific-sidebar-fill":"#211e2c","--dsw-specific-sidebar-nav-item-active":"#2c2a38","--dsw-specific-bubble":"#22202e","--dsw-specific-input-major":"#242230","--dsw-specific-menu":"#262432","--dsw-specific-selector":"#242230","--dsw-specific-tip":"#22202e","--dsw-alias-file-diff-added-bg":"#1e2a29","--dsw-alias-file-diff-deleted-bg":"#322231","--dsw-alias-code-diff-added":"#20342c","--dsw-alias-code-diff-deleted":"#3f2738","--dsw-font-markdown-base-strong-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small":"12px/20px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11":"11px/14px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16":"16px/24px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4":"600 14px / calc(24px + calc(14px - 14px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2":"700 calc(19px + calc(14px - 14px)) / calc(28px + calc(14px - 14px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong":"600 14px / calc(24px + calc(14px - 14px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic":"italic 14px / calc(24px + calc(14px - 14px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1":"700 calc(21px + calc(14px - 14px)) / calc(30px + calc(14px - 14px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3":"700 calc(18px + calc(14px - 14px)) / calc(26px + calc(14px - 14px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base":"14px / calc(24px + calc(14px - 14px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16":"500 16px/24px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12":"12px/18px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong":"600 12px/20px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24":"600 24px/32px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14":"500 14px/22px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic":"italic 12px/20px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11":"500 11px/14px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic":"italic 600 14px / calc(24px + calc(14px - 14px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic":"italic 600 12px/20px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table":"min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13":"13px/20px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14":"14px/22px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12":"500 12px/18px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head":"500 min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13":"500 13px/20px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18":"500 16px/28px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family-brand":"\"Manrope\", \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20":"500 20px/28px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-elevation-soft":"0 0 0 .5px rgba(28, 18, 18, 0.20), 0 4px 16px rgba(28, 18, 18, 0.30)","--dsw-elevation-panel":"0 0 0 .5px rgba(28, 18, 18, 0.20), 0 12px 32px rgba(28, 18, 18, 0.40)","--dsw-elevation-prominent":"0 0 0 .5px rgba(28, 18, 18, 0.20), 0 24px 48px rgba(28, 18, 18, 0.50)","--dsw-alias-markdown-inline-code":"#2a2836","--dsw-alias-json-tree-hover":"#262432","--dsw-alias-json-tree-property":"#9b97b4","--dsw-alias-json-tree-punctuation":"#817d97","--dsw-alias-json-tree-number":"#ebbcba","--dsw-alias-json-tree-keyword":"#ebbcba","--dsw-alias-json-tree-icon":"#817d97","--dsw-alias-state-idle-primary":"#817d97","--dsw-alias-state-done-primary":"#3fb950","--dsw-alias-state-business-primary":"#ebbcba","--dsw-alias-state-warn-secondary":"#f59e0b","--dsw-alias-state-warn-tertiary":"#f59e0b","--dsw-alias-state-success-secondary":"#3fb950","--dsw-alias-state-success-tertiary":"#3fb950","--dsw-alias-border-selected":"#ebbcba","--dsw-alias-border-inverted":"#2c2a38","--dsw-alias-border-inverted2":"#2c2a38","--dsw-alias-card-fill":"#1f1d2a","--dsw-alias-card-tile-fill":"#22202e","--dsw-alias-settings-card-fill":"#1f1d2a","--dsw-alias-settings-card-stroke":"#333140","--dsw-alias-onboarding-card-fill":"#1f1d2a","--dsw-alias-label-document-preview":"#9b97b4","--dsw-alias-label-primary-bluish":"#d5d2eb","--dsw-alias-label-shimmer":"#817d97","--dsw-alias-label-deep-diving-shimmer":"#817d97","--dsw-alias-label-on-color":"#3f2224","--dsw-alias-hovercard-label-primary":"#d5d2eb","--dsw-alias-hovercard-label-secondary":"#9b97b4","--dsw-alias-hovercard-label-tertiary":"#817d97","--dsw-alias-hovercard-state-error":"#eb6f92","--dsw-alias-hovercard-state-done":"#3fb950","--dsw-alias-bg-mask-1":"#14121d","--dsw-alias-bg-mask-2":"#14121d","--dsw-alias-bg-mask-3":"#14121d","--dsw-alias-bg-mask-photo":"#14121d","--dsw-alias-bg-document-selection":"#362e39","--dsw-alias-button-info-fill":"#ebbcba","--dsw-alias-button-info-hover":"#ebbcba","--dsw-alias-button-tool-bar-fill":"#282634","--dsw-alias-button-tool-bar-fill-invisible":"#14121d","--dsw-alias-button-tool-bar-hover":"#2e2c3a","--dsw-alias-chart-tools":"#817d97","--dsw-alias-chart-messages":"#9b97b4","--dsw-alias-chart-system":"#ebbcba","--dsw-alias-illustration-surface":"#22202e","--dsw-alias-illustration-shadow":"#333140","--dsw-alias-illustration-backing":"#262432","--dsw-alias-trajectory-accent":"#ebbcba","--dsw-alias-menu-icon":"#9b97b4","--dsw-alias-tooltip-label":"#3f2224","--dsw-alias-tooltip-key-bg":"#262432","--dsw-alias-toast-action":"#ebbcba","--dsw-alias-onboarding-accent":"#ebbcba","--dsw-alias-onboarding-checkbox-border":"#3b3948","--dsw-alias-turn-trigger-bg":"#262432","--dsw-alias-turn-trigger-bg-hover":"#2a2836","--dsw-alias-file-diff-added-gutter":"#1e2a29","--dsw-alias-file-diff-deleted-gutter":"#322231","--dsw-alias-file-diff-added-marker":"#20342c","--dsw-alias-file-diff-deleted-marker":"#3f2738","--dsw-alias-bg-document-preview":"#22202e","--dsw-alias-bg-multi-select":"#262432","--dsw-alias-border-l2-darkmode-thin":"#2c2a37","--dsw-alias-card-fill-hover":"#292637","--dsw-alias-hovercard-bg":"#2c2a38","--dsw-alias-illustration-background":"#1f1d2a","--dsw-alias-illustration-detail":"#9b97b4","--dsw-alias-illustration-inset":"#262432","--dsw-alias-json-tree-string":"#3fb950","--dsw-alias-label-deep-diving":"#817d97","--dsw-alias-onboarding-secondary-fill":"#22202e","--dsw-alias-state-business-tertiary":"#fdf7f7","--dsw-specific-bubble-highlight":"#2f2d40","--dsw-specific-file-upload-track":"#22202e","--dsw-specific-guide-hero":"#1f1d2a","--dsw-specific-login-input":"#22202e","--dsw-specific-sidebar-glass-fill":"#282435","--dsw-specific-sidebar-glass-hover":"#242230","--dsw-specific-sidebar-glass-collapsed-fill":"#262232","--dsw-specific-sidebar-glass-collapsed-hover":"#242230","--dsw-specific-sidebar-nav-item-active-accent":"#ebbcba","--dsw-specific-sidebar-right-flash":"#e09692","--dsw-specific-sidebar-tint":"#211e2c","--dsw-specific-sidebar-wash-top":"#211e2c","--dsw-specific-sidebar-wash-top-clear":"#211e2c","--dsw-specific-sidebar-wash-bottom":"#211e2c","--dsw-specific-sidebar-wash-bottom-clear":"#211e2c","--dsw-alias-brand-primary-new-colorprimary-new-color":"#ebbcba","--dsw-linear-gradient-think":"linear-gradient(180deg, #191724 20.19%, #19172400 100%)","--dsw-linear-think-select":"linear-gradient(180deg, #22202e 20.19%, #22202e00 100%)"},"light":{"--dsw-alias-bg-base":"#f1eeea","--dsw-alias-bg-layer-1":"#edeae7","--dsw-alias-bg-layer-2":"#ece9e6","--dsw-alias-bg-layer-3":"#eae7e4","--dsw-alias-bg-layer-4":"#e8e5e3","--dsw-alias-bg-overlay":"#eae7e4","--dsw-alias-bg-skeleton":"#eae7e4","--dsw-alias-bg-module-platform":"#ece9e6","--dsw-alias-bg-mask-drop":"#c1bebb","--dsw-alias-label-primary":"#3e3857","--dsw-alias-label-primary-dimmed":"#292339","--dsw-alias-label-primary-foreground":"#ffffff","--dsw-alias-label-primary-inverted":"#292339","--dsw-alias-label-secondary":"#665d87","--dsw-alias-label-tertiary":"#6f6688","--dsw-alias-label-caption":"#6c6486","--dsw-alias-label-dimmed":"#6d6584","--dsw-alias-label-error":"#a63d57","--dsw-alias-brand-primary":"#9c4f66","--dsw-alias-brand-primary-invert":"#9c4f66","--dsw-alias-brand-text":"#9c4f66","--dsw-alias-link":"#9c4f66","--dsw-alias-border-l1":"#e3dfde","--dsw-alias-border-l2":"#dddada","--dsw-alias-border-l3":"#d8d5d5","--dsw-alias-border-l4":"#d1cdd0","--dsw-alias-interactive-bg-hover":"#eae7e4","--dsw-alias-interactive-bg-hover-solid":"#e6e3e1","--dsw-alias-interactive-bg-active":"#e4e1e0","--dsw-alias-interactive-bg-hover-accent":"#e9dedd","--dsw-alias-interactive-bg-hover-danger":"#eadcdb","--dsw-alias-button-primary-fill":"#9c4f66","--dsw-alias-button-primary-hover":"#9c4f66","--dsw-alias-button-primary-dimmed":"#e7dbda","--dsw-alias-button-elevated-fill":"#edeae7","--dsw-alias-button-floating-fill":"#ece9e6","--dsw-alias-button-floating-hover":"#e6e3e1","--dsw-alias-button-contrast-fill":"#59536d","--dsw-alias-button-ghost-active-fill":"#e8e5e3","--dsw-alias-button-ghost-active-hover":"#e4e1e0","--dsw-alias-button-ghost-active-border":"#dcd8d8","--dsw-alias-state-error-primary":"#a63d57","--dsw-alias-state-error-secondary":"#e8d9d8","--dsw-alias-state-success-primary":"#2a7c35","--dsw-alias-state-warn-primary":"#92400e","--dsw-alias-state-warn-label":"#92400e","--dsw-alias-markdown-code-block":"#ece9e6","--dsw-alias-markdown-code-block-banner":"#eae7e4","--dsw-alias-markdown-citation":"#ece9e6","--dsw-alias-markdown-placeholder":"#eae7e4","--dsw-alias-markdown-tag":"#e8e5e3","--dsw-alias-markdown-code-segment-selected":"#eae7e4","--dsw-alias-markdown-code-segment-unselected":"#edeae7","--dsw-alias-scrollbar-bg-l1":"#e8e5e3","--dsw-alias-scrollbar-bg-l2":"#e3dfde","--dsw-alias-scrollbar-hover-l1":"#dfdcdb","--dsw-alias-scrollbar-hover-l2":"#dad6d7","--dsw-alias-switch-thumb":"#ffffff","--dsw-alias-toast-bg":"#59536d","--dsw-alias-toast-label":"#f1eeea","--dsw-alias-tooltip-bg":"#5e5971","--dsw-alias-menu-group-header-fill":"#ece9e6","--dsw-menu-surface-fill":"#ece9e6","--dsw-specific-sidebar-fill":"#ece9e6","--dsw-specific-sidebar-nav-item-active":"#e6e3e1","--dsw-specific-bubble":"#ece9e6","--dsw-specific-input-major":"#ece9e6","--dsw-specific-menu":"#ece9e6","--dsw-specific-selector":"#ece9e6","--dsw-specific-tip":"#ece9e6","--dsw-alias-file-diff-added-bg":"#e3eade","--dsw-alias-file-diff-deleted-bg":"#ebe0de","--dsw-alias-code-diff-added":"#dce8d8","--dsw-alias-code-diff-deleted":"#e8d9d8","--dsw-font-markdown-base-strong-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small":"12px/20px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11":"11px/14px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16":"16px/24px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4":"600 14px / calc(24px + calc(14px - 14px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2":"700 calc(19px + calc(14px - 14px)) / calc(28px + calc(14px - 14px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong":"600 14px / calc(24px + calc(14px - 14px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic":"italic 14px / calc(24px + calc(14px - 14px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1":"700 calc(21px + calc(14px - 14px)) / calc(30px + calc(14px - 14px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3":"700 calc(18px + calc(14px - 14px)) / calc(26px + calc(14px - 14px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base":"14px / calc(24px + calc(14px - 14px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16":"500 16px/24px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12":"12px/18px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong":"600 12px/20px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24":"600 24px/32px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14":"500 14px/22px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic":"italic 12px/20px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11":"500 11px/14px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic":"italic 600 14px / calc(24px + calc(14px - 14px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic":"italic 600 12px/20px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table":"min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13":"13px/20px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14":"14px/22px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12":"500 12px/18px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head":"500 min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13":"500 13px/20px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18":"500 16px/28px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family-brand":"\"Manrope\", \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20":"500 20px/28px \"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12-font-family":"\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-elevation-soft":"0 0 0 .5px rgba(40, 26, 30, 0.15), 0 4px 14px rgba(40, 26, 30, 0.07)","--dsw-elevation-panel":"0 0 0 .5px rgba(40, 26, 30, 0.15), 0 12px 30px rgba(40, 26, 30, 0.09)","--dsw-elevation-prominent":"0 0 0 .5px rgba(40, 26, 30, 0.15), 0 24px 50px rgba(40, 26, 30, 0.11)","--dsw-alias-markdown-inline-code":"#e8e5e3","--dsw-alias-json-tree-hover":"#eae7e4","--dsw-alias-json-tree-property":"#665d87","--dsw-alias-json-tree-punctuation":"#8981a0","--dsw-alias-json-tree-number":"#9c4f66","--dsw-alias-json-tree-keyword":"#9c4f66","--dsw-alias-json-tree-icon":"#8981a0","--dsw-alias-state-idle-primary":"#8981a0","--dsw-alias-state-done-primary":"#3fb950","--dsw-alias-state-business-primary":"#9c4f66","--dsw-alias-state-warn-secondary":"#92400e","--dsw-alias-state-warn-tertiary":"#92400e","--dsw-alias-state-success-secondary":"#3fb950","--dsw-alias-state-success-tertiary":"#3fb950","--dsw-alias-border-selected":"#9c4f66","--dsw-alias-border-inverted":"#e3dfde","--dsw-alias-border-inverted2":"#e3dfde","--dsw-alias-card-fill":"#edeae7","--dsw-alias-card-tile-fill":"#ece9e6","--dsw-alias-settings-card-fill":"#edeae7","--dsw-alias-settings-card-stroke":"#dddada","--dsw-alias-onboarding-card-fill":"#edeae7","--dsw-alias-label-document-preview":"#665d87","--dsw-alias-label-primary-bluish":"#3e3857","--dsw-alias-label-shimmer":"#8981a0","--dsw-alias-label-deep-diving-shimmer":"#8981a0","--dsw-alias-label-on-color":"#ffffff","--dsw-alias-hovercard-label-primary":"#3e3857","--dsw-alias-hovercard-label-secondary":"#665d87","--dsw-alias-hovercard-label-tertiary":"#8981a0","--dsw-alias-hovercard-state-error":"#a63d57","--dsw-alias-hovercard-state-done":"#3fb950","--dsw-alias-bg-mask-1":"#c1bebb","--dsw-alias-bg-mask-2":"#c1bebb","--dsw-alias-bg-mask-3":"#c1bebb","--dsw-alias-bg-mask-photo":"#c1bebb","--dsw-alias-bg-document-selection":"#e9dedd","--dsw-alias-button-info-fill":"#9c4f66","--dsw-alias-button-info-hover":"#9c4f66","--dsw-alias-button-tool-bar-fill":"#ece9e6","--dsw-alias-button-tool-bar-fill-invisible":"#c1bebb","--dsw-alias-button-tool-bar-hover":"#e6e3e1","--dsw-alias-chart-tools":"#8981a0","--dsw-alias-chart-messages":"#665d87","--dsw-alias-chart-system":"#9c4f66","--dsw-alias-illustration-surface":"#ece9e6","--dsw-alias-illustration-shadow":"#dddada","--dsw-alias-illustration-backing":"#eae7e4","--dsw-alias-trajectory-accent":"#9c4f66","--dsw-alias-menu-icon":"#665d87","--dsw-alias-tooltip-label":"#ffffff","--dsw-alias-tooltip-key-bg":"#eae7e4","--dsw-alias-toast-action":"#9c4f66","--dsw-alias-onboarding-accent":"#9c4f66","--dsw-alias-onboarding-checkbox-border":"#d8d5d5","--dsw-alias-turn-trigger-bg":"#eae7e4","--dsw-alias-turn-trigger-bg-hover":"#e6e3e1","--dsw-alias-file-diff-added-gutter":"#e3eade","--dsw-alias-file-diff-deleted-gutter":"#ebe0de","--dsw-alias-file-diff-added-marker":"#dce8d8","--dsw-alias-file-diff-deleted-marker":"#e8d9d8","--dsw-alias-bg-document-preview":"#ece9e6","--dsw-alias-bg-multi-select":"#eae7e4","--dsw-alias-border-l2-darkmode-thin":"#d6d2d2","--dsw-alias-card-fill-hover":"#f3f1ef","--dsw-alias-hovercard-bg":"#e8e5e3","--dsw-alias-illustration-background":"#edeae7","--dsw-alias-illustration-detail":"#665d87","--dsw-alias-illustration-inset":"#eae7e4","--dsw-alias-json-tree-string":"#3fb950","--dsw-alias-label-deep-diving":"#8981a0","--dsw-alias-onboarding-secondary-fill":"#ece9e6","--dsw-alias-state-business-tertiary":"#c18597","--dsw-specific-bubble-highlight":"#f9f8f7","--dsw-specific-file-upload-track":"#ece9e6","--dsw-specific-guide-hero":"#edeae7","--dsw-specific-login-input":"#ece9e6","--dsw-specific-sidebar-glass-fill":"#f3f1ef","--dsw-specific-sidebar-glass-hover":"#eae7e4","--dsw-specific-sidebar-glass-collapsed-fill":"#f0eeec","--dsw-specific-sidebar-glass-collapsed-hover":"#eae7e4","--dsw-specific-sidebar-nav-item-active-accent":"#9c4f66","--dsw-specific-sidebar-right-flash":"#7a3e50","--dsw-specific-sidebar-tint":"#ece9e6","--dsw-specific-sidebar-wash-top":"#ece9e6","--dsw-specific-sidebar-wash-top-clear":"#ece9e6","--dsw-specific-sidebar-wash-bottom":"#ece9e6","--dsw-specific-sidebar-wash-bottom-clear":"#ece9e6","--dsw-alias-brand-primary-new-colorprimary-new-color":"#9c4f66","--dsw-linear-gradient-think":"linear-gradient(180deg, #f1eeea 20.19%, #f1eeea00 100%)","--dsw-linear-think-select":"linear-gradient(180deg, #ece9e6 20.19%, #ece9e600 100%)"},"label":"@theme.rose"},"tide":{"dark":{"--dsw-alias-bg-base":"#10151b","--dsw-alias-bg-layer-1":"#161b21","--dsw-alias-bg-layer-2":"#191e25","--dsw-alias-bg-layer-3":"#1d2228","--dsw-alias-bg-layer-4":"#21262c","--dsw-alias-bg-overlay":"#1f242a","--dsw-alias-bg-skeleton":"#1b2026","--dsw-alias-bg-module-platform":"#1b2026","--dsw-alias-bg-mask-drop":"#0d1116","--dsw-alias-label-primary":"#c9d2da","--dsw-alias-label-primary-dimmed":"#eef3f8","--dsw-alias-label-primary-foreground":"#0b1116","--dsw-alias-label-primary-inverted":"#eef3f8","--dsw-alias-label-secondary":"#9dabb9","--dsw-alias-label-tertiary":"#818d99","--dsw-alias-label-caption":"#8f9ca9","--dsw-alias-label-dimmed":"#78838f","--dsw-alias-label-error":"#dd5d5d","--dsw-alias-brand-primary":"#5ab6d8","--dsw-alias-brand-primary-invert":"#5ab6d8","--dsw-alias-brand-text":"#5ab6d8","--dsw-alias-link":"#5ab6d8","--dsw-alias-border-l1":"#22282e","--dsw-alias-border-l2":"#2a2f36","--dsw-alias-border-l3":"#31373d","--dsw-alias-border-l4":"#3c4249","--dsw-alias-interactive-bg-hover":"#1d2228","--dsw-alias-interactive-bg-hover-solid":"#21262c","--dsw-alias-interactive-bg-active":"#242a30","--dsw-alias-interactive-bg-hover-accent":"#1a2c35","--dsw-alias-interactive-bg-hover-danger":"#2b191e","--dsw-alias-button-primary-fill":"#5ab6d8","--dsw-alias-button-primary-hover":"#7ac8e4","--dsw-alias-button-primary-dimmed":"#1c2f39","--dsw-alias-button-elevated-fill":"#191e25","--dsw-alias-button-floating-fill":"#1f242a","--dsw-alias-button-floating-hover":"#242a30","--dsw-alias-button-contrast-fill":"#f2f6fa","--dsw-alias-button-ghost-active-fill":"#1f242a","--dsw-alias-button-ghost-active-hover":"#242a30","--dsw-alias-button-ghost-active-border":"#2e333a","--dsw-alias-state-error-primary":"#dd5d5d","--dsw-alias-state-error-secondary":"#331a1f","--dsw-alias-state-success-primary":"#3fb950","--dsw-alias-state-warn-primary":"#f59e0b","--dsw-alias-state-warn-label":"#f59e0b","--dsw-alias-markdown-code-block":"#191e25","--dsw-alias-markdown-code-block-banner":"#1f242a","--dsw-alias-markdown-citation":"#1b2026","--dsw-alias-markdown-placeholder":"#1d2228","--dsw-alias-markdown-tag":"#21262c","--dsw-alias-markdown-code-segment-selected":"#1f242a","--dsw-alias-markdown-code-segment-unselected":"#171d23","--dsw-alias-scrollbar-bg-l1":"#1f242a","--dsw-alias-scrollbar-bg-l2":"#262c32","--dsw-alias-scrollbar-hover-l1":"#2a2f36","--dsw-alias-scrollbar-hover-l2":"#31373d","--dsw-alias-switch-thumb":"#767d84","--dsw-alias-toast-bg":"#262c32","--dsw-alias-toast-label":"#c9d2da","--dsw-alias-tooltip-bg":"#2a2f36","--dsw-alias-menu-group-header-fill":"#191e25","--dsw-menu-surface-fill":"#1d2228","--dsw-specific-sidebar-fill":"#171d23","--dsw-specific-sidebar-nav-item-active":"#22282e","--dsw-specific-bubble":"#191e25","--dsw-specific-input-major":"#1b2026","--dsw-specific-menu":"#1d2228","--dsw-specific-selector":"#1b2026","--dsw-specific-tip":"#191e25","--dsw-alias-file-diff-added-bg":"#162921","--dsw-alias-file-diff-deleted-bg":"#27181d","--dsw-alias-code-diff-added":"#183325","--dsw-alias-code-diff-deleted":"#331a1f","--dsw-font-markdown-base-strong-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small":"12px/20px \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11":"11px/14px \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16":"16px/24px \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4":"600 14px / calc(24px + calc(14px - 14px)) \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2":"700 calc(19px + calc(14px - 14px)) / calc(28px + calc(14px - 14px)) \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong":"600 14px / calc(24px + calc(14px - 14px)) \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic":"italic 14px / calc(24px + calc(14px - 14px)) \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1":"700 calc(21px + calc(14px - 14px)) / calc(30px + calc(14px - 14px)) \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3":"700 calc(18px + calc(14px - 14px)) / calc(26px + calc(14px - 14px)) \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base":"14px / calc(24px + calc(14px - 14px)) \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16":"500 16px/24px \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12":"12px/18px \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong":"600 12px/20px \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24":"600 24px/32px \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14":"500 14px/22px \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic":"italic 12px/20px \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11":"500 11px/14px \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic":"italic 600 14px / calc(24px + calc(14px - 14px)) \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic":"italic 600 12px/20px \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table":"min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13":"13px/20px \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14":"14px/22px \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12":"500 12px/18px \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head":"500 min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13":"500 13px/20px \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18":"500 16px/28px \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family-brand":"\"Manrope\", \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20":"500 20px/28px \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-elevation-soft":"0 0 0 .5px rgba(18, 25, 28, 0.20), 0 4px 16px rgba(18, 25, 28, 0.30)","--dsw-elevation-panel":"0 0 0 .5px rgba(18, 25, 28, 0.20), 0 12px 32px rgba(18, 25, 28, 0.40)","--dsw-elevation-prominent":"0 0 0 .5px rgba(18, 25, 28, 0.20), 0 24px 48px rgba(18, 25, 28, 0.50)","--dsw-alias-markdown-inline-code":"#21262c","--dsw-alias-json-tree-hover":"#1d2228","--dsw-alias-json-tree-property":"#9dabb9","--dsw-alias-json-tree-punctuation":"#818d99","--dsw-alias-json-tree-number":"#5ab6d8","--dsw-alias-json-tree-keyword":"#5ab6d8","--dsw-alias-json-tree-icon":"#818d99","--dsw-alias-state-idle-primary":"#818d99","--dsw-alias-state-done-primary":"#3fb950","--dsw-alias-state-business-primary":"#5ab6d8","--dsw-alias-state-warn-secondary":"#f59e0b","--dsw-alias-state-warn-tertiary":"#f59e0b","--dsw-alias-state-success-secondary":"#3fb950","--dsw-alias-state-success-tertiary":"#3fb950","--dsw-alias-border-selected":"#5ab6d8","--dsw-alias-border-inverted":"#22282e","--dsw-alias-border-inverted2":"#22282e","--dsw-alias-card-fill":"#161b21","--dsw-alias-card-tile-fill":"#191e25","--dsw-alias-settings-card-fill":"#161b21","--dsw-alias-settings-card-stroke":"#2a2f36","--dsw-alias-onboarding-card-fill":"#161b21","--dsw-alias-label-document-preview":"#9dabb9","--dsw-alias-label-primary-bluish":"#c9d2da","--dsw-alias-label-shimmer":"#818d99","--dsw-alias-label-deep-diving-shimmer":"#818d99","--dsw-alias-label-on-color":"#0b1116","--dsw-alias-hovercard-label-primary":"#c9d2da","--dsw-alias-hovercard-label-secondary":"#9dabb9","--dsw-alias-hovercard-label-tertiary":"#818d99","--dsw-alias-hovercard-state-error":"#d32f2f","--dsw-alias-hovercard-state-done":"#3fb950","--dsw-alias-bg-mask-1":"#0d1116","--dsw-alias-bg-mask-2":"#0d1116","--dsw-alias-bg-mask-3":"#0d1116","--dsw-alias-bg-mask-photo":"#0d1116","--dsw-alias-bg-document-selection":"#1a2c35","--dsw-alias-button-info-fill":"#5ab6d8","--dsw-alias-button-info-hover":"#5ab6d8","--dsw-alias-button-tool-bar-fill":"#1f242a","--dsw-alias-button-tool-bar-fill-invisible":"#0d1116","--dsw-alias-button-tool-bar-hover":"#242a30","--dsw-alias-chart-tools":"#818d99","--dsw-alias-chart-messages":"#9dabb9","--dsw-alias-chart-system":"#5ab6d8","--dsw-alias-illustration-surface":"#191e25","--dsw-alias-illustration-shadow":"#2a2f36","--dsw-alias-illustration-backing":"#1d2228","--dsw-alias-trajectory-accent":"#5ab6d8","--dsw-alias-menu-icon":"#9dabb9","--dsw-alias-tooltip-label":"#0b1116","--dsw-alias-tooltip-key-bg":"#1d2228","--dsw-alias-toast-action":"#5ab6d8","--dsw-alias-onboarding-accent":"#5ab6d8","--dsw-alias-onboarding-checkbox-border":"#31373d","--dsw-alias-turn-trigger-bg":"#1d2228","--dsw-alias-turn-trigger-bg-hover":"#21262c","--dsw-alias-file-diff-added-gutter":"#162921","--dsw-alias-file-diff-deleted-gutter":"#27181d","--dsw-alias-file-diff-added-marker":"#183325","--dsw-alias-file-diff-deleted-marker":"#331a1f","--dsw-alias-bg-document-preview":"#191e25","--dsw-alias-bg-multi-select":"#1d2228","--dsw-alias-border-l2-darkmode-thin":"#23282d","--dsw-alias-card-fill-hover":"#1f252e","--dsw-alias-hovercard-bg":"#22282e","--dsw-alias-illustration-background":"#161b21","--dsw-alias-illustration-detail":"#9dabb9","--dsw-alias-illustration-inset":"#1d2228","--dsw-alias-json-tree-string":"#3fb950","--dsw-alias-label-deep-diving":"#818d99","--dsw-alias-onboarding-secondary-fill":"#191e25","--dsw-alias-state-business-tertiary":"#a4d7ea","--dsw-specific-bubble-highlight":"#252d37","--dsw-specific-file-upload-track":"#191e25","--dsw-specific-guide-hero":"#161b21","--dsw-specific-login-input":"#191e25","--dsw-specific-sidebar-glass-fill":"#1d252c","--dsw-specific-sidebar-glass-hover":"#1b2026","--dsw-specific-sidebar-glass-collapsed-fill":"#1b2229","--dsw-specific-sidebar-glass-collapsed-hover":"#1b2026","--dsw-specific-sidebar-nav-item-active-accent":"#5ab6d8","--dsw-specific-sidebar-right-flash":"#31a4ce","--dsw-specific-sidebar-tint":"#171d23","--dsw-specific-sidebar-wash-top":"#171d23","--dsw-specific-sidebar-wash-top-clear":"#171d23","--dsw-specific-sidebar-wash-bottom":"#171d23","--dsw-specific-sidebar-wash-bottom-clear":"#171d23","--dsw-alias-brand-primary-new-colorprimary-new-color":"#5ab6d8","--dsw-linear-gradient-think":"linear-gradient(180deg, #10151b 20.19%, #10151b00 100%)","--dsw-linear-think-select":"linear-gradient(180deg, #191e25 20.19%, #191e2500 100%)"},"light":{"--dsw-alias-bg-base":"#f1f3f5","--dsw-alias-bg-layer-1":"#edeff1","--dsw-alias-bg-layer-2":"#ebeef0","--dsw-alias-bg-layer-3":"#e9ecee","--dsw-alias-bg-layer-4":"#e8eaec","--dsw-alias-bg-overlay":"#e9ecee","--dsw-alias-bg-skeleton":"#e9ecee","--dsw-alias-bg-module-platform":"#ebeef0","--dsw-alias-bg-mask-drop":"#c1c2c4","--dsw-alias-label-primary":"#333c45","--dsw-alias-label-primary-dimmed":"#1b232b","--dsw-alias-label-primary-foreground":"#ffffff","--dsw-alias-label-primary-inverted":"#1b232b","--dsw-alias-label-secondary":"#5f6b76","--dsw-alias-label-tertiary":"#666e77","--dsw-alias-label-caption":"#677078","--dsw-alias-label-dimmed":"#646d75","--dsw-alias-label-error":"#cf2121","--dsw-alias-brand-primary":"#1f6f8f","--dsw-alias-brand-primary-invert":"#1f6f8f","--dsw-alias-brand-text":"#1f6f8f","--dsw-alias-link":"#1f6f8f","--dsw-alias-border-l1":"#e2e4e7","--dsw-alias-border-l2":"#dcdfe2","--dsw-alias-border-l3":"#d6d9dc","--dsw-alias-border-l4":"#cfd2d5","--dsw-alias-interactive-bg-hover":"#e9ecee","--dsw-alias-interactive-bg-hover-solid":"#e6e8ea","--dsw-alias-interactive-bg-active":"#e4e6e9","--dsw-alias-interactive-bg-hover-accent":"#dce6eb","--dsw-alias-interactive-bg-hover-danger":"#efdfe0","--dsw-alias-button-primary-fill":"#1f6f8f","--dsw-alias-button-primary-hover":"#1f6f8f","--dsw-alias-button-primary-dimmed":"#d8e3e9","--dsw-alias-button-elevated-fill":"#edeff1","--dsw-alias-button-floating-fill":"#ebeef0","--dsw-alias-button-floating-hover":"#e6e8ea","--dsw-alias-button-contrast-fill":"#50575f","--dsw-alias-button-ghost-active-fill":"#e8eaec","--dsw-alias-button-ghost-active-hover":"#e4e6e9","--dsw-alias-button-ghost-active-border":"#dadde0","--dsw-alias-state-error-primary":"#cf2121","--dsw-alias-state-error-secondary":"#eedadc","--dsw-alias-state-success-primary":"#2a7c35","--dsw-alias-state-warn-primary":"#92400e","--dsw-alias-state-warn-label":"#92400e","--dsw-alias-markdown-code-block":"#ebeef0","--dsw-alias-markdown-code-block-banner":"#e9ecee","--dsw-alias-markdown-citation":"#ebeef0","--dsw-alias-markdown-placeholder":"#e9ecee","--dsw-alias-markdown-tag":"#e8eaec","--dsw-alias-markdown-code-segment-selected":"#e9ecee","--dsw-alias-markdown-code-segment-unselected":"#edeff1","--dsw-alias-scrollbar-bg-l1":"#e8eaec","--dsw-alias-scrollbar-bg-l2":"#e2e4e7","--dsw-alias-scrollbar-hover-l1":"#dee1e3","--dsw-alias-scrollbar-hover-l2":"#d8dbde","--dsw-alias-switch-thumb":"#ffffff","--dsw-alias-toast-bg":"#50575f","--dsw-alias-toast-label":"#f1f3f5","--dsw-alias-tooltip-bg":"#555d65","--dsw-alias-menu-group-header-fill":"#ebeef0","--dsw-menu-surface-fill":"#ebeef0","--dsw-specific-sidebar-fill":"#ebeef0","--dsw-specific-sidebar-nav-item-active":"#e6e8ea","--dsw-specific-bubble":"#ebeef0","--dsw-specific-input-major":"#ebeef0","--dsw-specific-menu":"#ebeef0","--dsw-specific-selector":"#ebeef0","--dsw-specific-tip":"#ebeef0","--dsw-alias-file-diff-added-bg":"#e3eee8","--dsw-alias-file-diff-deleted-bg":"#efe3e4","--dsw-alias-code-diff-added":"#dcece1","--dsw-alias-code-diff-deleted":"#eedadc","--dsw-font-markdown-base-strong-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small":"12px/20px \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11":"11px/14px \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16":"16px/24px \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4":"600 14px / calc(24px + calc(14px - 14px)) \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2":"700 calc(19px + calc(14px - 14px)) / calc(28px + calc(14px - 14px)) \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong":"600 14px / calc(24px + calc(14px - 14px)) \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-italic":"italic 14px / calc(24px + calc(14px - 14px)) \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1":"700 calc(21px + calc(14px - 14px)) / calc(30px + calc(14px - 14px)) \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3":"700 calc(18px + calc(14px - 14px)) / calc(26px + calc(14px - 14px)) \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-11-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base":"14px / calc(24px + calc(14px - 14px)) \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16":"500 16px/24px \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12":"12px/18px \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong":"600 12px/20px \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-strong-16-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24":"600 24px/32px \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-strong-14":"500 14px/22px \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic":"italic 12px/20px \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxxs-strong-11":"500 11px/14px \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-base-strong-italic":"italic 600 14px / calc(24px + calc(14px - 14px)) \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-strong-italic":"italic 600 12px/20px \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table":"min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h2-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xl-24-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-13":"13px/20px \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-base-16-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-s-14":"14px/22px \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h1-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h3-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-strong-12":"500 12px/18px \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-table-head":"500 min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xs-strong-13":"500 13px/20px \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-m-18":"500 16px/28px \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-small-italic-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-family-brand":"\"Manrope\", \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-l-20":"500 20px/28px \"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-markdown-h4-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-font-xxs-12-font-family":"\"IBM Plex Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif","--dsw-elevation-soft":"0 0 0 .5px rgba(26, 36, 40, 0.15), 0 4px 14px rgba(26, 36, 40, 0.07)","--dsw-elevation-panel":"0 0 0 .5px rgba(26, 36, 40, 0.15), 0 12px 30px rgba(26, 36, 40, 0.09)","--dsw-elevation-prominent":"0 0 0 .5px rgba(26, 36, 40, 0.15), 0 24px 50px rgba(26, 36, 40, 0.11)","--dsw-alias-markdown-inline-code":"#e8eaec","--dsw-alias-json-tree-hover":"#e9ecee","--dsw-alias-json-tree-property":"#5f6b76","--dsw-alias-json-tree-punctuation":"#848d96","--dsw-alias-json-tree-number":"#1f6f8f","--dsw-alias-json-tree-keyword":"#1f6f8f","--dsw-alias-json-tree-icon":"#848d96","--dsw-alias-state-idle-primary":"#848d96","--dsw-alias-state-done-primary":"#3fb950","--dsw-alias-state-business-primary":"#1f6f8f","--dsw-alias-state-warn-secondary":"#92400e","--dsw-alias-state-warn-tertiary":"#92400e","--dsw-alias-state-success-secondary":"#3fb950","--dsw-alias-state-success-tertiary":"#3fb950","--dsw-alias-border-selected":"#1f6f8f","--dsw-alias-border-inverted":"#e2e4e7","--dsw-alias-border-inverted2":"#e2e4e7","--dsw-alias-card-fill":"#edeff1","--dsw-alias-card-tile-fill":"#ebeef0","--dsw-alias-settings-card-fill":"#edeff1","--dsw-alias-settings-card-stroke":"#dcdfe2","--dsw-alias-onboarding-card-fill":"#edeff1","--dsw-alias-label-document-preview":"#5f6b76","--dsw-alias-label-primary-bluish":"#333c45","--dsw-alias-label-shimmer":"#848d96","--dsw-alias-label-deep-diving-shimmer":"#848d96","--dsw-alias-label-on-color":"#ffffff","--dsw-alias-hovercard-label-primary":"#333c45","--dsw-alias-hovercard-label-secondary":"#5f6b76","--dsw-alias-hovercard-label-tertiary":"#848d96","--dsw-alias-hovercard-state-error":"#dc2626","--dsw-alias-hovercard-state-done":"#3fb950","--dsw-alias-bg-mask-1":"#c1c2c4","--dsw-alias-bg-mask-2":"#c1c2c4","--dsw-alias-bg-mask-3":"#c1c2c4","--dsw-alias-bg-mask-photo":"#c1c2c4","--dsw-alias-bg-document-selection":"#dce6eb","--dsw-alias-button-info-fill":"#1f6f8f","--dsw-alias-button-info-hover":"#1f6f8f","--dsw-alias-button-tool-bar-fill":"#ebeef0","--dsw-alias-button-tool-bar-fill-invisible":"#c1c2c4","--dsw-alias-button-tool-bar-hover":"#e6e8ea","--dsw-alias-chart-tools":"#848d96","--dsw-alias-chart-messages":"#5f6b76","--dsw-alias-chart-system":"#1f6f8f","--dsw-alias-illustration-surface":"#ebeef0","--dsw-alias-illustration-shadow":"#dcdfe2","--dsw-alias-illustration-backing":"#e9ecee","--dsw-alias-trajectory-accent":"#1f6f8f","--dsw-alias-menu-icon":"#5f6b76","--dsw-alias-tooltip-label":"#ffffff","--dsw-alias-tooltip-key-bg":"#e9ecee","--dsw-alias-toast-action":"#1f6f8f","--dsw-alias-onboarding-accent":"#1f6f8f","--dsw-alias-onboarding-checkbox-border":"#d6d9dc","--dsw-alias-turn-trigger-bg":"#e9ecee","--dsw-alias-turn-trigger-bg-hover":"#e6e8ea","--dsw-alias-file-diff-added-gutter":"#e3eee8","--dsw-alias-file-diff-deleted-gutter":"#efe3e4","--dsw-alias-file-diff-added-marker":"#dcece1","--dsw-alias-file-diff-deleted-marker":"#eedadc","--dsw-alias-bg-document-preview":"#ebeef0","--dsw-alias-bg-multi-select":"#e9ecee","--dsw-alias-border-l2-darkmode-thin":"#d4d7db","--dsw-alias-card-fill-hover":"#f4f5f7","--dsw-alias-hovercard-bg":"#e8eaec","--dsw-alias-illustration-background":"#edeff1","--dsw-alias-illustration-detail":"#5f6b76","--dsw-alias-illustration-inset":"#e9ecee","--dsw-alias-json-tree-string":"#3fb950","--dsw-alias-label-deep-diving":"#848d96","--dsw-alias-onboarding-secondary-fill":"#ebeef0","--dsw-alias-state-business-tertiary":"#36a7d3","--dsw-specific-bubble-highlight":"#f9fafb","--dsw-specific-file-upload-track":"#ebeef0","--dsw-specific-guide-hero":"#edeff1","--dsw-specific-login-input":"#ebeef0","--dsw-specific-sidebar-glass-fill":"#f4f5f7","--dsw-specific-sidebar-glass-hover":"#e9ecee","--dsw-specific-sidebar-glass-collapsed-fill":"#f1f3f4","--dsw-specific-sidebar-glass-collapsed-hover":"#e9ecee","--dsw-specific-sidebar-nav-item-active-accent":"#1f6f8f","--dsw-specific-sidebar-right-flash":"#164e65","--dsw-specific-sidebar-tint":"#ebeef0","--dsw-specific-sidebar-wash-top":"#ebeef0","--dsw-specific-sidebar-wash-top-clear":"#ebeef0","--dsw-specific-sidebar-wash-bottom":"#ebeef0","--dsw-specific-sidebar-wash-bottom-clear":"#ebeef0","--dsw-alias-brand-primary-new-colorprimary-new-color":"#1f6f8f","--dsw-linear-gradient-think":"linear-gradient(180deg, #f1f3f5 20.19%, #f1f3f500 100%)","--dsw-linear-think-select":"linear-gradient(180deg, #ebeef0 20.19%, #ebeef000 100%)"},"label":"@theme.tide"},"vintage-paper":{"dark":{"--dsw-alias-bg-base":"#2d2621","--dsw-alias-bg-layer-1":"#3a322c","--dsw-alias-bg-layer-2":"#362f29","--dsw-alias-bg-layer-3":"#312b26","--dsw-alias-bg-layer-4":"#453a32","--dsw-alias-bg-overlay":"#3a322c","--dsw-alias-bg-skeleton":"#312b26","--dsw-alias-bg-module-platform":"#2d2621","--dsw-alias-bg-mask-drop":"#201b17","--dsw-alias-label-primary":"#ece5d8","--dsw-alias-label-primary-dimmed":"#aaa59c","--dsw-alias-label-primary-foreground":"#2d2621","--dsw-alias-label-primary-inverted":"#aaa59c","--dsw-alias-label-secondary":"#c5bcac","--dsw-alias-label-tertiary":"#ccc3b4","--dsw-alias-label-caption":"#cfc7b7","--dsw-alias-label-dimmed":"#cdc4b5","--dsw-alias-label-error":"#d68272","--dsw-alias-brand-primary":"#c0a080","--dsw-alias-brand-primary-invert":"#c0a080","--dsw-alias-brand-text":"#c0a080","--dsw-alias-link":"#c0a080","--dsw-alias-border-l1":"#3a322c","--dsw-alias-border-l2":"#3a322c","--dsw-alias-border-l3":"#4a4039","--dsw-alias-border-l4":"#5d544c","--dsw-alias-interactive-bg-hover":"#3a332e","--dsw-alias-interactive-bg-hover-solid":"#39312b","--dsw-alias-interactive-bg-active":"#423c37","--dsw-alias-interactive-bg-hover-accent":"#3f352c","--dsw-alias-interactive-bg-hover-danger":"#402b24","--dsw-alias-button-primary-fill":"#c0a080","--dsw-alias-button-primary-hover":"#c8ab8f","--dsw-alias-button-primary-dimmed":"#4d4136","--dsw-alias-button-elevated-fill":"#3a322c","--dsw-alias-button-floating-fill":"#3a322c","--dsw-alias-button-floating-hover":"#453d36","--dsw-alias-button-contrast-fill":"#ece5d8","--dsw-alias-button-ghost-active-fill":"#3c3530","--dsw-alias-button-ghost-active-hover":"#443d37","--dsw-alias-button-ghost-active-border":"#5a5149","--dsw-alias-state-error-primary":"#d68272","--dsw-alias-state-error-secondary":"#412b24","--dsw-alias-state-success-primary":"#7fc98a","--dsw-alias-state-warn-primary":"#e0a341","--dsw-alias-state-warn-label":"#e0a341","--dsw-alias-markdown-code-block":"#362f29","--dsw-alias-markdown-code-block-banner":"#453e37","--dsw-alias-markdown-citation":"#55483d","--dsw-alias-markdown-placeholder":"#837c73","--dsw-alias-markdown-tag":"#3f352c","--dsw-alias-markdown-code-segment-selected":"#453a30","--dsw-alias-markdown-code-segment-unselected":"#38312c","--dsw-alias-scrollbar-bg-l1":"#403933","--dsw-alias-scrollbar-bg-l2":"#48413b","--dsw-alias-scrollbar-hover-l1":"#4f4842","--dsw-alias-scrollbar-hover-l2":"#5b544d","--dsw-alias-switch-thumb":"#2d2621","--dsw-alias-toast-bg":"#3a322c","--dsw-alias-toast-label":"#ece5d8","--dsw-alias-tooltip-bg":"#423c37","--dsw-alias-menu-group-header-fill":"#352e28","--dsw-menu-surface-fill":"#3a322c","--dsw-specific-sidebar-fill":"#2d2621","--dsw-specific-sidebar-nav-item-active":"#42372e","--dsw-specific-bubble":"#393029","--dsw-specific-input-major":"#4a4039","--dsw-specific-menu":"#3a322c","--dsw-specific-selector":"#37302a","--dsw-specific-tip":"#3c322b","--dsw-alias-file-diff-added-bg":"#2c3928","--dsw-alias-file-diff-deleted-bg":"#3d2a23","--dsw-alias-code-diff-added":"#7fc98a","--dsw-alias-code-diff-deleted":"#b54a35","--dsw-font-markdown-base-strong-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-small":"12px/20px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-m-18-font-family":"\"Libre Baskerville\", \"Lora\", Georgia, serif","--dsw-font-markdown-table-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xxxs-11":"11px/14px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-base-16":"16px/24px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-h4":"600 14px / calc(24px + calc(14px - 14px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-small-strong-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-h2":"700 calc(19px + calc(14px - 14px)) / calc(28px + calc(14px - 14px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-base-strong":"600 14px / calc(24px + calc(14px - 14px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-small-strong-italic-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-base-italic-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-base-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xxxs-strong-11-font-family":"\"Libre Baskerville\", \"Lora\", Georgia, serif","--dsw-font-markdown-base-italic":"italic 14px / calc(24px + calc(14px - 14px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-h1":"700 calc(21px + calc(14px - 14px)) / calc(30px + calc(14px - 14px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-small-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-s-14-font-family":"\"Libre Baskerville\", \"Lora\", Georgia, serif","--dsw-font-markdown-h3":"700 calc(18px + calc(14px - 14px)) / calc(26px + calc(14px - 14px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xxxs-11-font-family":"\"Libre Baskerville\", \"Lora\", Georgia, serif","--dsw-font-markdown-base":"14px / calc(24px + calc(14px - 14px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xs-strong-13-font-family":"\"Libre Baskerville\", \"Lora\", Georgia, serif","--dsw-font-base-strong-16":"500 16px/24px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xxs-12":"12px/18px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-small-strong":"600 12px/20px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-base-strong-16-font-family":"\"Libre Baskerville\", \"Lora\", Georgia, serif","--dsw-font-s-strong-14-font-family":"\"Libre Baskerville\", \"Lora\", Georgia, serif","--dsw-font-xl-24":"600 24px/32px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-s-strong-14":"500 14px/22px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-base-strong-italic-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-l-20-font-family":"\"Libre Baskerville\", \"Lora\", Georgia, serif","--dsw-font-xxs-strong-12-font-family":"\"Libre Baskerville\", \"Lora\", Georgia, serif","--dsw-font-markdown-small-italic":"italic 12px/20px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xxxs-strong-11":"500 11px/14px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xs-13-font-family":"\"Libre Baskerville\", \"Lora\", Georgia, serif","--dsw-font-family":"\"Libre Baskerville\", \"Lora\", Georgia, serif","--dsw-font-markdown-base-strong-italic":"italic 600 14px / calc(24px + calc(14px - 14px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-small-strong-italic":"italic 600 12px/20px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-table":"min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-h2-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xl-24-font-family":"\"Libre Baskerville\", \"Lora\", Georgia, serif","--dsw-font-xs-13":"13px/20px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-base-16-font-family":"\"Libre Baskerville\", \"Lora\", Georgia, serif","--dsw-font-s-14":"14px/22px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-h1-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-table-head-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-h3-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xxs-strong-12":"500 12px/18px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-table-head":"500 min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xs-strong-13":"500 13px/20px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-m-18":"500 16px/28px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-small-italic-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-family-brand":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-l-20":"500 20px/28px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-h4-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xxs-12-font-family":"\"Libre Baskerville\", \"Lora\", Georgia, serif","--dsw-elevation-soft":"0 0 0 .5px rgba(28, 23, 18, 0.20), 0 4px 16px rgba(28, 23, 18, 0.30)","--dsw-elevation-panel":"0 0 0 .5px rgba(28, 23, 18, 0.20), 0 12px 32px rgba(28, 23, 18, 0.40)","--dsw-elevation-prominent":"0 0 0 .5px rgba(28, 23, 18, 0.20), 0 24px 48px rgba(28, 23, 18, 0.50)","--dsw-alias-markdown-inline-code":"#3c3530","--dsw-alias-json-tree-hover":"#38312c","--dsw-alias-json-tree-property":"#c0a080","--dsw-alias-json-tree-punctuation":"#c5bcac","--dsw-alias-json-tree-number":"#7cc7d8","--dsw-alias-json-tree-keyword":"#c9a0e0","--dsw-alias-json-tree-icon":"#c5bcac","--dsw-alias-state-idle-primary":"#c5bcac","--dsw-alias-state-done-primary":"#7fc98a","--dsw-alias-state-business-primary":"#c0a080","--dsw-alias-state-warn-secondary":"#483926","--dsw-alias-state-warn-tertiary":"#3a2f23","--dsw-alias-state-success-secondary":"#393e31","--dsw-alias-state-success-tertiary":"#333128","--dsw-alias-border-selected":"#c0a080","--dsw-alias-border-inverted":"#c4c2c1","--dsw-alias-border-inverted2":"#aba8a6","--dsw-alias-card-fill":"#3a322c","--dsw-alias-card-tile-fill":"#362f2a","--dsw-alias-settings-card-fill":"#3a322c","--dsw-alias-settings-card-stroke":"#574d46","--dsw-alias-onboarding-card-fill":"#3a322c","--dsw-alias-label-document-preview":"#ece5d8","--dsw-alias-label-primary-bluish":"#ddcdb9","--dsw-alias-label-shimmer":"#8f856e","--dsw-alias-label-deep-diving-shimmer":"#8f856e","--dsw-alias-label-on-color":"#2d2621","--dsw-alias-hovercard-label-primary":"#ece5d8","--dsw-alias-hovercard-label-secondary":"#c5bcac","--dsw-alias-hovercard-label-tertiary":"#ccc3b4","--dsw-alias-hovercard-state-error":"#b54a35","--dsw-alias-hovercard-state-done":"#7fc98a","--dsw-alias-bg-mask-1":"rgba(45,38,33,0.6)","--dsw-alias-bg-mask-2":"rgba(45,38,33,0.8)","--dsw-alias-bg-mask-3":"rgba(45,38,33,0.92)","--dsw-alias-bg-mask-photo":"rgba(45,38,33,0.4)","--dsw-alias-bg-document-selection":"#453a30","--dsw-alias-button-info-fill":"#c0a080","--dsw-alias-button-info-hover":"#c8ab8f","--dsw-alias-button-tool-bar-fill":"#37302a","--dsw-alias-button-tool-bar-fill-invisible":"transparent","--dsw-alias-button-tool-bar-hover":"#403933","--dsw-alias-chart-tools":"#c0a080","--dsw-alias-chart-messages":"#b3906f","--dsw-alias-chart-system":"#a67c52","--dsw-alias-illustration-surface":"#3a322c","--dsw-alias-illustration-shadow":"#4a433c","--dsw-alias-illustration-backing":"#241e1a","--dsw-alias-trajectory-accent":"#c0a080","--dsw-alias-menu-icon":"#c5bcac","--dsw-alias-tooltip-label":"#ece5d8","--dsw-alias-tooltip-key-bg":"#5c5753","--dsw-alias-toast-action":"#c0a080","--dsw-alias-onboarding-accent":"#c0a080","--dsw-alias-onboarding-checkbox-border":"#4a4039","--dsw-alias-turn-trigger-bg":"#352e28","--dsw-alias-turn-trigger-bg-hover":"#3c3530","--dsw-alias-brand-primary-new-colorprimary-new-color":"#c0a080","--dsw-alias-file-diff-added-gutter":"#2b462d","--dsw-alias-file-diff-deleted-gutter":"#482d25","--dsw-alias-file-diff-added-marker":"#1a7f37","--dsw-alias-file-diff-deleted-marker":"#b54a35","--dsw-alias-bg-document-preview":"#3a322c","--dsw-alias-bg-multi-select":"#3c322b","--dsw-alias-border-l2-darkmode-thin":"#544a43","--dsw-alias-card-fill-hover":"#413933","--dsw-alias-hovercard-bg":"#3a322c","--dsw-alias-illustration-background":"#3a322c","--dsw-alias-illustration-detail":"#c0a080","--dsw-alias-illustration-inset":"#352e28","--dsw-alias-json-tree-string":"#9ed07a","--dsw-alias-label-deep-diving":"#8f856e","--dsw-alias-onboarding-secondary-fill":"#37302a","--dsw-alias-state-business-tertiary":"#372f28","--dsw-specific-bubble-highlight":"#615954","--dsw-specific-file-upload-track":"#443d37","--dsw-specific-guide-hero":"#3c322b","--dsw-specific-login-input":"#4a4039","--dsw-specific-sidebar-glass-fill":"rgba(45,38,33,0.72)","--dsw-specific-sidebar-glass-hover":"rgba(45,38,33,0.86)","--dsw-specific-sidebar-glass-collapsed-fill":"rgba(45,38,33,0.9)","--dsw-specific-sidebar-glass-collapsed-hover":"rgba(45,38,33,0.95)","--dsw-specific-sidebar-nav-item-active-accent":"#4d4136","--dsw-specific-sidebar-right-flash":"#4a3e34","--dsw-specific-sidebar-tint":"#362d27","--dsw-specific-sidebar-wash-top":"#38312c","--dsw-specific-sidebar-wash-top-clear":"rgba(45,38,33,0)","--dsw-specific-sidebar-wash-bottom":"#38312c","--dsw-specific-sidebar-wash-bottom-clear":"rgba(45,38,33,0)","--dsw-linear-gradient-think":"linear-gradient(180deg, #2d2621 20.19%, #2d262100 100%)","--dsw-linear-think-select":"linear-gradient(180deg, #362f29 20.19%, #362f2900 100%)"},"light":{"--dsw-alias-bg-base":"#f5f1e6","--dsw-alias-bg-layer-1":"#fffcf5","--dsw-alias-bg-layer-2":"#f6f1e7","--dsw-alias-bg-layer-3":"#ece5d8","--dsw-alias-bg-layer-4":"#e0d7c1","--dsw-alias-bg-overlay":"#fffcf5","--dsw-alias-bg-skeleton":"#ece5d8","--dsw-alias-bg-module-platform":"#ece5d8","--dsw-alias-bg-mask-drop":"#c2bcb1","--dsw-alias-label-primary":"#4a3f35","--dsw-alias-label-primary-dimmed":"#382f28","--dsw-alias-label-primary-foreground":"#ffffff","--dsw-alias-label-primary-inverted":"#382f28","--dsw-alias-label-secondary":"#7d6b56","--dsw-alias-label-tertiary":"#746350","--dsw-alias-label-caption":"#70604d","--dsw-alias-label-dimmed":"#73624f","--dsw-alias-label-error":"#b54a35","--dsw-alias-brand-primary":"#7e5e3e","--dsw-alias-brand-primary-invert":"#7e5e3e","--dsw-alias-brand-text":"#7e5e3e","--dsw-alias-link":"#7e5e3e","--dsw-alias-border-l1":"#e9e2d2","--dsw-alias-border-l2":"#e9e2d2","--dsw-alias-border-l3":"#dbd0ba","--dsw-alias-border-l4":"#cabfaa","--dsw-alias-interactive-bg-hover":"#ebe6db","--dsw-alias-interactive-bg-hover-solid":"#e7dfcf","--dsw-alias-interactive-bg-active":"#e4dfd4","--dsw-alias-interactive-bg-hover-accent":"#e7dfd2","--dsw-alias-interactive-bg-hover-danger":"#ecdacd","--dsw-alias-button-primary-fill":"#7e5e3e","--dsw-alias-button-primary-hover":"#6f5337","--dsw-alias-button-primary-dimmed":"#dbd1c1","--dsw-alias-button-elevated-fill":"#fffcf5","--dsw-alias-button-floating-fill":"#fffcf5","--dsw-alias-button-floating-hover":"#f4f1e9","--dsw-alias-button-contrast-fill":"#4a3f35","--dsw-alias-button-ghost-active-fill":"#e7e3d8","--dsw-alias-button-ghost-active-hover":"#e0dcd1","--dsw-alias-button-ghost-active-border":"#cdc2ad","--dsw-alias-state-error-primary":"#b54a35","--dsw-alias-state-error-secondary":"#ebd8cb","--dsw-alias-state-success-primary":"#2a7c35","--dsw-alias-state-warn-primary":"#92400e","--dsw-alias-state-warn-label":"#92400e","--dsw-alias-markdown-code-block":"#f6f1e7","--dsw-alias-markdown-code-block-banner":"#e8e3d9","--dsw-alias-markdown-citation":"#d1c3b2","--dsw-alias-markdown-placeholder":"#a8a196","--dsw-alias-markdown-tag":"#e7dfd2","--dsw-alias-markdown-code-segment-selected":"#e2d9cb","--dsw-alias-markdown-code-segment-unselected":"#ebe6db","--dsw-alias-scrollbar-bg-l1":"#e4dfd4","--dsw-alias-scrollbar-bg-l2":"#ddd8cd","--dsw-alias-scrollbar-hover-l1":"#d6d1c6","--dsw-alias-scrollbar-hover-l2":"#ccc6bc","--dsw-alias-switch-thumb":"#f5f1e6","--dsw-alias-toast-bg":"#fffcf5","--dsw-alias-toast-label":"#4a3f35","--dsw-alias-tooltip-bg":"#5f544a","--dsw-alias-menu-group-header-fill":"#eeeadf","--dsw-menu-surface-fill":"#fffcf5","--dsw-specific-sidebar-fill":"#ece5d8","--dsw-specific-sidebar-nav-item-active":"#ddd2c2","--dsw-specific-bubble":"#ebe5d9","--dsw-specific-input-major":"#dbd0ba","--dsw-specific-menu":"#fffcf5","--dsw-specific-selector":"#ece8dd","--dsw-specific-tip":"#e9e2d5","--dsw-alias-file-diff-added-bg":"#dcecd6","--dsw-alias-file-diff-deleted-bg":"#edddd1","--dsw-alias-code-diff-added":"#1a7f37","--dsw-alias-code-diff-deleted":"#b54a35","--dsw-font-markdown-base-strong-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-small":"12px/20px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-m-18-font-family":"\"Libre Baskerville\", \"Lora\", Georgia, serif","--dsw-font-markdown-table-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xxxs-11":"11px/14px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-base-16":"16px/24px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-h4":"600 14px / calc(24px + calc(14px - 14px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-small-strong-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-h2":"700 calc(19px + calc(14px - 14px)) / calc(28px + calc(14px - 14px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-base-strong":"600 14px / calc(24px + calc(14px - 14px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-small-strong-italic-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-base-italic-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-base-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xxxs-strong-11-font-family":"\"Libre Baskerville\", \"Lora\", Georgia, serif","--dsw-font-markdown-base-italic":"italic 14px / calc(24px + calc(14px - 14px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-h1":"700 calc(21px + calc(14px - 14px)) / calc(30px + calc(14px - 14px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-small-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-s-14-font-family":"\"Libre Baskerville\", \"Lora\", Georgia, serif","--dsw-font-markdown-h3":"700 calc(18px + calc(14px - 14px)) / calc(26px + calc(14px - 14px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xxxs-11-font-family":"\"Libre Baskerville\", \"Lora\", Georgia, serif","--dsw-font-markdown-base":"14px / calc(24px + calc(14px - 14px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xs-strong-13-font-family":"\"Libre Baskerville\", \"Lora\", Georgia, serif","--dsw-font-base-strong-16":"500 16px/24px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xxs-12":"12px/18px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-small-strong":"600 12px/20px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-base-strong-16-font-family":"\"Libre Baskerville\", \"Lora\", Georgia, serif","--dsw-font-s-strong-14-font-family":"\"Libre Baskerville\", \"Lora\", Georgia, serif","--dsw-font-xl-24":"600 24px/32px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-s-strong-14":"500 14px/22px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-base-strong-italic-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-l-20-font-family":"\"Libre Baskerville\", \"Lora\", Georgia, serif","--dsw-font-xxs-strong-12-font-family":"\"Libre Baskerville\", \"Lora\", Georgia, serif","--dsw-font-markdown-small-italic":"italic 12px/20px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xxxs-strong-11":"500 11px/14px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xs-13-font-family":"\"Libre Baskerville\", \"Lora\", Georgia, serif","--dsw-font-family":"\"Libre Baskerville\", \"Lora\", Georgia, serif","--dsw-font-markdown-base-strong-italic":"italic 600 14px / calc(24px + calc(14px - 14px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-small-strong-italic":"italic 600 12px/20px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-table":"min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-h2-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xl-24-font-family":"\"Libre Baskerville\", \"Lora\", Georgia, serif","--dsw-font-xs-13":"13px/20px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-base-16-font-family":"\"Libre Baskerville\", \"Lora\", Georgia, serif","--dsw-font-s-14":"14px/22px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-h1-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-table-head-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-h3-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xxs-strong-12":"500 12px/18px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-table-head":"500 min(calc(14px - 1px), max(13px, calc(14px - 2px)))/calc(22px + calc(min(calc(14px - 1px), max(13px, calc(14px - 2px))) - 13px)) \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xs-strong-13":"500 13px/20px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-m-18":"500 16px/28px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-small-italic-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-family-brand":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-l-20":"500 20px/28px \"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-markdown-h4-font-family":"\"Lora\", Georgia, \"Times New Roman\", serif","--dsw-font-xxs-12-font-family":"\"Libre Baskerville\", \"Lora\", Georgia, serif","--dsw-elevation-soft":"0 0 0 .5px rgba(40, 33, 26, 0.15), 0 4px 14px rgba(40, 33, 26, 0.07)","--dsw-elevation-panel":"0 0 0 .5px rgba(40, 33, 26, 0.15), 0 12px 30px rgba(40, 33, 26, 0.09)","--dsw-elevation-prominent":"0 0 0 .5px rgba(40, 33, 26, 0.15), 0 24px 50px rgba(40, 33, 26, 0.11)","--dsw-alias-markdown-inline-code":"#e7e3d8","--dsw-alias-json-tree-hover":"#ebe6db","--dsw-alias-json-tree-property":"#7e5e3e","--dsw-alias-json-tree-punctuation":"#7d6b56","--dsw-alias-json-tree-number":"#0b7285","--dsw-alias-json-tree-keyword":"#8250df","--dsw-alias-json-tree-icon":"#7d6b56","--dsw-alias-state-idle-primary":"#7d6b56","--dsw-alias-state-done-primary":"#2a7c35","--dsw-alias-state-business-primary":"#7e5e3e","--dsw-alias-state-warn-secondary":"#e6d6c6","--dsw-alias-state-warn-tertiary":"#eee5d7","--dsw-alias-state-success-secondary":"#d7dfcb","--dsw-alias-state-success-tertiary":"#e7e9da","--dsw-alias-border-selected":"#7e5e3e","--dsw-alias-border-inverted":"#454340","--dsw-alias-border-inverted2":"#62605c","--dsw-alias-card-fill":"#fffcf5","--dsw-alias-card-tile-fill":"#f7f3e9","--dsw-alias-settings-card-fill":"#fffcf5","--dsw-alias-settings-card-stroke":"#cfc4af","--dsw-alias-onboarding-card-fill":"#fffcf5","--dsw-alias-label-document-preview":"#4a3f35","--dsw-alias-label-primary-bluish":"#5c4a38","--dsw-alias-label-shimmer":"#8c8475","--dsw-alias-label-deep-diving-shimmer":"#8c8475","--dsw-alias-label-on-color":"#ffffff","--dsw-alias-hovercard-label-primary":"#4a3f35","--dsw-alias-hovercard-label-secondary":"#7d6b56","--dsw-alias-hovercard-label-tertiary":"#746350","--dsw-alias-hovercard-state-error":"#b54a35","--dsw-alias-hovercard-state-done":"#2a7c35","--dsw-alias-bg-mask-1":"rgba(245,241,230,0.6)","--dsw-alias-bg-mask-2":"rgba(245,241,230,0.8)","--dsw-alias-bg-mask-3":"rgba(245,241,230,0.92)","--dsw-alias-bg-mask-photo":"rgba(245,241,230,0.4)","--dsw-alias-bg-document-selection":"#e2d9cb","--dsw-alias-button-info-fill":"#7e5e3e","--dsw-alias-button-info-hover":"#6f5337","--dsw-alias-button-tool-bar-fill":"#ece8dd","--dsw-alias-button-tool-bar-fill-invisible":"transparent","--dsw-alias-button-tool-bar-hover":"#e4dfd4","--dsw-alias-chart-tools":"#a67c52","--dsw-alias-chart-messages":"#8d6e4c","--dsw-alias-chart-system":"#735a3a","--dsw-alias-illustration-surface":"#fffcf5","--dsw-alias-illustration-shadow":"#dbd6cb","--dsw-alias-illustration-backing":"#e6e3d8","--dsw-alias-trajectory-accent":"#7e5e3e","--dsw-alias-menu-icon":"#7d6b56","--dsw-alias-tooltip-label":"#f5f1e6","--dsw-alias-tooltip-key-bg":"#524840","--dsw-alias-toast-action":"#7e5e3e","--dsw-alias-onboarding-accent":"#7e5e3e","--dsw-alias-onboarding-checkbox-border":"#dbd0ba","--dsw-alias-turn-trigger-bg":"#eeeadf","--dsw-alias-turn-trigger-bg-hover":"#e7e3d8","--dsw-alias-brand-primary-new-colorprimary-new-color":"#7e5e3e","--dsw-alias-file-diff-added-gutter":"#cbe8cb","--dsw-alias-file-diff-deleted-gutter":"#e8d0c3","--dsw-alias-file-diff-added-marker":"#1a7f37","--dsw-alias-file-diff-deleted-marker":"#b54a35","--dsw-alias-bg-document-preview":"#fffcf5","--dsw-alias-bg-multi-select":"#e9e2d5","--dsw-alias-border-l2-darkmode-thin":"#d2c7b2","--dsw-alias-card-fill-hover":"#f8f4ed","--dsw-alias-hovercard-bg":"#fffcf5","--dsw-alias-illustration-background":"#fffcf5","--dsw-alias-illustration-detail":"#7e5e3e","--dsw-alias-illustration-inset":"#eeeadf","--dsw-alias-json-tree-string":"#1a7f37","--dsw-alias-label-deep-diving":"#8c8475","--dsw-alias-onboarding-secondary-fill":"#f9f5ec","--dsw-alias-state-business-tertiary":"#ede7da","--dsw-specific-bubble-highlight":"#efeae1","--dsw-specific-file-upload-track":"#e0dcd1","--dsw-specific-guide-hero":"#e9e2d5","--dsw-specific-login-input":"#dbd0ba","--dsw-specific-sidebar-glass-fill":"rgba(236,229,216,0.72)","--dsw-specific-sidebar-glass-hover":"rgba(236,229,216,0.86)","--dsw-specific-sidebar-glass-collapsed-fill":"rgba(236,229,216,0.9)","--dsw-specific-sidebar-glass-collapsed-hover":"rgba(236,229,216,0.95)","--dsw-specific-sidebar-nav-item-active-accent":"#d4c7b6","--dsw-specific-sidebar-right-flash":"#ddd4c4","--dsw-specific-sidebar-tint":"#e5ddcf","--dsw-specific-sidebar-wash-top":"#e0dacd","--dsw-specific-sidebar-wash-top-clear":"rgba(236,229,216,0)","--dsw-specific-sidebar-wash-bottom":"#e0dacd","--dsw-specific-sidebar-wash-bottom-clear":"rgba(236,229,216,0)","--dsw-linear-gradient-think":"linear-gradient(180deg, #f5f1e6 20.19%, #f5f1e600 100%)","--dsw-linear-think-select":"linear-gradient(180deg, #f6f1e7 20.19%, #f6f1e700 100%)"},"label":"@theme.vintagePaper"}};
    const THEME_IDS = Object.keys(THEMES);
    // Zhuoer 各主题的形状差异（圆角 / 边框对比度）。
    // themes.mjs 里的 --dsw-radius-* 是当年的占位值（6/6/10/14/20，跟宿主原生的 4/8/12/16/20 对不上），
    // 已删除，默认档直接吃宿主原生刻度。只有需要「圆角明显更小」的主题才在这里覆盖。
    // 同理「灯塔高对比边线」在 DSH 侧也没体现，一并按真值补齐。
    const SHAPES = {
      // 形状语言按主题身份分档：终端类直角、纸张类小圆角、软色类大圆角。
      // 只动 --dsw-radius-*，不碰配色（配色真源在 themes.mjs）。
      absolutely: { '--dsw-radius-xs': '0px', '--dsw-radius-sm': '0px', '--dsw-radius-md': '0px', '--dsw-radius-lg': '0px', '--dsw-radius-xl': '0px', '--dsw-radius-panel': '0px' },
      manuscript: { '--dsw-radius-xs': '2px', '--dsw-radius-sm': '4px', '--dsw-radius-md': '6px', '--dsw-radius-lg': '8px', '--dsw-radius-xl': '12px', '--dsw-radius-panel': '16px' },
      // vintage-paper: paper-like small radii, same tier as manuscript (source radius 0.25rem)
      'vintage-paper': { '--dsw-radius-xs': '2px', '--dsw-radius-sm': '4px', '--dsw-radius-md': '6px', '--dsw-radius-lg': '8px', '--dsw-radius-xl': '12px', '--dsw-radius-panel': '16px' },
      crt: {
        '--dsw-radius-xs': '2px', '--dsw-radius-sm': '2px', '--dsw-radius-md': '3px',
        '--dsw-radius-lg': '4px', '--dsw-radius-xl': '6px', '--dsw-radius-panel': '8px',
        '--dsw-corner-shape': 'superellipse(1)',
      },
      knot: { '--dsw-radius-xs': '4px', '--dsw-radius-sm': '6px', '--dsw-radius-md': '10px', '--dsw-radius-lg': '14px', '--dsw-radius-xl': '18px', '--dsw-radius-panel': '24px' },
      dash: { '--dsw-radius-xs': '4px', '--dsw-radius-sm': '6px', '--dsw-radius-md': '8px', '--dsw-radius-lg': '10px', '--dsw-radius-xl': '14px', '--dsw-radius-panel': '18px' },
      miami: { '--dsw-radius-xs': '6px', '--dsw-radius-sm': '10px', '--dsw-radius-md': '14px', '--dsw-radius-lg': '18px', '--dsw-radius-xl': '22px', '--dsw-radius-panel': '28px' },
      tide: { '--dsw-radius-xs': '4px', '--dsw-radius-sm': '8px', '--dsw-radius-md': '12px', '--dsw-radius-lg': '16px', '--dsw-radius-xl': '20px', '--dsw-radius-panel': '24px' },
      phosphor: { '--dsw-radius-xs': '2px', '--dsw-radius-sm': '2px', '--dsw-radius-md': '3px', '--dsw-radius-lg': '4px', '--dsw-radius-xl': '6px', '--dsw-radius-panel': '8px' },
      rose: { '--dsw-radius-xs': '8px', '--dsw-radius-sm': '12px', '--dsw-radius-md': '16px', '--dsw-radius-lg': '20px', '--dsw-radius-xl': '24px', '--dsw-radius-panel': '32px' },
      beacon: {
        '--dsw-alias-border-l1': '#4a4a4a', '--dsw-alias-border-l2': '#6e6e6e',
        '--dsw-alias-border-l3': '#8a8a8a', '--dsw-alias-border-l4': '#9a9a9a',
        '--dsw-alias-border-selected': '#9a9a9a',
      },
    };
    // 各主题的字体族（取自 Zhuoer /themes/<id>.css 的 --font-body / --font-chat / --mono）。
    // 生成 themes.mjs 时这几个主题的字体没转过来，仍是 DSH 默认的 Instrument Sans。
    const MONO_STACK = '"JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace';
    // 栈尾巴照抄 Zhuoer themes/*.css 的原文，别自己改顺序：
    // 少一段 -apple-system / Segoe UI，西文就会掉到更下面的通用族。
    function ocSans(family) {
      return '"' + family + '", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    }
    function ocSerif(family) {
      return '"' + family + '", Georgia, "Times New Roman", serif';
    }
    // 2026-11 从 Zhuoer 2026.11.7 的 /themes/<id>.css 逐个取的真值：
    // chat 侧没写的（knot / tide）在 Zhuoer 里就是继承 body，这里同样不写。
    // zhuoer 在这一版 Zhuoer 里已经没有独立 CSS（现存 10 个主题不含它），
    // 取同为 DM Sans 的 dash/rose 栈兜底 —— 关键是不能让它落回未安装的 Instrument Sans，
    // 那条栈一旦落空，对话正文就渲染成 Segoe UI，和 Zhuoer 完全不是一个字体。
    const FONTS = {
      zhuoer:       { body: ocSans('DM Sans'), chat: ocSans('DM Sans') },
      knot:       { body: ocSans('Geist') },
      absolutely: { body: ocSans('Space Grotesk'), chat: ocSerif('Lora') },
      beacon:     { body: ocSans('Atkinson Hyperlegible Next'), chat: ocSans('Atkinson Hyperlegible Next') },
      phosphor:   { body: MONO_STACK, chat: MONO_STACK },
      crt:        { body: MONO_STACK, chat: MONO_STACK },
      dash:       { body: ocSans('DM Sans'), chat: ocSerif('Fraunces') },
      manuscript: { body: ocSerif('Lora'), chat: ocSerif('Lora') },
      miami:      { body: ocSans('Space Grotesk'), chat: ocSans('Space Grotesk') },
      rose:       { body: ocSans('DM Sans'), chat: ocSans('DM Sans') },
      tide:       { body: ocSans('IBM Plex Sans') },
    };
    // 自定义主题的字体下拉：只列内置主题实际用到的族名 + 等宽。
    // 不开放自由输入，避免用户填一个本机没有、又静默回落到系统默认的名字。
    const FONT_CHOICES = [
      ['DM Sans', 'DM Sans'],
      ['Geist', 'Geist'],
      ['Space Grotesk', 'Space Grotesk'],
      ['Atkinson Hyperlegible Next', 'Atkinson Hyperlegible Next'],
      ['IBM Plex Sans', 'IBM Plex Sans'],
      ['Instrument Sans', 'Instrument Sans'],
      ['Inter', 'Inter'],
      ['Manrope', 'Manrope'],
      ['Lora', 'Lora（衬线）'],
      ['Fraunces', 'Fraunces（衬线）'],
      ['Source Serif 4', 'Source Serif 4（衬线）'],
      ['Fira Code', 'Fira Code（等宽）'],
      ['Geist Mono', 'Geist Mono（等宽）'],
      ['DM Sans, Zhuoer Kai SC', 'Zhuoer 楷体（中文）'],
      ['__mono__', '等宽'],
    ];
    // 中文回退：主题的西文衬线/无衬线都没有中文字形，不显式接上就会落到系统默认（雅黑/宋体）。
    // Zhuoer Sans SC / Zhuoer Serif SC = 随插件分发的 GB2312 一级字子集（3755 汉字 + 中文标点），
    // 只含中文字形，所以西文永远走前面的主题字体；族名特意与系统 Noto 区分开。
    const CJK_SANS = '"Zhuoer Sans SC", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", "DengXian", sans-serif';
    const CJK_SERIF = '"Zhuoer Serif SC", "Noto Serif SC", "Songti SC", "SimSun", serif';
    const CJK_MONO = '"Sarasa Mono SC", "Zhuoer Sans SC", "Noto Sans SC", "Microsoft YaHei", ui-monospace, monospace';
    function withCJK(stack) {
      const s = String(stack);
      if (/sans-serif\s*$/.test(s)) return s.replace(/sans-serif\s*$/, CJK_SANS);
      if (/serif\s*$/.test(s)) return s.replace(/serif\s*$/, CJK_SERIF);
      if (/monospace\s*$/.test(s)) return s.replace(/monospace\s*$/, CJK_MONO);
      return s;
    }
    // 随插件分发的西文字体（assets/fonts/*.woff2，全部 SIL OFL 1.1，可商用可再分发）
    // 变量字体：一支文件覆盖多档字重，所以下面统一声明 font-weight:100 900。
    const FONT_FACES = [
      ['JetBrains Mono', 'jetbrains-mono-latin.woff2', 'jetbrains-mono-italic-latin.woff2'],
      ['Lora', 'lora-latin.woff2', 'lora-italic-latin.woff2'],
      ['DM Sans', 'dm-sans-latin.woff2', 'dm-sans-italic-latin.woff2'],
      ['Space Grotesk', 'space-grotesk-latin.woff2', ''],
      ['IBM Plex Sans', 'ibm-plex-sans-latin.woff2', 'ibm-plex-sans-italic-latin.woff2'],
      ['Atkinson Hyperlegible Next', 'atkinson-hyperlegible-next-latin.woff2', 'atkinson-hyperlegible-next-italic-latin.woff2'],
      ['Geist', 'geist-latin.woff2', ''],
      ['Fraunces', 'fraunces-latin.woff2', 'fraunces-italic-latin.woff2'],
      ['Instrument Sans', 'instrument-sans-latin.woff2', ''],
      ['Inter', 'inter-latin.woff2', ''],
      ['Manrope', 'manrope-latin.woff2', ''],
      ['Source Serif 4', 'source-serif-4-latin.woff2', ''],
      ['Fira Code', 'fira-code-latin.woff2', ''],
      ['Geist Mono', 'geist-mono-latin.woff2', ''],
      ['Zhuoer Sans SC', 'noto-sans-sc-subset.woff2', ''],
      ['Zhuoer Serif SC', 'noto-serif-sc-subset.woff2', ''],
      // 楷体是静态单字重（只有 Regular），第 4 位显式声明字重，避免被当成 100-900 变量字体合成假粗
      ['Zhuoer Kai SC', 'zhuoer-kai-sc-subset.woff2', '', '400'],
    ];
    const FONT_BASE = '/dsh-zhuoer-theme/assets/fonts/';
    // 品牌位「主题自带」档：走插件自己的 assets 路由（与 FONT_BASE 同源）。
    // 用户上传的图存在 localStorage 里，优先级高于它。
    const BRAND_LOGO = '/dsh-zhuoer-theme/assets/logo/zhuoer.svg';
    const fontFaceCss = FONT_FACES.map(function (f) {
      let s = '@font-face{font-family:"' + f[0] + '";src:url("' + FONT_BASE + f[1] + '") format("woff2");font-weight:' + (f[3] || '100 900') + ';font-style:normal;font-display:swap;}';
      if (f[2]) s += '@font-face{font-family:"' + f[0] + '";src:url("' + FONT_BASE + f[2] + '") format("woff2");font-weight:100 900;font-style:italic;font-display:swap;}';
      return s;
    }).join('');
    // 把 font token 值里的字体族尾巴整段换掉（简写形如 600 24px/32px "X", ...）。
    function swapFamily(value, stack) {
      const m = String(value).match(/"[^"]+"[\s\S]*$/);
      return m ? String(value).slice(0, m.index) + stack : value;
    }
    // 各主题的阴影梯度（取自 Zhuoer /themes/<id>.css 的 --shadow-sm / --shadow-lg；
    // --shadow-xl 主题里没单独定义，按同色相递增一档补出）。
    // DSH 侧对应 elevation 三档：soft / panel / prominent，另加 shadow-lv3。
    // 同一套阴影要分明暗用：深色底上 #0006 才看得出层次，浅色底上同样的值
    // 会变成一块压得很重的黑边（任务卡、面板尤其明显）。所以按 scheme 缩放 alpha。
    function scaleShadow(css, k) {
      if (!css) return css;
      return String(css)
        // 主题里用的是 #0006 这类 4 位简写，必须先展开成 8 位，否则下面那条
        // 只认 6+2 的正则匹配不到，alpha 就不会被缩放（panel 档曾因此漏改）。
        .replace(/#([0-9a-fA-F]{4})\b/g, function (m, h) {
          return '#' + h[0] + h[0] + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
        })
        .replace(/#([0-9a-fA-F]{3})\b/g, function (m, h) {
          return '#' + h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        })
        .replace(/rgba\(([^)]+)\)/g, function (m, body) {
          const p = body.split(',').map(function (s) { return s.trim(); });
          if (p.length < 4) return m;
          const a = parseFloat(p[3]);
          if (!isFinite(a)) return m;
          return 'rgba(' + p[0] + ', ' + p[1] + ', ' + p[2] + ', ' + Math.max(0, Math.min(1, a * k)).toFixed(3) + ')';
        })
        .replace(/#([0-9a-fA-F]{6})([0-9a-fA-F]{2})\b/g, function (m, rgb, aa) {
          const a = (parseInt(aa, 16) / 255) * k;
          const hex = Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');
          return '#' + rgb + hex;
        });
    }
    // 深色保留层次但不再压那么狠：0.62 乘上 beacon 那类 rgba(0,0,0,.95) 的基值，
    // 仍有 0.59 的不透明度，深色下任务条/浮层的投影糊成一团（用户实测反馈「有点重」）。
    // 收到 0.48（−23%），层次还在，边缘不再发闷。
    // 浅色压到 0.22，只留一点贴边层次，不再是黑框。
    const SHADOW_STRENGTH = { dark: 0.48, light: 0.22 };
    // 自定义主题上限：读、写、导入三处共用。必须留在模块作用域——
    // 0.6.19 曾把它误插进 readPref() 内部，导致「新建主题」按钮点下去抛
    // ReferenceError: CUSTOM_MAX is not defined，而所有静态门与渲染冒烟门都是绿的。
    const CUSTOM_MAX = 24;
    const SHADOWS = {"zhuoer":{"sm":"0 1px 2px #00000040","lg":"0 12px 32px #0006","xl":"0 24px 48px #00000080"},"absolutely":{"sm":"0 1px 2px rgba(0, 0, 0, 0.35)","lg":"0 12px 32px rgba(0, 0, 0, 0.55)","xl":"0 24px 48px rgba(0, 0, 0, 0.65)"},"beacon":{"sm":"0 1px 2px rgba(0, 0, 0, 0.9)","lg":"0 12px 32px rgba(0, 0, 0, 0.95)","xl":"0 24px 48px rgba(0, 0, 0, 0.98)"},"crt":{"sm":"0 1px 2px rgba(0, 0, 0, 0.45)","lg":"0 12px 32px rgba(0, 0, 0, 0.65)","xl":"0 24px 48px rgba(0, 0, 0, 0.75)"},"dash":{"sm":"0 1px 2px rgba(10, 6, 4, 0.35)","lg":"0 12px 32px rgba(10, 6, 4, 0.55)","xl":"0 24px 48px rgba(10, 6, 4, 0.65)"},"knot":{"sm":"0 1px 2px rgba(0, 0, 0, 0.4)","lg":"0 12px 32px rgba(0, 0, 0, 0.6)","xl":"0 24px 48px rgba(0, 0, 0, 0.7)"},"manuscript":{"sm":"0 1px 2px rgba(60, 45, 20, 0.06)","lg":"0 12px 28px rgba(60, 45, 20, 0.1)","xl":"0 24px 48px rgba(60, 45, 20, 0.14)"},"miami":{"sm":"0 1px 2px rgba(4, 0, 14, 0.45)","lg":"0 12px 32px rgba(4, 0, 14, 0.65)","xl":"0 24px 48px rgba(4, 0, 14, 0.75)"},"phosphor":{"sm":"0 1px 2px rgba(0, 6, 2, 0.4)","lg":"0 12px 32px rgba(0, 6, 2, 0.6)","xl":"0 24px 48px rgba(0, 6, 2, 0.7)"},"rose":{"sm":"0 1px 2px rgba(6, 4, 12, 0.4)","lg":"0 12px 32px rgba(6, 4, 12, 0.6)","xl":"0 24px 48px rgba(6, 4, 12, 0.7)"},"tide":{"sm":"0 1px 2px rgba(2, 6, 12, 0.4)","lg":"0 12px 32px rgba(2, 6, 12, 0.6)","xl":"0 24px 48px rgba(2, 6, 12, 0.7)"},"vintage-paper":{"sm":"2px 3px 5px 0px hsl(28 13% 20% / 0.12), 2px 1px 2px -1px hsl(28 13% 20% / 0.12)","lg":"2px 3px 5px 0px hsl(28 13% 20% / 0.12), 2px 4px 6px -1px hsl(28 13% 20% / 0.12)","xl":"2px 3px 5px 0px hsl(28 13% 20% / 0.12), 2px 8px 10px -1px hsl(28 13% 20% / 0.12)"}};

    function readPref() {
      try {
        const raw = window.localStorage.getItem(STORE);
        const p = raw ? JSON.parse(raw) : {};
        // 自定义主题：只存锚点，上限 CUSTOM_MAX 套（写入前判、读取再截一次兜底）；theme 既可以是内置 id，也可以是自定义 id
        const rawCustoms = Array.isArray(p.customThemes) ? p.customThemes : [];
        // 读取侧截断不能再静默：超过上限的部分丢掉时，把被丢的 id 记下来给面板提示。
        const customs = rawCustoms.slice(0, CUSTOM_MAX).map(sanitizeCustomSpec).filter(Boolean);
        const dropped = rawCustoms.slice(CUSTOM_MAX).map(function (c) { return c && typeof c.id === 'string' ? c.id : ''; }).filter(Boolean);
        const themeKnown = THEME_IDS.indexOf(p.theme) !== -1
          || customs.some(function (c) { return c.id === p.theme; });
        return {
          theme: themeKnown ? p.theme : 'zhuoer',
          customThemes: customs,
          droppedCustomIds: dropped,
          mode: p.mode === 'light' || p.mode === 'dark' ? p.mode : 'auto',
          bgSource: ['none', 'theme', 'image'].indexOf(p.bgSource) !== -1 ? p.bgSource : 'none',
          bgStyle: p.bgStyle === 'full' ? 'full' : 'fade',
          bgOpacity: typeof p.bgOpacity === 'number' && p.bgOpacity >= 0 && p.bgOpacity <= 100 ? p.bgOpacity : 85,
          bgImage: typeof p.bgImage === 'string' ? p.bgImage : '',
          bgOnEmpty: p.bgOnEmpty !== false,
          bgOnSession: p.bgOnSession !== false,
          // 硬边强化：把第三方插件里硬编码的圆角/描边也压平（token 到不了它们）。
          sharp: p.sharp === true,
          // 可访问性：放大点击区（44×44）。默认关——会撑动布局，属于显式选择。
          a11yHit: p.a11yHit === true,
          // Markdown 排版密度：只调节奏（行高/段距/标题尺度），不动字号体系。
          mdDensity: p.mdDensity === 'compact' || p.mdDensity === 'roomy' ? p.mdDensity : 'normal',          // Markdown 精细化（0.6.41）：标题字号策略 / 代码块 / 表格 / 引用块。
          mdHeadSize: p.mdHeadSize === 'compact' || p.mdHeadSize === 'clear' ? p.mdHeadSize : 'theme',
          mdCode: p.mdCode === 'line' || p.mdCode === 'card' ? p.mdCode : 'none',
          mdTable: p.mdTable === 'line' || p.mdTable === 'zebra' ? p.mdTable : 'plain',
          mdQuote: p.mdQuote === 'strong' ? 'strong' : 'plain',
          // 步骤过程组头的活动图标是否用语义色（读=信息蓝 / 写=行动橙 / 执行=紫 / 提问=黄 / 思考=品牌）。
          procIconColor: p.procIconColor === true,
          // 标题配色：follow=跟随正文 / soft=品牌色淡化 / brand=品牌色。
          // 宿主没有「标题色」token，所以这一层由我们从 brand + label 推。
          mdHeading: p.mdHeading === 'follow' || p.mdHeading === 'brand' ? p.mdHeading : 'soft',
          fontScale: [90, 100, 110, 125, 140].indexOf(p.fontScale) !== -1 ? p.fontScale : 100,
          // 对话正文宽度（px）：0 = 跟随宿主（自适应），非 0 = 用户指定值。
          // 宿主自己的偏好键是 dsh.conversation.contentWidth（拖动写入），我们不复用它——
          // 那是宿主的存储契约，插件另存一份，互不覆盖。
          chatWidth: typeof p.chatWidth === 'number' && p.chatWidth >= 640 && p.chatWidth <= 1600 ? Math.round(p.chatWidth) : 0,
          accent: typeof p.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(p.accent) ? p.accent : '',
          uiFont: typeof p.uiFont === 'string' ? p.uiFont.slice(0, 60) : '',
          // 右侧栏快捷导航：off 关闭 / three 只露三个（悬停展开）/ all 全部常驻
          quicknav: p.quicknav === 'off' || p.quicknav === 'all' ? p.quicknav : 'three',
          // 品牌位（左上角 deepseek HARNESS 徽标）：默认关 = 用宿主原生。
          // 开启且已有图时，客户端把 svg 内部置透明、在 <svg> 盒子上铺这张图。
          brandLogo: p.brandLogo === true,
          brandImage: typeof p.brandImage === 'string' && p.brandImage.indexOf('data:image/') === 0 ? p.brandImage : '',
        };
      } catch (e) {
        return { customThemes: [], theme: 'zhuoer', mode: 'auto', bgSource: 'none', bgStyle: 'fade', bgOpacity: 85, bgImage: '', bgOnEmpty: true, bgOnSession: true, fontScale: 100, a11yHit: false, mdDensity: 'normal', mdHeadSize: 'theme', mdCode: 'none', mdTable: 'plain', mdQuote: 'plain', accent: '', uiFont: '', quicknav: 'three' };
      }
    }
    function writePref(patch) {
      try { window.localStorage.setItem(STORE, JSON.stringify(Object.assign(readPref(), patch))); } catch (e) { /* ignore */ }
      // 同窗口不会触发 storage 事件，用自定义事件让内嵌的快捷导航模块立刻换模式
      try { window.dispatchEvent(new CustomEvent('dsh-zhuoer-theme:pref')); } catch (e) { /* ignore */ }
    }
    function systemScheme() {
      try { return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch (e) { return 'dark'; }
    }
    function resolveScheme(mode, theme) {
      if (mode === 'light' || mode === 'dark') return mode;
      // 跟随 DSH 自己的明暗偏好（可能由用户手动切换），而不是系统 prefers-color-scheme
      try {
        const pref = theme && typeof theme.getTheme === 'function' ? theme.getTheme() : null;
        const p = pref && (pref.preference || pref.mode || pref.scheme);
        if (p === 'light' || p === 'dark') return p;
      } catch (e) { /* ignore */ }
      return systemScheme();
    }
    // #region derive  (scripts/test-derive.mjs 会抠出这一段做无头验证，别把标记删了)
    // ---------- 底图存储（IndexedDB）----------
    // 为什么不用 localStorage：5MB 硬上限，一张 1920px 图压完约 1~2MB，
    // 而且写满时是**静默失败**（踩过：图片存不进去但界面完全不报错）。
    // 图片存 IDB、pref 里只留引用键；启动时预加载进 imageCache，
    // 供同步的 applyTokens 直接取（IDB 是异步的，不能在里面 await）。
    const BG_DB = 'dsh-zhuoer-theme-bg';
    const BG_STORE = 'images';
    // 图片输入上限：底图（全局 / 主题）与品牌位统一用同一个阈值，
    // 三个入口各写一个数字时，用户会在某个入口被拒绝、换个入口又能传，
    // 而且其中一处还是静默 return（只有 console.warn）。
    const IMG_MAX_BYTES = 3 * 1024 * 1024;
    const BG_MAX_BYTES = IMG_MAX_BYTES;
    const imageCache = new Map();
    let bgDbPromise = null;
    let bgReady = false;

    function bgDb() {
      if (!bgDbPromise) {
        bgDbPromise = new Promise(function (resolve, reject) {
          try {
            if (typeof indexedDB === 'undefined') { reject(new Error('indexedDB 不可用')); return; }
            const req = indexedDB.open(BG_DB, 1);
            req.onupgradeneeded = function () {
              const db = req.result;
              if (!db.objectStoreNames.contains(BG_STORE)) db.createObjectStore(BG_STORE);
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error || new Error('open failed')); };
          } catch (e) { reject(e); }
        });
      }
      return bgDbPromise;
    }

    function idbPut(key, value) {
      return bgDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          const tx = db.transaction(BG_STORE, 'readwrite');
          tx.objectStore(BG_STORE).put(value, key);
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = function () { reject(tx.error); };
        });
      });
    }

    // 重置时必须整库清空：自定义主题删掉后，它们的底图键会变成无主数据，
    // 而 IDB 不会被 localStorage.removeItem 带走（这就是「换了十几次图，库里堆十几张」）。
    function idbClearAll() {
      return new Promise(function (resolve) {
        try {
          const req = indexedDB.open(BG_DB, 1);
          req.onerror = function () { resolve(false); };
          req.onsuccess = function () {
            try {
              const db = req.result;
              const tx = db.transaction([BG_STORE], 'readwrite');
              tx.objectStore(BG_STORE).clear();
              tx.oncomplete = function () { try { db.close(); } catch (e) { /* ignore */ } resolve(true); };
              tx.onerror = function () { try { db.close(); } catch (e) { /* ignore */ } resolve(false); };
            } catch (e) { resolve(false); }
          };
        } catch (e) { resolve(false); }
      });
    }

    function idbDelete(key) {
      return bgDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          const tx = db.transaction(BG_STORE, 'readwrite');
          tx.objectStore(BG_STORE).delete(key);
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = function () { reject(tx.error); };
        });
      });
    }

    function idbAll() {
      return bgDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          const tx = db.transaction(BG_STORE, 'readonly');
          const store = tx.objectStore(BG_STORE);
          const keysReq = store.getAllKeys();
          const valsReq = store.getAll();
          tx.oncomplete = function () {
            const keys = keysReq.result || [];
            const vals = valsReq.result || [];
            resolve(keys.map(function (k, i) { return [k, vals[i]]; }));
          };
          tx.onerror = function () { reject(tx.error); };
        });
      });
    }

    // 把 IDB 里的图全部读进内存缓存；完成后触发一次重算，让底图出现
    function preloadBgImages() {
      return idbAll().then(function (pairs) {
        pairs.forEach(function (p) { if (p[1]) imageCache.set(p[0], p[1]); });
        bgReady = true;
        emitChange();
      }).catch(function (e) {
        bgReady = true;
        try { console.warn('[zhuoer-theme] 底图索引库不可用，按无底图处理', (e && e.message) || e); } catch (e2) { /* ignore */ }
      });
    }

    // ---------- 图片取色（中位切分）----------
    // P0 阶段：纯本地、不依赖模型。用于"从图片主色生成主题"。
    // 为什么用中位切分而不是 k-means：确定性（同一张图结果稳定）、无需迭代、O(n log n)。
    function imageToImageData(file, maxEdge) {
      return new Promise(function (resolve, reject) {
        const reader = new FileReader();
        reader.onerror = function () { reject(new Error('读取文件失败')); };
        reader.onload = function () {
          const img = new Image();
          img.onerror = function () { reject(new Error('图片解码失败')); };
          img.onload = function () {
            try {
              const scale = Math.min(1, (maxEdge || 960) / Math.max(img.width, img.height));
              const w = Math.max(1, Math.round(img.width * scale));
              const h = Math.max(1, Math.round(img.height * scale));
              const canvas = document.createElement('canvas');
              canvas.width = w; canvas.height = h;
              const ctx = canvas.getContext('2d');
              if (!ctx) { reject(new Error('canvas 2d 不可用')); return; }
              ctx.drawImage(img, 0, 0, w, h);
              resolve(ctx.getImageData(0, 0, w, h));
            } catch (e) { reject(e); }
          };
          img.src = String(reader.result || '');
        };
        reader.readAsDataURL(file);
      });
    }

    // #region palette  (scripts/test-derive.mjs 会抠出纯函数部分做无头验证)
    function medianCut(pixels, count) {
      let boxes = [pixels];
      while (boxes.length < count) {
        let bestIdx = -1, bestRange = -1, bestCh = 'r';
        boxes.forEach(function (box, i) {
          if (box.length < 2) return;
          ['r', 'g', 'b'].forEach(function (ch) {
            let mn = 255, mx = 0;
            box.forEach(function (p) { if (p[ch] < mn) mn = p[ch]; if (p[ch] > mx) mx = p[ch]; });
            if (mx - mn > bestRange) { bestRange = mx - mn; bestIdx = i; bestCh = ch; }
          });
        });
        if (bestIdx < 0 || bestRange <= 0) break;
        const box = boxes[bestIdx];
        box.sort(function (a, b) { return a[bestCh] - b[bestCh]; });
        // 切点策略：优先切在「颜色跳变处」，没有跳变才退回像素中位。
        // 只按中位切会把横跨中位点的大色块劈成两半（实测：红 300px 正跨 600 的中位，
        // 被切成两份，混合后出紫红）。真实照片色带连续、跳变小，会自动退化为中位切。
        const totalN = box.reduce(function (s, p) { return s + p.n; }, 0);
        let gapIdx = -1, gapMax = 0;
        for (let i = 1; i < box.length; i++) {
          const gap = box[i][bestCh] - box[i - 1][bestCh];
          // 跳变要够大（8 以上）才值得切，避免把噪点当边界
          if (gap > gapMax) { gapMax = gap; gapIdx = i; }
        }
        let mid = -1;
        if (gapMax >= 8 && gapIdx > 0 && gapIdx < box.length) {
          mid = gapIdx;
        } else {
          let acc = 0;
          for (let i = 0; i < box.length; i++) {
            acc += box[i].n;
            if (acc * 2 >= totalN) { mid = i + 1; break; }
          }
        }
        if (mid <= 0 || mid >= box.length) break;
        boxes.splice(bestIdx, 1, box.slice(0, mid), box.slice(mid));
      }
      const total = pixels.reduce(function (s, p) { return s + p.n; }, 0) || 1;
      return boxes.filter(function (b) { return b.length; }).map(function (box) {
        let r = 0, g = 0, b = 0, n = 0;
        box.forEach(function (p) { r += p.r * p.n; g += p.g * p.n; b += p.b * p.n; n += p.n; });
        const hex = '#' + [r / n, g / n, b / n].map(function (v) {
          return Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
        }).join('');
        return { hex: hex, share: n / total };
      }).sort(function (a, b) { return b.share - a.share; });
    }

    function extractPalette(imageData, count) {
      const data = imageData.data;
      const px = imageData.width * imageData.height;
      // 采样步长：把样本压到 1.2 万级，避免大图卡主线程
      const step = Math.max(1, Math.floor(Math.sqrt(px / 12000)));
      const buckets = new Map();
      for (let y = 0; y < imageData.height; y += step) {
        for (let x = 0; x < imageData.width; x += step) {
          const i = (y * imageData.width + x) * 4;
          if (data[i + 3] < 128) continue;
          // 5 bit/通道量化，压掉噪点
          const r = data[i] & 0xf8, g = data[i + 1] & 0xf8, b = data[i + 2] & 0xf8;
          const key = r + ',' + g + ',' + b;
          const cur = buckets.get(key);
          if (cur) cur.n++;
          else buckets.set(key, { r: r, g: g, b: b, n: 1 });
        }
      }
      const pixels = Array.from(buckets.values());
      if (!pixels.length) return [];
      return medianCut(pixels, count || 6);
    }

    // 把取到的色按规则分到 5 个锚点（P0 的兜底；P2 会换成 AI 组织）
    // 保持色相，只微调 HSL 明度。用于"把颜色调到看得清"，而不是换一个颜色。
    function shadeColor(hex, deltaL) {
      const hsl = hexHsl(hex);
      if (!hsl) return hex;
      const l = Math.max(0.02, Math.min(0.98, hsl[2] + deltaL));
      return hslHex(hsl[0], hsl[1], l);
    }

    function paletteToAnchors(palette, forceScheme) {
      if (!palette || !palette.length) return null;
      // 0~1 的感知亮度，用于判断整图明暗倾向
      const lum01 = function (hex) {
        const c = parseHexColor(hex) || [0, 0, 0];
        return (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) / 255;
      };
      // WCAG 相对亮度与对比度：用来保证正文在底色上读得清
      const relLum = function (hex) {
        const c = parseHexColor(hex) || [0, 0, 0];
        const f = function (v) {
          const n = v / 255;
          return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
      };
      const ratio = function (a, b) {
        const la = relLum(a), lb = relLum(b);
        const hi = Math.max(la, lb), lo = Math.min(la, lb);
        return (hi + 0.05) / (lo + 0.05);
      };
      const sat = function (hex) {
        const hsl = hexHsl(hex);
        return hsl ? hsl[1] : 0;
      };

      // 明暗倾向看**占比最大的那个色**，不是加权平均。
      // 加权平均会被"面积不小但很暗"的第二色拉偏：日落图天空 58% 是浅米（L0.63），
      // 地面 37% 深棕把均值拉到 0.42，判成深底 → 底色成了纯黑，整张图的气氛全丢。
      const mainLum = lum01(palette[0].hex);
      // forceScheme='light'/'dark' 时强制走该侧的取色规则——同一张图要出两套独立锚点，
      // 不能拿浅色反推深色（对话里 AI 生成的那条路径就是各出 8 组）。
      const lightPhoto = forceScheme ? forceScheme === 'light' : mainLum >= 0.5;

      const byLum = palette.slice().sort(function (a, b) { return lum01(a.hex) - lum01(b.hex); });
      const darkest = byLum[0].hex;
      const lightest = byLum[byLum.length - 1].hex;

      // 浅底照片 → 亮色当底；深底照片 → 暗色当底；文字取反方向
      let bg = lightPhoto ? lightest : darkest;
      if (forceScheme === 'dark') {
        // 深色底：取主色色相、压到很低的明度（不是纯黑，保住氛围色）
        const mh = hexHsl(palette[0].hex);
        bg = mh ? hslHex(mh[0], Math.min(0.45, Math.max(0.10, mh[1])), 0.12) : '#141414';
      } else if (lightPhoto) {
        // 关键：不仅提亮，还要**保住色相与饱和度**。
        // 早先只按亮度往白推，照片被洗成中性灰（天空的蓝全丢），
        // 反推到深色就成了一片纯黑，跟照片毫无关系。
        // 做法：拿占比最大那色的色相，饱和度保底 0.18（保证反推深色时还有色相），
        // 明度抬到 0.92 —— 底色是"带色相的浅色"，不是近白。
        const mainHsl = hexHsl(palette[0].hex);
        if (mainHsl) {
          const h = mainHsl[0];
          const s = Math.min(0.55, Math.max(0.18, mainHsl[1]));
          bg = hslHex(h, s, 0.92);
        } else {
          let guard = 0;
          while (lum01(bg) < 0.93 && guard < 10) { bg = shadeColor(bg, 0.05); guard++; }
        }
      }
      let text = lightPhoto ? darkest : lightest;
      // 正文要中性：照片里最暗的往往是有色相的（深蓝 #0859f0、深绿），
      // 直接拿来当正文会让整页文字发蓝/发绿。只有够深（或够浅）才保留原色，
      // 否则退回近黑/近白——照片的色彩留给品牌色去表达。
      if (lightPhoto) {
        // 纯黑太硬（照片里最暗的常是 #000000 的阴影），柔和成近黑
        if (lum01(text) > 0.22 || text === '#000000') text = '#14161a';
      } else {
        if (lum01(text) < 0.72) text = '#f2f2f2';
      }
      // 对比度兜底：照片里未必同时有足够亮和足够暗的色，不够就把文字推到近黑/近白
      if (ratio(text, bg) < 4.5) text = lum01(bg) > 0.5 ? '#14161a' : '#f2f2f2';

      // 把某个色推到在 bg 上"看得见"为止：保持色相，只动明度。
      // 照片里的颜色常常和底色撞亮度（浅蓝灰底 + 黄绿），直接拿来当品牌色/边框
      // 会得到 1.1:1 这种几乎不可见的对比度。
      const ensureVisible = function (hex, minRatio) {
        let out = hex;
        let guard = 0;
        const dir = lum01(bg) > 0.5 ? -1 : 1;   // 浅底就压暗，深底就提亮
        while (ratio(out, bg) < minRatio && guard < 6) {
          out = shadeColor(out, dir * 0.10);
          guard++;
        }
        return out;
      };

      // 品牌色是**按钮填充色**，它要对比的是按钮上的白字，不是页面底色。
      // 早先拿它跟 bg 比，浅底照片里鲜绿永远"不够对比"，被一路压成橄榄灰，
      // 照片的鲜度就丢了。这里改成校验 vs 白字（≥3:1），鲜绿能原样保留。
      const ensureOnWhite = function (hex, minRatio) {
        let out = hex;
        let guard = 0;
        while (ratio(out, '#ffffff') < minRatio && guard < 6) {
          out = shadeColor(out, -0.08);
          guard++;
        }
        return out;
      };
      const bySat = palette.slice().sort(function (a, b) { return sat(b.hex) - sat(a.hex); });
      // 2.5 而不是 3.0：再低白字就真看不清了，再高压暗会让鲜绿（草地的绿）变橄榄灰
      const brand = bySat.length ? ensureOnWhite(bySat[0].hex, 2.5) : text;
      // 次色用于图标/点缀/轨迹，会和底色同处一层，所以仍按底色校验
      const brand2 = bySat.length > 1 ? ensureVisible(bySat[1].hex, 2.2) : brand;

      // 边框直接从底色派生：比底色暗/亮一档，天然可见，
      // 也不会出现"从照片里挑到一个和底色同亮度的色"这种事故。
      const border = shadeColor(bg, lum01(bg) > 0.5 ? -0.16 : 0.16);

      // 危险/警告：照片里推不出语义色，但用户期望"7 个锚点都填满"。
      // 给一对中性语义色，并按底色把对比度修到能看清；用户可再手动改。
      const danger = ensureVisible('#d92b2b', 3.0);
      const warn = ensureVisible('#b45309', 3.0);

      return {
        '--dsw-alias-bg-base': bg,
        '--dsw-alias-label-primary': text,
        '--dsw-alias-border-l1': border,
        '--dsw-alias-brand-primary': brand,
        '--dsw-alias-trajectory-accent': brand2,
        '--dsw-alias-state-error-primary': danger,
        '--dsw-alias-state-warn-primary': warn,
      };
    }

    // #endregion palette
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

    function parseHexColor(c) {
      const m = String(c || '').trim().match(/^#([0-9a-fA-F]{6})$/);
      if (!m) return null;
      return [0, 2, 4].map(function (i) { return parseInt(m[1].slice(i, i + 2), 16); });
    }
    function toHexColor(rgb) {
      return '#' + rgb.map(function (v) {
        return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
      }).join('');
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
    function srgbLum(hex) {
      const m = String(hex || '').trim().replace('#', '');
      const full = m.length === 3 ? m.split('').map(function (c) { return c + c; }).join('') : m;
      if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
      const ch = [0, 2, 4].map(function (i) { return parseInt(full.slice(i, i + 2), 16) / 255; });
      const lin = function (v) { return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * lin(ch[0]) + 0.7152 * lin(ch[1]) + 0.0722 * lin(ch[2]);
    }
    function contrast2(a, b) {
      const la = srgbLum(a), lb = srgbLum(b);
      if (la === null || lb === null) return 0;
      const hi = Math.max(la, lb), lo = Math.min(la, lb);
      return (hi + 0.05) / (lo + 0.05);
    }
    function pickOnColor(fillHex) {
      const L = srgbLum(fillHex);
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
        if (cur && contrast2(fill, cur) >= 4.5) return;
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

    // #region mode-sync
    // 宿主明暗偏好（浅色 / 深色 / 跟随系统）是唯一真源：宿主「通用设置」那三个方块
    // 和本页「模式」操作的是同一个宿主字段（THEME_PREFERENCE_FIELD = 'preference'），
    // 所以这里不另存一套，直接经 ctx.theme 读写：getTheme().preference / setTheme(id)。
    // 面板不在 ctx 作用域里（拿不到 ctx.theme），靠 apply(ctx) 捕获到这条引用。
    let hostThemeApi = null;
    /** 读宿主偏好并映射成本页的 'light' | 'dark' | 'auto'；读不到返回空串。 */
    function hostMode() {
      try {
        if (hostThemeApi && typeof hostThemeApi.getTheme === 'function') {
          const p = hostThemeApi.getTheme();
          const v = p && p.preference;
          if (v === 'light' || v === 'dark') return v;
          if (v === 'system') return 'auto';
        }
      } catch (e) { /* ignore */ }
      return '';
    }
    /**
     * 写宿主偏好（auto → system）；宿主不可用时返回 false，调用方退回只落本地。
     * 成功后先把 hostPrefSeen 对齐到目标值：宿主会回灌一条 theme/change，
     * 不预置的话订阅端会把它当成「外部改动」再走一遍镜像+重算（白跑一轮）。
     */
    function writeHostMode(mode) {
      const raw = mode === 'auto' ? 'system' : mode;
      try {
        if (hostThemeApi && typeof hostThemeApi.setTheme === 'function') {
          hostThemeApi.setTheme(raw);
          hostPrefSeen = raw;
          return true;
        }
      } catch (e) { /* ignore */ }
      return false;
    }
    /** 宿主偏好原值 → 本页三态（light | dark | auto | 空串）。 */
    function mapHostPref(p) {
      if (p === 'light' || p === 'dark') return p;
      if (p === 'system') return 'auto';
      return '';
    }
    // 宿主 theme/change 订阅：**只对「偏好值真的变了」作出反应，且只注册一次**。
    // 踩过的坑：theme.overrideTokens() 自己也会 emit theme/change（宿主文档原话
    // "Emits theme/change with the recomposed snapshot"），无条件 emitChange() 会形成
    //   apply → overrideTokens → theme/change → emitChange → apply
    // 的同步死循环 → 启动极卡、设置页点不动、整窗卡死（v0.3.3 踩过）。
    let hostPrefSeen = '';
    let hostSubscribed = false;
    let hostReapplyQueued = false;
    let hostReapplyTimer = 0;
    /** 读宿主偏好原值（'light' | 'dark' | 'system' | ''）。 */
    function hostPrefRaw() {
      try {
        if (hostThemeApi && typeof hostThemeApi.getTheme === 'function') {
          const p = hostThemeApi.getTheme();
          return (p && p.preference) || '';
        }
      } catch (e) { /* ignore */ }
      return '';
    }
    function subscribeHostChange(ctx) {
      if (hostSubscribed) return;
      // 逃生阀：localStorage 里 dsh-zhuoer-theme:mute-sync = '1' 时完全不订阅。
      // 万一将来还有别的反馈路径，用户不用改代码就能断掉这条同步。
      try { if (window.localStorage.getItem('dsh-zhuoer-theme:mute-sync') === '1') return; } catch (e) { /* ignore */ }
      if (!ctx || typeof ctx.on !== 'function' || !hostThemeApi) return;
      hostSubscribed = true;
      // 启动即对齐：宿主的 preference 是唯一真源，本页存的 mode 只是镜像。
      // 旧版本存在两端不一致的存档（宿主深色、本页 mode=light），这里先纠正一次，
      // 否则首屏会按错的 mode 渲染。
      try {
        const boot = mapHostPref(hostPrefRaw());
        if (boot && readPref().mode !== boot) writePref({ mode: boot });
      } catch (e) { /* ignore */ }
      hostPrefSeen = hostPrefRaw();
      try {
        ctx.on('theme/change', function () {
          try {
            const p = hostPrefRaw();
            // 同值 = 我们自己 overrideTokens / setTheme 引起的回灌，直接丢弃。
            if (p === hostPrefSeen) return;
            hostPrefSeen = p;
            // 宿主改明暗：① 把三态镜像回本页（否则 mode 停在旧值，resolveScheme 会盖住宿主偏好）
            // ② 必须重算 token —— 之前这里只 emitChange()，面板数字会变、画面不变。
            // 两条都放在同一个异步回调里合并，一次操作只跑一遍。
            if (hostReapplyQueued) return;
            hostReapplyQueued = true;
            hostReapplyTimer = setTimeout(function () {
              hostReapplyTimer = 0;
              hostReapplyQueued = false;
              try {
                const mapped = mapHostPref(hostPrefSeen);
                if (mapped && readPref().mode !== mapped) writePref({ mode: mapped });
                applyTokens(themeRef, readPref());
                emitChange();
              } catch (e) { /* ignore */ }
            }, 0);
          } catch (e) { /* ignore */ }
        });
      } catch (e) { /* ignore */ }
    }
    // #endregion mode-sync

    const STYLE_ID = 'dsh-zhuoer-theme-tokens';
// 由 scripts/gen-host-text.mjs 生成，勿手改。宿主升级后重跑该脚本。
// HOST_ASAR_BYTES=209083008
// 形如 ["[class*="_title"]", 14]：选择器（CSS Modules local 名）+ 原始 px 字号。
const HOST_TEXT_RULES = [
  ["[class*=\"_accountInfo\"]", 13],
  ["[class*=\"_accountStatus\"]", 13],
  ["[class*=\"_activeVersion\"]", 11],
  ["[class*=\"_activityMessage\"]", 12],
  ["[class*=\"_addButton\"],[class*=\"_addPrimary\"],[class*=\"_addMore\"]", 13],
  ["[class*=\"_addMenuDescription\"]", 12],
  ["[class*=\"_addModelButton\"]", 12],
  ["[class*=\"_advancedHint\"]", 12],
  ["[class*=\"_af3m1_6\"]", 14],
  ["[class*=\"_amount\"]", 18],
  ["[class*=\"_approvalCaution\"]", 12.5],
  ["[class*=\"_approvalList\"] code", 12],
  ["[class*=\"_approvalPrompt\"]", 12],
  ["[class*=\"_approvalText\"]", 12.5],
  ["[class*=\"_approvalTitle\"]", 13],
  ["[class*=\"_archiveActivity\"]", 13],
  ["[class*=\"_attachmentMetadata\"]", 11],
  ["[class*=\"_attachmentName\"]", 12],
  ["[class*=\"_attemptBadge\"]", 11],
  ["[class*=\"_avatar\"]", 10],
  ["[class*=\"_back\"]", 14],
  ["[class*=\"_badge\"]", 8],
  ["[class*=\"_badge\"]", 14],
  ["[class*=\"_badge\"]", 12],
  ["[class*=\"_badge\"]", 11],
  ["[class*=\"_badgeCount\"]", 12],
  ["[class*=\"_bannerCommand\"]", 12],
  ["[class*=\"_bannerDetail\"]", 12],
  ["[class*=\"_branch\"],[class*=\"_code\"]", 12],
  ["[class*=\"_brandName\"]", 18],
  ["[class*=\"_brmue_4\"]", 11],
  ["[class*=\"_brokenBadge\"]", 11],
  ["[class*=\"_brokenNote\"]", 12],
  ["[class*=\"_brokenTip\"]", 11],
  ["[class*=\"_buildVersion\"]", 6],
  ["[class*=\"_button\"]", 14],
  ["[class*=\"_button\"]", 12],
  ["[class*=\"_buttonOff\"]", 12],
  ["[class*=\"_button_1ulci_2\"]", 14],
  ["[class*=\"_candidateEmpty\"]", 13],
  ["[class*=\"_candidateId\"]", 13],
  ["[class*=\"_caption\"]", 12],
  ["[class*=\"_card\"]", 14],
  ["[class*=\"_card\"]", 13],
  ["[class*=\"_cardDesc\"]", 13],
  ["[class*=\"_cardDescription\"]", 10],
  ["[class*=\"_cardDescription\"]", 15],
  ["[class*=\"_cardDescription\"]", 12],
  ["[class*=\"_cardId\"]", 11],
  ["[class*=\"_cardIdentity\"],[class*=\"_entryValue\"]", 12],
  ["[class*=\"_cardName\"]", 15],
  ["[class*=\"_cardOpen\"]", 12],
  ["[class*=\"_cardOpen\"]", 14],
  ["[class*=\"_cardTitle\"]", 13],
  ["[class*=\"_cardTitle\"]", 14],
  ["[class*=\"_cardTitle\"]", 20],
  ["[class*=\"_catalogError\"]", 12],
  ["[class*=\"_cell\"]", 13],
  ["[class*=\"_changed\"]", 12],
  ["[class*=\"_checkTime\"]", 12],
  ["[class*=\"_checkbox_1wz3s_1\"]", 14],
  ["[class*=\"_checkout\"]", 12],
  ["[class*=\"_chip\"]", 13],
  ["[class*=\"_chip\"],[class*=\"_chipOn\"]", 10],
  ["[class*=\"_close\"]", 18],
  ["[class*=\"_collapsedTurnContent\"]", 12],
  ["[class*=\"_command\"]", 13],
  ["[class*=\"_compactList_70kcw_218\"] [class*=\"_item_70kcw_173\"]", 11],
  ["[class*=\"_compactList_70kcw_218\"] [class*=\"_label_70kcw_214\"]", 10],
  ["[class*=\"_confirmation\"] h2", 16],
  ["[class*=\"_confirmation\"] p", 14],
  ["[class*=\"_confirmation_1cz0t_1\"] [class*=\"_acknowledgement_1cz0t_26\"]", 14],
  ["[class*=\"_contentLabel\"]", 12],
  ["[class*=\"_copy\"]", 14],
  ["[class*=\"_copy\"] h1", 28],
  ["[class*=\"_copy\"] h1", 26],
  ["[class*=\"_count\"]", 13],
  ["[class*=\"_count\"]", 12],
  ["[class*=\"_count\"]", 11],
  ["[class*=\"_countBadge\"]", 10],
  ["[class*=\"_createIn\"]", 14],
  ["[class*=\"_createInput\"]", 14],
  ["[class*=\"_createTitle\"]", 16],
  ["[class*=\"_creatorButton\"]", 14],
  ["[class*=\"_crumb\"]", 14],
  ["[class*=\"_crumb\"]", 13],
  ["[class*=\"_crumb\"]", 11],
  ["[class*=\"_crumb\"]", 12.5],
  ["[class*=\"_crumbSep\"]", 14],
  ["[class*=\"_customLocation\"] textarea", 13],
  ["[class*=\"_customizedSummary\"]", 12],
  ["[class*=\"_d98g2_15\"]", 14],
  ["[class*=\"_d98g2_38\"]", 14],
  ["[class*=\"_dangerButton\"]", 14],
  ["[class*=\"_deleteStatus\"]", 12],
  ["[class*=\"_delivery\"]", 14],
  ["[class*=\"_deliveryTime\"]", 14],
  ["[class*=\"_denjv_2\"]", 12],
  ["[class*=\"_dependents\"]", 13],
  ["[class*=\"_desc\"]", 12],
  ["[class*=\"_description\"]", 12],
  ["[class*=\"_description\"]", 13],
  ["[class*=\"_description\"]", 10],
  ["[class*=\"_description\"]", 14],
  ["[class*=\"_description_1cz0t_19\"]", 14],
  ["[class*=\"_description_1ytzq_124\"]", 14],
  ["[class*=\"_detail\"]", 11],
  ["[class*=\"_detail\"]", 14],
  ["[class*=\"_detailDesc\"]", 14],
  ["[class*=\"_detailDescription\"]", 14],
  ["[class*=\"_detailName\"]", 12],
  ["[class*=\"_detailNotice\"]", 12],
  ["[class*=\"_detailTab\"]", 13],
  ["[class*=\"_detailTitle\"]", 20],
  ["[class*=\"_details\"]", 12],
  ["[class*=\"_details\"] dd", 12],
  ["[class*=\"_details\"] dt", 11],
  ["[class*=\"_detailsToggle\"]", 13],
  ["[class*=\"_deviceError\"]", 12],
  ["[class*=\"_diagnostics\"]", 12],
  ["[class*=\"_directory\"]", 11],
  ["[class*=\"_disclosure\"]", 12],
  ["[class*=\"_document\"]", 14],
  ["[class*=\"_drillHint\"]", 10],
  ["[class*=\"_drillHintText\"]", 10],
  ["[class*=\"_duration\"]", 11],
  ["[class*=\"_editorField\"]", 14],
  ["[class*=\"_editorRoute\"]", 12],
  ["[class*=\"_editorTitle\"]", 14],
  ["[class*=\"_empty\"]", 14],
  ["[class*=\"_empty\"]", 13],
  ["[class*=\"_empty\"] h2,[class*=\"_empty\"] h3,[class*=\"_empty\"] [class*=\"_emptyTitle\"]", 14],
  ["[class*=\"_emptyAction\"]", 13],
  ["[class*=\"_emptyHint\"]", 12],
  ["[class*=\"_emptyState\"]", 13],
  ["[class*=\"_emptyTitle\"]", 14],
  ["[class*=\"_entryDescription\"]", 11],
  ["[class*=\"_entryTitle\"]", 14],
  ["[class*=\"_error\"]", 12],
  ["[class*=\"_error\"]", 11],
  ["[class*=\"_error\"]", 13],
  ["[class*=\"_error\"]", 14],
  ["[class*=\"_error\"],[class*=\"_warning\"]", 11],
  ["[class*=\"_errorSummary\"]", 14],
  ["[class*=\"_error_1gsn2_32\"]", 13],
  ["[class*=\"_eyebrow\"]", 11],
  ["[class*=\"_facts\"] code", 12],
  ["[class*=\"_facts\"] dd", 13],
  ["[class*=\"_facts\"] dt", 13],
  ["[class*=\"_failPill\"]", 10],
  ["[class*=\"_failure\"]", 13],
  ["[class*=\"_failure\"]", 14],
  ["[class*=\"_fallback\"]", 11],
  ["[class*=\"_fallbackBrandName\"]", 17],
  ["[class*=\"_feedback\"]", 11],
  ["[class*=\"_fetchUrl_1j4y1_116\"]", 13],
  ["[class*=\"_field\"] input", 16],
  ["[class*=\"_field\"] label", 13],
  ["[class*=\"_field\"]>*", 14],
  ["[class*=\"_fieldLabel\"]", 12],
  ["[class*=\"_fileMeta\"]", 12],
  ["[class*=\"_fileName\"]", 14],
  ["[class*=\"_fileName\"]", 13],
  ["[class*=\"_fileSize\"]", 10],
  ["[class*=\"_fileSize\"]", 12],
  ["[class*=\"_filterTab\"]", 14],
  ["[class*=\"_footer\"]", 12],
  ["[class*=\"_frequency\"]", 10],
  ["[class*=\"_ft7vz_23\"]", 12],
  ["[class*=\"_ft7vz_32\"]", 13],
  ["[class*=\"_ft7vz_8\"],[class*=\"_ft7vz_9\"]", 12],
  ["[class*=\"_gap\"],[class*=\"_fileNote\"]", 12],
  ["[class*=\"_gm1ra_1\"]", 13],
  ["[class*=\"_group\"]", 11],
  ["[class*=\"_group\"]", 12],
  ["[class*=\"_groupHead\"]", 12],
  ["[class*=\"_groupMore\"]", 14],
  ["[class*=\"_groupSub\"]", 12],
  ["[class*=\"_groupTitle\"]", 11],
  ["[class*=\"_groupTitle\"]", 14],
  ["[class*=\"_guideExample\"]", 12],
  ["[class*=\"_guideHint\"]", 12],
  ["[class*=\"_guideIntro\"]", 14],
  ["[class*=\"_guidePanel\"]", 16],
  ["[class*=\"_guidePanel\"] h3", 16],
  ["[class*=\"_guidePanel\"] p", 16],
  ["[class*=\"_guideTitle\"]", 20],
  ["[class*=\"_guideTitle\"]", 13],
  ["[class*=\"_guideToggle\"]", 12.5],
  ["[class*=\"_header\"]", 12],
  ["[class*=\"_headerAction\"]", 13],
  ["[class*=\"_headerTitle\"]", 13],
  ["[class*=\"_heading\"]", 18],
  ["[class*=\"_heading\"]", 13],
  ["[class*=\"_heading_121p8_19\"]", 11],
  ["[class*=\"_headline\"]", 15],
  ["[class*=\"_headline\"]", 26],
  ["[class*=\"_helpButton\"]", 12],
  ["[class*=\"_helpButton\"]", 11],
  ["[class*=\"_help_181ew_41\"]", 12],
  ["[class*=\"_heroDescription\"]", 16],
  ["[class*=\"_hint\"]", 12],
  ["[class*=\"_hint\"],[class*=\"_notice\"],[class*=\"_invalid\"],[class*=\"_conflict\"]", 12],
  ["[class*=\"_hint_181ew_148\"]", 12],
  ["[class*=\"_hostSessionFooter\"]", 13],
  ["[class*=\"_hostStatus\"]", 12],
  ["[class*=\"_hoverBranch\"],[class*=\"_hoverTitle\"]", 12],
  ["[class*=\"_hoverNote\"],[class*=\"_hoverMore\"]", 12],
  ["[class*=\"_hoverPath\"]", 12],
  ["[class*=\"_hoverStatus\"]", 12],
  ["[class*=\"_hoverTime\"]", 12],
  ["[class*=\"_hoverTitle\"]", 14],
  ["[class*=\"_iconAction\"],[class*=\"_textAction\"]", 12],
  ["[class*=\"_indicator_16cyo_1\"]", 12],
  ["[class*=\"_info\"]", 13],
  ["[class*=\"_inlineAction\"]", 12],
  ["[class*=\"_input\"]", 14],
  ["[class*=\"_input\"]", 16],
  ["[class*=\"_inputError\"]", 12],
  ["[class*=\"_input_14sgc_25\"]", 14],
  ["[class*=\"_input_181ew_115\"]", 13],
  ["[class*=\"_inspect\"]", 12],
  ["[class*=\"_inspectButton\"]", 11],
  ["[class*=\"_installField\"]", 13],
  ["[class*=\"_installLocation\"]", 12],
  ["[class*=\"_installSafety\"]", 12],
  ["[class*=\"_instruction\"]", 14],
  ["[class*=\"_instructionsHeader\"]", 11],
  ["[class*=\"_intro\"]", 13],
  ["[class*=\"_intro\"]", 14],
  ["[class*=\"_invalid_181ew_141\"]", 12],
  ["[class*=\"_item\"]", 13],
  ["[class*=\"_itemAlias\"]", 12],
  ["[class*=\"_itemCounts\"],[class*=\"_counts\"]", 12],
  ["[class*=\"_itemDesc\"]", 12],
  ["[class*=\"_itemDescription\"]", 12],
  ["[class*=\"_itemName\"]", 13],
  ["[class*=\"_item_70kcw_173\"]", 13],
  ["[class*=\"_jrv99_22\"]", 11],
  ["[class*=\"_jrv99_5\"]", 12],
  ["[class*=\"_jumpLink\"]", 12],
  ["[class*=\"_keys_38b9q_1\"]", 12],
  ["[class*=\"_kind\"]", 10],
  ["[class*=\"_kind\"]", 11],
  ["[class*=\"_kindTag\"]", 10],
  ["[class*=\"_kjs70_45\"]", 11],
  ["[class*=\"_l6gf9_35\"]", 14],
  ["[class*=\"_label\"]", 13],
  ["[class*=\"_label\"]", 11],
  ["[class*=\"_label\"]", 12],
  ["[class*=\"_label_181ew_20\"]", 13],
  ["[class*=\"_label_70kcw_214\"]", 11],
  ["[class*=\"_labels\"]", 10],
  ["[class*=\"_link\"]", 12],
  ["[class*=\"_linkButton\"]", 14],
  ["[class*=\"_linkButton\"]", 12],
  ["[class*=\"_loading\"],[class*=\"_error\"]", 12],
  ["[class*=\"_localBuildTitle\"]", 12],
  ["[class*=\"_localFile\"]", 12],
  ["[class*=\"_localRefs\"]", 12],
  ["[class*=\"_localRow\"]", 12],
  ["[class*=\"_locationButton\"]", 13],
  ["[class*=\"_locationLabel\"]", 12],
  ["[class*=\"_locationOption\"]>span+span", 12],
  ["[class*=\"_main\"],[class*=\"_chevron\"]", 11],
  ["[class*=\"_menuLabel\"]", 11],
  ["[class*=\"_menuStatus\"]", 12],
  ["[class*=\"_message\"]", 12],
  ["[class*=\"_message\"]", 14],
  ["[class*=\"_meta\"]", 12],
  ["[class*=\"_meta\"]", 11],
  ["[class*=\"_metadata\"]", 13],
  ["[class*=\"_metadata\"],[class*=\"_nextRun\"]", 10],
  ["[class*=\"_methodDescription\"]", 11],
  ["[class*=\"_methodNote\"]", 12],
  ["[class*=\"_metric\"]", 12],
  ["[class*=\"_metrics\"]", 10],
  ["[class*=\"_modalError\"]", 12],
  ["[class*=\"_modalError\"],[class*=\"_menuStatus\"]", 12],
  ["[class*=\"_modalInput\"]", 14],
  ["[class*=\"_modelCatalogMeta\"],[class*=\"_modelEmpty\"]", 12],
  ["[class*=\"_modelCatalogTitle\"]", 12],
  ["[class*=\"_modelFieldLabel\"]", 12],
  ["[class*=\"_modelName\"]", 13],
  ["[class*=\"_modelReasoningValueInput\"]", 13],
  ["[class*=\"_models\"] legend", 12],
  ["[class*=\"_more\"]", 12],
  ["[class*=\"_moreCount\"]", 11],
  ["[class*=\"_muted\"],[class*=\"_meta\"]", 13],
  ["[class*=\"_name\"]", 14],
  ["[class*=\"_navCell\"]", 14],
  ["[class*=\"_navTitle\"]", 16],
  ["[class*=\"_navigation\"] button", 16],
  ["[class*=\"_newSession\"]", 14],
  ["[class*=\"_nextRun\"]", 13],
  ["[class*=\"_noRequests\"]", 12],
  ["[class*=\"_note\"]", 12],
  ["[class*=\"_note\"]", 11],
  ["[class*=\"_note\"],[class*=\"_error\"]", 12],
  ["[class*=\"_note\"],[class*=\"_readError\"]", 12],
  ["[class*=\"_notice\"]", 12],
  ["[class*=\"_notice\"]", 11],
  ["[class*=\"_notice\"]", 13],
  ["[class*=\"_notice\"],[class*=\"_error\"]", 11],
  ["[class*=\"_number\"]", 12],
  ["[class*=\"_objective\"]", 13],
  ["[class*=\"_older\"]", 11],
  ["[class*=\"_older\"] button", 12],
  ["[class*=\"_omitted\"]", 12],
  ["[class*=\"_option\"]", 13],
  ["[class*=\"_optionLabel\"]", 14],
  ["[class*=\"_optionName\"]", 12],
  ["[class*=\"_optionNote\"]", 12],
  ["[class*=\"_outgoingItem\"]", 12],
  ["[class*=\"_output\"]", 12],
  ["[class*=\"_owner\"]", 10],
  ["[class*=\"_page\"] [class*=\"_action\"]", 14],
  ["[class*=\"_pageHeading\"] h1", 20],
  ["[class*=\"_pageIntro\"]", 13],
  ["[class*=\"_pageTitle\"]", 20],
  ["[class*=\"_panel\"] h3", 14],
  ["[class*=\"_panel\"] h4", 13],
  ["[class*=\"_panelHeader\"] h3", 14],
  ["[class*=\"_panelHint\"]", 11],
  ["[class*=\"_panelLabel\"]", 13],
  ["[class*=\"_panelTitle\"]", 15],
  ["[class*=\"_path\"]", 12],
  ["[class*=\"_pathInput\"]", 13],
  ["[class*=\"_path_1kiio_3\"]", 12],
  ["[class*=\"_pill\"]", 10],
  ["[class*=\"_place\"]", 12],
  ["[class*=\"_preferences\"]", 13],
  ["[class*=\"_preparation\"]", 13],
  ["[class*=\"_preparationError\"]", 12],
  ["[class*=\"_presetSettingsTitle\"]", 15],
  ["[class*=\"_previewBadge\"]", 12],
  ["[class*=\"_previewName_13jw0_483\"]", 12],
  ["[class*=\"_previewPath\"]", 12],
  ["[class*=\"_primaryAction\"]", 13],
  ["[class*=\"_primaryButton\"],[class*=\"_secondaryButton\"]", 14],
  ["[class*=\"_primaryButton\"],[class*=\"_secondaryButton\"],[class*=\"_addButton\"]", 14],
  ["[class*=\"_progress\"]", 13],
  ["[class*=\"_progress\"]", 14],
  ["[class*=\"_prose\"],[class*=\"_code\"]", 13],
  ["[class*=\"_providerName\"]", 11],
  ["[class*=\"_purpose\"]", 13],
  ["[class*=\"_purpose\"] [class*=\"_copy\"] h1,[class*=\"_process\"] [class*=\"_copy\"] h1", 28],
  ["[class*=\"_range\"]", 12],
  ["[class*=\"_readonlyName\"]", 20],
  ["[class*=\"_reason\"]", 12],
  ["[class*=\"_recorder\"]", 12],
  ["[class*=\"_registryCustomField\"]", 13],
  ["[class*=\"_registryHint\"]", 12],
  ["[class*=\"_registryTitle\"]", 13],
  ["[class*=\"_registryToggle\"]", 12.5],
  ["[class*=\"_rejected\"]", 11],
  ["[class*=\"_renameError\"]", 12],
  ["[class*=\"_renameInput\"]", 14],
  ["[class*=\"_requestError\"]", 12],
  ["[class*=\"_requestItem\"]", 12],
  ["[class*=\"_reset_181ew_94\"]", 12],
  ["[class*=\"_result\"],[class*=\"_resultWarn\"]", 13],
  ["[class*=\"_retentionEnd\"]", 12],
  ["[class*=\"_retry\"]", 11],
  ["[class*=\"_retry\"]", 12],
  ["[class*=\"_retry\"][class*=\"_retry\"]", 13],
  ["[class*=\"_review\"]", 12],
  ["[class*=\"_reviewFile\"]>h3", 12],
  ["[class*=\"_reviewNote\"]", 14],
  ["[class*=\"_reviewer\"]", 12],
  ["[class*=\"_root\"]", 12],
  ["[class*=\"_route\"]", 11],
  ["[class*=\"_row\"]", 12],
  ["[class*=\"_row\"]", 11],
  ["[class*=\"_row\"]", 13],
  ["[class*=\"_rowActions\"] [class*=\"_secondaryButton\"],[class*=\"_rowActions\"] [class*=\"_dangerButton\"]", 12],
  ["[class*=\"_rowError\"]", 12],
  ["[class*=\"_rowFailure\"]", 12],
  ["[class*=\"_rowId\"]", 11],
  ["[class*=\"_rowId\"]", 13.5],
  ["[class*=\"_rowModule\"]", 11.5],
  ["[class*=\"_rowName\"]", 13],
  ["[class*=\"_rowName\"]", 14],
  ["[class*=\"_rowPurpose\"]", 12],
  ["[class*=\"_rowState\"]", 12.5],
  ["[class*=\"_rowStatus\"]", 11],
  ["[class*=\"_rowSummary\"]", 13],
  ["[class*=\"_rowTag\"]", 11],
  ["[class*=\"_rowTrailing\"]", 12],
  ["[class*=\"_rows\"]", 12],
  ["[class*=\"_rs966_1\"]", 12],
  ["[class*=\"_ruleInput\"]", 14],
  ["[class*=\"_ruleLabel\"]", 14],
  ["[class*=\"_ruleValue\"]", 14],
  ["[class*=\"_saveFailure\"]", 12],
  ["[class*=\"_saveFooter\"]>button", 13],
  ["[class*=\"_saveNotice\"]", 12],
  ["[class*=\"_savedNotice\"]", 12],
  ["[class*=\"_savedPrompt\"]", 13],
  ["[class*=\"_savedPromptToggle\"]", 12],
  ["[class*=\"_scope\"]", 12],
  ["[class*=\"_search\"]", 12],
  ["[class*=\"_search\"]", 13],
  ["[class*=\"_search\"] input", 13],
  ["[class*=\"_search\"] input", 16],
  ["[class*=\"_searchField\"] input,[class*=\"_editorField\"] input,[class*=\"_instruction\"],[class*=\"_ruleInput\"],[class*=\"_zoneSearch\"]", 16],
  ["[class*=\"_searchInput\"]", 13],
  ["[class*=\"_searchInput\"],[class*=\"_renameInput\"]", 16],
  ["[class*=\"_searchInput\"],[class*=\"_ruleInput\"]", 16],
  ["[class*=\"_searchResultTitle\"]", 14],
  ["[class*=\"_searchResultWorkspace\"],[class*=\"_searchResultSnippet\"]", 12],
  ["[class*=\"_searchRow\"] [class*=\"_search\"] input", 12],
  ["[class*=\"_searchRow\"] [class*=\"_search\"] input", 16],
  ["[class*=\"_searchStatus\"]", 12],
  ["[class*=\"_seat\"]", 13],
  ["[class*=\"_sectionCount\"]", 12],
  ["[class*=\"_sectionEmpty\"]", 12],
  ["[class*=\"_sectionHeader\"]", 11],
  ["[class*=\"_sectionLabel\"]", 11],
  ["[class*=\"_sectionProgress\"]", 13],
  ["[class*=\"_sectionTitle\"]", 11],
  ["[class*=\"_sectionTitle\"]", 14],
  ["[class*=\"_sectionTitle\"]", 13],
  ["[class*=\"_sectionToggle\"],[class*=\"_sectionClear\"]", 11],
  ["[class*=\"_selector\"]", 14],
  ["[class*=\"_selector\"]", 13],
  ["[class*=\"_selectorButton\"]", 12],
  ["[class*=\"_selectorLabel\"]", 12],
  ["[class*=\"_sessionOverflowButton\"]", 12],
  ["[class*=\"_sessionTitle\"]", 12],
  ["[class*=\"_settingDescription\"]", 12],
  ["[class*=\"_settingTitle\"]", 14],
  ["[class*=\"_settingsCard\"]>p", 13],
  ["[class*=\"_setupEstimate\"] small", 12],
  ["[class*=\"_shortcut_70kcw_284\"] [class*=\"_shortcutKeys_70kcw_289\"]", 11],
  ["[class*=\"_showHiddenToggle\"]", 13],
  ["[class*=\"_signedOutDescription\"]", 12],
  ["[class*=\"_signedOutTitle\"]", 14],
  ["[class*=\"_sm_1ulci_28\"]", 12],
  ["[class*=\"_snippet_1j4y1_84\"]", 13],
  ["[class*=\"_so0he_31\"]", 16],
  ["[class*=\"_so0he_39\"]", 12],
  ["[class*=\"_so0he_80\"]", 14],
  ["[class*=\"_so0he_87\"]", 12],
  ["[class*=\"_sourceError\"]", 12],
  ["[class*=\"_sourceLink_1j4y1_54\"]", 14],
  ["[class*=\"_stat\"]", 10],
  ["[class*=\"_status\"]", 12],
  ["[class*=\"_status\"]", 13],
  ["[class*=\"_status\"]", 10],
  ["[class*=\"_status\"]", 14],
  ["[class*=\"_status\"]", 16],
  ["[class*=\"_status\"],[class*=\"_empty\"]", 12],
  ["[class*=\"_status\"],[class*=\"_error\"]", 12],
  ["[class*=\"_status\"],[class*=\"_failure\"]", 13],
  ["[class*=\"_status\"],[class*=\"_failure\"] p,[class*=\"_empty\"]", 13],
  ["[class*=\"_statusLabel\"]", 12],
  ["[class*=\"_statusTag\"]", 10],
  ["[class*=\"_statusTail\"]", 11],
  ["[class*=\"_statusText\"]", 12],
  ["[class*=\"_status_1hfzl_13\"]", 12],
  ["[class*=\"_stepProgress\"] small", 11],
  ["[class*=\"_stopLabel\"]", 11],
  ["[class*=\"_stopped\"]", 11],
  ["[class*=\"_strip\"]", 13],
  ["[class*=\"_strip\"]", 14],
  ["[class*=\"_strong\"]", 14],
  ["[class*=\"_subject\"]", 16],
  ["[class*=\"_subjectChip\"]", 12],
  ["[class*=\"_subjectDesc\"],[class*=\"_subjectMeta\"]", 13],
  ["[class*=\"_subjectName\"]", 15],
  ["[class*=\"_subjectSpec\"]", 12],
  ["[class*=\"_submit\"]", 14],
  ["[class*=\"_subtitle\"]", 16],
  ["[class*=\"_subtitle\"]", 12],
  ["[class*=\"_summary\"]", 14],
  ["[class*=\"_summary\"],[class*=\"_error\"]", 13],
  ["[class*=\"_switch\"]", 12],
  ["[class*=\"_switcher\"]", 14],
  ["[class*=\"_switcherTrigger\"]", 14],
  ["[class*=\"_tab\"]", 13],
  ["[class*=\"_tab_1lga9_1\"]", 14],
  ["[class*=\"_tab_1ocp1_37\"]", 13],
  ["[class*=\"_tableScroll_13jw0_199\"] table code", 11],
  ["[class*=\"_tag\"]", 11],
  ["[class*=\"_targetMenuDescription\"]", 12],
  ["[class*=\"_taskName\"]", 12],
  ["[class*=\"_taskRow\"]", 13],
  ["[class*=\"_taskTiming\"]", 12],
  ["[class*=\"_templateHint\"]", 12],
  ["[class*=\"_testFail\"]", 12],
  ["[class*=\"_testOk\"]", 12],
  ["[class*=\"_testWarn\"]", 12],
  ["[class*=\"_testing\"]", 12],
  ["[class*=\"_text\"]", 13],
  ["[class*=\"_themeCube\"]", 14],
  ["[class*=\"_threadCount\"]", 11],
  ["[class*=\"_threads\"]", 11],
  ["[class*=\"_threadsTotal\"]", 11],
  ["[class*=\"_time\"]", 13],
  ["[class*=\"_time\"]", 10],
  ["[class*=\"_time\"]", 12],
  ["[class*=\"_title\"]", 14],
  ["[class*=\"_title\"]", 16],
  ["[class*=\"_title\"]", 18],
  ["[class*=\"_title\"]", 13],
  ["[class*=\"_title\"]", 20],
  ["[class*=\"_title\"]", 15],
  ["[class*=\"_title_1ytzq_79\"]", 16],
  ["[class*=\"_toggle\"]", 12],
  ["[class*=\"_toggle\"],[class*=\"_base\"],[class*=\"_current\"]", 13],
  ["[class*=\"_toggleRow\"]", 13],
  ["[class*=\"_tooltip_38b9q_20\"]", 11],
  ["[class*=\"_total\"]", 11],
  ["[class*=\"_transition\"]", 11],
  ["[class*=\"_transitions\"]", 13],
  ["[class*=\"_trigger\"]", 13],
  ["[class*=\"_trigger\"]", 14],
  ["[class*=\"_trigger\"],[class*=\"_switcherTrigger\"]", 12],
  ["[class*=\"_typeFilterPanel\"]", 11],
  ["[class*=\"_unavailable\"]", 11],
  ["[class*=\"_unbound\"]", 12],
  ["[class*=\"_unit\"]", 14],
  ["[class*=\"_updateOutput\"]", 11.5],
  ["[class*=\"_updateStep\"]", 13],
  ["[class*=\"_updateText\"]", 13],
  ["[class*=\"_updateVersions\"] [class*=\"_versionNumber\"]", 16],
  ["[class*=\"_updatesNote\"]", 12],
  ["[class*=\"_value\"]", 14],
  ["[class*=\"_version\"]", 9],
  ["[class*=\"_versionDate\"]", 12.5],
  ["[class*=\"_versionFact\"]", 12],
  ["[class*=\"_versionLog\"]", 11.5],
  ["[class*=\"_versionNote\"]", 12],
  ["[class*=\"_versionNumber\"]", 13],
  ["[class*=\"_versionPicker\"]", 11],
  ["[class*=\"_versionSummaryEnd\"]", 12.5],
  ["[class*=\"_versionSummarySub\"]", 12.5],
  ["[class*=\"_versionSummaryTitle\"]", 14],
  ["[class*=\"_viewerCode\"]", 12.5],
  ["[class*=\"_viewerTool\"]", 12],
  ["[class*=\"_waitStatus\"]", 12],
  ["[class*=\"_warning\"]", 12],
  ["[class*=\"_warningTitle\"]", 15],
  ["[class*=\"_weekday\"]", 11],
  ["[class*=\"_welcome\"] [class*=\"_copy\"] h1", 28],
  ["[class*=\"_wizardBack\"]", 15],
  ["[class*=\"_wizardSub\"]", 13],
  ["[class*=\"_wizardTitle\"]", 18],
  ["[class*=\"_wordmark\"]", 12],
  ["[class*=\"_workspace\"]", 13],
  ["[class*=\"_workspaceButton\"]", 14],
  ["[class*=\"_zoneSearch\"]", 13],
];
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
// debug 晚探针的定时器句柄：模块作用域，卸载时由 quicknav 的 disposer 统一清（doctor K3）。
let lateProbeTimer = 0;
// 上一层的 token disposer / 底图观察器 / 去抖定时器：改为分片间共享的模块作用域变量。
// 原来是 window.__zrSkin* —— 同页别的脚本能读到也能改（清了就没了），且是全局污染。
let zrSkinDispose = null;
let zrSkinObs = null;
let zrSkinT = 0;

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
// ---- 自定义照片的对比度限幅（L1b）----
// 为什么只对照片做：底纹（kind=texture）走 lighten，只让比底色亮的线条透出，实测侵蚀 ≤ 1.08；
// 而照片路径不加任何混合模式，0.7 不透明度是整幅图盖上去的，图由用户决定，离线给不出边界。
// 做法：载入后按 64×64 采样，解出「正文仍达 4.5:1 还能保留的最大不透明度」，再乘到可见度上。
// 为什么是 4.5 而不是正文地板 7:1：7:1 会把大多数照片压到几乎不可见，失去「用自己照片」的意义。
const PHOTO_CONTRAST_TARGET = 4.5;
const PHOTO_CAP_MAX = 0.7;
const photoCapCache = Object.create(null);
// 面板用它显示「已按对比度限制」；非照片路径恒为 0.7（即原口径「满格 = 70%」）。
let currentPhotoCap = PHOTO_CAP_MAX;
let zrReapply = null;   // 采样是异步的，回来后触发一次重算

function zrLin(v) { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
function zrHexRgb(hex) {
  const m = String(hex || '').replace('#', '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}
function zrHexLum(hex) {
  const c = zrHexRgb(hex);
  return c ? 0.2126 * zrLin(c[0]) + 0.7152 * zrLin(c[1]) + 0.0722 * zrLin(c[2]) : null;
}
function zrRatio(a, b) { return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }

// 逐档扫 α（0.70 → 0.05，步长 0.01，取第一个达标的），每个档位都对所有采样像素算最不利值。
// 为什么扫而不是解方程：合成发生在 sRGB 通道空间、对比度发生在亮度空间，两者非线性；
// 闭式解要么近似，要么漏掉「最不利像素不是均值像素」这种情况。
function zrSolvePhotoCap(pixels, textHex, baseHex) {
  const textLum = zrHexLum(textHex);
  const b = zrHexRgb(baseHex);
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
  const key = String(url).length + ':' + String(url).slice(-96);
  if (photoCapCache[key] != null) return photoCapCache[key];
  photoCapCache[key] = PHOTO_CAP_MAX;   // 采样未完成前先按原值，避免「先压到 0 再跳回来」
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
      const changed = Math.abs(cap - photoCapCache[key]) >= 0.01;
      photoCapCache[key] = cap;
      if (changed && typeof zrReapply === 'function') { try { zrReapply(); } catch (e) { /* ignore */ } }
    };
    img.onerror = function () { photoCapCache[key] = PHOTO_CAP_MAX; };
    img.src = url;
  } catch (e) { /* ignore */ }
  return PHOTO_CAP_MAX;
}

function bgCssFor(o) {
  var bgUrl = o.bgUrl;
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
  // 解法：用混合模式把满幅图降级成线稿——深色 lighten（只留比底色亮的部分），
  // 浅色 multiply（只留比底色暗的部分）。图里与底色一致的部分自动消失。
  var isImageBg = !!o.bgIsImage;
  // 明暗统一 lighten：用户纹理的线条比底色更亮（实测暗色 5→7.4、浅色 238→245 亮度），
  // lighten 只让「比底色亮」的像素透出——线条留下、图底自动消失。
  // 之前浅色用 multiply，正好把更亮的线条乘没了，表现为「自定义底图只在暗色生效」。
  // blend / 反相只对**线稿纹理**生效；手动上传的照片整张显示，不加任何混合，
  // 否则照片会被「只留比底色亮的像素」吃掉——这就是浅色模式看不见照片的原因。
  var isTexture = o.bgKind === 'texture';
  var blendCss = (isImageBg && isTexture) ? ('mix-blend-mode:' + (o.bgInvert ? 'multiply' : 'lighten') + ' !important;') : '';
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
  return '[class*="_centerCol"],[class*="_mainPanel"]{background-color:var(--dsw-alias-bg-base) !important;background-image:none !important;position:relative !important;isolation:isolate !important;}'
    + '[class*="_centerCol"]::before,[class*="_mainPanel"]::before{content:"" !important;' + blendCss + 'position:absolute !important;inset:0 !important;background-image:url("' + bgUrl + '") !important;background-size:cover !important;background-position:50% 0% !important;background-repeat:no-repeat !important;opacity:' + imgOpacity + ' !important;' + invertCss + fadeMask + 'pointer-events:none !important;z-index:0 !important;}'
    + '[class*="_centerCol"] [class*="_root"],[class*="_mainPanel"] [class*="_root"]{background-color:transparent !important;}'
    + 'html[data-zr-state="empty"][data-zr-bg-empty="0"] [class*="_centerCol"]::before,html[data-zr-state="empty"][data-zr-bg-empty="0"] [class*="_mainPanel"]::before,html[data-zr-state="session"][data-zr-bg-session="0"] [class*="_centerCol"]::before,html[data-zr-state="session"][data-zr-bg-session="0"] [class*="_mainPanel"]::before{display:none !important;}';
}

function applyTokens(theme, pref) {
      theme = theme || themeRef;
      const scheme = resolveScheme(pref.mode, theme);
      liveScheme = scheme;
      const tokens = Object.assign({}, tokensForPref(pref, scheme));
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
          const kind = specBg.kind === 'photo' || specBg.kind === 'texture'
            ? specBg.kind
            : (specBg.source === 'theme' ? 'texture' : 'photo');
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
      try {
        if (zrSkinDispose) {
          try { zrSkinDispose(); } catch (e) { /* 旧的已经不在了也无妨 */ }
          zrSkinDispose = null;
        }
        dispose = theme.overrideTokens(SOURCE, overrideMap) || (function () {});
        zrSkinDispose = dispose;
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
        // 照片：按采样解出对比度上限；底纹：恒 0.7（lighten 只留亮线，实测侵蚀极小）。
        const photoCap = zrPhotoCapFor(bgUrl, tokens['--dsw-alias-label-primary'], tokens['--dsw-alias-bg-base'], bgKind);
        currentPhotoCap = photoCap;
        const bgCss = bgCssFor({ photoCap: photoCap, bgUrl: bgUrl, bgOpacity: bgOpacity, bgStyle: bgStyle, bgIsImage: !!(specBg && specBg.source === 'image') || pref.bgSource === 'image', bgInvert: bgInvert, bgKind: bgKind, tokens: tokens, scheme: scheme });
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
        if (pref.mdTable === 'line' || pref.mdTable === 'zebra') {
          mdFine += MDC + ' table{border-collapse:collapse;}'
            + MDC + ' :where(th,td){border:1px solid var(--dsw-alias-border-l2);padding:6px 10px;}';
          if (pref.mdTable === 'zebra') {
            mdFine += MDC + ' thead th{background:var(--dsw-alias-bg-layer-1);font-weight:600;}'
              + MDC + ' tbody tr:nth-child(even){background:var(--dsw-alias-bg-layer-1);}';
          }
        }
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
          console.info('[zhuoer-theme] applied', pref.theme, scheme, Object.keys(tokens).length, 'tokens · overrideTokens', overrideApplied ? 'ok' : 'skipped');
        } catch (e3) { /* ignore */ }
      } catch (e2) { /* ignore */ }
      return dispose;
    }

    // ---- 设置面板样式（v60 试样台：主题卡 = 界面试样，编辑器 = 可调试样）----
    // 排版规则：
    //   · 字体只用 11/12/13/15/20；圆角只用 2/3/4/6/8/10/999；间距 ≥4px 一律偶数。
    //   · 颜色只经 CSS 变量 / 内联 --zp-* 数据变量进入，PANEL_CSS 保持零色值。
    //   · 主题卡的「试样」是内容不是装饰：底 / 表面 / 字 / 品牌 / 语义色都取该主题自己的 token。
    //   · 区块 = 18px 留白 + 1px 细线；全局偏好内部用 14px 分组，避免六个同款大块。
    const PANEL_CSS = [
      '.zp-root{display:flex;flex-direction:column;gap:0;min-width:0;max-width:100%;',
      'color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5;}',
      '.zp-root,.zp-root *{box-sizing:border-box;min-width:0;}',
      '.zp-hd{display:flex;flex-direction:column;gap:6px;}',
      '.zp-hd-row{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px;}',
      '.zp-hd-t{font-size:15px;font-weight:600;letter-spacing:.01em;}',
      '.zp-hd-cur{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;',
      'color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.zp-hd-cur::before{content:"";width:3px;height:12px;border-radius:2px;flex:0 0 auto;',
      'background:var(--zp-hd-accent,var(--dsw-alias-brand-primary));}',
      '.zp-hd-m{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;',
      'font-size:12px;color:var(--dsw-alias-label-tertiary);}',
      '.zp-live{display:inline-flex;align-items:center;gap:6px;}',
      '.zp-live::before{content:"";width:6px;height:6px;border-radius:999px;',
      'background:var(--dsw-alias-state-success-primary);}',
      '.zp-sec{display:flex;flex-direction:column;gap:12px;',
      'padding-top:18px;margin-top:18px;border-top:1px solid var(--dsw-alias-border-l1);}',
      '.zp-sec-hd{display:flex;flex-direction:column;gap:2px;}',
      '.zp-sec-t{font-size:13px;font-weight:600;letter-spacing:.01em;margin:0;}',
      '.zp-sec-n{font-size:12px;line-height:1.55;color:var(--dsw-alias-label-secondary);max-width:56em;}',
      // ---- 主题库：界面试样 ----
      '.zp-ths{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:8px;}',
      '.zp-th{position:relative;display:flex;flex-direction:column;gap:6px;padding:6px;border-radius:8px;',
      'cursor:pointer;font:inherit;text-align:left;color:inherit;background:transparent;',
      'border:1px solid var(--dsw-alias-border-l1);transition:border-color .13s ease;}',
      '.zp-th:hover{border-color:var(--dsw-alias-border-l3);}',
      '.zp-th[data-on="1"]{border-color:var(--dsw-alias-brand-primary);',
      'box-shadow:0 0 0 1px var(--dsw-alias-brand-primary);}',
      '.zp-th[data-on="1"]::after{content:"";position:absolute;top:10px;right:10px;width:14px;height:14px;',
      'border-radius:999px;background:var(--dsw-alias-brand-primary);',
      'box-shadow:0 0 0 2px var(--dsw-alias-bg-base);}',
      '.zp-th[data-on="1"]::before{content:"";position:absolute;top:13px;right:15px;z-index:1;width:4px;height:8px;',
      'border-right:1.5px solid var(--dsw-alias-label-primary-foreground);',
      'border-bottom:1.5px solid var(--dsw-alias-label-primary-foreground);transform:rotate(45deg);}',
      '.zp-th:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;}',
      '.zp-th-n{display:flex;flex-direction:column;gap:1px;padding:0 2px;min-width:0;}',
      '.zp-th-nm{font-size:12px;font-weight:600;line-height:1.3;',
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.zp-th-add{border-style:dashed;align-items:center;justify-content:center;min-height:96px;}',
      '.zp-th-p-add{display:flex;align-items:center;justify-content:center;height:64px;width:100%;',
      'border:1px dashed var(--dsw-alias-border-l2);border-radius:8px;background:transparent;',
      'font-size:20px;line-height:1;color:var(--dsw-alias-label-tertiary);}',
      // 试样：3px 品牌书脊 + 15px 表面侧轨 + 内容卡 + 两行字色 + 三枚语义点。
      '.zp-spec{position:relative;display:block;overflow:hidden;border-radius:8px;',
      'background:var(--zp-spec-bg,var(--dsw-alias-bg-layer-2));',
      'border:1px solid var(--zp-spec-line,var(--dsw-alias-border-l2));}',
      '.zp-spec::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;',
      'background:var(--zp-spec-accent,var(--dsw-alias-brand-primary));}',
      '.zp-spec-rail{position:absolute;left:3px;top:0;bottom:0;width:15px;',
      'background:var(--zp-spec-rail,var(--dsw-alias-bg-layer-2));',
      'border-right:1px solid var(--zp-spec-line,var(--dsw-alias-border-l2));}',
      '.zp-spec-bar{position:absolute;left:18px;right:0;top:0;height:10px;',
      'background:var(--zp-spec-rail,var(--dsw-alias-bg-layer-2));',
      'border-bottom:1px solid var(--zp-spec-line,var(--dsw-alias-border-l2));}',
      '.zp-spec-card{position:absolute;left:26px;right:8px;top:18px;bottom:16px;display:flex;',
      'flex-direction:column;justify-content:center;gap:4px;padding:6px;border-radius:4px;',
      'background:var(--zp-spec-card,var(--dsw-alias-bg-layer-3));',
      'border:1px solid var(--zp-spec-line,var(--dsw-alias-border-l2));}',
      '.zp-spec-ln{height:3px;width:100%;border-radius:2px;',
      'background:var(--zp-spec-ink,var(--dsw-alias-label-primary));opacity:.58;}',
      '.zp-spec-ln.is-2{width:64%;opacity:.3;}',
      '.zp-spec-btn{position:absolute;right:6px;bottom:6px;width:24px;height:8px;border-radius:2px;',
      'background:var(--zp-spec-accent,var(--dsw-alias-brand-primary));}',
      '.zp-spec-dots{position:absolute;left:26px;bottom:6px;display:flex;gap:4px;}',
      '.zp-spec-dot{width:5px;height:5px;border-radius:999px;',
      'background:var(--zp-spec-ok,var(--dsw-alias-state-success-primary));}',
      '.zp-spec-dot.is-warn{background:var(--zp-spec-warn,var(--dsw-alias-state-warn-primary));}',
      '.zp-spec-dot.is-err{background:var(--zp-spec-err,var(--dsw-alias-state-error-primary));}',
      '.zp-th-p{height:64px;width:100%;}',
      // ---- 风格预设：配方签 ----
      '.zp-recipes{display:flex;flex-wrap:wrap;gap:8px;}',
      '.zp-recipe{display:inline-flex;align-items:center;gap:8px;min-height:48px;padding:6px 10px 6px 6px;',
      'border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:transparent;',
      'color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:1.3;cursor:pointer;',
      'transition:border-color .15s ease,background-color .15s ease;}',
      '.zp-recipe:hover{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-interactive-bg-hover);}',
      '.zp-recipe:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;}',
      '.zp-recipe-spine{width:6px;height:32px;flex:0 0 auto;border-radius:3px;',
      'border:1px solid var(--dsw-alias-border-l2);',
      'background:linear-gradient(180deg,var(--zp-pre-bg) 0 34%,var(--zp-pre-brand) 34% 67%,var(--zp-pre-accent) 67% 100%);}',
      '.zp-recipe-nm{white-space:nowrap;}',
      // ---- 自定义配色：当前自定义主题的试样 + 动作 ----
      '.zp-cus{display:flex;flex-direction:column;gap:8px;padding:10px;border-radius:8px;',
      'background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);}',
      '.zp-cus-hd{display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-width:0;}',
      '.zp-cus-pv{width:112px;height:64px;flex:0 0 112px;}',
      '.zp-cus-info{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 120px;}',
      '.zp-cus-nm{font-size:13px;font-weight:600;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.zp-cus-note{font-size:12px;line-height:1.4;color:var(--dsw-alias-label-secondary);',
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.zp-cus-acts{display:flex;gap:8px;flex-wrap:wrap;padding-top:2px;}',
      // ---- 全局偏好：一条台账 ----
      '.zp-grp{display:flex;flex-direction:column;gap:8px;}',
      // Section 里第一个 PrefGroup 前面还有 .zp-sec-hd（也是 div），所以用兄弟选择器而不是 :first-of-type。
      '.zp-grp+.zp-grp{padding-top:14px;margin-top:14px;border-top:1px solid var(--dsw-alias-border-l1);}',
      '.zp-grp-hd{display:flex;flex-direction:column;gap:2px;}',
      '.zp-grp-t{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary);}',
      '.zp-grp-n{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary);max-width:56em;}',
      '.zp-grp-b{display:flex;flex-direction:column;gap:8px;min-width:0;}',
      // ---- 通用控件 ----
      '.zp-seg{display:inline-flex;flex-wrap:wrap;gap:2px;padding:2px;border-radius:10px;',
      'background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);}',
      '.zp-pill{appearance:none;display:inline-flex;align-items:center;gap:4px;min-height:28px;padding:4px 12px;',
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
      '.zp-btn{display:inline-flex;align-items:center;gap:6px;min-height:28px;padding:4px 12px;border-radius:8px;',
      'font:inherit;font-size:12px;line-height:1.5;cursor:pointer;',
      'background:var(--dsw-alias-button-elevated-fill);border:1px solid var(--dsw-alias-border-l2);',
      'color:var(--dsw-alias-label-primary);',
      'transition:background-color .12s ease,border-color .12s ease,box-shadow .12s ease;}',
      '.zp-btn:hover{background:var(--dsw-alias-interactive-bg-hover);',
      'border-color:var(--dsw-alias-border-l3);}',
      '.zp-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;}',
      '.zp-btn[disabled]{opacity:.42;cursor:default;}',
      '.zp-btn[disabled]:hover{background:var(--dsw-alias-button-elevated-fill);',
      'border-color:var(--dsw-alias-border-l2);}',
      '.zp-btn[data-tone="danger"]{background:var(--dsw-alias-bg-base);',
      'color:var(--dsw-alias-label-error);border-color:var(--dsw-alias-state-error-primary);}',
      '.zp-btn[data-tone="danger"]:hover{background:var(--dsw-alias-bg-base);',
      'border-color:var(--dsw-alias-state-error-primary);',
      'box-shadow:0 0 0 1px var(--dsw-alias-state-error-primary);}',
      '.zp-btn[data-tone="danger"].is-armed{background:var(--dsw-alias-interactive-bg-hover-danger);',
      'border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-label-primary);',
      'box-shadow:0 0 0 1px var(--dsw-alias-state-error-primary);font-weight:600;}',
      '.zp-btn-pri{background:var(--dsw-alias-button-primary-fill);',
      'color:var(--dsw-alias-label-primary-foreground,var(--dsw-alias-bg-base));border-color:transparent;}',
      '.zp-btn-pri:hover{background:var(--dsw-alias-button-primary-hover);}',
      '.zp-file{position:relative;}',
      '.zp-file input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;}',
      '.zp-file:focus-within{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;}',
      '.zp-txt{padding:4px 8px;min-height:28px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);',
      'background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px;min-width:110px;}',
      '.zp-txt:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}',
      '.zp-num{width:104px;text-align:right;}',
      '.zp-sel-wrap{display:inline-flex;min-width:0;}',
      '.zp-sel{appearance:none;padding-right:26px;background-repeat:no-repeat;background-position:right 8px center;',
      'background-size:9px;background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),',
      'linear-gradient(135deg,currentColor 50%,transparent 50%);',
      'background-position-x:calc(100% - 14px),calc(100% - 9px);background-size:5px 5px,5px 5px;}',
      '.zp-sws{display:flex;align-items:center;flex-wrap:wrap;gap:12px;}',
      '.zp-sw{position:relative;width:24px;height:24px;min-width:24px;min-height:24px;padding:0;',
      'border-radius:999px;cursor:pointer;border:1px solid var(--dsw-alias-border-l3);background:transparent;',
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
      '.zp-hint.is-warn{font-weight:600;text-decoration:underline dotted var(--dsw-alias-state-error-primary);',
      'text-underline-offset:2px;}',
      '.zp-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;',
      'clip:rect(0,0,0,0);white-space:nowrap;border:0;}',
      '.zp-note{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:8px 10px;border-radius:8px;',
      'font-size:12px;line-height:1.5;color:var(--dsw-alias-label-primary);',
      'background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);}',
      // ---- 编辑器 ----
      '.zp-ed{position:fixed;inset:0;z-index:2147483000;pointer-events:none;}',
      'html[data-windows-titlebar] .zp-ed-panel{top:var(--dsh-windows-titlebar-height,34px);}',
      '.zp-ed-panel{pointer-events:auto;position:absolute;left:0;top:0;bottom:0;width:392px;max-width:94vw;',
      'display:flex;flex-direction:column;gap:12px;padding:16px;overflow:auto;background:var(--dsw-alias-bg-base);',
      'border-right:1px solid var(--dsw-alias-border-l2);',
      'box-shadow:var(--dsw-elevation-panel);}',
      '.zp-ed-hd{position:sticky;top:-16px;z-index:2;display:flex;align-items:center;justify-content:space-between;',
      'gap:8px;margin:-16px -16px 0;padding:14px 16px 10px;background:var(--dsw-alias-bg-base);',
      'border-bottom:1px solid var(--dsw-alias-border-l1);}',
      '.zp-ed-ttl{font-size:15px;font-weight:600;}',
      '.zp-ed-x{width:26px;height:26px;border-radius:8px;border:1px solid transparent;background:transparent;',
      'color:var(--dsw-alias-label-secondary);font-size:18px;line-height:1;cursor:pointer;}',
      '.zp-ed-x:hover{background:var(--dsw-alias-interactive-bg-hover);}',
      '.zp-ed-sec{display:flex;flex-direction:column;gap:8px;padding-top:14px;',
      'border-top:1px solid var(--dsw-alias-border-l1);}',
      '.zp-ed-hd+.zp-ed-sec{padding-top:0;border-top:0;}',
      '.zp-ed-spec{height:96px;margin:0 0 2px;}',
      // 锚点带：5 个语义带，带内聚、带间呼吸
      '.zp-bands{display:flex;flex-direction:column;gap:10px;}',
      '.zp-band{display:flex;flex-direction:column;gap:4px;}',
      '.zp-band-hd{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;',
      'color:var(--dsw-alias-label-secondary);}',
      '.zp-band-hd::after{content:"";flex:1;height:1px;background:var(--dsw-alias-border-l1);}',
      '.zp-ed-list{display:flex;flex-direction:column;gap:2px;}',
      '.zp-ed-item{display:grid;grid-template-columns:minmax(4.6em,auto) 26px 14px minmax(0,1fr) 56px 24px;',
      'gap:6px;align-items:center;padding:3px 0 3px 2px;border-radius:6px;}',
      '.zp-ed-lbl{font-size:12px;color:var(--dsw-alias-label-tertiary);overflow:hidden;word-break:break-word;',
      'white-space:normal;line-height:1.15;max-width:6.8em;}',
      '.zp-ed-item.is-dirty .zp-ed-lbl{color:var(--dsw-alias-label-primary);font-weight:600;}',
      '.zp-ed-item.is-dirty{background:var(--dsw-alias-interactive-bg-hover);}',
      '.zp-ed-def{width:14px;height:22px;border-radius:4px;',
      'border:1px dashed var(--dsw-alias-border-l3);background:transparent;}',
      '.zp-ed-hex{min-width:0;width:100%;}',
      '.zp-ed-ratio{font-size:11px;text-align:right;color:var(--dsw-alias-label-tertiary);',
      'font-variant-numeric:tabular-nums;}',
      '.zp-ed-ratio.is-low{color:var(--dsw-alias-state-warn-primary);font-weight:600;}',
      '.zp-ed-reset{width:24px;height:24px;border-radius:6px;border:1px solid transparent;background:transparent;',
      'color:var(--dsw-alias-label-tertiary);cursor:pointer;}',
      '.zp-ed-reset:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);}',
      '.zp-ed-reset[disabled]{opacity:.28;cursor:default;background:transparent;color:var(--dsw-alias-label-tertiary);}',
      '.zp-ed-reset:focus-visible,.zp-ed-x:focus-visible,.zp-color:focus-visible{',
      'outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}',
      '.zp-adv-toggle{justify-self:start;font:inherit;font-size:12px;padding:4px 10px;border-radius:8px;cursor:pointer;',
      'background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);',
      'border:1px solid var(--dsw-alias-border-l2);}',
      '.zp-adv-toggle:hover{background:var(--dsw-alias-interactive-bg-hover);}',
      '.zp-adv-grp{display:flex;flex-direction:column;gap:2px;margin-top:2px;}',
      '.zp-adv-hd{display:flex;align-items:center;gap:6px;width:100%;text-align:left;font:inherit;font-size:12px;',
      'padding:4px 8px;border-radius:6px;cursor:pointer;background:transparent;',
      'color:var(--dsw-alias-label-secondary);border:1px solid transparent;}',
      '.zp-adv-hd:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}',
      '.zp-adv-chev{width:12px;flex:0 0 auto;text-align:center;font-size:11px;color:var(--dsw-alias-label-tertiary);}',
      '.zp-adv-nm{flex:1;min-width:0;}',
      '.zp-adv-n{font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;}',
      '.zp-ed-ai{display:flex;flex-direction:column;gap:6px;flex:1;min-width:0;}',
      '.zp-ed-err{font-size:12px;color:var(--dsw-alias-state-error-primary);line-height:1.45;}',
      '.zp-pal{display:flex;flex-wrap:wrap;gap:8px;padding-top:2px;}',
      '.zp-pal-item{display:flex;flex-direction:column;align-items:center;gap:3px;min-width:56px;}',
      '.zp-pal-sw{width:100%;height:34px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);}',
      '.zp-pal-hex{font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;',
      'color:var(--dsw-alias-label-secondary);}',
      '.zp-pal-share{font-size:11px;color:var(--dsw-alias-label-tertiary);}',
      '.zp-pal-name{font-size:11px;color:var(--dsw-alias-label-secondary);max-width:64px;',
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.zp-json{width:100%;box-sizing:border-box;padding:8px;border-radius:8px;',
      'border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);',
      'color:var(--dsw-alias-label-primary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;',
      'font-size:12px;line-height:1.5;resize:vertical;}',
      '.zp-ed-ft{position:sticky;bottom:-16px;z-index:2;display:flex;flex-direction:column;gap:8px;',
      'margin:0 -16px -16px;padding:10px 16px 14px;background:var(--dsw-alias-bg-base);',
      'border-top:1px solid var(--dsw-alias-border-l1);}',
      '.zp-ed-ft-row{display:flex;align-items:center;flex-wrap:wrap;gap:8px;justify-content:flex-end;}',
      '.zp-ed-ft-row.is-aux{justify-content:flex-start;}',
      '.zp-ed-ft-note{flex:1 1 120px;font-size:12px;line-height:1.4;color:var(--dsw-alias-label-secondary);}',
      '.zp-ed-confirm{flex:1;font-size:12px;line-height:1.4;color:var(--dsw-alias-state-warn-primary);}',
      '.zp-foot{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;',
      'padding-top:18px;margin-top:18px;border-top:1px solid var(--dsw-alias-border-l1);}',
      '@media (prefers-reduced-motion: reduce){.zp-root *{transition:none !important;',
      'animation:none !important;}}',
      // 极窄容器：行标签独占一行，避免「标签被压成竖条」
      '[data-zr-narrow="1"] .zp-lbl{width:auto;flex:1 0 100%;}',
      '@media (max-width:359px){.zp-lbl{width:auto;flex:1 0 100%;}',
      '.zp-sec{padding-top:14px;margin-top:14px;}.zp-hd{gap:4px;}',
      '.zp-ths{grid-template-columns:repeat(auto-fill,minmax(112px,1fr));}}',
    ].join('');

    // 分组容器：统一「标题 + 说明 + 内容」的节奏，间距不再靠逐项手调。
    function Section(props) {
      return h('section', { className: 'zp-sec', 'aria-label': props.title },
        h('div', { className: 'zp-sec-hd' },
          h('h3', { className: 'zp-sec-t' }, props.title),
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

    // 全局偏好内部的安静分组：12px 标题 + 细线，不再让每一块都长得像顶层 Section。
    function PrefGroup(props) {
      return h('div', { className: 'zp-grp' },
        h('div', { className: 'zp-grp-hd' },
          h('div', { className: 'zp-grp-t' }, props.title),
          props.note ? h('div', { className: 'zp-grp-n' }, props.note) : null
        ),
        h('div', { className: 'zp-grp-b' }, props.children)
      );
    }

    // 胶囊单选组：用 aria-pressed 而不是 role=radio。
    // radio 组要求方向键导航，宿主里没人教；按钮组 Tab 能直接落到每一项。
    // 语义用 radiogroup + aria-checked：屏读会播报「X，单选，已选中 2/5」。
    // 仍然是 <button>（不是真 radio），这样 Tab 能逐项落下、不需要实现方向键导航。
    function Pills(props) {
      return h('div', { className: 'zp-seg', role: 'radiogroup', 'aria-label': props.label },
        props.opts.map(function (o) {
          const on = props.value === o[0];
          return h('button', {
            key: String(o[0]), type: 'button', className: 'zp-pill', role: 'radio',
            'data-on': on ? '1' : '0', 'aria-checked': on,
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
          props.noEmpty ? null : h('option', { value: '__empty__' }, props.emptyLabel || t('panel.sel.follow')),
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

    // 界面试样：把一套主题的底 / 表面 / 字 / 品牌 / 语义色搭成一个微型界面。
    // 这是面板里唯一引用非当前 token 的地方 —— 12 张卡不这样会长得一模一样，
    // 用户也没有选择依据。颜色一律经内联 --zp-spec-* 变量交给 CSS，PANEL_CSS 保持零色值。
    function specimenVars(tk) {
      const pv = {};
      [['--zp-spec-bg', '--dsw-alias-bg-base'], ['--zp-spec-rail', '--dsw-alias-bg-layer-2'],
        ['--zp-spec-card', '--dsw-alias-bg-layer-3'], ['--zp-spec-line', '--dsw-alias-border-l2'],
        ['--zp-spec-ink', '--dsw-alias-label-primary'], ['--zp-spec-accent', '--dsw-alias-brand-primary'],
        ['--zp-spec-ok', '--dsw-alias-state-success-primary'],
        ['--zp-spec-warn', '--dsw-alias-state-warn-primary'],
        ['--zp-spec-err', '--dsw-alias-state-error-primary']].forEach(function (pair) {
        // 旧草稿可能缺某个 token：不写空值，让 CSS 的 var() 兜底。
        if (tk[pair[1]]) pv[pair[0]] = tk[pair[1]];
      });
      if (!pv['--zp-spec-card'] && tk['--dsw-alias-bg-layer-2']) {
        pv['--zp-spec-card'] = tk['--dsw-alias-bg-layer-2'];
      }
      return pv;
    }

    function Specimen(props) {
      return h('span', {
        className: 'zp-spec ' + (props.className || ''),
        style: props.vars || {}, 'aria-hidden': 'true',
      },
        h('span', { className: 'zp-spec-rail' }),
        h('span', { className: 'zp-spec-bar' }),
        h('span', { className: 'zp-spec-card' },
          h('span', { className: 'zp-spec-ln' }),
          h('span', { className: 'zp-spec-ln is-2' }),
          h('span', { className: 'zp-spec-btn' })
        ),
        h('span', { className: 'zp-spec-dots' },
          h('span', { className: 'zp-spec-dot' }),
          h('span', { className: 'zp-spec-dot is-warn' }),
          h('span', { className: 'zp-spec-dot is-err' })
        )
      );
    }

    // 主题卡：整张卡就是一块界面试样 + 用户可读的名字。
    // 内部 id（zhuoer / vintage-paper）不再上屏：那是系统语言，不是用户语言；
    // 只留在 title 里供排障。
    function Swatch(props) {
      const def = props.def || {};
      const tk = def[props.scheme] || def.dark || {};
      const label = themeLabelOf(def.label || props.id);
      const active = props.active;
      return h('button', {
        type: 'button', className: 'zp-th', 'data-on': active ? '1' : '0', role: 'radio',
        'aria-checked': active, 'aria-pressed': active, title: label + ' (' + props.id + ')',
        onClick: function () { props.onPick(props.id); },
      },
        h(Specimen, { className: 'zp-th-p', vars: specimenVars(tk) }),
        h('span', { className: 'zp-th-n' },
          h('span', { className: 'zp-th-nm' }, label)
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
      const fetchAiNonce = function () {
        if (aiNonce) return Promise.resolve(aiNonce);
        return fetch('/dsh-zhuoer-theme/api/nonce', { headers: { 'x-zhuoer-client': '1' } })
          .then(function (r) { return r.json(); })
          .then(function (d) { aiNonce = (d && d.nonce) || ''; return aiNonce; });
      };
      const aiGenerate = function () {
        const prompt = String(aiPrompt || '').trim();
        if (!prompt) return;
        setAiBusy(true); setAiErr(''); setAiResult(null);
        // query string 传参：宿主会在 handler 之前截走 POST body。
        fetchAiNonce()
          .then(function (nonce) {
            return fetch('/dsh-zhuoer-theme/api/gen-theme?prompt=' + encodeURIComponent(prompt), { method: 'GET', headers: { 'x-zhuoer-client': '1', 'x-zhuoer-nonce': nonce } });
          })
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
                      const ratio = g.key === 'bg' ? null : contrastRatio(cur, bgHex);
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
                            const ratio = contrastRatio(cur, bgAll);
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
                  value: pref.bgOpacity, 'aria-label': t('panel.bg.opacityAria'),
                  // 已选段长度交给 CSS 渐变：读起来是「填到哪了」，不是一根无信息的灰轨
                  style: { '--zp-pct': (Number(pref.bgOpacity) || 0) + '%' },
                  onChange: function (ev) { set({ bgOpacity: Number(ev.target.value) || 0 }); },
                }),
                h('span', { className: 'zp-val' }, pref.bgOpacity + '%'),
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
              pref.fontScale !== 100 && HOST_TEXT_STATS && HOST_TEXT_STATS.rules === 0
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
            const palette = extractPalette(img, 6);
            const lightAnchors = paletteToAnchors(palette, 'light');
            const darkAnchors = paletteToAnchors(palette, 'dark');
            if (!lightAnchors || !darkAnchors) return;
            // 明暗各出一套：与「对话里 AI 生成」保持一致，深色不是由浅色反推的。
            const next = Object.assign({}, spec, {
              light: lightAnchors, dark: darkAnchors, autoDark: false, sampled: true,
              sampledHex: palette.map(function (c) { return c.hex; }).slice(0, 6),
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
                ? (function () {
                    const rep = typeof overrideReport === 'function' ? overrideReport() : null;
                    if (!rep || !rep.applied || !rep.applied.length) return h('span', { className: 'zrc-ok' }, t('panel.chat.applied'));
                    const soft = rep.softened && rep.softened.length ? ' · ' + t('panel.chat.ovSoft').replace('{s}', String(rep.softened.length)) : '';
                    return h('span', { className: 'zrc-ok' }, t('panel.chat.ovApplied').replace('{n}', String(rep.applied.length)) + soft);
                  })()
                : h('button', { type: 'button', className: 'zrc-btn', 'data-pri': '1', onClick: function () { applied(spec); } }, t('panel.chat.apply')),
              h('button', { type: 'button', className: 'zrc-btn', onClick: startEdit }, t('panel.chat.modify')),
            ),
        spec.textureDecision === 'no' && !spec.texture
          ? h('div', { className: 'zrc-texnote' }, t('panel.chat.texOff'))
          : null,
        spec.sampledHex && spec.sampledHex.length
          ? h('div', { className: 'zrc-texnote' }, t('panel.chat.sampled') + '：' + spec.sampledHex.join(' · '))
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
