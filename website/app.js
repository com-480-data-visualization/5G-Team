const map = L.map("map", {
  zoomControl: true,
  scrollWheelZoom: true,
}).setView([0, 0], 2);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

let buildingLayer;

const osmCacheKey = "epfl-building-geometry-v2";
const timelineHours = Array.from({ length: 24 }, (_, hour) => hour);

const buildingPanel = document.getElementById("buildingPanel");
const buildingPanelTitle = document.getElementById("buildingPanelTitle");
const buildingPanelCopy = document.getElementById("buildingPanelCopy");
const buildingMeta = document.getElementById("buildingMeta");
const timelineHeader = document.getElementById("timelineHeader");
const timelineBody = document.getElementById("timelineBody");
const closeBuildingPanel = document.getElementById("closeBuildingPanel");

let roomsDataset = [];
let occupancyByRoom = new Map();

function setStatus(message) {
  document.getElementById("statusBanner").textContent = message;
}

function hashCode(text) {
  return [...text].reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 1), 0);
}

function buildAvailability(name) {
  const hash = hashCode(name);
  const score = 0.2 + (hash % 70) / 100;
  const rooms = 1 + (hash % 6);
  return { score, rooms };
}

function getColor(score) {
  if (score > 0.8) return "#8ef2c6";
  if (score > 0.6) return "#6ac0df";
  if (score > 0.4) return "#4b82d9";
  return "#2f4f85";
}

function getBorderColor(score) {
  if (score > 0.8) return "#d7fff0";
  if (score > 0.6) return "#a6edff";
  if (score > 0.4) return "#87a8ff";
  return "#62749d";
}

function parseOSMReference(url) {
  const match = url.match(/openstreetmap\.org\/(way|relation|node)\/(\d+)/);

  if (!match) {
    throw new Error(`Unsupported OSM id format: ${url}`);
  }

  return {
    type: match[1],
    id: match[2],
  };
}

function computeBoundsFromCoordinates(coords) {
  if (!coords.length) {
    return null;
  }

  return coords.reduce(
    (acc, [lat, lon]) => ({
      minlat: Math.min(acc.minlat, lat),
      maxlat: Math.max(acc.maxlat, lat),
      minlon: Math.min(acc.minlon, lon),
      maxlon: Math.max(acc.maxlon, lon),
    }),
    {
      minlat: Infinity,
      maxlat: -Infinity,
      minlon: Infinity,
      maxlon: -Infinity,
    }
  );
}

function extractLocalBounds(record) {
  if (record.bounds) return record.bounds;
  if (record.bounding_box) return record.bounding_box;
  if (record.bbox) {
    const bbox = record.bbox;

    if (Array.isArray(bbox) && bbox.length === 4) {
      return {
        minlon: Number(bbox[0]),
        minlat: Number(bbox[1]),
        maxlon: Number(bbox[2]),
        maxlat: Number(bbox[3]),
      };
    }

    return bbox;
  }

  return null;
}

function extractLocalGeometry(record) {
  if (record.geometry?.type && record.geometry?.coordinates) {
    return record.geometry;
  }

  if (record.geojson?.type && record.geojson?.coordinates) {
    return record.geojson;
  }

  return null;
}

function readBoundsCache() {
  try {
    return JSON.parse(localStorage.getItem(osmCacheKey) || "{}");
  } catch {
    return {};
  }
}

function writeBoundsCache(cache) {
  localStorage.setItem(osmCacheKey, JSON.stringify(cache));
}

