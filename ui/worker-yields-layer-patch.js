import LensManager from '/core/ui/lenses/lens-manager.js';
import { InterfaceModeChangedEventName } from '/core/ui/interface-modes/interface-modes.js';
import PlotWorkersManager, { PlotWorkersHoveredPlotChangedEventName } from '/base-standard/ui/plot-workers/plot-workers-manager.js';
import { computePlotSpecialistDeltas, computePlotSpecialistYieldParts, computeSpecialistYieldBaseline, getHighestYieldPlots, isSpecialistPlot } from '/najane-common-specialists-yields/ui/model-specialists-yield-baseline.js';
import NajaneOptions, { NajaneOptionsChangedEventName } from '/najane-common-specialists-yields/ui/options/najane-options.js';
import { ModifierChangedEventName } from '/najane-common-specialists-yields/ui/modifier-tracker.js';
import { isOriginalDisplayActive } from '/najane-common-specialists-yields/ui/view-mode.js';

/**
 * Patches the singleton 'fxs-worker-yields-layer' so a specialist tile shows
 * ONLY how it deviates from the city's common specialist yield (which the panel
 * states once). Rural/expansion tiles are left entirely alone.
 *
 * Display rules:
 *  - Holding the alternative-view key (Tab by default, rebindable in the keyboard
 *    mapping screen) falls back to the game's untouched output. The "original by
 *    default" option inverts that, so the key becomes the way to see the mod's view.
 *  - Negative pills are hidden unless the tile is hovered, so a screen full of
 *    identical upkeep numbers does not drown out the interesting differences.
 *    The "always show negatives" option turns them back on everywhere.
 *
 * Technique: LensManager keeps registered layers in a public `layers` Map, so
 * the registered instance's method can be replaced without overwriting the
 * game's file (which would break other mods and every patch). The layer
 * registers AFTER mod scripts run, hence the retry on interface-mode change.
 */
const WORKER_YIELDS_LAYER_ID = "fxs-worker-yields-layer";
const ICON_Z_OFFSET = 5;
const SPECIALIST_PIP_BLOCKED_ALPHA = 0.5;

let patchedLayer = null;

/**
 * Re-runs what other mods add to this same method, which replacing it would otherwise
 * drop.
 *
 * City Hall (bz-city-hall) wraps updateSpecialistPlot in the well-behaved way - call
 * the previous implementation, then draw building slot icons above the tile. This
 * mod's patch is installed afterwards and deliberately does NOT delegate (it replaces
 * the yield pills wholesale), so their step was being skipped: the icons only showed
 * up while the original view was on screen.
 *
 * Their extras are re-applied here instead. Everything is feature-detected, so this is
 * a no-op when City Hall is absent and degrades quietly if they restructure their code.
 * `getSpecialistPipOffsetsAndScale` is called through `this`, so their improved pip
 * layout is picked up automatically as well.
 */
function drawCompanionExtras(info, location) {
    if (typeof this.realizeBuildSlots !== "function" || !this.bzGridSpritePosition) {
        return;   // City Hall not installed
    }
    try {
        const workerCap = PlotWorkersManager.cityWorkerCap;
        const topOffset = this.getSpecialistPipOffsetsAndScale(-1, workerCap - 1);
        this.bzGridSpritePosition.y = topOffset.yOffset;
        const districtID = MapCities.getDistrict(location.x, location.y);
        this.realizeBuildSlots(Districts.get(districtID));
    } catch (e) {
        console.error(`najane-specialists: could not redraw City Hall building slots: ${e}`);
    }
}

