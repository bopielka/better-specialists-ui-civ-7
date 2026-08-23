# 07 — `ui/worker-yields-layer-patch.js` — the map layer

259 lines, and the most fragile file in the mod. It replaces one method on the singleton
`fxs-worker-yields-layer` so a specialist tile shows **only how it deviates** from the
city's common value, and it owns every redraw the game does not do for us.

## Installing the patch

```js
const layer = LensManager.layers.get("fxs-worker-yields-layer");
if (layer.__najaneBaselinePatched) return true;      // ⚠️ never patch twice
layer.__najaneBaselinePatched = true;
const originalUpdateSpecialistPlot = layer.updateSpecialistPlot;
layer.updateSpecialistPlot = function (info) { ... };
```

- ⚠️ **The instance, not the file.** `LensManager.layers` holds singletons; replacing a
  method there leaves the game's own file — and every other mod patching it — intact.
- ⚠️ **The guard flag matters.** A second pass would capture the *patched* method as "the
  original" and recurse.
- ⚠️ **The layer registers after mod scripts run**, so the first attempt at
  `engine.whenReady` fails. The retry hangs off `InterfaceModeChangedEventName` and removes
  itself on success. Do not collapse this into one attempt.

## The four ways out to the original

`updateSpecialistPlot` delegates to the untouched implementation when:

| Condition | Why |
|---|---|
| `isOriginalDisplayActive()` | the player is holding the key (or inverted the default) |
| `!isSpecialistPlot(info)` | rural / expansion tiles keep their own display, always |
| — | *(blocked tiles do **not** delegate; see below)* |

⚠️ **`fullYieldsOnHover` used to be on that list and no longer is.** Handing the tile back to
the game reintroduced the very thing this mod exists to undo: the game draws a yield's
**gain** and its **upkeep** as two separate pills, so a specialist paying 5 happiness to earn
3 showed `+3` and `-5` side by side rather than the `-2` it actually costs. The option now
means "subtract nothing on this tile" instead of "delegate", and the figures come from this
mod's own deltas — which already sum the two. Holding the alternative-view key still reaches
the game's untouched display, so nothing was lost.

Everything below that point is this mod's own drawing.

## Computing the pills

```js
for (let i = 0; i < GameInfo.Yields.length; i++) {
    if (!deltas.has(i) && !baseline.has(i)) continue;
    const common = baseline.get(i) ?? 0;
    const effectiveCommon =
        (skipNegativeBaseline && common < 0) || (skipPositiveBaseline && common > 0) ? 0 : common;
    const deviation = Math.round(((deltas.get(i) ?? 0) - effectiveCommon) * 10) / 10;
    if (deviation === 0 || (deviation < 0 && !showNegatives)) continue;
    pillsToAdd.push({ yieldDelta: deviation, yieldType: yieldDefinition.YieldType });
}
```

Four things to understand here:

0b. ⚠️ **`splitGainFromUpkeep`** — on a full-value tile, "do not aggregate negative yields"
   is read **literally**: the upkeep is not folded into the gain, and the yield gets two
   pills (`+3` and `-5`) instead of one (`-2`). It applies **only** where full figures are
   shown: a deviation from the common value cannot be split into halves, because the common
   value is itself a sum. The halves come from `computePlotSpecialistYieldParts()`.
0. **`showFullYields` zeroes the common value** for the hovered tile
   (`const common = showFullYields ? 0 : (baseline.get(i) ?? 0);`), which also makes both
   skip flags moot — subtracting nothing is subtracting nothing.
1. ⚠️ **The loop walks yield indexes directly** instead of building a `Set` from two spread
   arrays per tile. `GameInfo.Yields` is short and this runs **for every tile**.
2. ⚠️ **`skipNegativeBaseline` / `skipPositiveBaseline` are applied here, not in the
   model.** These two options are only about what the *tiles* show; the panel must keep
   listing the full common values. They are exact mirrors: each keeps its side of the scale
   out of the subtraction, so a tile shows that value in full even when every tile has the
   same one. See [Architecture](02-architecture.md) for why this separation is a rule.
3. **Rounding to one decimal** matches the model, so a residue never becomes a visible pill.
4. ⚠️ **The loop is gated on `showPills`** (`for (let i = 0; showPills && ...)`) rather than
   running and throwing the result away — see the filter section above; this runs for every
   tile.
5. **Negatives are gated** on `isHovered || alwaysShowNegatives` — a screen full of identical
   upkeep numbers drowns out the differences that are the point of the mod.

## ⚠️ "Show only the highest X" — the filters union, never intersect

Seven options, one per yield, any number of them on at once:

```js
function passesHighestOnlyFilters(info) {
    const yieldTypes = getActiveHighestOnlyYields();
    if (yieldTypes.length === 0) return true;          // no filter on - every tile shows
    for (const yieldType of yieldTypes) {
        if (getHighestYieldPlots(yieldType).has(info.PlotIndex)) return true;
    }
    return false;
}
```

| Rule | Why |
|---|---|
| A tile survives if it wins **any** enabled yield | ⚠️ Intersecting them would make a second checkbox usually **empty the map** — the best science tile is rarely also the best food tile |
| A yield with **no standout tile** does not take part | nothing reaches the common value + 1, so there is no winner to point at — see [the model](04-baseline-model.md) |
| If **no** enabled yield has one, the rule does not apply and every tile keeps its pills | ⚠️ A level field is a reason to leave the map alone, **not** to blank it. `passesHighestOnlyFilters` returns `!anyYieldEngaged`, not `false`. |
| Only the **pills** are dropped; pips stay | a losing tile is still somewhere a specialist can go, and free/blocked slots must stay visible |
| The **hovered** tile is exempt | the cursor is this mod's inspection tool everywhere else too, so a filtered map stays explorable |
| City Hall's extras still draw | the filter is about yields, not about another mod's building slots |
| Filters do **not** apply in the original view | holding the key means "the game's untouched display", and that is not negotiable |

