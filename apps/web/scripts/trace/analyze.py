"""Step 1-3 of the trace: split figures, extract muscle islands and silhouettes."""
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

ink = A > 128                      # the figure, including dark separator ink
island = ink & (lum > 90)          # grey + both reds = muscle islands

print('image', im.size, 'opaque px', int(ink.sum()))

# --- palette census (verify REQ's numbers) ---------------------------------
op = ink
cols, counts = np.unique(np.stack([R[op], G[op], B[op]], 1), axis=0, return_counts=True)
order = np.argsort(-counts)
tot = counts.sum()
print('\ntop colours over opaque pixels:')
cum = 0
for i in order[:10]:
    c = cols[i]; n = counts[i]; cum += n
    print('  #%02X%02X%02X  %6.2f%%  (lum %.0f)' % (c[0], c[1], c[2], 100 * n / tot, 0.299*c[0]+0.587*c[1]+0.114*c[2]))
print('  top10 cumulative %.2f%%' % (100 * cum / tot))

# --- step 1: split the two figures -----------------------------------------
lab, n = ndimage.label(ink)
sizes = ndimage.sum(ink, lab, range(1, n + 1))
big = np.argsort(-sizes)[:4] + 1
print('\nlargest ink components:', [(int(i), int(sizes[i-1])) for i in big])
figs = sorted(big[:2], key=lambda i: ndimage.center_of_mass(ink, lab, i)[1])  # by x
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
    for j, s in drop:
        cy, cx = ndimage.center_of_mass(im_mask, l2, j)
        print(f'    dropped comp {j}: {s}px at ({cx:.0f},{cy:.0f})')
    report[nm] = (l2, keep, sz)
    # size histogram of kept
    ks = sorted([int(sz[i - 1]) for i in keep])
    print('    kept sizes: min %d  median %d  max %d' % (ks[0], ks[len(ks)//2], ks[-1]))

# counts at the >=60px threshold REQ quoted
for nm, (l2, keep, sz) in report.items():
    n60 = sum(1 for i in keep if sz[i - 1] >= 60)
    print(f'{nm}: {n60} islands >= 60px')

np.save(T + 'ink.npy', ink)
np.save(T + 'island.npy', island)