/**
 * The "show only the tiles with the highest X" filters.
 *
 * ⚠️ Any number of them can be on at once, so they UNION and never intersect: a tile is
 * shown if it wins ANY enabled yield. Intersecting them would make a second checkbox
 * usually empty the map, since the best science tile is rarely also the best food tile.
 *
 * ⚠️ A yield with no standout tile - nothing reaching the common value plus one - returns
 * an empty set and simply does not take part. If NONE of the enabled yields has one, the
 * rule does not apply at all and every tile keeps its pills. That is deliberately not the
 * same as "no tile qualifies, so show nothing": a level field is a reason to leave the map
 * alone, not to blank it. See getHighestYieldPlots().
 *
 * A losing tile keeps its specialist pips - it is still a place a specialist can go, and
 * the player still needs to see free and blocked slots. Only the yield pills are dropped.
 */
let activeHighestOnlyYields = null;

function getActiveHighestOnlyYields() {
    // Recomputed only when an option changes; the layer asks this once per tile.
    activeHighestOnlyYields ??= NajaneOptions.getHighestOnlyYieldTypes();
    return activeHighestOnlyYields;
}

/**
 * Whether the hovered tile can differ from any other tile because of these filters.
 * ⚠️ Asks the same question the filter itself does, rather than merely whether a checkbox
 * is ticked: a filter with no standout tile changes nothing on screen, and repainting for
 * it on every cursor move would be pure waste.
 */
function isHighestOnlyFilterActive() {
    for (const yieldType of getActiveHighestOnlyYields()) {
        if (getHighestYieldPlots(yieldType).size > 0) {
            return true;
        }
    }
    return false;
}

function passesHighestOnlyFilters(info) {
    const yieldTypes = getActiveHighestOnlyYields();
    if (yieldTypes.length === 0) {
        return true;   // no filter on - every tile keeps its pills
    }
    let anyYieldEngaged = false;
    for (const yieldType of yieldTypes) {
        const winners = getHighestYieldPlots(yieldType);
        if (winners.size === 0) {
            continue;   // no tile stands out for this yield - it filters nothing
        }
        anyYieldEngaged = true;
        if (winners.has(info.PlotIndex)) {
            return true;
        }
    }
    return !anyYieldEngaged;   // nothing engaged at all - the rule does not apply
}

