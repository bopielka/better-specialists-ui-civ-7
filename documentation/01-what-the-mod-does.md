# 01 — What the mod does, and where each behaviour lives

A behaviour-by-behaviour map from what the player sees to the file that implements it. Use
this to find the code for a bug report or a feature request without reading the whole tree.

## The interface being modified

**Specialist placement** — the mode the player enters from a city's "place population"
action. Two separate surfaces, both the game's own, neither of them replaced:

| Surface | What it is | How this mod reaches it |
|---|---|---|
| `panel-place-population` | the side panel ("Choose a tile" / "Add specialist") | `Controls.decorate` — old UI framework |
| `fxs-worker-yields-layer` | the yield pills drawn on map tiles | method replacement on the instance in `LensManager.layers` |

⚠️ Nothing here is a Solid.js `ui-next` screen, unlike the Commerce screen in the sibling
mod. Both hooks used here are the *old* framework's. See [Platform notes](03-platform-notes.md).

## The core idea, in one worked example

A city has five urban tiles that can take a specialist. Each would give `+3 production`,
`+2 gold` and cost `-4 food`; one of them also gives `+5 science`.

| | The game shows | This mod shows |
|---|---|---|
| Panel | nothing shared | **Common:** `+3 production`, `+2 gold`, `-4 food` |
| Ordinary tile | `+3 +2 -4` | *(nothing — it is exactly the common case)* |
| Science tile | `+3 +2 -4 +5` | `+5` |

The "common" value is **the value closest to zero, sign kept**, and it is `0` the moment any
specialist tile disagrees about the sign or produces none of that yield at all. Precise
rules in [the baseline model](04-baseline-model.md).

## Behaviours

| Behaviour | File |
|---|---|
| Deciding what the common value is | `ui/model-specialists-yield-baseline.js` |
| The "Common Specialists Yields" panel, in **both** panel states | `ui/panel-place-population-decorator.js` |
| Per-tile pills reduced to the deviation | `ui/worker-yields-layer-patch.js` |
| Rural / population-expansion tiles left completely alone | `ui/model-specialists-yield-baseline.js` (`isSpecialistPlot`) |
| Blocked tiles drawn with pips but no pills | `ui/worker-yields-layer-patch.js` |
| Hold **Tab** → the game's untouched display | `ui/modifier-tracker.js` + `ui/view-mode.js` |
| That key being rebindable in Options → Key Bindings | `config/input.xml` + `ui/options/editors/najane-editor-keyboard-mapping.js` |
| The on-screen hint naming whatever key is actually bound | `ui/modifier-tracker.js` (`getAlternativeViewKeyLabel`) |
| Negative pills shown only on the hovered tile | `ui/worker-yields-layer-patch.js` |
| Showing only the best tile(s) for a chosen yield | `ui/model-specialists-yield-baseline.js` (`getHighestYieldPlots`) + `ui/worker-yields-layer-patch.js` |
| Redrawing when the key, an option or the hover changes | `ui/worker-yields-layer-patch.js` (`redrawLayer`, `redrawPlot`) |
| Six settings under Options → Mods | `ui/options/najane-options.js` |
| City Hall's building-slot icons surviving the patch | `ui/worker-yields-layer-patch.js` (`drawCompanionExtras`) |

## The panel appears twice, deliberately

The game swaps between two frames inside `panel-place-population`, and a section added to
one is invisible in the other:

| Frame | Shown when | Where the section goes |
|---|---|---|
| `subsystemFrame` — "Choose a tile" | nothing is hovered | appended at the **bottom**, with the other explanatory blocks |
| `placeSpecialistFrame` — "Add specialist" | hovering a valid tile | inserted at the **top**, above BEFORE/AFTER |

⚠️ A section put in `subsystemFrame` alone is invisible in exactly the state the player
cares about — the game hides that frame while a specialist is being placed. See
[the panel](06-panel.md).

## Options under **Options → Mods**

All six are checkboxes, all default **off**, and all affect **presentation only** — never
the baseline the panel reports.

| Setting | Off (default) | On |
|---|---|---|
| Always show negative yields | negatives only on the hovered tile | negatives on every tile |
| Show original yields by default | the mod's difference view is the default | the game's view is the default; the key reveals the mod's |
| Do not aggregate negative yields | costs are folded into the common value | costs stay on every tile in full |
| Do not aggregate positive yields | gains are folded into the common value | gains stay on every tile in full |
| Show only yields with a common value | the panel lists every yield | the panel lists only yields specialists touch |
| Show everything on hover | the hovered tile shows deviations | the hovered tile shows its own full figures, one pill per yield |

Plus **seven** more — one per yield — under the same group:

| Setting | On |
|---|---|
| Show only tiles giving the most Food / Production / Gold / Science / Culture / Happiness / Influence | only the tile(s) where a specialist would give the most of that yield keep their numbers |

⚠️ **These do not exclude one another.** Any number may be on at once, and the results
**union**: a tile is shown if it wins *any* enabled yield. Ties are all shown, and the tile
under the cursor always keeps its numbers. See [the map layer](07-map-layer.md).

The two "do not aggregate" boxes are exact mirrors of each other. Both are applied **in the
layer**, not in the model, so the panel keeps listing the full common values either way —
see [the baseline model](04-baseline-model.md).

## What the mod deliberately does *not* do

- **No game rules, values or balance are changed**; `AffectsSavedGames = 0`, and nothing is
  written into the save file. Settings go through `UI.setOption`.
- **Rural tiles are not touched.** Placing there is a population expansion, not a
  specialist: it creates an improvement and yields the tile's own output, which must not be
  folded into a specialist baseline. They keep their original display in every view.
- **The game's own files are never overwritten.** The layer's method is replaced on the
  registered *instance*, which leaves other mods patching the same file alive.
- **No `*Maintenance` line is filled in.** The game omits "Specialist maintenance" on a tile
  that already holds one; an attempt to reconstruct it produced roughly double the real
  figures and was reverted. See [known gaps](11-known-gaps.md).
