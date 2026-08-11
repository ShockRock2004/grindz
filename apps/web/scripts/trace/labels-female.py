"""The blob -> muscle table for the female reference, read off the reference by eye
(same method as labels.py; see that file's docstring for the two machine checks this
reuses). The source art does not sub-divide the arms into biceps/triceps/forearm the
way the male reference does -- front arm mass reads as biceps, back arm mass as
triceps, per the visible-muscle convention most muscle-map apps use, and the
forearm+hand shape (no wrist crease was drawn, so it traced as one blob) is left
untrainable (kind=silhouette) rather than mislabelled as a specific forearm muscle.

Some interior highlight/shading patches trace as their own enclosed blob nested
inside a bigger one (e.g. the glute's inner highlight, the calf's shin highlight).
Those are given the SAME group as their parent so they always paint together --
listed under `NESTED` below rather than `TABLE`, since they don't get their own name.
"""
import json
import numpy as np
from PIL import Image
from scipy import ndimage

import os
_HERE = os.path.dirname(os.path.abspath(__file__))
T = os.path.join(_HERE, 'build-female') + os.sep
REF = os.path.join(_HERE, 'reference-female.png')
MIN = 150

# (blob_a, blob_b, name, category, group) -- a/b order irrelevant, side derived from x.
# group defaults to slug(name) when omitted.
FRONT = [
    (3, 4, 'Neck', None, 'neck'),
    (8, None, 'Neck', None, 'neck'),          # unpaired sliver, folded into the neck group
    (14, 15, 'Trapezius (Upper)', 'back', None),
    (12, 13, 'Deltoid (Anterior/Lateral)', 'shoulders', 'deltoid'),
    (16, 17, 'Deltoid (Posterior)', 'shoulders', 'deltoid'),
    (18, 19, 'Pectoralis Major (Upper)', 'chest', 'pectoralis_major'),
    (22, 24, 'Pectoralis Major', 'chest', 'pectoralis_major'),
    (28, 30, 'Biceps Brachii', 'biceps', None),
    (33, 53, 'Biceps Brachii (Lower)', 'biceps', 'biceps_brachii'),
    (37, 38, 'Rectus Abdominis (Upper)', 'abs', 'rectus_abdominis_upper'),
    (41, 44, 'Serratus Anterior', 'abs', None),
    (42, 47, 'External Oblique (Upper)', 'abs', 'external_oblique'),
    (48, 49, 'External Oblique (Lower)', 'abs', 'external_oblique'),
    (50, 51, 'Rectus Abdominis (Middle)', 'abs', 'rectus_abdominis_middle'),
    (55, 56, 'Rectus Abdominis (Lower)', 'abs', 'rectus_abdominis_lower'),
    (62, 63, 'External Oblique (Iliac)', 'abs', 'external_oblique'),
    (65, 66, 'Lower Abdomen', 'abs', 'lower_abdomen'),
    (67, 68, 'Hip Flexors', 'legs', None),
    (69, 70, 'Tensor Fasciae Latae', 'legs', 'tensor_fasciae_latae'),
    (72, 73, 'Tensor Fasciae Latae (Lower)', 'legs', 'tensor_fasciae_latae'),
    (74, 75, 'Quadriceps (Rectus Femoris)', 'legs', 'quadriceps'),
    (77, 78, 'Quadriceps (Vastus Lateralis)', 'legs', 'vastus_lateralis'),
    (81, 82, 'Adductors', 'legs', None),
    (97, 98, 'Gastrocnemius', 'legs', 'gastrocnemius'),
    (102, 103, 'Tibialis Anterior', 'legs', 'tibialis_anterior'),
]
FRONT_CENTER = [
    (1, 'Head', None, 'head', 'silhouette'),
    (2, 'Neck', None, 'neck', 'muscle'),
    (20, 'Pectoralis Major (Sternum)', 'chest', 'pectoralis_major', 'muscle'),
    (52, 'Rectus Abdominis (Linea Alba)', 'abs', 'rectus_abdominis_middle', 'muscle'),
    (64, 'Lower Abdomen', 'abs', 'lower_abdomen', 'muscle'),
]
FRONT_NESTED = [  # (blob, parent_group) -- painted with the parent, no name of its own
    (104, 'tibialis_anterior'), (105, 'tibialis_anterior'), (54, 'biceps_brachii'),
]
FRONT_SILHOUETTE_PAIRS = [
    (57, 60, 'Forearm & Hand'),
]

