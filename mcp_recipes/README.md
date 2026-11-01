# MCP Recipes

Curated **context** for setting up MCP servers across my dev environments. Each
file here is a markdown recipe — not an installer.

## How to use

```bash
myclaude mcp                  # list recipes
myclaude mcp chrome           # print the chrome recipe
myclaude mcp chrome --path    # print path so you can hand it to Claude
```

Then in Claude:

```
read $(myclaude mcp chrome --path) and set up Chrome DevTools MCP for this environment
```

## Conventions

- One markdown file per MCP server type (`chrome.md`, `<future>.md`, ...).
- Frontmatter: at minimum `name:` and `description:`.
- Code blocks inside a recipe are **examples**. They illustrate the contract;
  they may go stale. Claude reads the recipe and adapts to the current
  environment, not blindly executes the snippets.
- No env-detection bash, no install scripts, no lifecycle wrappers in this
  folder — those live with the tool (e.g. `dotfiles/util/run_chrome_mcp_wsl`).

## What goes in a recipe

1. **Goal** — what the user gets.
2. **Invariants** — rules that hold across all environments.
3. **Per-environment notes** — what's done, what's pending, where the helpers live.
4. **Verification** — how to confirm it works.
5. **Tracking** — link to the GitHub issue tracking outstanding work.
