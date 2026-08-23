# 03 — Platform notes: Civ VII UI, lens layers, and the engine

Read this before writing any new code for this mod. Everything here was found the hard way;
each item names the failure it prevents.

## Two UI frameworks ship side by side — this mod uses the old one

| | Old framework | `ui-next` |
|---|---|---|
| Defined with | `Controls.define(...)` | Solid.js components |
| Mod hook | `Controls.decorate(...)` | `ComponentRegistry.register(...)` |
| Used by | `panel-place-population`, `editor-keyboard-mapping`, most in-game panels | `screens/commerce/`, other newer screens |

Both of this mod's component targets are **old framework**, which is why `Controls.decorate`
works here. ⚠️ On a `ui-next` screen the same call **silently does nothing** — no error, no
warning. If a decorator appears to be ignored, check which framework the target belongs to
before debugging anything else. (The sibling Commerce mod is entirely `ui-next`; do not copy
its attachment code into this one.)

### The decorator contract

`Controls.decorate(name, factory)` calls the factory with the live component instance. The
returned object may implement four optional hooks, called in this order around the
component's own lifecycle:

```js
beforeAttach()   afterAttach()   beforeDetach()   afterDetach()
```

Both decorators here declare **all four**, several of them empty. Follow that: the empty
bodies document that nothing is needed at that point, rather than leaving a reader to wonder
whether the hook was forgotten.

The decorator can reach the component's own fields and methods —
`component.specialistMinimizedContainer`, `component.subsystemFrame`,
`component.createActionEntry`, `component.mappingDataMap`. ⚠️ **That is an undocumented
private surface.** Feature-detect (`if (anchor?.parentElement)`) and warn rather than throw.

### ⚠️ `waitForLayout` — do not build DOM in `afterAttach`

```js
afterAttach() {
    waitForLayout(() => this.buildSections());
}
```

`fxs-subsystem-frame` **rearranges its children after build**. Inserting during `afterAttach`
silently landed the section at the end of the frame instead of at the requested position —
no error, just the wrong place. `waitForLayout` is a game global; it defers to after that
pass.

### Patching a shared prototype

`editor-keyboard-mapping` needs a *method* wrapped, not just an instance decorated, because
the editor builds its rows inside `addActionsForContext`. The prototype is shared by every
instance, so it is patched **once**:

```js
static patched = null;              // ⚠️ guard — the prototype is shared
proto.addActionsForContext = function (...args) {
    const result = original.apply(this, args);
    const added = this.najaneKeyboardMapping?.afterAddActionsForContext(...args);
    return added ?? result;
};
```

The decorator instance parks itself on the component (`component.najaneKeyboardMapping = this`)
so the prototype-level function can find it again.

## Lens layers: patch the registered instance, never the file

```js
import LensManager from '/core/ui/lenses/lens-manager.js';

const layer = LensManager.layers.get("fxs-worker-yields-layer");
const original = layer.updateSpecialistPlot;
layer.updateSpecialistPlot = function (info) { /* ... */ };
```

`LensManager.layers` is a public `Map` of **singleton instances**. Replacing a method on the
instance leaves the game's own file untouched, so other mods that patch the same file keep
working. Overwriting the file itself would break every one of them, and every future game
patch.

⚠️ **The layer is registered *after* mod scripts run.** `applyPatch()` at
`engine.whenReady` returns `false` the first time. The retry hangs off
`InterfaceModeChangedEventName` and unhooks itself on success:

```js
engine.whenReady.then(() => {
    if (!applyPatch()) {
        window.addEventListener(InterfaceModeChangedEventName, function retry() {
            if (applyPatch()) window.removeEventListener(InterfaceModeChangedEventName, retry);
        });
    }
});
```

⚠️ **Mark the instance so the patch cannot be applied twice** (`layer.__najaneBaselinePatched`).
Without it a second pass captures the *patched* method as "the original" and recurses.

### Being a good citizen when you replace rather than delegate

A well-behaved patch calls the previous implementation and adds to it. This one deliberately
does **not** for specialist tiles — it replaces the pills wholesale — which means anything
another mod added to that method is skipped.

