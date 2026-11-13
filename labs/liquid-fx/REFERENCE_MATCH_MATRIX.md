# User reference-to-demo matrix · FX Arsenal 0.2

| User material | What can be determined from it | Implemented match | Faithfulness status |
|---|---|---|---|
| Screenshot 01 · white 6-icon toolbar, cobalt screen | Flat white rounded surface, dark line icons, centered layout | `elastic-border`: centered 6-icon bright pill with actual editable SVG border deformation | Stronger *appearance* match; motion is newly designed to user spec, not reverse engineered |
| Screenshot 02 · white arrow on navy square, cyan screen | Dark square icon tile; white down arrow | `download`: square idle state, progress/circle morph, simulated completion | Visual idle state closer; transition was inferred |
| Screenshot 03/04 · AM/PM blue toggle | Blue background, dark pill, oversized white circular thumb | `switch`: look and continuous spring drag | Closely styled; exact timing/curve not available from still screenshots |
| Screenshot 05 · two white droplets on teal | Metaballs-like white circles | `metaballs`: white circles + teal background, SVG fusion | Visual color match; original animation not available from screenshot |
| Screenshot 06 · 4 offset colorful cards | Overlapping stacked rectangular navigation cards | `stack`: swipe and reorder layout | Structural match, animation is approximation |
| Buttons.cool Gooey SVG Filter Button, Codrops 2015 Creative Gooey | Goo filtering / shapes merging | `gooey`, `magnetic`, `elastic-border` | Algorithmically original implementations |
| User wheel-border touch video (`xBE16_Unk6E`) | Video URL labeled CSS Liquid Effects; intended effect is finger-reactive rim | `wheel` + `elastic-border` | Based on stated behavior, not claiming frame-by-frame recreation |
| Codrops Gooey Search | Button/search field liquid expansion | `search` | Original analogous behavior, not source recreation |
| kube.io CSS/SVG Liquid Glass | Optical refraction, displacement + specular lighting, Chrome-specific limitations | `glass`: improved CSS shine and tilt, no true refraction | **Not matched yet**: needs standalone refraction addon |
| User magnetic feel link | Directional attraction, pull and release | `magnetic` | Touch-first spring-field interpretation |
| Pinterest/Dribbble/Codrops WebGPU/Three.js collection | Numerous inspiration formats including 3D/glass, complex page transitions, interactive grids | Stored in `references/fx-reference-catalog.json` | **Backlog** — not implemented by v0.2 |

Do not report the full 42-source inspiration list as 42 completed effects. Expand it using a source/technique/interaction/quality ledger and opt into external source inspection before replication.

## v0.3 optical lens correction

The row describing the lack of true refraction is **superseded by v0.3**. The `glass` addon now runs an actual, Chrome-oriented SVG RGB displacement-map lens through CSS `backdrop-filter` (user's explicit example) and includes the reference generator's 5 named controls, Reset, preview-background selection, Copy CSS and Copy SVG. This is a close implementation of its *core technique*, not a copy of its actual photo assets or its site layout. Safari/Firefox support remains a frosted fallback; real device testing is pending.