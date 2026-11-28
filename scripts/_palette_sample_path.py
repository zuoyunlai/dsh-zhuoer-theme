# -*- coding: utf-8 -*-
"""Resolve the sample photo path without hardcoding a personal absolute path.

Order: env override -> repo contracts/ fixture -> legacy workspace copy.
Kept in every script so a clone of this repo can run them as-is.
"""
import os

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)


def sample_ref():
    env = os.environ.get("ZR_PALETTE_SAMPLE")
    if env and os.path.isfile(env):
        return env
    in_repo = os.path.join(_ROOT, "contracts", "palette-sample-ref.webp")
    if os.path.isfile(in_repo):
        return in_repo
    legacy = os.path.join(
        os.path.dirname(_ROOT), "dsh-image-gen", "ref-forest.webp"
    )
    if os.path.isfile(legacy):
        return legacy
    raise SystemExit(
        "找不到参考图：请把样例放到 contracts/palette-sample-ref.webp，"
        "或用 ZR_PALETTE_SAMPLE 指定路径"
    )
