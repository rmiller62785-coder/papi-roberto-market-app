# PSA × Luna Sol — the 14-million-card recovery

A single-file, self-contained case study page. `psa-luna-sol.html` is the deliverable;
everything else here builds or feeds it.

```
case-studies/
  psa-luna-sol.html     the built page — open it directly, host it anywhere
  build.py              assembles the page from src/
  embed-photo.sh        inlines the HQ photograph as a data URI
  src/style.css         tokens, layout, components
  src/body.html         structure and copy
  src/engine.js         data model, figures, page behaviour
  assets/               drop psa-hq-2026-06-30.jpg here
```

Edit anything under `src/`, then `python3 case-studies/build.py`.

## The photograph

The page reserves a slot for the photograph taken at PSA on 30 June 2026. Drop the file in
and inline it, so the page stays self-contained:

```
cp <your-photo>.jpg case-studies/assets/psa-hq-2026-06-30.jpg
./case-studies/embed-photo.sh
```

Until then the slot renders a labelled placeholder rather than a broken image. Re-running
`build.py` resets the `src` to the relative path, so embed after building.

## Rules the page holds itself to

**Provenance is drawn, not footnoted.** Solid marks are reported figures; 45° hatch is
arithmetic on reported figures, with the calculation printed beside it; a dotted empty slot
is data that was never published, labelled with the reason. There is exactly one repeating
pattern on the page and it carries that meaning.

**No flattering axes.** The backlog chart is zero-based. The mid-June peak carries a
horizontal uncertainty bar because PSA never published the peak date.

**Bounds keep their direction.** July output is reported as "more than 10% above June", so
it is a floor: it appears as `≥2.75M` with an open-topped bar, and every quantity derived
from it inherits the bound — months of cover is a ceiling (`≤4.31`), not a value.

**Colour.** The data slots (`#D2602B` intake, `#4E9BD4` output) pass all six checks of the
dataviz validator in dark mode against the `#111410` panel — worst adjacent pair ΔE 22.5
deuteranopia, 27.2 normal vision. Brand lime `#B8E34D` is a UI accent and the single-series
queue hue; PSA red is used once, on the client chip, and never as a data colour.

**Accessibility.** Every rendered text/background pair meets WCAG 2.2 AA against its composited
background. Each figure is mirrored by a screen-reader table; the backlog chart is keyboard
operable (arrows, Home/End, Escape). All motion is neutralised under `prefers-reduced-motion`,
and the stat tiles ship their real values in the markup so nothing paints a placeholder zero.

## Two things a reviewer should decide

1. **The unreconciled June window** (section 02) publishes the fact that the mid-June →
   30 June readings do not close on grading alone: the queue fell 2.00M while about 1.17M was
   graded, implying negative arrivals. It is framed as evidence for the measurement work, not
   as criticism of the client — but it is a public observation about a client's published
   series, so it is a commercial call, not a technical one.
2. **The bibliography** (sources 1–9) is carried over verbatim from the v7 draft. The URLs,
   publishers and dates were not independently verified during this build.
