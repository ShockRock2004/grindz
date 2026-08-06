"""Add the head/hands/feet silhouette regions to the trace manifest."""
import json
import numpy as np
from PIL import Image
from scipy import ndimage

import os
_HERE = os.path.dirname(os.path.abspath(__file__))
T = os.path.join(_HERE, 'build') + os.sep
os.makedirs(T, exist_ok=True)
sil = np.load(T + 'sil.npy')
ink = np.load(T + 'ink.npy')
meta = json.load(open(T + 'meta.json'))
parts = json.load(open(T + 'sil.json'))

lab, n = ndimage.label(ink)
s = ndimage.sum(ink, lab, range(1, n + 1))
two = sorted((np.argsort(-s)[:2] + 1), key=lambda i: ndimage.center_of_mass(ink, lab, i)[1])

# drop any silhouette rows a previous run added, keep body + islands
meta['regions'] = [r for r in meta['regions'] if r['key'] == 'body' or r['key'].startswith('isl')]

for view, comp in zip(['front', 'back'], two):
    fm = lab == comp
    for p in parts[view]:
        m = (sil == p['k']) & fm
        Image.fromarray(np.where(m, 0, 255).astype('uint8'), 'L').save(T + f"masks/{view}__{p['name']}.png")
        ys, xs = np.where(m)
        meta['regions'].append({'view': view, 'key': p['name'], 'kind': 'silhouette',
                                'px': int(m.sum()), 'centroid': [float(xs.mean()), float(ys.mean())]})
        print(view, p['name'], int(m.sum()))

json.dump(meta, open(T + 'meta.json', 'w'), indent=1)
print('regions now:', len(meta['regions']))
