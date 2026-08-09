import '/core/ui/options/screen-options.js';  // must load before the model is touched
import { CategoryType, Options, OptionType } from '/core/ui/options/model-options.js';
import { CategoryData } from '/core/ui/options/options-helpers.js';

/**
 * Mod options for "Common Specialists Yields", shown under a "Mods" tab in the
 * main-menu options screen.
 *
 * The "Mods" category is not part of the base game; several community mods add
 * it the same way, so it is created with ??= and the id "mods" to share one tab
 * instead of each mod spawning its own.
 * Values persist through UI.setOption("user", "Mod", ...), with localStorage as
 * a fallback - the same approach other Civ VII mods settled on.
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

const NajaneOptions = new class {
    defaults = {
        alwaysShowNegatives: 0,
        originalByDefault: 0,
        dontAggregateNegatives: 0,
        dontAggregatePositives: 0,
        onlyNonZeroCommon: 0,
        fullYieldsOnHover: 0,
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

    /** Invert Shift: unmodified game display by default, mod's view while Shift is held. */
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
});

export { NajaneOptions as default };
