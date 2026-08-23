# 10 — Development workflow

## The repository is the source of truth

**The game never reads from here.** A deploy script copies a build into Civ VII's mod folder.
**Run it after every change** — an untested edit in this repository is not a tested edit
anywhere.

### The two scripts

Both live in the repository: `deploy.sh` for Windows (Git Bash) and `deploy-on-mac.sh` for
macOS. They are **identical apart from the default install path** — keep them in sync if the
deploy or check logic changes; `diff` them and expect only the header, the usage lines and
`DEFAULT_MODS_DIR` to differ. Neither hard-codes your install: `CIV7_MODS_DIR` overrides the
default on both, which is why one committed copy serves everyone.

This section stays the spec for what they must do, in order:

```
MOD_ID="najane-common-specialists-yields"
CONTENT_DIRS=(ui text config)
DEST="$MODS_DIR/$MOD_ID"

1. refuse to run unless "$MOD_ID.modinfo" is here, "$DEST" ends in $MOD_ID,
   and "$MODS_DIR" exists                     <- see the safety note below
2. rm -rf "$DEST" && mkdir -p "$DEST"
3. copy "$MOD_ID.modinfo" and each of CONTENT_DIRS into "$DEST"
4. fail loudly if any <Item>/<File> named by the .modinfo is missing from "$DEST"
```

⚠️ **Step 1 is not optional.** Step 2 is `rm -rf` on a path built from a variable; without
the guards a typo in `MOD_ID` deletes the wrong folder. A bad path must never turn this
script into a destructive command.

⚠️ **`MOD_ID` is the mod id, not the repository folder name.** The script installs to
`$MODS_DIR/$MOD_ID`, and every internal `import` in this mod is an absolute path beginning
`/najane-common-specialists-yields/`. Deploy under any other folder name and every import
fails at once. See [Architecture](02-architecture.md).

Both scripts also hold their window open when they were started by a double-click rather than
from a terminal — without it a successful deploy and a `die` in the safety block look exactly
alike from outside: a window that flashes and is gone.

### Every time

```bash
./deploy.sh
```

```bash
./deploy.sh --dry
```

`--dry` lists what would be copied and changes nothing. On macOS the script is
`./deploy-on-mac.sh`, with the same arguments.

### Install locations

