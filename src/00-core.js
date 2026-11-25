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
    // 版本号唯一源：面板文案与自检回传都用它，别再出现「构建 0.1.101」这种漂移。
    const PVERSION = '0.6.4';
    // 诊断探针总闸：默认关闭，开启方式 localStorage['dsh-zhuoer-theme:debug'] = '1'。
    // 下面若干探针会在每次 apply 时全文档遍历 DOM、逐元素 getComputedStyle、扫 styleSheets，
    // 是「启动 / 切主题卡顿」的主要来源之一，只在排障时打开。
    function zrDebug() {
      try { return window.localStorage.getItem('dsh-zhuoer-theme:debug') === '1'; } catch (e) { return false; }
    }
    report({ phase: 'bundle-evaluated' });
    report({ phase: 'factory-entered' });
    try {
      if (typeof window !== 'undefined') {
        window.addEventListener('error', function (ev) {
          report({ phase: 'window-error', message: String((ev && ev.message) || ev).slice(0, 300), file: String((ev && ev.filename) || '').slice(0, 200), line: ev && ev.lineno });
        });
      }
    } catch (e) { /* ignore */ }

    