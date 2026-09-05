# 02 — Architecture

Eight scripts, about 850 lines of JavaScript in total. There are no folders to speak of and
no build step; the structure is entirely in the import graph.

## The dependency order

```
options  ←  modifier-tracker  ←  view-mode  ←  baseline model  ←  panel
                                                              ←  layer
```

| File | May import | Must not know about |
|---|---|---|
| `ui/options/najane-options.js` | the game's options screen only | everything of this mod's |
| `ui/options/editors/najane-editor-keyboard-mapping.js` | nothing of this mod's | ditto — it also runs in the shell scope |
| `ui/modifier-tracker.js` | the game's input system | options, the DOM this mod adds |
| `ui/view-mode.js` | options + modifier-tracker | anything that draws |
| `ui/model-specialists-yield-baseline.js` | the game's plot data | options, view mode, anything that draws |
| `ui/panel-place-population-decorator.js` | all of the above | the layer |
| `ui/panel-expanded-default.js` | options + the game's placement model | the baseline, the layer, the section above |
| `ui/worker-yields-layer-patch.js` | all of the above | the panel |

### Why the two consumers must not meet

The panel and the layer are two *views of one answer*. Both ask
`computeSpecialistYieldBaseline()`; neither is allowed to compute anything the other would
also need.

⚠️ **This is the rule that was already broken once.** The "do not aggregate negatives"
option was first applied inside the baseline, and the panel and the map then **disagreed
about the same number** — which is the one failure this mod cannot afford, since its whole
premise is that the panel states once what the tiles no longer repeat. Presentation options
belong to the consumer, not to the model:

```js
// ui/worker-yields-layer-patch.js — right here, in the layer
const skipNegativeBaseline = NajaneOptions.dontAggregateNegatives;
```

### Why `view-mode.js` exists at all

It is three lines wrapping one boolean:

```js
export function isOriginalDisplayActive() {
    return NajaneOptions.originalByDefault ? !isAlternativeViewHeld() : isAlternativeViewHeld();
}
```

Both the panel (which hint to show) and the layer (what to draw) need that answer. Computed
in each of them, an inverted option would flip one and not the other, and the hint would
name the view the player is already looking at.

## The entry points

⚠️ **There is no single entry module.** Unlike the sibling Commerce mod, which lists two
scripts and lets `import` pull in the rest, this `.modinfo` lists **all eight** files under
`<UIScripts>`. Both work — ES modules are cached, so a file listed *and* imported still
evaluates once — but the consequence is that the order in the `.modinfo` is not the real
load order. The import graph is.

Three files do work at load time, with no function call to trigger them:

| File | What runs at import |
|---|---|
| `ui/modifier-tracker.js` | registers `InputEngineEventName`, `InterfaceModeChangedEventName` and `blur` listeners |
| `ui/model-specialists-yield-baseline.js` | registers the two cache-invalidation listeners |
| `ui/worker-yields-layer-patch.js` | `engine.whenReady.then(...)` → patch the layer, wire the redraw listeners |

The other three register themselves with the framework instead:

```js
Controls.decorate("panel-place-population", (component) => new NajaneCommonYieldsSection(component));
Controls.decorate("panel-place-population", (component) => new NajaneExpandedByDefault(component));
Controls.decorate("editor-keyboard-mapping", (component) => new NajaneEditorKeyboardMapping(component));
```

⚠️ **Two decorators on one component is supported, not a clash.** `Controls.decorate` appends
to a list and `doAttach` walks all of it, so the two panel decorators are independent: neither
can see the other, and removing one leaves the other working.

## ⚠️ The mod id is not the repository name

| | Value |
|---|---|
| Repository folder | `better-specialists-ui` |
| `<Mod id="...">` and `.modinfo` filename | `najane-common-specialists-yields` |
| Deployed folder name | `najane-common-specialists-yields` |
| Import prefix in every file | `/najane-common-specialists-yields/ui/...` |

The engine resolves an absolute UI import against the **deployed folder name**, which must
equal the mod id. Deploying this repository under its own folder name — or renaming the mod
id without a sweep of every `import` — breaks all of them at once, and the failure is a
silent non-load rather than an error naming the path. `deploy.sh` derives the target folder
from `MOD_ID` for exactly this reason.

Grep before renaming anything:

```bash
grep -rn "najane-common-specialists-yields" --include=*.js --include=*.xml --include=*.modinfo .
```

