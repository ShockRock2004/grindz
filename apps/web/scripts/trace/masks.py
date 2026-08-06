"""Write every region we intend to trace as a 1-bit PNG for potrace."""
import json
import numpy as np
from PIL import Image
from scipy import ndimage

import os
_HERE = os.path.dirname(os.path.abspath(__file__))
T = os.path.join(_HERE, 'build') + os.sep
os.makedirs(T, exist_ok=True)
REF = os.path.join(_HERE, 'reference.png')

im = Image.open(REF).convert('RGBA')
a = np.array(im).astype(int)
R, G, B, A = a[:, :, 0], a[:, :, 1], a[:, :, 2], a[:, :, 3]
lum = 0.299 * R + 0.587 * G + 0.114 * B
ink = A > 128
island = ink & (lum > 90)
H, W = ink.shape

lab, n = ndimage.label(ink)
sizes = ndimage.sum(ink, lab, range(1, n + 1))
two = (np.argsort(-sizes)[:2] + 1)
two = sorted(two, key=lambda i: ndimage.center_of_mass(ink, lab, i)[1])

meta = {'figures': {}, 'regions': []}
MIN = 40

def dump(mask, name):
    img = Image.fromarray(np.where(mask, 0, 255).astype('uint8'), 'L')
    img.save(T + 'masks/' + name + '.png')

import os
os.makedirs(T + 'masks', exist_ok=True)

for nm, i in zip(['front', 'back'], two):
    fm = lab == i
    ys, xs = np.where(fm)
    bbox = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
    meta['figures'][nm] = {'bbox': bbox, 'px': int(fm.sum())}
    # the whole figure -> the dark base silhouette
    dump(fm, f'{nm}__body')
    meta['regions'].append({'view': nm, 'key': 'body', 'kind': 'silhouette', 'px': int(fm.sum()),
                            'centroid': [float(xs.mean()), float(ys.mean())]})
    # muscle islands
    imask = island & fm
    l2, n2 = ndimage.label(imask)
    sz = ndimage.sum(imask, l2, range(1, n2 + 1))
    kept = 0
    for j in range(1, n2 + 1):
        if sz[j - 1] < MIN:
            continue
        m = l2 == j
        yy, xx = np.where(m)
        dump(m, f'{nm}__isl{j:03d}')
        meta['regions'].append({
            'view': nm, 'key': f'isl{j:03d}', 'kind': 'muscle', 'px': int(sz[j - 1]),
            'centroid': [float(xx.mean()), float(yy.mean())],
            'bbox': [int(xx.min()), int(yy.min()), int(xx.max()) + 1, int(yy.max()) + 1],
        })
        kept += 1
    print(nm, 'islands written:', kept)

json.dump(meta, open(T + 'meta.json', 'w'), indent=1)
print('figures:', {k: v['bbox'] for k, v in meta['figures'].items()})
print('total regions:', len(meta['regions']))
