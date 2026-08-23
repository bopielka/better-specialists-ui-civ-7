# Developer documentation — Better Specialists UI by Najane

Written for an AI agent (or a human) starting a **new session** on this mod with no prior
context. Read this file, then the documents it points at for the area you are about to
touch. Between them they describe what the mod does in game, how its seven scripts fit
together, and which of the platform's traps have already been paid for once.

The repository's own `README.md` is the *player- and author-facing* document: what the mod
does and why, plus licence and origin. This folder is the *implementer-facing* one: how it
is built, and what will break if you build it differently.

## Read this first, in this order

| # | Document | What it answers |
|---|---|---|
| 01 | [What the mod does](01-what-the-mod-does.md) | Every in-game behaviour, and which file implements it |
| 02 | [Architecture](02-architecture.md) | The seven scripts, the dependency order, load order, scopes |
| 03 | [Platform notes](03-platform-notes.md) | Civ VII UI framework, lens layers, input actions, DOM quirks |

Then the module documents, one per source file:

| # | Document | File |
|---|---|---|
| 04 | [The baseline model](04-baseline-model.md) | `ui/model-specialists-yield-baseline.js` |
| 05 | [Input and view mode](05-input-and-view-mode.md) | `ui/modifier-tracker.js`, `ui/view-mode.js`, `config/input.xml` |
| 06 | [The panel](06-panel.md) | `ui/panel-place-population-decorator.js` |
| 07 | [The map layer](07-map-layer.md) | `ui/worker-yields-layer-patch.js` |
| 08 | [Options and persistence](08-options.md) | `ui/options/` |
| 09 | [Localisation](09-localisation.md) | `text/<locale>/` |
| 10 | [Development workflow](10-development-workflow.md) | Deploying, checking, reading logs, conventions |
| 11 | [Known gaps and compatibility](11-known-gaps.md) | What is unfinished, what is fragile, what to re-test |

## The one-paragraph summary

A **UI-only** mod for Sid Meier's Civilization VII targeting the **specialist placement**
interface — the `panel-place-population` panel and the `fxs-worker-yields-layer` map lens.
When placing a specialist, every workable urban tile repeats the same numbers. The mod
computes the part they all share, states it **once** in a "Common Specialists Yields" panel,
and reduces the per-tile pills on the map to how each tile *deviates* from it. Holding the
**alternative-view key** (Tab by default, rebindable) falls back to the game's untouched
display. It changes no rules, values or balance, and declares `AffectsSavedGames = 0`.

## Rules an agent working here must not break

1. **The mod id is `najane-common-specialists-yields`, not the repository folder name.**
   Every internal import is an absolute path beginning `/najane-common-specialists-yields/`,
   which resolves to the *deployed folder name*. Renaming the folder, or deploying under
   `better-specialists-ui`, breaks every import at once. See
   [Architecture](02-architecture.md).
2. **The dependency order.** `options` ← `modifier-tracker` ← `view-mode` ←
   `baseline model` ← `panel` / `layer`. Never import upwards; the panel and the layer must
   never import each other.
3. **`deploy.sh` after every change** (`deploy-on-mac.sh` on macOS). The game never reads
   this repository. ⚠️ Both scripts are committed **non-executable** and run **no checks** —
   see [workflow](10-development-workflow.md).
4. **`console.log` never reaches the game's log.** Use `console.error`, prefixed
   `najane-specialists:`.
5. **Presentation options belong in the layer, never in the model.** Putting "do not
   aggregate…" in the baseline once made the panel and the map disagree. See
   [the baseline model](04-baseline-model.md).
6. **Keep the `⚠️` comments.** Almost every one records a bug that shipped, or an approach
   that was tried and failed. They are the most valuable text in the repository. If you
   change the code they describe, update them; do not delete them.
7. **`config/input.xml` loads in the `shell` scope only.** In a `game` scope group it fails
   with `no such table: InputActions` and rolls back that group's whole database action.

## Conventions in this documentation

- Paths are relative to the repository root: `ui/worker-yields-layer-patch.js`.
- "The panel" means the game's `panel-place-population` component, which this mod decorates.
- "The layer" means the singleton `fxs-worker-yields-layer` registered in `LensManager`.
- "The engine" means the game's C++ side, reached through globals like `GameplayMap`,
  `Districts`, `Cities`, `GameInfo`, `Input`, `engine.on(...)`.
- Where a document says **⚠️**, it is repeating a hard-won fact from a source comment or a
  verified measurement.
- Wider platform background lives in the author's knowledge base, outside this repository:
  `../../knowledge-base/` (see `05-ui-javascript.md`, `14-quirks-and-gotchas.md`,
  `16-ui-source-reference.md`).
