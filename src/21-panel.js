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
      '.zp-ed-panel{pointer-events:auto;position:absolute;left:0;top:0;bottom:0;width:var(--zp-ed-w,392px);max-width:94vw;',
      'display:flex;flex-direction:column;gap:12px;padding:16px;overflow:auto;background:var(--dsw-alias-bg-base);',
      'border-right:1px solid var(--dsw-alias-border-l2);',
      'box-shadow:var(--dsw-elevation-panel);}',
      // C1：左边缘 6px 拖拽热区。视觉上是 2px 竖线，热区放大到 6px 才拖得着（与宿主分隔条同一手法）。
      // 用 fixed 而不是 absolute：面板本身 overflow:auto，absolute 子元素会跟着内容一起滚走，
      // 滚到一半就没有热区可抓了（锚点列表很长，这是常态而不是边界）。
      // 热区**不从 x=0 起**：桌面端无边框窗口最左 5px 是系统的窗口缩放判定区，
      // 从 0 起的热区会被窗口边框吃掉——现象就是「怎么拖都没反应」。所以从 6px 起、宽 10px。
      // 竖线常驻（35% 不透明度），让「这里能拖」自己长出来，而不是靠用户悬停试出来。
      '.zp-ed-rz{position:fixed;left:6px;top:0;bottom:0;width:10px;cursor:col-resize;z-index:3;',
      'background:transparent;border:0;padding:0;touch-action:none;}',
      'html[data-windows-titlebar] .zp-ed-rz{top:var(--dsh-windows-titlebar-height,34px);}',
      '.zp-ed-rz::before{content:"";position:absolute;left:0;top:0;bottom:0;width:2px;border-radius:2px;',
      'background:var(--dsw-alias-border-l2);opacity:.35;transition:opacity .12s ease,background-color .12s ease;}',
      '.zp-ed-rz:hover::before,.zp-ed-rz:focus-visible::before{opacity:1;background:var(--dsw-alias-brand-primary);}',
      '.zp-ed-rz:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px;}',
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