async function fetchBoundsFromOSM(osmUrl) {
  const ref = parseOSMReference(osmUrl);
  const response = await fetch(`https://www.openstreetmap.org/api/0.6/${ref.type}/${ref.id}/full.json`);

  if (!response.ok) {
    throw new Error(`OSM request failed for ${ref.type}/${ref.id}`);
  }

  const data = await response.json();
  const targetElement = data.elements.find(
    (element) => element.type === ref.type && String(element.id) === ref.id
  );

  if (targetElement?.bounds) {
    return targetElement.bounds;
  }

  if (ref.type === "way" && targetElement?.nodes) {
    const nodeMap = new Map(
      data.elements
        .filter((element) => element.type === "node")
        .map((node) => [String(node.id), [node.lat, node.lon]])
    );

    const coords = targetElement.nodes
      .map((nodeId) => nodeMap.get(String(nodeId)))
      .filter(Boolean);

    return computeBoundsFromCoordinates(coords);
  }

  if (ref.type === "relation" && targetElement?.members) {
    const memberWayIds = new Set(
      targetElement.members
        .filter((member) => member.type === "way")
        .map((member) => String(member.ref))
    );

    const nodeMap = new Map(
      data.elements
        .filter((element) => element.type === "node")
        .map((node) => [String(node.id), [node.lat, node.lon]])
    );

    const coords = data.elements
      .filter((element) => element.type === "way" && memberWayIds.has(String(element.id)))
      .flatMap((way) => way.nodes.map((nodeId) => nodeMap.get(String(nodeId))))
      .filter(Boolean);

    return computeBoundsFromCoordinates(coords);
  }

  return null;
}

function boundsFromGeometry(geometry) {
  const coords = [];

  if (geometry.type === "Polygon") {
    geometry.coordinates.flat().forEach((pair) => coords.push([pair[1], pair[0]]));
  } else if (geometry.type === "MultiPolygon") {
    geometry.coordinates.flat(2).forEach((pair) => coords.push([pair[1], pair[0]]));
  }

  return computeBoundsFromCoordinates(coords);
}

async function fetchGeometryFromOSM(osmUrl) {
  const ref = parseOSMReference(osmUrl);
  const response = await fetch(`https://www.openstreetmap.org/api/0.6/${ref.type}/${ref.id}/full.json`);

  if (!response.ok) {
    throw new Error(`OSM request failed for ${ref.type}/${ref.id}`);
  }

  const data = await response.json();
  const featureCollection = osmtogeojson(data);
  const targetFeature = featureCollection.features.find((feature) => {
    const featureId = String(feature.id || "");
    return (
      featureId === `${ref.type}/${ref.id}` ||
      featureId === `${ref.type[0]}/${ref.id}` ||
      String(feature.properties?.id || "") === ref.id
    );
  });

  if (targetFeature?.geometry) {
    return targetFeature.geometry;
  }

  return null;
}

async function resolveBuildingGeometry(record, cache) {
  const localGeometry = extractLocalGeometry(record);

  if (localGeometry) {
    return localGeometry;
  }

  if (cache[record.id]?.geometry) {
    return cache[record.id].geometry;
  }

  const geometry = await fetchGeometryFromOSM(record.id);

  if (geometry) {
    cache[record.id] = {
      geometry,
      bounds: boundsFromGeometry(geometry),
    };
  }

  return geometry;
}

async function resolveBuildingBounds(record, cache) {
  const localBounds = extractLocalBounds(record);

  if (localBounds) {
    return localBounds;
  }

  if (cache[record.id]?.bounds) {
    return cache[record.id].bounds;
  }

  const geometry = await resolveBuildingGeometry(record, cache);
  const bounds = geometry ? boundsFromGeometry(geometry) : await fetchBoundsFromOSM(record.id);

  if (bounds) {
    cache[record.id] = {
      ...cache[record.id],
      bounds,
    };
  }

  return bounds;
}

async function buildFeaturesFromRecords(records) {
  const cache = readBoundsCache();
  const features = [];

  for (const record of records) {
    const geometry = await resolveBuildingGeometry(record, cache);
    const bounds = geometry
      ? boundsFromGeometry(geometry)
      : await resolveBuildingBounds(record, cache);

    if (!geometry && !bounds) {
      continue;
    }

    const name = record.properties?.name || "Unknown";
    const { score, rooms } = buildAvailability(name);

    features.push({
      type: "Feature",
      properties: {
        name,
        id: record.id,
        rooms,
        score,
        bounds,
      },
      geometry: geometry || {
        type: "Polygon",
        coordinates: [
          [
            [bounds.minlon, bounds.minlat],
            [bounds.maxlon, bounds.minlat],
            [bounds.maxlon, bounds.maxlat],
            [bounds.minlon, bounds.maxlat],
            [bounds.minlon, bounds.minlat],
          ],
        ],
      },
    });
  }

  writeBoundsCache(cache);
  return features;
}

