# Shared Chrome for MCP — Requirements

## Goal

One Chrome instance, with remote debugging turned on, that every MCP client
uses: all Claude Code sessions, other agents/tools, and optionally other Macs.
I run one command to start it; if it's already running, the command does
nothing. Once it's up, every chrome-devtools MCP connects to it with no
per-session setup.

## Background (why)

- Each chrome-devtools MCP otherwise launches or expects its own browser, so
  several sessions end up with separate, logged-out Chromes.
- 2026-10-25 failure: the config pointed at a Chrome on another machine
  (`192.0.2.10:9223`). After changing networks it couldn't be reached, so
  the MCP failed with `CONNECTION_CLOSED`. A corrupted npx cache
  (`~/.npm/_npx/.../chrome-devtools-mcp`, `ENOTEMPTY`) also crashed it at startup.

## Requirements

### R1 — One start command, safe to run twice
- `chrome-mcp start`: if a Chrome is already answering on the debug port, print
  "already running" and exit 0. Otherwise launch it and wait until
  `http://127.0.0.1:<port>/json/version` responds (timeout around 15s), then exit 0.
- Never start a second instance on the same port.

### R2 — Fixed, well-known endpoint
- Default port **9222**, bound to `127.0.0.1`.
- Every MCP config uses the same URL: `--browserUrl http://127.0.0.1:9222`.

### R3 — Dedicated, persistent profile
- Uses its own `--user-data-dir` (`~/.chrome-mcp-profile`), not my everyday
  Chrome profile. Chrome refuses remote debugging on the default profile.
- Logins persist across restarts, so I log in to each site once.

### R4 — All MCP clients share it
- The chrome-devtools entry in the **user-level** `~/.claude.json`
  `mcpServers` points at the shared endpoint, so every project and session
  inherits it.
- Remove or align any project-level overrides that launch their own Chrome
  (for example `projects.<project-dir>.mcpServers.chrome-devtools`).
- Several MCP clients connected at once must work. Each one opens or selects
  its own tab and must not close other clients' tabs.

### R5 — Status and stop
- `chrome-mcp status`: running or not, plus port, PID, Chrome version and
  number of open tabs.
- `chrome-mcp stop`: quit only the shared debug Chrome, never my normal Chrome.

### R6 — Optional: start at login
- A user LaunchAgent can run `chrome-mcp start` at login. This is opt-in, not
  the default.

### R7 — Optional: other Macs (only if needed)
- Don't bind the debug port to the LAN (`0.0.0.0`). The debug protocol has
  **no authentication**: anyone who can reach the port controls the browser,
  including every logged-in session.
- Other Macs reach it through an SSH tunnel instead:
  `ssh -N -L 9222:127.0.0.1:9222 <this-mac>`. Their MCP config then uses
  `http://127.0.0.1:9222` too.

### R8 — Self-healing when things fail
- If the MCP can't connect, `chrome-mcp start` is the documented fix.
- `chrome-mcp doctor`: checks the port, checks that Node meets the tool's
  minimum (20.19+), and detects a corrupted npx cache for
  `chrome-devtools-mcp`, offering to clear it.

## Constraints and compatibility

- macOS; Google Chrome at `/Applications/Google Chrome.app`.
- **A local browser monitor** may kill any browser that isn't Chrome, so the shared
  instance must be real Google Chrome, not "Chrome for Testing" or Chromium.
  browser-monitor's site blocklist still applies inside it.
- Don't put secrets in the MCP command line or environment. Process
  listings expose them.

## Acceptance checks

- [ ] `chrome-mcp start` run twice → one Chrome process on 9222, second run says "already running"
- [ ] `curl -s 127.0.0.1:9222/json/version` returns the Chrome version
- [ ] Two separate Claude Code sessions both run `list_pages` successfully at the same time
- [ ] Log in to a site, run `stop` then `start` → still logged in
- [ ] `stop` leaves my normal Chrome windows open
- [ ] `lsof -iTCP:9222 -sTCP:LISTEN` shows it bound to 127.0.0.1 only, not *:9222
- [ ] The browser monitor (if any) does not kill the shared instance

## Reference: what works today (manual)

```bash
# start (manual)
open -na "Google Chrome" --args --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.chrome-mcp-profile" --no-first-run

# MCP config in ~/.claude.json (user-level mcpServers)
"chrome-devtools": {
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "chrome-devtools-mcp@latest", "--browserUrl", "http://127.0.0.1:9222"]
}
```
