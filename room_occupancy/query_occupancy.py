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
from datetime import datetime, timedelta
from html import unescape
from typing import Any
from http.cookiejar import CookieJar
from urllib.parse import urlencode
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen, build_opener, HTTPCookieProcessor, OpenerDirector
import concurrent.futures

BASE_URL = "https://ewa.epfl.ch/room/Default.aspx?room={room}"
CALLBACK_URL = "https://ewa.epfl.ch/room/Default.aspx"
DAYPILOT_CALLBACK_ID = "ctl00$ContentPlaceHolder1$DayPilotCalendar1"
EVENTS_RE = re.compile(r"v\.events\s*=\s*(\[.*?\]);", re.DOTALL)
TAG_RE = re.compile(r"<[^>]+>")
VIEWSTATE_RE = re.compile(r'id="__VIEWSTATE"[^>]*value="([^"]+)"')
VIEWSTATEGENERATOR_RE = re.compile(r'id="__VIEWSTATEGENERATOR"[^>]*value="([^"]+)"')
EVENTVALIDATION_RE = re.compile(r'id="__EVENTVALIDATION"[^>]*value="([^"]+)"')
DAYPILOT_COLUMNS_RE = re.compile(r"v\.columns\s*=\s*(\[.*?\]);", re.DOTALL)
DAYPILOT_HASHES_RE = re.compile(r"v\.hashes\s*=\s*(\{.*?\});", re.DOTALL)


@dataclass(frozen=True)
class RoomEvent:
    title: str
    start: datetime
    end: datetime
    raw: dict[str, Any]


def fetch_room_page(room: str, timeout: float = 30.0, opener: OpenerDirector | None = None) -> str:
    url = BASE_URL.format(room=room)
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) OccupancyScript/1.0"
        },
    )

    try:
        with (opener.open(request, timeout=timeout) if opener else urlopen(request, timeout=timeout)) as response:
            return response.read().decode("utf-8", errors="replace")
    except HTTPError as exc:
        raise RuntimeError(f"HTTP error while requesting {url}: {exc.code}") from exc
    except URLError as exc:
        raise RuntimeError(f"Network error while requesting {url}: {exc.reason}") from exc


def extract_daypilot_state(html: str) -> dict[str, str]:
    viewstate_match = VIEWSTATE_RE.search(html)
    if not viewstate_match:
        raise RuntimeError("Could not extract __VIEWSTATE from room page.")

    state: dict[str, str] = {
        "__VIEWSTATE": viewstate_match.group(1),
    }

    viewstate_generator_match = VIEWSTATEGENERATOR_RE.search(html)
    if viewstate_generator_match:
        state["__VIEWSTATEGENERATOR"] = viewstate_generator_match.group(1)

    eventvalidation_match = EVENTVALIDATION_RE.search(html)
    if eventvalidation_match:
        state["__EVENTVALIDATION"] = eventvalidation_match.group(1)

    return state


