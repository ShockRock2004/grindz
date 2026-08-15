"""Write every region we intend to trace as a 1-bit PNG for potrace -- female variant.

`body` is the whole figure's ink footprint (as in the male pipeline); `head` comes from
sil-female.py's watershed (hair excluded from seeding, see that file). Hands and feet
are NOT separately extracted here -- the watershed that finds them is unreliable on
this source (forearm/calf muscle detail sits right up against them, unlike the male
source, so the "far from any island" seed test rarely fires), and it isn't needed:
`body` already covers their pixels with the correct shape, and BodyView renders every
silhouette path inside one <g opacity=...> (see BodyMap.tsx), so an unextracted hand
sitting inside `body`'s path looks identical to one traced separately -- no double
opacity, because the group composites once, not per path.

## One mask per muscle, not one per island

This step now runs AFTER labels-female.py, and takes its regions from that file rather
than from raw connected components. A muscle in this source is frequently drawn as
several islands split by a striation or a tendon line (the triceps is six), and tracing
each separately is what made the female map read as a cluster of slivers next to the
male map's single clean shapes -- every fragment carried its own rim.

So the members of a muscle are unioned, and the hairline separator between them is
closed before tracing. The closing radius is found per muscle, not fixed: start at 1px
and grow until the union becomes a single connected component. The smallest radius that
does the job is the one that distorts the silhouette least -- a fixed generous radius
would round off every genuine concavity in the outline as well. If no radius up to CAP
connects them, the union is traced as-is (potrace emits one path with several subpaths,
which is still one shape and one rim, just not a contiguous one).
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
sil = np.load(T + 'sil.npy')
sil_parts = json.load(open(T + 'sil.json'))
labels = json.load(open(T + 'labels.json'))

CAP = 9  # px; the widest separator in this source is ~6px at 980px tall
# Enclosed gaps smaller than this (source px) are filled rather than traced. The source
# draws tendon detail as closed loops inside a muscle -- a ring of them runs down the lower
# calf and around each elbow -- and potrace faithfully turns every one into a subpath, which
# renders as a scatter of dark specks inside an otherwise solid shape. The male sheet has
# nothing like it. This is a threshold, not a blanket fill, so a genuinely large opening
# (the gap the body shows through between the glutes, say) still traces as a hole.
HOLE_MAX = 900


def disk(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= r * r


def dump(mask, name):
    Image.fromarray(np.where(mask, 0, 255).astype('uint8'), 'L').save(T + 'masks/' + name + '.png')


lab, n = ndimage.label(ink)
sizes = ndimage.sum(ink, lab, range(1, n + 1))
two = sorted((np.argsort(-sizes)[:2] + 1), key=lambda i: ndimage.center_of_mass(ink, lab, i)[1])

meta = {'figures': {}, 'regions': []}
report = []

for nm, i in zip(['front', 'back'], two):
    fm = lab == i
    ys, xs = np.where(fm)
    bbox = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
    meta['figures'][nm] = {'bbox': bbox, 'px': int(fm.sum())}
    dump(fm, f'{nm}__body')
    meta['regions'].append({'view': nm, 'key': 'body', 'kind': 'silhouette', 'px': int(fm.sum()),
                            'centroid': [float(xs.mean()), float(ys.mean())]})

    head = next((p for p in sil_parts[nm] if p['name'] == 'head'), None)
    if head:
        m = (sil == head['k']) & fm
        hy, hx = np.where(m)
        dump(m, f'{nm}__head')
        meta['regions'].append({'view': nm, 'key': 'head', 'kind': 'silhouette', 'px': int(m.sum()),
                                'centroid': [float(hx.mean()), float(hy.mean())]})

    im_mask = island & fm
    l2, _ = ndimage.label(im_mask)

    for row in labels[nm]:
        union = np.isin(l2, row['members'])
        r_used = 0
        if len(row['members']) > 1:
            _, parts = ndimage.label(union)
            for r in range(1, CAP + 1):
                if parts <= 1:
                    break
                closed = ndimage.binary_closing(union, structure=disk(r))
                _, parts = ndimage.label(closed)
                if parts <= 1:
                    union = closed
                    r_used = r
                    break
            else:
                r_used = -1  # never connected; traced as several subpaths of one shape
        # fill the speckle-sized enclosed gaps (see HOLE_MAX)
        holes = ndimage.binary_fill_holes(union) & ~union
        if holes.any():
            hl, hn = ndimage.label(holes)
            hs = ndimage.sum(holes, hl, range(1, hn + 1))
            small = np.isin(hl, [k for k in range(1, hn + 1) if hs[k - 1] <= HOLE_MAX])
            filled = int(small.sum())
            if filled:
                union = union | small
                report.append(f'  {nm} {row["id"]}: filled {filled}px of speck holes')

        yy, xx = np.where(union)
        key = f'isl{row["blob"]:03d}'
        dump(union, f'{nm}__{key}')
        # always 'muscle' here regardless of the row's own kind: assemble.mjs uses THIS field
        # only to decide which traced regions are head/hand/foot silhouettes to emit on their
        # own, and takes the real kind from labels.json. Writing 'silhouette' for the hair
        # island made it emit twice -- once as `isl001`, once as `hair_center`.
        meta['regions'].append({'view': nm, 'key': key, 'kind': 'muscle', 'px': int(union.sum()),
                                'centroid': [float(xx.mean()), float(yy.mean())]})
        if len(row['members']) > 1:
            report.append(f'  {nm} {row["id"]}: {len(row["members"])} islands -> 1'
                          + (f' (closed r={r_used})' if r_used > 0 else ' (left as subpaths)' if r_used < 0 else ''))

    print(f'{nm}: {len([r for r in meta["regions"] if r["view"] == nm])} regions written')

print('\n--- unions ---')
for line in report:
    print(line)

json.dump(meta, open(T + 'meta.json', 'w'), indent=1)
print('\nfigures:', {k: v['bbox'] for k, v in meta['figures'].items()})
print('total regions:', len(meta['regions']))
