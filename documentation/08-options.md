# 08 — Options and persistence

```
ui/options/najane-options.js                       seven checkboxes + the storage channel
ui/options/editors/najane-editor-keyboard-mapping.js   makes the key rebindable
```

Both are registered in **both** action groups (`game` and `shell`), because the options
screen exists in the main menu as well as in game. Registered in one scope only, the settings
disappear from the other.

## The shared "Mods" tab

```js
CategoryType["Mods"] = "mods";
CategoryData[CategoryType.Mods] ??= {
    title: "LOC_UI_CONTENT_MGR_SUBTITLE",
    description: "LOC_UI_CONTENT_MGR_SUBTITLE_DESCRIPTION",
};
```

⚠️ **The "Mods" category is not part of the base game.** Several community mods add it the
same way, so it is created with `??=` and the shared id `"mods"` — several mods then land in
**one tab** instead of each spawning its own. Keep the `??=`.

⚠️ **`import '/core/ui/options/screen-options.js';` must come first**, before the model is
touched.

## The group id

```js
group: "najane_mods"
```

The options screen derives the heading from the group id as `LOC_OPTIONS_GROUP_<ID IN
CAPITALS>` — so this needs `LOC_OPTIONS_GROUP_NAJANE_MODS` in the text files. **The heading
text is not set in code.**

⚠️ **This mod owns `najane_mods`** and titles it "Common Specialists Yields". The sibling
Commerce mod deliberately uses a *different* group (`najane_commerce`) for the same reason:
anything filed under someone else's group appears to belong to them.

## The seven settings

All booleans, stored as `0` / `1`, defaulting to **off** — except `expandDetailsByDefault`.

| Property | Option id | Read by |
|---|---|---|
| `alwaysShowNegatives` | `najane-always-show-negatives` | the layer |
| `originalByDefault` | `najane-original-by-default` | `view-mode.js` |
| `dontAggregateNegatives` | `najane-dont-aggregate-negatives` | the layer |
| `dontAggregatePositives` | `najane-dont-aggregate-positives` | the layer |
| `onlyNonZeroCommon` | `najane-only-nonzero-common` | the panel |
| `fullYieldsOnHover` | `najane-full-on-hover` | the layer |
| `expandDetailsByDefault` ⚠️ default **on** | `najane-expand-details-default` | `panel-expanded-default.js` |

⚠️ **Every one of them is presentation only.** None may reach the baseline — see
[Architecture](02-architecture.md).

⚠️ **`expandDetailsByDefault` is the one default that is `1`.** `defaults` is the only place
that says so; `get()` falls back to it whenever nothing is stored, so an option left out of
that object reads as `undefined` → `false` and silently ships off.

The two "do not aggregate" boxes are registered **adjacent on purpose**, so the mirrored
pair reads as one choice.

## The "highest only" family — seven more, table-driven

One checkbox per yield: **"Show only tiles giving the most X"**, all defaulting to off.

```js
export const HIGHEST_ONLY_YIELDS = [
    { optionID: "highestOnlyFood", yieldType: "YIELD_FOOD",
      id: "najane-highest-only-food", label: "LOC_OPTIONS_NAJANE_HIGHEST_FOOD" },
    ...
];
```

Everything is derived from that one list — the defaults
(`...Object.fromEntries(HIGHEST_ONLY_YIELDS.map(...))`), the accessor, and the seven
`Options.addOption` registrations in a `for` loop.

**Why a table here and not for the six above.** These seven are *parallel*: they differ only
in which yield they name. Written out by hand they would be seven near-identical 11-line
blocks in which a copy-paste slip is invisible. The other six options are unrelated to each
other, and individual blocks are the right shape for them. Do not "consistify" one into the
other.

| Detail | Why |
|---|---|
| ⚠️ **`YieldType` strings only, no `GameInfo`** | this module also loads in the **shell** scope, where the gameplay database does not exist; resolving a type to an index is the model's job |
| ⚠️ **Influence is `YIELD_DIPLOMACY`** | "Influence" is only its display name — verified against the game's own `YieldsText.xml` |
| ⚠️ **`optionID` is the stored key** | renaming one silently resets that setting for everyone who had it on; **append** to the table rather than reshuffling |
| **One shared description key** | the text differs only in the yield it names, and the label already says which — one string per language instead of seven |

### Reading them back

```js
/** YieldTypes whose "show only the tiles with the highest X" filter is currently on. */
getHighestOnlyYieldTypes()      // -> ["YIELD_SCIENCE", "YIELD_GOLD"]
```

⚠️ **It returns a LIST, not a single choice.** The player may switch on any number, and the
consumer **unions** the results — a tile shows if it wins any of them. See
[the map layer](07-map-layer.md).