def extract_daypilot_header(html: str) -> dict[str, Any]:
    columns_match = DAYPILOT_COLUMNS_RE.search(html)
    hashes_match = DAYPILOT_HASHES_RE.search(html)
    if not columns_match or not hashes_match:
        raise RuntimeError("Could not extract DayPilot columns/hashes from room page.")

    def extract_js_value(name: str) -> str:
        match = re.search(rf"v\.{name}\s*=\s*(.*?);", html)
        if not match:
            raise RuntimeError(f"Could not extract DayPilot field: {name}")
        return match.group(1).strip()

    def parse_js_string(value: str) -> str:
        if len(value) >= 2 and value[0] == "'" and value[-1] == "'":
            return value[1:-1]
        raise RuntimeError(f"Expected JS string literal, got: {value}")

    columns = parse_events_payload(columns_match.group(1))
    hashes = parse_events_payload(hashes_match.group(1))
    tag_fields = parse_events_payload(extract_js_value("tagFields"))

    return {
        "control": "dpc",
        "id": "ContentPlaceHolder1_DayPilotCalendar1",
        "clientState": {},
        "columns": columns,
        "days": int(extract_js_value("days")),
        "startDate": parse_js_string(extract_js_value("startDate")),
        "cellDuration": int(extract_js_value("cellDuration")),
        "heightSpec": parse_js_string(extract_js_value("heightSpec")),
        "businessBeginsHour": int(extract_js_value("businessBeginsHour")),
        "businessEndsHour": int(extract_js_value("businessEndsHour")),
        "viewType": parse_js_string(extract_js_value("viewType")),
        "dayBeginsHour": int(extract_js_value("dayBeginsHour")),
        "dayEndsHour": int(extract_js_value("dayEndsHour")),
        "headerLevels": int(extract_js_value("headerLevels")),
        "backColor": parse_js_string(extract_js_value("cellBackColor")),
        "nonBusinessBackColor": parse_js_string(extract_js_value("cellBackColorNonBusiness")),
        "eventHeaderVisible": extract_js_value("eventHeaderVisible") == "true",
        "timeFormat": parse_js_string(extract_js_value("timeFormat")),
        "showAllDayEvents": extract_js_value("showAllDayEvents") == "true",
        "tagFields": tag_fields,
        "hourNameBackColor": parse_js_string(extract_js_value("hourNameBackColor")),
        "hourFontFamily": parse_js_string(extract_js_value("hourFontFamily")),
        "hourFontSize": parse_js_string(extract_js_value("hourFontSize")),
        "hourFontColor": parse_js_string(extract_js_value("hourFontColor")),
        "selected": "",
        "hashes": hashes,
    }


def build_daypilot_callback_param(start: datetime, end: datetime, header: dict[str, Any]) -> str:
    payload = {
        "action": "Command",
        "parameters": {"command": "navigate"},
        "data": {
            "start": start.replace(microsecond=0).isoformat(),
            "end": end.replace(microsecond=0).isoformat(),
            "days": int(header.get("days", 7)),
        },
        "header": header,
    }
    return "JSON" + json.dumps(payload, separators=(",", ":"))


def post_daypilot_callback(
    room: str,
    state: dict[str, str],
    header: dict[str, Any],
    start: datetime,
    end: datetime,
    timeout: float = 30.0,
    opener: OpenerDirector | None = None,
) -> str:
    form_data = {
        "__EVENTTARGET": "",
        "__EVENTARGUMENT": "",
        "__VIEWSTATE": state["__VIEWSTATE"],
        "__CALLBACKID": DAYPILOT_CALLBACK_ID,
        "__CALLBACKPARAM": build_daypilot_callback_param(start, end, header),
    }

    if "__VIEWSTATEGENERATOR" in state:
        form_data["__VIEWSTATEGENERATOR"] = state["__VIEWSTATEGENERATOR"]
    if "__EVENTVALIDATION" in state:
        form_data["__EVENTVALIDATION"] = state["__EVENTVALIDATION"]

    encoded_form = urlencode(form_data).encode("utf-8")
    request = Request(
        CALLBACK_URL,
        data=encoded_form,
        headers={
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) OccupancyScript/1.0",
            "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
            "Referer": BASE_URL.format(room=room),
            "X-Requested-With": "XMLHttpRequest",
        },
    )

    try:
        with (opener.open(request, timeout=timeout) if opener else urlopen(request, timeout=timeout)) as response:
            return response.read().decode("utf-8", errors="replace")
    except HTTPError as exc:
        raise RuntimeError(f"HTTP error while posting callback for {room}: {exc.code}") from exc
    except URLError as exc:
        raise RuntimeError(f"Network error while posting callback for {room}: {exc.reason}") from exc


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


def room_events_from_items(raw_events: list[dict[str, Any]]) -> list[RoomEvent]:
    events: list[RoomEvent] = []
    for item in raw_events:
        start = datetime.fromisoformat(item["Start"])
        end = datetime.fromisoformat(item["End"])

        text = item.get("Text") or item.get("Header") or "(untitled)"
        title = unescape(TAG_RE.sub("", text)).strip() or "(untitled)"

        events.append(RoomEvent(title=title, start=start, end=end, raw=item))

    events.sort(key=lambda event: event.start)
    return events


