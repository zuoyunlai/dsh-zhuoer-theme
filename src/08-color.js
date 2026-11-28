    /* ================= 颜色换算（唯一真源） =================
     * 为什么单独一片：此前 hex 解析、亮度、WCAG 对比度公式散落在「主题派生」与
     * 「token 注入」两处各有一份——4 套 hex 解析、2 套亮度、3 份对比度公式，
     * 口径还不一致：有的接受 #fff 简写、有的只认 6 位；非法输入有的返回 0、有的返回 null。
     * 现在统一到这一片：脚本也按名字从 client.js 里抠同一份实现来测，
     * 抠的是产物本身而不是副本，线上线下不会两套行为。
     */

    /** sRGB 通道 → 线性化（WCAG 相对亮度的第一步）。 */
    function zrLin(v) { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }

    /** hex → [r,g,b]；接受 #rgb 与 #rrggbb（'#' 可省），认不出返回 null。 */
    function parseHexColor(c) {
      const s = String(c || '').trim().replace(/^#/, '');
      const full = s.length === 3 ? s.split('').map(function (x) { return x + x; }).join('') : s;
      if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
      return [0, 2, 4].map(function (i) { return parseInt(full.slice(i, i + 2), 16); });
    }

    /** [r,g,b] → '#rrggbb'（越界自动夹取）。 */
    function toHexColor(rgb) {
      return '#' + rgb.map(function (v) {
        return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
      }).join('');
    }

    /** hex → WCAG 相对亮度；认不出返回 null。 */
    function zrHexLum(hex) {
      const c = parseHexColor(hex);
      return c ? 0.2126 * zrLin(c[0]) + 0.7152 * zrLin(c[1]) + 0.0722 * zrLin(c[2]) : null;
    }

    /** 两个亮度 → WCAG 对比度比值。 */
    function zrRatio(a, b) { return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }

    /** 两个颜色 → 对比度；任一认不出返回 null（面板显示「—」，不显示 0）。 */
    function zrContrast(a, b) {
      const la = zrHexLum(a), lb = zrHexLum(b);
      if (la === null || lb === null) return null;
      return zrRatio(la, lb);
    }

    /* ---- HSL 换算（强调色预设与锚点派生共用） ---- */

    /** hex → [h, s, l]；认不出返回 null。 */
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

    /** [h, s, l] → '#rrggbb'。 */
    function hslHex(h, s, l) {
      const k = function (n) {
        const m = (n + h / 30) % 12;
        const a = s * Math.min(l, 1 - l);
        const v = l - a * Math.max(-1, Math.min(m - 3, Math.min(9 - m, 1)));
        return Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
      };
      return '#' + k(0) + k(8) + k(4);
    }

    // ---- OKLCH 换算：已评估并否掉，这里不实现 ----
    // 0.7.0 试过把锚点派生从 HSL 换成 OKLCH（HSL 的 L 不是感知亮度，提亮锚点时还会把彩度一起放大：
    // 实测 rose 的三级文字被派生成 #7260f7，对底色只有 3.98:1，破 AA）。全量 1181 个 token 对照下来：
    // text 族修好 12 条 AA，却造成 7 条倒退（beacon/light 5.02 → 3.82），ΔE 最大 30.8。
    // 用 12 换 7 不划算，真正的修法是把那些文字 token 补进 TEXT_FLOOR 地板表。
    // 结论与完整理由写在 12-theme-derive.js 的 shiftMember() 注释里——派生逻辑的真源在那儿。
