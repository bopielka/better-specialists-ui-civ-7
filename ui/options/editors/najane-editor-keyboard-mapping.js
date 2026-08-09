/**
 * Makes the mod's key binding appear in Options -> Accessibility -> Keyboard and
 * Mouse -> Configuration.
 *
 * Registering an InputAction in config/input.xml is NOT enough on its own: the
 * editor does not enumerate registered actions, it walks a hardcoded KEYS_TO_ADD
 * array inside the game's own editor-keyboard-mapping.js. Anything not in that
 * list simply never shows up, with no error anywhere.
 *
 * So the editor's addActionsForContext is wrapped and the mod's action appended
 * afterwards, reusing the component's own createActionEntry so the row looks and
 * behaves exactly like a stock one. Same approach other mods use for this.
 */
// Spelled out rather than imported from modifier-tracker.js: this file also runs in
// the shell scope, where that module's gameplay imports are not worth dragging in.
// Must stay in sync with ALTERNATIVE_VIEW_ACTION and config/input.xml.
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
