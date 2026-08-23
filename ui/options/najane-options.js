import '/core/ui/options/screen-options.js';  // must load before the model is touched
import { CategoryType, Options, OptionType } from '/core/ui/options/model-options.js';
import { CategoryData } from '/core/ui/options/options-helpers.js';

/**
 * Mod options, shown under a "Mods" tab in the options screen.
 *
 * ⚠️ The "Mods" category is not part of the base game; several community mods add it the
 * same way, so it is created with ??= and the shared id "mods" rather than each spawning
 * its own tab. Values persist through UI.setOption, with localStorage as a fallback.
 */
CategoryType["Mods"] = "mods";
CategoryData[CategoryType.Mods] ??= {
    title: "LOC_UI_CONTENT_MGR_SUBTITLE",
    description: "LOC_UI_CONTENT_MGR_SUBTITLE_DESCRIPTION",
};

const MOD_ID = "najane-common-specialists-yields";

export const NajaneOptionsChangedEventName = "najane-specialists-options-changed";

function persist(optionID, value) {
    const optionName = `${MOD_ID}.${optionID}`;
    UI.setOption("user", "Mod", optionName, value);
    Configuration.getUser().saveCheckpoint();
    try {
        const options = JSON.parse(localStorage.getItem("modSettings") || "{}");
        options[MOD_ID] ??= {};
        options[MOD_ID][optionID] = value;
        localStorage.setItem("modSettings", JSON.stringify(options));
    } catch (e) {
        console.error(`najane-specialists: could not write option ${optionID} to localStorage: ${e}`);
    }
}

function restore(optionID) {
    const optionName = `${MOD_ID}.${optionID}`;
    const stored = UI.getOption("user", "Mod", optionName);
    if (stored != null) {
        return stored;
    }
    try {
        const options = JSON.parse(localStorage.getItem("modSettings") || "{}");
        return options?.[MOD_ID]?.[optionID] ?? null;
    } catch (e) {
        console.error(`najane-specialists: could not read option ${optionID} from localStorage: ${e}`);
        return null;
    }
}

/**
 * The "show only the tiles with the highest X" family - one checkbox per yield.
 *
 * A table because these differ only in the yield they name: defaults, accessor and
 * registrations all derive from it. ⚠️ YieldType STRINGS only, no GameInfo - this module
 * also loads in the SHELL scope, where the gameplay database does not exist. ⚠️ `optionID`
 * is the stored key: renaming one resets that setting for everyone; append instead.
 */
export const HIGHEST_ONLY_YIELDS = [
    { optionID: "highestOnlyFood", yieldType: "YIELD_FOOD", id: "najane-highest-only-food", label: "LOC_OPTIONS_NAJANE_HIGHEST_FOOD" },
    { optionID: "highestOnlyProduction", yieldType: "YIELD_PRODUCTION", id: "najane-highest-only-production", label: "LOC_OPTIONS_NAJANE_HIGHEST_PRODUCTION" },
    { optionID: "highestOnlyGold", yieldType: "YIELD_GOLD", id: "najane-highest-only-gold", label: "LOC_OPTIONS_NAJANE_HIGHEST_GOLD" },
    { optionID: "highestOnlyScience", yieldType: "YIELD_SCIENCE", id: "najane-highest-only-science", label: "LOC_OPTIONS_NAJANE_HIGHEST_SCIENCE" },
    { optionID: "highestOnlyCulture", yieldType: "YIELD_CULTURE", id: "najane-highest-only-culture", label: "LOC_OPTIONS_NAJANE_HIGHEST_CULTURE" },
    { optionID: "highestOnlyHappiness", yieldType: "YIELD_HAPPINESS", id: "najane-highest-only-happiness", label: "LOC_OPTIONS_NAJANE_HIGHEST_HAPPINESS" },
    // ⚠️ Influence is YIELD_DIPLOMACY in the data; "Influence" is only its display name.
    { optionID: "highestOnlyInfluence", yieldType: "YIELD_DIPLOMACY", id: "najane-highest-only-influence", label: "LOC_OPTIONS_NAJANE_HIGHEST_INFLUENCE" },
];

