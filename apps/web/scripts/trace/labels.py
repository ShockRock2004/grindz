"""The blob -> muscle table, read off the reference by eye, then machine-checked.

Two independent checks run against it:
  1. bilateral symmetry — the two blobs of a pair must mirror about the figure midline
     and sit at the same height, with similar area;
  2. the reference's own highlight — this render is a close neutral-grip lat pulldown,
     so every RED blob must be a lat / trap / teres / forearm-or-biceps, and no blob
     that is grey may be one. That is a free label test the artwork ships with.
"""
import json
import numpy as np
from PIL import Image
from scipy import ndimage

import os
_HERE = os.path.dirname(os.path.abspath(__file__))
T = os.path.join(_HERE, 'build') + os.sep
os.makedirs(T, exist_ok=True)
REF = os.path.join(_HERE, 'reference.png')

# (blob_a, blob_b, name, category)  — a/b order is irrelevant, side is derived from x
FRONT = [
    (1, 2, 'Sternocleidomastoid', None),
    (3, 4, 'Trapezius (Upper)', 'back'),
    (5, 6, 'Anterior Deltoid', 'shoulders'),
    (8, 10, 'Lateral Deltoid', 'shoulders'),
    (11, 12, 'Pectoralis Major', 'chest'),
    (13, 14, 'Biceps Brachii', 'biceps'),
    (15, 16, 'Triceps (Lateral Head)', 'triceps'),
    (17, 18, 'Rectus Abdominis (Upper)', 'abs'),
    (19, 20, 'Serratus Anterior', 'abs'),
    (21, 22, 'Rectus Abdominis (Middle)', 'abs'),
    (23, 25, 'Wrist Flexors', 'biceps'),
    (26, 27, 'Rectus Abdominis (Lower)', 'abs'),
    (28, 29, 'Brachioradialis', 'biceps'),
    (30, 31, 'External Oblique', 'abs'),
    (32, 33, 'Tensor Fasciae Latae', 'legs'),
    (34, 35, 'Rectus Femoris', 'legs'),
    (36, 37, 'Pectineus', 'legs'),
    (38, 40, 'Sartorius', 'legs'),
    (41, 42, 'Vastus Lateralis', 'legs'),
    (43, 45, 'Vastus Medialis', 'legs'),
    (47, 48, 'Gastrocnemius', 'legs'),
    (49, 50, 'Tibialis Anterior', 'legs'),
]
BACK = [
    (1, 2, 'Splenius', None),
    (3, 4, 'Trapezius (Middle & Lower)', 'back'),
    (5, 6, 'Posterior Deltoid', 'shoulders'),
    (7, 8, 'Trapezius (Upper)', 'back'),
    (11, 12, 'Infraspinatus & Teres Major', 'back'),
    (13, 14, 'Triceps Brachii', 'triceps'),
    (15, 16, 'Latissimus Dorsi', 'back'),
    (17, 18, 'Extensor Carpi Ulnaris', 'biceps'),
    (19, 20, 'Brachioradialis', 'biceps'),
    (21, 22, 'Erector Spinae', 'back'),
    # grey in the reference while the lat above it is 100% red, so this is the flank
    # (external oblique, posterior fibres), not the lat's lower tip
    (23, 24, 'External Oblique', 'abs'),
    (25, 26, 'Gluteus Maximus', 'legs'),
    (29, 30, 'Biceps Femoris', 'legs'),
    (31, 32, 'Vastus Lateralis', 'legs'),
    (33, 34, 'Semitendinosus', 'legs'),
    (37, 38, 'Gastrocnemius (Lateral)', 'legs'),
    (39, 40, 'Gastrocnemius (Medial)', 'legs'),
    (42, 43, 'Soleus', 'legs'),
]
TABLE = {'front': FRONT, 'back': BACK}

# categories a lat pulldown actually works -> the red blobs must land here
WORKED = {'back', 'biceps'}

def slug(s):
    return (s.lower().replace(' & ', '_').replace('(', '').replace(')', '')
            .replace(' ', '_').replace('-', '_'))

