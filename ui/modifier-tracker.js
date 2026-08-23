import { InputEngineEventName } from '/core/ui/input/input-support.js';
import { InterfaceModeChangedEventName } from '/core/ui/interface-modes/interface-modes.js';

/**
 * Is the mod's "alternative view" key held? Tab by default, rebindable.
 *
 * ⚠️ A real game input action, not `event.shiftKey` - the DOM modifier collided with other
 * mods reacting to Shift, and hold detection needs EventType="All" in config/input.xml.
 * See documentation/05-input-and-view-mode.md.
 */
export const ModifierChangedEventName = "najane-specialists-modifier-changed";
export const ALTERNATIVE_VIEW_ACTION = "najane-alternative-view";

let held = false;

export function isAlternativeViewHeld() {
    return held;
}

function setHeld(value) {
    if (held === value) {
        return;
    }
    held = value;
    window.dispatchEvent(new CustomEvent(ModifierChangedEventName));
}

window.addEventListener(InputEngineEventName, (event) => {
    if (event.detail?.name !== ALTERNATIVE_VIEW_ACTION) {
        return;
    }
    const status = event.detail.status;
    if (status === InputActionStatuses.START) {
        setHeld(true);
    } else if (status === InputActionStatuses.FINISH) {
        setHeld(false);
    }
    // UPDATE/HOLD keep the current state; nothing to do.
});

// Leaving the mode never delivers the matching FINISH - the view would stay stuck.
window.addEventListener(InterfaceModeChangedEventName, () => setHeld(false));
window.addEventListener("blur", () => setHeld(false));

/** Display name of whatever key is bound now, for the on-screen hint. */
export function getAlternativeViewKeyLabel() {
    try {
        // ⚠️ Wants the NUMERIC action id - the name silently returns nothing - and gives
        // back a localization key, not display text.
        const actionId = Input.getActionIdByName(ALTERNATIVE_VIEW_ACTION);
        if (actionId !== null && actionId !== undefined) {
            const deviceType = Input.getActionDeviceType(actionId);
            let key = Input.getGestureDisplayString(actionId, 0, deviceType, InputContext.ALL);
            if (!key) {
                key = Input.getGestureDisplayString(actionId, 0, InputDeviceType.Keyboard, InputContext.ALL);
            }
            if (!key) {
                key = Input.getGestureDisplayString(actionId, 0, InputDeviceType.Mouse, InputContext.ALL);
            }
            if (key) {
                return Locale.compose(key);
            }
        }
    } catch (e) {
        console.error(`najane-specialists: could not read the alternative-view binding: ${e}`);
    }
    return Locale.compose("LOC_NAJANE_SPECIALISTS_KEY_FALLBACK");
}
