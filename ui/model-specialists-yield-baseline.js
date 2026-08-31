import { InterfaceModeChangedEventName } from '/core/ui/interface-modes/interface-modes.js';
import PlotWorkersManager, { PlotWorkersUpdatedEventName } from '/base-standard/ui/plot-workers/plot-workers-manager.js';

/**
 * Caches for one session of the placement UI.
 *
 * ⚠️ The layer calls in once per TILE; without these the baseline was re-derived from all
 * plots every time - quadratic, with an engine district lookup per plot per tile.
 * Dropped on the only two events that can invalidate them, below.
 */
let cachedBaseline = null;
const cachedDeltas = new Map();        // PlotIndex -> Map(yieldIndex -> value)
const cachedIsSpecialist = new Map();  // PlotIndex -> boolean
const cachedBestPlots = new Map();     // yieldIndex -> Set(PlotIndex)
const cachedParts = new Map();         // PlotIndex -> Map(yieldIndex -> { gain, upkeep }) RAW

export function invalidateSpecialistCaches() {
    cachedBaseline = null;
    cachedDeltas.clear();
    cachedIsSpecialist.clear();
    cachedBestPlots.clear();
    cachedParts.clear();
}

window.addEventListener(PlotWorkersUpdatedEventName, invalidateSpecialistCaches);
window.addEventListener(InterfaceModeChangedEventName, invalidateSpecialistCaches);

/**
 * Urban tiles only - the ones a SPECIALIST goes on.
 * ⚠️ Rural tiles are population expansions: they yield the tile's own output, which must
 * never reach the specialist baseline. URBAN + CITY_CENTER is the game's own urban set.
 */
export function isSpecialistPlot(info) {
    const cached = cachedIsSpecialist.get(info.PlotIndex);
    if (cached !== undefined) {
        return cached;
    }
    const location = GameplayMap.getLocationFromIndex(info.PlotIndex);
    const district = Districts.getAtLocation(location);
    const result = !!district
        && (district.type == DistrictTypes.URBAN || district.type == DistrictTypes.CITY_CENTER);
    cachedIsSpecialist.set(info.PlotIndex, result);
    return result;
}

/**
 * The two halves of a specialist's effect, per yield index, UNROUNDED:
 *   gain   = NextYields - CurrentYields           upkeep = CurrentMaintenance - NextMaintenance
 *
 * ⚠️ The game draws these as two pill groups, so one yield can appear twice on a tile. This
 * mod wants the SUM everywhere except the full-value display with "do not aggregate
 * negative yields" on. ⚠️ Cached raw so the sum rounds exactly once - rounding each half
 * first and adding afterwards is not the same arithmetic.
 */
function computeRawParts(info) {
    const cached = cachedParts.get(info.PlotIndex);
    if (cached !== undefined) {
        return cached;
    }
    const parts = new Map();
    const partFor = (i) => {
        let part = parts.get(i);
        if (!part) {
            part = { gain: 0, upkeep: 0 };
            parts.set(i, part);
        }
        return part;
    };
    info.NextYields.forEach((nextValue, i) => {
        const value = nextValue - (info.CurrentYields[i] ?? 0);
        if (value !== 0) {
            partFor(i).gain += value;
        }
    });
    info.NextMaintenance.forEach((nextValue, i) => {
        const value = (info.CurrentMaintenance[i] ?? 0) - nextValue;
        if (value !== 0) {
            partFor(i).upkeep += value;
        }
    });
    cachedParts.set(info.PlotIndex, parts);
    return parts;
}

/** The halves, rounded for display. Only the full-value display wants them apart. */
export function computePlotSpecialistYieldParts(info) {
    const parts = new Map();
    for (const [i, part] of computeRawParts(info)) {
        const gain = Math.round(part.gain * 10) / 10;
        const upkeep = Math.round(part.upkeep * 10) / 10;
        if (gain !== 0 || upkeep !== 0) {
            parts.set(i, { gain, upkeep });
        }
    }
    return parts;
}

/** Net change per yield index - the sum of the two halves, rounded once. */
export function computePlotSpecialistDeltas(info) {
    const cached = cachedDeltas.get(info.PlotIndex);
    if (cached !== undefined) {
        return cached;
    }
    const deltas = new Map();
    for (const [i, part] of computeRawParts(info)) {
        const rounded = Math.round((part.gain + part.upkeep) * 10) / 10;
        if (rounded !== 0) {
            deltas.set(i, rounded);
        }
    }
    cachedDeltas.set(info.PlotIndex, deltas);
    return deltas;
}

/** Plots that actually take a specialist and still have a free slot. */
function getSpecialistPlots() {
    return PlotWorkersManager.workablePlots.filter(
        (plot) => !plot.IsBlocked && isSpecialistPlot(plot)
    );
}

/**
 * The part EVERY specialist option shares: the value closest to zero, sign kept.
 * ⚠️ `values` needs one entry per specialist plot INCLUDING explicit 0s - a yield only some
 * tiles produce is not common at all, so a single 0 makes the whole thing 0. Mixed signs
 * likewise. +3/+5 production everywhere gives +3; -4 food everywhere gives -4.
 */
function pickCommonValue(values) {
    if (values.length === 0) {
        return 0;
    }
    if (values.some((v) => v === 0)) {
        return 0;
    }
    const hasPositive = values.some((v) => v > 0);
    const hasNegative = values.some((v) => v < 0);
    if (hasPositive && hasNegative) {
        return 0;
    }
    return values.reduce((best, v) => (Math.abs(v) < Math.abs(best) ? v : best), values[0]);
}

