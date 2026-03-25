import json
import random
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Tuple


BASE_DIR = Path(__file__).resolve().parent
REPO_ROOT = BASE_DIR.parent
ROOMS_JSON = REPO_ROOT / "scraper" / "rooms" / "rooms.json"
OUTPUT_JSON = BASE_DIR / "room_occupancy.json"

SYNTHETIC_DATE = "2026-03-24"


def load_rooms() -> List[List[str]]:
    """Load the room list produced by the scraper."""
    with ROOMS_JSON.open("r", encoding="utf-8") as file_handle:
        return json.load(file_handle)


def random_slot() -> Tuple[datetime, datetime]:
    """Generate one random interval within the synthetic day."""
    day_start = datetime.fromisoformat(f"{SYNTHETIC_DATE}T00:00:00")
    start_hour = random.randint(7, 20)
    start_minute = random.choice([0, 30])
    duration_hours = random.randint(1, 3)

    start = day_start + timedelta(hours=start_hour, minutes=start_minute)
    end = start + timedelta(hours=duration_hours)

    if end.date() != start.date():
        end = datetime.fromisoformat(f"{SYNTHETIC_DATE}T23:59:00")

    return start, end


def overlaps(candidate: Tuple[datetime, datetime], existing: List[Tuple[datetime, datetime]]) -> bool:
    """Return True if the candidate interval overlaps any existing interval."""
    candidate_start, candidate_end = candidate

    for current_start, current_end in existing:
        if candidate_start < current_end and candidate_end > current_start:
            return True

    return False


def build_room_occupancy(room_name: str) -> List[Dict[str, object]]:
    """
    Create one occupancy object per room.

    Output format:
    - one JSON object per room
    - `slots` contains several unavailable slot objects
    - each slot object has one `Start` and one `End`
    - intervals for the same room do not overlap
    """
    interval_count = random.randint(1, 5)
    intervals: List[Tuple[datetime, datetime]] = []
    attempts = 0

    while len(intervals) < interval_count and attempts < 100:
        candidate = random_slot()
        if not overlaps(candidate, intervals):
            intervals.append(candidate)
        attempts += 1

    intervals.sort(key=lambda item: item[0])

    return {
        "name": [room_name],
        "slots": [
            {
                "Start": start.isoformat(),
                "End": end.isoformat(),
            }
            for start, end in intervals
        ],
    }


def main() -> None:
    rooms = load_rooms()

    synthesized = [
        build_room_occupancy(room_name)
        for room_name, _room_type in rooms
    ]

    with OUTPUT_JSON.open("w", encoding="utf-8") as file_handle:
        json.dump(synthesized, file_handle, indent=2, ensure_ascii=False)

    print(f"Loaded {len(rooms)} rooms from {ROOMS_JSON}")
    print(f"Saved synthesized occupancy to {OUTPUT_JSON}")


if __name__ == "__main__":
    main()
