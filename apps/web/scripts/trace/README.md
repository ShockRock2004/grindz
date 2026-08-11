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

## The female variant

`reference-female.png` is a different kind of source and gets a different first stage.
The user-supplied photo had three poses (front/side/back); the side view was cropped out
and the remaining two were composed onto one canvas, downscaled to match this pipeline's
pixel-scale calibration (~950-990px figure height — the constants in `sil.py`'s watershed
were tuned at that scale). It is also a soft-shaded raster (JPEG), not a flat vector, so
`analyze.py`'s `lum > 90` split does not apply: there is no clean valley in the luminance
histogram at any threshold, because the artwork's own airbrushed shading and its ink
strokes occupy overlapping bands. `analyze-female.py` / `masks-female.py` split them by
gradient magnitude instead (blur sigma 1.2, threshold 60, then a 1px morphological close)
— thresholding *how fast* luminance changes, not its absolute value, reproduces the
illustrator's line art almost exactly. That also means every enclosed region — muscle
belly or extremity — is already its own connected component, so the female path skips
`sil.py`/`silmasks.py` (the male source's solid dark ink fuses head/hands/feet into the
separator network, which is what that watershed is for; here they are just more enclosed
shapes).

`labels-female.py` replaces `labels.py`'s table for the female geometry, hand-read the
same way, with the same two checks (bilateral symmetry, red-implies-worked-category).
The source art does not sub-divide the arm into biceps/triceps/forearm the way the male
reference does — front arm mass reads as biceps, back arm mass as triceps (the
visible-muscle convention most muscle-map apps use), and the forearm+hand blob (no wrist
crease was drawn, so it traced as one shape) is left untrainable (`kind: 'silhouette'`)
rather than mislabelled as a specific forearm muscle. A few interior highlight patches
trace as their own enclosed blob nested inside a bigger one (the glute's inner highlight,
the calf's shin highlight); those get the same `group` as their parent so they always
paint together, rather than a name of their own.

Every script in this directory that touches a reference image takes `TRACE_REF`,
`TRACE_BUILD` and `TRACE_ISLAND_LUM` as env vars (analyze.py/masks.py), or `TRACE_BUILD`
alone (sil.py/silmasks.py/trace.mjs), so the male pipeline is unaffected by default —
the female run just points them at `reference-female.png` / `build-female/`. Pipeline:

```
python analyze-female.py                              # census + island split (edge-based)
python masks-female.py                                 # write each region as a 1-bit mask
TRACE_BUILD=build-female node trace.mjs                 # potrace -> shared viewBox
python labels-female.py                                 # blob -> muscle name/category
TRACE_BUILD=build-female TRACE_OUT=traced-muscles-female.json \
  TRACE_SOURCE_NAME=reference-female.png node assemble.mjs
cd .. && TRACE_SRC_JSON=traced-muscles-female.json \
  TRACE_OUT_NAME=bodyMusclesFemale.ts node gen-body-muscles.mjs
```

Known gaps, from the source art rather than the pipeline: a couple of back-view regions
(glute/lower-erector, external-oblique/hip) merge where the source's separating line was
too faint for the edge threshold to catch, so they're labelled by whichever muscle
dominates the shape rather than split; there's a small blemish near the back-right knee
left over from the source photo's own watermark removal.
