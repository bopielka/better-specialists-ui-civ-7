# Changelog

Notable changes to **Better Specialists UI**. Newest first.

⚠️ **1.1 and 1.2 are missing.** This file was started during the 1.4 work; 1.0 and 1.3 below
are reconstructed from the release notes published on the Steam Workshop page, which is the
only written account of them. The two intervening releases have no notes anywhere, and git
history is all that is left of them.

⚠️ Every entry here is also condensed into `STEAM_CHANGELOG.bbcode` **in the same pass**.
Skip that once and the two drift apart within a release or two, at which point nobody knows
which is right.

## 1.5 — unreleased

### Yield details expanded when the placement screen opens

**"Expand yield details by default", under Options → Mods, and the only setting in this mod
that ships ON.** The game opens the placement screen collapsed and puts the numbers behind a
Space press; the panel exists to be read, so reaching them should not be a step.

⚠️ **IT RUNS ON MODE ENTRY, NOT ON ATTACH, AND THAT IS NOT A STYLE CHOICE.**
`panel-place-population` sits in `root-game.html` and attaches ONCE per session, before any
placement screen. An attach-time flag would reach the first screen only — and `onAttach` ends
with `ViewManager.isWorldZoomAllowed = !PlacePopulation.showExpandedView`, which nothing
restores until a placement screen closes, so setting the flag there **disables world zoom from
game load** until the player has opened and closed the screen once. Entering
`INTERFACEMODE_ACQUIRE_TILE` is the moment the screen actually opens, and it is where this acts.

⚠️ **IT CALLS `toggleMinMax()` AND TOUCHES NOTHING ELSE.** That method flips the flag, toggles
four min/max containers, rewrites four footer labels and sets the zoom flag. Reproducing it here
would be fifteen lines of game code to re-check on every patch — and the zoom flag is precisely
what the attach-time version got wrong. The accepted cost is its expand sound firing as the
screen opens.

⚠️ **`showExpandedView` IS ONE FLAG FOR THE WHOLE PANEL**, shared with the "add improvement"
view. There is no per-frame version, so the setting expands that view too; the option
description says so rather than pretending otherwise.

⚠️ **Already expanded is a no-op**, so Space still collapses the details and they stay
collapsed for the rest of that visit. The default applies again the next time the screen opens.

⚠️ **A SECOND DECORATOR ON THE SAME COMPONENT, in its own file.** `Controls.decorate` appends
to a list and `doAttach` walks all of it, so this and the common-yields section are independent
— neither can see the other. Folding it into the section's class would have tied a setting about
the game's own frames to the lifetime of a section this mod draws.

---

## Najane mods: one settings block (2026-08-30)

### One block of settings across all three Najane mods

Every Najane mod's settings now sit together in the shared "Mods" tab, under headings that all
begin with the family name. Naming them alike was not enough - they were still scattered down the
tab with other mods' headings between them.

⚠️ **The on-screen order is the order `Options.addOption` was called in, and nothing else.**
`screen-options.js` builds its rows by iterating `Options.data`, which is a Map and so is in
insertion order, and `screen-options-category.js` creates a group's heading the first time an
option asks for it. A mod adding its own options from its own init callback therefore interleaves
with every other mod that does the same.

⚠️ **The fix is a handshake through one global, and it works because of the timing.**
`Options.init()` runs EVERY registered init callback in one pass, and only when the options screen
opens - by which point every mod has long since loaded. So all three mods register their options
into a shared registry at load time, and whichever one's callback fires first adds all of them in
one uninterrupted burst. `ui/options/najane-mod-options-registry.js` is shared verbatim by the
three mods; `sort` (10 specialists, 20 city, 30 commerce) fixes the running order so the sections
do not change places depending on which mod loaded first.

⚠️ **The re-entry guard is a probe, not a flag.** `reInitOptions()` clears `Options.data` and
re-arms the same callbacks, so a boolean would be stuck true and the settings would come back
empty the second time the screen was opened. Asking whether an option we added is still registered
answers "has this cycle been handled" without having to be told.

---

## 1.4

### Added