function styleFeature(feature) {
  const { score } = feature.properties;

  return {
    color: getBorderColor(score),
    weight: 1.2,
    fillColor: getColor(score),
    fillOpacity: 0.42,
  };
}

function normalizeBuildingCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function roomBelongsToBuilding(roomName, buildingCode) {
  const normalizedRoom = normalizeBuildingCode(roomName);
  const normalizedBuilding = normalizeBuildingCode(buildingCode);

  if (!normalizedRoom || !normalizedBuilding) {
    return false;
  }

  if (normalizedBuilding === "RLC") {
    return normalizedRoom.startsWith("RLC");
  }

  if (normalizedBuilding.startsWith("CH") && normalizedBuilding.length === 3) {
    const spacedCode = `${normalizedBuilding.slice(0, 2)} ${normalizedBuilding.slice(2)}`;
    return String(roomName || "").toUpperCase().startsWith(spacedCode);
  }

  if (normalizedBuilding.startsWith("PH") && normalizedBuilding.length === 3) {
    const spacedCode = `${normalizedBuilding.slice(0, 2)} ${normalizedBuilding.slice(2)}`;
    return String(roomName || "").toUpperCase().startsWith(spacedCode);
  }

  if (normalizedBuilding.startsWith("MA") && normalizedBuilding.length === 3) {
    const spacedCode = `${normalizedBuilding.slice(0, 2)} ${normalizedBuilding.slice(2)}`;
    return String(roomName || "").toUpperCase().startsWith(spacedCode);
  }

  return normalizedRoom.startsWith(normalizedBuilding);
}

function getRoomsForBuilding(buildingCode) {
  return roomsDataset
    .filter((entry) => Array.isArray(entry) && entry.length >= 2)
    .map(([room, type]) => ({ room, type }))
    .filter((entry) => roomBelongsToBuilding(entry.room, buildingCode));
}

function formatHour(hour) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function createTimelineGrid(isHeader = false) {
  const grid = document.createElement("div");
  grid.className = `timeline-grid${isHeader ? " timeline-hours" : ""}`;

  timelineHours.forEach((hour) => {
    const cell = document.createElement("div");
    cell.className = isHeader ? "timeline-hour" : "timeline-slot";
    cell.textContent = isHeader ? formatHour(hour) : "";
    grid.appendChild(cell);
  });

  return grid;
}

