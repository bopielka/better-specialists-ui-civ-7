# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository.

A UI-only mod for Sid Meier's Civilization VII that rewrites the **specialist placement**
display: the `panel-place-population` side panel and the `fxs-worker-yields-layer` map lens.
It states the yield every specialist tile shares **once**, so the tiles only have to show how
they differ from it. Plain ES modules, **no build step, no bundler, no TypeScript, no tests**
— the game loads the `.js` files directly. About 1,350 lines across eight scripts.

## Read this first

**[`documentation/README.md`](documentation/README.md) is the index, and it is written for
exactly this situation** — an agent starting with no context. It routes to eleven documents,
one per source file plus the cross-cutting ones. Read the one covering the area you are about
to touch before you touch it; they record traps that have already been paid for once.

This file carries only what has to be in context *before* that, plus the things a session
gets wrong when it does not know them.

## ⚠️ The mod id is not the repository folder name

| | |
|---|---|
| Repository folder | `better-specialists-ui` |
| `<Mod id>`, `.modinfo` filename, **deployed folder** | `najane-common-specialists-yields` |
| Every internal import | `/najane-common-specialists-yields/ui/…` |

The engine resolves an absolute UI import against the **deployed folder name**, which must
equal the mod id. Deploy under the repository's own name and every import breaks at once —
and the failure is a silent non-load, not an error naming the path. Grep before renaming
anything.

## Commands

Two scripts, both in the repository and **identical apart from the default install path**:
`deploy.sh` for Windows (Git Bash), `deploy-on-mac.sh` for macOS. ⚠️ **Keep them in sync** if
the deploy logic changes.

```bash
./deploy-on-mac.sh
```

```bash
./deploy-on-mac.sh --dry
```

```bash
CIV7_MODS_DIR="/path/to/Mods" ./deploy-on-mac.sh
```

⚠️ **Neither script runs any check on what it deploys** — no syntax parse, no character
limits. The sibling Commerce mod's `deploy.sh` has three of them, each added after the
failure it prevents reached the game. Until they are ported, run them by hand (below).

**The game never reads this repository** — it reads a copy in its own mod folder, so a change
that has not been deployed is a change that is not running. It must copy the `.modinfo` plus
`ui/`, `text/` and `config/`, and it wipes the target first so deleted files disappear rather
than lingering. After deploying, **return to the main menu or restart** — scripts load once.

### ⚠️ A Steam Workshop subscription silently shadows the local build

**The most confusing failure in this workflow.** A subscription to the published mod puts a
**second copy with the same mod id** under `steamapps/workshop/content/1295660/<item>/`. Both
are scanned and registered; the **enabled** one is applied. There is no warning anywhere:
`Modding.log` lists the mod once, `UI.log` is clean, and the old code simply runs.

⚠️ **Bumping the version does not break the tie** — `Mods.sqlite` stores `Version` as an
`INTEGER`, so `1.3` and `1.4` are both `1`. Precedence is the `Disabled` flag.

Before debugging code that "changed nothing", run:

```bash
sqlite3 -header -column "$HOME/Library/Application Support/Civilization VII/Mods.sqlite" "SELECT m.ModId, m.Disabled, s.Path FROM Mods m JOIN ScannedFiles s ON s.ScannedFileRowId = m.ScannedFileRowId WHERE m.ModId LIKE '%najane%';"
```

Two rows for one `ModId` is the whole problem. The fix is to disable the Workshop copy in the
game's Mods browser.

### ⚠️ `node --check` is worthless on these files

It parses `.js` as CommonJS, meets `import`, gives up, and **exits 0 on a file with a syntax
error**. Every "syntax ok" reported that way means nothing. The real check reads from stdin:

```bash
for f in ui/*.js ui/options/*.js ui/options/editors/*.js; do node --input-type=module --check < "$f" || echo "FAIL $f"; done
```

### Logs

`~/Library/Application Support/Civilization VII/Logs/` (macOS) — `UI.log` (this mod's output
and JS errors), `Modding.log` (was it loaded), `Database.log` (did the XML validate).

⚠️ **`console.log` never reaches `UI.log`.** Everything here goes through `console.error`,
prefixed `najane-specialists:` (and `najane-diag:` for the plot dump).

⚠️ `no such table: InputActions` in `Database.log` means `config/input.xml` was loaded in the
**game** scope. It belongs in `shell` only — and that failure **rolls back the whole
`UpdateDatabase` action** of its group.

## Architecture

Seven scripts and no folders to speak of; the structure is entirely in the import graph, and
**the direction is load-bearing**:

```
options  ←  modifier-tracker  ←  view-mode  ←  baseline model  ←  panel
                                                              ←  layer
```

⚠️ **The panel and the layer must never import each other.** They are two views of one
answer; both ask `computeSpecialistYieldBaseline()` and neither may compute what the other
needs. [`documentation/02-architecture.md`](documentation/02-architecture.md) has the rest.

⚠️ **`ui/options/` loads in SHELL scope too** — the options screen exists in the main menu,
where there is no game and no gameplay database. Those two files may hold `YieldType`
*strings* but must never touch `GameInfo`. That is why the keyboard-mapping editor spells the
action name out instead of importing it, and why resolving a type to a yield index is the
model's job.

⚠️ **There is no single entry point.** The `.modinfo` lists **all eight** scripts, so its
order is not the load order — the import graph is. Three files do work at import time
(`modifier-tracker.js` and the model register listeners; `worker-yields-layer-patch.js`
patches the lens on `engine.whenReady`); the other three register with `Controls.decorate`.

