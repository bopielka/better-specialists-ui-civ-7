#!/usr/bin/env bash
#
# Deploys this mod into Civilization VII's mod folder.
#
# This is the macOS counterpart to deploy.sh, which was written for Windows
# (Git Bash) and defaults to %LOCALAPPDATA%. The two scripts are otherwise
# identical - keep them in sync if the deploy/check logic changes.
#
# Source of truth is this repository; the game folder is treated as build output
# and is rebuilt from scratch on every run, so files deleted here also disappear
# there instead of lingering as stale leftovers.
#
# Only what the game actually loads is copied - the .modinfo and the content
# directories listed below. Everything else (this script, README, .git, notes)
# stays out of the player's mod folder by construction, not by an exclude list
# that can drift.
#
# Usage:  ./deploy-on-mac.sh          deploy
#         ./deploy-on-mac.sh --dry    show what would happen, change nothing
#
# Override the install location if needed:
#         CIV7_MODS_DIR="/path/to/Mods" ./deploy-on-mac.sh
#
set -euo pipefail

# --- configure ---------------------------------------------------------------
MOD_ID="najane-common-specialists-yields"

# Directories copied into the game, relative to this script.
CONTENT_DIRS=(ui text config)

# Default install path on macOS.
DEFAULT_MODS_DIR="$HOME/Library/Application Support/Civilization VII/Mods"
# -----------------------------------------------------------------------------

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST_ROOT="${CIV7_MODS_DIR:-$DEFAULT_MODS_DIR}"
DEST_DIR="$DEST_ROOT/$MOD_ID"

DRY_RUN=0
[[ "${1:-}" == "--dry" ]] && DRY_RUN=1

say() { printf '%s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

# Kept identical to deploy.sh, where it matters more: double-clicked in Explorer that script
# runs in a git-bash.exe window that closes the instant it ends, so a successful deploy and a
# `die` in the safety block below look exactly alike from outside - a window that flashes and
# is gone. An interactive shell ($- contains i) is that case; a terminal or another script is
# not, so this never blocks a non-interactive run. On macOS Terminal already keeps the window
# after the process exits by default, so here it is parity rather than a fix.
if [[ $- == *i* ]]; then
    trap 'printf "\nPress Enter to close... "; read -r' EXIT
fi

# --- safety: never let a bad path turn this into a destructive command --------
[[ -f "$SRC_DIR/$MOD_ID.modinfo" ]] \
    || die "$MOD_ID.modinfo not found in $SRC_DIR - run this from the mod's own folder."
[[ "$(basename "$DEST_DIR")" == "$MOD_ID" ]] \
    || die "refusing to touch '$DEST_DIR' - it does not end in $MOD_ID."
[[ -d "$DEST_ROOT" ]] \
    || die "Civ VII mods folder not found: $DEST_ROOT (set CIV7_MODS_DIR to override)"

say "source: $SRC_DIR"
say "target: $DEST_DIR"
say ""

if [[ $DRY_RUN -eq 1 ]]; then
    say "[dry run] would remove the target folder and copy:"
    # `find` fails on content dirs this mod does not ship yet - not an error here.
    ( cd "$SRC_DIR" && find "$MOD_ID.modinfo" "${CONTENT_DIRS[@]}" -type f 2>/dev/null | sort | sed 's/^/  /' ) || true
    say ""
    say "[dry run] nothing was changed."
    exit 0
fi

# --- deploy ------------------------------------------------------------------
rm -rf "$DEST_DIR"
mkdir -p "$DEST_DIR"

cp "$SRC_DIR/$MOD_ID.modinfo" "$DEST_DIR/"
for dir in "${CONTENT_DIRS[@]}"; do
    [[ -d "$SRC_DIR/$dir" ]] && cp -r "$SRC_DIR/$dir" "$DEST_DIR/"
done

# --- verify: every file the .modinfo references must exist in the target ------
missing=0
while IFS= read -r item; do
    [[ -z "$item" ]] && continue
    if [[ ! -f "$DEST_DIR/$item" ]]; then
        printf 'MISSING: %s (referenced by .modinfo)\n' "$item" >&2
        missing=$((missing + 1))
    fi
done < <(grep -o '<\(Item\|File\)[^>]*>[^<]*</\(Item\|File\)>' "$DEST_DIR/$MOD_ID.modinfo" \
         | sed 's/<[^>]*>//g')

count=$(find "$DEST_DIR" -type f | wc -l)
say "deployed $count files"
if [[ $missing -gt 0 ]]; then
    die "$missing file(s) referenced by the .modinfo are missing - the mod will not load correctly."
fi
say "all .modinfo references resolved"
say ""
say "Restart the game, or return to the main menu, to reload the mod."