function getDayStart() {
  return new Date("2026-03-24T00:00:00");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function minutesSinceDayStart(isoString) {
  const date = new Date(isoString);
  return Math.round((date.getTime() - getDayStart().getTime()) / 60000);
}

function getRoomSlots(roomName) {
  return occupancyByRoom.get(roomName) || [];
}

function addOccupancySegments(grid, roomName) {
  const slots = getRoomSlots(roomName);

  if (!slots.length) {
    const emptyState = document.createElement("div");
    emptyState.className = "timeline-empty-state";
    emptyState.textContent = "No occupancy data yet";
    grid.appendChild(emptyState);
    return;
  }

  slots.forEach((slot) => {
    const [startIso, endIso] = slot;
    const startMinutes = clamp(minutesSinceDayStart(startIso), 0, 24 * 60);
    const endMinutes = clamp(minutesSinceDayStart(endIso), 0, 24 * 60);

    if (endMinutes <= startMinutes) {
      return;
    }

    const segment = document.createElement("div");
    segment.className = "timeline-segment timeline-segment-occupied";
    segment.style.left = `${(startMinutes / (24 * 60)) * 100}%`;
    segment.style.width = `${((endMinutes - startMinutes) / (24 * 60)) * 100}%`;
    segment.title = `${startIso.slice(11, 16)} - ${endIso.slice(11, 16)}`;
    grid.appendChild(segment);
  });
}

function createTimelineScroll(isHeader = false) {
  const scroll = document.createElement("div");
  scroll.className = "timeline-scroll";
  scroll.appendChild(createTimelineGrid(isHeader));
  return scroll;
}

function syncTimelineScroll(scrollElements) {
  scrollElements.forEach((element) => {
    element.addEventListener("scroll", () => {
      scrollElements.forEach((other) => {
        if (other !== element) {
          other.scrollLeft = element.scrollLeft;
        }
      });
    });
  });
}

function openBuildingPanel(buildingCode, rooms) {
  buildingPanel.classList.remove("is-empty");
  buildingPanelTitle.textContent = buildingCode;
  buildingPanelCopy.textContent =
    "Prototype timeline for one full day. The empty track is ready for future availability data; horizontally scroll to inspect the rest of the day.";

  const roomCount = rooms.length;

  buildingMeta.innerHTML = "";
  [
    `${roomCount} room${roomCount === 1 ? "" : "s"} found`,
    roomCount ? "Showing all matching rooms" : "No room found",
    "Day view, empty availability",
  ].forEach((label) => {
    const chip = document.createElement("span");
    chip.textContent = label;
    buildingMeta.appendChild(chip);
  });

  timelineHeader.innerHTML = "";
  timelineBody.innerHTML = "";

  const headerLabel = document.createElement("div");
  headerLabel.textContent = "Room";
  const headerScroll = createTimelineScroll(true);
  timelineHeader.append(headerLabel, headerScroll);

  const scrollElements = [headerScroll];
  const visibleRooms = rooms.length ? rooms : [{ room: "No room found", type: "No matching room name in rooms.json" }];

  visibleRooms.forEach((roomEntry) => {
    const row = document.createElement("div");
    row.className = "timeline-row";

    const rowLabel = document.createElement("div");
    rowLabel.className = "timeline-room-label";
    rowLabel.innerHTML = `<strong>${roomEntry.room}</strong><span>${roomEntry.type}</span>`;

    const rowScroll = createTimelineScroll(false);
    addOccupancySegments(rowScroll.firstChild, roomEntry.room);

    row.append(rowLabel, rowScroll);
    timelineBody.appendChild(row);
    scrollElements.push(rowScroll);
  });

  syncTimelineScroll(scrollElements);
}

function resetBuildingPanel() {
  buildingPanel.classList.add("is-empty");
  buildingPanelTitle.textContent = "Select a building";
  buildingPanelCopy.textContent =
    "Click a building on the map to inspect its rooms. For now, the panel shows the first matching room and an empty one-day timeline.";
  buildingMeta.innerHTML = "<span>No building selected yet</span>";
  timelineHeader.innerHTML = "";
  timelineBody.innerHTML = "";
}

closeBuildingPanel.addEventListener("click", () => {
  resetBuildingPanel();
});

function onEachFeature(feature, layer) {
  const { name, score, id } = feature.properties;

  layer.bindPopup(`
    <div class="room-popup">
      <h4>${name}</h4>
      <p>Mock availability score: ${Math.round(score * 100)}%</p>
      <p><a href="${id}" target="_blank" rel="noreferrer">Open in OpenStreetMap</a></p>
    </div>
  `);

  layer.on("mouseover", () => {
    layer.setStyle({
      weight: 2,
      fillOpacity: 0.62,
    });
  });

  layer.on("mouseout", () => {
    buildingLayer.resetStyle(layer);
  });

  layer.on("click", () => {
    const rooms = getRoomsForBuilding(name);
    openBuildingPanel(name, rooms);
    setStatus(
      `Selected building ${name}. Showing the first matching room on an empty day timeline.`
    );
  });
}

function renderBuildings(features) {
  if (buildingLayer) {
    map.removeLayer(buildingLayer);
  }

  buildingLayer = L.geoJSON(
    {
      type: "FeatureCollection",
      features,
    },
    {
      style: styleFeature,
      onEachFeature,
    }
  ).addTo(map);

  const bestBuilding = features.reduce((best, current) => {
    return current.properties.score > best.properties.score ? current : best;
  });

  const totalRooms = features.reduce((sum, feature) => {
    return sum + feature.properties.rooms;
  }, 0);

  document.getElementById("visibleRooms").textContent = features.length;
  document.getElementById("bestZone").textContent = bestBuilding.properties.name;
  document.getElementById("visibleRooms").title = `${totalRooms} mocked free rooms across all loaded buildings`;

  map.fitBounds(buildingLayer.getBounds(), { padding: [24, 24] });
}

async function loadBuildingRecords() {
  const response = await fetch("./epfl_buildings.json");

  if (!response.ok) {
    throw new Error("Could not load epfl_buildings.json");
  }

  return response.json();
}

async function loadRoomsDataset() {
  const response = await fetch("./rooms.json");

  if (!response.ok) {
    throw new Error("Could not load rooms.json");
  }

  return response.json();
}

async function loadRoomOccupancyDataset() {
  const response = await fetch("./room_occupancy.json");

  if (!response.ok) {
    throw new Error("Could not load room_occupancy.json");
  }

  return response.json();
}

function indexOccupancyByRoom(entries) {
  const indexed = new Map();

  entries.forEach((entry) => {
    const roomName = entry?.name?.[0];

    if (!roomName) {
      return;
    }

    const slots = Array.isArray(entry.slots)
      ? entry.slots.filter((slot) => Array.isArray(slot) && slot.length === 2)
      : [];
    indexed.set(roomName, slots);
  });

  return indexed;
}

function toLocalInputValue(date) {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 16);
}