/** Common specialist yield for the active city, by yield index. Cached. */
export function computeSpecialistYieldBaseline() {
    if (cachedBaseline !== null) {
        return cachedBaseline;
    }
    const deltasPerPlot = getSpecialistPlots().map(computePlotSpecialistDeltas);
    if (deltasPerPlot.length === 0) {
        cachedBaseline = new Map();
        return cachedBaseline;
    }
    const yieldIndexes = new Set();
    for (const deltas of deltasPerPlot) {
        for (const i of deltas.keys()) {
            yieldIndexes.add(i);
        }
    }
    const baseline = new Map();
    for (const i of yieldIndexes) {
        // One value per plot, 0 where the plot produces nothing of this yield.
        const values = deltasPerPlot.map((deltas) => deltas.get(i) ?? 0);
        const common = pickCommonValue(values);
        if (common !== 0) {
            baseline.set(i, common);
        }
    }
    cachedBaseline = baseline;
    return baseline;
}

/**
 * Yield index by YieldType, built once. ⚠️ GameInfo is scanned, not queried, and the
 * "highest X" filters ask this for every tile of every redraw. Never invalidated - the
 * table cannot change while the game runs.
 */
let yieldIndexByType = null;

function getYieldIndex(yieldType) {
    if (yieldIndexByType === null) {
        yieldIndexByType = new Map();
        for (let i = 0; i < GameInfo.Yields.length; i++) {
            const definition = GameInfo.Yields[i];
            if (definition) {
                yieldIndexByType.set(definition.YieldType, i);
            }
        }
    }
    return yieldIndexByType.get(yieldType);
}

const EMPTY_PLOT_SET = new Set();

/**
 * How far above the common value a tile must reach before "show only the highest X" picks
 * it out. ⚠️ Below this the rule does not apply at all and the yield filters nothing -
 * reducing the map to a tile that wins by a rounding error hides more than it explains.
 */
const STANDOUT_THRESHOLD = 1;

/**
 * Plots tied for the highest value of one yield - the answer behind "show only the tiles
 * with the highest X". Cached per yield.
 *
 * ⚠️ Ranked on the tile's own delta, NOT its deviation from the common value: the player
 * asks which tile is best, not which is most unusual, and those differ once a "do not
 * aggregate" option is on. Every plot contributes a value, 0 where it produces none.
 *
 * ⚠️ An empty set means this yield filters NOTHING (see the threshold above). Two cases can
 * never qualify: a yield no plot touches, and a yield every plot only pays for - the common
 * value is the one closest to zero, which for an all-negative set is the best tile itself.
 */
export function getHighestYieldPlots(yieldType) {
    const index = getYieldIndex(yieldType);
    if (index === undefined) {
        return EMPTY_PLOT_SET;   // a yield this build of the game does not have
    }
    const cached = cachedBestPlots.get(index);
    if (cached !== undefined) {
        return cached;
    }
    let best = new Set();
    let bestValue = null;
    for (const plot of getSpecialistPlots()) {
        const value = computePlotSpecialistDeltas(plot).get(index) ?? 0;
        if (bestValue === null || value > bestValue) {
            bestValue = value;
            best = new Set([plot.PlotIndex]);
        } else if (value === bestValue) {
            best.add(plot.PlotIndex);
        }
    }
    // ⚠️ Rounded before comparing: 2.1 - 1.1 is 0.9999999999999998, which would fail a
    // bare ">= 1" on numbers plainly one apart.
    const common = computeSpecialistYieldBaseline().get(index) ?? 0;
    const margin = bestValue === null ? 0 : Math.round((bestValue - common) * 10) / 10;
    const result = margin >= STANDOUT_THRESHOLD ? best : EMPTY_PLOT_SET;
    cachedBestPlots.set(index, result);
    return result;
}

/**
 * One-shot dump of the raw per-plot data, to check the numbers against the game's own panel.
 * ⚠️ console.log does NOT reach Logs/UI.log, hence console.error. ⚠️ Must ship OFF: it
 * writes a line per plot and they appear as "JS Error" entries in the player's log.
 */
export const DIAGNOSTICS = false;

function districtName(info) {
    const district = Districts.getAtLocation(GameplayMap.getLocationFromIndex(info.PlotIndex));
    if (!district) {
        return "none";
    }
    for (const key of ["URBAN", "CITY_CENTER", "RURAL", "WILDERNESS", "WONDER"]) {
        if (district.type == DistrictTypes[key]) {
            return key;
        }
    }
    return String(district.type);
}

function formatDeltas(deltas) {
    const parts = [];
    for (const [i, value] of deltas) {
        const definition = GameInfo.Yields[i];
        parts.push(`${definition ? definition.YieldType.replace("YIELD_", "") : i}:${value > 0 ? "+" : ""}${value}`);
    }
    return parts.length > 0 ? parts.join(" ") : "-";
}

export function dumpSpecialistDiagnostics() {
    if (!DIAGNOSTICS) {
        return;
    }
    const all = PlotWorkersManager.workablePlots;
    console.error(`najane-diag: === workablePlots=${all.length} specialistPlots=${getSpecialistPlots().length} ===`);
    for (const plot of all) {
        console.error(
            `najane-diag: plot=${plot.PlotIndex} district=${districtName(plot)} ` +
            `workers=${plot.NumWorkers}/${plot.MaxWorkers} blocked=${plot.IsBlocked} ` +
            `isSpec=${isSpecialistPlot(plot)} deltas=[${formatDeltas(computePlotSpecialistDeltas(plot))}]`
        );
    }
    console.error(`najane-diag: BASELINE=[${formatDeltas(computeSpecialistYieldBaseline())}]`);
}