im = Image.open(REF).convert('RGBA')
a = np.array(im).astype(int)
R, G, B, A = a[:, :, 0], a[:, :, 1], a[:, :, 2], a[:, :, 3]
lum = 0.299 * R + 0.587 * G + 0.114 * B
ink = A > 128
island = ink & (lum > 90)
red = ink & (R > 150) & (G < 150)

meta = json.load(open(T + 'meta.json'))
lab_ink, n = ndimage.label(ink)
s_ink = ndimage.sum(ink, lab_ink, range(1, n + 1))
two = sorted((np.argsort(-s_ink)[:2] + 1), key=lambda i: ndimage.center_of_mass(ink, lab_ink, i)[1])

problems = []
notes = []
out = {}
for view, comp in zip(['front', 'back'], two):
    fm = lab_ink == comp
    x0, y0, x1, y1 = meta['figures'][view]['bbox']
    mid = (x0 + x1) / 2
    l2, n2 = ndimage.label(island & fm)
    s2 = ndimage.sum(island & fm, l2, range(1, n2 + 1))
    valid = {j for j in range(1, n2 + 1) if s2[j - 1] >= 40}

    listed = [b for p in TABLE[view] for b in p[:2]]
    if sorted(listed) != sorted(valid):
        problems.append(f'{view}: blob set mismatch. missing={sorted(valid - set(listed))} extra={sorted(set(listed) - valid)}')

    rows = []
    for ba, bb, name, cat in TABLE[view]:
        info = []
        for b in (ba, bb):
            m = l2 == b
            ys, xs = np.where(m)
            info.append({'b': b, 'area': int(m.sum()), 'cx': xs.mean(), 'cy': ys.mean(),
                         'red': float(red[m].mean())})
        # --- check 1: bilateral symmetry
        dx = [abs(i['cx'] - mid) for i in info]
        if abs(dx[0] - dx[1]) > 14:
            problems.append(f'{view} {name}: pair not mirrored, |dx| {dx[0]:.0f} vs {dx[1]:.0f}')
        if abs(info[0]['cy'] - info[1]['cy']) > 14:
            problems.append(f'{view} {name}: pair heights differ by {abs(info[0]["cy"]-info[1]["cy"]):.0f}px')
        ar = sorted(i['area'] for i in info)
        if ar[1] > ar[0] * 1.35:
            problems.append(f'{view} {name}: pair areas differ {ar[0]} vs {ar[1]}')
        # --- check 2: the reference's own highlight
        redfrac = max(i['red'] for i in info)
        # Strong direction: anything the illustrator painted red MUST be a muscle a
        # pulldown works. A violation means the label is wrong.
        if redfrac > 0.5 and cat not in WORKED:
            problems.append(f'{view} {name}: RED in the reference but category={cat} (pulldown works {WORKED})')
        # Weak direction: only a note. One exercise need not work every muscle in a
        # category (erectors and forearm extensors are genuinely not worked here).
        if redfrac < 0.5 and cat in WORKED:
            notes.append(f'{view} {name}: category={cat} but grey — not worked by this particular exercise')
        for i in info:
            imgleft = i['cx'] < mid
            side = ('right' if imgleft else 'left') if view == 'front' else ('left' if imgleft else 'right')
            rows.append({'blob': i['b'], 'id': f'{slug(name)}_{side}', 'name': f'{name} ({"L" if side=="left" else "R"})',
                         'category': cat, 'group': slug(name), 'side': side, 'kind': 'muscle',
                         'area': i['area'], 'red': round(i['red'], 2)})
    out[view] = rows
    print(f'{view}: {len(rows)} muscle shapes from {len(TABLE[view])} pairs')

print('\n--- checks ---')
if problems:
    for p in problems:
        print('  !!', p)
else:
    print('  symmetry and red-highlight checks: all pass')
print('\n--- notes (not errors) ---')
for nn_ in notes:
    print('  -', nn_)

json.dump(out, open(T + 'labels.json', 'w'), indent=1)
