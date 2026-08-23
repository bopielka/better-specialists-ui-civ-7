# 06 — `ui/panel-place-population-decorator.js` — the panel

195 lines. Adds the **"Common Specialists Yields"** section to the game's
`panel-place-population`, twice, and keeps it in step with everything that can change it.

Attached with the old framework's documented hook:

```js
Controls.decorate("panel-place-population", (component) => new NajaneCommonYieldsSection(component));
```

## ⚠️ Two placements, because the panel is two frames

The game swaps frames depending on what the cursor is doing, and **hides the one it is not
using**:

| Frame | Shown when | This mod's section goes |
|---|---|---|
| `subsystemFrame` — "Choose a tile" | nothing is hovered | **appended last**, with the other explanatory blocks |
| "Add specialist" (anchored on `specialistMinimizedContainer`) | hovering a valid tile | **inserted first**, above BEFORE/AFTER |

⚠️ **A section added to `subsystemFrame` alone is invisible in exactly the state that
matters** — the game hides that frame while a specialist is being placed. This is why the
class carries two identical sections (`this.specialist`, `this.overview`) and updates both
in one pass rather than moving one element between frames.

Both are built by the same `createSection()` and use the same chrome as the game's own
explanatory blocks — ticket container, title, divider, `yield-bar-base`, hint — so the
section reads identically wherever it appears.

## ⚠️ `waitForLayout`, not `afterAttach`

```js
afterAttach() {
    waitForLayout(() => this.buildSections());
    // ... five listeners
}
```

`fxs-subsystem-frame` **rearranges its children after build**. Inserting during `afterAttach`
silently put the section at the end of the frame instead of at the requested position — no
error, just the wrong place.

Anchors are feature-detected, and finding neither is a logged failure rather than a throw:

```js
const overviewHost = this.component.subsystemFrame?.querySelector(".flex.flex-col.pb-4.px-4")
                  ?? this.component.subsystemFrame;
...
if (!this.specialist && !this.overview) {
    console.error("najane-specialists: found nowhere to attach the common yields section");
    return;
}
```

⚠️ **`.flex.flex-col.pb-4.px-4` is a game-internal class combination** and the most likely
thing to break on a patch. The `??` fallback to the frame itself means the section still
appears, in a worse position, rather than vanishing.

## The five refresh triggers

Every one of these can change what the section should say:

| Event | What changed |
|---|---|
| `PlotWorkersUpdatedEventName` | a worker was placed — the baseline moved |
| `InterfaceModeChangedEventName` | entering/leaving placement, i.e. another city |
| `PlacePopulationSelectionChangedEventName` | the selection inside the panel |
| `ModifierChangedEventName` | the key went down or up — the **hint** flips |
| `NajaneOptionsChangedEventName` | `onlyNonZeroCommon`, or anything affecting the hint |

⚠️ **`beforeDetach` must remove all five.** It is currently an exact mirror of `afterAttach`;
the panel is attached and detached on every entry into placement mode, so a listener left
behind leaks once per city visited. If you add a sixth listener, add it in both places in
the same edit.

## What `refresh()` draws

1. Ask for the baseline. **If it is empty, hide both sections** (`classList.add("hidden")`)
   rather than drawing an empty bar — a city with one workable tile has no "common" part.
2. Walk the **city's own yields** in `GameInfo.Yields` index order, and for each, look up
   the common value.
3. If `onlyNonZeroCommon` is on, **drop yields with no common value**. ⚠️ This is a
   presentation filter applied here, in the consumer — the baseline itself is untouched.
4. Feed `yield-bar-base` through two attributes, as JSON:

```js
target.bar.setAttribute("data-yield-bar",    barDataJSON);   // the city's totals
target.bar.setAttribute("data-yield-deltas", barDeltasJSON); // the common values, styled
```

`YieldBarEntryStyle.GAIN` / `LOSS` / `NONE` colour each entry by the sign of the common
value.

### `getCityYields()`

```js
const city = Cities.get(PlotWorkersManager.cityID);
const yields = city?.Yields?.getYields();
```

⚠️ **The same source the game's own bars use**, indexed by `GameInfo.Yields` order — which
is the only link between a position in that array and what the number means. Every `?.` in
that chain is there because the panel can refresh in states where placement has already
ended.

### The hint line

```js
const hintText = Locale.compose(
    isOriginalDisplayActive() ? "LOC_NAJANE_SPECIALISTS_KEY_TO_DIFF"
                              : "LOC_NAJANE_SPECIALISTS_KEY_TO_ORIGINAL",
    getAlternativeViewKeyLabel());
```

⚠️ **Composed in code, not through `data-l10n-id`**, because the attribute cannot take a
runtime argument — and the argument here is whatever key the player has bound. The hint
names both the key and *where it leads*, so it follows the current view as well as the
binding. The static header above it does use `data-l10n-id`, correctly.

⚠️ **It reads `isOriginalDisplayActive()`, not "is the key held"** — see
[view mode](05-input-and-view-mode.md). Getting this wrong makes the hint offer the view
already on screen.

## The styling note worth keeping

```js
// yield-bar-base sets "justify-between" on itself, which is fine for the full set of
// yields but leaves huge gaps once some are filtered out.
bar.style.justifyContent = "center";
```

An inline style beats the component's own class. With `onlyNonZeroCommon` on, two entries
would otherwise sit at opposite ends of the panel.

## Diagnostics hook

```js
if (!this.diagnosticsDone && PlotWorkersManager.workablePlots.length > 0) {
    this.diagnosticsDone = true;
    dumpSpecialistDiagnostics();
}
```

Fires **once**, and only after there is real data — the first refresh often happens before
the plot list is populated. `dumpSpecialistDiagnostics()` is itself a no-op unless
`DIAGNOSTICS` is on; see [the baseline model](04-baseline-model.md).
