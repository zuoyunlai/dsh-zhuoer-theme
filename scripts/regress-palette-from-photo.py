# -*- coding: utf-8 -*-
"""Region-aware colour extraction from the reference photo.

The plugin's own median-cut collapses this photo (83% of pixels merge into one
muted sage), so we split the frame into sky / clouds / foliage / deep shadow
and read each region's real colour, then build flat-minimal anchors with the
plugin's own contrast rules (ensureVisible 2.2/3.0, ensureOnWhite 2.5).
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


def shade(hx, dl):
    h = hex_hsl(hx)
    if not h:
        return hx
    return hsl_hex(h[0], h[1], max(0.02, min(0.98, h[2] + dl)))


def ensure_visible(hx, bg, min_ratio):
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


im = Image.open(REF).convert("RGB")
a = np.asarray(im).astype(np.float64)
h, w, _ = a.shape
r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
rows = np.repeat(np.arange(h)[:, None], w, axis=1)
sky_zone = rows < int(h * 0.40)
forest_zone = rows > int(h * 0.45)
mx = np.maximum(np.maximum(r, g), b)
mn = np.minimum(np.minimum(r, g), b)


def mean_of(mask):
    if not mask.any():
        return None
    return to_hex(a[mask].mean(axis=0))


def pct_of(mask, ch, q):
    if not mask.any():
        return None
    return to_hex([np.percentile(a[mask][:, i], q) for i in range(3)])


sky_mask = sky_zone & (b > r + 8) & (b > 110)
cloud_mask = sky_zone & (mn > 195) & ((mx - mn) < 34)
foliage = forest_zone & (g > r + 12) & (g > b + 20) & (g > 60)
deep = forest_zone & (g > 30) & (g < 105) & (g > r + 5)

extracted = {
    "sky_blue": mean_of(sky_mask),
    "cloud_white": mean_of(cloud_mask),
    "foliage_mid": mean_of(foliage),
    "foliage_bright": pct_of(foliage, 1, 90),
    "foliage_deep": pct_of(foliage, 1, 12),
    "shadow_green": mean_of(deep),
}
if not extracted["foliage_mid"]:
    extracted["foliage_mid"] = "#4e7a3a"

# --- light scheme: pale tint of the dominant foliage hue ---
fh = hex_hsl(extracted["foliage_mid"])
light_bg = hsl_hex(fh[0], min(0.30, max(0.08, fh[1] * 0.55)), 0.95)
light_text = shade(extracted["foliage_deep"], -0.02)
light_border = shade(light_bg, -0.16)
light_brand = ensure_on_white(extracted["foliage_mid"], 2.5)
sky = extracted["sky_blue"] or "#6f9fd0"
light_accent = ensure_visible(sky, light_bg, 2.2)
light_danger = ensure_visible("#d92b2b", light_bg, 3.0)
light_warn = ensure_visible("#b45309", light_bg, 3.0)

# --- dark scheme: deep forest hue, brighter brand ---
dark_bg = hsl_hex(fh[0], min(0.45, max(0.12, fh[1])), 0.11)
dark_text = "#eef3ee"
dark_border = shade(dark_bg, 0.16)
dark_brand = ensure_on_white(extracted["foliage_mid"], 2.5)
dark_accent = ensure_visible(sky, dark_bg, 2.2)
dark_danger = ensure_visible("#d92b2b", dark_bg, 3.0)
dark_warn = ensure_visible("#b45309", dark_bg, 3.0)

light = {
    "--dsw-alias-bg-base": light_bg,
    "--dsw-alias-label-primary": light_text,
    "--dsw-alias-border-l1": light_border,
    "--dsw-alias-brand-primary": light_brand,
    "--dsw-alias-trajectory-accent": light_accent,
    "--dsw-alias-state-error-primary": light_danger,
    "--dsw-alias-state-warn-primary": light_warn,
}
dark = {
    "--dsw-alias-bg-base": dark_bg,
    "--dsw-alias-label-primary": dark_text,
    "--dsw-alias-border-l1": dark_border,
    "--dsw-alias-brand-primary": dark_brand,
    "--dsw-alias-trajectory-accent": dark_accent,
    "--dsw-alias-state-error-primary": dark_danger,
    "--dsw-alias-state-warn-primary": dark_warn,
}

print(json.dumps({
    "extracted": extracted,
    "light": light,
    "dark": dark,
    "ratios": {
        "light_text_on_bg": round(ratio(light_text, light_bg), 2),
        "light_brand_on_bg": round(ratio(light_brand, light_bg), 2),
        "light_brand_vs_white": round(ratio(light_brand, "#ffffff"), 2),
        "light_accent_on_bg": round(ratio(light_accent, light_bg), 2),
        "dark_text_on_bg": round(ratio(dark_text, dark_bg), 2),
        "dark_brand_on_bg": round(ratio(dark_brand, dark_bg), 2),
        "dark_brand_vs_white": round(ratio(dark_brand, "#ffffff"), 2),
        "dark_accent_on_bg": round(ratio(dark_accent, dark_bg), 2),
    },
}, ensure_ascii=False, indent=2))