⚠️ **City Hall (`bz-city-hall`) wraps this same method** to draw building-slot icons. Its
step was being dropped, so its icons only appeared while the *original* view was on screen.
`drawCompanionExtras()` re-applies their work, entirely feature-detected:

```js
if (typeof this.realizeBuildSlots !== "function" || !this.bzGridSpritePosition) return;
```

If you add another wholesale replacement anywhere, ask what you are dropping.

## Input: the key is a real game action, not a DOM modifier

⚠️ **Do not read modifier state from DOM events for this.** An earlier version sampled
`event.shiftKey`, which collided with other UI mods reacting to Shift — City Hall shows its
building overlay on it.

The key is declared in `config/input.xml` as an `InputAction` and read through the engine:

```js
window.addEventListener(InputEngineEventName, (event) => {
    if (event.detail?.name !== "najane-alternative-view") return;
    if (event.detail.status === InputActionStatuses.START)  setHeld(true);
    if (event.detail.status === InputActionStatuses.FINISH) setHeld(false);
});
```

Facts that make this work, each of which cost something to find:

- ⚠️ **`EventType="All"` is what makes hold-to-view possible.** The action then reports
  `START` on key-down and `FINISH` on key-up. A plain action fires **once** and can never
  express "is currently held". The game uses the same trick for `keyboard-camera-modifier`.
- ⚠️ **A bare modifier works as an XML default but not as a *rebinding*.** The gesture
  recorder (`Input.beginRecordingGestures`) treats a modifier as the start of a combination,
  so a player who rebinds away from Shift can never record plain Shift again — only a full
  reset of every binding brings it back. `KEY_CONTROL` went further and showed up as
  "unassigned" outright. Hence `KEY_TAB`: a regular key, free in the base game and in every
  installed mod, and reversibly bindable.
- ⚠️ **Leaving the mode never delivers the matching `FINISH`**, which would strand the
  display in the alternative view. `InterfaceModeChangedEventName` and window `blur` both
  force `setHeld(false)`.
- `InputActionStatuses`, `Input`, `InputContext` and `InputDeviceType` are **globals**, not
  imports. `InputEngineEventName` and `InterfaceModeChangedEventName` are imports.

### Registering an action is not enough to make it rebindable

⚠️ **The keyboard-mapping editor does not enumerate registered actions.** It walks a
hardcoded `KEYS_TO_ADD` array inside the game's own `editor-keyboard-mapping.js`. An action
not in that list simply never appears in the rebinding screen, with **no error anywhere**.
That is the entire reason `ui/options/editors/najane-editor-keyboard-mapping.js` exists.

### Reading back which key is bound

```js
const actionId = Input.getActionIdByName(ALTERNATIVE_VIEW_ACTION);
const key = Input.getGestureDisplayString(actionId, 0, deviceType, InputContext.ALL);
return Locale.compose(key);
```

- ⚠️ **`getGestureDisplayString` wants the NUMERIC action id, not the name.** Passing the
  name silently returns nothing.
- ⚠️ **What comes back is a localisation key** (`"LOC_OPTIONS_KEY_TAB"`), not display text,
  so it still has to be composed. Both points mirror how the game's own nav-help does it.
- The fallbacks (keyboard, then mouse, then `LOC_NAJANE_SPECIALISTS_KEY_FALLBACK`) exist so
  an unbound action leaves a readable hint instead of an empty gap.

## Reading plot and yield data

`PlotWorkersManager` (`/base-standard/ui/plot-workers/plot-workers-manager.js`) is the
source for everything this mod computes:

| Member | Is |
|---|---|
| `workablePlots` | plots the player may place on now |
| `allWorkerPlots` | the superset, used to look one plot up by index |
| `hoveredPlotIndex` | the tile under the cursor, or null |
| `cityID` / `cityWorkerCap` | the city currently being placed into |
| `PlotWorkersUpdatedEventName` | a worker was placed — data changed |
| `PlotWorkersHoveredPlotChangedEventName` | the cursor moved to another tile |

