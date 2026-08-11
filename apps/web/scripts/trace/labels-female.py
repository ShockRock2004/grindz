"""The blob -> muscle table for the female reference (flat-vector illustration, see
analyze-female.py's docstring). This source has far more linework than the earlier
photo did (154 island blobs across both views vs ~100), most of it small joint-crease
and tendon detail rather than distinct muscles -- so unlike labels.py/the old
labels-female.py, this table only hand-names the MAJOR shapes (>= MAJOR_MIN px) and
folds every minor shape into its nearest major neighbour's group by centroid distance,
same side. A folded shape paints together with its parent and carries no name of its
own, matching the 'nested highlight' pattern the earlier version used by hand.

Two independent checks still run against the major table, same as labels.py:
  1. bilateral symmetry -- a pair's two blobs must mirror about the midline, sit at
     the same height, and have similar area;
  2. every major/hand/foot/neck blob must be accounted for exactly once (no blob
     silently unlabelled, none double-claimed).
"""
import json
import numpy as np
from PIL import Image
from scipy import ndimage

import os
_HERE = os.path.dirname(os.path.abspath(__file__))
T = os.path.join(_HERE, 'build-female') + os.sep
MAJOR_MIN = 550

# (blob_a, blob_b, name, category, group) -- side derived from x. group defaults to
# slug(name). A single blob_a with blob_b=None is a center-only shape (e.g. hair).
FRONT = [
    (14, 15, 'Trapezius (Upper)', 'shoulders', 'trapezius_upper'),
    (16, 17, 'Pectoralis Major', 'chest', 'pectoralis_major'),
    (18, 19, 'Biceps Brachii', 'biceps', 'biceps_brachii'),
    (26, 27, 'Rectus Abdominis (Upper)', 'abs', 'rectus_abdominis_upper'),
    (34, 35, 'Rectus Abdominis (Middle)', 'abs', 'rectus_abdominis_middle'),
    (38, 39, 'Serratus Anterior', 'abs', 'serratus_anterior'),
    (42, 43, 'Rectus Abdominis (Middle)', 'abs', 'rectus_abdominis_middle'),
    (48, 49, 'Rectus Abdominis (Lower)', 'abs', 'rectus_abdominis_lower'),
    (50, 51, 'External Oblique', 'abs', 'external_oblique'),
    (52, 53, 'External Oblique (Upper)', 'abs', 'external_oblique'),
    (54, 55, 'Rectus Femoris', 'legs', 'rectus_femoris'),
    (71, 72, 'Vastus Lateralis', 'legs', 'vastus_lateralis'),
    (74, 75, 'Adductors', 'legs', 'adductors'),
    (82, 83, 'Gastrocnemius', 'legs', 'gastrocnemius'),
    (84, 85, 'Gastrocnemius (Lateral)', 'legs', 'gastrocnemius'),
    (86, 87, 'Gastrocnemius (Medial)', 'legs', 'gastrocnemius'),
]
# arm/forearm slivers that are real anatomy but too thin individually to name on
# their own -- explicitly folded into biceps_brachii / forearm rather than left for
# the auto-fold pass, since several sit closer to an abs/oblique blob than to the arm.
# (group, category) -- category is explicit here, NOT looked up from a major TABLE
# row, because 'forearm' has no major row of its own on either view (a lookup-based
# category silently produced None for it once -- every forearm shape stayed grey
# forever under the Biceps category. Male dataset convention: every forearm muscle is
# 'biceps' regardless of view, so that's what these get too).
FRONT_FOLD_EXPLICIT = {
    36: ('biceps_brachii', 'biceps'), 37: ('biceps_brachii', 'biceps'),
    40: ('biceps_brachii', 'biceps'), 41: ('biceps_brachii', 'biceps'),
    44: ('forearm', 'biceps'), 45: ('forearm', 'biceps'),
    46: ('forearm', 'biceps'), 47: ('forearm', 'biceps'),
}
FRONT_CENTER = [
    (1, 'Hair', None, 'hair', 'silhouette'),
    (7, 'Neck', None, 'neck', 'muscle'),
    (62, 'Lower Abdomen', 'abs', 'lower_abdomen', 'muscle'),
    (63, 'Lower Abdomen', 'abs', 'lower_abdomen', 'muscle'),
]
# Dropped entirely, not just left untrainable: the palm/finger tendon lines and the
# ankle/foot detail (heel wedge, toe crease, the 'soleus'-looking patch that turned out
# on inspection to sit on the widened foot silhouette, past where the calf narrows) read
# as clutter rather than anatomy at this scale, and the male reference draws hands and
# feet as plain unmarked silhouette. Excluding them here means `body` (the whole
# figure's ink footprint) covers that area with a smooth, seamless fill -- see
# analyze-female.py's docstring for why `body` already has the right shape without
# these. Kept as an explicit set rather than a lower area threshold because some of
# these blobs (the heel patch) are not small.
FRONT_EXCLUDE = {
    58, 59, 60, 61, 64, 65, 66, 67, 68, 69, 70, 73,  # palm + fingers
    88, 89, 90, 91, 92, 93, 94, 95,                   # ankle notch through toes
}

