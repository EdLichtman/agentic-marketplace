# MTG Deck Builder — Functional Tagging ETL (Design Spec)

Status: **draft v0.3** · Owner: user · Worked (UNTRUSTED) example: `example-henzie/`

**LOCKED in v0.3:** the delivery architecture (§4a) — marketplace `edlichtman/agentic-marketplace`, plugin `mtg-deck-builder`, namespaced `/mtg-deck-builder:*` commands, the guardrailed propose-only agent, the `PreToolUse` hook airlock, and the `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_PLUGIN_DATA}` / `${CLAUDE_PROJECT_DIR}` path model. These are no longer open for redesign; the ETL node internals (§3, §5–§9) are still being built out.

---

## 0. Owner directives — VERBATIM, unedited

The owner's own words. Read these directly; everything below is a downstream interpretation that may be wrong.

**Founding directive:**

> can we make this weight system deterministic? use Object-Oriented designs to think of pass-throughs as nodes within an ETL. first pass will be to ask me, the user, for my intention behind the deck. We can talk via interview in case I don't know my plan. you'll gather up all the scryfall otags and then offload to a subagent to make a judgement for how the card interacts with the plan. We'll also build up a wide array of otag terms we find and consider if there's any missing. we'll want to flag those as considerations to see if we can conribute those as tags to the actual card. we'll take our own made-up tags like deterrent and add that to the list of tags to add to card (but not to contribute to community). each phase of the ETL is not complete until a deterministic script signs off on every field being correct within the ETL json blob. Any handoff, any time I say "I need to put this down" or "write a handoff for this" you must write it into the ETL. let's build this out into a multi-phase spec approach

**Trust / correction directive:**

> but I think you're misunderstanding. the ETL.json file cannot be written to. it's got explicit settings to reject tool use to write to it. ONLY a deterministic script can write to it. there can be a proposed.json, and further deterministic scripts know how to update and lock in the ETL. the job of the agent I'll be interviewing with next is to extrapolate what is valuable, what is real, what is dumb and actually store it in the spec. looking at the henzie, I don't trust that it's right. having a weight on the card doesn't make sense. having a weight on the otag is more pertinent for example. and do all of the nodes on the henzie have the same fields? we're going to have to build a json schema with required fields that we validate before we can move onto the next pass of the ETL

**Marketplace / agent-pipeline directive:**

> one thing missing is we're building a skill/agent pipeline. actually, we're building a marketplace of skills/agents. it starts with /mtg-deck-builder:[do-something] and that becomes like a command line interface. you know what I mean? and then there is also an agent somewhere with guardrails. I've noticed that passing my messages through an agent and not through the "general-purpose agent" leads to more success. so you must, beyond a shadow of a doubt, make the agent do it. potentially even spitting out a message asking me if I want to open up a new window with that agent. so that it's like Bash(pwsh claude.exe --agent [agent]) kind of thing

**Plugin-install / path-variable directive:**

> since we're making this a marketplace you need to reframe a bunch of things. so instead of settings.json, you need to like, when you install the plugin called "mtg-deck-builder" it'll set up your settings.json with the denylist and it'll use the ${CLAUDE_PLUGIN_ROOT} and ${CLAUDE_DATA_WHATEVER} to do the actual storing of things

**Naming directive:**

> last thing to do is we want to rename the marketplace to "agentic-marketplace". then it'll be edlichtman/agentic-marketplace -> plugin: mtg-deck-builder. everything we've discussed about the marketplace proposed design is currently locked in

---

## 1. Goal

Turn a decklist into a **weighted, plan-relative functional analysis**: every card scored by how it serves the deck's *plan* (its modes), with deterministic totals per functional category. Hard rule:

> **Judgment is agent-driven. Structure and math are deterministic and script-enforced.**

Canonical output is `etl.json` (+ `vocabulary.json`), both written **only** by deterministic scripts.

## 1a. This is a BUILDER, not a deck-shifter

The Henzie work *analyzed an existing list*. This project **builds decks**, which means up-front legwork the shifter skipped:

**A. Define the needs (target counts).** Identify what the deck NEEDS by functional category first, then build to fill it:
- how many **lands**?
- how many **ramp**?
- how many **interaction** pieces (removal, disenchant, counters, protection)?
- how many **card-advantage** pieces?
- how many **game pieces** (threats / payoffs / wincons)?

