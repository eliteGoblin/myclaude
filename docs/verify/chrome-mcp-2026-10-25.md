# Verify: shared Chrome for MCP (2026-10-25)

Live checks on Frank's Mac (macOS 25.6, Chrome 156.0.8078.48, Node v20.19.5) against `requirements/features/chrome-mcp-shared.md`. The stop, race, and cold-start checks ran on a scratch port (9333) with a throwaway profile, so the real logged-in Chrome on 9222 was not stopped.

## Acceptance checks

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | `start` twice → one Chrome, second run says "already running" | PASS | `start` → `started: http://127.0.0.1:9333`; second `start` → `already running ... (Chrome/156.0.8078.48)`; `lsof -iTCP:9333 -sTCP:LISTEN` shows one pid |
| 1b | Three `start` at the same moment | PASS | 3 × `started`, then one listener pid and one browser main process (Chrome's profile lock hands later launches to the first) |
| 2 | `curl -s 127.0.0.1:9222/json/version` returns the version | PASS | `"Browser": "Chrome/156.0.8078.48"` |
| 3 | Two Claude sessions run `list_pages` at the same time | PASS | Two parallel `claude -p` runs from separate dirs, user-level MCP entry: both printed `PAGES=1`, rc 0 |
| 4 | Log in, `stop`, `start` → still logged in | NOT VERIFIED | Needs Frank to log in to a site on the real profile. `stop` sends SIGTERM (graceful Chrome shutdown); session-only cookies would not survive any restart |
| 5 | `stop` leaves normal Chrome open | PASS | After two `stop` runs on 9333, the everyday Chrome (pid 96501, no debug flags) and the 9222 Chrome (pid 21473) were still running. `isSharedChrome` returns false for pid 21473 when the profile differs, so `stop` would refuse it |
| 6 | Bound to 127.0.0.1 only | PASS | `lsof`: `TCP 127.0.0.1:9333 (LISTEN)`; `doctor`: `ok bind: 127.0.0.1 only` |
| 7 | browser-monitor does not kill the shared instance | PASS (20 s) | Launched pid alive after 20 s (`kill -0`). Not observed over hours |

## Other checks

| Check | Result | Evidence |
|---|---|---|
| MCP wrapper from cold | PASS | Port 9333 down → `chrome-mcp mcp` started Chrome, then answered `initialize` with `serverInfo.version 1.12.0`; 0 non-JSON lines on stdout; log lines on stderr |
| `doctor` | PASS | All 6 checks `ok` after `setup`; before it, it found the project override in `~/devel/chrome_mcp` and printed the remove command |
| Unit tests | PASS | `npm test`: 51 pass, 0 fail (25 new in `tests/chrome-mcp.test.js`) |
| Re-run after review fixes (pinned `chrome-devtools-mcp@1.12.0`) | PASS | `setup` → `replaced user-level chrome-devtools`; `doctor` 6/6 ok; cold wrapper on 9333 answered `initialize` with `version 1.12.0`, 0 non-JSON stdout lines; two parallel `claude -p` → `PAGES=1` each; relative `CHROME_MCP_PROFILE` → rc 1 with message |

## Config changes made on this Mac

- Backup: `~/.claude/backups/claude-json-before-chrome-mcp-20261025-154349.json`.
- User-level `chrome-devtools` → `node ~/devel/myclaude/myclaude.js chrome-mcp mcp` (`myclaude chrome-mcp setup`).
- Removed the local override in `~/devel/chrome_mcp` (`claude mcp remove -s local chrome-devtools`).
