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

