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
- **`mtg-rules-judge`** — panel-based MTG rules-ruling analysis: RAG over the
  Comprehensive Rules + Gatherer/Scryfall card rulings, adjudicated by an odd-numbered
  panel of agents. Split out as its own plugin to avoid colliding with
  `mtg-deck-builder`'s JudgeNode (`:judge` = per-otag weight assignment, a different
  "judge"). See `.claude/specs/rules-judge-spec.md`.

## Cross-plugin considerations (food for thought)

- **Shared Scryfall access.** Both `mtg-deck-builder` and `mtg-rules-judge` need
  Scryfall (and `mtg-rules-judge` also Gatherer-via-Scryfall) data access. Right now
  `scry.py` — a deterministic, curl-based Scryfall wrapper — lives under
  `plugins/mtg-deck-builder/scripts/`. There's no first-class "shared library"
  mechanism between plugins in this marketplace model; each plugin is an
  independently installed/versioned directory under `plugins/`.
- Options considered, none decided:
  - **Duplicate** `scry.py` into each plugin. Simple, but drifts — two copies to
    keep in sync.
  - **A third "shared resources" plugin** holding `scry.py`, plus a `PreToolUse`
    hook that intercepts any raw `WebFetch`/`Bash curl` targeting
    `scryfall.com`/`gatherer.wizards.com`/`edhrec.com` and steers toward the
    deterministic wrapper. A hook can enforce *policy* (deny raw fetches) but
    can't cleanly *export Python functions* across plugin/process boundaries —
    so cross-plugin code reuse stays awkward even with this.
  - **An installable package** (pip-installable from a local path or git ref)
    that both plugins depend on — more standard, but adds packaging overhead for
    what's currently a couple of small scripts.
- Revisit once `mtg-rules-judge`'s actual data needs are concrete (rulings vs.
  oracle text vs. full bulk data) and the real overlap with `mtg-deck-builder`
  is clearer.