def extract_events(html: str) -> list[RoomEvent]:
    match = EVENTS_RE.search(html)
    if not match:
        raise RuntimeError(
            "Could not find event payload (`v.events`) in room page. "
            "The page format may have changed."
        )

    payload = match.group(1)
    raw_events = parse_events_payload(payload)

    return room_events_from_items(raw_events)


def parse_callback_events(callback_response: str) -> list[RoomEvent]:
    _, separator, payload = callback_response.partition("|")
    if not separator:
        raise RuntimeError("Unexpected callback response format (missing protocol separator).")

    payload = payload.strip()
    start = payload.find("{")
    if start < 0:
        raise RuntimeError("Could not find JSON object in callback response.")

    depth = 0
    in_string = False
    escaped = False
    end_index = -1

    for index, ch in enumerate(payload[start:], start=start):
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue

        if ch == '"':
            in_string = True
            continue

        if ch == "{":
            depth += 1
            continue

        if ch == "}":
            depth -= 1
            if depth == 0:
                end_index = index
                break

    if end_index < 0:
        raise RuntimeError("Could not extract complete JSON object from callback response.")

    candidate = payload[start : end_index + 1]
    parsed = parse_events_payload(candidate)
    raw_events = parsed.get("Events", []) if isinstance(parsed, dict) else []
    if not isinstance(raw_events, list):
        raise RuntimeError("Unexpected callback payload: Events is not a list.")
    return room_events_from_items(raw_events)


def events_via_callback(
    room: str,
    html: str,
    start: datetime,
    end: datetime,
    opener: OpenerDirector | None = None,
) -> list[RoomEvent]:
    state = extract_daypilot_state(html)
    header = extract_daypilot_header(html)
    days_per_page = max(1, int(header.get("days", 7)))

    all_events: list[RoomEvent] = []
    cursor = start
    while cursor < end:
        window_end = min(cursor + timedelta(days=days_per_page), end)
        callback_payload = post_daypilot_callback(
            room=room,
            state=state,
            header=header,
            start=cursor,
            end=window_end,
            opener=opener,
        )
        all_events.extend(parse_callback_events(callback_payload))
        cursor = window_end

    # De-duplicate events that can appear in adjacent windows.
    unique: dict[tuple[str, str, str], RoomEvent] = {}
    for event in all_events:
        key = (event.start.isoformat(), event.end.isoformat(), event.title)
        unique[key] = event

    deduped = list(unique.values())
    deduped.sort(key=lambda event: event.start)
    return deduped


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

    def process_room(room):
        opener = build_opener(HTTPCookieProcessor(CookieJar()))
        try:
            html = fetch_room_page(room, opener=opener)
            events = extract_events(html)
            if args.from_time and args.to_time:
                events = events_via_callback(
                    room=room,
                    html=html,
                    start=args.from_time,
                    end=args.to_time,
                    opener=opener,
                )
        except RuntimeError as exc:
            errors.append({"room": room, "error": str(exc)})
            return
        except json.JSONDecodeError as exc:
            errors.append({"room": room, "error": f"failed to parse events JSON: {exc}"})
            return

        summary = summarize(room=room, at=at, events=events, limit=args.limit)
        summary["in_system"] = room_in_system_from_html(html, events)
        if args.from_time and args.to_time:
            add_interval_to_summary(summary, events, args.from_time, args.to_time)
            # Get occupied slots (booked times)
            occupied_slots = events_for_interval(events, args.from_time, args.to_time)
            summary["occupied_slots"] = [[e.start.isoformat(), e.end.isoformat()] for e in occupied_slots]

        return summary

    with concurrent.futures.ThreadPoolExecutor(max_workers=100) as executor:
        results = list(executor.map(process_room, rooms))
        for summary in results:
            if summary:
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