## Action groups and scopes

| Group | Scope | Contents |
|---|---|---|
| `najane-specialists-ui` | `game` | text + all eight scripts |
| `najane-specialists-shell` | `shell` | text + `config/input.xml` + **the two options scripts only** |

Why each half is needed:

- The **options screen exists in the main menu as well as in game**, so the options module
  and the keyboard-mapping decorator must be registered in both scopes or the settings
  disappear from one of them.
- ⚠️ **`config/input.xml` must be `shell`-only.** `InputActions`, `InputActionDefaultGestures`
  and `InputContextConstraints` live in the frontend/config database, not the gameplay one.
  In a `scope="game"` group the load fails with `no such table: InputActions` **and rolls
  back that group's entire `UpdateDatabase` action** — so an unrelated row in the same file
  would vanish too.
- Nothing that touches plot data belongs in the shell. That is why
  `najane-editor-keyboard-mapping.js` spells the action name out as a literal instead of
  importing it from `modifier-tracker.js`, whose gameplay imports do not belong there:

```js
// Must stay in sync with ALTERNATIVE_VIEW_ACTION and config/input.xml.
const NAJANE_KEYS_TO_ADD = ["najane-alternative-view"];
```

`LoadOrder` is **1000** in both groups.

⚠️ `version` on `<Mod>` is parsed as an **integer**. `version="1.4"` lands in `Mods.sqlite`
as `Version 1`, which is fine — but a future `version="0.9"` would land as `0`, and the game
then silently refuses to apply the mod: discovered, shown as enabled, and never in
`Modding.log`'s "enabled mods" list. The human-readable version is the free-form string in
`<Properties><Version>`.

## How the mod attaches itself

Three mechanisms, chosen per target. Details in [Platform notes](03-platform-notes.md).

| Target | Mechanism | File |
|---|---|---|
| `panel-place-population` | `Controls.decorate` — the old framework's documented hook | `ui/panel-place-population-decorator.js` |
| `editor-keyboard-mapping` | `Controls.decorate` **plus** a one-time prototype patch | `ui/options/editors/najane-editor-keyboard-mapping.js` |
| `fxs-worker-yields-layer` | method replacement on the instance in `LensManager.layers` | `ui/worker-yields-layer-patch.js` |

⚠️ **`ui/worker-yields-layer-patch.js` is the one file that will break on a game patch
touching specialist rendering.** It does not delegate to the original for specialist tiles —
it redraws pips and pills itself, using the layer's own helpers (`getSpecialistPipOffsetsAndScale`,
`addPositiveYield`, `addNegativeYield`, `yieldVisualizer`). If any of those change shape,
this is where it shows.

## Lifecycles — who starts and stops what

| Thing | Started | Stopped |
|---|---|---|
| Panel section DOM | `afterAttach` → `waitForLayout(() => this.buildSections())` | with the component; listeners removed in `beforeDetach` |
| Panel's five event listeners | `afterAttach` | `beforeDetach` — the exact mirror image |
| Baseline caches | at import | never; invalidated by event, see [04](04-baseline-model.md) |
| Layer patch | `engine.whenReady`, retried on interface-mode change | **never removed** — it is installed once and stays |
| Redraw listeners | `engine.whenReady` | never |

⚠️ **The layer registers *after* mod scripts run**, so the first `applyPatch()` usually
fails. The retry hangs off `InterfaceModeChangedEventName` and removes itself once it
succeeds. Do not "simplify" this into a single attempt at load.

⚠️ The `beforeDetach` list must stay an exact mirror of `afterAttach`. The panel is attached
and detached every time the player enters placement mode; a listener added and not removed
accumulates one leak per city visited.

## Adding a new feature — where does it go?

| The feature… | goes in |
|---|---|
| changes what "common" means | `ui/model-specialists-yield-baseline.js` |
| changes what a *tile* draws | `ui/worker-yields-layer-patch.js` |
| changes what the *panel* says | `ui/panel-place-population-decorator.js` |
| decides which of the two displays is live | `ui/view-mode.js` |
| reads a key or a binding | `ui/modifier-tracker.js` |
| is a setting the player changes in a menu | `ui/options/najane-options.js` + a string in every locale |
| is a new rebindable key | `config/input.xml` **and** `NAJANE_KEYS_TO_ADD` |
