#!/usr/bin/env bash
# bootstrap.sh — install myclaude (Frank's base Claude Code layer) on a new machine.
#
#   curl -fsSL https://raw.githubusercontent.com/eliteGoblin/myclaude/main/bootstrap.sh | bash
#
# Steps: check prerequisites, clone or update the repo, link the `myclaude` CLI, back up
# ~/.claude, then `node myclaude.js install` (clones the pinned sources and installs only
# myclaude's own items). Files that myclaude does not own are never moved or deleted.
#
# Env: MYCLAUDE_DIR (default ~/devel/myclaude), MYCLAUDE_REPO (default the GitHub URL),
#      MYCLAUDE_BIN_DIR (default ~/.local/bin).
set -euo pipefail

REPO="${MYCLAUDE_REPO:-https://github.com/eliteGoblin/myclaude.git}"
DIR="${MYCLAUDE_DIR:-$HOME/devel/myclaude}"
BIN_DIR="${MYCLAUDE_BIN_DIR:-$HOME/.local/bin}"
CLAUDE_HOME="${MYCLAUDE_CLAUDE_HOME:-$HOME/.claude}"
MIN_NODE_MAJOR=18

say()  { printf '[myclaude] %s\n' "$*"; }
fail() { printf '[myclaude] error: %s\n' "$*" >&2; exit 1; }

command -v git  >/dev/null 2>&1 || fail "git is not installed"
command -v node >/dev/null 2>&1 || fail "node >= ${MIN_NODE_MAJOR} is not installed (https://nodejs.org or nvm)"
node_major="$(node -p 'process.versions.node.split(".")[0]')"
[ "$node_major" -ge "$MIN_NODE_MAJOR" ] || fail "node $(node --version) is older than ${MIN_NODE_MAJOR}"
command -v claude >/dev/null 2>&1 || say "note: the claude CLI is not on PATH yet; install it from https://code.claude.com before you use the setup"

if [ -d "$DIR/.git" ]; then
  say "updating $DIR"
  git -C "$DIR" pull --ff-only
else
  say "cloning $REPO into $DIR"
  mkdir -p "$(dirname "$DIR")"
  git clone --quiet "$REPO" "$DIR"
fi

mkdir -p "$BIN_DIR"
ln -sfn "$DIR/myclaude" "$BIN_DIR/myclaude"
say "linked $BIN_DIR/myclaude"
case ":$PATH:" in *":$BIN_DIR:"*) ;; *) say "add $BIN_DIR to PATH to use the myclaude command";; esac

mkdir -p "$CLAUDE_HOME"
existing="$(cd "$CLAUDE_HOME" && ls -d agents commands rules skills scripts settings.json 2>/dev/null || true)"
if [ -n "$existing" ]; then
  backup="$CLAUDE_HOME/backups/myclaude-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$backup"
  # shellcheck disable=SC2086
  (cd "$CLAUDE_HOME" && tar --exclude='skills/synced' --exclude='skills/.trash' -czf "$backup/before.tgz" $existing)
  say "backed up the current ~/.claude items to $backup/before.tgz"
fi

say "installing (pinned sources + myclaude items)"
if ! (cd "$DIR" && MYCLAUDE_CLAUDE_HOME="$CLAUDE_HOME" node myclaude.js install); then
  say "install did not finish; the reason is in the output above."
  say "- a git or network error (for example while cloning a source): run this script again; it resumes."
  say "- LOCAL-MODIFIED or CONFLICT (an existing setup with edited copies): open Claude Code in $DIR and say \"install myclaude\" (INSTALL.md)."
  exit 1
fi

say "done. Check with: myclaude status   (or: node $DIR/myclaude.js status)"
