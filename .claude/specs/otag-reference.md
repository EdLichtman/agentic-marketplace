# OTag Reference — finding & querying Scryfall oracle-tags

How to reliably get a card's real functional tags. Written after a documented failure where guessed slugs produced silent zeros that got misread as "the API is broken."

---

## TL;DR (read first)

- Tags live in the Scryfall **Tagger** (a separate app), not the main card API.
- The tagger is a **hierarchy (DAG)**: direct tags **+ an "Inherits" line of ancestors**, recursive.
- **Display name ≠ searchable slug.** `goad` shows in the tagger UI but `otag:goad` returns **0 across all of Scryfall**. Do **not** guess slugs.
- The authoritative, complete source is the **tagger GraphQL** — and it works programmatically (CSRF + session).
- **WebFetch FAILS on Scryfall (HTTP 403).** Use `curl` / PowerShell `Invoke-RestMethod` with a `User-Agent`.

## Where tags live

- Human UI: `https://tagger.scryfall.com/card/<set>/<collector_number>`
- Two tag types: **`ORACLE_CARD_TAG`** (functional — use these) and `ILLUSTRATION_TAG` (art — ignore for deck function).
- Each card shows **direct tags** + an **"Inherits —"** line of ancestor tags. Each ancestor has its own parents/children. Traverse recursively to roll a leaf tag up to functional ancestors. Examples:
  - `blood-artist-ability` → inherits `drain-life`, `death-trigger`, `repeatable-lifegain`, `lifegain`
  - `hate-attacker` → inherits `hate`, `combat-manipulation`
  - `pseudo-fog` → inherits `combat-manipulation`, `inverted-effects`

## The display-name vs searchable-slug trap (the documented failure)

- `otag:goad` → **0 cards across all of Scryfall.** "goad" appears in the UI but is not a queryable otag slug.
- `otag:drain` → not a real slug either.
- *Kardur, Doomscourge*'s REAL searchable slugs: `otag:hate-attacker`, `otag:opponent-loses-life`, `otag:blood-artist-ability` — all return Kardur correctly.
- **Lesson:** the `otag:` search is reliable **only with real slugs.** Guessing yields silent 0s that look like an API failure. Pull real tags from the tagger GraphQL; use `otag:` search only to *verify known slugs*.

## How to query (this environment: Windows / PowerShell)

### Main card API (oracle text, set/number, color identity)
```powershell
$H = @{ "User-Agent"="MTGDeckTool/1.0"; "Accept"="application/json" }
Invoke-RestMethod -Uri "https://api.scryfall.com/cards/named?fuzzy=Kardur" -Headers $H
```
Rate limit 10 req/s — add ~100 ms between calls.

### otag membership (verify a KNOWN slug)
```powershell
# URL-encode the whole query. Returns the card iff it carries that slug.
$q = [uri]::EscapeDataString('otag:hate-attacker !"Kardur, Doomscourge"')
Invoke-RestMethod -Uri "https://api.scryfall.com/cards/search?q=$q" -Headers $H
```

### Tagger GraphQL — the authoritative full tag set (WORKING RECIPE)
```powershell
$H = @{ "User-Agent"="MTGDeckTool/1.0" }
$set="dsc"; $num="223"   # get set/collector_number from the card API first
# 1) GET the page with -UseBasicParsing (PS 5.1's default IE engine prompts & fails NonInteractive)
$pg = Invoke-WebRequest -Uri "https://tagger.scryfall.com/card/$set/$num" -Headers $H -UseBasicParsing -SessionVariable sess
$csrf = ([regex]'name="csrf-token" content="([^"]+)"').Match($pg.Content).Groups[1].Value
# 2) POST GraphQL with the CSRF token + captured session cookie
$body = '{"operationName":"FetchCard","variables":{"set":"'+$set+'","number":"'+$num+'","back":false},"query":"query FetchCard($set:String!,$number:String!,$back:Boolean=false){card:cardBySet(set:$set,number:$number,back:$back){name taggings{tag{name namespace type}}}}"}'
$gql = Invoke-WebRequest -Uri "https://tagger.scryfall.com/graphql" -Method Post -WebSession $sess `
       -Headers @{ "X-CSRF-Token"=$csrf; "Content-Type"="application/json"; "User-Agent"="MTGDeckTool/1.0" } -UseBasicParsing -Body $body
($gql.Content | ConvertFrom-Json).data.card.taggings | ForEach-Object { "{0} [{1}]" -f $_.tag.name, $_.tag.type }
```
TODO for ExtractNode: extend the GraphQL selection to pull **ancestor/inheritance edges**, not just leaf tags, so NormalizeNode can roll tags up the DAG.

## Pitfalls log (things that actually bit us)

- **Guessing slugs** (`goad`, `drain`, scoped `synergy-sacrifice`) → silent 0 → misdiagnosed as "API unreliable, retract baseline." It was reliable; the slugs were fake.
- **Calling cards "untagged"** when they had tags outside the queried slug set.
- **WebFetch → 403** on `api.scryfall.com`. Never use it here.
- **`Invoke-WebRequest` without `-UseBasicParsing`** → "Windows PowerShell is in NonInteractive mode" (IE engine prompt).
- **`python` not on PATH** in the bash tool → use `py` (Windows) or PowerShell.
- **Taggings can differ by PRINTING** (the `dsc` printing of Kardur listed `goad`; the `khm` UI view did not). Pick a canonical printing and record it.
