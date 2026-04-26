---
name: chrome
description: Chrome DevTools MCP — one persistent Chrome with logged-in sessions, drivable from Claude across all projects.
---

# Chrome DevTools MCP — context for Claude

## Goal

One persistent Chrome browser per dev environment, with a dedicated profile so
logins persist. Drivable by [`chrome-devtools-mcp`](https://github.com/ChromeDevTools/chrome-devtools-mcp)
from Claude Code in any project folder.

## Invariants (apply to every environment)

1. **Dedicated Chrome profile** named `chrome-mcp-profile` (separate from your
   daily Chrome). Log in once; sessions persist.
2. **Debug port bound to loopback only** — `--remote-debugging-address=127.0.0.1`.
   Never expose to LAN.
3. **Allow-origins** — `--remote-allow-origins=*`. Required by chrome-devtools-mcp
   on Chrome 111+ for the WebSocket attach to succeed.
4. **MCP entry at user scope** — `claude mcp add -s user`. Works from any
   project folder.
5. **Lifecycle helper is idempotent** — probe Chrome first; only start if down.
   Reusing an already-running Chrome is the default path, not a special case.
6. **Common Chrome flags**:
   ```text
   --user-data-dir=<dedicated-profile-dir>
   --remote-debugging-port=9222
   --remote-debugging-address=127.0.0.1
   --remote-allow-origins=*
   --no-first-run
   --no-default-browser-check
   ```

## Per-environment status

| Environment                         | Status      | Where the helpers live |
|-------------------------------------|-------------|------------------------|
| Windows + WSL                       | ✅ DONE      | `~/devel/dotfiles/util/run_chrome_mcp_wsl` + `run_chrome_mcp.ps1` |
| Mac + Parallels Ubuntu VM           | ✅ DONE      | `~/devel/dotfiles/util/run_chrome_mcp` + `dev_sync` |
| Mac native                          | 🟡 TODO     | Reuse `util/run_chrome_mcp` without socat hop |
| Mac + Ubuntu VM (UTM/VBox/libvirt)  | 🟡 TODO     | Generalize `dev_sync`'s `prlctl` calls |
| Linux native                        | 🟡 TODO     | Equivalent to Mac native |

### Windows + WSL (DONE — example)

```bash
# One-time on a fresh WSL machine
ln -sfn ~/devel/dotfiles/util/run_chrome_mcp_wsl ~/.local/bin/run_chrome_mcp_wsl
claude mcp add -s user chrome-devtools -- ~/.local/bin/run_chrome_mcp_wsl mcp

# Daily — nothing. Just run claude.
claude
```

The helper auto-detects which IP from WSL reaches Windows host's loopback:
`127.0.0.1` (mirrored networking), `192.168.127.254` (wsl-vpnkit), or the
default-route gateway. First candidate that returns HTTP 200 from
`/json/version` wins.

### Mac native (TODO — example)

Drop the socat hop; bind Chrome to `127.0.0.1:9222` and point `--browserUrl`
straight at it.

```bash
# Example (may need adjustment — verify util/run_chrome_mcp has a 'local' mode
# or run Chrome directly with the invariant flags above)
claude mcp add -s user chrome-devtools -- \
  npx -y chrome-devtools-mcp@latest --browserUrl=http://127.0.0.1:9222
```

### Mac + Parallels Ubuntu VM (DONE)

Full doc: `~/devel/dotfiles/setup_ubuntu/chrome_mcp_setup.md` →
"Mac + Parallels Ubuntu VM" section. Uses `util/run_chrome_mcp` (Chrome +
socat) on the Mac and `util/dev_sync` to keep the Ubuntu VM's MCP `browserUrl`
in step with the Mac's LAN IP.

## How to apply on a new environment

```
read $(myclaude mcp chrome --path) and set up Chrome DevTools MCP for this environment
```

Claude should:
1. Detect the environment (`uname`, `WSL_DISTRO_NAME`, `prlctl`, etc.).
2. Verify prereqs: Chrome installed, Node available, npx on PATH.
3. Stand up the host-side helper (symlink from dotfiles or write a fresh one
   per the invariants above).
4. Run `claude mcp add -s user chrome-devtools -- <helper> mcp` (or pass
   `npx ... --browserUrl=...` directly for environments without a wrapper).
5. Verify (see below).

## Verification

```bash
# 1. Chrome is reachable on the resolved URL
~/.local/bin/run_chrome_mcp_wsl url            # WSL-specific helper
curl http://127.0.0.1:9222/json/version        # Mac native / direct case

# 2. MCP registered globally
claude mcp list                                 # chrome-devtools should be ✓ Connected

# 3. Works from any folder
cd /tmp && claude mcp list
```

## Security notes

- Debug port bound to **loopback only** on the Chrome host. Cross-host
  reachability goes through a userspace forwarder (socat / wsl-vpnkit / WSL
  kernel bridge), not via Chrome listening on a LAN IP.
- `--remote-allow-origins=*` combined with loopback-only binding limits the
  practical attack surface to local processes on the Chrome host.
- The dedicated profile must NOT be your daily-driver Chrome profile.

## Tracking

- Per-environment implementation: [eliteGoblin/dotfiles#1](https://github.com/eliteGoblin/dotfiles/issues/1)
- This recipe / `myclaude mcp` registry: [eliteGoblin/everything-claude-code#1](https://github.com/eliteGoblin/everything-claude-code/issues/1)
- Authoritative full doc: `~/devel/dotfiles/setup_ubuntu/chrome_mcp_setup.md`
