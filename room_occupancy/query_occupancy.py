#!/usr/bin/env python3
"""Query EPFL room occupancy from the public EWA room page.

This script reads the JavaScript calendar payload embedded in:
https://ewa.epfl.ch/room/Default.aspx?room=<room>
and extracts DayPilot events from the `v.events` assignment.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys
from dataclasses import dataclass
from datetime import datetime
from html import unescape
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BASE_URL = "https://ewa.epfl.ch/room/Default.aspx?room={room}"
EVENTS_RE = re.compile(r"v\.events\s*=\s*(\[.*?\]);", re.DOTALL)
TAG_RE = re.compile(r"<[^>]+>")
VIEWSTATE_RE = re.compile(r'id="__VIEWSTATE"[^>]*value="([^"]+)"')


@dataclass(frozen=True)
class RoomEvent:
    title: str
    start: datetime
    end: datetime
    raw: dict[str, Any]


def fetch_room_page(
    room: str, 
    timeout: float = 30.0,
    start: datetime | None = None,
    end: datetime | None = None,
) -> str:
    url = BASE_URL.format(room=room)
    
    # Add time range parameters to URL if provided
    if start is not None and end is not None:
        url += f"&start={start.isoformat()}&end={end.isoformat()}"
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) OccupancyScript/1.0"
        },
    )

    try:
        with urlopen(request, timeout=timeout) as response:
            return response.read().decode("utf-8", errors="replace")
    except HTTPError as exc:
        raise RuntimeError(f"HTTP error while requesting {url}: {exc.code}") from exc
    except URLError as exc:
        raise RuntimeError(f"Network error while requesting {url}: {exc.reason}") from exc


def sanitize_json_escapes(payload: str) -> str:
    """Repair non-JSON escapes seen in DayPilot JS payloads.

    Some rooms expose JavaScript-style escaped strings (for example \' in text),
    which is valid JavaScript but invalid JSON. We normalize those so json.loads
    can parse the event array.
    """

    out: list[str] = []
    i = 0
    valid_escapes = {'"', "\\", "/", "b", "f", "n", "r", "t", "u"}

    while i < len(payload):
        ch = payload[i]
        if ch != "\\" or i + 1 >= len(payload):
            out.append(ch)
            i += 1
            continue

        nxt = payload[i + 1]

        if nxt in valid_escapes:
            out.append("\\")
            out.append(nxt)
            i += 2
            continue

        if nxt == "'":
            # In JSON single quotes do not need escaping.
            out.append("'")
            i += 2
            continue

        # Keep the original character but escape the backslash itself.
        out.append("\\")
        out.append("\\")
        out.append(nxt)
        i += 2

    return "".join(out)


def parse_events_payload(payload: str) -> list[dict[str, Any]]:
    try:
        return json.loads(payload)
    except json.JSONDecodeError:
        repaired = sanitize_json_escapes(payload)
        return json.loads(repaired)


def extract_events(html: str) -> list[RoomEvent]:
    match = EVENTS_RE.search(html)
    if not match:
        raise RuntimeError(
            "Could not find event payload (`v.events`) in room page. "
            "The page format may have changed."
        )

    payload = match.group(1)
    raw_events = parse_events_payload(payload)

    events: list[RoomEvent] = []
    for item in raw_events:
        start = datetime.fromisoformat(item["Start"])
        end = datetime.fromisoformat(item["End"])

        text = item.get("Text") or item.get("Header") or "(untitled)"
        title = unescape(TAG_RE.sub("", text)).strip() or "(untitled)"

        events.append(RoomEvent(title=title, start=start, end=end, raw=item))

    events.sort(key=lambda event: event.start)
    return events


def room_in_system_from_html(html: str, events: list[RoomEvent]) -> bool:
    """Best-effort detector for whether the room exists in EWA room booking system.

    Observed behavior:
    - Valid rooms generally carry richer __VIEWSTATE and can have non-empty events.
    - Unknown rooms return a minimal page, often with `v.events = [];` and short viewstate.
    """

    viewstate_match = VIEWSTATE_RE.search(html)
    viewstate_len = len(viewstate_match.group(1)) if viewstate_match else 0
    has_explicit_empty_events = "v.events = [];" in html

    if events:
        return True

    # Heuristic derived from observed pages (minimal fallback page is ~188 chars viewstate).
    return not (has_explicit_empty_events and viewstate_len <= 188)


def parse_at(value: str | None) -> datetime:
    if value is None:
        return datetime.now()

    try:
        return datetime.fromisoformat(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            "Invalid datetime format. Use ISO format, for example "
            "2026-03-25T14:30:00"
        ) from exc


def parse_iso_datetime(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            "Invalid datetime format. Use ISO format, for example "
            "2026-03-25T14:30:00"
        ) from exc


def interval_overlaps(event: RoomEvent, start: datetime, end: datetime) -> bool:
    return event.start < end and event.end > start


def events_for_interval(events: list[RoomEvent], start: datetime, end: datetime) -> list[RoomEvent]:
    return [event for event in events if interval_overlaps(event, start, end)]


def normalize_room(raw_value: str) -> str:
    # Accept lines like "BC 133: BUREAU" from room list exports.
    token = raw_value.split(":", maxsplit=1)[0].strip()
    token = "".join(token.split())
    return token.lower()


def load_rooms_from_file(path: Path) -> list[str]:
    rooms: list[str] = []
    seen: set[str] = set()

    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        room = normalize_room(stripped)
        if not room or room in seen:
            continue

        seen.add(room)
        rooms.append(room)

    return rooms


def summarize(room: str, at: datetime, events: list[RoomEvent], limit: int) -> dict[str, Any]:
    ongoing = [event for event in events if event.start <= at < event.end]
    upcoming = [event for event in events if event.start >= at]

    result = {
        "room": room,
        "at": at.isoformat(),
        "occupied": bool(ongoing),
        "ongoing": [
            {
                "title": event.title,
                "start": event.start.isoformat(),
                "end": event.end.isoformat(),
            }
            for event in ongoing
        ],
        "upcoming": [
            {
                "title": event.title,
                "start": event.start.isoformat(),
                "end": event.end.isoformat(),
            }
            for event in upcoming[: max(limit, 0)]
        ],
        "events_in_page": len(events),
    }

    if ongoing:
        result["next_transition"] = min(event.end for event in ongoing).isoformat()
    elif upcoming:
        result["next_transition"] = upcoming[0].start.isoformat()
    else:
        result["next_transition"] = None

    return result


def add_interval_to_summary(
    summary: dict[str, Any], events: list[RoomEvent], start: datetime, end: datetime
) -> None:
    interval_events = events_for_interval(events, start, end)
    summary["interval"] = {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "events": [
            {
                "title": event.title,
                "start": event.start.isoformat(),
                "end": event.end.isoformat(),
            }
            for event in interval_events
        ],
        "count": len(interval_events),
    }


def print_human(summary: dict[str, Any]) -> None:
    room = summary["room"]
    at = summary["at"]
    occupied = summary["occupied"]

    status = "OCCUPIED" if occupied else "FREE"
    in_system = summary.get("in_system", True)
    room_state = "IN SYSTEM" if in_system else "NOT IN SYSTEM"
    print(f"Room {room} at {at}: {status} ({room_state})")

    transition = summary["next_transition"]
    if transition:
        if occupied:
            print(f"Next free slot starts at: {transition}")
        else:
            print(f"Next booking starts at: {transition}")
    else:
        print("No transition found in currently loaded events.")

    ongoing = summary["ongoing"]
    if ongoing:
        print("\nOngoing bookings:")
        for event in ongoing:
            print(f"- {event['start']} -> {event['end']} | {event['title']}")

    upcoming = summary["upcoming"]
    if upcoming:
        print("\nUpcoming bookings:")
        for event in upcoming:
            print(f"- {event['start']} -> {event['end']} | {event['title']}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Query EPFL room occupancy")
    parser.add_argument("room", nargs="?", help="Room identifier, for example bc133")
    parser.add_argument(
        "--at",
        type=parse_at,
        default=None,
        help="Datetime in ISO format (default: now)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=5,
        help="Maximum number of upcoming bookings to print (default: 5)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        default=True,
        help="Output as JSON (default: True)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Output file path (default: room_occupancy/occupancy.json)",
    )
    parser.add_argument(
        "--from",
        dest="from_time",
        type=parse_iso_datetime,
        default=None,
        help="Interval start datetime in ISO format (for interval filtering)",
    )
    parser.add_argument(
        "--to",
        dest="to_time",
        type=parse_iso_datetime,
        default=None,
        help="Interval end datetime in ISO format (for interval filtering)",
    )
    parser.add_argument(
        "--rooms-file",
        type=Path,
        default=Path("room_occupancy/room_list.txt"),
        help="Path to a text file containing rooms, one per line (default: room_occupancy/room_list.txt)",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    # Set default output file if not specified
    if args.output is None:
        args.output = Path("room_occupancy/occupancy.json")

    # If a room argument is provided, use that; otherwise use rooms-file
    if args.room and args.rooms_file == Path("room_occupancy/room_list.txt"):
        # User provided explicit room, don't use rooms file
        rooms = [normalize_room(args.room)]
    elif args.room and args.rooms_file != Path("room_occupancy/room_list.txt"):
        # User explicitly provided both room and non-default rooms-file
        print("Error: use either a room argument or --rooms-file, not both.", file=sys.stderr)
        return 2
    else:
        # Use rooms file (default or explicit)
        if not args.rooms_file.exists():
            print(f"Error: rooms file not found: {args.rooms_file}", file=sys.stderr)
            return 2
        try:
            rooms = load_rooms_from_file(args.rooms_file)
        except OSError as exc:
            print(f"Error: cannot read rooms file: {exc}", file=sys.stderr)
            return 2

    if not rooms:
        print("Error: no valid rooms found.", file=sys.stderr)
        return 2

    at = args.at or datetime.now()

    if (args.from_time is None) != (args.to_time is None):
        print("Error: --from and --to must be provided together.", file=sys.stderr)
        return 2
    if args.from_time and args.to_time and args.from_time >= args.to_time:
        print("Error: --from must be earlier than --to.", file=sys.stderr)
        return 2

    # Default time interval to today if not specified
    if args.from_time is None and args.to_time is None:
        args.from_time = at.replace(hour=0, minute=0, second=0, microsecond=0)
        args.to_time = args.from_time.replace(hour=23, minute=59, second=59)

    summaries: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []

    for room in rooms:
        try:
            html = fetch_room_page(room)
            events = extract_events(html)
        except RuntimeError as exc:
            errors.append({"room": room, "error": str(exc)})
            continue
        except json.JSONDecodeError as exc:
            errors.append({"room": room, "error": f"failed to parse events JSON: {exc}"})
            continue

        summary = summarize(room=room, at=at, events=events, limit=args.limit)
        summary["in_system"] = room_in_system_from_html(html, events)
        if args.from_time and args.to_time:
            add_interval_to_summary(summary, events, args.from_time, args.to_time)
            # Get occupied slots (booked times)
            occupied_slots = events_for_interval(events, args.from_time, args.to_time)
            summary["occupied_slots"] = [[e.start.isoformat(), e.end.isoformat()] for e in occupied_slots]

        summaries.append(summary)

    if args.json:
        if len(rooms) == 1 and args.room and summaries:
            # Single room query format
            summary = summaries[0]
            output = {
                "name": [summary["room"]],
                "slots": summary.get("occupied_slots", [])
            }
            output_data = json.dumps(output, indent=2)
        else:
            # Multiple rooms format
            results = []
            for summary in summaries:
                results.append({
                    "name": [summary["room"]],
                    "slots": summary.get("occupied_slots", [])
                })
            output_data = json.dumps(results, indent=2)
        
        # Write to file
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output_data, encoding="utf-8")
        print(f"Output written to: {args.output}")
    else:
        for index, summary in enumerate(summaries):
            if index > 0:
                print()
            print_human(summary)

        if errors:
            print("\nErrors:", file=sys.stderr)
            for item in errors:
                print(f"- {item['room']}: {item['error']}", file=sys.stderr)

    return 0 if summaries else 1


if __name__ == "__main__":
    raise SystemExit(main())
