# Tracing the body map artwork

`../traced-muscles.json` is a vectorisation of `reference.png`, the flat anatomical
muscle map the app's body view is drawn from. `../gen-body-muscles.mjs` turns that
into `src/data/bodyMuscles.ts` for both projects.

You only need to re-run this if the reference artwork changes.

## Why this works

`reference.png` is a flat vector render, not a photo — 9 colours cover 99% of its ink:

| colour | role | share of opaque px |
|---|---|---|
| `#333333` | separator ink, and the head/hands/feet | 43.9% |
| `#9E9E9E` | muscle | 42.2% |
| `#FE6D6C` | muscle, highlighted as a secondary mover | 6.3% |
| `#F14A3F` | muscle, highlighted as a primary mover | 3.1% |

So the dark ink is a closed separator network and each muscle is simply an enclosed
region. Connected-component labelling recovers the segmentation the illustrator drew —
we are reading boundaries, not guessing them.

## Pipeline

Requires Python with `numpy`, `scipy`, `pillow`, and node with `potrace`.

```
python analyze.py     # palette census; cache the ink / island masks into build/
python masks.py       # split the two figures; write each muscle island as a 1-bit mask
python sil.py         # separate head/hands/feet from the separator ink (see below)
python silmasks.py    # add those to the trace manifest
node   trace.mjs      # potrace every mask -> béziers, into a shared viewBox
python labels.py      # blob -> muscle name/category, with two machine checks
node   assemble.mjs   # join geometry + labels -> ../traced-muscles.json
node   ../gen-body-muscles.mjs
```

## The two non-obvious steps

**Silhouettes (`sil.py`).** The head, hands and feet are the same `#333333` as the
separator lines *and* connected to them, so the dark ink of each figure is one single
component — erosion and morphological reconstruction both fail. What separates them is
distance *from the muscle islands*: separator lines always hug an island, extremities do
not. Seeding at `distance-to-island > 12` yields exactly 10 blobs (2 heads, 4 hands,
4 feet) plus a few small thick spots in the network, which a 2000px area floor removes.
A watershed then grows each seed to its true edge. The barrier sits at
`distance-to-island <= 6`; at 3 the back head leaks down the spine channel, and the
result is stable across 5..10, so 6 is mid-plateau rather than on a cliff.

**Labels (`labels.py`).** The blob→muscle table was read off the reference by eye
(IoU transfer from the previous artwork was tried and abandoned — the poses differ so
much that limb muscles had zero overlap under any global alignment, and forcing an
assignment would have silently mis-categorised them). Two machine checks guard the
hand-written table:

1. *bilateral symmetry* — the two blobs of a pair must mirror about the midline, sit at
   the same height, and have areas within 35%;
2. *the artwork's own highlight* — the reference is a close neutral-grip lat pulldown, so
   every RED blob must belong to a category that exercise works. A red blob labelled
   `legs` or `chest` is a label bug. This check caught one: a small grey wedge at the
   lateral waist had been read as the lat's lower tip, but the lat above it is 100% red
   and the wedge is 0% — it is the flank (external oblique).

The reverse direction (grey blob in a worked category) is only a note, not an error: one
exercise need not work every muscle in a category, and the erectors and forearm extensors
genuinely are not worked here.

## Coordinate system

Both figures share ONE scale, taken from the union of the two figure bounding boxes, so
front and back are drawn at identical size. The taller figure fills the viewBox height;
each figure is centred horizontally in its own viewBox and both are top-aligned, as in
the reference. This gives `viewBox 0 0 129 288` — aspect 0.448, matching the reference's
~0.44. Coordinates are rounded to 2dp after transforming into viewBox units.
