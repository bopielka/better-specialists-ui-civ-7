import { InterfaceModeChangedEventName } from '/core/ui/interface-modes/interface-modes.js';

/**
 * Tracks whether Shift is held, so the map layer can fall back to the game's
 * unmodified display while it is down.
 *
 * The game does NOT route raw keyboard state to the DOM - its own input system
 * (InputEngineEvent) only carries named actions, and those are discrete presses,
 * so they cannot express "modifier is currently held". Listening for keydown /
 * keyup alone turned out not to fire, so the state is sampled from EVERY event
 * that carries a `shiftKey` flag, mouse events included (other Workshop mods
 * rely on `event.shiftKey` from clicks, so those definitely arrive).
 * In practice the cursor is moving over tiles anyway, so mousemove keeps the
 * state fresh even if key events never show up.
 *
 * Listeners are attached on `document` in the capture phase to see events before
 * anything can stop their propagation.
 */
export const ShiftChangedEventName = "najane-specialists-shift-changed";

const SAMPLED_EVENTS = [
    "keydown", "keyup",
    "mousemove", "mousedown", "mouseup", "mouseover",
    "click", "wheel"
];

let shiftHeld = false;
let loggedTransitions = 0;

export function isShiftHeld() {
    return shiftHeld;
}

function update(event) {
    const next = !!event.shiftKey;
    if (next === shiftHeld) {
        return;
    }
    shiftHeld = next;
    // A few transitions are logged so it is possible to confirm from Logs/UI.log
    // which event type actually delivers the state (console.log does not reach it).
    if (loggedTransitions < 6) {
        loggedTransitions++;
        console.error(`najane-shift: held=${shiftHeld} via ${event.type}`);
    }
    window.dispatchEvent(new CustomEvent(ShiftChangedEventName));
}

function forceRelease() {
    if (!shiftHeld) {
        return;
    }
    shiftHeld = false;
    window.dispatchEvent(new CustomEvent(ShiftChangedEventName));
}

for (const type of SAMPLED_EVENTS) {
    document.addEventListener(type, update, true);
}
// Leaving the mode or losing focus never delivers the matching keyup, which would
// otherwise leave the display stuck in the Shift state.
window.addEventListener(InterfaceModeChangedEventName, forceRelease);
window.addEventListener("blur", forceRelease);
