/**
 * Puts the mod's key binding in the keyboard remapping screen.
 *
 * ⚠️ Declaring the InputAction in config/input.xml is not enough: the editor walks a
 * hardcoded KEYS_TO_ADD array of the game's own, so an action not in it never shows up and
 * nothing reports it. Hence wrapping addActionsForContext and appending ours.
 */
// ⚠️ Spelled out, not imported: this file also runs in the SHELL scope. Keep in sync
// with ALTERNATIVE_VIEW_ACTION and config/input.xml.
const NAJANE_KEYS_TO_ADD = ["najane-alternative-view"];

class NajaneEditorKeyboardMapping {
    static patched = null;

    constructor(component) {
        this.component = component;
        component.najaneKeyboardMapping = this;
        this.patchPrototype(Object.getPrototypeOf(component));
    }

    patchPrototype(proto) {
        if (NajaneEditorKeyboardMapping.patched) {
            return;   // prototype is shared - patch it once
        }
        const original = proto.addActionsForContext;
        NajaneEditorKeyboardMapping.patched = { proto, original };
        proto.addActionsForContext = function (...args) {
            const result = original.apply(this, args);
            const added = this.najaneKeyboardMapping?.afterAddActionsForContext(...args);
            return added ?? result;
        };
    }

    beforeAttach() { }
    afterAttach() { }
    beforeDetach() { }
    afterDetach() { }

    afterAddActionsForContext(inputContext) {
        for (const actionIdString of NAJANE_KEYS_TO_ADD) {
            const actionId = Input.getActionIdByName(actionIdString);
            if (!actionId) {
                console.error(`najane-specialists: getActionIdByName failed for ${actionIdString}`);
                continue;
            }
            if (this.component.mappingDataMap.has(actionId)) {
                continue;   // already listed for an earlier context
            }
            this.component.actionContainer.appendChild(
                this.component.createActionEntry(actionId, inputContext));
        }
    }
}

Controls.decorate('editor-keyboard-mapping', (component) => new NajaneEditorKeyboardMapping(component));
