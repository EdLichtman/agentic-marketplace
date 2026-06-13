# agentic-marketplace

A [Claude Code plugin marketplace](https://code.claude.com/docs/en/plugin-marketplaces)
hosting guardrailed, ETL-style agents and skills.

- **Marketplace id:** `agentic-marketplace`
- **Repo:** `edlichtman/agentic-marketplace`
- **Owner:** edlichtman

## Use this marketplace

```
/plugin marketplace add edlichtman/agentic-marketplace
/plugin install <plugin>@agentic-marketplace
```

## Repository layout

```
agentic-marketplace/                  ← marketplace root (this repo)
  .claude-plugin/marketplace.json     ← catalog: name, owner, plugins[]
  plugins/                            ← one directory per plugin
README.md
.gitignore
```

`metadata.pluginRoot` is set to `./plugins`, so a plugin entry only needs a bare
`"source": "<plugin-name>"` (resolved to `./plugins/<plugin-name>`).

## Add a new plugin

1. Create `plugins/<plugin-name>/` with a `.claude-plugin/plugin.json` manifest
   (plus any `commands/`, `agents/`, `hooks/`, `scripts/`, `schema/`).
2. Append an entry to the `plugins` array in
   `.claude-plugin/marketplace.json`:
   ```json
   { "name": "<plugin-name>", "source": "<plugin-name>", "description": "..." }
   ```
3. Commit and push. Users pick it up with `/plugin marketplace update`.

> Relative `source` paths resolve only when the marketplace is added via git
> (GitHub/GitLab/git URL), not via a direct URL to `marketplace.json`.

## Planned plugins

- **`mtg-deck-builder`** — deterministic, plan-relative MTG deck analysis/build
  ETL. Agent proposes; frozen scripts certify and write canonical data. See
  `.claude/specs/design-spec.md`.
