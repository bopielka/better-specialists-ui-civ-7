# Snapshot: game build `25245002` (Steam `appmanifest_1295660.acf`, captured 2026-09-20)

12 original game `.js` files, copied 1:1 from
`C:\Program Files (x86)\Steam\steamapps\common\Sid Meier's Civilization VII\Base\modules\...`,
mirroring that same relative path under `core/` and `base-standard/` below. These are **every
file this mod's `ui/` code imports from the game**, plus two it reaches without importing (see
[`../README.md`](../README.md)).

Below, **⚠️ DECORATED / PATCHED** marks a file whose game component this mod overrides or wraps
by name or by a runtime instance lookup; everything else is a read-only dependency.

## `base-standard/ui/place-population/` — the specialist placement panel

The panel this mod's whole "Common Yields" feature is built around: `panel-place-population`,
shown when placing a specialist.

| File | What it is in the game | How this mod uses it |
|---|---|---|
| `panel-place-population.js` | The old-framework custom element `panel-place-population` — the side panel shown while placing a specialist. | **⚠️ DECORATED, not imported.** `Controls.decorate("panel-place-population", ...)` is called from [`ui/panel-place-population-decorator.js`](../../ui/panel-place-population-decorator.js) (adds the "Common Yields" section stating what any specialist here gives/costs) and [`ui/panel-expanded-default.js`](../../ui/panel-expanded-default.js) (opens the panel with yield details pre-expanded, by delegating to the game's own `toggleMinMax` rather than touching `showExpandedView` directly). Captured here without an import because decoration works by tag name — a patch to this file is exactly what would break both decorators. |
| `model-place-population.js` | The panel's data model: `PlacePopulation`, and the `PlacePopulationSelectionChangedEventName` event. | Read-only. `PlacePopulationSelectionChangedEventName` is imported by `panel-place-population-decorator.js` to know when to recompute; `PlacePopulation` is imported by `panel-expanded-default.js` to read/drive the expanded-view state. |

## `base-standard/ui/plot-workers/`

| File | What it is in the game | How this mod uses it |
|---|---|---|
| `plot-workers-manager.js` | `PlotWorkersManager` — tracks which tiles are worked, `cityWorkerCap`, and fires `PlotWorkersUpdatedEventName` / `PlotWorkersHoveredPlotChangedEventName`. | **Read-only — deliberately not patched.** [`ui/model-specialists-yield-baseline.js`](../../ui/model-specialists-yield-baseline.js), `panel-place-population-decorator.js` and `ui/worker-yields-layer-patch.js` all read `workablePlots`/`cityWorkerCap` and the two events to compute this mod's own baseline and to know when to invalidate their caches. City Hall *does* replace `PlotWorkersManager.update()` (documented in the sibling `better-city-ui` compatibility notes); this mod avoids touching the same method precisely so both can run together. |

## `base-standard/ui/yield-bar-base/`

| File | What it is in the game | How this mod uses it |
|---|---|---|
| `yield-bar-base.js` | The old-framework yield-bar component; exports `YieldBarEntryStyle`. | Read-only. Used by `panel-place-population-decorator.js` to render the "Common Yields" section's rows in the same visual style as the game's own yield bars. |

## `base-standard/ui/lenses/layer/`

| File | What it is in the game | How this mod uses it |
|---|---|---|
| `worker-yields-layer.js` | `fxs-worker-yields-layer` — the map lens layer that draws per-tile specialist yield pips; its instance is held in `LensManager.layers`. | **⚠️ PATCHED, not imported.** `ui/worker-yields-layer-patch.js` finds the live layer instance through `LensManager` and replaces `updateSpecialistPlot` **on that one object**, never on the class or the game's file — the file's own header explains why: "so other mods patching the same method survive". ⚠️ The replacement does **not** call through to the original for specialist tiles (it re-implements the pip drawing to show only the deviation from the baseline), which is why `drawCompanionExtras()` exists — to manually re-run the one thing City Hall's own wrapper of this same method would otherwise have added (its building-slot icons). See rule 2 in [`CLAUDE.md`](../../CLAUDE.md). |

## `core/ui/interface-modes/`, `core/ui/input/`, `core/ui/lenses/`

| File | What it is in the game | How this mod uses it |
|---|---|---|
| `interface-modes.js` | `InterfaceMode`, `InterfaceModeChangedEventName`. | Read-only. Used by `ui/modifier-tracker.js`, `ui/model-specialists-yield-baseline.js`, `ui/panel-place-population-decorator.js`, `ui/panel-expanded-default.js` and `ui/worker-yields-layer-patch.js` — nearly every module invalidates its cache or changes behaviour on an interface-mode change. |
| `input-support.js` | `InputEngineEventName`. | Read-only. Used by `ui/modifier-tracker.js` to detect the mod's rebindable "alternative view" key (`ALTERNATIVE_VIEW_ACTION`, Tab by default) as a real input action rather than a raw DOM `shiftKey`, specifically to avoid colliding with other mods that also react to Shift — see that file's header and [`documentation/05-input-and-view-mode.md`](../../documentation/05-input-and-view-mode.md). |
| `lens-manager.js` | `LensManager` — registers/activates map lenses and holds their live instances in `LensManager.layers`. | Used by `ui/worker-yields-layer-patch.js` to locate the `fxs-worker-yields-layer` instance to patch (see above) — this is the registry lookup the whole mechanism depends on. |

## `core/ui/options/`

| File | What it is in the game | How this mod uses it |
|---|---|---|
| `model-options.js` | `Options`, `CategoryType`, `OptionType` — the options screen's data model. | Read-only. Used by [`ui/options/najane-options.js`](../../ui/options/najane-options.js) to register this mod's settings in the shared "Mods" tab — same pattern and same shared registry file as the sibling mods. This module also loads in **SHELL scope**. |
| `options-helpers.js` | `CategoryData` — per-category metadata. | Read-only. Used to create the shared "Mods" category the first time any Najane mod runs. |
| `screen-options.js` | Side-effect module that initializes the options screen's registry. | Imported for its side effect only, and must load before `model-options.js` is touched — see the comment at the top of `najane-options.js`. |
| `editors/editor-keyboard-mapping.js` | The old-framework custom element `editor-keyboard-mapping` — the keyboard remapping screen. Walks a hardcoded list of the game's own input actions to decide what to show. | **⚠️ DECORATED, not imported.** `Controls.decorate('editor-keyboard-mapping', ...)` is called from [`ui/options/editors/najane-editor-keyboard-mapping.js`](../../ui/options/editors/najane-editor-keyboard-mapping.js), which wraps `addActionsForContext` (guarded, patched once — same one-time-guard pattern as `better-city-ui`) to append the mod's own `najane-alternative-view` action, because declaring it in `config/input.xml` alone is not enough for it to appear in this screen. ⚠️ This decorator also runs in **SHELL scope**, so the action name is spelled out as a literal rather than imported from `ui/modifier-tracker.js` — see the note in that file and in `CLAUDE.md`. |

## Further reading

- [`CLAUDE.md`](../../CLAUDE.md) — the repo-folder-vs-mod-id trap, the architecture (panel and
  layer never import each other), and rule 2 on what replacing `updateSpecialistPlot` drops.
- [`documentation/07-map-layer.md`](../../documentation/07-map-layer.md) — the full mechanism
  behind `worker-yields-layer-patch.js`.
- [`documentation/06-panel.md`](../../documentation/06-panel.md) — `panel-place-population-decorator.js`
  and `panel-expanded-default.js` in detail.
- [`documentation/05-input-and-view-mode.md`](../../documentation/05-input-and-view-mode.md) —
  why the "alternative view" key is a real input action, not `event.shiftKey`.
- `better-city-ui/documentation/05-compatibility.md` — City Hall's and this mod's overlapping
  patches on `PlotWorkersManager` and `fxs-worker-yields-layer`, from the sibling mod's side.