BACK = [
    (2, 3, 'Trapezius (Upper)', 'shoulders', 'trapezius_upper'),
    (4, 5, 'Deltoid (Posterior)', 'shoulders', 'posterior_deltoid'),
    (8, 9, 'Triceps Brachii', 'triceps', 'triceps_brachii'),
    (10, 11, 'Latissimus Dorsi', 'back', 'latissimus_dorsi'),
    (18, 19, 'Erector Spinae', 'back', 'erector_spinae'),
    (26, 27, 'External Oblique (Flank)', 'abs', 'external_oblique'),
    (30, 31, 'Gluteus Medius', 'legs', 'gluteus_medius'),
    (32, 33, 'Gluteus Maximus', 'legs', 'gluteus_maximus'),
    (46, 47, 'Biceps Femoris', 'legs', 'biceps_femoris'),
    (50, 51, 'Semitendinosus', 'legs', 'semitendinosus'),
    (52, 53, 'Adductors', 'legs', 'adductors'),
    (56, 57, 'Gastrocnemius', 'legs', 'gastrocnemius'),
    (58, 59, 'Gastrocnemius (Medial)', 'legs', 'gastrocnemius'),
]
BACK_FOLD_EXPLICIT = {
    6: ('trapezius_upper', 'shoulders'), 7: ('trapezius_upper', 'shoulders'),
    16: ('triceps_brachii', 'triceps'), 17: ('triceps_brachii', 'triceps'),
    20: ('triceps_brachii', 'triceps'), 21: ('triceps_brachii', 'triceps'),
    24: ('triceps_brachii', 'triceps'), 25: ('triceps_brachii', 'triceps'),
    34: ('forearm', 'biceps'), 35: ('forearm', 'biceps'),
}
BACK_CENTER = [
    (1, 'Hair', None, 'hair', 'silhouette'),
]
# see FRONT_EXCLUDE
BACK_EXCLUDE = {
    36, 37, 38, 39, 40, 41, 42, 43, 44, 45,  # palm + fingers
    60, 61, 62, 63, 64, 65,                   # ankle through heel
}

WORKED = set()  # this source carries no highlighted (worked-muscle) colour to check against


def slug(s):
    return (s.lower().replace(' & ', '_').replace('(', '').replace(')', '')
            .replace(' ', '_').replace('-', '_').replace(',', ''))


im = Image.open(os.path.join(_HERE, 'reference-female.png')).convert('RGBA')
a = np.array(im).astype(int)
A = a[:, :, 3]
ink = A > 128
island = np.load(T + 'island.npy')

lab_ink, n = ndimage.label(ink)
s_ink = ndimage.sum(ink, lab_ink, range(1, n + 1))
two = sorted((np.argsort(-s_ink)[:2] + 1), key=lambda i: ndimage.center_of_mass(ink, lab_ink, i)[1])

problems = []
out = {}

TABLES = {
    'front': (FRONT, FRONT_CENTER, FRONT_FOLD_EXPLICIT, FRONT_EXCLUDE),
    'back': (BACK, BACK_CENTER, BACK_FOLD_EXPLICIT, BACK_EXCLUDE),
}

