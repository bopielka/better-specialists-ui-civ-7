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
 * The two halves a specialist's effect on this plot is made of, per yield index, UNROUNDED:
 *
 *   gain   = NextYields - CurrentYields              (what the specialist produces)
 *   upkeep = CurrentMaintenance - NextMaintenance    (already negative when upkeep grows)
 *
 * ⚠️ The game draws these as two separate pill groups, which is why the same yield can
 * appear twice on one tile - "+3 happiness" beside "-5 happiness". Everything in this mod
 * normally wants the SUM, because "what does a specialist here cost and give me" is one
 * question; computePlotSpecialistDeltas() below is that sum, and it is what the baseline,
 * the ranking and the map all use.
 *
 * The halves are kept because "do not aggregate negative yields" asks for them back: with
 * that option on, the full-value display shows the gain and the upkeep as two pills again.
 *
 * ⚠️ Cached RAW, before rounding, so the sum below still rounds exactly once - rounding
 * each half first and adding afterwards is not the same arithmetic.
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

/**
 * The same two halves, rounded for display, with the empty ones dropped.
 * Used only where a tile shows its FULL figures and "do not aggregate negative yields"
 * asks for the halves to stay apart. Everything else wants the sum.
 */
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

/**
 * Net change a specialist on this plot would cause, per yield index - the sum of the two
 * halves above, rounded once.
 */
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
 * Yield index by YieldType, built once.
 *
 * GameInfo is scanned, not queried, and the "show only the highest X" filters ask this
 * question for every tile of every redraw - so the answer is worked out one time and kept.
 * The table cannot change while the game is running, so this is never invalidated.
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
 * How far above the common value a tile must reach before "show only the tiles with the
 * highest X" singles it out at all.
 *
 * ⚠️ Below this the rule does NOT apply and the yield imposes no filter, rather than
 * picking a winner out of a field that is effectively level. Reducing the map to one tile
 * that beats the rest by a rounding error hides more than it explains.
 */
const STANDOUT_THRESHOLD = 1;

/**
 * The plots tied for the highest value of one yield - the answer behind "show only the
 * tiles with the highest science". Cached per yield; dropped with the other caches.
 *
 * Ranked on the tile's own delta - what a specialist placed there would actually give -
 * and NOT on its deviation from the common value. The player is asking which tile is
 * best, not which tile is most unusual, and those are different questions the moment a
 * "do not aggregate" option is on.
 *
 * Every specialist plot contributes a value, 0 where it produces none of that yield, so
 * ties are found across the whole set.
 *
 * ⚠️ The winner must beat the COMMON value by at least STANDOUT_THRESHOLD, or the answer
 * is an empty set and the yield filters nothing. Two consequences worth knowing:
 *  - a yield no plot touches cannot qualify (every plot ties at 0, and so does the common
 *    value), so switching a filter on for a yield this city cannot produce no longer
 *    shows the whole map;
 *  - a yield every plot pays for and none gains - upkeep - cannot qualify either. The
 *    common value IS the best tile there, by the definition of "closest to zero", so
 *    nothing is ever +1 above it and there is no standout tile to point at.
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
            best.add(plot.PlotIndex);   // a tie shows every tile that ties
        }
    }
    // ⚠️ Rounded before the comparison, like every other figure here: both sides carry one
    // decimal, and 2.1 - 1.1 is 0.9999999999999998 in binary floating point - which would
    // fail a bare ">= 1" on numbers that are plainly one apart.
    const common = computeSpecialistYieldBaseline().get(index) ?? 0;
    const margin = bestValue === null ? 0 : Math.round((bestValue - common) * 10) / 10;
    const result = margin >= STANDOUT_THRESHOLD ? best : EMPTY_PLOT_SET;
    cachedBestPlots.set(index, result);
    return result;
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
