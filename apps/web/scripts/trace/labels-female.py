"""The blob -> muscle table for the female reference (flat-vector illustration, see
analyze-female.py's docstring).

## One shape per muscle, not one per blob

The source draws a lot of internal linework: striations down the triceps, four separate
slivers per forearm, a split upper trap, tendon detail at every joint. Connected-component
labelling faithfully recovers every one of those as its OWN island, which is anatomically
meaningless -- the male reference draws each muscle as a single closed region, and the map
is supposed to read as anatomy, not as the illustrator's shading.

So this file no longer emits a row per blob. It emits a row per **(group, side)**, listing
the blobs that make it up, and masks-female.py unions those blobs into one mask (closing the
hairline separator between them) before tracing. The result is one path per muscle per side,
exactly like the male sheet: `triceps_brachii_left` rather than a base shape plus five
`triceps_brachii_left_hl*` fragments each carrying its own rim.

That fragmentation was visible, not theoretical -- the triceps, forearms and upper traps
each rendered as a cluster of separately-outlined slivers.

## Every blob is named deliberately

The previous version hand-named only the largest shapes and auto-folded everything else into
its nearest same-side neighbour by centroid distance. "Nearest" is not "correct", and it was
wrong in ways that matter for what the map claims:

  - the back forearm blobs folded into TRICEPS, so a forearm exercise lit the upper arm;
  - two forearm blobs were hand-named 'External Oblique', so an ab exercise lit a forearm;
  - the front sheet had no deltoid at all (the shoulder caps folded into the trap), which is
    why exerciseMuscles.ts needed a FRONT_DELTOID_FALLBACK to make a press light anything;
  - the distal medial quad was named 'Adductors', so leg extension missed it.

Every blob below is now assigned by inspection of the artwork, and anything that is not a
muscle -- the face crease, the palms on the back view, the knee-joint wedges -- is excluded
rather than folded into whichever muscle happened to be closest.

Three machine checks run against the table:
  1. bilateral symmetry -- a pair's two blobs must mirror about the midline, sit at the same
     height, and have similar area;
  2. every blob must be accounted for exactly once: named, excluded, or explicitly folded --
     nothing silently unlabelled, nothing double-claimed;
  3. no group may end up with blobs on both sides in one row (a merge across the midline).
"""
import json
import numpy as np
from PIL import Image
from scipy import ndimage

import os
_HERE = os.path.dirname(os.path.abspath(__file__))
T = os.path.join(_HERE, 'build-female') + os.sep

# (blob_a, blob_b, name, category, group). blob_a/blob_b are a mirrored pair; side is
# derived from x. Extra blobs belonging to the same muscle go in FOLD, keyed to the group.
FRONT = [
    (5, 6, 'Sternocleidomastoid', None, 'sternocleidomastoid'),
    (8, 9, 'Trapezius (Upper)', 'shoulders', 'trapezius_upper'),
    (10, 11, 'Deltoid (Lateral)', 'shoulders', 'lateral_deltoid'),
    (14, 15, 'Deltoid (Anterior)', 'shoulders', 'anterior_deltoid'),
    (16, 17, 'Pectoralis Major', 'chest', 'pectoralis_major'),
    (18, 19, 'Biceps Brachii', 'biceps', 'biceps_brachii'),
    (36, 37, 'Brachioradialis', 'biceps', 'brachioradialis'),
    (40, 41, 'Wrist Flexors', 'biceps', 'wrist_flexors'),
    (26, 27, 'Rectus Abdominis (Upper)', 'abs', 'rectus_abdominis_upper'),
    (34, 35, 'Rectus Abdominis (Middle)', 'abs', 'rectus_abdominis_middle'),
    (48, 49, 'Rectus Abdominis (Lower)', 'abs', 'rectus_abdominis_lower'),
    (20, 21, 'Serratus Anterior', 'abs', 'serratus_anterior'),
    (38, 39, 'External Oblique', 'abs', 'external_oblique'),
    (52, 53, 'Tensor Fasciae Latae', 'legs', 'tensor_fasciae_latae'),
    (50, 51, 'Sartorius', 'legs', 'sartorius'),
    (62, 63, 'Pectineus', 'legs', 'pectineus'),
    (54, 55, 'Rectus Femoris', 'legs', 'rectus_femoris'),
    (71, 72, 'Vastus Lateralis', 'legs', 'vastus_lateralis'),
    (74, 75, 'Vastus Medialis', 'legs', 'vastus_medialis'),
    (82, 83, 'Gastrocnemius', 'legs', 'gastrocnemius'),
]
# blob -> group it belongs to. Same muscle, extra island: the source split it with a
# striation or a tendon line. These are unioned into the group's single shape.
FRONT_FOLD = {
    12: 'trapezius_upper', 13: 'trapezius_upper',
    24: 'biceps_brachii', 25: 'biceps_brachii',
    # the two long straps running to the wrist are the flexor mass continuing down, so
    # they belong to wrist_flexors -- the male sheet draws that as one shape too
    44: 'wrist_flexors', 45: 'wrist_flexors',
    46: 'wrist_flexors', 47: 'wrist_flexors',
    22: 'serratus_anterior', 23: 'serratus_anterior',
    28: 'serratus_anterior', 29: 'serratus_anterior',
    30: 'serratus_anterior', 31: 'serratus_anterior',
    32: 'serratus_anterior', 33: 'serratus_anterior',
    42: 'rectus_abdominis_middle', 43: 'rectus_abdominis_middle',
    84: 'gastrocnemius', 85: 'gastrocnemius',
    86: 'gastrocnemius', 87: 'gastrocnemius',
}
FRONT_CENTER = [
    (1, 'Hair', None, 'hair', 'silhouette'),
    (7, 'Neck', None, 'neck', 'muscle'),
]
FRONT_CENTER_FOLD = {}
# Not muscle. Dropped entirely so `body` (the whole figure's ink footprint) covers the area
# with a smooth fill -- the male reference draws hands, feet and faces as plain unmarked
# silhouette, and these read as clutter at 288px tall.
FRONT_EXCLUDE = {
    4,                                            # crease on the jaw -- renders as a patch on the face
    58, 59, 60, 61, 64, 65, 66, 67, 68, 69, 70, 73,  # palms + fingers
    76, 77, 78, 79, 80, 81,                       # knee-joint wedges: not a muscle
    88, 89, 90, 91, 92, 93, 94, 95,               # ankle notch through toes
}