for view, comp in zip(['front', 'back'], two):
    fm = lab_ink == comp
    x0, y0, x1, y1 = int(np.where(fm)[1].min()), int(np.where(fm)[0].min()), int(np.where(fm)[1].max()) + 1, int(np.where(fm)[0].max()) + 1
    mid = (x0 + x1) / 2
    l2, n2 = ndimage.label(island & fm)
    s2 = ndimage.sum(island & fm, l2, range(1, n2 + 1))
    all_blobs = {j: {'area': int(s2[j - 1])} for j in range(1, n2 + 1) if s2[j - 1] >= 40}
    for j, info in all_blobs.items():
        ys, xs = np.where(l2 == j)
        info['cx'] = float(xs.mean())
        info['cy'] = float(ys.mean())

    def side_of(cx):
        left = cx < mid
        return ('right' if left else 'left') if view == 'front' else ('left' if left else 'right')

    TABLE, CENTER, FOLD_EXPLICIT, EXCLUDE = TABLES[view]

    rows = []
    claimed = set(EXCLUDE) & set(all_blobs)  # dropped on purpose -- see FRONT_EXCLUDE
    group_positions = {}  # group -> list of (side, cx, cy) for the fold pass

    for ba, bb, name, cat, group in TABLE:
        pair = [ba, bb]
        infos = [all_blobs[b] for b in pair]
        dx = [abs(i['cx'] - mid) for i in infos]
        if abs(dx[0] - dx[1]) > 15:
            problems.append(f'{view} {name}: pair not mirrored, |dx| {dx[0]:.0f} vs {dx[1]:.0f}')
        if abs(infos[0]['cy'] - infos[1]['cy']) > 15:
            problems.append(f'{view} {name}: pair heights differ by {abs(infos[0]["cy"]-infos[1]["cy"]):.0f}px')
        for b, i in zip(pair, infos):
            side = side_of(i['cx'])
            rows.append({'blob': b, 'id': f'{group}_{side}_{b}', 'name': f'{name} ({"L" if side=="left" else "R"})',
                         'category': cat, 'group': group, 'side': side, 'kind': 'muscle'})
            claimed.add(b)
            group_positions.setdefault(group, []).append((side, i['cx'], i['cy'], cat))

    for b, name, cat, group, kind in CENTER:
        rows.append({'blob': b, 'id': f'{group}_center_{b}' if any(r['group'] == group for r in rows) else f'{group}_center',
                     'name': name, 'category': cat, 'group': group, 'side': 'center', 'kind': kind})
        claimed.add(b)

    for b, (group, cat) in FOLD_EXPLICIT.items():
        info = all_blobs[b]
        side = side_of(info['cx'])
        rows.append({'blob': b, 'id': f'{group}_{side}_hl{b}', 'name': f'{group} detail',
                     'category': cat, 'group': group, 'side': side, 'kind': 'muscle'})
        claimed.add(b)

    # auto-fold: every remaining unclaimed blob joins its nearest claimed neighbour's
    # group (same side only), so small joint-crease/collar/tendon detail always
    # paints with whatever real muscle it sits on/next to
    unclaimed = [b for b in all_blobs if b not in claimed]
    named_positions = [(r['blob'], r['side'], r['group'], r['category']) for r in rows if r['kind'] != 'silhouette' and r['side'] != 'center']
    for b in unclaimed:
        info = all_blobs[b]
        side = side_of(info['cx'])
        same_side = [(bb, g, c) for bb, s, g, c in named_positions if s == side]
        if not same_side:
            continue
        best = min(same_side, key=lambda t: (all_blobs[t[0]]['cx'] - info['cx']) ** 2 + (all_blobs[t[0]]['cy'] - info['cy']) ** 2)
        _, group, cat = best
        rows.append({'blob': b, 'id': f'{group}_{side}_hl{b}', 'name': f'{group} detail',
                     'category': cat, 'group': group, 'side': side, 'kind': 'muscle'})
        claimed.add(b)

    still_unclaimed = set(all_blobs) - claimed
    if still_unclaimed:
        problems.append(f'{view}: blobs never claimed (no same-side neighbour to fold into): {sorted(still_unclaimed)}')

    out[view] = rows
    ids = [r['id'] for r in rows]
    if len(set(ids)) != len(ids):
        problems.append(f'{view}: duplicate ids {[x for x in ids if ids.count(x) > 1]}')
    print(f'{view}: {len(rows)} shapes ({len(TABLE)*2} major, {len(EXCLUDE)} excluded, '
          f'{len(CENTER)} center, {len(FOLD_EXPLICIT)} explicit-fold, {len(unclaimed)} auto-fold)')

print('\n--- checks ---')
if problems:
    for p in problems:
        print('  !!', p)
else:
    print('  all pass')

json.dump(out, open(T + 'labels.json', 'w'), indent=1)
print('\nwrote', T + 'labels.json')
