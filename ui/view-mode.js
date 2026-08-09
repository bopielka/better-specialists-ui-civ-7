import NajaneOptions from '/najane-common-specialists-yields/ui/options/najane-options.js';
import { isAlternativeViewHeld } from '/najane-common-specialists-yields/ui/modifier-tracker.js';

/**
 * Which of the two map displays is active right now.
 *
 * Normally the mod's difference view is the default and holding the alternative-view
 * key reveals the game's untouched output; the "original by default" option swaps
 * those roles. Shared by the map layer (what to draw) and the panel (which hint to
 * show), so the two can never disagree.
 */
export function isOriginalDisplayActive() {
    return NajaneOptions.originalByDefault ? !isAlternativeViewHeld() : isAlternativeViewHeld();
}
