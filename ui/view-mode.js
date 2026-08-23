import NajaneOptions from '/najane-common-specialists-yields/ui/options/najane-options.js';
import { isAlternativeViewHeld } from '/najane-common-specialists-yields/ui/modifier-tracker.js';

/**
 * Which of the two map displays is live. ⚠️ Both the panel and the layer must ask THIS,
 * never `isAlternativeViewHeld()` - the "original by default" option inverts the key, and
 * computing it twice would flip one of them and not the other.
 */
export function isOriginalDisplayActive() {
    return NajaneOptions.originalByDefault ? !isAlternativeViewHeld() : isAlternativeViewHeld();
}