Seed these from deck-building heuristics already in the sibling repo — `magic-cards-edh-deck-main/.claude/commands/deck-recommendations.md` (Category Audit ranges: Lands 35–37, Ramp 10–12, Card Draw 10+, Removal 8–10, Board Wipes 3–5) — then tune to the plan from PlanNode.

**B. Vocabulary is an ASSOCIATION map, not a flat list.** Many otags roll up into one functional category; the vocabulary pools them:
- `interaction` ← { `disenchant`, `removal`, `counterspell`, `protection`, … }
- `ramp` ← the cluster of otags that co-occur on dorks (e.g. *Arboreal Grazer* carries several otags that all imply ramp)

This is the curated side of NormalizeNode: `category ← {otags}`, maintained in `vocabulary.json`.

**C. Candidate pool = ALL of Scryfall (to uncover jank).** Deterministically page the **full Scryfall bulk dataset** (`https://scryfall.com/docs/api/bulk-data`, oracle-cards), tag every card, then filter by color identity + legality + the needed function. The point is to surface obscure/jank cards a staples-only list would never reach.

**D. Rank / bubble (EDHREC-style).** Once a need's candidate pool exists, rank it the way we lean on EDHREC today. Deterministic signal already on every Scryfall card: **`edhrec_rank`** (lower = more played) and `order=edhrec` in search. Bubble the strongest to the top; keep the jank visible below the fold. (Commander-specific *synergy* — EDHREC's "high synergy" — is not in Scryfall; flag as a later data source.)

## 2. Core principle — the agent is UNTRUSTED

Even strong models hallucinate. Origin failure: a model (Opus) fabricated a `goad` oracle-tag for *Kardur, Doomscourge*, reasoned on it, and retracted a whole baseline on that false premise. Kardur is actually tagged `hate-attacker` / `opponent-loses-life` / `blood-artist-ability` — never `goad`.

So: **the agent may PROPOSE; only frozen, deterministic scripts may CERTIFY and WRITE canonical data.** Every fact the agent leans on must be independently re-derivable (re-fetch). The agent cannot edit the scripts.

## 3. Architecture — OO ETL nodes over a shared blob

```
class ETLNode:  extract() -> transform() -> load() -> validate()   # validate() is the GATE
```

A phase is **not complete** until its deterministic validator passes the phase's JSON Schema AND the integrity rules, then `promote.py` stamps a signed receipt (a hash the agent cannot forge). An agent writing `"status":"complete"` means nothing.

| Phase | Node | Does | Advances only when |
|------|------|------|--------------------|
| 0 | **PlanNode** | Interview the user for deck intent → `plan{modes[], goals, wincons}`. Also curates: what's valuable / real / dumb, recorded into the spec. | plan validates (≥1 defined mode) |
| 1 | **ExtractNode** | Fetch each card's official otags + oracle text + **inheritance DAG** (tagger GraphQL, see `otag-reference.md`). Master vocab is a *side effect* here. | every card meets the Extract schema |
| 2 | **NormalizeNode** | Resolve display-name vs searchable slug; roll leaf tags up inheritance to functional ancestors; map tree → categories; propose local tags only where the tree lacks a concept. | every tag resolves to vocab or a registered local tag |
| 3 | **JudgeNode** | Subagent assigns **per-otag** weights (conditional / flex / cadence) vs the plan. Proposals only → `proposed.json`. | every otag meets the Judge schema |
| 4 | **ComputeNode** | Deterministic weighted totals per mode + both denominators. | totals reconcile; no orphan tags |
| ∞ | **HandoffNode** | Always-on. On **"I need to put this down"** / **"write a handoff for this"** → snapshot into the ETL via script. | handoff node present + timestamped |

## 4. Write-planes & the airlock (ENFORCED)

