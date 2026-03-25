import json
import os
import time
from pathlib import Path
from typing import Dict, List, Optional, Set

import requests

# The script lives in scraper/osm_buildings_id/, so parents[1] is scraper/.
# From there we can build stable paths to the input and output files.
BASE_DIR = Path(__file__).resolve().parents[1]
BUILDINGS_JSON = BASE_DIR / "buildings" / "buildings_main_campus.json"
REPO_ROOT = BASE_DIR.parent
WEBSITE_BUILDINGS_JSON = REPO_ROOT / "website" / "epfl_buildings.json"

# Overpass has multiple public instances. This script tries them in sequence
# so one temporary outage does not break the workflow completely.
OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.fr/api/interpreter",
]

# Output files are written relative to the current working directory.
# In normal use this script is run from scraper/osm_buildings_id/.
OUTPUT_DIR = "output"
OUTPUT_JSON = os.path.join(OUTPUT_DIR, "epfl_buildings.json")
MISSING_JSON = os.path.join(OUTPUT_DIR, "missing_buildings.json")
DEBUG_JSON = os.path.join(OUTPUT_DIR, "debug_unmatched.json")
# For Rolex Learning Center (RLC) we could not find a reliable automatic way to match it, So we inject it manually using the known OSM relation id. This also serves as a sanity check that the manual entry is consistent with the expected OSM URL format.
MANUAL_BUILDINGS = [
    {
        "id": "https://www.openstreetmap.org/relation/331569",
        "properties": {
            "name": "RLC"
        }
    }
]


def is_manual_rlc_variant(code: str) -> bool:
    """
    Treat Rolex sub-block labels as covered by the manual RLC entry.

    Examples:
    - RLC
    - RLC A
    - RLC B
    - RLC G
    """
    normalized = normalize(code)
    return normalized == "RLC" or normalized.startswith("RLC_")


def log_section(title: str) -> None:
    """Print a visible section header so the script output is easier to follow."""
    print(f"\n{'=' * 20} {title} {'=' * 20}")


def load_building_codes() -> List[str]:
    """Load the building codes generated from the room scraper."""

    with BUILDINGS_JSON.open("r", encoding="utf-8") as file_handle:
        return json.load(file_handle)


def normalize(text: Optional[str]) -> str:
    """
    Normalize building names/codes so matching is robust.

    Example:
    - "BC" -> "BC"
    - "bc" -> "BC"
    - "PS-QN" -> "PS_QN"
    - " MXE " -> "MXE"
    """
    if text is None:
        return ""
    return (
        str(text)
        .strip()
        .upper()
        .replace(" ", "")
        .replace("-", "_")
    )


def osm_url(obj_type: str, obj_id: int) -> str:
    """Build the user-facing OSM URL for a matched way/relation."""
    return f"https://www.openstreetmap.org/{obj_type}/{obj_id}"


def split_tag_value(value: str) -> List[str]:
    """
    Split multi-value OSM tags into smaller parts.

    OSM values sometimes contain several names or references in one field,
    for example "BC; CE" or "MXE / MXF". We split on a few common separators
    to improve the chance of finding a building code.
    """
    parts = [value]
    for sep in [";", ",", "/", "|"]:
        new_parts = []
        for part in parts:
            new_parts.extend(part.split(sep))
        parts = new_parts
    return [p.strip() for p in parts if p.strip()]


def extract_candidate_codes(tags: Dict[str, str]) -> Set[str]:
    """
    Extract all possible building-code candidates from an OSM tag dictionary.

    The script does not rely on one single OSM tag. Instead it inspects several
    likely fields such as `ref`, `name`, `short_name`, and `official_name`,
    because different objects in OSM may encode the building identifier in
    different places.
    """
    candidate_keys = [
        "ref",
        "name",
        "short_name",
        "official_name",
        "alt_name",
        "loc_name",
    ]

    candidates: Set[str] = set()

    for key in candidate_keys:
        value = tags.get(key)
        if not value:
            continue

        # First inspect the whole tag value and its obvious split pieces.
        for raw_piece in split_tag_value(str(value)):
            piece = normalize(raw_piece)
            if piece:
                candidates.add(piece)

            # Extra fallback:
            # If a tag is like "BC building" or "MXE EPFL", also inspect tokens.
            tokenized = raw_piece.replace("_", " ").replace("-", " ").split()
            for token in tokenized:
                token_norm = normalize(token)
                if token_norm:
                    candidates.add(token_norm)

    return candidates


