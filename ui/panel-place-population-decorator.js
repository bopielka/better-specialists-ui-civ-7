import { InterfaceModeChangedEventName } from '/core/ui/interface-modes/interface-modes.js';
import PlotWorkersManager, { PlotWorkersUpdatedEventName } from '/base-standard/ui/plot-workers/plot-workers-manager.js';
import { PlacePopulationSelectionChangedEventName } from '/base-standard/ui/place-population/model-place-population.js';
import { YieldBarEntryStyle } from '/base-standard/ui/yield-bar-base/yield-bar-base.js';
import { computeSpecialistYieldBaseline, dumpSpecialistDiagnostics } from '/najane-common-specialists-yields/ui/model-specialists-yield-baseline.js';
import NajaneOptions, { NajaneOptionsChangedEventName } from '/najane-common-specialists-yields/ui/options/najane-options.js';
import { ModifierChangedEventName, getAlternativeViewKeyLabel } from '/najane-common-specialists-yields/ui/modifier-tracker.js';
import { isOriginalDisplayActive } from '/najane-common-specialists-yields/ui/view-mode.js';

/**
 * Shows what EVERY specialist in this city gives/costs, once, so the per-tile
 * pills on the map only have to show how a tile deviates from it.
 *
 * Two placements, because the panel swaps between two frames:
 *  - subsystemFrame ("Choose a tile" overview, shown when nothing is hovered):
 *    appended at the BOTTOM, next to the other explanatory blocks.
 *  - placeSpecialistFrame ("Add specialist", shown while hovering a valid tile):
 *    inserted at the TOP, above BEFORE/AFTER.
 * Anything put in subsystemFrame alone would be invisible while placing a
 * specialist - the game hides that frame in exactly that state.
 *
 * DOM insertion is deferred with waitForLayout: fxs-subsystem-frame rearranges
 * its children after build, so inserting during afterAttach silently landed the
 * section at the end instead of the requested position.
 * UI-only: reads PlotWorkersManager data, writes no game state.
 */
class NajaneCommonYieldsSection {
    specialist = null;
    overview = null;
    refreshListener = this.refresh.bind(this);
    diagnosticsDone = false;

    constructor(component) {
        this.component = component;
    }

    beforeAttach() { }

    afterAttach() {
        waitForLayout(() => this.buildSections());
        window.addEventListener(PlotWorkersUpdatedEventName, this.refreshListener);
        window.addEventListener(InterfaceModeChangedEventName, this.refreshListener);
        window.addEventListener(PlacePopulationSelectionChangedEventName, this.refreshListener);
        window.addEventListener(ModifierChangedEventName, this.refreshListener);
        window.addEventListener(NajaneOptionsChangedEventName, this.refreshListener);
    }

    beforeDetach() {
        window.removeEventListener(PlotWorkersUpdatedEventName, this.refreshListener);
        window.removeEventListener(InterfaceModeChangedEventName, this.refreshListener);
        window.removeEventListener(PlacePopulationSelectionChangedEventName, this.refreshListener);
        window.removeEventListener(ModifierChangedEventName, this.refreshListener);
        window.removeEventListener(NajaneOptionsChangedEventName, this.refreshListener);
    }

    afterDetach() { }

    buildSections() {
        // "Add specialist" view: top of the content, above BEFORE/AFTER.
        const anchor = this.component.specialistMinimizedContainer;
        if (anchor?.parentElement) {
            this.specialist = this.createSection();
            anchor.parentElement.insertBefore(this.specialist.section, anchor);
        }

        // "Choose a tile" overview: bottom of the info block.
        const overviewHost = this.component.subsystemFrame?.querySelector(".flex.flex-col.pb-4.px-4")
            ?? this.component.subsystemFrame;
        if (overviewHost) {
            this.overview = this.createSection();
            overviewHost.appendChild(this.overview.section);
        }

        if (!this.specialist && !this.overview) {
            console.error("najane-specialists: found nowhere to attach the common yields section");
            return;
        }
        this.refresh();
    }