function applyPatch() {
    const layer = LensManager.layers.get(WORKER_YIELDS_LAYER_ID);
    if (!layer) {
        return false;
    }
    if (layer.__najaneBaselinePatched) {
        return true;
    }
    layer.__najaneBaselinePatched = true;
    patchedLayer = layer;

    const originalUpdateSpecialistPlot = layer.updateSpecialistPlot;

    layer.updateSpecialistPlot = function (info) {
        const isHovered = PlotWorkersManager.hoveredPlotIndex === info.PlotIndex;
        if (isOriginalDisplayActive() || !isSpecialistPlot(info)) {
            return originalUpdateSpecialistPlot.call(this, info);
        }

        // "Full yields on hover" makes the cursor a magnifying glass: the hovered tile shows
        // its own complete figures instead of the deviation from the common value.
        //
        // ⚠️ It used to hand the tile back to the game untouched, which reintroduced the one
        // thing this mod exists to undo: the game draws a yield's GAIN and its UPKEEP as two
        // separate pills, so a specialist paying 5 happiness to earn 3 showed "+3" and "-5"
        // side by side instead of the -2 it actually costs. The figures are now drawn from
        // this mod's own deltas, which already sum the two - one pill per yield, full value.
        //
        // Holding the alternative-view key still reaches the game's untouched display, so
        // nothing is lost by not delegating here.
        const showFullYields = isHovered && NajaneOptions.fullYieldsOnHover;

        // ⚠️ "Do not aggregate negative yields" is read literally on a full-value tile: do
        // not fold the upkeep into the gain, show both. So a specialist paying 5 happiness
        // to earn 3 reads "+3" and "-5" with the option on, and "-2" with it off. Only
        // applies where the full figures are shown - a deviation from the common value
        // cannot be split into halves, because the common value is itself a sum.
        const splitGainFromUpkeep = showFullYields && NajaneOptions.dontAggregateNegatives;
        const parts = splitGainFromUpkeep ? computePlotSpecialistYieldParts(info) : null;

        const baseline = computeSpecialistYieldBaseline();
        const deltas = computePlotSpecialistDeltas(info);
        const showNegatives = isHovered || NajaneOptions.alwaysShowNegatives;
        // Applied here rather than in the shared baseline: these two options are only
        // about what the tiles show, the panel must keep listing the full common values.
        // They are exact mirrors of each other - each keeps its side of the scale out
        // of the subtraction, so a tile shows that value in full even when every tile
        // has the same one.
        const skipNegativeBaseline = NajaneOptions.dontAggregateNegatives;
        const skipPositiveBaseline = NajaneOptions.dontAggregatePositives;

        // "Show only the highest X" hides this tile's pills unless it wins one of the
        // enabled yields. The hovered tile is always exempt: the cursor is this mod's
        // inspection tool everywhere else too (negatives, full yields), so a filtered map
        // stays explorable rather than becoming unreadable.
        const showPills = isHovered || passesHighestOnlyFilters(info);

        // Walk the yield indexes directly instead of building a Set from two spread
        // arrays per tile; GameInfo.Yields is short and this runs for every tile.
        const pillsToAdd = [];
        for (let i = 0; showPills && i < GameInfo.Yields.length; i++) {
            if (!deltas.has(i) && !baseline.has(i)) {
                continue;
            }
            const yieldDefinition = GameInfo.Yields[i];
            if (!yieldDefinition) {
                continue;
            }
            if (splitGainFromUpkeep) {
                const part = parts.get(i);
                if (part) {
                    if (part.gain !== 0) {
                        pillsToAdd.push({ yieldDelta: part.gain, yieldType: yieldDefinition.YieldType });
                    }
                    if (part.upkeep !== 0 && showNegatives) {
                        pillsToAdd.push({ yieldDelta: part.upkeep, yieldType: yieldDefinition.YieldType });
                    }
                }
                continue;
            }
            // Full yields means "subtract nothing", which also makes both skip flags moot.
            const common = showFullYields ? 0 : (baseline.get(i) ?? 0);
            const effectiveCommon =
                (skipNegativeBaseline && common < 0) || (skipPositiveBaseline && common > 0)
                    ? 0
                    : common;
            const deviation = Math.round(((deltas.get(i) ?? 0) - effectiveCommon) * 10) / 10;
            if (deviation === 0 || (deviation < 0 && !showNegatives)) {
                continue;
            }
            pillsToAdd.push({ yieldDelta: deviation, yieldType: yieldDefinition.YieldType });
        }

        const currentWorkers = info.NumWorkers;
        const workerCap = info.MaxWorkers;
        const location = GameplayMap.getLocationFromIndex(info.PlotIndex);
        for (let i = 0; i < workerCap; i++) {
            const offsetAndScale = this.getSpecialistPipOffsetsAndScale(i, workerCap - 1);
            if (i < currentWorkers) {
                this.yieldVisualizer.addSprite(
                    location,
                    "specialist_tile_pip_full",
                    { x: offsetAndScale.xOffset, y: offsetAndScale.yOffset, z: ICON_Z_OFFSET },
                    { scale: offsetAndScale.scale }
                );
            } else {
                const texture = info.IsBlocked ? "specialist_tile_pip_bad" : "specialist_tile_pip_empty";
                this.yieldVisualizer.addSprite(
                    location,
                    texture,
                    { x: offsetAndScale.xOffset, y: offsetAndScale.yOffset, z: ICON_Z_OFFSET },
                    { scale: offsetAndScale.scale, alpha: info.IsBlocked ? SPECIALIST_PIP_BLOCKED_ALPHA : 1 }
                );
            }
        }

        if (info.IsBlocked) {
            return;
        }

        let positiveTotal = 0;
        let negativeTotal = 0;
        for (const pill of pillsToAdd) {
            if (pill.yieldDelta > 0) {
                positiveTotal++;
            } else {
                negativeTotal++;
            }
        }
        let positiveIndex = 0;
        let negativeIndex = 0;
        for (const pill of pillsToAdd) {
            if (pill.yieldDelta > 0) {
                this.addPositiveYield(this.yieldVisualizer, location, pill, positiveIndex++, positiveTotal, this.yieldSpritePadding);
            } else {
                this.addNegativeYield(this.yieldVisualizer, location, pill, negativeIndex++, negativeTotal, this.yieldSpritePadding);
            }
        }

        drawCompanionExtras.call(this, info, location);
    };

    return true;
}