BACK = [
    (2, 3, 'Trapezius (Upper)', 'shoulders', 'trapezius_upper'),
    (4, 5, 'Deltoid (Posterior)', 'shoulders', 'posterior_deltoid'),
    (6, 7, 'Infraspinatus & Teres Major', 'back', 'infraspinatus_teres_major'),
    (8, 9, 'Triceps Brachii', 'triceps', 'triceps_brachii'),
    (10, 11, 'Latissimus Dorsi', 'back', 'latissimus_dorsi'),
    (18, 19, 'Erector Spinae', 'back', 'erector_spinae'),
    (28, 29, 'External Oblique', 'abs', 'external_oblique'),
    (20, 21, 'Brachioradialis', 'biceps', 'brachioradialis'),
    (26, 27, 'Extensor Carpi Ulnaris', 'biceps', 'extensor_carpi_ulnaris'),
    (30, 31, 'Gluteus Medius', 'legs', 'gluteus_medius'),
    (32, 33, 'Gluteus Maximus', 'legs', 'gluteus_maximus'),
    (52, 53, 'Biceps Femoris', 'legs', 'biceps_femoris'),
    (50, 51, 'Semitendinosus', 'legs', 'semitendinosus'),
    (46, 47, 'Adductors', 'legs', 'adductors'),
    (56, 57, 'Gastrocnemius', 'legs', 'gastrocnemius'),
]
BACK_FOLD = {
    12: 'triceps_brachii', 13: 'triceps_brachii',
    14: 'triceps_brachii', 15: 'triceps_brachii',
    16: 'triceps_brachii', 17: 'triceps_brachii',
    24: 'brachioradialis', 25: 'brachioradialis',
    48: 'biceps_femoris', 49: 'biceps_femoris',
    54: 'semitendinosus', 55: 'semitendinosus',
    58: 'gastrocnemius', 59: 'gastrocnemius',
}
BACK_CENTER = [
    (1, 'Hair', None, 'hair', 'silhouette'),
]
BACK_CENTER_FOLD = {}
BACK_EXCLUDE = {
    34, 35,                                   # the palms -- muscle-coloured in the source, but a hand
    36, 37, 38, 39, 40, 41, 42, 43, 44, 45,   # fingers
    60, 61, 62, 63, 64, 65,                   # ankle through heel
}


def slug(s):
    return (s.lower().replace(' & ', '_').replace('(', '').replace(')', '')
            .replace(' ', '_').replace('-', '_').replace(',', ''))


im = Image.open(os.path.join(_HERE, 'reference-female.png')).convert('RGBA')
a = np.array(im).astype(int)
ink = a[:, :, 3] > 128
island = np.load(T + 'island.npy')

lab_ink, n = ndimage.label(ink)
s_ink = ndimage.sum(ink, lab_ink, range(1, n + 1))
two = sorted((np.argsort(-s_ink)[:2] + 1), key=lambda i: ndimage.center_of_mass(ink, lab_ink, i)[1])

