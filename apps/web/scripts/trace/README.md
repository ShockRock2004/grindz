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

`reference-female.png` has gone through two different sources. The first was a
soft-shaded photo, traced with an edge-detection hack and then patched up with
geometry grafted in from the male dataset (thighs, traps, forearms) where the photo
was too thin on detail -- see git history around commit `913e6e9` if that pipeline is
ever needed again. It was replaced with a flat vector illustration (front + back only,
no side view to crop), which traces far more directly and needs no grafting at all.
This section describes the *current* (vector) pipeline only.

**Palette is inverted from the male source.** `reference.png`'s muscle fill is the
*lighter* of its two greys, with dark carrying the separator network, body and
extremities. `reference-female.png` is the opposite: muscle fill is the *darker* grey
(`lum < 130`), and light is the separator/body/extremity layer. `analyze-female.py` /
`masks-female.py` are otherwise the same method as `analyze.py`/`masks.py` -- palette
census, connected-component split into two figures, island = enclosed regions of the
muscle-toned grey -- just with the inequality flipped.

**Hair breaks the male pipeline's head-extraction watershed.** `sil.py` finds
head/hands/feet by seeding on light-layer pixels that are far (`distance > 12px`) from
any island, then watershedding out to the separator network. This source's hair is
drawn in the *muscle* tone, sitting directly against the face -- so the face is never
far from island-toned pixels, and the seed never fires. `sil-female.py` fixes this by
excluding the largest island blob in the top 15% of the figure (i.e. hair, unambiguously
the biggest thing up there) from the distance calculation used for seeding only; hair
itself still traces normally as an island afterward, just labelled `kind: 'silhouette'`
downstream so it renders in the body tone rather than the muscle-grey tone. Hands and
feet are NOT extracted this way -- forearm/calf muscle detail sits close enough to them
on this source that the same seed test rarely fires, and it isn't needed: `body` (the
whole figure's ink footprint) already covers their pixels with the right shape, and
BodyView renders every silhouette path inside one `<g opacity=...>` (see BodyMap.tsx),
so an unextracted hand sitting inside `body`'s path looks identical to a separately
traced one -- the group composites once, not per path, so there is no double-opacity
risk either way.

**Labelling is major-shape + auto-fold, not fully hand-enumerated.** This source has far
more linework than either predecessor (154 island blobs across both views, most of it
joint-crease and tendon detail rather than distinct muscles), so `labels-female.py`
hand-names only shapes >= `MAJOR_MIN` (550px²) and auto-folds everything smaller into
its nearest same-side named neighbour by raw centroid distance, inheriting that
neighbour's group and category. This is a heuristic, not a guarantee: it got one back-arm
sliver wrong on the first pass (folded into `external_oblique` by centroid distance when
it visually sits on the triceps, at the arm/armpit junction) before being caught by
clicking through every category live and visually auditing where the highlight landed --
see `audit_folds.py`-style rendering (blob positions + assigned group name overlaid on
the reference image) if you need to re-check this after a re-run. A few shapes close to
a real anatomical boundary (e.g. joint-crease detail between adductors and the knee) are
explicitly listed rather than left to auto-fold, because they sit almost equidistant
between two plausible parents and the "wrong" pick would still be visually defensible,
just not the one intended.

Every script in this directory that touches a reference image takes `TRACE_REF` and
`TRACE_BUILD` as env vars, so the male pipeline is unaffected by default -- the female
run just points them at `reference-female.png` / `build-female/`. Pipeline:

```
python analyze-female.py                               # census + island split (flat threshold)
python masks-female.py                                  # write body + head + every island as a 1-bit mask
TRACE_BUILD=build-female node trace.mjs                  # potrace -> shared viewBox
python sil-female.py                                     # head only, hair excluded from seeding (see above)
python labels-female.py                                  # major-shape table + auto-fold, two checks
TRACE_BUILD=build-female TRACE_OUT=traced-muscles-female.json \
  TRACE_SOURCE_NAME=reference-female.png node assemble.mjs
cd .. && TRACE_SRC_JSON=traced-muscles-female.json \
  TRACE_OUT_NAME=bodyMusclesFemale.ts node gen-body-muscles.mjs
```

(`sil-female.py` actually needs to run before `masks-female.py`, since the latter reads
`sil.npy`/`sil.json` to place `head`; the order above groups steps by what they explain,
not strict execution order -- check the actual dependency by reading each script's inputs
if reordering.)

**Category convention matches the male dataset exactly where the muscle sets overlap**:
`trapezius_upper` is `shoulders`, `trapezius_middle_lower`/lats/erectors are `back`,
every forearm muscle is `biceps` regardless of front or back view. Verify this after any
re-run by clicking through all seven category chips in the dev preview (see
`src/pages/DevBodyMapPreview.tsx`) and confirming the highlighted region matches the
category by eye -- a `category: null` or a mis-folded blob will not fail validation
(both are structurally valid `BodyMuscle` rows) and only shows up as a visual bug.
