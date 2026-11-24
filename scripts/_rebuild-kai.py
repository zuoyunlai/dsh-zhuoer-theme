import sys, os, glob, tempfile, io
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.merge import Merger

def build_charset():
    s = set()
    for hi in range(0xB0, 0xD8):
        for lo in range(0xA1, 0xFF):
            try: s.add(bytes([hi, lo]).decode('gb2312'))
            except Exception: pass
    for cp in list(range(0x3000, 0x3040)) + list(range(0xFF01, 0xFF66)):
        s.add(chr(cp))
    for cp in [0x2018,0x2019,0x201C,0x201D,0x2014,0x2026,0x00B7,0x2103,0x00B0,0x00A5]:
        s.add(chr(cp))
    return s

src_dir, out = sys.argv[1], sys.argv[2]
charset = build_charset()
print('want chars:', len(charset), flush=True)
files = sorted(glob.glob(os.path.join(src_dir, '**', '*.woff2'), recursive=True))
print('chunk files:', len(files), flush=True)
selected, covered = [], set()
for f in files:
    try:
        font = TTFont(f, lazy=True)
        cmap = font.getBestCmap() or {}
        font.close()
    except Exception:
        continue
    inter = {chr(c) for c in cmap} & charset
    if inter:
        selected.append((f, inter)); covered |= inter
print('chunks with hits:', len(selected), '| chars covered:', len(covered), flush=True)
missing = charset - covered
print('missing chars:', len(missing), ''.join(sorted(missing))[:40], flush=True)
if not selected:
    print('NO_CHUNKS'); sys.exit(1)

tmpdir = tempfile.mkdtemp()
parts = []
for i, (f, inter) in enumerate(selected):
    dst = os.path.join(tmpdir, 'p%03d.ttf' % i)
    txt = os.path.join(tmpdir, 'c%03d.txt' % i)
    open(txt, 'w', encoding='utf-8').write(''.join(sorted(inter)))
    try:
        subset.main([f, '--text-file=' + txt, '--flavor=ttf' if False else '--output-file=' + dst,
                     '--layout-features=', '--no-hinting', '--desubroutinize', '--drop-tables+=DSIG'])
        if os.path.getsize(dst) > 0: parts.append(dst)
    except Exception as e:
        print('subset fail', os.path.basename(f), str(e)[:60], flush=True)
print('parts:', len(parts), flush=True)
merged = Merger().merge(parts)
mpath = os.path.join(tmpdir, 'merged.ttf')
merged.save(mpath)
print('merged bytes:', os.path.getsize(mpath), flush=True)
ctxt = os.path.join(tmpdir, 'all.txt')
open(ctxt, 'w', encoding='utf-8').write(''.join(sorted(charset)))
subset.main([mpath, '--text-file=' + ctxt, '--flavor=woff2', '--layout-features=*',
             '--desubroutinize', '--no-hinting', '--output-file=' + out])
print('FINAL bytes:', os.path.getsize(out), flush=True)
