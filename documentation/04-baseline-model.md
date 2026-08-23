# 04 — `ui/model-specialists-yield-baseline.js` — what "common" means

191 lines. The only file that decides **what the numbers are**; everything else consumes it.
It reads plot data and writes no game state.

```js
export function invalidateSpecialistCaches()
export function isSpecialistPlot(info)               // urban tile?
export function computePlotSpecialistDeltas(info)    // Map(yieldIndex -> net change)
export function computePlotSpecialistYieldParts(info) // Map(yieldIndex -> { gain, upkeep })
export function computeSpecialistYieldBaseline()     // Map(yieldIndex -> the common part)
export function getHighestYieldPlots(yieldType)      // Set(PlotIndex) tied for the best
export function dumpSpecialistDiagnostics()          // no-op unless DIAGNOSTICS
export const DIAGNOSTICS = false
```

## The three steps

```
plots  →  isSpecialistPlot     →  the urban, unblocked subset
       →  computePlotSpecialistDeltas  →  one Map of net changes per plot
       →  pickCommonValue      →  one number per yield: the shared part
```

### 1. `isSpecialistPlot(info)` — which tiles count

```js
const district = Districts.getAtLocation(GameplayMap.getLocationFromIndex(info.PlotIndex));
return !!district && (district.type == DistrictTypes.URBAN
                   || district.type == DistrictTypes.CITY_CENTER);
```

⚠️ **Rural tiles must not be folded in.** Placing on a rural tile is a *population
expansion*: it creates an improvement and yields the tile's own output, which has nothing to
do with what a specialist gives. Including them would poison every common value, and the
layer relies on the same predicate to leave those tiles' display completely alone.

⚠️ **Urban means `URBAN` *or* `CITY_CENTER`.** The game itself treats the pair as the urban
set (`support-city-decoration.js`, `getIdsOfTypes([URBAN, CITY_CENTER])`). Testing `URBAN`
alone silently drops the city centre from the baseline.

`getSpecialistPlots()` narrows further to plots that still have a free slot
(`!plot.IsBlocked`) — a full tile is not an option the player is choosing between.

### 2. `computePlotSpecialistDeltas(info)` — what one tile would actually do

Two contributions, summed:

| Source | Expression | Why |
|---|---|---|
| Yield gain | `NextYields[i] - CurrentYields[i]` | what the specialist produces |
| Upkeep | `CurrentMaintenance[i] - NextMaintenance[i]` | already negative when upkeep grows |

⚠️ **The game draws these as two separate pill groups, but the player's question is one
question**: "what does a specialist here cost me and give me?" The mod answers the sum.

Both halves are computed by `computeRawParts()` and cached **unrounded**; the sum rounds
exactly once on top of them. ⚠️ Rounding each half first and adding afterwards is not the
same arithmetic, which is why the raw values are what is kept.

`computePlotSpecialistYieldParts()` hands the halves back, rounded, for the one display that
wants them apart: a full-value tile with **"do not aggregate negative yields"** on, where
`+3` and `-5` are shown instead of `-2`. See [the map layer](07-map-layer.md).

Values are rounded to **one decimal** (`Math.round(v * 10) / 10`) and entries that round to
zero are deleted, so a floating-point residue never becomes a visible `+0` pill.

### 3. `pickCommonValue(values)` — the part every option shares

**The value closest to zero, sign kept** — with three ways of collapsing to `0`:

| Input | Common | Why |
|---|---|---|
| `+3 +5 +3` production | `+3` | the smallest gain every tile is guaranteed |
| `-4 -4 -4` food | `-4` | the cost every tile carries |
| `+8` gold on one tile, nothing elsewhere | `0` | ⚠️ a yield only some tiles produce is not common at all |
| `+2 -1` mixed signs | `0` | there is no shared part to state |
| any explicit `0` present | `0` | same reason as the third row |

⚠️ **`values` must contain one entry per specialist plot, including explicit `0`s.** The
caller builds them with `deltas.get(i) ?? 0` for exactly this reason. Pass only the plots
that *have* the yield and every rare bonus becomes "common", which then gets subtracted from
tiles that never had it — the tile would show a negative pill for a yield it does not
produce.

Yields whose common value is `0` are **left out of the returned Map entirely**. Both
consumers therefore treat "absent" and "0" identically; keep it that way.

