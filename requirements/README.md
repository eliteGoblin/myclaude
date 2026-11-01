# Requirements — Frank's ECC overlay

Product-altitude requirements docs (BA contract layer) for features of Frank's
ECC customizations. Lives under `fsun_config/` so it stays isolated from
upstream ECC, like all of Frank's overlay content.

- `features/` — one short spec per overlay feature: what it does, why, testable
  acceptance criteria, honest limitations. Current state, not history.
- These specs are the source of truth for what a feature must do; agents
  (architect, dev, verify) build and check against them.
- Product level only — no code-level how-to. Implementation detail belongs in
  code and commit messages, not here.