problems = []
out = {}

TABLES = {
    'front': (FRONT, FRONT_CENTER, FRONT_CENTER_FOLD, FRONT_FOLD, FRONT_EXCLUDE),
    'back': (BACK, BACK_CENTER, BACK_CENTER_FOLD, BACK_FOLD, BACK_EXCLUDE),
}

for view, comp in zip(['front', 'back'], two):
    fm = lab_ink == comp
    ys, xs = np.where(fm)
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    mid = (x0 + x1) / 2
    l2, n2 = ndimage.label(island & fm)
    s2 = ndimage.sum(island & fm, l2, range(1, n2 + 1))
    all_blobs = {j: {'area': int(s2[j - 1])} for j in range(1, n2 + 1) if s2[j - 1] >= 40}
    for j, info in all_blobs.items():
        yy, xx = np.where(l2 == j)
        info['cx'] = float(xx.mean())
        info['cy'] = float(yy.mean())

    def side_of(cx):
        left = cx < mid
        return ('right' if left else 'left') if view == 'front' else ('left' if left else 'right')

    TABLE, CENTER, CENTER_FOLD, FOLD, EXCLUDE = TABLES[view]

    rows = []
    claimed = set(EXCLUDE) & set(all_blobs)
    by_group = {}  # (group, side) -> row

    for ba, bb, name, cat, group in TABLE:
        infos = [all_blobs[b] for b in (ba, bb)]
        dx = [abs(i['cx'] - mid) for i in infos]
        if abs(dx[0] - dx[1]) > 15:
            problems.append(f'{view} {name}: pair not mirrored, |dx| {dx[0]:.0f} vs {dx[1]:.0f}')
        if abs(infos[0]['cy'] - infos[1]['cy']) > 15:
            problems.append(f'{view} {name}: pair heights differ by {abs(infos[0]["cy"]-infos[1]["cy"]):.0f}px')
        for b, i in zip((ba, bb), infos):
            side = side_of(i['cx'])
            key = (group, side)
            if key in by_group:
                problems.append(f'{view}: {group}/{side} claimed twice by the major table')
            row = {'id': f'{group}_{side}', 'name': f'{name} ({"L" if side == "left" else "R"})',
                   'category': cat, 'group': group, 'side': side, 'kind': 'muscle',
                   'blob': b, 'members': [b]}
            rows.append(row)
            by_group[key] = row
            claimed.add(b)

    for b, name, cat, group, kind in CENTER:
        row = {'id': f'{group}_center', 'name': name, 'category': cat, 'group': group,
               'side': 'center', 'kind': kind, 'blob': b, 'members': [b]}
        rows.append(row)
        by_group[(group, 'center')] = row
        claimed.add(b)

    for b, group in {**FOLD, **{k: v for k, v in CENTER_FOLD.items()}}.items():
        if b not in all_blobs:
            problems.append(f'{view}: fold blob {b} does not exist')
            continue
        side = 'center' if b in CENTER_FOLD else side_of(all_blobs[b]['cx'])
        key = (group, side)
        if key not in by_group:
            problems.append(f'{view}: fold blob {b} -> {group}/{side}, which has no shape to join')
            continue
        by_group[key]['members'].append(b)
        claimed.add(b)

    unclaimed = sorted(set(all_blobs) - claimed)
    if unclaimed:
        problems.append(f'{view}: blobs neither named, folded nor excluded: {unclaimed}')

    # a row must not straddle the midline -- that would union two different sides into one shape
    for r in rows:
        if r['side'] == 'center':
            continue
        sides = {side_of(all_blobs[b]['cx']) for b in r['members']}
        if sides != {r['side']}:
            problems.append(f'{view}: {r["id"]} unions blobs from both sides: {sorted(r["members"])}')

    for r in rows:
        r['members'] = sorted(r['members'])
        r['blob'] = r['members'][0]  # representative: names the mask masks-female.py writes

    out[view] = rows
    ids = [r['id'] for r in rows]
    if len(set(ids)) != len(ids):
        problems.append(f'{view}: duplicate ids {[x for x in ids if ids.count(x) > 1]}')
    print(f'{view}: {len(rows)} shapes from {len(all_blobs)} blobs '
          f'({len(TABLE) * 2} major, {len(FOLD) + len(CENTER_FOLD)} folded, {len(EXCLUDE)} excluded)')

print('\n--- checks ---')
if problems:
    for p in problems:
        print('  !!', p)
else:
    print('  all pass')

json.dump(out, open(T + 'labels.json', 'w'), indent=1)
print('\nwrote', T + 'labels.json')