## The storage channel

```js
UI.setOption("user", "Mod", `${MOD_ID}.${optionID}`, value);
Configuration.getUser().saveCheckpoint();     // ⚠️ required, or it does not survive
```

⚠️ **`saveCheckpoint()` is not optional.** Without it the value is set for the session and
gone on restart.

⚠️ **`localStorage` is a *second* write, never the primary one.** It is read only when
`UI.getOption` returns nothing, and both directions are inside `try` / `catch`: harmless if
it works, ignored if it does not.

⚠️ **Nothing goes into the save file.** The mod declares `AffectsSavedGames = 0`; writing
into a save would make that a lie and tie the save to having the mod installed.

Values are stored as **numbers**. Every use of `UI.setOption` in the game itself passes a
number, so `Number(value)` on the way in and `Boolean(...)` on the way out is deliberate.

### ⚠️ The zero trap — currently dodged by luck

An option that was **never set** reads back as `0`, exactly like an option deliberately set
to `0`:

```js
get(optionID) {
    if (this.data[optionID] == null) {
        const stored = restore(optionID);
        this.data[optionID] = stored != null ? Number(stored) : this.defaults[optionID];
    }
    return Boolean(this.data[optionID]);
}
```

This is safe **only because every default here is `0`**: "never touched" and "off" mean the
same thing, so the ambiguity has no consequence.

⚠️ **The moment any default becomes `1`, this breaks silently** — every player who has never
opened the options screen gets the setting switched off, and nothing reports it. The fix is
the one the sibling Commerce mod uses throughout: **offset the stored value by one**
(`STORED_OFF = 1`, `STORED_ON = 2`), so `0`, `null` and `undefined` all mean "never chosen".
Do that in the same edit that changes the default, and use a **new option name**, because an
old 0/1 value cannot be read as a new 1/2 one.

### The change event

```js
export const NajaneOptionsChangedEventName = "najane-specialists-options-changed";
```

Dispatched on **every** `set`. The panel refreshes on it; the layer does a full redraw. ⚠️ A
new option that affects what is drawn needs nothing extra — but a new option written any
other way than through `set()` will not notify anyone.

## Adding an option — checklist

0. **If it is another per-yield filter, add one row to `HIGHEST_ONLY_YIELDS` and stop** —
   the default, the accessor and the registration all follow from it. You still need the
   label string in twelve locale files.
1. Add the default to `defaults` (**`0`**, or read the zero trap above first).
2. Add the getter/setter pair, with a one-line comment saying what it does.
3. Register it in the `Options.addInitCallback` block, `type: OptionType.Checkbox`,
   `category: CategoryType.Mods`, `group: "najane_mods"`.
4. Add `LOC_OPTIONS_NAJANE_<NAME>` and `…_DESCRIPTION` to **all twelve** locale files.
   A missing key renders as the raw tag on screen.
5. Consume it **in the panel or the layer**, never in the model.
6. Check the description text does not name a key that is no longer accurate — see
   [known gaps](11-known-gaps.md).

## `ui/options/editors/najane-editor-keyboard-mapping.js`

Makes the mod's binding appear in **Options → Accessibility → Keyboard and Mouse →
Configuration**.

⚠️ **Registering an `InputAction` in `config/input.xml` is not enough on its own.** The
editor does not enumerate registered actions — it walks a hardcoded `KEYS_TO_ADD` array
inside the game's own `editor-keyboard-mapping.js`. Anything not in that list **never shows
up, with no error anywhere.**

So `addActionsForContext` is wrapped and the mod's action appended afterwards, reusing the
component's own `createActionEntry` so the row looks and behaves exactly like a stock one:

```js
afterAddActionsForContext(inputContext) {
    for (const actionIdString of NAJANE_KEYS_TO_ADD) {
        const actionId = Input.getActionIdByName(actionIdString);
        if (!actionId) { console.error(...); continue; }
        if (this.component.mappingDataMap.has(actionId)) continue;   // listed for an earlier context
        this.component.actionContainer.appendChild(
            this.component.createActionEntry(actionId, inputContext));
    }
}
```

Three details:

- ⚠️ **The prototype is shared, so it is patched once** (`static patched`). See
  [Platform notes](03-platform-notes.md).
- ⚠️ **The `mappingDataMap` check is required**, not defensive: the action is constrained to
  two input contexts (`World`, `Unit`), so this runs twice and would otherwise list the key
  twice.
- ⚠️ **The action name is spelled out as a literal**, not imported from
  `modifier-tracker.js`: this file also runs in the **shell** scope, where that module's
  gameplay imports do not belong. It must stay in sync with `ALTERNATIVE_VIEW_ACTION` and
  `config/input.xml` — three places, by design.
