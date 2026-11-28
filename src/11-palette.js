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

    // 当前被任何自定义主题引用的底图键（key 与 keyLight 都算）。
    // 内存缓存淘汰时用：这些键丢了就等于主题少一张图。
    function zrReferencedBgKeys() {
      const set = new Set();
      try {
        const list = (readPref() && readPref().customThemes) || [];
        for (let i = 0; i < list.length; i++) {
          const b = list[i] && list[i].bg;
          if (!b) continue;
          if (b.key) set.add(b.key);
          if (b.keyLight) set.add(b.keyLight);
        }
      } catch (e) { /* ignore */ }
      return set;
    }

    // 把 IDB 里的图全部读进内存缓存；完成后触发一次重算，让底图出现
    function preloadBgImages() {
      return idbAll().then(function (pairs) {
        // 预加载进内存缓存：Map 保持插入序，满了丢最旧的。
        // 为什么要有上限：每张 data URL 可到几 MB，用户换十几次图就是几十 MB 常驻。
        // 但**被主题引用的键不能被淘汰**：运行期只同步读内存缓存（IDB 没有按 key 读回的通路），
        // 淘汰掉就等于那条主题的底纹静默消失——对话里生成的主题每套带两张（明+暗），
        // 攒到第 7 套就会越过上限，这正是踩过的坑。
        const keep = zrReferencedBgKeys();
        pairs.forEach(function (p) { if (p[1]) zrCachePut(imageCache, p[0], p[1], keep); });
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

    // ---- 保真档（R-05 / F-05）----
    // 为什么要有第二档：面板是「给素材、人来挑」，3 秒出结果比精确更重要（快档 = 中位切分）；
    // 对话是「给结论、人来审」，用户没有「自己挑」这层兜底，所以必须扛得住「大面积单色」的照片。
    // 快档的已知失效：切点优先落在「颜色跳变最大处」，且 5 bit 量化后一块连续色带会并成 1 格；
    // 那一格再也不会被切（box.length < 2 直接跳过），于是 83% 的像素吐成同一个灰绿，
    // 天空蓝与云白整段丢失。实测证据见 docs/report-chat-theme-2026-11-27.md F-05。
    // 保真档三处不同：6 bit 量化（连续色带不再并成 1 格）→ 按「跨度 × √像素量」挑箱、
    // 在**加权中位**处切（不是最大跳变）→ 两轮 Lloyd 重心修正 → 亮部保底（云白这类高光不丢）。
    // rgb → #rrggbb。放在 palette 区：取色与底纹归一化都要用，只留一处实现。
    function zrTexHex(rgb) {
      return '#' + [rgb[0], rgb[1], rgb[2]].map(function (v) {
        return Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
      }).join('');
    }

    const paletteCentroid = function (box) {
      let r = 0, g = 0, b = 0, n = 0;
      box.forEach(function (p) { r += p.r * p.n; g += p.g * p.n; b += p.b * p.n; n += p.n; });
      return n ? [r / n, g / n, b / n] : [0, 0, 0];
    };
    const paletteMass = function (box) {
      let s = 0;
      box.forEach(function (p) { s += p.n; });
      return s;
    };
    function medianCutWeighted(pixels, count) {
      let boxes = [pixels];
      while (boxes.length < count) {
        let bestIdx = -1, bestScore = 0, bestCh = 'r';
        boxes.forEach(function (box, i) {
          if (box.length < 2) return;
          const mass = Math.sqrt(paletteMass(box));
          ['r', 'g', 'b'].forEach(function (ch) {
            let mn = 255, mx = 0;
            box.forEach(function (p) { if (p[ch] < mn) mn = p[ch]; if (p[ch] > mx) mx = p[ch]; });
            const rng = mx - mn;
            if (rng <= 0) return;
            const score = rng * mass;
            if (score > bestScore) { bestScore = score; bestIdx = i; bestCh = ch; }
          });
        });
        if (bestIdx < 0) break;
        const box = boxes[bestIdx];
        box.sort(function (a, b) { return a[bestCh] - b[bestCh]; });
        const totalN = paletteMass(box);
        let acc = 0, mid = -1;
        for (let i = 0; i < box.length; i++) {
          acc += box[i].n;
          if (acc * 2 >= totalN) { mid = i + 1; break; }
        }
        if (mid <= 0) mid = 1;
        if (mid >= box.length) mid = box.length - 1;
        boxes.splice(bestIdx, 1, box.slice(0, mid), box.slice(mid));
      }
      return boxes.filter(function (b) { return b.length; });
    }

    // 两轮 Lloyd：中位切分的箱子边界是「中位数」，中心未必是箱内真实重心，
    // 一轮重心修正就能把「灰绿混进天空蓝」这类偏色拉回来。不迭代更多轮：收益递减，且要保住确定性。
    function paletteLloyd(pixels, centers, rounds) {
      let cs = centers.map(function (c) { return [c[0], c[1], c[2]]; });
      for (let it = 0; it < rounds; it++) {
        const acc = cs.map(function () { return { r: 0, g: 0, b: 0, n: 0 }; });
        pixels.forEach(function (p) {
          let bi = 0, bd = Infinity;
          for (let i = 0; i < cs.length; i++) {
            const dr = p.r - cs[i][0], dg = p.g - cs[i][1], db = p.b - cs[i][2];
            const d = dr * dr + dg * dg + db * db;
            if (d < bd) { bd = d; bi = i; }
          }
          const a = acc[bi];
          a.r += p.r * p.n; a.g += p.g * p.n; a.b += p.b * p.n; a.n += p.n;
        });
        cs = cs.map(function (c, i) {
          const a = acc[i];
          return a.n ? [a.r / a.n, a.g / a.n, a.b / a.n] : c;
        });
      }
      return cs;
    }

    // 亮部保底：天空/云/高光本来占比小，最容易被切没。
    // 取「占比 >= 2% 的最亮一格」，若离所有中心都太远就替掉最不重要的那一色。
    function paletteBrightFloor(pixels, centers) {
      const total = paletteMass(pixels) || 1;
      let best = null;
      pixels.forEach(function (p) {
        if (p.n / total < 0.02) return;
        const l = 0.299 * p.r + 0.587 * p.g + 0.114 * p.b;
        if (!best || l > best.l) best = { l: l, rgb: [p.r, p.g, p.b] };
      });
      if (!best) return centers;
      let near = Infinity;
      centers.forEach(function (c) {
        const dr = c[0] - best.rgb[0], dg = c[1] - best.rgb[1], db = c[2] - best.rgb[2];
        const d = Math.sqrt(dr * dr + dg * dg + db * db);
        if (d < near) near = d;
      });
      if (near <= 40) return centers;
      // 替掉「离所有中心都最近、占比最小」的那一色：用质量最小的中心近似。
      const mass = centers.map(function (c) {
        let s = 0;
        pixels.forEach(function (p) {
          let bi = 0, bd = Infinity;
          centers.forEach(function (cc, i) {
            const dr = p.r - cc[0], dg = p.g - cc[1], db = p.b - cc[2];
            const d = dr * dr + dg * dg + db * db;
            if (d < bd) { bd = d; bi = i; }
          });
          if (bi === centers.indexOf(c)) s += p.n;
        });
        return s;
      });
      let minI = 0;
      for (let i = 1; i < mass.length; i++) if (mass[i] < mass[minI]) minI = i;
      const out = centers.slice();
      out[minI] = best.rgb;
      return out;
    }

    // 按「最近中心」重新统计占比，顺便把重心重合的两色合并。
    function paletteShares(pixels, centers) {
      const total = paletteMass(pixels) || 1;
      const acc = centers.map(function () { return { r: 0, g: 0, b: 0, n: 0 }; });
      pixels.forEach(function (p) {
        let bi = 0, bd = Infinity;
        for (let i = 0; i < centers.length; i++) {
          const dr = p.r - centers[i][0], dg = p.g - centers[i][1], db = p.b - centers[i][2];
          const d = dr * dr + dg * dg + db * db;
          if (d < bd) { bd = d; bi = i; }
        }
        const a = acc[bi];
        a.r += p.r * p.n; a.g += p.g * p.n; a.b += p.b * p.n; a.n += p.n;
      });
      const merged = new Map();
      acc.forEach(function (a) {
        if (!a.n) return;
        const hex = zrTexHex([a.r / a.n, a.g / a.n, a.b / a.n]);
        const cur = merged.get(hex);
        if (cur) cur.share += a.n / total;
        else merged.set(hex, { hex: hex, share: a.n / total });
      });
      return Array.from(merged.values()).sort(function (a, b) { return b.share - a.share; });
    }

    function faithfulPalette(pixels, count) {
      const n = Math.max(1, count || 6);
      if (pixels.length <= n) return paletteShares(pixels, pixels.map(function (p) { return [p.r, p.g, p.b]; }));
      const boxes = medianCutWeighted(pixels, n);
      let centers = boxes.map(paletteCentroid);
      centers = paletteLloyd(pixels, centers, 2);
      centers = paletteBrightFloor(pixels, centers);
      return paletteShares(pixels, centers);
    }
    // tier: 'fast'（默认，面板用的现算法）/ 'faithful'（对话用，见上）。
    // 缺省行为与改动前逐字一致——轻量档不该因为富档加档而变。
    function extractPalette(imageData, count, opts) {
      const tier = (opts && opts.tier === 'faithful') ? 'faithful' : 'fast';
      const data = imageData.data;
      const px = imageData.width * imageData.height;
      // 采样步长：把样本压到 1.2 万级，避免大图卡主线程
      const step = Math.max(1, Math.floor(Math.sqrt(px / 12000)));
      // 保真档用 6 bit 量化：连续色带在 5 bit 下会并成 1 格，而单格箱子永远不会被切，
      // 这就是「83% 像素吐成同一个灰绿」的机械原因。
      const mask = tier === 'faithful' ? 0xfc : 0xf8;
      const buckets = new Map();
      for (let y = 0; y < imageData.height; y += step) {
        for (let x = 0; x < imageData.width; x += step) {
          const i = (y * imageData.width + x) * 4;
          if (data[i + 3] < 128) continue;
          // 5 bit/通道量化，压掉噪点
          const r = data[i] & mask, g = data[i + 1] & mask, b = data[i + 2] & mask;
          const key = r + ',' + g + ',' + b;
          const cur = buckets.get(key);
          if (cur) cur.n++;
          else buckets.set(key, { r: r, g: g, b: b, n: 1 });
        }
      }
      const pixels = Array.from(buckets.values());
      if (!pixels.length) return [];
      if (tier === 'faithful') return faithfulPalette(pixels, count || 6);
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
      let brand = bySat.length ? ensureOnWhite(bySat[0].hex, 2.5) : text;
      // 次色用于图标/点缀/轨迹，会和底色同处一层，所以仍按底色校验
      const brand2 = bySat.length > 1 ? ensureVisible(bySat[1].hex, 2.2) : brand;
      // R-02：深色方案的品牌色必须**对底色可见**（≥3:1）。
      // 之前的漏洞：ensureOnWhite 只校验「按钮上的白字」，不管品牌色本身在深底上看不看得见——
      // 实测深色取色方案 brand #173200 on bg #1c221c = 1.15:1，深色模式下品牌色基本消失，
      // 而界面不报错、用户只会觉得「这个主题怪怪的」。
      // 修法：深底时把品牌色推到对底 ≥3:1；同时补一个前景色锚点（深底上的品牌色是亮色，
      // 白字压在上面会看不清），由调用方一起写进主题。
      if (!lightPhoto) brand = ensureVisible(brand, 3.0);
      // 前景色：品牌色变亮后（深底场景），白字压在上面读不清 → 用底色同族的深色做前景。
      const foreground = !lightPhoto && lum01(brand) > 0.45 ? shadeColor(bg, -0.04) : '';

      // 边框直接从底色派生：比底色暗/亮一档，天然可见，
      // 也不会出现"从照片里挑到一个和底色同亮度的色"这种事故。
      const border = shadeColor(bg, lum01(bg) > 0.5 ? -0.16 : 0.16);

      // 危险/警告：照片里推不出语义色，但用户期望"7 个锚点都填满"。
      // 给一对中性语义色，并按底色把对比度修到能看清；用户可再手动改。
      const danger = ensureVisible('#d92b2b', 3.0);
      const warn = ensureVisible('#b45309', 3.0);

      // R-02：补 success 锚点（系统要求 8 组，取色原来只给 7 组，success 回落基础主题，
      // 可能与品牌色撞车）。来源：照片里最偏绿的次色；照片里没有绿就按底色派生一个中性绿。
      const greenish = palette.filter(function (p) {
        const c = parseHexColor(p.hex) || [0, 0, 0];
        return c[1] - Math.max(c[0], c[2]) > 12;
      }).sort(function (a, b) { return b.share - a.share; });
      const success = greenish.length ? ensureVisible(greenish[0].hex, 3.0) : ensureVisible('#2e7d32', 3.0);
      const out = {
        '--dsw-alias-bg-base': bg,
        '--dsw-alias-label-primary': text,
        '--dsw-alias-border-l1': border,
        '--dsw-alias-brand-primary': brand,
        '--dsw-alias-trajectory-accent': brand2,
        '--dsw-alias-state-error-primary': danger,
        '--dsw-alias-state-warn-primary': warn,
        '--dsw-alias-state-success-primary': success,
      };
      // 品牌色被推到「对底 ≥3:1」时，它已经是亮色 → 白字压上去会看不清，
      // 所以同时下发一个深色前景锚点（宿主用它做品牌色上的文字色）。
      if (foreground) out['--dsw-alias-label-primary-foreground'] = foreground;
      return out;
    }

    // #endregion palette
    // #region texture-normalize
    // 底纹归一化（R-01 / F-01 F-02）：把「模型画的图」变成「能按 lighten 合成的线稿」。
    // 为什么必须落在客户端：判定极性与对齐底色都要读像素，服务端没有 canvas。
    // 两个动作：
    //   ① 把图的底色平移到目标 bg-base（原来图底 #16101C 铺在 #0b0518 上，整页偏色 5~10 级）；
    //   ② 极性翻转——线稿比底色暗时，lighten 合成（只留比底色亮的像素）会把线条整片吃掉，
    //      表现为「浅色模式看不见底纹」，而且没有任何报错。
    // 只改内存像素、不碰原图；任何一步失败都回原值（fail-open：归一化是增强，不该让底纹消失）。

    // 底色采样：底纹是满幅图，底色一定出现在四条边上；用 16 级分桶取众数，
    // 而不是均值——线稿的线会把均值从底色上拉偏。
    function zrTexBaseRgb(data, w, h) {
      if (!data || !w || !h || data.length < w * h * 4) return null;
      const band = Math.max(1, Math.min(6, Math.round(Math.min(w, h) * 0.03)));
      const buckets = new Map();
      const add = function (x, y) {
        const i = (y * w + x) * 4;
        if (data[i + 3] < 16) return;
        const key = (data[i] >> 4) + ',' + (data[i + 1] >> 4) + ',' + (data[i + 2] >> 4);
        const cur = buckets.get(key);
        if (cur) { cur.n++; cur.r += data[i]; cur.g += data[i + 1]; cur.b += data[i + 2]; }
        else buckets.set(key, { n: 1, r: data[i], g: data[i + 1], b: data[i + 2] });
      };
      for (let y = 0; y < h; y++) {
        const edgeY = y < band || y >= h - band;
        for (let x = 0; x < w; x++) {
          if (edgeY || x < band || x >= w - band) add(x, y);
        }
      }
      let best = null;
      buckets.forEach(function (b) { if (!best || b.n > best.n) best = b; });
      if (!best) return null;
      return [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)];
    }

    // 平移 + 极性 + 余量压缩。返回统计，供 scripts/test-texture-normalize.mjs 断言。
    function zrTexNormalizePixels(data, w, h, targetHex) {
      const tgt = parseHexColor(targetHex);
      if (!tgt || !data || !w || !h || data.length < w * h * 4) return { ok: false, reason: 'bad-input' };
      const base = zrTexBaseRgb(data, w, h);
      if (!base) return { ok: false, reason: 'no-base' };
      const delta = [tgt[0] - base[0], tgt[1] - base[1], tgt[2] - base[2]];
      const lum = function (r, g, b) { return 0.299 * r + 0.587 * g + 0.114 * b; };
      const clamp = function (v) { return v < 0 ? 0 : (v > 255 ? 255 : v); };
      const tgtLum = lum(tgt[0], tgt[1], tgt[2]);
      const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 12000)));
      // 第一遍（抽样）：平移之后，线条相对目标是偏亮还是偏暗
      let inkN = 0, inkSum = 0;
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          const i = (y * w + x) * 4;
          if (data[i + 3] < 16) continue;
          const off = lum(clamp(data[i] + delta[0]), clamp(data[i + 1] + delta[1]), clamp(data[i + 2] + delta[2])) - tgtLum;
          if (off > 6 || off < -6) { inkN++; inkSum += off; }
        }
      }
      // 线条比底色暗 → 翻转。lighten 只留比底色亮的像素，不翻就等于没有底纹。
      const flipped = inkN > 0 && (inkSum / inkN) < 0;
      // 第二遍（抽样）：墨差分布。合成走 lighten，线条最终只会朝 255 那一侧走，
      // 而浅底（目标亮度 245）只剩 10 级余量：不压缩，翻转后的暗线会被 255 截成一片平白。
      // 取 p98 而不是最大值——水印、边角反光这类离群像素不该把整张底纹压到看不见。
      const offs = [];
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          const i = (y * w + x) * 4;
          if (data[i + 3] < 16) continue;
          const off = Math.abs(lum(clamp(data[i] + delta[0]), clamp(data[i + 1] + delta[1]), clamp(data[i + 2] + delta[2])) - tgtLum);
          if (off > 6) offs.push(off);
        }
      }
      let p98 = 0;
      if (offs.length) {
        offs.sort(function (a, b) { return a - b; });
        p98 = offs[Math.floor(0.98 * (offs.length - 1))] || 0;
      }
      const lumMargin = Math.max(4, 255 - tgtLum);
      let k = p98 > 0 ? Math.min(1, (lumMargin * 0.92) / p98) : 1;
      // 下限 0.02：只有亮度余量被压到近乎为零（目标色已贴 255）才会触到，
      // 那时底纹本来就只能极淡，压成更淡没有意义。
      if (!(k > 0.02)) k = 0.02;
      const sign = flipped ? -1 : 1;
      let changed = false, inkMax = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = Math.round(clamp(tgt[0] + sign * k * (clamp(data[i] + delta[0]) - tgt[0])));
        const g = Math.round(clamp(tgt[1] + sign * k * (clamp(data[i + 1] + delta[1]) - tgt[1])));
        const b = Math.round(clamp(tgt[2] + sign * k * (clamp(data[i + 2] + delta[2]) - tgt[2])));
        if (r !== data[i] || g !== data[i + 1] || b !== data[i + 2]) changed = true;
        if (data[i + 3] >= 16) {
          const d = Math.abs(lum(r, g, b) - tgtLum);
          if (d > inkMax) inkMax = d;
        }
        data[i] = r; data[i + 1] = g; data[i + 2] = b;
      }
      return {
        ok: true,
        base: zrTexHex(base),
        target: String(targetHex).toLowerCase(),
        delta: delta,
        flipped: flipped,
        k: Math.round(k * 1000) / 1000,
        inkDelta: Math.round(inkMax * 10) / 10,
        changed: changed,
      };
    }

    // 把归一化套到一张 data URL 上；失败一律回原 URL。
    function zrTexNormalizeUrl(url, targetHex) {
      return new Promise(function (resolve) {
        if (!url || typeof url !== 'string') { resolve(''); return; }
        if (!targetHex) { resolve(url); return; }
        try {
          if (typeof document === 'undefined' || typeof Image === 'undefined') { resolve(url); return; }
          const img = new Image();
          img.onerror = function () { resolve(url); };
          img.onload = function () {
            try {
              const scale = Math.min(1, ZR_TEX_NORM_EDGE / Math.max(img.width, img.height));
              const w = Math.max(1, Math.round(img.width * scale));
              const h = Math.max(1, Math.round(img.height * scale));
              const cv = document.createElement('canvas');
              cv.width = w; cv.height = h;
              const ctx = cv.getContext('2d');
              if (!ctx) { resolve(url); return; }
              ctx.drawImage(img, 0, 0, w, h);
              const id = ctx.getImageData(0, 0, w, h);
              const rep = zrTexNormalizePixels(id.data, w, h, targetHex);
              if (!rep.ok || !rep.changed) { resolve(url); return; }
              ctx.putImageData(id, 0, 0);
              // 必须 PNG：底纹可能是透明线稿，转 JPEG 会把 alpha 压成黑底。
              resolve(cv.toDataURL('image/png') || url);
            } catch (e) { resolve(url); }
          };
          img.src = url;
        } catch (e) { resolve(url); }
      });
    }

    // 目标底色：spec 自己给的锚点优先，否则退回它要克隆的 base 主题。
    function zrTexTargetBg(spec, scheme, baseId) {
      const a = (spec && spec[scheme]) || {};
      const v = a['--dsw-alias-bg-base'];
      if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
      try {
        const toks = tokensFor(baseId, scheme);
        const b = toks && toks['--dsw-alias-bg-base'];
        if (typeof b === 'string' && /^#[0-9a-fA-F]{6}$/.test(b)) return b.toLowerCase();
      } catch (e) { /* ignore */ }
      return '';
    }
    // #endregion texture-normalize