BACK = [
    (4, 5, 'Splenius', None, None),
    (7, 8, 'Trapezius (Upper)', 'back', 'trapezius_upper'),
    (9, 10, 'Trapezius (Middle)', 'back', 'trapezius_upper'),
    (11, 12, 'Deltoid (Posterior)', 'shoulders', 'deltoid'),
    (15, 16, 'Infraspinatus & Teres', 'back', None),
    (17, 18, 'Infraspinatus & Teres (Lower)', 'back', 'infraspinatus_teres'),
    (25, 26, 'Latissimus Dorsi', 'back', 'latissimus_dorsi'),
    (21, 22, 'Triceps Brachii', 'triceps', None),
    (29, 30, 'Triceps Brachii (Lower)', 'triceps', 'triceps_brachii'),
    (38, 39, 'External Oblique (Flank)', 'abs', 'external_oblique'),
    (32, 33, 'External Oblique (Lower Flank)', 'abs', 'external_oblique'),
    (53, 54, 'Gluteus Medius', 'legs', None),
    (49, 66, 'Gluteus Maximus', 'legs', 'gluteus_maximus'),
    (61, 62, 'Adductors (Upper)', 'legs', None),
    (67, 68, 'Hamstrings (Biceps Femoris)', 'legs', 'hamstrings'),
    (77, 78, 'Gastrocnemius', 'legs', 'gastrocnemius'),
]
BACK_CENTER = [
    (1, 'Head', None, 'head', 'silhouette'),
    (6, 'Erector Spinae', 'back', 'erector_spinae', 'muscle'),
    (64, 'Hamstrings (Semitendinosus, Center)', 'legs', 'hamstrings', 'muscle'),
]
BACK_NESTED = [
    (55, 'gluteus_maximus'), (56, 'gluteus_maximus'),
    (48, 'external_oblique'), (65, 'hamstrings'),
]
BACK_SILHOUETTE_PAIRS = [
    (40, 41, 'Forearm & Hand'),
    (43, 44, 'Forearm & Hand (Lower)'),
]

WORKED = {'shoulders', 'back'}  # what this particular source photo highlights red


def slug(s):
    return (s.lower().replace(' & ', '_').replace('(', '').replace(')', '')
            .replace(' ', '_').replace('-', '_').replace(',', ''))


im = Image.open(REF).convert('RGBA')
a = np.array(im).astype(int)
R, G, B, A = a[:, :, 0], a[:, :, 1], a[:, :, 2], a[:, :, 3]
ink = A > 128
red = ink & (R - G > 40) & (R - B > 40)

lab_ink, n = ndimage.label(ink)
s_ink = ndimage.sum(ink, lab_ink, range(1, n + 1))
two = sorted((np.argsort(-s_ink)[:2] + 1), key=lambda i: ndimage.center_of_mass(ink, lab_ink, i)[1])

island = np.load(T + 'island.npy')

problems = []
notes = []
out = {'front': [], 'back': []}

TABLES = {'front': (FRONT, FRONT_CENTER, FRONT_NESTED, FRONT_SILHOUETTE_PAIRS),
          'back': (BACK, BACK_CENTER, BACK_NESTED, BACK_SILHOUETTE_PAIRS)}

