#!/usr/bin/env python3
"""Deterministic Scryfall API wrapper.

All network access is shelled out to `curl` (no extra Python dependencies),
per the design-spec's "fetch via Bash curl" model. Every function here is a
thin, re-fetchable wrapper: same input -> same Scryfall call -> same output
shape, so callers can independently reproduce any fact derived from it.

CLI usage:
    py scry.py card <name>              # fetch a card by fuzzy name
    py scry.py commander-colors <name>  # color identity of a commander card
"""

import json
import subprocess
import sys
import urllib.parse

API_BASE = "https://api.scryfall.com"
USER_AGENT = "agentic-marketplace/mtg-deck-builder (e.lichtman2@gmail.com)"


def _curl(url):
    """GET a URL via curl and parse the JSON response."""
    result = subprocess.run(
        ["curl", "-s", "-A", USER_AGENT, url],
        capture_output=True,
        encoding="utf-8",
        check=True,
    )
    return json.loads(result.stdout)


def fetch_card(name, fuzzy=True):
    """Fetch a single card by name from Scryfall.

    Raises ValueError if Scryfall returns an error object (e.g. no match).
    """
    param = "fuzzy" if fuzzy else "exact"
    url = f"{API_BASE}/cards/named?{param}={urllib.parse.quote(name)}"
    data = _curl(url)
    if data.get("object") == "error":
        raise ValueError(f"Scryfall error for '{name}': {data.get('details')}")
    return data


def fetch_commander_colors(name):
    """Return the color identity (list of WUBRG letters) for a commander card."""
    return fetch_card(name).get("color_identity", [])


COMMANDS = {
    "card": lambda name: fetch_card(name),
    "commander-colors": lambda name: fetch_commander_colors(name),
}


def main(argv):
    if len(argv) < 2 or argv[0] not in COMMANDS:
        print(f"usage: scry.py <{'|'.join(COMMANDS)}> <card name>", file=sys.stderr)
        return 1

    cmd, name = argv[0], " ".join(argv[1:])
    print(json.dumps(COMMANDS[cmd](name), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
