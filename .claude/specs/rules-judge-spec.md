# MTG Rules Judge — Panel-Based Ruling Analysis (Design Spec)

Status: **draft v0** — early concept, not locked. Owner: user.

## 1. Goal

Given a specific "exact play" rules question (a board-state / interaction), produce
a ruling determination backed by:

- A **RAG corpus of the Comprehensive Rules** (retrieval over rule text by number).
- **Gatherer/Scryfall card rulings** for the cards involved.
- A **panel of an odd number of independent agents**, each reasoning over the
  question + retrieved context, with a deterministic majority vote resolving to a
  final call (odd N makes ties impossible by construction).

## 2. Why a separate plugin (not part of `mtg-deck-builder`)

"Judge" already means something specific in `mtg-deck-builder`: **JudgeNode**
(design-spec.md §3, phase 3, command `:judge`) assigns the per-otag scoring axes
(weight/impact/reuse) against the deck's plan — a totally different concept from
rules adjudication. Splitting into
its own plugin avoids the `:judge` naming collision and keeps the two domains
(deck-building ETL vs. rules adjudication) independently versioned and installed.

## 3. Data sources

- **Comprehensive Rules (RAG corpus)** — Wizards publishes the full Comprehensive
  Rules as plain text (URL/version changes per release; verify at build time via
  https://magic.wizards.com/en/rules). Chunk by rule number (e.g. `104.3a`) for
  retrieval so panel agents can cite specific rules.
- **Card rulings** — Scryfall proxies Gatherer rulings per card:
  `GET https://api.scryfall.com/cards/<id>/rulings` (also linked via the card
  object's `rulings_uri`). No need to scrape Gatherer directly.
- **Oracle text** — via `scry.py`'s `fetch_card` (see README "Cross-plugin
  considerations" for the open question on sharing this with `mtg-deck-builder`).

## 4. Panel mechanism

- N agents (odd, e.g. 3 or 5 — TBD) independently receive: the question, relevant
  CR excerpts (RAG retrieval), and relevant card rulings.
- Each agent proposes a ruling **with citations** (rule numbers and/or ruling text).
- A deterministic aggregator tallies the majority vote.
- **Dissenting opinions are preserved**, not discarded — close/ambiguous rulings are
  common in practice, and the minority view + its citations may be exactly what the
  user needs to see.

## 5. Open questions

- Panel size: fixed (3? 5?) or user-configurable per question?
- RAG index: where does it live, how is it built, and how is it refreshed as the
  Comprehensive Rules update (roughly per set release)?
- Output format: just the majority ruling + citations, or majority + full dissent
  transcript?
- Ties are impossible by construction (odd N), but what about a "this is genuinely
  unsettled / judges disagree IRL" signal — does the panel surface that explicitly?
- Command surface: single `/mtg-rules-judge:judge "<question>"`, or split into
  `:ask` (panel) / `:cite` (lookup rules/rulings without a full panel run)?
- Relationship to `mtg-deck-builder`'s `scry.py` — see README "Cross-plugin
  considerations (food for thought)".

## 6. References

- Scryfall rulings endpoint: `https://api.scryfall.com/cards/<id>/rulings`
- Comprehensive Rules: https://magic.wizards.com/en/rules (confirm current
  download link/version at build time)
- `design-spec.md` §3 — JudgeNode (the *other* "judge", per-otag weight/impact/reuse)
