# Better Specialists UI by Najane

A UI-only mod for Sid Meier's Civilization VII.

When placing a specialist, every workable tile repeats the same numbers. This mod
states the shared part once in a **Common Specialists Yields** panel, so the tiles on
the map only have to show how they deviate from it. Hold **Shift** at any time to fall
back to the game's original display.

No game rules, values or balance are changed, and saved games are unaffected.

Steam Workshop: *(add link once published)*

## Repository layout

```
najane-common-specialists-yields.modinfo   mod manifest - actions, scopes, file list
ui/                                        JavaScript loaded by the game's UI
  model-specialists-yield-baseline.js        common-value calculation + caching
  options/najane-options.js                  mod options (Options -> Mods)
  panel-place-population-decorator.js        the "Common Specialists Yields" panel
  shift-tracker.js                           Shift-held detection
  view-mode.js                               which of the two displays is active
  worker-yields-layer-patch.js               per-tile rendering on the map
text/<locale>/                             translations, 12 languages
deploy.example.sh                          template for the local deploy script
```

## Working on the mod

This repository is the source of truth. The game never reads from here directly —
a small script copies a build into Civ VII's mod folder.

First time only:

```bash
cp deploy.example.sh deploy.sh
# set MOD_ID at the top of deploy.sh
chmod +x deploy.sh
```

`deploy.sh` is git-ignored, so everyone keeps their own copy pointing at their own
install. Then:

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

## Licence and origin

This mod was generated in full by **Opus 5**, a model by **Anthropic**.

Anyone may reuse it freely as a basis for their own mods — take it apart, copy from it,
build on it, no permission needed.
