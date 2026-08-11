"""Split head / hands / feet out of the connected dark ink by watershed.

The dark ink of each figure is ONE connected component (rim + separator network +
head + hands + feet), so morphological reconstruction cannot isolate the extremities.
Seeding on distance-from-island and flooding to the thin separator lines does.
"""
import json
import numpy as np
from PIL import Image
from scipy import ndimage

import os
_HERE = os.path.dirname(os.path.abspath(__file__))
T = os.path.join(_HERE, os.environ.get('TRACE_BUILD', 'build')) + os.sep
os.makedirs(T, exist_ok=True)
ink = np.load(T + 'ink.npy')
island = np.load(T + 'island.npy')
dark = ink & ~island

d2i = ndimage.distance_transform_edt(~island)
seed = dark & (d2i > 12)
lab, n = ndimage.label(seed)
sz = ndimage.sum(seed, lab, range(1, n + 1))
# 10 real extremities (2 heads, 4 hands, 4 feet); the rest are thick spots in the
# separator network (crotch, spine channel) and are an order of magnitude smaller.
keep = [i + 1 for i in range(n) if sz[i] >= 2000]
print('extremity seeds kept:', len(keep), sorted([int(sz[i - 1]) for i in keep], reverse=True))

# cost surface: cheap inside blobs, expensive on thin separator ink
d = d2i.copy()
d[~dark] = 0
cost = (255 - np.clip(d / max(d.max(), 1) * 255, 0, 255)).astype(np.uint8)

markers = np.zeros(dark.shape, np.int16)
for k, i in enumerate(keep, 1):
    markers[lab == i] = k
BG = len(keep) + 1
markers[~dark] = BG                      # outside the ink
# Barrier on the separator network. 3 is too low: the spine channel is a little wider
# than that and the back head leaks down it. The result is stable across 5..10, so 6
# sits mid-plateau rather than on a cliff.
markers[dark & (d2i <= 6)] = BG

ws = ndimage.watershed_ift(cost, markers)
sil = np.zeros(dark.shape, np.int32)
for k in range(1, len(keep) + 1):
    sil[(ws == k) & dark] = k

# classify each region by centroid: head (top), hands (mid, outermost), feet (bottom)
lab_ink, nn = ndimage.label(ink)
s_ink = ndimage.sum(ink, lab_ink, range(1, nn + 1))
two = sorted((np.argsort(-s_ink)[:2] + 1), key=lambda i: ndimage.center_of_mass(ink, lab_ink, i)[1])
meta = json.load(open(T + 'meta.json'))

out = {}
for view, comp in zip(['front', 'back'], two):
    fm = lab_ink == comp
    x0, y0, x1, y1 = meta['figures'][view]['bbox']
    parts = []
    for k in range(1, len(keep) + 1):
        m = (sil == k) & fm
        if m.sum() < 500:
            continue
        ys, xs = np.where(m)
        parts.append({'k': k, 'area': int(m.sum()), 'cx': float(xs.mean()), 'cy': float(ys.mean())})
    parts.sort(key=lambda p: p['cy'])
    names = []
    for p in parts:
        ry = (p['cy'] - y0) / (y1 - y0)
        if ry < 0.25:
            names.append('head')
        elif ry > 0.75:
            names.append('foot')
        else:
            names.append('hand')
    # left/right suffix by x, anatomical (front view mirrors)
    for p, nm in zip(parts, names):
        if nm == 'head':
            p['name'] = 'head'
        else:
            imgleft = p['cx'] < (x0 + x1) / 2
            side = ('right' if imgleft else 'left') if view == 'front' else ('left' if imgleft else 'right')
            p['name'] = f'{nm}_{side}'
    out[view] = parts
    print(f'{view}: ' + ', '.join(f"{p['name']}({p['area']})" for p in parts))

np.save(T + 'sil.npy', sil)
json.dump(out, open(T + 'sil.json', 'w'), indent=1)
