import LensManager from '/core/ui/lenses/lens-manager.js';
import { InterfaceModeChangedEventName } from '/core/ui/interface-modes/interface-modes.js';
import PlotWorkersManager, { PlotWorkersHoveredPlotChangedEventName } from '/base-standard/ui/plot-workers/plot-workers-manager.js';
import { computePlotSpecialistDeltas, computeSpecialistYieldBaseline, isSpecialistPlot } from '/najane-common-specialists-yields/ui/model-specialists-yield-baseline.js';
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
        // "Full yields on hover" hands the hovered tile back to the game untouched,
        // so the cursor acts as a magnifying glass over an otherwise reduced map.
        if (isOriginalDisplayActive()
            || !isSpecialistPlot(info)
            || (isHovered && NajaneOptions.fullYieldsOnHover)) {
            return originalUpdateSpecialistPlot.call(this, info);
        }

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

        // Walk the yield indexes directly instead of building a Set from two spread
        // arrays per tile; GameInfo.Yields is short and this runs for every tile.
        const pillsToAdd = [];
        for (let i = 0; i < GameInfo.Yields.length; i++) {
            if (!deltas.has(i) && !baseline.has(i)) {
                continue;
            }
            const yieldDefinition = GameInfo.Yields[i];
            if (!yieldDefinition) {
                continue;
            }
            const common = baseline.get(i) ?? 0;
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
    window.addEventListener(NajaneOptionsChangedEventName, redrawLayer);
    window.addEventListener(PlotWorkersHoveredPlotChangedEventName, onHoveredPlotChanged);
});
