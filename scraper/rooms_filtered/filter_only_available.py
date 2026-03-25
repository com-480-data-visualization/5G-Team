#!/usr/bin/env python3
"""Filter room list by usage labels and availability query validity.

This script reads rooms in the format:
  ROOM_NAME: USAGE

It produces three text files:
1. Rooms kept after keyword filtering.
2. Rooms removed because availability query failed.
3. Final rooms kept after both filters.
"""

from __future__ import annotations

import argparse
import importlib.util
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any


# Add/remove keywords here as needed.
EXCLUDED_USAGE_KEYWORDS = [
	"LABO",
	"BUREAU",
	"GAINE TECHNIQUE",
	"STOCKAGE",
	"ESCALIER",
	"ALIM",
	"NETTOYAGE",
	"MONTE-CHARGES",
	"VENTILATION",
	"SANITAIRE",
	"WC",
	"DOUCHE",
	"VESTIAIRES",
	"HABITAT",
	"HALL",
	"ASCENSEUR",
	"ABRI",
	"REPROGRAPHIE",
	"GAZ-FLUIDES",
	"DECHETS",
	"HOTEL",
	"DEPOT",
	"CUISINE",
	"TECH DE COMM",
	"GALERIES TECH",
	"EAU",
	"CAFETERIA",
	"SPORT",
	"CHAMBRE NOIRE",
	"SALLE BLANCHE",
	"SALLE GRISE",
	"RADIOSCOPIES",
	"TECHNIQUES",
	"MAGASIN",
	"SECRETARIAT",
	"SERVEURS",
	"VEHICULES",
	"ATTENTE",
	"LOGEMENT",
	"CHAMBRE FROIDE",
	"SAS",
	"COMMUNAUTAIRES",
	"ATELIER",
	"VIDE TECHNIQUE",
	"RECEPTION",
	"ARCHIVES",
	"CHAUFFAGE",
	"INFIRMERIE",
	"DETENTE",
	"PHOTOS",
	"ACCUEIL",
	"DEGAGEMENT",
	"BIBLIOTHEQUE",
	"DEBARRAS",
	"REPOS",
	"RESTAURANT",
	"EXPO",
	"CONTROLE",
	"MEDICAL",
	"TRAV. SPECIAUX",
	"PARC EXT",
	"CULTURE",
	"HOSTDESK",
	"RAMPE",
	"CONGELATION",
	"VENTE",
	"AUMONERIE",
	"DESSIN",
	"SERVICE",
	"TEMP. CONTROLLEE",
	"CENTRALE TECHN",
	"PHYSIOTHERAPIES",
	"FOYER",
	"SURVEILLANCE",
	"ASC.INCLINE",
	"EXPEDITION",
	"ESSAIS",
	"BANQUE",
	"PARKING",
	"ESPACE FORUM"
]


def load_query_module(module_path: Path):
	spec = importlib.util.spec_from_file_location("query_occupancy", module_path)
	if spec is None or spec.loader is None:
		raise RuntimeError(f"Could not load module from {module_path}")

	module = importlib.util.module_from_spec(spec)
	sys.modules[spec.name] = module
	spec.loader.exec_module(module)
	return module


def parse_line(raw_line: str) -> tuple[str, str] | None:
	line = raw_line.strip()
	if not line:
		return None

	if ":" in line:
		room_raw, usage_raw = line.split(":", maxsplit=1)
		return room_raw.strip(), usage_raw.strip()

	# Keep odd lines but treat usage as unknown.
	return line, ""


def has_excluded_usage(usage: str) -> bool:
	usage_upper = usage.upper()
	return any(keyword.upper() in usage_upper for keyword in EXCLUDED_USAGE_KEYWORDS)


def check_room_availability(
	room_label: str,
	query_module: Any,
	timeout: float,
) -> tuple[bool, str | None]:
	room_id = query_module.normalize_room(room_label)

	try:
		# Query the past month for events
		end_time = datetime.now()
		start_time = end_time - timedelta(days=30)
		
		html = query_module.fetch_room_page(
			room_id, 
			timeout=timeout,
			start=start_time,
			end=end_time,
		)
		events = query_module.extract_events(html)
		if hasattr(query_module, "room_in_system_from_html"):
			if not query_module.room_in_system_from_html(html, events):
				return False, "room_not_in_ewa_system"
		return True, None
	except Exception as exc:  # noqa: BLE001
		return False, str(exc)