    /**
     * Both placements use the same chrome as the explanatory blocks on the
     * "choose a tile" screen (title + divider inside a ticket container), so the
     * section reads identically wherever it appears.
     */
    createSection() {
        const section = document.createElement("div");
        section.classList.add("najane-common-yields", "flex", "flex-col");

        const barHost = document.createElement("div");
        barHost.classList.add("img-base-ticket-bg-container", "flex-col", "mt-4", "py-2");
        section.appendChild(barHost);

        const label = document.createElement("p");
        label.classList.add("mx-2", "-mb-1", "font-title", "text-secondary", "text-sm", "uppercase", "self-center");
        label.setAttribute("data-l10n-id", "LOC_NAJANE_SPECIALISTS_COMMON_HEADER");
        barHost.appendChild(label);

        const divider = document.createElement("div");
        divider.classList.add("flex-auto", "h-px", "my-2", "mx-2", "bg-accent-2", "opacity-30");
        barHost.appendChild(divider);

        const bar = document.createElement("yield-bar-base");
        // yield-bar-base sets "justify-between" on itself, which is fine for the
        // full set of yields but leaves huge gaps once some are filtered out.
        // An inline style beats the component's class, keeping the entries
        // centred with the same even spacing whatever their number.
        bar.style.justifyContent = "center";
        barHost.appendChild(bar);

        const hint = document.createElement("div");
        hint.classList.add("text-xs", "text-center", "self-center", "mt-1", "opacity-80");
        barHost.appendChild(hint);

        return { section, bar, hint };
    }

    refresh() {
        if (!this.specialist && !this.overview) {
            return;
        }
        const baseline = computeSpecialistYieldBaseline();

        if (!this.diagnosticsDone && PlotWorkersManager.workablePlots.length > 0) {
            this.diagnosticsDone = true;
            dumpSpecialistDiagnostics();
        }

        if (baseline.size === 0) {
            this.specialist?.section.classList.add("hidden");
            this.overview?.section.classList.add("hidden");
            return;
        }

        const onlyNonZero = NajaneOptions.onlyNonZeroCommon;
        const barData = [];
        const barDeltas = [];
        for (const [index, entry] of this.getCityYields().entries()) {
            const common = baseline.get(index) ?? 0;
            if (onlyNonZero && common === 0) {
                continue;   // drop yields the specialists do not touch at all
            }
            barData.push(entry);
            barDeltas.push({
                value: common,
                style: common > 0 ? YieldBarEntryStyle.GAIN : common < 0 ? YieldBarEntryStyle.LOSS : YieldBarEntryStyle.NONE
            });
        }
        const barDataJSON = JSON.stringify(barData);
        const barDeltasJSON = JSON.stringify(barDeltas);
        // The hint names both the key and where it leads, so it follows the current view
        // AND whatever the player bound in Options -> Key Bindings. Composed here rather
        // than through data-l10n-id, which cannot take a runtime argument.
        const hintText = Locale.compose(
            isOriginalDisplayActive()
                ? "LOC_NAJANE_SPECIALISTS_KEY_TO_DIFF"
                : "LOC_NAJANE_SPECIALISTS_KEY_TO_ORIGINAL",
            getAlternativeViewKeyLabel()
        );

        for (const target of [this.specialist, this.overview]) {
            if (!target) {
                continue;
            }
            target.section.classList.remove("hidden");
            target.bar.setAttribute("data-yield-bar", barDataJSON);
            target.bar.setAttribute("data-yield-deltas", barDeltasJSON);
            target.hint.textContent = hintText;
        }
    }

    /** City totals in GameInfo.Yields index order - the same source the game's own bars use. */
    getCityYields() {
        const entries = [];
        const cityID = PlotWorkersManager.cityID;
        const city = cityID ? Cities.get(cityID) : null;
        const yields = city?.Yields?.getYields();
        if (!yields) {
            return entries;
        }
        for (const [index, attribute] of yields.entries()) {
            const yieldDefinition = GameInfo.Yields[index];
            if (yieldDefinition) {
                entries.push({
                    type: yieldDefinition.YieldType,
                    value: attribute.value,
                    style: YieldBarEntryStyle.NONE
                });
            }
        }
        return entries;
    }
}

Controls.decorate("panel-place-population", (component) => new NajaneCommonYieldsSection(component));