/**
 * Full redraw of the layer, mirroring what applyLayer() does. Needed whenever
 * something outside the game's own events changes what should be drawn:
 * Shift, hover, or an option.
 */
function redrawLayer() {
    const layer = patchedLayer;
    if (!layer || !PlotWorkersManager.cityID) {
        return;   // layer not patched yet, or not in the placement mode
    }
    try {
        layer.yieldVisualizer.clear();
        layer.realizeGrowthPlots();
        const city = Cities.get(PlotWorkersManager.cityID);
        if (city && !city.isTown) {
            layer.realizeWorkablePlots();
            layer.realizeBlockedPlots();
        }
    } catch (e) {
        console.error(`najane-specialists: redraw failed: ${e}`);
    }
}

/** Repaint a single plot without touching the rest of the map. */
function redrawPlot(plotIndex) {
    const layer = patchedLayer;
    if (!layer || plotIndex == null) {
        return;
    }
    const info = PlotWorkersManager.allWorkerPlots.find((p) => p.PlotIndex === plotIndex);
    if (!info) {
        return;
    }
    try {
        layer.yieldVisualizer.clearPlot(GameplayMap.getLocationFromIndex(plotIndex));
        layer.updateSpecialistPlot(info);
    } catch (e) {
        console.error(`najane-specialists: plot redraw failed: ${e}`);
    }
}

/**
 * Hover only decides whether ONE tile shows its negative pills, so repainting the
 * whole map on every cursor move was pure waste - and a full redraw is expensive:
 * realizeGrowthPlots() walks the city's entire growth domain (and falls back to
 * scanning the whole map when that is unavailable).
 * Only the tile being left and the tile being entered can change, so only those
 * two are repainted. When negatives are shown everywhere anyway, hover changes
 * nothing at all and the work is skipped entirely.
 */
let lastHoveredPlotIndex = null;

/** Whether the hovered tile is drawn differently from any other tile. */
function hoverAffectsRendering() {
    if (isOriginalDisplayActive()) {
        return false;   // the game's own display ignores hover
    }
    if (NajaneOptions.fullYieldsOnHover) {
        return true;    // the hovered tile falls back to full figures
    }
    if (isHighestOnlyFilterActive()) {
        return true;    // the hovered tile is exempt from the filter, so it draws differently
    }
    // Negatives are gated to the hovered tile unless they are shown everywhere.
    return !NajaneOptions.alwaysShowNegatives;
}

function onHoveredPlotChanged() {
    const current = PlotWorkersManager.hoveredPlotIndex ?? null;
    const previous = lastHoveredPlotIndex;
    lastHoveredPlotIndex = current;
    if (previous === current || !hoverAffectsRendering()) {
        return;
    }
    redrawPlot(previous);
    redrawPlot(current);
}

engine.whenReady.then(() => {
    if (!applyPatch()) {
        window.addEventListener(InterfaceModeChangedEventName, function retry() {
            if (applyPatch()) {
                window.removeEventListener(InterfaceModeChangedEventName, retry);
            }
        });
    }
    // Shift and option changes affect every tile, so those need the full redraw.
    window.addEventListener(ModifierChangedEventName, redrawLayer);
    window.addEventListener(NajaneOptionsChangedEventName, () => {
        activeHighestOnlyYields = null;   // ⚠️ drop the memo BEFORE redrawing with it
        redrawLayer();
    });
    window.addEventListener(PlotWorkersHoveredPlotChangedEventName, onHoveredPlotChanged);
});