- **"Show only tiles giving the most X" — one checkbox per yield**, under Options → Mods:
  Food, Production, Gold, Science, Culture, Happiness and Influence. All default to **off**.
  When one is on, only the tile where a specialist would give the most of that yield keeps its
  numbers on the map; every other tile keeps its specialist pips but loses its yield pills.
  - **Ties show every tied tile.** A single winner would be a lie about the board.
  - ⚠️ **The rule only engages when a tile beats the common value by at least +1.** Below
    that the field is effectively level, and singling out a tile that wins by a rounding
    error hides more than it explains. A yield with no such tile simply takes no part, and
    if none of the enabled yields has one, the rule does not apply at all and the map is
    left alone — deliberately not the same as "nothing qualifies, so show nothing".
  - ⚠️ Two consequences of that threshold, both correct rather than accidental: a yield the
    city cannot produce can never qualify, and neither can a yield every tile only **pays**
    for — **Food** most of the time. The common value is the one closest to zero, which for
    an all-negative set *is* the best tile, so nothing is ever above it.
  - ⚠️ **They union, they do not exclude one another.** Any number can be on at once and a
    tile is shown if it wins *any* of them. Intersecting them was rejected: the best science
    tile is rarely also the best food tile, so a second checkbox would usually empty the map.
  - **The tile under the cursor always keeps its numbers**, the way it already does for
    negative pills and for "show everything on hover" — the cursor is this mod's inspection
    tool, so a filtered map stays explorable.
  - Ranking uses the tile's **own yield delta** — what a specialist placed there would
    actually give — and not its deviation from the common value. The player is asking which
    tile is best, not which is most unusual, and the two answers diverge as soon as a "do not
    aggregate" option is on.
  - ⚠️ A yield **no** tile produces shows **nothing**, rather than every tile tied at zero.
    Without that rule, switching the filter on for a yield this city cannot produce would show
    the entire map — the opposite of what was asked for.
  - A tile that merely costs the **least** food still wins "highest Food" in a city where
    every tile costs some, which is the useful answer rather than an empty one.
  - Holding the alternative-view key still hands the map back to the game untouched; the
    filters do not apply there.

### Fixed

- **"Show everything on hover" now adds a yield's gain and its upkeep together**, instead of
  listing them as two pills. The option handed the hovered tile back to the game untouched,
  and the game draws those as two separate groups — so a specialist paying 5 happiness to
  earn 3 showed `+3` and `-5` beside each other rather than the `-2` it actually costs, which
  is exactly the doubling-up this mod exists to remove. The hovered tile is now drawn from
  this mod's own deltas with nothing subtracted: full figures, one pill per yield.
  - ⚠️ The option no longer delegates to the game's implementation at all. Holding the
    alternative-view key still reaches the untouched display, so no way of seeing the
    original numbers was lost.
  - The option's description said "complete **unmodified** yields" in all twelve languages;
    it now says the gain and upkeep are added together.
- **"Do not aggregate negative yields" now also means what its name says on a full-value
  tile**: the upkeep is not folded into the gain, so the yield keeps two pills. With the
  option on a specialist paying 5 happiness to earn 3 reads `+3` and `-5`; with it off, `-2`.
  - ⚠️ It applies **only** where the full figures are shown — the hovered tile under "show
    everything on hover". A *deviation* from the common value cannot be split into halves,
    because the common value is itself a sum of them.

### Internal

- `computeRawParts()` keeps a specialist's effect as its two halves — `gain` and `upkeep` —
  **unrounded**, and both `computePlotSpecialistDeltas()` (the sum, rounded once) and
  `computePlotSpecialistYieldParts()` (the halves, rounded for display) are derived from it.
  ⚠️ One source of truth on purpose: rounding each half and adding afterwards is not the same
  arithmetic as rounding the sum, and the sum feeds the baseline, the ranking and the map.

- `getHighestYieldPlots(yieldType)` in `ui/model-specialists-yield-baseline.js` answers which
  plots tie for the best of one yield — and returns nothing unless that best beats the common
  value by `STANDOUT_THRESHOLD`. Cached per yield alongside the existing caches and dropped
  with them.
- ⚠️ The margin is **rounded before it is compared**: `2.1 - 1.1` is `0.9999999999999998` in
  binary floating point, which would fail a bare `>= 1` on two numbers plainly one apart.
  Covered by a throwaway harness that loads the real module with the game globals stubbed;
  twelve cases, including that one, the all-upkeep case and the ties. The *fact* lives in the model; *which* yields are being filtered on stays
  in the layer, which is the same split the "do not aggregate" options already follow.
- The type → yield-index map is built **once**. `GameInfo` is scanned rather than queried, and
  this question is asked for every tile of every redraw.
