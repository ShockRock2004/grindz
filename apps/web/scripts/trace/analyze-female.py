"""Step 1-3 of the trace, female variant.

`reference-female.png` (built by cropping the side view out of the user's supplied
photo and converting its white background to alpha, see reference-female.png's
history) is a soft-shaded raster, not `reference.png`'s flat vector render — its
separator strokes and its interior shading occupy overlapping luminance bands, so
the male pipeline's `lum > 90` split does not apply (there is no clean valley in the
luminance histogram at any threshold; that band is the render's own airbrushed
gradient, not just JPEG noise, so per-pixel value alone cannot separate line from
shading. See scripts/trace/README.md for the flat-vector case this generalises from).

What does separate cleanly is gradient magnitude: on a lightly blurred luminance
field (sigma 1.2, to erase JPEG block noise while keeping every drawn stroke, which
survives the blur because it is still several px wide), the artwork's own ink
strokes sit far above the interior shading gradients (which change slowly over
tens/hundreds of px, so their gradient is small even unblurred). Thresholding that
magnitude at 60 and closing 1px gaps reproduces the illustrator's own line art
almost exactly -- verified by eye against reference-female.png.
"""
import numpy as np
from PIL import Image
from scipy import ndimage

import os
_HERE = os.path.dirname(os.path.abspath(__file__))
T = os.path.join(_HERE, 'build-female') + os.sep
os.makedirs(T, exist_ok=True)
REF = os.path.join(_HERE, 'reference-female.png')

BLUR_SIGMA = 1.2
EDGE_THRESH = 60

im = Image.open(REF).convert('RGBA')
a = np.array(im).astype(float)
R, G, B, A = a[:, :, 0], a[:, :, 1], a[:, :, 2], a[:, :, 3]
lum = 0.299 * R + 0.587 * G + 0.114 * B
ink = A > 128

blurred = ndimage.gaussian_filter(lum, sigma=BLUR_SIGMA)
gx = ndimage.sobel(blurred, axis=1)
gy = ndimage.sobel(blurred, axis=0)
mag = np.hypot(gx, gy)
mag[~ink] = 0
edge = ink & (mag > EDGE_THRESH)
edge = ndimage.binary_closing(edge, structure=np.ones((3, 3)), iterations=1)
island = ink & ~edge   # every enclosed region: muscle bellies AND head/hands/feet

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

# --- step 2: islands per figure (muscle bellies + head/hand/foot, all enclosed
#     regions produced by the line art -- no separate watershed pass needed since
#     the strokes already close every region, unlike the male source's solid ink) --
MIN = 60
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
    for i in keep:
        cy, cx = ndimage.center_of_mass(im_mask, l2, i)
        print(f'    comp {i}: {int(sz[i-1])}px centroid ({cx:.0f},{cy:.0f})')

np.save(T + 'ink.npy', ink)
np.save(T + 'island.npy', island)
