import requests
import xml.etree.ElementTree as ET
import json

URL = (
    "https://plan.epfl.ch/mapserv_proxy?"
    "ogcserver=MapServer&"
    "SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&"
    "TYPENAME=feature:batiments_query"
)
NS = {"ms": "http://mapserver.gis.umn.edu/mapserver"}


rooms = []

response = requests.get(URL, timeout=30)
response.raise_for_status()
root = ET.fromstring(response.content)

for feature in root.findall(".//ms:batiments_query", NS):
    room_name = feature.find("ms:room_abr", NS)
    usage = feature.find("ms:room_uti_a", NS)

    if room_name is not None and room_name.text and usage is not None and usage.text:
        rooms.append((room_name.text, usage.text))

with open("scraper/rooms.txt", "w") as file_handle:
    for room_name, usage in rooms:
        file_handle.write(f"{room_name}: {usage}\n")

with open("scraper/rooms.json", "w") as json_file:
    json.dump(rooms, json_file, indent=4)

print(f"Total rooms: {len(rooms)}")