def ensure_output_dir() -> None:
    """Create the output directory if it does not already exist."""
    os.makedirs(OUTPUT_DIR, exist_ok=True)


def write_json(path: str, data) -> None:
    """Write JSON with indentation to make the output easy to inspect manually."""
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def fetch_overpass(query, max_retries=3):
    """
    Send the Overpass query to several public endpoints with retries.

    Why this is implemented this way:
    - public Overpass instances are sometimes slow or temporarily unavailable
    - trying several mirrors improves reliability
    - exponential-ish waiting between retries is polite and avoids hammering
      the servers
    """
    headers = {"Content-Type": "text/plain; charset=utf-8"}

    for attempt in range(max_retries):
        for url in OVERPASS_URLS:
            try:
                log_section("OVERPASS REQUEST")
                print(f"Trying {url} (attempt {attempt+1})...")
                print("Query sent to Overpass:")
                print(query.strip())
                response = requests.post(
                    url,
                    data=query.encode("utf-8"),
                    headers=headers,
                    timeout=180,
                )

                if response.status_code == 200:
                    payload = response.json()
                    log_section("OVERPASS RESPONSE")
                    print(f"Server: {url}")
                    print(f"Top-level keys: {list(payload.keys())}")
                    print(f"Element count: {len(payload.get('elements', []))}")
                    if payload.get("elements"):
                        first_element = payload["elements"][0]
                        print("First returned element:")
                        print(
                            json.dumps(
                                {
                                    "type": first_element.get("type"),
                                    "id": first_element.get("id"),
                                    "tags": first_element.get("tags", {}),
                                },
                                indent=2,
                                ensure_ascii=False,
                            )
                        )
                    return payload

                print(f"Server {url} returned {response.status_code}")

            except requests.exceptions.RequestException as e:
                print(f"Error with {url}: {e}")

        # wait before retrying
        sleep_time = 5 * (attempt + 1)
        print(f"Retrying in {sleep_time}s...")
        time.sleep(sleep_time)

    raise RuntimeError("All Overpass servers failed after retries.")


def find_first_matching_code(tags: Dict[str, str], wanted: Set[str]) -> Optional[str]:
    """
    Return the first normalized candidate code that exists in the wanted set.

    `wanted` is the set of building codes we care about from the EPFL dataset.
    `tags` is the metadata attached to one OSM way/relation.
    """
    candidates = extract_candidate_codes(tags)

    for candidate in candidates:
        if candidate in wanted:
            return candidate

    return None