## `getHighestYieldPlots(yieldType)` — the best tiles for one yield

The fact behind the **"show only tiles giving the most X"** options. It lives here, not in
the layer, because it is a statement about the data; *which* yields are being filtered on is
presentation and stays in the layer.

```js
getHighestYieldPlots("YIELD_SCIENCE")   // -> Set of PlotIndex
```

| Decision | Why |
|---|---|
| Ranks on the **delta**, not the deviation | ⚠️ The player is asking which tile is *best*, not which is most *unusual*. The two diverge the moment a "do not aggregate" option is on. |
| Every specialist plot contributes a value, `0` where absent | so ties are found across the whole set — and the tile that merely costs the **least** food still wins "highest food" in a city where every tile costs some |
| Ties return **every** tied plot | a single winner would be a lie about the board |
| ⚠️ The winner must beat the **common value** by `STANDOUT_THRESHOLD` (**+1**) | below that the field is effectively level, and reducing the map to one tile that wins by a rounding error hides more than it explains |
| Blocked plots never win | `getSpecialistPlots()` already excludes them; a full tile is not an option |
| The margin is **rounded before comparison** | ⚠️ `2.1 - 1.1` is `0.9999999999999998`, which fails a bare `>= 1` on numbers plainly one apart |

### ⚠️ Two kinds of yield can never qualify

Both fall out of the threshold, and both are correct rather than accidental:

| Case | Why it cannot reach common + 1 |
|---|---|
| A yield **no** plot touches | every plot ties at `0` and so does the common value — margin `0`. This is what stops a filter on a yield the city cannot produce from showing the whole map. |
| A yield every plot **only pays for** (pure upkeep, typically Food) | the common value is the value *closest to zero*, which for an all-negative set **is the best tile**. Nothing is ever above it, so there is no standout tile to point at. |

An empty set means **this yield filters nothing**, which is not the same as "no tile
qualifies, so show nothing" — see [the map layer](07-map-layer.md).

### `getYieldIndex(yieldType)`

⚠️ `GameInfo` is **scanned, not queried**, and this question is asked for every tile of every
redraw. The type → index map is therefore built **once** and, unlike everything else here,
**never invalidated** — the table cannot change while the game is running.

⚠️ It is also why the options module stores plain `YieldType` **strings** and never resolves
them: that module also loads in the **shell** scope, where the gameplay database does not
exist. See [options](08-options.md).

## Caching

```js
let cachedBaseline = null;
const cachedDeltas = new Map();        // PlotIndex -> Map(yieldIndex -> value)
const cachedIsSpecialist = new Map();  // PlotIndex -> boolean
const cachedBestPlots = new Map();     // yieldIndex -> Set(PlotIndex)
```

⚠️ **This is not an optimisation, it is a fix.** The layer calls in **once per tile**, and
each call used to re-derive the baseline from *all* plots — quadratic work with an engine
district lookup per plot per tile.

Dropped on exactly two events, both registered at import:

| Event | Why it invalidates |
|---|---|
| `PlotWorkersUpdatedEventName` | a worker was placed — every remaining option changed |
| `InterfaceModeChangedEventName` | entering or leaving placement, i.e. a different city |

⚠️ **Anything you add that changes the inputs must invalidate too.** A stale baseline does
not throw; it shows the previous city's numbers, which reads as a subtle balance mystery
rather than as a bug.

⚠️ Note what is deliberately *absent* from that list: **hover and options do not invalidate
anything.** They change presentation only, and the layer redraws without recomputing. If a
new option ever changes the baseline itself, it must dispatch an invalidation — and it
should probably not be an option at all, see [Architecture](02-architecture.md).

## Diagnostics

```js
export const DIAGNOSTICS = false;   // ⚠️ keep OFF in releases
```

`dumpSpecialistDiagnostics()` is a one-shot dump of the raw per-plot data behind the
baseline — district type, worker counts, blocked state, and the deltas — so the numbers can
be checked against what the game's own panel reports. The panel calls it once, the first
time it sees any workable plots.

- ⚠️ **It writes through `console.error` on purpose.** `console.log` does not reach
  `Logs/UI.log`; an earlier dump left no trace at all.
- ⚠️ **Which is also why it must ship off.** It writes one line per plot, and those lines
  appear as "JS Error" entries in the player's log.

Turn it on only while investigating, and check the flag before publishing.