const NajaneOptions = new class {
    defaults = {
        alwaysShowNegatives: 0,
        originalByDefault: 0,
        dontAggregateNegatives: 0,
        dontAggregatePositives: 0,
        onlyNonZeroCommon: 0,
        fullYieldsOnHover: 0,
        // One per yield, derived from the table so a new entry cannot be left without a default.
        ...Object.fromEntries(HIGHEST_ONLY_YIELDS.map((entry) => [entry.optionID, 0])),
    };
    data = {};

    get(optionID) {
        if (this.data[optionID] == null) {
            const stored = restore(optionID);
            this.data[optionID] = stored != null ? Number(stored) : this.defaults[optionID];
        }
        return Boolean(this.data[optionID]);
    }

    set(optionID, value) {
        this.data[optionID] = Number(value);
        persist(optionID, Number(value));
        window.dispatchEvent(new CustomEvent(NajaneOptionsChangedEventName));
    }

    /** Show negative pills on every tile, not just the hovered one. */
    get alwaysShowNegatives() { return this.get("alwaysShowNegatives"); }
    set alwaysShowNegatives(value) { this.set("alwaysShowNegatives", value); }

    /** Invert the alternative-view key: the game's display by default, the mod's while held. */
    get originalByDefault() { return this.get("originalByDefault"); }
    set originalByDefault(value) { this.set("originalByDefault", value); }

    /** Leave costs out of the common value, so tiles show them in full. */
    get dontAggregateNegatives() { return this.get("dontAggregateNegatives"); }
    set dontAggregateNegatives(value) { this.set("dontAggregateNegatives", value); }

    /** Mirror of the above for gains: tiles show them in full even when identical everywhere. */
    get dontAggregatePositives() { return this.get("dontAggregatePositives"); }
    set dontAggregatePositives(value) { this.set("dontAggregatePositives", value); }

    /** Hide yield types with no common value from the "Common yields" panels. */
    get onlyNonZeroCommon() { return this.get("onlyNonZeroCommon"); }
    set onlyNonZeroCommon(value) { this.set("onlyNonZeroCommon", value); }

    /** The hovered tile shows the game's full, unmodified figures instead of the difference. */
    get fullYieldsOnHover() { return this.get("fullYieldsOnHover"); }
    set fullYieldsOnHover(value) { this.set("fullYieldsOnHover", value); }

    /**
 * YieldTypes whose "highest X" filter is on. ⚠️ A LIST, not a single choice - the player may
 * switch on any number, and the consumer unions the results.
 */
    getHighestOnlyYieldTypes() {
        return HIGHEST_ONLY_YIELDS
            .filter((entry) => this.get(entry.optionID))
            .map((entry) => entry.yieldType);
    }
}();

Options.addInitCallback(() => {
    Options.addOption({
        category: CategoryType.Mods,
        group: "najane_mods",
        type: OptionType.Checkbox,
        id: "najane-always-show-negatives",
        initListener: (info) => info.currentValue = NajaneOptions.alwaysShowNegatives,
        updateListener: (_info, value) => NajaneOptions.alwaysShowNegatives = value,
        label: "LOC_OPTIONS_NAJANE_ALWAYS_NEGATIVES",
        description: "LOC_OPTIONS_NAJANE_ALWAYS_NEGATIVES_DESCRIPTION",
    });
    Options.addOption({
        category: CategoryType.Mods,
        group: "najane_mods",
        type: OptionType.Checkbox,
        id: "najane-original-by-default",
        initListener: (info) => info.currentValue = NajaneOptions.originalByDefault,
        updateListener: (_info, value) => NajaneOptions.originalByDefault = value,
        label: "LOC_OPTIONS_NAJANE_ORIGINAL_DEFAULT",
        description: "LOC_OPTIONS_NAJANE_ORIGINAL_DEFAULT_DESCRIPTION",
    });
    Options.addOption({
        category: CategoryType.Mods,
        group: "najane_mods",
        type: OptionType.Checkbox,
        id: "najane-dont-aggregate-negatives",
        initListener: (info) => info.currentValue = NajaneOptions.dontAggregateNegatives,
        updateListener: (_info, value) => NajaneOptions.dontAggregateNegatives = value,
        label: "LOC_OPTIONS_NAJANE_NO_NEGATIVE_COMMON",
        description: "LOC_OPTIONS_NAJANE_NO_NEGATIVE_COMMON_DESCRIPTION",
    });
    // Registered right after its mirror image so the pair reads as one choice.
    Options.addOption({
        category: CategoryType.Mods,
        group: "najane_mods",
        type: OptionType.Checkbox,
        id: "najane-dont-aggregate-positives",
        initListener: (info) => info.currentValue = NajaneOptions.dontAggregatePositives,
        updateListener: (_info, value) => NajaneOptions.dontAggregatePositives = value,
        label: "LOC_OPTIONS_NAJANE_NO_POSITIVE_COMMON",
        description: "LOC_OPTIONS_NAJANE_NO_POSITIVE_COMMON_DESCRIPTION",
    });
    Options.addOption({
        category: CategoryType.Mods,
        group: "najane_mods",
        type: OptionType.Checkbox,
        id: "najane-only-nonzero-common",
        initListener: (info) => info.currentValue = NajaneOptions.onlyNonZeroCommon,
        updateListener: (_info, value) => NajaneOptions.onlyNonZeroCommon = value,
        label: "LOC_OPTIONS_NAJANE_ONLY_NONZERO",
        description: "LOC_OPTIONS_NAJANE_ONLY_NONZERO_DESCRIPTION",
    });
    Options.addOption({
        category: CategoryType.Mods,
        group: "najane_mods",
        type: OptionType.Checkbox,
        id: "najane-full-on-hover",
        initListener: (info) => info.currentValue = NajaneOptions.fullYieldsOnHover,
        updateListener: (_info, value) => NajaneOptions.fullYieldsOnHover = value,
        label: "LOC_OPTIONS_NAJANE_FULL_ON_HOVER",
        description: "LOC_OPTIONS_NAJANE_FULL_ON_HOVER_DESCRIPTION",
    });
    // One checkbox per yield, from the table above; they share one description.
    for (const entry of HIGHEST_ONLY_YIELDS) {
        Options.addOption({
            category: CategoryType.Mods,
            group: "najane_mods",
            type: OptionType.Checkbox,
            id: entry.id,
            initListener: (info) => info.currentValue = NajaneOptions.get(entry.optionID),
            updateListener: (_info, value) => NajaneOptions.set(entry.optionID, value),
            label: entry.label,
            description: "LOC_OPTIONS_NAJANE_HIGHEST_ONLY_DESCRIPTION",
        });
    }
});

export { NajaneOptions as default };