def main() -> None:
    """
    Main pipeline:

    1. Load the building codes we want to find in OSM.
    2. Query Overpass for building objects inside the EPFL area.
    3. Match returned objects against the wanted code list.
    4. Save:
       - matched OSM ids
       - missing building codes
       - unmatched OSM objects for debugging
    """
    ensure_output_dir()

    # These codes come from your EPFL-side data source, not from OSM.
    building_codes = load_building_codes()
    wanted_codes: Set[str] = {normalize(code) for code in building_codes}

    # We want to inject RLC manually as one building relation, so remove it from
    # the automatic matching stage. This also prevents partial RLC sub-labels
    # such as "RLC A", "RLC B", etc. from competing with the manual entry.
    wanted_codes = {code for code in wanted_codes if not is_manual_rlc_variant(code)}

    log_section("INPUT BUILDING CODES")
    print(f"Loaded {len(building_codes)} requested building codes")
    print("First 20 building codes:")
    print(building_codes[:20])

    # Broad query over the Ecublens administrative area.
    # This is intentionally wider than the EPFL area so buildings near or outside
    # the EPFL-tagged area are less likely to be missed.
    #
    # We still filter locally using the known EPFL building-code list, so the
    # wider area should not change the final output format, only the candidate set.
    # One could also run it only for area["name"="École Polytechnique Fédérale de Lausanne"]->.epfl; but we wanted to make sure we are complete.
    query = r"""
[out:json][timeout:120];

area["name"="Ecublens"]["boundary"="administrative"]->.epfl;

(
  way(area.epfl)["building"];
  relation(area.epfl)["building"];
  way(area.epfl)["building"="university"];
  relation(area.epfl)["building"="university"];
);

out ids tags center;
"""

    print("Querying Overpass API...")
    data = fetch_overpass(query)

    # `matched` is keyed by normalized building code, e.g. "AAB" or "SV".
    matched: Dict[str, Dict] = {}

    # Stores OSM objects that we saw but could not map to one of the requested
    # EPFL building codes. This is useful when improving the matching logic.
    debug_unmatched: List[Dict] = []

    elements = data.get("elements", [])
    log_section("MATCHING OSM ELEMENTS")
    print(f"Received {len(elements)} OSM elements")

    for index, element in enumerate(elements, start=1):
        obj_type = element.get("type")
        obj_id = element.get("id")
        tags = element.get("tags", {})

        if not obj_type or obj_id is None:
            continue

        print(f"\n[{index}/{len(elements)}] Inspecting {obj_type}/{obj_id}")
        print(f"OSM URL: {osm_url(obj_type, obj_id)}")
        print(f"Relevant tags: {json.dumps(tags, ensure_ascii=False)}")

        candidates = sorted(extract_candidate_codes(tags))
        print(f"Candidate building codes extracted from tags: {candidates}")

        matched_code = find_first_matching_code(tags, wanted_codes)

        if matched_code is None:
            print("Result: no requested EPFL building code matched this OSM element")
            debug_unmatched.append(
                {
                    "id": osm_url(obj_type, obj_id),
                    "tags": tags,
                }
            )
            continue

        print(f"Result: matched requested building code -> {matched_code}")

        # Keep the first object found for each building code.
        # This avoids duplicate matches if Overpass returns several objects
        # with overlapping or redundant names.
        if matched_code not in matched:
            print("Action: storing this OSM object as the chosen match")
            matched[matched_code] = {
                "id": osm_url(obj_type, obj_id),
                "properties": {
                    "name": matched_code
                }
            }
        else:
            print("Action: ignored because this building code was already matched earlier")

    result: List[Dict] = []
    missing: List[str] = []

    # Preserve the original order from buildings_main_campus.json in the output.
    for original_code in building_codes:
        norm_code = normalize(original_code)

        # RLC and its lettered variants are handled manually below using the
        # provided global RLC relation, so they should not appear as missing.
        if is_manual_rlc_variant(norm_code):
            continue

        item = matched.get(norm_code)
        if item is not None:
            result.append(item)
        else:
            missing.append(original_code)

    # Append manual buildings at the very end of the output, as requested.
    result.extend(MANUAL_BUILDINGS)

    write_json(OUTPUT_JSON, result)
    write_json(str(WEBSITE_BUILDINGS_JSON), result)
    write_json(MISSING_JSON, missing)
    write_json(DEBUG_JSON, debug_unmatched)

    log_section("FINAL SUMMARY")
    print(f"Saved matched buildings to: {OUTPUT_JSON}")
    print(f"Saved matched buildings to website: {WEBSITE_BUILDINGS_JSON}")
    print(f"Saved missing building codes to: {MISSING_JSON}")
    print(f"Saved unmatched debug data to: {DEBUG_JSON}")
    print(f"Matched: {len(result)}")
    print(f"Missing: {len(missing)}")


if __name__ == "__main__":
    main()
