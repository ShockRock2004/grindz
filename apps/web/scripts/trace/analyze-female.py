"""Step 1-3 of the trace, female variant.

`reference-female.png` is a flat vector illustration (unlike the male reference's own
flat vector, its muscle fill is the DARKER of its two greys, with the lighter grey
carrying the separator lines, base silhouette and extremities -- the male source has
the opposite convention. Structurally this is otherwise the same kind of source as
reference.png (a closed separator network with 2 flat fill tones, not the earlier
soft-shaded JPEG this file used to trace -- see git history / the trace README for that
version's very different approach), so this reuses analyze.py's method almost exactly,
just with the island test inverted: `lum < ISLAND_LUM` instead of `lum > ISLAND_LUM`.
"""
import numpy as np
from PIL import Image
from scipy import ndimage

import os
_HERE = os.path.dirname(os.path.abspath(__file__))
T = os.path.join(_HERE, 'build-female') + os.sep
os.makedirs(T, exist_ok=True)
REF = os.path.join(_HERE, 'reference-female.png')
ISLAND_LUM = 130

im = Image.open(REF).convert('RGBA')
a = np.array(im).astype(int)
R, G, B, A = a[:, :, 0], a[:, :, 1], a[:, :, 2], a[:, :, 3]
lum = 0.299 * R + 0.587 * G + 0.114 * B

ink = A > 128
island = ink & (lum < ISLAND_LUM)   # the darker grey is muscle fill in THIS source

print('image', im.size, 'opaque px', int(ink.sum()))

# --- step 1: split the two figures -----------------------------------------
lab, n = ndimage.label(ink)
sizes = ndimage.sum(ink, lab, range(1, n + 1))
big = np.argsort(-sizes)[:2] + 1
figs = sorted(big, key=lambda i: ndimage.center_of_mass(ink, lab, i)[1])  # by x
names = ['front', 'back']
fig_masks = {}
for nm, i in zip(names, figs):
    m = lab == i
    ys, xs = np.where(m)
    bbox = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    fig_masks[nm] = (m, bbox)
    print(f'{nm}: bbox {bbox}  w={bbox[2]-bbox[0]} h={bbox[3]-bbox[1]} aspect {(bbox[2]-bbox[0])/(bbox[3]-bbox[1]):.4f}  px={int(m.sum())}')

# --- step 2: islands per figure --------------------------------------------
MIN = 40
report = {}
for nm, (fm, bbox) in fig_masks.items():
    im_mask = island & fm
    l2, n2 = ndimage.label(im_mask)
    sz = ndimage.sum(im_mask, l2, range(1, n2 + 1))
    keep = [i + 1 for i in range(n2) if sz[i] >= MIN]
    drop = [(i + 1, int(sz[i])) for i in range(n2) if sz[i] < MIN]
    print(f'\n{nm}: {n2} raw island components, {len(keep)} >= {MIN}px, {len(drop)} dropped')
    report[nm] = (l2, keep, sz)
    ks = sorted([int(sz[i - 1]) for i in keep])
    if ks:
        print('    kept sizes: min %d  median %d  max %d' % (ks[0], ks[len(ks)//2], ks[-1]))

np.save(T + 'ink.npy', ink)
np.save(T + 'island.npy', island)
