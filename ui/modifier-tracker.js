import { InputEngineEventName } from '/core/ui/input/input-support.js';
import { InterfaceModeChangedEventName } from '/core/ui/interface-modes/interface-modes.js';

/**
 * Tracks whether the mod's "alternative view" key is being held.
 *
 * This used to sample `event.shiftKey` from DOM events, which collided with other
 * UI mods that also react to Shift (City Hall shows its building overlay on it).
 * Instead the key is now a real game input action declared in config/input.xml
 * (Tab by default), so it appears in the keyboard remapping screen and players can
 * bind it to whatever they like. Going through the game's input system also means
 * other mods listening for the same key still get their own events.
 *
 * Hold detection works because the action is declared with EventType="All": the
 * engine then reports InputActionStatuses.START when the key goes down and FINISH
 * when it comes up, rather than one press event. (A plain action would only ever
 * fire once and could not express "is currently held".)
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

// Leaving the mode never delivers the matching FINISH, which would otherwise leave
// the display stuck in the alternative view.
window.addEventListener(InterfaceModeChangedEventName, () => setHeld(false));
window.addEventListener("blur", () => setHeld(false));

/**
 * Human-readable name of whatever key is currently bound, for the on-screen hint.
 * Falls back to the mouse binding, then to a plain label, so the hint never ends up
 * empty if the action is unbound.
 */
export function getAlternativeViewKeyLabel() {
    try {
        // getGestureDisplayString wants the NUMERIC action id, not the action name -
        // passing the name silently returns nothing. And what comes back is a
        // localization key ("LOC_OPTIONS_KEY_TAB"), not display text, so it still has
        // to be composed. Both mirror how the game's own nav-help does it.
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
    // Only reached if the action is unbound; better than an empty gap in the hint.
    return Locale.compose("LOC_NAJANE_SPECIALISTS_KEY_FALLBACK");
}
