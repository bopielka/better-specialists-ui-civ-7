# 11 — Known gaps, fragile edges, and what to re-test

What is unfinished, what is likely to break, and what has already been tried and failed.
Read this before deciding a piece of behaviour is a bug.

## 1. ⚠️ The `*Maintenance` fields are not understood

**Symptom.** The game omits the "Specialist maintenance" line in the ANALYSIS block on a
tile that **already holds a specialist**, even though the RESULTS bar above it accounts for
the cost.

**What was tried.** Filling that line in from `CurrentMaintenance` / `NextMaintenance`. It
produced **roughly double the real figures** and was reverted before 1.0.

**Before retrying:** dump the raw `CurrentMaintenance` and `NextMaintenance` arrays for one
tile with **0** specialists and the same tile with **1**, and derive the formula from real
data — not from what the field names suggest. `dumpSpecialistDiagnostics()` in
`ui/model-specialists-yield-baseline.js` is the hook for that; set `DIAGNOSTICS = true`,
reproduce, read `UI.log`, set it back.

⚠️ Note that the mod's own delta calculation *does* use these fields
(`CurrentMaintenance[i] - NextMaintenance[i]`) and produces correct-looking results for the
**difference between two tiles**, which is all it needs. The unsolved part is reconstructing
an **absolute** maintenance figure.

## 2. ⚠️ The City Hall compatibility shim reaches into another mod's internals

`drawCompanionExtras()` in `ui/worker-yields-layer-patch.js` calls `realizeBuildSlots`,
reads `bzGridSpritePosition` and uses `MapCities.getDistrict` — all of them
`bz-city-hall`'s private surface.

It is feature-detected and wrapped in `try` / `catch`, so it **fails quietly** rather than
breaking the mod. That is also the risk: if City Hall restructures, their building-slot icons
simply stop appearing in this mod's view and nothing says so.

**What to check when their mod updates:** enter placement with City Hall installed, in the
mod's difference view (not the original view), and confirm the building-slot icons are drawn.
Then check `UI.log` for `could not redraw City Hall building slots`.

## 3. ⚠️ "Tested alongside City Hall" is a claim in the store description

It must be **re-confirmed in game after any change to the layer patch**. The claim is on the
Workshop page; the code that makes it true is one feature-detected block.

## 4. ⚠️ Several strings still say "Shift"

The key became a rebindable input action defaulting to **Tab** in 1.3, but these were not
updated:

| Where | Key / text |
|---|---|
| `text/*/InGameText.xml` | `LOC_OPTIONS_NAJANE_ORIGINAL_DEFAULT_DESCRIPTION` — "…only while Shift is held" |
| `text/*/ModInfoText.xml` | `LOC_MOD_NAJANE_SPECIALISTS_DESCRIPTION` — "Hold Shift to switch back…" |
| `ui/options/najane-options.js` | the comment on `originalByDefault` — "Invert Shift: …" |
| `README.md` | mostly correct (says Tab), but the two are worth reading together |

**The on-screen hint is correct** — it asks the engine what is actually bound — so this is a
text problem, not a behaviour one. Fixing it touches twelve locale files twice over.

⚠️ **Do not name a specific key in the replacement text.** Say "the alternative view key",
or compose the bound label in code the way the hint does.

## 5. ⚠️ 1.1 and 1.2 have no release notes at all

`CHANGELOG.md` and `STEAM_CHANGELOG.bbcode` both now exist and both cover **1.0, 1.3 and
1.4**. The 1.0 and 1.3 sections are **reconstructed from the Steam Workshop page**, which was
the only written account of them.

**1.1 and 1.2 were never written up anywhere** and are gone apart from git history
(`git log --oneline`), which does not explain reasoning. Fill them in only from evidence — do
not reconstruct them from the diff and present the result as a record of intent. The sibling Commerce mod keeps both, written in the same pass
so they cannot drift. Anything reconstructed now comes from git history
(`git log --oneline`), which currently has eight commits and does not explain reasoning.

## 6. ⚠️ The deploy scripts are committed non-executable, and check nothing

`deploy.sh` (Windows, Git Bash) and `deploy-on-mac.sh` (macOS) are both in the repository and
differ only in the default install path. Two things are wrong with them.

**They are tracked with mode `100644`**, so a fresh clone — and this working copy — cannot
run `./deploy.sh` at all; it fails with "permission denied". `chmod +x` fixes the local copy
but not the repository. Fix it in a way git records:

```bash
git update-index --chmod=+x deploy.sh deploy-on-mac.sh
```

**They run no checks on what they deploy.** The sibling Commerce mod's `deploy.sh` runs three
that mod learned to need the hard way:

| Check | Why it exists there |
|---|---|
| `node --input-type=module --check` on every script | a broken string literal reached the game and stopped the mod loading |
| no stray backtick inside a CSS template literal | a backtick in a CSS comment closes the string; the rest parses as code |
| Steam description / changelog character limits | Steam truncates at 6000 / 8000 without warning |

The backtick check is the only one that does not apply here (there are no CSS template
literals in this mod). ⚠️ **The character-limit check now does** — `STEAM_CHANGELOG.bbcode`
exists as of 1.4 and has a hard 8000-character ceiling that Steam enforces by silently
truncating the tail. Until both are ported, run them by hand — see
[workflow](10-development-workflow.md).

Lifting the check blocks out of the Commerce repository's `deploy.sh` is the shortest route
to both that apply. ⚠️ There, `deploy.sh` holds the logic and `deploy-on-mac.sh` is a
seven-line shim that `exec`s it — the opposite of the arrangement here, where the two are
full copies of one another and must be kept in sync by hand.

## 7. Structural fragility, ranked

| Rank | What | Why |
|---|---|---|
| 1 | `layer.updateSpecialistPlot` replacement | it does not delegate; it uses `getSpecialistPipOffsetsAndScale`, `addPositiveYield`, `addNegativeYield`, `yieldVisualizer` and the sprite names directly |
| 2 | `drawCompanionExtras` | another mod's internals |
| 3 | `.flex.flex-col.pb-4.px-4` in the panel | a game-internal class combination; has a `??` fallback |
| 4 | `component.specialistMinimizedContainer`, `subsystemFrame` | undocumented component fields; feature-detected |
| 5 | `createActionEntry`, `mappingDataMap`, `actionContainer` | the keyboard editor's private surface |
| 6 | `KEYS_TO_ADD` being hardcoded in the game's editor | the reason item 5 exists at all |

Everything in that list is feature-detected or `try`/`catch`-wrapped, which means **a game
patch degrades this mod quietly rather than loudly**. When something "just stopped
appearing", start here rather than in the model.

## 8. Things that are *not* bugs

- **Rural tiles showing their full yields.** Deliberate — they are population expansions, not
  specialists. See [the baseline model](04-baseline-model.md).
- **A tile showing no pills at all.** It matches the common case exactly; that is the whole
  point of the mod.
- **The panel section disappearing.** The baseline is empty — one workable tile, or no shared
  part at all. Both sections hide rather than draw an empty bar.
- **Negative pills only under the cursor.** Default behaviour; "Always show negative yields"
  turns them on everywhere.
- **`ru_RU` containing Ukrainian.** Deliberate; the game has no Ukrainian locale.
- **The first `applyPatch()` failing.** The layer registers after mod scripts run; the retry
  handles it.