function seedDefaultTimes() {
  const now = new Date();
  const start = new Date(now);

  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);

  const end = new Date(start);
  end.setHours(end.getHours() + 2);

  document.getElementById("startTime").value = toLocalInputValue(start);
  document.getElementById("endTime").value = toLocalInputValue(end);
}

document.getElementById("availability-form").addEventListener("submit", (event) => {
  event.preventDefault();

  const start = document.getElementById("startTime").value;
  const end = document.getElementById("endTime").value;
  const duration = document.getElementById("duration").value;

  setStatus(
    `Demo search saved: ${start || "no start"} to ${end || "no end"} for ${duration} minutes. Building shapes and room timelines are still using static placeholder data.`
  );
});

document.querySelectorAll(".shortcut-chip").forEach((button) => {
  button.addEventListener("click", () => {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);
    const range = button.dataset.range;

    if (range === "today") {
      start.setHours(14, 0, 0, 0);
      end.setHours(17, 0, 0, 0);
    } else if (range === "tomorrow") {
      start.setDate(start.getDate() + 1);
      end.setDate(end.getDate() + 1);
      start.setHours(9, 0, 0, 0);
      end.setHours(12, 0, 0, 0);
    } else {
      start.setDate(start.getDate() + 2);
      end.setDate(end.getDate() + 7);
      start.setHours(10, 0, 0, 0);
      end.setHours(18, 0, 0, 0);
    }

    document.getElementById("startTime").value = toLocalInputValue(start);
    document.getElementById("endTime").value = toLocalInputValue(end);
    setStatus(`Preset applied: ${button.textContent}. Timeline view remains empty until occupancy data is connected.`);
  });
});

async function initializeApp() {
  try {
    seedDefaultTimes();
    resetBuildingPanel();
    setStatus("Loading EPFL buildings and room list...");

    const [records, rooms, occupancy] = await Promise.all([
      loadBuildingRecords(),
      loadRoomsDataset(),
      loadRoomOccupancyDataset(),
    ]);
    roomsDataset = rooms;
    occupancyByRoom = indexOccupancyByRoom(occupancy);

    const features = await buildFeaturesFromRecords(records);

    if (!features.length) {
      throw new Error("No building bounds could be resolved.");
    }

    renderBuildings(features);
    setStatus(
      `Loaded ${features.length} buildings, ${roomsDataset.length} rooms, and synthesized occupancy data. Click a building to open its room timeline panel.`
    );
  } catch (error) {
    console.error(error);
    setStatus(
      "Failed to load building, room, or occupancy data. Make sure you run the site through a local server and that epfl_buildings.json, rooms.json, and room_occupancy.json are present."
    );
  }
}

initializeApp();