| Group | Scope | Contents |
|---|---|---|
| `najane-specialists-ui` | `game` | text + all eight scripts |
| `najane-specialists-shell` | `shell` | text + `config/input.xml` + **the two options scripts only** |

## Rules that are easy to break

1. **Presentation options belong to the consumer, never to the model.** Putting "do not
   aggregate…" in the baseline once made the panel and the map disagree about the same
   number — the one failure this mod cannot afford, since its premise is that the panel
   states once what the tiles no longer repeat.
2. **If you replace a method instead of delegating, ask what you are dropping.** The layer
   patch does not call the original for specialist tiles, which silently killed City Hall's
   building-slot icons until `drawCompanionExtras()` re-applied their step. Anything new that
   replaces wholesale inherits this obligation.
3. **Keep the FACT in a `⚠️` comment, not the story.** Each one records a bug that shipped, a
   measurement, or an approach that failed — keep that, drop the narrative around it. If you
   change the code one describes, update it; do not delete the constraint because it "reads
   like a comment about nothing". See **Comments** below.
4. **New localisation keys go into all twelve `text/<locale>/InGameText.xml` files.** A
   missing key renders as the raw `LOC_…` tag on screen. ⚠️ `text/ru_RU/` holds **Ukrainian**;
   the game has no Ukrainian locale. ⚠️ `en_us` uses `<EnglishText>` with no `Language`
   attribute; every other locale uses `<LocalizedText>` **with** one — a row copied without it
   validates and never displays.
5. **The changelog is written twice, in the same pass.** `CHANGELOG.md` carries the cause and
   the reasoning; `STEAM_CHANGELOG.bbcode` carries one bullet per change and has a hard
   8000-character limit Steam enforces by silently truncating the tail. When it is close,
   **drop the oldest version section** rather than trimming recent ones.
6. **`TODO.md` says: "For AI agents: Don't edit this file unless asked."** Honour it — and
   do not implement what is listed there unless asked either.
7. **Set `DIAGNOSTICS = false` before publishing** (`ui/model-specialists-yield-baseline.js`).
   It writes one line per plot, and those show up as "JS Error" entries in the player's log.

## Performance is a correctness requirement here

This is UI code inside the game's own single JavaScript thread, and the layer's
`updateSpecialistPlot` runs **once per tile, on every redraw**. Work done badly here shows up
as the whole game stuttering. **Every change gets a cost check before it is finished**, and
the answer goes in the `⚠️` comment beside it.

- **Is it called per tile?** Then it may not scan `GameInfo` (which is iterated, not queried),
  build a Set per call, or re-derive anything the caches already hold. The baseline used to be
  recomputed per tile — quadratic, with an engine district lookup per plot per tile.
- **Does it invalidate correctly?** The model's caches drop on exactly two events:
  `PlotWorkersUpdatedEventName` and `InterfaceModeChangedEventName`. A stale baseline does not
  throw; it shows the previous city's numbers.
- ⚠️ **A full layer redraw is expensive.** `realizeGrowthPlots()` walks the city's entire
  growth domain and falls back to scanning the **whole map**. Hover therefore repaints the two
  tiles that changed, not the map — and skips the work entirely when hover changes nothing.
- **Memoise anything derived from options**, and drop the memo *before* the redraw that uses
  it, not after.

## Comments

The comments here are for an agent opening this repository cold, with no memory of the session
that wrote them — **that is the whole budget**. A comment earns its place by carrying
something the code cannot say: a constraint, a measurement, a platform trap, or the reason a
boundary sits where it does.

- **Say the fact, not the history.** "⚠️ `getGestureDisplayString` wants the NUMERIC action
  id; the name silently returns nothing" — not the story of how that was found.
- **Never restate the code.** If the line says what it does, the comment above it is noise.
- A module header is **three to eight lines** for an ordinary module: what this is for, why it
  lives where it does, and the one or two traps in it. A genuinely complex one
  (`worker-yields-layer-patch.js`) may need more — but then every line carries a distinct
  fact, and none of them is narrative.
- Prefer one `⚠️` line over a `⚠️` paragraph. If it genuinely needs a paragraph, it probably
  belongs in `documentation/`, with the comment pointing at it.

⚠️ This is a rule about **density, not about deleting knowledge**. Compress a long note down
to the constraint it protects; do not throw the constraint away with the prose.

## Conventions

Follow the surrounding code; it is consistent. 4-space indent, semicolons, trailing commas.
⚠️ **Import paths use single quotes, every other string uses double quotes** — that split is
deliberate and consistent across all eight files. `camelCase` functions, `SCREAMING_SNAKE`
module constants, `LOC_NAJANE_SPECIALISTS_*` / `LOC_OPTIONS_NAJANE_*` localisation keys,
`najane-*` CSS classes, event names and DOM ids.

⚠️ **Imports of this mod's own files are absolute**, beginning
`/najane-common-specialists-yields/ui/…` — unlike the sibling Commerce mod, which uses
relative paths. Match what is already here. Imports of game files are absolute too
(`/core/…`, `/base-standard/…`).

Every module opens with a block comment saying what it is for **and why it lives where it
does**. Match that — it is how the layer rule stays enforceable by reading.

⚠️ Wrap every call into the game in `try`/`catch` and `console.error` on failure. The engine
throws where a browser would return `undefined`.
