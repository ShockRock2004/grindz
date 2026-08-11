"""Split head / hands / feet out of the fused light layer -- female variant.

Structurally the same problem sil.py solves for the male source (extremities are
fused with the separator network in one colour, need a watershed to split), but this
source's hair is drawn in the MUSCLE tone (dark), sitting directly against the face
(base tone), which breaks sil.py's seeding: it looks for base-layer pixels far from
any island, and the face is never far from island-toned hair, so it never seeds. Hair
itself needs no such treatment -- being island-toned, it already comes out as an
ordinary traced island in masks-female.py, just labelled 'Hair' downstream.

The fix: exclude the hair blob(s) from the island mask used ONLY for extremity
seeding (not from the real island mask masks-female.py traces from). With hair out of
the way, the face is exactly as far from the nearest real muscle island as the male
source's head is from its nearest island, and sil.py's own method applies unchanged.
"""
import json
import numpy as np
from PIL import Image
from scipy import ndimage

import os
_HERE = os.path.dirname(os.path.abspath(__file__))
T = os.path.join(_HERE, 'build-female') + os.sep
os.makedirs(T, exist_ok=True)
ink = np.load(T + 'ink.npy')
island = np.load(T + 'island.npy')

lab_ink, nn = ndimage.label(ink)
s_ink = ndimage.sum(ink, lab_ink, range(1, nn + 1))
two = sorted((np.argsort(-s_ink)[:2] + 1), key=lambda i: ndimage.center_of_mass(ink, lab_ink, i)[1])

# island mask with the hair blob(s) removed, for seeding only
island_no_hair = island.copy()
hair_ids = {}
for view, comp in zip(['front', 'back'], two):
    fm = lab_ink == comp
    y0, y1 = np.where(fm)[0].min(), np.where(fm)[0].max()
    fh = y1 - y0
    l2, n2 = ndimage.label(island & fm)
    sz = ndimage.sum(island & fm, l2, range(1, n2 + 1))
    candidates = []
    for j in range(1, n2 + 1):
        ys, xs = np.where(l2 == j)
        cy_frac = (ys.mean() - y0) / fh
        if cy_frac < 0.15:
            candidates.append((j, int(sz[j - 1])))
    hair_j = max(candidates, key=lambda c: c[1])[0]
    island_no_hair[(l2 == hair_j) & fm] = False
    hair_ids[view] = hair_j
    print(f'{view}: hair blob {hair_j} ({int(sz[hair_j-1])}px) excluded from extremity seeding')

dark = ink & ~island_no_hair

d2i = ndimage.distance_transform_edt(~island_no_hair)
seed = dark & (d2i > 12)
lab, n = ndimage.label(seed)
sz = ndimage.sum(seed, lab, range(1, n + 1))
keep = [i + 1 for i in range(n) if sz[i] >= 2000]
print('extremity seeds kept:', len(keep), sorted([int(sz[i - 1]) for i in keep], reverse=True))

d = d2i.copy()
d[~dark] = 0
cost = (255 - np.clip(d / max(d.max(), 1) * 255, 0, 255)).astype(np.uint8)

markers = np.zeros(dark.shape, np.int16)
for k, i in enumerate(keep, 1):
    markers[lab == i] = k
BG = len(keep) + 1
markers[~dark] = BG
markers[dark & (d2i <= 6)] = BG

ws = ndimage.watershed_ift(cost, markers)
sil = np.zeros(dark.shape, np.int32)
for k in range(1, len(keep) + 1):
    sil[(ws == k) & dark] = k

out = {}
for view, comp in zip(['front', 'back'], two):
    fm = lab_ink == comp
    x0, y0, x1, y1 = int(np.where(fm)[1].min()), int(np.where(fm)[0].min()), int(np.where(fm)[1].max()) + 1, int(np.where(fm)[0].max()) + 1
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
json.dump(hair_ids, open(T + 'hair_ids.json', 'w'), indent=1)
