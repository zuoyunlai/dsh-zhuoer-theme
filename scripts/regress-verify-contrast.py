# -*- coding: utf-8 -*-
import json

def rl(hx):
    c = [int(hx[1:3], 16), int(hx[3:5], 16), int(hx[5:7], 16)]
    def f(v):
        n = v / 255.0
        return n / 12.92 if n <= 0.03928 else ((n + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])

def ratio(a, b):
    la, lb = rl(a), rl(b)
    hi, lo = max(la, lb), min(la, lb)
    return round((hi + 0.05) / (lo + 0.05), 2)

LIGHT = {
    "bg": "#f2f6ee", "text": "#223e0c", "border": "#c9dab9", "brand": "#44671e",
    "accent": "#87a1bf", "error": "#d92b2b", "warn": "#b45309", "success": "#678b31",
}
DARK = {
    "bg": "#1d290f", "text": "#eef3ee", "border": "#476525", "brand": "#678b31",
    "accent": "#a8bbd1", "error": "#d92b2b", "warn": "#b45309", "success": "#a3d17a",
}

out = {}
for name, s in (("light", LIGHT), ("dark", DARK)):
    out[name] = {
        "text_on_bg": ratio(s["text"], s["bg"]),
        "brand_on_bg": ratio(s["brand"], s["bg"]),
        "brand_vs_white_text": ratio(s["brand"], "#ffffff"),
        "accent_on_bg": ratio(s["accent"], s["bg"]),
        "success_on_bg": ratio(s["success"], s["bg"]),
        "error_on_bg": ratio(s["error"], s["bg"]),
        "warn_on_bg": ratio(s["warn"], s["bg"]),
        "border_on_bg": ratio(s["border"], s["bg"]),
    }
print(json.dumps(out, ensure_ascii=False))