- The seven options are **table-driven** (`HIGHEST_ONLY_YIELDS`): defaults, accessor and
  registrations all derive from one list, because these are parallel options differing only in
  the yield they name. The six older, unrelated options stay written out individually.
- ⚠️ The options module stores plain `YieldType` strings and never touches `GameInfo` — it
  also loads in the **shell** scope, where the gameplay database does not exist.
- The labels use the game's own translated yield names, read out of
  `base-standard/text/…/YieldsText.xml` and the `l10n/*_Text.xml` files, so they match the rest
  of the interface in all twelve languages. Influence is `YIELD_DIPLOMACY` in the data.
- All seven share one description string: it differs only in the yield the label already
  names — one line of translation per language instead of seven.

### Development note

- ⚠️ **Two copies of this mod with the same id fight, and the winner is decided by the
  `Disabled` flag in `Mods.sqlite`, not by version or by path.** A Steam Workshop
  subscription to your own published mod silently shadows the local development build:
  both are scanned and registered, the enabled one is applied, and there is **no warning
  anywhere** — the game simply runs the other copy, with no error in `UI.log` and a single
  entry in `Modding.log`. Disable the Workshop copy in the in-game Mods browser while
  developing. Diagnose with:

  ```sql
  SELECT m.ModId, m.Version, m.Disabled, s.Path FROM Mods m
    JOIN ScannedFiles s ON s.ScannedFileRowId = m.ScannedFileRowId WHERE m.ModId = '<id>';
  ```

### Documentation

- Added `documentation/`, a twelve-part developer guide written for an AI agent starting a new
  session with no prior context: what the mod does and where each behaviour lives, the
  architecture and its dependency order, the platform traps, one document per source file,
  localisation, the workflow, and the known gaps.

## 1.3

Reconstructed from the published Steam notes.

### Added

- **The alternative view became a real key binding**, listed under Options → Accessibility →
  Keyboard and Mouse → Configuration as "Better Specialists UI: alternative view" and
  rebindable to any key. The binding entry is translated in all twelve languages.
  - ⚠️ **The default moved from Shift to Tab.** Shift was hardwired and clashed with other UI
    mods reacting to the same key — City Hall shows its building overlay on it.
  - The on-screen hint now names the key that is actually bound and follows any rebinding,
    instead of always saying "Shift".

### Changed

- **"Show positive yields only" became "Do not aggregate positive yields"** and was moved
  directly under the negative counterpart it mirrors exactly. It no longer overrides "Always
  show negative yields" — each option now does one thing.
- **"Show full yields on hover" became "Show everything on hover".**
- **Panel icons are centred with even spacing** instead of being stretched across the panel
  when some of them are filtered out.

### Fixed

- **City Hall's building slot icons are drawn again while this mod's view is active.** They
  had only reappeared while the original view was on screen, because this mod replaces the
  drawing step City Hall extends rather than delegating to it.
- **"Do not aggregate positive yields" did nothing when a yield was the same on every tile.**
  It now shows such yields in full, which was the point of the option.

## 1.0 — initial release

Reconstructed from the published Steam notes.

### The Common Yields panel

- **States once, per city, what any specialist gives and costs there.** The common value is
  the part every specialist option shares: for each yield, the value closest to zero across
  all specialist tiles. A yield only some tiles produce has no common part and is left out.
- Both a specialist's **yield gain and its upkeep** are taken into account.
- The panel appears in **two** places: at the bottom of the "Choose a tile" overview, and at
  the top of the "Add specialist" view.
- ⚠️ **Only urban tiles are counted** — Urban and City Center districts. Rural expansion
  tiles are excluded from the calculation.

### Map display

- **Tiles show only their deviation from the common value** instead of the full figures. A
  tile matching the common value shows no yield pill at all.
- **Negative yields are shown only on the tile under the cursor** by default.
- **Rural and expansion tiles keep the game's original display**, untouched. Specialist pips
  and blocked-tile markers are unchanged.

### The Shift toggle

- **Holding Shift switches to the game's original, unmodified display.**
- The panel hint updates live to say where Shift will take you: "Shift → default view" or
  "Shift → yield differences".

### Options (Options → Mods)

All off by default, and remembered between sessions:

- Always show negative yields
- Show original yields by default
- Do not aggregate negative yields
- Show only yields with a common value