for view, comp in zip(['front', 'back'], two):
    fm = lab_ink == comp
    x0, y0, x1, y1 = int(np.where(fm)[1].min()), int(np.where(fm)[0].min()), int(np.where(fm)[1].max()) + 1, int(np.where(fm)[0].max()) + 1
    mid = (x0 + x1) / 2
    l2, n2 = ndimage.label(island & fm)
    s2 = ndimage.sum(island & fm, l2, range(1, n2 + 1))
    valid = {j for j in range(1, n2 + 1) if s2[j - 1] >= MIN}

    TABLE, CENTER, NESTED, SIL_PAIRS = TABLES[view]
    listed = set()
    for row in TABLE:
        ba, bb = row[0], row[1]
        listed.add(ba)
        if bb is not None:
            listed.add(bb)
    for b, *_ in CENTER:
        listed.add(b)
    for b, _ in NESTED:
        listed.add(b)
    for row in SIL_PAIRS:
        listed.add(row[0]); listed.add(row[1])

    if listed != valid:
        problems.append(f'{view}: blob set mismatch. missing={sorted(valid - listed)} extra={sorted(listed - valid)}')

    def info(b):
        m = l2 == b
        ys, xs = np.where(m)
        return {'b': b, 'area': int(m.sum()), 'cx': xs.mean(), 'cy': ys.mean(), 'red': float(red[m].mean())}

    rows = []

    for row in TABLE:
        ba, bb, name, cat, group = row
        g = group or slug(name)
        pair = [ba] if bb is None else [ba, bb]
        infos = [info(b) for b in pair]
        if len(infos) == 2:
            dx = [abs(i['cx'] - mid) for i in infos]
            if abs(dx[0] - dx[1]) > 22:
                problems.append(f'{view} {name}: pair not mirrored, |dx| {dx[0]:.0f} vs {dx[1]:.0f}')
            if abs(infos[0]['cy'] - infos[1]['cy']) > 25:
                problems.append(f'{view} {name}: pair heights differ by {abs(infos[0]["cy"]-infos[1]["cy"]):.0f}px')
        redfrac = max(i['red'] for i in infos)
        if redfrac > 0.5 and cat not in WORKED:
            problems.append(f'{view} {name}: RED in the reference but category={cat} (source highlights {WORKED})')
        if redfrac < 0.5 and cat in WORKED and bb is not None:
            notes.append(f'{view} {name}: category={cat} but grey')
        for i in infos:
            side = ('right' if i['cx'] < mid else 'left') if view == 'front' else ('left' if i['cx'] < mid else 'right')
            rows.append({'blob': i['b'], 'id': f'{g}_{side}_{i["b"]}',
                         'name': f'{name} ({"L" if side=="left" else "R"})', 'category': cat, 'group': g,
                         'side': side, 'kind': 'muscle'})

    for b, name, cat, group, kind in CENTER:
        i = info(b)
        rows.append({'blob': b, 'id': f'{group}_center', 'name': name, 'category': cat, 'group': group,
                     'side': 'center', 'kind': kind})

    for b, parent_group in NESTED:
        i = info(b)
        side = ('right' if i['cx'] < mid else 'left') if view == 'front' else ('left' if i['cx'] < mid else 'right')
        # find the category already assigned to this group/side in rows so far
        cat = next((r['category'] for r in rows if r['group'] == parent_group and r['side'] == side), None)
        rows.append({'blob': b, 'id': f'{parent_group}_{side}_hl{b}', 'name': f'{parent_group} highlight',
                     'category': cat, 'group': parent_group, 'side': side, 'kind': 'muscle'})

    for row in SIL_PAIRS:
        ba, bb, name = row
        for b in (ba, bb):
            i = info(b)
            side = ('right' if i['cx'] < mid else 'left') if view == 'front' else ('left' if i['cx'] < mid else 'right')
            g = slug(name)
            rows.append({'blob': b, 'id': f'{g}_{side}_{b}', 'name': f'{name} ({"L" if side=="left" else "R"})',
                         'category': None, 'group': g, 'side': side, 'kind': 'silhouette'})

    out[view] = rows
    ids = [r['id'] for r in rows]
    if len(set(ids)) != len(ids):
        dupes = {x for x in ids if ids.count(x) > 1}
        problems.append(f'{view}: duplicate ids {dupes}')
    print(f'{view}: {len(rows)} shapes from {len(TABLE)+len(CENTER)+len(NESTED)+len(SIL_PAIRS)} table rows')

print('\n--- checks ---')
if problems:
    for p in problems:
        print('  !!', p)
else:
    print('  symmetry and red-highlight checks: all pass')
print('\n--- notes ---')
for nn_ in notes:
    print('  -', nn_)

json.dump(out, open(T + 'labels.json', 'w'), indent=1)
print('\nwrote', T + 'labels.json')
