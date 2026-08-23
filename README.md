# Better Specialists UI by Najane

A UI-only mod for Sid Meier's Civilization VII.

When placing a specialist, every workable tile repeats the same numbers. This mod
states the shared part once in a **Common Specialists Yields** panel, so the tiles on
the map only have to show how they deviate from it. Hold **Tab** at any time to fall
back to the game's original display — the key is rebindable in the game's keyboard
settings.

No game rules, values or balance are changed, and saved games are unaffected.

Current version: **1.4**. Steam Workshop: *(add link once published)*

## Repository layout

```
najane-common-specialists-yields.modinfo   mod manifest - actions, scopes, file list
config/input.xml                           the rebindable key (shell scope ONLY)
ui/                                        JavaScript loaded by the game's UI
  model-specialists-yield-baseline.js        common-value calculation + caching
  modifier-tracker.js                        is the alternative-view key held?
  view-mode.js                               which of the two displays is active
  panel-place-population-decorator.js        the "Common Specialists Yields" panel
  worker-yields-layer-patch.js               per-tile rendering on the map
  options/najane-options.js                  mod options (Options -> Mods)
  options/editors/najane-editor-keyboard-mapping.js
                                             makes the key appear in the rebinding screen
text/<locale>/                             translations, 12 languages
documentation/                             developer documentation - start at its README
```

Anyone (or any AI agent) picking this up for development should read
[`documentation/README.md`](documentation/README.md) first: it is the implementer-facing
counterpart to this file, and records every platform trap already paid for once.

## How the pieces fit

`model-specialists-yield-baseline.js` decides **what the common value is**; everything
else consumes it. `view-mode.js` answers **which display is active** and is shared by
the panel and the map layer so the two can never disagree. `worker-yields-layer-patch.js`
patches the singleton lens layer registered in `LensManager.layers` rather than
overwriting any game file.

Options only ever affect **presentation**, never the baseline itself — that is why
"do not aggregate…" is applied in the layer and not in the model. Putting it in the
model once made the panel and the map disagree.

## Working on the mod

This repository is the source of truth. The game never reads from here directly —
a small script copies a build into Civ VII's mod folder.

`deploy.sh` is **git-ignored**, so everyone keeps their own copy pointing at their own
install. There is no template in the repository; what the script has to do — including the
guards that stop a bad path from turning it into `rm -rf` on the wrong folder — is written
out in `documentation/10-development-workflow.md`. Once you have one:

```bash
./deploy.sh          # deploy
./deploy.sh --dry    # show what would be copied, change nothing
```

If your mods live somewhere else, override the target:

```bash
CIV7_MODS_DIR="/path/to/Mods" ./deploy.sh
```

The script wipes and rebuilds the target folder, so files deleted here also disappear
from the game instead of lingering. It copies only the `.modinfo`, `ui/` and `text/` —
this README, the deploy script and `.git/` never reach the player's mod folder. After
deploying, return to the main menu (or restart) to reload the mod.

The mod is installed to:

```
%LOCALAPPDATA%\Firaxis Games\Sid Meier's Civilization VII\Mods\
```

Not `Documents\My Games\...` — that is the Civ VI convention and Civ VII never scans it.

## Checking your work

```bash
# JavaScript syntax
for f in ui/**/*.js; do node --input-type=module --check < "$f"; done

# game logs - the first place to look when something does not appear
%LOCALAPPDATA%\Firaxis Games\Sid Meier's Civilization VII\Logs\
  Modding.log    was the mod discovered and loaded?
  Database.log   did the XML pass validation?
  UI.log         JavaScript errors, missing assets
```

Note that `console.log` never reaches `UI.log` — use `console.error` for diagnostics.

## Known gaps and next steps

- **The `*Maintenance` fields are not understood.** The game omits the "Specialist
  maintenance" line in the ANALYSIS block on a tile that already holds a specialist,
  even though the RESULTS bar above it accounts for the cost. An attempt to fill that
  line in produced roughly double the real figures and was reverted before 1.0. Before
  retrying, dump the raw `CurrentMaintenance` / `NextMaintenance` arrays for a tile with
  0 and with 1 specialist and derive the formula from real data, not assumptions.
- **The City Hall compatibility shim reaches into their internals**
  (`realizeBuildSlots`, `bzGridSpritePosition`). It is feature-detected and wrapped in
  try/catch, so it fails quietly, but it will need revisiting if that mod restructures.
- **"Tested alongside City Hall" in the store description** should be re-confirmed in
  game after any change to the layer patch.
- The Steam description, short blurb and changelogs live in
  `../steam-description.md` and must be kept in step with option renames.

## Licence and origin

This mod was generated in full by **Opus 5**, a model by **Anthropic**.

Anyone may reuse it freely as a basis for their own mods — take it apart, copy from it,
build on it, no permission needed.
