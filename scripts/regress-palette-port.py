# -*- coding: utf-8 -*-
"""Faithful port of dsh-zhuoer-theme client.js palette pipeline:
   imageToImageData(640) -> extractPalette(6) -> paletteToAnchors(light|dark)
   Mirrors medianCut / hexHsl / hslHex / shadeColor / ensureVisible / ensureOnWhite.
"""
import json
import math
import numpy as np
from PIL import Image

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _palette_sample_path import sample_ref

REF = sample_ref()


def js_round(v):
    return math.floor(v + 0.5)


def to_hex(rgb):
    return "#" + "".join(format(max(0, min(255, js_round(v))), "02x") for v in rgb)


def parse_hex(c):
    c = str(c or "").strip()
    if len(c) != 7 or c[0] != "#":
        return None
    try:
        return [int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16)]
    except ValueError:
        return None


def hex_hsl(hx):
    c = parse_hex(hx)
    if not c:
        return None
    v = [x / 255.0 for x in c]
    mx, mn = max(v), min(v)
    l = (mx + mn) / 2
    if mx == mn:
        return (0.0, 0.0, l)
    d = mx - mn
    s = d / (2 - mx - mn) if l > 0.5 else d / (mx + mn)
    if mx == v[0]:
        h = (v[1] - v[2]) / d + (6 if v[1] < v[2] else 0)
    elif mx == v[1]:
        h = (v[2] - v[0]) / d + 2
    else:
        h = (v[0] - v[1]) / d + 4
    return ((h * 60) % 360, s, l)


def hsl_hex(h, s, l):
    def k(n):
        m = (n + h / 30) % 12
        a = s * min(l, 1 - l)
        vv = l - a * max(-1, min(m - 3, min(9 - m, 1)))
        return format(max(0, min(255, js_round(vv * 255))), "02x")
    return "#" + k(0) + k(8) + k(4)


def lum01(hx):
    c = parse_hex(hx) or [0, 0, 0]
    return (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) / 255


def rel_lum(hx):
    c = parse_hex(hx) or [0, 0, 0]
    def f(v):
        n = v / 255.0
        return n / 12.92 if n <= 0.03928 else ((n + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])


def ratio(a, b):
    la, lb = rel_lum(a), rel_lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def sat(hx):
    h = hex_hsl(hx)
    return h[1] if h else 0


def shade(hx, dl):
    h = hex_hsl(hx)
    if not h:
        return hx
    return hsl_hex(h[0], h[1], max(0.02, min(0.98, h[2] + dl)))


def median_cut(pixels, count):
    boxes = [list(pixels)]
    while len(boxes) < count:
        best_idx, best_range, best_ch = -1, -1, "r"
        for i, box in enumerate(boxes):
            if len(box) < 2:
                continue
            for ch in ("r", "g", "b"):
                vals = [p[ch] for p in box]
                rng = max(vals) - min(vals)
                if rng > best_range:
                    best_range, best_idx, best_ch = rng, i, ch
        if best_idx < 0 or best_range <= 0:
            break
        box = sorted(boxes[best_idx], key=lambda p: p[best_ch])
        total_n = sum(p["n"] for p in box)
        gap_idx, gap_max = -1, 0
        for i in range(1, len(box)):
            gap = box[i][best_ch] - box[i - 1][best_ch]
            if gap > gap_max:
                gap_max, gap_idx = gap, i
        mid = -1
        if gap_max >= 8 and 0 < gap_idx < len(box):
            mid = gap_idx
        else:
            acc = 0
            for i in range(len(box)):
                acc += box[i]["n"]
                if acc * 2 >= total_n:
                    mid = i + 1
                    break
        if mid <= 0 or mid >= len(box):
            break
        boxes[best_idx:best_idx + 1] = [box[:mid], box[mid:]]
    total = sum(p["n"] for p in pixels) or 1
    out = []
    for box in boxes:
        if not box:
            continue
        r = sum(p["r"] * p["n"] for p in box)
        g = sum(p["g"] * p["n"] for p in box)
        b = sum(p["b"] * p["n"] for p in box)
        n = sum(p["n"] for p in box)
        out.append({"hex": to_hex([r / n, g / n, b / n]), "share": round(n / total, 4)})
    out.sort(key=lambda x: -x["share"])
    return out


