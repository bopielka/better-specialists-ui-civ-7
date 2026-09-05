import { InterfaceMode, InterfaceModeChangedEventName } from '/core/ui/interface-modes/interface-modes.js';
import { PlacePopulation } from '/base-standard/ui/place-population/model-place-population.js';
import NajaneOptions from '/najane-common-specialists-yields/ui/options/najane-options.js';

/**
 * Opens the placement screen with the yield details already expanded, so "Show yield details"
 * is a state the player leaves rather than one they have to reach with Space every time.
 *
 * ⚠️ ON MODE ENTRY, NOT ON ATTACH. `panel-place-population` sits in root-game.html and attaches
 * once per session, so an attach-time flag would apply to the first placement screen only. It
 * would also strand `ViewManager.isWorldZoomAllowed` at `false` from game load - `onAttach` reads
 * `showExpandedView` on its last line and nothing restores it until a placement screen closes.
 *
 * ⚠️ DELEGATES TO `toggleMinMax`, which is why nothing here touches `showExpandedView`, the four
 * min/max containers, the footer labels or the zoom flag. The cost is its expand sound firing on
 * open; the alternative is a copy of fifteen lines of game code that has to track every patch.
 *
 * ⚠️ The flag is shared with the "add improvement" view, so this expands that one too. There is
 * one `showExpandedView` in the game, not one per frame.
 */
class NajaneExpandedByDefault {
    modeListener = this.onInterfaceModeChanged.bind(this);

    constructor(component) {
        this.component = component;
    }

    beforeAttach() { }

    afterAttach() {
        window.addEventListener(InterfaceModeChangedEventName, this.modeListener);
    }

    beforeDetach() {
        window.removeEventListener(InterfaceModeChangedEventName, this.modeListener);
    }

    afterDetach() { }

    onInterfaceModeChanged() {
        try {
            if (InterfaceMode.getCurrent() !== "INTERFACEMODE_ACQUIRE_TILE") {
                return;
            }
            // Already expanded - from the player's own Space, or from the last time this ran.
            if (!NajaneOptions.expandDetailsByDefault || PlacePopulation.showExpandedView) {
                return;
            }
            this.component.toggleMinMax();
        } catch (e) {
            console.error(`najane-specialists: could not expand the yield details: ${e}`);
        }
    }
}

Controls.decorate("panel-place-population", (component) => new NajaneExpandedByDefault(component));
