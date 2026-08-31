# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository.

A UI-only mod for Sid Meier's Civilization VII — **"Better Specialists UI by Najane"**, mod id
`najane-common-specialists-yields`. Plain ES modules, **no build step, no bundler, no TypeScript,
no tests** — the game loads the `.js` files directly.

## Read this first

`documentation/README.md` is the index and is written for an agent starting with no context.
`README.md` is the player- and author-facing document.

Also read, before deriving anything about the platform:
`C:\Users\najan\Documents\Civ7Modding\knowledge-base\00-README.md`. General Civ VII modding
knowledge lives there, not here. **Anything new learned in a session goes back into it in the
same session** — a standing rule from the user, not a nicety.

## What the mod does

When placing a specialist, every workable tile repeats the same numbers. The mod states the
shared part once in a **Common Specialists Yields** panel, so the map only shows how each tile
deviates from it. Holding a rebindable key falls back to the game's original display.

## The hard constraint: UI only

**The mod modifies the interface and changes no game mechanics.** `AffectsSavedGames` stays `0`.
If a requested feature would need a rules change, flag the conflict rather than quietly making
one.

## Commands

```bash
./deploy.sh
```

```bash
./deploy.sh --dry
```

The game never reads this repository — it reads a copy in its own mod folder, so a change that
has not been deployed is a change that is not running. Scripts load **once**, so return to the
main menu or restart after deploying.

### ⚠️ `node --check` is worthless on these files

It parses `.js` as CommonJS, meets `import`, gives up, and **exits 0 on a file with a syntax
error**. The real check reads from stdin:

```bash
for f in $(find ui -name '*.js'); do node --input-type=module --check < "$f" || echo "FAIL $f"; done
```

### Logs

`%LOCALAPPDATA%\Firaxis Games\Sid Meier's Civilization VII\Logs\` — `UI.log`, `Modding.log`,
`Database.log`. ⚠️ **`console.log` never reaches `UI.log`.** Use `console.error`.

## Rules that are easy to break

1. **The baseline is the value CLOSEST TO ZERO keeping its sign** across every placement option —
   not an average, not the most frequent value. A yield missing from a plot counts as an explicit
   `0`.
2. ⚠️ **Specialist upkeep lives only in `*Maintenance`, never in `*Yields`.**
3. ⚠️ **`ui/options/` loads in SHELL scope too** — no game, no map, no engine events. Nothing it
   imports may touch the game at import time.
4. ⚠️ **Lens layers register AFTER mod scripts run.** Import the vanilla layer module first to
   force the order, or retry on `InterfaceModeChangedEventName`.
5. ⚠️ **`fxs-subsystem-frame` reparents its children after build**, so DOM insertion must be
   deferred with the global `waitForLayout()`, and the game HIDES some `panel-place-population`
   containers per interface mode — DOM injected into the wrong one is simply invisible.
6. **Cache per-plot work and invalidate on an event**, never per hover. A full baseline scan per
   tile was quadratic and had to be rewritten.
7. **Set any `DIAGNOSTICS` flag to `false` before publishing.**

⚠️ **This mod overlaps City Hall** (`bz-city-hall`): both patch `PlotWorkersManager`,
`fxs-worker-yields-layer` and `panel-place-population`, and both compute a specialist baseline —
by two different formulas. Both are installed on this machine and the interaction has never been
observed in game.

## Conventions

4-space indent, semicolons, single quotes, trailing commas. `camelCase` functions,
`SCREAMING_SNAKE` module constants. Imports of game files are absolute (`/core/…`,
`/base-standard/…`), of this mod's files relative. New localisation keys go into **all twelve**
`text/<locale>/InGameText.xml` files.

⚠️ Wrap every call into the game in `try`/`catch` and warn on failure. The engine throws where a
browser would return `undefined`.

⚠️ **No backtick inside a CSS template literal**, including in comments — it closes the string
and the module fails to load, taking the mod with it.

## ⚠️⚠️ STANDING RULE: build on the NEW UI system (`ui-next` / Solid), not the old one

**The user's instruction, 2026-08-27.** It applies to every Civ VII mod in this folder.

Civ VII ships **two** UI frameworks side by side, and Firaxis is migrating from the first to
the second one screen at a time:

| | old | new |
|---|---|---|
| Location | `ui/` | `ui-next/` |
| Elements | `Controls.define` / `Controls.decorate` | Solid components, `ComponentRegistry.register` |
| Tooltips | `TooltipManager.registerType` + `data-tooltip-style` | `Tooltip.Trigger` / `Content` / `Frame` / `Text` |

**Anything NEW this mod builds goes on `ui-next`.** The old framework is where features go to
die: it has no tooltip nesting, no lockable/interactive tooltips, and every screen still on it is
a screen Firaxis may move next — and a move like that silently breaks anything hanging off the
old element handles. F1rstDan's Cool UI lost its headline feature that exact way and it has
stayed broken for two releases.

### The one honest exception

A panel the game still defines with `Controls.define` can only be reached with
`Controls.decorate` or a prototype patch — there is no `ui-next` way to hook it, because it is
not an `ui-next` component. That is a fact about the game, not a licence.

So the rule in practice:

- **hooking** an old-framework panel: use the old mechanism, there is no choice;
- **building** anything of our own inside it — a tooltip, a row, a control, a panel: `ui-next`;
- never register a **new** `TooltipManager` type, and never write a new `Controls.define`d
  component, when a Solid one would do.

⚠️ Before writing UI code, check which framework the target is actually on. Knowledge base
`25-ui-next-solidjs.md` has the comparison, the tooltip API and the bridge
(`defineLegacyComponent`) that lets an old-framework element host a Solid component.