`etl.json` is **write-protected by a plugin `PreToolUse` hook** (the airlock): the hook hard-denies any `Write`/`Edit` whose path matches the canonical data files, so no tool and no agent can write them. The agent only ever writes proposals. (See §4a for *why* this is a hook and not a `settings.json` deny-glob — the platform won't let a plugin inject `permissions.deny`.) Canonical data lives under `${CLAUDE_PLUGIN_DATA}` (persistent, per-deck); the frozen writer scripts live under `${CLAUDE_PLUGIN_ROOT}`.

```
agent   --writes-->  ${CLAUDE_PLUGIN_DATA}/decks/<slug>/proposed.json
                                         (proposals ONLY: per-otag weights, use/ignore,
                                          tag->function map, proposed custom tags + defs)
script  --writes-->  ${CLAUDE_PLUGIN_DATA}/decks/<slug>/etl.json
                                         (canonical — Write/Edit DENIED by the airlock hook)
script  --writes-->  ${CLAUDE_PLUGIN_DATA}/decks/<slug>/vocabulary.json
                                         (master vocab — agent READ-ONLY, hook-denied)
script  --writes-->  ${CLAUDE_PLUGIN_DATA}/decks/<slug>/receipts/   (hash-chain sign-offs)
```

- **`validate.py`** — checks `proposed.json` + current `etl.json` against the active phase's JSON Schema and the integrity rules. Deterministic pass/fail. Lives in `${CLAUDE_PLUGIN_ROOT}/scripts/`.
- **`promote.py`** — the **only** writer of `etl.json`. Refuses unless `validate.py` passes; re-fetches ground truth; stamps a signed phase receipt and locks the pass. Lives in `${CLAUDE_PLUGIN_ROOT}/scripts/`.

Scripts are **frozen** — they ship inside `${CLAUDE_PLUGIN_ROOT}` (ephemeral, read-only, replaced on update; the agent cannot add to or edit them at run time). Airlock-hook + frozen scripts together mean the *only* path into `etl.json` is the sanctioned, audited promote step. The hook denies writes to the scripts' own path too, so the agent cannot unfreeze them.

## 4a. Delivery architecture — marketplace plugin (LOCKED v0.3)

This project ships as a **Claude Code plugin distributed through a marketplace**, not as a loose script collection. Everything in this section is **locked**.

### Identity
- **Marketplace:** `edlichtman/agentic-marketplace` — a multi-plugin marketplace (room to add more skills/agents later).
- **Plugin:** `mtg-deck-builder`, installed as `mtg-deck-builder@agentic-marketplace`.
- **This folder `agentic-marketplace/` IS the marketplace root** and holds the `mtg-deck-builder` plugin under `plugins/`. Build directly into this folder — do **not** create a nested `agentic-marketplace/` subdirectory.
- **CLI surface:** namespaced slash commands `/mtg-deck-builder:<phase>` — the namespace *is* the command line. One command per node: `:plan`, `:needs`, `:pool`, `:extract`, `:normalize`, `:judge`, `:rank`, `:compute`, `:handoff` (the §3/§10 nodes).

### Layout
```
agentic-marketplace/                       ← marketplace repo (edlichtman/agentic-marketplace)
  .claude-plugin/marketplace.json          ← lists plugins; mtg-deck-builder is the first
  plugins/mtg-deck-builder/
    .claude-plugin/plugin.json
    settings.json        → { "agent": "<the guardrailed agent>" }  (see "settings keys" below)
    hooks/hooks.json     → PreToolUse airlock (deny Write/Edit on canonical data + scripts)
    commands/            → /mtg-deck-builder:* (one md per phase)
    agents/              → the guardrailed, propose-only agent(s)
    scripts/             → validate.py, promote.py + per-phase validators (FROZEN)
    schema/              → card.schema.json (per-phase variants, §6)
```
Working/canonical data lives **outside** the plugin tree, under `${CLAUDE_PLUGIN_DATA}` (see paths below).

### Path variables (verified against the plugin reference)
- **`${CLAUDE_PLUGIN_ROOT}`** — the plugin's install dir; holds the **frozen engine** (scripts, schemas, agents, commands, hook). Reference-only: the docs state it is **ephemeral and replaced on update — never write state here.**
- **`${CLAUDE_PLUGIN_DATA}`** — a **persistent** dir (`~/.claude/plugins/data/<id>/`) that survives plugin updates. Home of the canonical data, **namespaced per deck**: `${CLAUDE_PLUGIN_DATA}/decks/<slug>/{etl.json,proposed.json,vocabulary.json,receipts/}`. This is what the owner called `${CLAUDE_DATA_WHATEVER}`.
- **`${CLAUDE_PROJECT_DIR}`** — the project root where the user launched Claude; used to read a decklist the user drops in (e.g. a `*.txt` like `henzie_current.txt`).

### The three independent guardrails (how "agent PROPOSES, script CERTIFIES" is enforced)
1. **Airlock hook (`PreToolUse`)** — bundled in the plugin; hard-denies any `Write`/`Edit` targeting `etl.json`, `vocabulary.json`, `receipts/`, or the frozen `scripts/`. This is the §4 airlock. Because it ships with the plugin, it auto-installs and is removed cleanly on uninstall — nothing to inject into the user's `settings.json`.
2. **Guardrailed agent** — a propose-only agent whose tool surface cannot mutate canonical data (it can `Read`, fetch via `Bash` curl, and `Write` *only* to `proposed.json`). Set as the session default via the plugin `settings.json` **`agent`** key, so work routes through it and **not** `general-purpose`.
3. **Frozen scripts** — `validate.py` / `promote.py` are the *only* writers of canonical data, and they live in the read-only `${CLAUDE_PLUGIN_ROOT}` tree (guardrail 1 also denies edits to them, so the agent cannot unfreeze them).

### Platform correction (why the denylist is a hook, not settings)
The owner's first framing was "installing the plugin sets up `settings.json` with the denylist." **A plugin cannot do that:** per the plugin reference, a plugin's bundled `settings.json` supports **only the `agent` and `subagentStatusLine` keys** — it cannot contribute `permissions.deny`. So the write-deny is enforced by the **`PreToolUse` hook** (guardrail 1) instead, which fulfills the same intent — protection that installs and travels with the plugin — more robustly.

### Agent routing & the launcher (owner directive: "make the agent do it")
- Commands route work through the guardrailed agent, never `general-purpose`.
- Verified CLI: `claude --agent <agent>` is real and "Overrides the 'agent' setting"; the persistent `agent` setting also exists. So a command may, after explaining itself, offer to open a **dedicated** session:
  `Bash(pwsh -c "claude --agent <the guardrailed agent>")` — the "open a new window with that agent" flow the owner asked for. The command asks first; it does not silently spawn.

### Build order (LOCKED for the first slice)
**One vertical spine on PlanNode**, end-to-end: marketplace + `plugin.json` + the guardrailed agent + the airlock hook + `/mtg-deck-builder:plan` routing to the agent + real `validate.py`/`promote.py` writing into `${CLAUDE_PLUGIN_DATA}`. This exercises the entire `CLI → agent → proposed.json → validate → promote → receipt` loop once; every later phase is a copy of this proven pattern.

## 5. Data model — weight & cadence live on the OTAG

```jsonc
{
  "card": "Kardur, Doomscourge",
  "oracle_text": "...",                         // source: fetch
  "otags": [                                    // ARRAY OF OBJECTS. weight/cadence are PER-OTAG.
    { "name": "hate-attacker", "official": true, "source": "fetch",
      "inherits": ["hate", "combat-manipulation"],
      "weight": 1.0, "cadence": "one-time-etb", "cadence_multiplier": 1.0 },
    { "name": "opponent-loses-life", "official": true, "source": "fetch",
      "inherits": ["drain-life"],
      "weight": 1.0, "cadence": "one-time-etb", "cadence_multiplier": 1.0 },
    { "name": "deterrent", "official": false, "source": "agent",
      "weight": 1.0, "cadence": "one-time-etb", "cadence_multiplier": 1.0 }   // custom / "added"
  ],
  "effective_tags": ["deterrent"]               // derived by script
}
```

- **Per-field provenance:** `name`, `official`, `inherits` = **fetch-locked** (re-fetch must reproduce). `weight`, `cadence` = **agent-proposed** (in `proposed.json`), **script-validated**, then promoted.
- **`official:false`** = a custom/local tag (e.g. `deterrent`), legal only if registered + user-approved in `custom_vocab`.
- The Henzie prototype put weights on the *card* and varied fields per node — **non-conformant.** It is an input to normalize, not a template.

### vocabulary.json (script-maintained)
```jsonc
{
  "official_vocab": ["hate-attacker", "opponent-loses-life", "..."],   // every real otag ever fetched
  "custom_vocab": [
    { "tag": "deterrent", "def": "...", "official": false, "contribute": false, "approved_by": "user" }
  ],
  "associations": {                       // category <- {otags}. The curated NormalizeNode rollup (section 1a-B).
    "interaction": ["disenchant", "removal", "counterspell", "protection"],
    "ramp":        ["mana-dork", "ramp", "land-fetch", "rituals"],
    "game-piece":  ["finisher", "combat-damage-payoff", "..."]
  }
}
```

## 6. Schema-gated passes

Each phase has a JSON Schema; the **required** set grows as the pipeline advances. `validate.py` runs the active phase's schema; a pass cannot advance until every card conforms.

| After phase | Newly-required fields |
|-------------|----------------------|
| 1 Extract | `card`, `oracle_text`, `otags[].{name,official,source}` (+ `inherits` for official) |
| 2 Normalize | every `otags[].name` ∈ vocab; `effective_tags` populated |
| 3 Judge | `otags[].{weight,cadence,cadence_multiplier}` |
| 4 Compute | mode totals + denominators present and reconciling |

Schema files: `schema/card.schema.json` (per-phase variants via `$ref` / `allOf`). v0 lives there now.

## 7. Integrity checks (`validate.py`)

1. **Reference integrity** — every otag `name` ∈ fetched official OR registered `custom_vocab`. → kills hallucinated `goad`.
2. **Re-fetch diff** — `official:true` otags must reproduce on a clean tagger re-fetch. The **linchpin** anti-hallucination check.
3. **Schema / range** — `weight` ∈ [0,1]; `cadence` ∈ enum with the *matching* `cadence_multiplier`; flex splits coherent.
4. **Local-tag registry** — `official:false` legal only if registered + user-approved + `contribute:false`. Agent may *propose* (parked pending), never self-bless.
5. **Append-only hash chain** — editing a promoted field breaks the chain; no quiet rewrites of past sign-offs.

## 8. Weight model (carried from the prototype, now per-otag)

- Default 1.0. **Conditional** = partial (needs setup). **Flex** = modal/MDFC split across modes. **Cadence multiplier**: at-will 1.0 · once-per-turn 0.7 · once-per-turn+restricted 0.6 · one-time/ETB *(TBD)*.
- **Collapse/synonyms:** mana-dork→ramp · treasure→ramp · draw→card-advantage · mass-reanimation→haymaker.
- **Denominators:** report BOTH of-99 and of-nonland.

## 9. Tag contribution policy

- Oracle implies a function but **no official otag covers it** → `contribute_candidate:true` (propose to real Scryfall tagger).
- Custom (`official:false`) → `contribute:false` (local only).

## 10. Open questions / TODO

- **Spec the builder-only nodes** (the phase table in §3 currently only covers analyzing a *given* list): **NeedsNode** (target counts from heuristics + plan, §1a-A), **PoolNode** (page all Scryfall bulk → tag → filter by color-identity/legality/function, §1a-C), **RankNode** (`edhrec_rank` bubbling, §1a-D). These run before/around the Extract→Judge→Compute engine.
- **Pull the deck-building heuristic numbers** from the sibling repo (`deck-recommendations.md`, `analyze-deck.md`) into a `heuristics.json` the NeedsNode reads. **DONE (v0):** `plugins/mtg-deck-builder/data/heuristics.json` seeds `category_audit_ranges` (lands/ramp/card_draw/removal/board_wipes) from `deck-recommendations.md`'s Category Audit table. **These are a starting point, not locked** — the owner may revisit/retune the ranges later as NeedsNode comes online.
- One-time/ETB cadence tier value.
- Custom-tag approval flow (user-gated vs auto-register-then-review).
- `goad`-style display-name vs searchable-slug reconciliation (NormalizeNode).
- ~~Settings-deny exact glob + how scripts are invoked without re-opening the write hole.~~ **RESOLVED (§4a):** write-protection is a plugin `PreToolUse` airlock hook (plugin `settings.json` can't carry `permissions.deny`); scripts run from `${CLAUDE_PLUGIN_ROOT}/scripts/` and write only under `${CLAUDE_PLUGIN_DATA}`.
- **Agent name** — provisional; the *role* (single guardrailed, propose-only agent set via plugin `settings.json` `agent` key) is locked, the literal name is not yet chosen. May later split into per-phase agents (interview vs. judge).
- **Deck `<slug>` derivation** — how `${CLAUDE_PLUGIN_DATA}/decks/<slug>/` is named (from the decklist filename? a `:plan` prompt? `userConfig`?).
- **Hook deny matching** — exact path/glob the `PreToolUse` hook matches on, and how it resolves `${CLAUDE_PLUGIN_DATA}` at hook time.
- The Henzie JSON is **UNTRUSTED** — re-derive under this schema; do not trust its current weights/fields.
- **`scry.py: fetch_intent(card, vocab)`** — given a card (its otags) and `vocabulary.json`'s `associations` map, return which functional categories/intents the card serves. This is the NormalizeNode tag→category rollup (§3 phase 2 / §5 `associations`) exposed as a deterministic, re-fetchable helper alongside `fetch_card` and `fetch_commander_colors`. Not yet implemented — needs the tagger-GraphQL otag fetch (see `otag-reference.md`) wired into `scry.py` first.

## 11. References

- `otag-reference.md` — how to find & query Scryfall oracle-tags (working methods, pitfalls log).
- `schema/card.schema.json` — v0 JSON Schema.
- `example-henzie/` — UNTRUSTED prototype ETL + the reconciled 100-card deck.

---

## 12. Build log — ALREADY DONE

Append-only record of work that has shipped into the repo. Do not re-plan these;
they are facts about the tree as it now stands. Verified against the plugin docs
at <https://code.claude.com/docs/en/plugin-marketplaces> and
<https://code.claude.com/docs/en/plugins-reference>.

### 12.1 — Marketplace scaffolding (DONE · 2026-06-13)

The marketplace *shell* exists and is empty of plugins by design: adding the
first plugin (`mtg-deck-builder`) is now the **only** remaining step to go from
shell → working marketplace. Everything below is built and on `git`.

**Git**
- `git init` on branch `main` (repo root = marketplace root, per §4a — no nesting).
- Remote `origin` → `https://github.com/edlichtman/agentic-marketplace.git`
  (the locked identity from §4a / the Naming directive). Not yet pushed.

**`.claude-plugin/marketplace.json`** — the catalog. Schema-verified required
fields present (`name`, `owner.name`, `plugins[]`):
```json
{
  "name": "agentic-marketplace",
  "owner": { "name": "edlichtman", "email": "e.lichtman2@gmail.com" },
  "description": "A multi-plugin marketplace of guardrailed, ETL-style Claude Code agents and skills.",
  "metadata": { "pluginRoot": "./plugins" },
  "plugins": []
}
```
- `metadata.pluginRoot: "./plugins"` means a future plugin entry is just
  `{ "name": "mtg-deck-builder", "source": "mtg-deck-builder", ... }` — bare
  source, no path repetition.
- `plugins: []` is intentional. **Adding a plugin = create `plugins/<name>/` +
  append one entry here.** Nothing else in the shell changes.
- `name: "agentic-marketplace"` is confirmed *not* on the reserved-names list.

**`plugins/`** — present with a `.gitkeep` (holds the dir until the first plugin
lands). This is the `metadata.pluginRoot`.

**`README.md`** — marketplace-level: install commands
(`/plugin marketplace add edlichtman/agentic-marketplace`), the layout, and the
3-step "Add a new plugin" recipe. Lists `mtg-deck-builder` under "Planned".

**`.gitignore`** — ignores Python/OS/editor junk AND, defensively, any
data-bearing artifacts (`**/decks/`, `**/proposed.json`, `**/etl.json`,
`**/receipts/`) so canonical ETL state — which lives outside the repo under
`${CLAUDE_PLUGIN_DATA}` per §4a — can never be committed by accident.

**Verification done:** `marketplace.json` parses as valid JSON; required-field
set matches the documented marketplace schema.

**Schema facts locked in during this step (so we don't re-derive them):**
- Marketplace required: `name` (kebab, public-facing in `<plugin>@<marketplace>`),
  `owner` (`name` req, `email` opt), `plugins[]` (each entry: `name` + `source`
  req). Optional: `$schema`, `description`, `version`, `metadata.pluginRoot`.
- Relative `source` paths resolve **only** when the marketplace is added via git
  — reinforces why `origin` points at the GitHub repo.
- `plugin.json` (next step): only `name` is required; it auto-discovers
  `commands/`, `agents/`, `hooks/hooks.json`, etc. in default locations.

### 12.2 — `mtg-deck-builder` plugin + PlanNode spine (TODO — next)

The locked first slice from §4a-"Build order". Not started. When done, record it
here as 12.2 and flip the marketplace `plugins: []` to include the entry.
