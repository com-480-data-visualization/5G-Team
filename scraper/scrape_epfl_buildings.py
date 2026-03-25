import json
import os
from typing import Dict, List, Optional, Set

import requests


BUILDING_CODES = [
    "PPH", "SPP", "BCH", "BC", "CSB", "GEN", "QIJ", "DLLEL", "FBC", "AAC", "PSEB",
    "AAB", "BIO_A", "CO", "ALO", "PS_QN", "FO", "SOS2", "GA", "QIG", "BAR", "SPN",
    "INJ", "MXF", "DIA", "BFFA", "ALP", "TRIH", "EXTRA", "H4", "TCV", "AST", "GO10",
    "BAF", "TRIE", "PO", "PSEL", "STF", "BAP", "B25A", "SF", "AN", "QIH", "ELL",
    "PH", "PSEC", "BAH", "AI", "INR", "GR", "INN", "MA", "SS", "ELG", "MXD", "AU",
    "ZD", "I17", "H8", "QIE", "STT", "QIF", "INF", "ELB", "LE", "ODY", "MED", "AAD",
    "B1", "TRIC", "ELH", "MXH", "SV", "ELA", "SKIL", "G6", "ECAL", "QIK", "SSH",
    "RLC", "BS", "QII", "INM", "ELE", "CM", "ART", "PPB", "CH", "PV", "VOR", "CCT",
    "GEO", "CE", "CSN", "CAPU", "PSEA", "QIO", "BM", "QIN", "ELD", "ZP", "BAC", "BP",
    "HBL", "CSV", "I23", "SAUV", "CRR", "I19", "CSS", "CL", "VR15", "SCT", "BSP",
    "STCC", "MC", "JORD", "ME", "NH", "MXC", "CP1", "MXG", "BI", "SG", "PSED", "GC",
    "MXE", "ZC", "SOS1", "B3",
]

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.fr/api/interpreter",
]
OUTPUT_DIR = "output"
OUTPUT_JSON = os.path.join(OUTPUT_DIR, "epfl_buildings.json")
MISSING_JSON = os.path.join(OUTPUT_DIR, "missing_buildings.json")
DEBUG_JSON = os.path.join(OUTPUT_DIR, "debug_unmatched.json")


def normalize(text: Optional[str]) -> str:
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
    return f"https://www.openstreetmap.org/{obj_type}/{obj_id}"


def split_tag_value(value: str) -> List[str]:
    parts = [value]
    for sep in [";", ",", "/", "|"]:
        new_parts = []
        for part in parts:
            new_parts.extend(part.split(sep))
        parts = new_parts
    return [p.strip() for p in parts if p.strip()]


def extract_candidate_codes(tags: Dict[str, str]) -> Set[str]:
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
    os.makedirs(OUTPUT_DIR, exist_ok=True)


def write_json(path: str, data) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def fetch_overpass(query, max_retries=3):
    headers = {"Content-Type": "text/plain; charset=utf-8"}

    for attempt in range(max_retries):
        for url in OVERPASS_URLS:
            try:
                print(f"Trying {url} (attempt {attempt+1})...")
                response = requests.post(
                    url,
                    data=query.encode("utf-8"),
                    headers=headers,
                    timeout=180,
                )

                if response.status_code == 200:
                    return response.json()

                print(f"Server {url} returned {response.status_code}")

            except requests.exceptions.RequestException as e:
                print(f"Error with {url}: {e}")

        # wait before retrying
        sleep_time = 5 * (attempt + 1)
        print(f"Retrying in {sleep_time}s...")
        time.sleep(sleep_time)

    raise RuntimeError("All Overpass servers failed after retries.")


def find_first_matching_code(tags: Dict[str, str], wanted: Set[str]) -> Optional[str]:
    candidates = extract_candidate_codes(tags)

    for candidate in candidates:
        if candidate in wanted:
            return candidate

    return None


def main() -> None:
    ensure_output_dir()

    wanted_codes: Set[str] = {normalize(code) for code in BUILDING_CODES}

    # Broad query over EPFL campus area.
    # We query all building-tagged ways/relations, then filter locally using your code list.
    query = r"""
[out:json][timeout:120];

area["name"="École Polytechnique Fédérale de Lausanne"]->.epfl;

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

    matched: Dict[str, Dict] = {}
    debug_unmatched: List[Dict] = []

    elements = data.get("elements", [])
    print(f"Received {len(elements)} OSM elements")

    for element in elements:
        obj_type = element.get("type")
        obj_id = element.get("id")
        tags = element.get("tags", {})

        if not obj_type or obj_id is None:
            continue

        matched_code = find_first_matching_code(tags, wanted_codes)

        if matched_code is None:
            debug_unmatched.append(
                {
                    "id": osm_url(obj_type, obj_id),
                    "tags": tags,
                }
            )
            continue

        # Keep the first object found for each building code.
        if matched_code not in matched:
            matched[matched_code] = {
                "id": osm_url(obj_type, obj_id),
                "properties": {
                    "name": matched_code
                }
            }

    result: List[Dict] = []
    missing: List[str] = []

    for original_code in BUILDING_CODES:
        norm_code = normalize(original_code)
        item = matched.get(norm_code)
        if item is not None:
            result.append(item)
        else:
            missing.append(original_code)

    write_json(OUTPUT_JSON, result)
    write_json(MISSING_JSON, missing)
    write_json(DEBUG_JSON, debug_unmatched)

    print(f"Saved matched buildings to: {OUTPUT_JSON}")
    print(f"Saved missing building codes to: {MISSING_JSON}")
    print(f"Saved unmatched debug data to: {DEBUG_JSON}")
    print(f"Matched: {len(result)}")
    print(f"Missing: {len(missing)}")


if __name__ == "__main__":
    main()