The enabled list is **memoised**, because the layer asks once per tile:

```js
activeHighestOnlyYields ??= NajaneOptions.getHighestOnlyYieldTypes();
```

⚠️ **The memo is dropped before the redraw**, not after — the options-changed listener
clears it and *then* calls `redrawLayer()`, which would otherwise repaint using the previous
answer.

⚠️ `hoverAffectsRendering()` must return `true` while any filter is active, or the two-tile
hover repaint is skipped and the hovered tile never reveals its numbers. It asks whether a
filter **actually engaged**, not merely whether a checkbox is ticked — a filter with no
standout tile changes nothing on screen, and repainting for it on every cursor move would be
pure waste.

## Drawing

Pips first — one per worker slot, `full` / `empty` / `bad` — positioned with the layer's own
`getSpecialistPipOffsetsAndScale(i, workerCap - 1)`, at `z = ICON_Z_OFFSET` (5), blocked ones
at `alpha = 0.5`.

⚠️ **Blocked tiles return right after the pips** (`if (info.IsBlocked) return;`). A tile that
cannot take a specialist has no deviation worth showing, but it must still show *why* — the
`specialist_tile_pip_bad` pips.

Then the pills, through the layer's own helpers:

```js
this.addPositiveYield(this.yieldVisualizer, location, pill, positiveIndex++, positiveTotal, this.yieldSpritePadding);
this.addNegativeYield(this.yieldVisualizer, location, pill, negativeIndex++, negativeTotal, this.yieldSpritePadding);
```

⚠️ **The index/total pair is what spaces them.** Both counts are computed in a first pass
before anything is drawn — passing a running index without the correct total lays the pills
out for a different number of pills than there are.

## ⚠️ `drawCompanionExtras` — being a good citizen after replacing

City Hall (`bz-city-hall`) wraps this same method **the well-behaved way**: call the previous
implementation, then draw building-slot icons above the tile. This mod's patch installs
afterwards and deliberately does **not** delegate, so their step was being skipped — their
icons only appeared while the original view was on screen.

Their work is re-applied at the end instead:

```js
if (typeof this.realizeBuildSlots !== "function" || !this.bzGridSpritePosition) return;  // not installed
const topOffset = this.getSpecialistPipOffsetsAndScale(-1, PlotWorkersManager.cityWorkerCap - 1);
this.bzGridSpritePosition.y = topOffset.yOffset;
this.realizeBuildSlots(Districts.get(MapCities.getDistrict(location.x, location.y)));
```

Everything is feature-detected and wrapped in `try` / `catch`, so it is a no-op without City
Hall and degrades quietly if they restructure. `getSpecialistPipOffsetsAndScale` is called
through `this`, so their improved pip layout is picked up automatically.

⚠️ **This reaches into another mod's internals** and is the second most likely thing to break
here. See [known gaps](11-known-gaps.md).

## Redrawing — the part that is easy to get wrong

The game redraws the layer on its own events. Everything this mod adds — the key, the
options, the hover — is invisible to it, so the mod redraws itself.

### `redrawLayer()` — everything

Mirrors what the layer's own `applyLayer()` does:

```js
layer.yieldVisualizer.clear();
layer.realizeGrowthPlots();
const city = Cities.get(PlotWorkersManager.cityID);
if (city && !city.isTown) { layer.realizeWorkablePlots(); layer.realizeBlockedPlots(); }
```

⚠️ **`isTown` is not a detail.** Towns have no workable specialist plots; calling those two
on one is not what the game does.

Used for `ModifierChangedEventName` and `NajaneOptionsChangedEventName` — both change **every
tile at once**.

### `redrawPlot(plotIndex)` — one tile

```js
const info = PlotWorkersManager.allWorkerPlots.find((p) => p.PlotIndex === plotIndex);
layer.yieldVisualizer.clearPlot(GameplayMap.getLocationFromIndex(plotIndex));
layer.updateSpecialistPlot(info);
```

⚠️ **`allWorkerPlots`, not `workablePlots`** — the tile being *left* may no longer be in the
workable set.

### Why hover does not redraw the map

⚠️ **A full redraw is expensive**: `realizeGrowthPlots()` walks the city's entire growth
domain, and falls back to scanning the **whole map** when that is unavailable. Repainting all
of it on every cursor move was pure waste — hover only decides whether **one** tile shows its
negative pills.

```js
function hoverAffectsRendering() {
    if (isOriginalDisplayActive())        return false;  // the game's display ignores hover
    if (NajaneOptions.fullYieldsOnHover)  return true;   // the hovered tile falls back
    return !NajaneOptions.alwaysShowNegatives;           // otherwise only the negatives gate
}
```

`onHoveredPlotChanged` repaints **exactly two tiles** — the one being left and the one being
entered — and skips the work entirely when hover changes nothing. `lastHoveredPlotIndex` is
module state because the event does not carry the previous value.

## If you change this file

- Ask what a delegating mod downstream of you would lose.
- Ask whether the change needs a **full** redraw or a **plot** redraw, and wire the event
  accordingly — a change nobody redraws for looks like a caching bug.
- Ask whether it belongs in the layer at all: if the panel would need the same number, it
  belongs in [the baseline model](04-baseline-model.md); if it is presentation, it belongs
  here.