| Platform | Path |
|---|---|
| Windows | `%LOCALAPPDATA%\Firaxis Games\Sid Meier's Civilization VII\Mods\` |
| macOS | `~/Library/Application Support/Civilization VII/Mods/` |

⚠️ **Not `Documents\My Games\…`** — that is the Civ VI convention and Civ VII never scans it.

Each script defaults to its own platform. Override per run when the install is elsewhere:

```bash
CIV7_MODS_DIR="$HOME/Library/Application Support/Civilization VII/Mods" ./deploy.sh
```

After deploying, **return to the main menu (or restart)** to reload the mod.

### What the script does

1. **Refuses to run** if `MOD_ID` is still the placeholder, if `<MOD_ID>.modinfo` is not in
   the source folder, if the target path does not end in the mod id, or if the mods folder
   does not exist. ⚠️ **A bad path must never turn this into a destructive command** — it
   begins with `rm -rf "$DEST_DIR"`.
2. **Wipes and rebuilds** the target folder, so files deleted here also disappear from the
   game instead of lingering as stale leftovers.
3. Copies **only** the `.modinfo`, `ui/`, `text/` and `config/` (`CONTENT_DIRS`). The README,
   the deploy script, `.git/` and notes never reach the player's mod folder — **by
   construction, not by an exclude list that can drift.**
4. Verifies that **every file referenced by the `.modinfo` exists** in the target, and fails
   loudly if not. This is what catches a script added to `<UIScripts>` but never written, or
   a locale file renamed on one side only.

⚠️ **Adding a new top-level directory means adding it to `CONTENT_DIRS`.** The script
tolerates a listed directory that does not exist, but silently ships nothing from one it was
never told about.

## ⚠️ A Steam Workshop subscription silently shadows your local build

**The single most confusing failure in this workflow**: you deploy, restart, and the game
runs the *old* code — with **no error anywhere**. `UI.log` is clean, and `Modding.log` lists
the mod exactly once, as though there were only one copy.

What is happening: a subscription to your own published mod puts a **second copy with the
same mod id** under
`~/Library/Application Support/Steam/steamapps/workshop/content/1295660/<item>/`. Both are
scanned and both are registered — and the one that gets applied is the one that is
**enabled**, which by default is the Workshop copy.

⚠️ **Bumping the version does not help.** `Version` is an `INTEGER` column in `Mods.sqlite`,
so `1.3` and `1.4` both store as `1`. Precedence is the `Disabled` flag, not the version and
not the path.

**The fix:** in the game's Mods / Additional Content browser, **disable the Workshop copy**
and leave the local one enabled. This is a per-copy setting that survives restarts.

**Diagnosing it** — this query names every copy and says which one wins:

```bash
sqlite3 -header -column "$HOME/Library/Application Support/Civilization VII/Mods.sqlite" "SELECT m.ModId, m.Version, m.Disabled, s.Path FROM Mods m JOIN ScannedFiles s ON s.ScannedFileRowId = m.ScannedFileRowId WHERE m.ModId LIKE '%najane%';"
```

`Disabled = 0` is enabled, `1` is disabled, `NULL` means the player has never touched it.
Two rows for one `ModId` is the whole problem in one line of output.

## Checking your work

### ⚠️ `node --check` does not check these files

```
node --check ui/view-mode.js                  → exit 0   (says nothing)
node --input-type=module --check < ui/view-mode.js  → actually parses it
```

`node --check` parses a `.js` file as **CommonJS**; faced with `import` it gives up and exits
0. Every "syntax ok" produced that way is worthless. Reading from **stdin with
`--input-type=module`** is what parses an ES module:

```bash
for f in ui/*.js ui/options/*.js ui/options/editors/*.js; do
    node --input-type=module --check < "$f" || echo "FAILED: $f"
done
```

⚠️ **Put this check in your `deploy.sh`** — the sibling Commerce mod's script has it, added
after a broken string literal reached the game and stopped the mod loading entirely. Until
it is there, run it by hand, and run it **after** the last edit rather than before: a file
checked, edited once more, and then deployed unchecked is the other half of that failure.

If `node` is not installed: `brew install node` on macOS.

### The logs

```
%LOCALAPPDATA%\Firaxis Games\Sid Meier's Civilization VII\Logs\      (Windows)
~/Library/Application Support/Civilization VII/Logs/                 (macOS)

  Modding.log    was the mod discovered and loaded?
  Database.log   did the XML pass validation?
  UI.log         JavaScript errors, missing assets, this mod's own output
```

⚠️ **`console.log` never reaches `UI.log`.** Everything this mod writes goes through
`console.error`, prefixed `najane-specialists:` (and `najane-diag:` for the plot dump).

⚠️ If the mod is discovered and shows as enabled but **never appears in `Modding.log`'s
"enabled mods" list**, check `version` on `<Mod>`: it is parsed as an int, so a `version="0.x"`
would land in `Mods.sqlite` as `Version 0` and the game silently refuses to apply it. The
current `version="1.4"` lands as `1`, which is fine.

⚠️ A `no such table: InputActions` line in `Database.log` means `config/input.xml` was loaded
in the **game** scope. It belongs in `shell` only, and the failure **rolls back that group's
whole `UpdateDatabase` action.**

## Code conventions

Follow the surrounding code. In short:

- **ES modules**, no build step, no bundler, no TypeScript.
- Imports of game files are absolute (`/core/…`, `/base-standard/…`). ⚠️ **Imports of this
  mod's own files are absolute too**, beginning `/najane-common-specialists-yields/ui/…` —
  unlike the sibling Commerce mod, which uses relative paths. Match what is already here.
- **4-space indent**, semicolons, double quotes in most of the newer code, trailing commas in
  multi-line literals.
- `camelCase` for functions and variables, `SCREAMING_SNAKE` for module constants,
  `LOC_…NAJANE_SPECIALISTS…` / `LOC_OPTIONS_NAJANE_…` for localisation keys, `najane-*` for
  CSS classes, event names and DOM ids.
- Every module opens with a **block comment saying what it is for and why it exists** —
  usually naming the failure that shaped it. Match that.
- Prefer `?.` and `??`. **Wrap every call into the game in `try` / `catch`** and
  `console.error` on failure; the engine throws where a browser would return `undefined`.
- Log with the module's own prefix: `` console.error(`najane-specialists: …: ${e}`) ``.

### The `⚠️` convention

⚠️ markers record a bug that shipped, a measurement, or an approach that was tried and
failed. **They are the most valuable text in the repository.** If you change the code one
describes, update the marker. Do not delete one because it "reads like a comment about
nothing" — that is exactly what a successfully prevented bug looks like.

Write a new one when you discover something the platform does that a reasonable reader would
not predict. Say what was tried, what happened, and what the evidence was.

## Before you commit

1. Parse every script with `node --input-type=module --check` (above).
2. `./deploy.sh` — deploys and verifies every `.modinfo` reference.
3. Load the game, return to the main menu, enter a city's population placement.
4. Check **both** panel states: hover nothing ("Choose a tile"), then hover a valid urban
   tile ("Add specialist"). The section must appear in both.
5. Hold the key. The map must fall back to the game's display **and** the hint must flip.
6. Open Options → Mods and toggle each box; the map and panel must both react without
   leaving the screen.
7. Open Options → Accessibility → Keyboard and Mouse → Configuration and confirm the mod's
   row is there and rebindable.
8. Check `UI.log` for `najane-specialists:` warnings.
9. Confirm `DIAGNOSTICS = false` in `ui/model-specialists-yield-baseline.js` before
   publishing.
9b. If a change appears not to have taken effect at all, **check for a shadowing Workshop
   copy before debugging the code** (above). It costs one query and it is the likeliest
   cause of "I changed it and nothing happened".
10. If you touched localisation, confirm no raw `LOC_…` tags appear on screen.

## Files that are not part of the build

```
README.md                 the player- and author-facing document
CHANGELOG.md              the full history, with reasoning
STEAM_CHANGELOG.bbcode    ⚠️ the SHORT form of it; see below. 8000-character limit
TODO.md                   ⚠️ "For AI agents: Don't edit this file unless asked."
documentation/            this folder
(no deploy script)        deploy.sh is git-ignored; this document is its spec
steam-description.md      git-ignored, lives outside the repository's history
.idea/, .git/
```

### ⚠️ The changelog is written TWICE

Every entry added to `CHANGELOG.md` is condensed into `STEAM_CHANGELOG.bbcode` **in the same
pass**. Skip it once and the two drift apart within a release or two, at which point nobody
knows which is right.

| | `CHANGELOG.md` | `STEAM_CHANGELOG.bbcode` |
|---|---|---|
| Audience | whoever maintains this next | a player on the Workshop page |
| Carries | the cause, the ⚠️ notes, the approaches that failed | what changed, one bullet each |
| Fixes | one entry per fix, explained | folded into a single "Fixed:" bullet per version |
| Format | Markdown, newest first | BBCode, `[h2]` per version, house style from the sibling Commerce mod |

File a release-worthy change under the **in-progress version heading**, never under an
"Unreleased" one.

⚠️ **Steam truncates the changelog field at 8000 characters without warning**, and the first
thing lost is the tail — the oldest versions. When the file approaches the limit, **drop the
oldest version section** rather than trimming the recent ones; the full history is in the
Markdown file either way. The file currently sits at about 4.7k.

⚠️ **Check that limit in your `deploy.sh`** — the sibling Commerce mod's script refuses to
deploy over it. Until yours does, check by hand:

```bash
wc -c STEAM_CHANGELOG.bbcode
```

⚠️ **1.1 and 1.2 have no notes anywhere.** `CHANGELOG.md`'s 1.0 and 1.3 sections are
reconstructed from the Steam Workshop page; those two releases were never written up.

⚠️ **The Steam description has a hard 6000-character limit** and Steam truncates without
warning — the first thing lost is the tail, which is where credits and the source link live.

## Compatibility

- **City Hall (`bz-city-hall`)** — supported, and the store description claims it is tested
  alongside it. ⚠️ **Re-confirm that in game after any change to the layer patch.** See
  [known gaps](11-known-gaps.md).
- Any other mod that patches `fxs-worker-yields-layer.updateSpecialistPlot` and **delegates**
  will keep working only if this mod's patch installs *after* theirs, or if their work is
  re-applied the way City Hall's is.
- Saved games are unaffected, no rules or values are touched, and the mod is safe to add or
  remove mid-game.

## Licence and origin

This mod was generated in full by **Opus 5**, a model by **Anthropic**. Anyone may reuse it
freely as a basis for their own mods — take it apart, copy from it, build on it, no
permission needed.
