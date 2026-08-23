import LensManager from '/core/ui/lenses/lens-manager.js';
import { InterfaceModeChangedEventName } from '/core/ui/interface-modes/interface-modes.js';
import PlotWorkersManager, { PlotWorkersHoveredPlotChangedEventName } from '/base-standard/ui/plot-workers/plot-workers-manager.js';
import { computePlotSpecialistDeltas, computePlotSpecialistYieldParts, computeSpecialistYieldBaseline, getHighestYieldPlots, isSpecialistPlot } from '/najane-common-specialists-yields/ui/model-specialists-yield-baseline.js';
import NajaneOptions, { NajaneOptionsChangedEventName } from '/najane-common-specialists-yields/ui/options/najane-options.js';
import { ModifierChangedEventName } from '/najane-common-specialists-yields/ui/modifier-tracker.js';
import { isOriginalDisplayActive } from '/najane-common-specialists-yields/ui/view-mode.js';

/**
 * Patches the singleton 'fxs-worker-yields-layer' so a specialist tile shows only how it
 * deviates from the city's common yield. Rural tiles are left entirely alone.
 *
 * ⚠️ Patches the INSTANCE registered in LensManager.layers, never the game's file, so other
 * mods patching the same method survive. ⚠️ The layer registers AFTER mod scripts run,
 * hence the retry at the bottom. See documentation/07-map-layer.md.
 */
const WORKER_YIELDS_LAYER_ID = "fxs-worker-yields-layer";
const ICON_Z_OFFSET = 5;
const SPECIALIST_PIP_BLOCKED_ALPHA = 0.5;

let patchedLayer = null;

/**
 * Re-runs what other mods add to this method, which replacing it would otherwise drop.
 *
 * ⚠️ City Hall wraps updateSpecialistPlot the well-behaved way (call previous, then draw
 * building slots); this patch does NOT delegate, so their step was being skipped and their
 * icons only showed in the original view. Feature-detected: a no-op without City Hall.
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
 * ⚠️ They UNION, never intersect: a tile shows if it wins ANY enabled yield. Intersecting
 * would make a second checkbox empty the map. ⚠️ A yield with no standout tile takes no
 * part, and if none of them has one the rule does not apply at all - a level field is a
 * reason to leave the map alone, not to blank it. Losing tiles keep their pips.
 */
let activeHighestOnlyYields = null;

function getActiveHighestOnlyYields() {
    // Recomputed only when an option changes; the layer asks this once per tile.
    activeHighestOnlyYields ??= NajaneOptions.getHighestOnlyYieldTypes();
    return activeHighestOnlyYields;
}

/** Whether the hovered tile can differ from any other because of these filters. */
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

        // "Full yields on hover" makes the cursor a magnifying glass: the tile shows its own
        // complete figures rather than the deviation.
        // ⚠️ It used to delegate to the game here, which brought back the thing this mod
        // undoes - the game draws a yield's gain and upkeep as two pills, so paying 5
        // happiness to earn 3 read "+3 -5" instead of "-2". Holding the alternative-view
        // key still reaches the untouched display, so delegating here buys nothing.
        const showFullYields = isHovered && NajaneOptions.fullYieldsOnHover;

        // ⚠️ "Do not aggregate negative yields" read literally: keep the upkeep out of the
        // gain. Only where FULL figures are shown - a deviation cannot be split in halves,
        // because the common value is itself a sum of them.
        const splitGainFromUpkeep = showFullYields && NajaneOptions.dontAggregateNegatives;
        const parts = splitGainFromUpkeep ? computePlotSpecialistYieldParts(info) : null;

        const baseline = computeSpecialistYieldBaseline();
        const deltas = computePlotSpecialistDeltas(info);
        const showNegatives = isHovered || NajaneOptions.alwaysShowNegatives;
        // ⚠️ Applied here, not in the shared baseline: these are about what the TILES show,
        // and the panel must keep listing the full common values. Exact mirrors of each
        // other - each keeps its side of the scale out of the subtraction.
        const skipNegativeBaseline = NajaneOptions.dontAggregateNegatives;
        const skipPositiveBaseline = NajaneOptions.dontAggregatePositives;

        // "Show only the highest X" drops this tile's pills unless it wins one of the enabled
        // yields. ⚠️ The hovered tile is always exempt, so a filtered map stays explorable.
        const showPills = isHovered || passesHighestOnlyFilters(info);

        // Walked by index rather than building a Set per tile; this runs for every tile.
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
 * Full redraw, mirroring applyLayer(). Needed whenever something outside the game's own
 * events changes what should be drawn: the key, an option.
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
 * ⚠️ Hover decides only whether ONE tile differs, and a full redraw is expensive -
 * realizeGrowthPlots() walks the city's whole growth domain, falling back to the entire map.
 * So only the tile being left and the one being entered are repainted, and when hover
 * changes nothing at all the work is skipped.
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
