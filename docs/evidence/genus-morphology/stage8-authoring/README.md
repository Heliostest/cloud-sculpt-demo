# Stage 8 authoring and preset evidence

Captured on 2026-08-08 with the real WebGPU renderer.

## GUI evidence

- `compact-genus-controls.png`: compact mode exposes only the controls relevant to the active genus.
- `advanced-eight-value-recipe.png`: advanced mode exposes all eight stored morphology values.

The UI also reports `Default recipe` / `Customized`, resets the current genus recipe, and offers explicit `Load new genus defaults` and `Preserve current values` switch behavior. Snapshot restoration notifies the GUI after the stored recipe has been restored, so controllers refresh without replacing custom values.

## Canonical genus validation presets

Append `&validation=1` to freeze time and hide the GUI for repeatable screenshots.

| Genus | Preset URL |
| --- | --- |
| Cumulus | `/?preset=side-cu` |
| Stratus | `/?preset=genus-stratus` |
| Stratocumulus | `/?preset=stratocumulus-sheet` |
| Cumulonimbus | `/?preset=oblique-cb` |
| Altocumulus | `/?preset=genus-altocumulus` |
| Altostratus | `/?preset=genus-altostratus` |
| Nimbostratus | `/?preset=genus-nimbostratus` |
| Cirrus | `/?preset=cirrus-oblique` |
| Cirrostratus | `/?preset=genus-cirrostratus` |
| Cirrocumulus | `/?preset=genus-cirrocumulus` |

All six newly added preset URLs reached `data-render-ready="true"` in WebGPU validation and produced no browser warning or error logs. Existing validation presets remain covered by the automated preset contract tests.

Preset morphology overrides, when needed, use `morphologyOverride: { values, note }`. The values are applied to the CloudBody recipe after canonical defaults; the required note records why the scene differs. Presets never write GPU offsets directly.