def extract_palette(img, count=6):
    w, h = img.size
    data = np.asarray(img.convert("RGBA"))
    px = w * h
    step = max(1, int(math.floor(math.sqrt(px / 12000))))
    buckets = {}
    for y in range(0, h, step):
        for x in range(0, w, step):
            if int(data[y, x, 3]) < 128:
                continue
            r = int(data[y, x, 0]) & 0xF8
            g = int(data[y, x, 1]) & 0xF8
            b = int(data[y, x, 2]) & 0xF8
            key = (r, g, b)
            if key in buckets:
                buckets[key]["n"] += 1
            else:
                buckets[key] = {"r": r, "g": g, "b": b, "n": 1}
    global LAST_BUCKETS, LAST_TOTAL
    LAST_TOTAL = sum(p["n"] for p in buckets.values())
    LAST_BUCKETS = sorted(buckets.values(), key=lambda p: -p["n"])[:10]
    if not buckets:
        return []
    return median_cut(list(buckets.values()), count)


def palette_to_anchors(palette, force_scheme):
    if not palette:
        return None
    light_photo = True if force_scheme == "light" else lum01(palette[0]["hex"]) >= 0.5
    by_lum = sorted(palette, key=lambda p: lum01(p["hex"]))
    darkest, lightest = by_lum[0]["hex"], by_lum[-1]["hex"]
    bg = lightest if light_photo else darkest
    if force_scheme == "dark":
        mh = hex_hsl(palette[0]["hex"])
        bg = hsl_hex(mh[0], min(0.45, max(0.10, mh[1])), 0.12) if mh else "#141414"
    elif light_photo:
        main_hsl = hex_hsl(palette[0]["hex"])
        if main_hsl:
            bg = hsl_hex(main_hsl[0], min(0.55, max(0.18, main_hsl[1])), 0.92)
        else:
            guard = 0
            while lum01(bg) < 0.93 and guard < 10:
                bg = shade(bg, 0.05)
                guard += 1
    text = darkest if light_photo else lightest
    if light_photo:
        if lum01(text) > 0.22 or text == "#000000":
            text = "#14161a"
    else:
        if lum01(text) < 0.72:
            text = "#f2f2f2"
    if ratio(text, bg) < 4.5:
        text = "#14161a" if lum01(bg) > 0.5 else "#f2f2f2"

    def ensure_visible(hx, min_ratio):
        out, guard = hx, 0
        d = -1 if lum01(bg) > 0.5 else 1
        while ratio(out, bg) < min_ratio and guard < 6:
            out = shade(out, d * 0.10)
            guard += 1
        return out

    def ensure_on_white(hx, min_ratio):
        out, guard = hx, 0
        while ratio(out, "#ffffff") < min_ratio and guard < 6:
            out = shade(out, -0.08)
            guard += 1
        return out

    by_sat = sorted(palette, key=lambda p: -sat(p["hex"]))
    brand = ensure_on_white(by_sat[0]["hex"], 2.5) if by_sat else text
    brand2 = ensure_visible(by_sat[1]["hex"], 2.2) if len(by_sat) > 1 else brand
    border = shade(bg, -0.16 if lum01(bg) > 0.5 else 0.16)
    return {
        "--dsw-alias-bg-base": bg,
        "--dsw-alias-label-primary": text,
        "--dsw-alias-border-l1": border,
        "--dsw-alias-brand-primary": brand,
        "--dsw-alias-trajectory-accent": brand2,
        "--dsw-alias-state-error-primary": ensure_visible("#d92b2b", 3.0),
        "--dsw-alias-state-warn-primary": ensure_visible("#b45309", 3.0),
    }


im = Image.open(REF)
orig = im.size
scale = min(1.0, 640 / max(orig))
w2, h2 = max(1, js_round(orig[0] * scale)), max(1, js_round(orig[1] * scale))
resized = (w2, h2) != orig
if resized:
    im = im.resize((w2, h2), Image.BILINEAR)

palette = extract_palette(im, 6)
light = palette_to_anchors(palette, "light")
dark = palette_to_anchors(palette, "dark")
print(json.dumps({
    "source_size": list(orig),
    "sampled_size": list(im.size),
    "resampled_by_browser": resized,
    "palette": palette,
    "top_quantized_buckets": [
        {"hex": to_hex([p["r"], p["g"], p["b"]]), "share": round(p["n"] / LAST_TOTAL, 4)}
        for p in LAST_BUCKETS
    ],
    "light": light,
    "dark": dark,
    "contrast_light_text_on_bg": round(ratio(light["--dsw-alias-label-primary"], light["--dsw-alias-bg-base"]), 2),
    "contrast_dark_text_on_bg": round(ratio(dark["--dsw-alias-label-primary"], dark["--dsw-alias-bg-base"]), 2),
    "brand_vs_white_light": round(ratio(light["--dsw-alias-brand-primary"], "#ffffff"), 2),
    "brand_vs_white_dark": round(ratio(dark["--dsw-alias-brand-primary"], "#ffffff"), 2),
}, ensure_ascii=False, indent=2))
