import json
from pathlib import Path
import xml.etree.ElementTree as ET

import requests

URL = (
    "https://plan.epfl.ch/mapserv_proxy?"
    "ogcserver=MapServer&"
    "SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&"
    "TYPENAME=feature:batiments_query"
)
NS = {"ms": "http://mapserver.gis.umn.edu/mapserver"}
OUTPUT_DIR = Path(__file__).resolve().parent
TEXT_OUTPUT = OUTPUT_DIR / "rooms.txt"
JSON_OUTPUT = OUTPUT_DIR / "rooms.json"


rooms = []

response = requests.get(URL, timeout=30)
response.raise_for_status()
root = ET.fromstring(response.content)

for feature in root.findall(".//ms:batiments_query", NS):
    room_name = feature.find("ms:room_abr", NS)
    usage = feature.find("ms:room_uti_a", NS)

    # Keep the raw room identifier exactly as EPFL exposes it.
    # The building extractor depends on this full value to distinguish
    # cases like "XY Z1 123" from plain "XY 123".
    if room_name is not None and room_name.text and usage is not None and usage.text:
        rooms.append((room_name.text, usage.text))

with TEXT_OUTPUT.open("w", encoding="utf-8") as file_handle:
    for room_name, usage in rooms:
        file_handle.write(f"{room_name}: {usage}\n")

with JSON_OUTPUT.open("w", encoding="utf-8") as json_file:
    json.dump(rooms, json_file, indent=4)

print(f"Total rooms: {len(rooms)}")
