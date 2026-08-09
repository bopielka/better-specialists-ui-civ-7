import NajaneOptions from '/najane-common-specialists-yields/ui/options/najane-options.js';
import { isShiftHeld } from '/najane-common-specialists-yields/ui/shift-tracker.js';

/**
 * Which of the two map displays is active right now.
 *
 * Normally the mod's difference view is the default and Shift reveals the game's
 * untouched output; the "original by default" option swaps those roles.
 * Shared by the map layer (what to draw) and the panel (which Shift hint to show),
 * so the two can never disagree.
 */
export function isOriginalDisplayActive() {
    return NajaneOptions.originalByDefault ? !isShiftHeld() : isShiftHeld();
}
