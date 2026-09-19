# Game file snapshots

Same idea and rules as the sibling mods' `game-files-snapshots/`
(`better-commerce-screen-ui`, `better-specialists-ui` i.e. this mod's own display name —
see [`CLAUDE.md`](../CLAUDE.md) for the repo-folder-vs-mod-id trap, `better-city-ui`). This mod
("Better Specialists UI by Najane", deployed as `najane-common-specialists-yields`) never
shadows a file on disk either. It uses three distinct mechanisms to reach into the game, and each
is a reason a file belongs in this snapshot:

| Mechanism | What it does | Example in this mod |
|---|---|---|
| `Controls.decorate(name, c => new YourDecorator(c))` (+ a guarded prototype patch) | old-framework custom element, wraps the live instance | `panel-place-population` — [`ui/panel-place-population-decorator.js`](../ui/panel-place-population-decorator.js), [`ui/panel-expanded-default.js`](../ui/panel-expanded-default.js); `editor-keyboard-mapping` — [`ui/options/editors/najane-editor-keyboard-mapping.js`](../ui/options/editors/najane-editor-keyboard-mapping.js) |
| Patch a method on the **live singleton instance**, found through a registry lookup, not on the class/prototype | reaches one specific object at runtime without touching the game's file at all — other mods patching the *same* method survive, because nobody replaced the shared prototype | `fxs-worker-yields-layer`'s `updateSpecialistPlot`, patched on the instance held in `LensManager.layers` — [`ui/worker-yields-layer-patch.js`](../ui/worker-yields-layer-patch.js) |
| Plain read of an exported class/function, no override | this mod reads the game's own data/state to compute its baseline | `PlotWorkersManager`, `PlacePopulation`, `YieldBarEntryStyle` |

Each sub-folder here is a **1:1 copy of every original game `.js` file this mod imports from, or
overrides/decorates/patches by name**, mirroring the real path under the game's `Base/modules/`
folder — same convention as the sibling mods. **Tracked in git.**

⚠️ Two files here are captured **without being imported at all**:
`base-standard/ui/place-population/panel-place-population.js` (the `Controls.decorate` target —
decoration works by custom-element tag name, no import needed) and
`base-standard/ui/lenses/layer/worker-yields-layer.js` (the class `worker-yields-layer-patch.js`
patches an *instance* of, found via `LensManager.layers`, never imported — see that file's own
header for why: "Patches the INSTANCE registered in LensManager.layers, never the game's file, so
other mods patching the same method survive"). Both are still exactly the kind of file a game
update can silently break this mod against, so they belong in the snapshot regardless.

## ⚠️ A new import or override → add that file to the CURRENT snapshot right away

Same rule as the sibling mods. Whenever a change under `ui/` adds:

- a new `from '/core/...'` or `from '/base-standard/...'` import,
- a new `Controls.decorate('...', ...)` target (even one whose backing file is not imported — go
  find it under the matching `Base/modules/.../` folder and copy it anyway), or
- a new instance/singleton method patch reached through a registry (`LensManager`,
  `ComponentRegistry`, or similar) rather than an import,

copy that one file into the **newest** version folder (currently `1.5.0/`) in the same change,
mirroring its `core/...` / `base-standard/...` path. Then add a row to that folder's own
`README.md` (what it is in the game, how the mod uses it, and which mechanism).

## ⚠️ Retention: keep AT MOST two versions — newest, and ONE version back

Same rule as the sibling mods. Once a third snapshot would exist, delete the oldest folder in the
same change that adds the new one. Right now there is only `1.5.0/`.

## Versions captured

| Folder | Game build | Captured | Notes |
|---|---|---|---|
| [`1.5.0/`](1.5.0/README.md) | Steam `buildid 25245002` | 2026-09-20 | First snapshot; see its own `README.md` for a file-by-file description. |

## How to capture the next snapshot (e.g. after the 1.6.0 game update)

1. Find every original-game import the mod currently has:
   ```bash
   grep -rhoE "['\"]/(core|base-standard)[^'\"]+['\"]" ui/ | tr -d "'\"" | sort -u
   ```
2. Also re-check every `Controls.decorate` call and every registry lookup that patches a live
   instance (`LensManager.layers`, and anything similar added later) for its target, and make
   sure the file backing it — even an undecorated-by-import one — is on the list.
3. Copy each file from the game install (`Base/modules/...`) into a new
   `game-files-snapshots/<new-version>/` folder, preserving the relative path.
4. `diff -ru game-files-snapshots/1.5.0 game-files-snapshots/<new-version>` to see exactly what
   the update changed — check `worker-yields-layer.js` and `panel-place-population.js` first;
   those are the two most likely to move `updateSpecialistPlot` or `onAttach`/`showExpandedView`
   under this mod's patches.
5. Copy `1.5.0/README.md` to `<new-version>/README.md`, update it (file descriptions rarely
   change; note anything the diff actually touched), add a row to the table above, and — if this
   brings the count above two — delete the oldest folder and its row.