Each plot info carries `CurrentYields` / `NextYields`, `CurrentMaintenance` /
`NextMaintenance`, `NumWorkers` / `MaxWorkers`, `IsBlocked` and `PlotIndex`.

- ⚠️ **`PlotIndex` is an index, not coordinates.** `GameplayMap.getLocationFromIndex(i)`
  converts; the sprite API and `Districts.getAtLocation` both want the location.
- ⚠️ **The yield arrays are indexed by `GameInfo.Yields` order**, and that order is the only
  link between a number and what it means. Never assume a fixed index for a yield type.
- ⚠️ **A tile that already holds a specialist omits the "Specialist maintenance" line**
  even though the bar above it accounts for the cost. The `*Maintenance` fields are not
  fully understood — see [known gaps](11-known-gaps.md) before touching them.
- ⚠️ **Urban means `URBAN` *or* `CITY_CENTER`.** The game's own
  `support-city-decoration.js` treats those two as the urban set
  (`getIdsOfTypes([URBAN, CITY_CENTER])`). Testing `URBAN` alone drops the city centre.

`GameInfo` tables are **iterated or looked up, not queried**: `GameInfo.Yields[i]`,
`GameInfo.Yields.length`, `GameInfo.Resources.lookup(type)`. An uncached scan inside a
per-tile loop is the classic way to make this mod slow — the layer walks
`GameInfo.Yields` by index for exactly this reason, rather than building a Set per tile.

## This DOM implementation is not a browser

| Missing / different | Use instead |
|---|---|
| `console.log` — never reaches `Logs/UI.log` | `console.error`, prefixed `najane-specialists:` |
| `element.replaceChildren()` — throws | `removeChild` in a loop |
| `display: grid` — appears nowhere in the shipped game | flexbox |
| `calc()` mixing a percentage with a length | keep `calc()` to one unit family, or avoid it |

`CustomEvent`, `localStorage`, `MutationObserver` and inline `element.style` all work.

The last three rows are carried over from the sibling Commerce mod's findings on the same
engine; this mod does not currently exercise them. The `console.log` row **is** verified
here — an earlier diagnostics dump left no trace in `UI.log` at all, which is why
`dumpSpecialistDiagnostics()` writes through `console.error`.

⚠️ **An inline style beats a component's own class**, which is how the yield bar is kept
centred:

```js
// yield-bar-base sets "justify-between" on itself, which leaves huge gaps once
// some yields are filtered out.
bar.style.justifyContent = "center";
```

⚠️ **`data-l10n-id` cannot take a runtime argument.** A static label can use the attribute;
anything with a parameter — the key hint, which names whatever key is bound — must go
through `Locale.compose(key, arg)` and be assigned as `textContent`.

## Custom events are this mod's only internal wiring

There is no shared store. Three `window` CustomEvents connect the modules:

| Event | Dispatched by | Listened to by |
|---|---|---|
| `najane-specialists-modifier-changed` | `modifier-tracker.js` on key down/up | the panel (hint) and the layer (full redraw) |
| `najane-specialists-options-changed` | `najane-options.js` on any `set` | the panel and the layer |
| `PlotWorkersUpdatedEventName` (the game's) | the game | the caches, the panel, indirectly the layer |

⚠️ **Anything that changes what is drawn must dispatch**, or one of the two views goes stale
while the other updates — the panel refreshes on its own listeners and the layer on its own.

## Performance facts worth keeping

- ⚠️ **The baseline used to be re-derived per tile** — quadratic, with an engine district
  lookup per plot per tile. It is now cached and dropped on two events. See
  [the baseline model](04-baseline-model.md).
- ⚠️ **A full layer redraw is expensive**: `realizeGrowthPlots()` walks the city's entire
  growth domain, and falls back to scanning the **whole map** when that is unavailable.
  Hover therefore repaints **two tiles**, not the map. See [the map layer](07-map-layer.md).
- Wrap every call into the game in `try` / `catch` and `console.error` on failure. The
  engine throws where a browser would return `undefined`.
