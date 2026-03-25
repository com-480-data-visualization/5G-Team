# extract the buildings from rooms.json, the buildings are the first alphabetical part of the room code, e.g. "BC" from "BC 123"
import json
with open("scraper/rooms.json", "r") as f:
    rooms = json.load(f)

buildings = set()
for room in rooms:
    building = room[0].split()[0]
    buildings.add(building)

with open("scraper/buildings/buildings.json", "w") as f:
    json.dump(list(buildings), f)   
