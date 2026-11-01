# myclaude — Summary

| Question | Answer |
|---|---|
| What is installed | `docs/INVENTORY.md` (one row per item, with the reason and budgets) |
| How to install | Tell Claude "install myclaude"; it follows `INSTALL.md` |
| How the tool works | `README.md`; `node myclaude.js help` |
| Where items come from | `custom/` (Frank's files and forks) and pinned sources: `ecc`, `mattpocock` (picks), `karpathy`, `cct` (reference only); see `docs/REFERENCES.md` |
| How Claude should behave | `custom/rules/frank/philosophy.md` (installed as an always-on rule), built from `custom/philosophy-src/` |
| How the setup stays small | Monthly review with the `config-management` skill; budgets in `docs/INVENTORY.md` |
| Requirements | `REQUIREMENTS.md`; issues #1-#3 |

The previous setup (the `eliteGoblin/everything-claude-code` fork with `fsun_config/ecc.js`) is replaced by this repo. After install, stop using `fsun_config/ecc.js`.
