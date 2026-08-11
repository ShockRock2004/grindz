"""Write every region we intend to trace as a 1-bit PNG for potrace -- female variant.

Reuses the ink.npy/island.npy that analyze-female.py already computed (edge-detected
island mask, not the male pipeline's alpha/luminance split -- see that file's
docstring). Every enclosed region -- muscle belly or extremity -- is already its own
connected component here, so there is no separate silhouette/watershed pass the way
sil.py needs for the male source's solid-ink extremities.
"""
import json
import numpy as np
from PIL import Image
from scipy import ndimage

import os
_HERE = os.path.dirname(os.path.abspath(__file__))
T = os.path.join(_HERE, 'build-female') + os.sep
os.makedirs(T + 'masks', exist_ok=True)

ink = np.load(T + 'ink.npy')
island = np.load(T + 'island.npy')
MIN = 150

lab, n = ndimage.label(ink)
sizes = ndimage.sum(ink, lab, range(1, n + 1))
two = sorted((np.argsort(-sizes)[:2] + 1), key=lambda i: ndimage.center_of_mass(ink, lab, i)[1])

meta = {'figures': {}, 'regions': []}


def dump(mask, name):
    img = Image.fromarray(np.where(mask, 0, 255).astype('uint8'), 'L')
    img.save(T + 'masks/' + name + '.png')


for nm, i in zip(['front', 'back'], two):
    fm = lab == i
    ys, xs = np.where(fm)
    bbox = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
    meta['figures'][nm] = {'bbox': bbox, 'px': int(fm.sum())}
    dump(fm, f'{nm}__body')
    meta['regions'].append({'view': nm, 'key': 'body', 'kind': 'silhouette', 'px': int(fm.sum()),
                            'centroid': [float(xs.mean()), float(ys.mean())]})
    im_mask = island & fm
    l2, n2 = ndimage.label(im_mask)
    sz = ndimage.sum(im_mask, l2, range(1, n2 + 1))
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
