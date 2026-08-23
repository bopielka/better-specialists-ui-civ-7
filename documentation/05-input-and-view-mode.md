# 05 — Input and view mode

Three small pieces answering one question: **which of the two displays is on screen right
now, and what is the key that swaps them called?**

```
config/input.xml          declares the action, its default key, its contexts
ui/modifier-tracker.js    is it held? what is it called?
ui/view-mode.js           given the option, which display is active?
```

## `config/input.xml` — the action itself

```xml
<InputActions>
    <Replace ActionId="najane-alternative-view" DeviceType="Keyboard"
             Name="LOC_INPUT_NAJANE_ALTERNATIVE_VIEW"
             Description="LOC_INPUT_NAJANE_ALTERNATIVE_VIEW_HELP"
             EventType="All" />
</InputActions>
<InputActionDefaultGestures>
    <Replace ActionId="najane-alternative-view" Index="0"
             GestureType="KBMouse" GestureData="KEY_TAB" />
</InputActionDefaultGestures>
<InputContextConstraints>
    <Replace ActionId="najane-alternative-view" ContextId="World" />
    <Replace ActionId="najane-alternative-view" ContextId="Unit" />
</InputContextConstraints>
```

Four decisions, each of which cost something:

1. ⚠️ **`EventType="All"` is what makes hold-to-view possible.** The action then reports
   `START` on key-down and `FINISH` on key-up. A plain action fires once and cannot express
   "is currently held". The game uses the same trick for `keyboard-camera-modifier`.
2. ⚠️ **`KEY_TAB`, a regular key, not a modifier.** A bare modifier works as an XML default
   but **not as a rebinding**: `Input.beginRecordingGestures` treats a modifier as the start
   of a combination, so a player who rebinds away from Shift can never record plain Shift
   again — only a full reset of every binding brings it back. `KEY_CONTROL` went further and
   showed up as "unassigned" outright. A reversible binding matters more than the key.
3. ⚠️ **`shell` scope only.** These tables live in the **frontend/config** database, not the
   gameplay one. In a `scope="game"` group the load fails with `no such table: InputActions`
   and rolls back that group's entire `UpdateDatabase` action.
4. ⚠️ **`<Replace>` rather than `<Row>`.** It is idempotent, so re-applying the mod cannot
   fail on an existing row. This is how other mods do it too.

The two contexts (`World`, `Unit`) are the ones the specialist-placement mode runs in. A key
that appears not to work in some state is usually a missing context, not a broken listener.

## `ui/modifier-tracker.js` — is it held?

```js
export const ModifierChangedEventName = "najane-specialists-modifier-changed";
export const ALTERNATIVE_VIEW_ACTION = "najane-alternative-view";
export function isAlternativeViewHeld()
export function getAlternativeViewKeyLabel()
```

One module-level `held` boolean, updated from engine input events, with a `CustomEvent`
dispatched **only on an actual change**:

```js
function setHeld(value) {
    if (held === value) return;      // no event storm from UPDATE/HOLD
    held = value;
    window.dispatchEvent(new CustomEvent(ModifierChangedEventName));
}
```

⚠️ **Every dispatch triggers a full map redraw** in the layer. The early return is
load-bearing, not tidiness.

### Why not `event.shiftKey`

⚠️ An earlier version sampled the DOM modifier state. It **collided with other UI mods that
also react to Shift** — City Hall shows its building overlay on it. Going through the game's
input system means other mods listening for the same key still get their own events, and the
player can rebind out of any collision that remains.

### The two ways the key can get stuck

| Case | Guard |
|---|---|
| Leaving placement mode while held — the matching `FINISH` never arrives | `InterfaceModeChangedEventName` → `setHeld(false)` |
| The window losing focus while held (alt-tab) | `blur` → `setHeld(false)` |

⚠️ Without these the display stays stuck in the alternative view with no key held and no way
to clear it short of pressing and releasing the key again.

`InputActionStatuses.UPDATE` / `HOLD` are deliberately ignored: they repeat the current
state and carry no transition.

### `getAlternativeViewKeyLabel()`

Reads back whatever the player has actually bound, for the on-screen hint.

```js
const actionId = Input.getActionIdByName(ALTERNATIVE_VIEW_ACTION);
const deviceType = Input.getActionDeviceType(actionId);
let key = Input.getGestureDisplayString(actionId, 0, deviceType, InputContext.ALL);
```

- ⚠️ **The numeric action id, never the name.** Passing the name silently returns nothing.
- ⚠️ **The return value is a localisation key** (`"LOC_OPTIONS_KEY_TAB"`), not display text.
  It still needs `Locale.compose`. Both points mirror the game's own nav-help.
- Falls back keyboard → mouse → `LOC_NAJANE_SPECIALISTS_KEY_FALLBACK` ("the alternative view
  key"), so an unbound action leaves a readable sentence instead of a gap.
- The whole thing is inside `try` / `catch`; a failure logs and returns the fallback.

## `ui/view-mode.js` — which display is active

The entire module:

```js
export function isOriginalDisplayActive() {
    return NajaneOptions.originalByDefault ? !isAlternativeViewHeld() : isAlternativeViewHeld();
}
```

| `originalByDefault` | Key released | Key held |
|---|---|---|
| off (default) | the mod's difference view | the game's original |
| on | the game's original | the mod's difference view |

⚠️ **Both consumers must call this, never `isAlternativeViewHeld()` directly.** The panel
uses it to choose which hint to show and the layer to choose what to draw; computed
separately, an inverted option would flip one and not the other — and the hint would name
the view the player is already looking at.

## Adding another key

1. Add the action, its default gesture and its contexts to `config/input.xml`.
2. Add `LOC_INPUT_…` and `…_HELP` strings to **all twelve** locale files.
3. Append the action id to `NAJANE_KEYS_TO_ADD` in
   `ui/options/editors/najane-editor-keyboard-mapping.js` — ⚠️ **without this it will not
   appear in the rebinding screen at all**, and nothing will say so.
4. Track it the way `modifier-tracker.js` does, including both stuck-key guards.
