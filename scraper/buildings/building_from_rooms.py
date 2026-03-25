import json
from pathlib import Path
import re
from typing import List

BASE_DIR = Path(__file__).resolve().parents[1]
ROOMS_PATH = BASE_DIR / "rooms" / "rooms.json"
BUILDINGS_PATH = BASE_DIR / "buildings" / "buildings.json"


def extract_building_code(room_code: str) -> str:
    """Return the building code from an EPFL room code.

    Most room codes start with a simple building code followed by the room
    location, for example "BC 123". Some buildings include a section marker in
    the second token, for example "GC A1 397" or "XY Z1 123". In those cases
    we keep only the leading letter and normalize them to "GC A" and "XY Z".
    """

    parts = room_code.split()
    if not parts:
        return ""

    building_parts: List[str] = [parts[0]]

    # Room codes such as "GC A1 397" or "PH K-1 501" encode a building section
    # in the leading letter of the second token. We keep that letter as part of
    # the building name and discard the floor/room suffix.
    if len(parts) > 1:
        match = re.match(r"^([A-Z])(?:[-0-9].*)?$", parts[1])
        if match:
            building_parts.append(match.group(1))

    return " ".join(building_parts)


with ROOMS_PATH.open("r", encoding="utf-8") as file_handle:
    rooms = json.load(file_handle)

buildings = set()
for room_code, _usage in rooms:
    building = extract_building_code(room_code)
    if not building:
        continue

    buildings.add(building)

with BUILDINGS_PATH.open("w", encoding="utf-8") as file_handle:
    json.dump(sorted(buildings), file_handle, indent=2)
