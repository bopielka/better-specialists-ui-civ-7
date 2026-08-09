import { InterfaceModeChangedEventName } from '/core/ui/interface-modes/interface-modes.js';
import PlotWorkersManager, { PlotWorkersUpdatedEventName } from '/base-standard/ui/plot-workers/plot-workers-manager.js';

/**
 * Caches for one "session" of the placement UI.
 *
 * The map layer calls into here once per tile, and every call used to re-derive
 * the baseline from ALL plots - quadratic work, with an engine district lookup
 * per plot per tile. The inputs only change when the worker data changes, so the
 * results are cached and dropped on the two events that can invalidate them:
 * a worker being placed, and entering/leaving the placement mode (new city).
 */
let cachedBaseline = null;
const cachedDeltas = new Map();        // PlotIndex -> Map(yieldIndex -> value)
const cachedIsSpecialist = new Map();  // PlotIndex -> boolean

export function invalidateSpecialistCaches() {
    cachedBaseline = null;
    cachedDeltas.clear();
    cachedIsSpecialist.clear();
}

window.addEventListener(PlotWorkersUpdatedEventName, invalidateSpecialistCaches);
window.addEventListener(InterfaceModeChangedEventName, invalidateSpecialistCaches);

/**
 * True only for plots where a SPECIALIST is placed, i.e. urban tiles.
 * Rural tiles are population-expansion targets: placing there creates an
 * improvement and yields the tile's own output, which must NOT be folded into
 * the specialist baseline (and must keep its original on-map display).
 * The game itself treats URBAN + CITY_CENTER as the urban set
 * (see support-city-decoration.js: getIdsOfTypes([URBAN, CITY_CENTER])).
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
 * Net change a specialist on this plot would cause, per yield index.
 * Combines the yield gain (NextYields - CurrentYields) with the upkeep it adds
 * (CurrentMaintenance - NextMaintenance, already negative when upkeep grows) -
 * the game draws these as two separate pill groups, but "what does a specialist
 * here cost/give me" is the sum of both.
 */
export function computePlotSpecialistDeltas(info) {
    const cached = cachedDeltas.get(info.PlotIndex);
    if (cached !== undefined) {
        return cached;
    }
    const deltas = new Map();
    const add = (i, value) => {
        if (value === 0) {
            return;
        }
        deltas.set(i, (deltas.get(i) ?? 0) + value);
    };
    info.NextYields.forEach((nextValue, i) => {
        add(i, nextValue - (info.CurrentYields[i] ?? 0));
    });
    info.NextMaintenance.forEach((nextValue, i) => {
        add(i, (info.CurrentMaintenance[i] ?? 0) - nextValue);
    });
    for (const [i, value] of deltas) {
        const rounded = Math.round(value * 10) / 10;
        if (rounded === 0) {
            deltas.delete(i);
        } else {
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
 * `values` must contain one entry per specialist plot, including explicit 0s -
 * a yield only some tiles produce is not common at all, so a single 0 makes the
 * whole thing 0. With +3/+5 production everywhere the common part is +3; with
 * -4 food everywhere it is -4; with +8 gold on one tile and none elsewhere it is 0.
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

/**
 * Common specialist yield for the active city, keyed by yield index.
 * Cached; see invalidateSpecialistCaches() for when it is dropped.
 */
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
 * One-shot dump of the raw per-plot data behind the baseline, so the numbers can
 * be checked against what the game's own panel reports.
 * NOTE: console.log does NOT reach Logs/UI.log (verified - an earlier dump left
 * no trace), so this deliberately uses console.error to make it show up there.
 * Kept OFF in releases: it writes one line per plot and those lines show up as
 * "JS Error" entries in the player's log. Flip on only while investigating.
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