def main() -> int:
	parser = argparse.ArgumentParser(description="Filter rooms_all.txt")
	parser.add_argument(
		"--input",
		type=Path,
		default=Path("scraper/rooms_filtered/rooms_all.txt"),
		help="Input room list file",
	)
	parser.add_argument(
		"--output",
		type=Path,
		default=Path("scraper/rooms_filtered/rooms_all_final.txt"),
		help="Final output room list file",
	)
	parser.add_argument(
		"--keyword-output",
		type=Path,
		default=Path("scraper/rooms_filtered/rooms_after_keyword_filter.txt"),
		help="Output room list after keyword filtering",
	)
	parser.add_argument(
		"--removed-query-output",
		type=Path,
		default=Path("scraper/rooms_filtered/rooms_removed_by_query_errors.txt"),
		help="Output room list removed because query failed",
	)
	parser.add_argument(
		"--query-module",
		type=Path,
		default=Path("room_occupancy/query_occupancy.py"),
		help="Path to occupancy query module",
	)
	parser.add_argument(
		"--timeout",
		type=float,
		default=10.0,
		help="HTTP timeout per room query in seconds",
	)
	parser.add_argument(
		"--workers",
		type=int,
		default=16,
		help="Number of concurrent checks",
	)
	parser.add_argument(
		"--skip-availability-check",
		action="store_true",
		help="Only apply usage keyword filtering",
	)
	parser.add_argument(
		"--limit",
		type=int,
		default=0,
		help="Optional cap on processed rooms for testing (0 means all)",
	)
	args = parser.parse_args()

	if not args.input.exists():
		print(f"Error: input file not found: {args.input}", file=sys.stderr)
		return 2

	parsed_entries: list[tuple[str, str, str]] = []
	for raw in args.input.read_text(encoding="utf-8").splitlines():
		parsed = parse_line(raw)
		if not parsed:
			continue
		room_label, usage = parsed
		parsed_entries.append((raw, room_label, usage))

	usage_filtered: list[tuple[str, str, str]] = []
	removed_usage: list[dict[str, str]] = []

	for raw, room_label, usage in parsed_entries:
		if has_excluded_usage(usage):
			removed_usage.append({"line": raw, "reason": "excluded_usage"})
			continue
		usage_filtered.append((raw, room_label, usage))

	if args.limit > 0:
		usage_filtered = usage_filtered[: args.limit]

	args.keyword_output.write_text(
		"\n".join(raw for raw, _, _ in usage_filtered) + ("\n" if usage_filtered else ""),
		encoding="utf-8",
	)

	if args.skip_availability_check:
		kept_lines = [raw for raw, _, _ in usage_filtered]
		removed_query_lines: list[str] = []
	else:
		query_module = load_query_module(args.query_module)

		kept_lines = []
		removed_query_lines = []

		keep_flags = [False] * len(usage_filtered)

		with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
			futures = {
				executor.submit(
					check_room_availability,
					room_label,
					query_module,
					args.timeout,
				): (idx, raw, room_label)
				for idx, (raw, room_label, _) in enumerate(usage_filtered)
			}

			for idx, future in enumerate(as_completed(futures), start=1):
				original_idx, raw, room_label = futures[future]
				ok, error = future.result()
				if ok:
					keep_flags[original_idx] = True
				else:
					removed_query_lines.append(f"{raw}\t# query_failed: {error or 'unknown error'}")

				if idx % 500 == 0:
					print(f"Progress: checked {idx}/{len(futures)} rooms")

		kept_lines = [
			raw
			for idx, (raw, _, _) in enumerate(usage_filtered)
			if keep_flags[idx]
		]

	ordered_kept_lines = kept_lines

	args.output.write_text("\n".join(ordered_kept_lines) + "\n", encoding="utf-8")
	args.removed_query_output.write_text(
		"\n".join(removed_query_lines) + ("\n" if removed_query_lines else ""),
		encoding="utf-8",
	)

	print(f"Input lines: {len(parsed_entries)}")
	print(f"Removed by usage: {len(removed_usage)}")
	print(f"After keyword filtering: {len(usage_filtered)}")
	print(f"Removed by query: {len(removed_query_lines)}")
	print(f"Kept lines: {len(ordered_kept_lines)}")
	print(f"Keyword-filter output: {args.keyword_output}")
	print(f"Query-error output: {args.removed_query_output}")
	print(f"Final output: {args.output}")
	return 0


if __name__ == "__main__":
	raise SystemExit(main())
