# Stage 7 special-path evidence

Captured on 2026-08-08 with the real WebGPU renderer and the `top-density` validation preset.

## Cumulonimbus

- `canonical-volume-cb-density.png`: bounded canonical `volume` body using the Cb genus evaluator.
- `local-volume-cb-density.png`: bounded `local-volume` hero body using the same Cb evaluator and recipe semantics.

The two images are expected to preserve the same macro density language. The local path remains an axis-aligned hero optimization, so this is semantic equivalence rather than pixel identity.

## Altocumulus and altostratus

- `canonical-volume-ac-density.png`: bounded canonical `volume` body using the Ac genus evaluator.
- `high-sheet-ac-density.png`: unbounded `high-sheet` Ac performance path.
- `high-sheet-as-density.png`: unbounded `high-sheet` As performance path.

The high-sheet path keeps its dedicated 2D texture and optical approximation while consuming the shared Ac/As cell, sheet, vertical-development, and erosion controls. Fiber angle/strength and anvil strength are intentionally ignored on this path.

## Reproduction URLs

- Canonical Cb: `/?preset=top-density&genus0=cumulonimbus&genusDefaults0=1&bounded0=1&bodyDensity0=0.8&validation=1`
- Local Cb: `/?preset=top-density&local=1&enabled0=0&validation=1`
- Canonical Ac: `/?preset=top-density&genus0=altocumulus&genusDefaults0=1&bounded0=1&bodyDensity0=0.28&validation=1`
- High Ac: `/?preset=top-density&high=1&highGenus=altocumulus&enabled0=0&debug=HighDensity&validation=1`
- High As: `/?preset=top-density&high=1&highGenus=altostratus&enabled0=0&debug=HighDensity&validation=1`
