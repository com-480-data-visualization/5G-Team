// Create the Leaflet map immediately, but start from a neutral world view.
// Once the EPFL building bounds are loaded, the map will fit to them automatically.
const map = L.map("map", {
  zoomControl: true,
  scrollWheelZoom: true,
}).setView([0, 0], 2);

// Add the OpenStreetMap tile layer, which is the visible base map.
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

// GeoJSON layer reference so we can redraw the building polygons after loading data.
let buildingLayer;

// Cache key used to avoid refetching the same OSM bounds on every page reload.
const osmCacheKey = "epfl-building-bounds-v1";

// Central helper for updating the feedback banner under the search controls.
function setStatus(message) {
  document.getElementById("statusBanner").textContent = message;
}

// Deterministic number from a building name.
// We still use synthetic availability scores, but geometry now comes from your JSON/OSM ids.
function hashCode(text) {
  return [...text].reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 1), 0);
}

// Generate a stable demo score and room count for a building.
function buildAvailability(name) {
  const hash = hashCode(name);
  const score = 0.2 + (hash % 70) / 100;
  const rooms = 1 + (hash % 6);
  return { score, rooms };
}

// Convert a 0..1 availability score into a fill color.
function getColor(score) {
  if (score > 0.8) return "#8ef2c6";
  if (score > 0.6) return "#6ac0df";
  if (score > 0.4) return "#4b82d9";
  return "#2f4f85";
}

// Slightly different border color so the polygons stay visible on the map.
function getBorderColor(score) {
  if (score > 0.8) return "#d7fff0";
  if (score > 0.6) return "#a6edff";
  if (score > 0.4) return "#87a8ff";
  return "#62749d";
}

// Parse a URL like https://www.openstreetmap.org/way/30334086 into type + numeric id.
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

// Convert bounds into a GeoJSON rectangle polygon.
// OSM bounds use minlat/minlon/maxlat/maxlon.
function boundsToPolygon(bounds) {
  return [
    [
      [bounds.minlon, bounds.minlat],
      [bounds.maxlon, bounds.minlat],
      [bounds.maxlon, bounds.maxlat],
      [bounds.minlon, bounds.maxlat],
      [bounds.minlon, bounds.minlat],
    ],
  ];
}

// Compute bounds from a list of node coordinates when the OSM element does not expose them directly.
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

// Some JSON exports may already include the bounds directly.
// Accept a few common field names to keep the frontend flexible.
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

// Fetch OSM details for a way/relation and derive a bounding box from the response.
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

  // Ways can be reconstructed from their node ids.
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

  // Relations may be composed of ways; gather all member nodes to derive the bounds.
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

// Resolve building bounds from local JSON first, then from cached OSM fetches, then from the live OSM API.
async function resolveBuildingBounds(record, cache) {
  const localBounds = extractLocalBounds(record);

  if (localBounds) {
    return localBounds;
  }

  if (cache[record.id]) {
    return cache[record.id];
  }

  const bounds = await fetchBoundsFromOSM(record.id);

  if (bounds) {
    cache[record.id] = bounds;
  }

  return bounds;
}

// Convert the JSON file records into the GeoJSON features expected by Leaflet.
async function buildFeaturesFromRecords(records) {
  const cache = readBoundsCache();
  const features = [];

  for (const record of records) {
    const bounds = await resolveBuildingBounds(record, cache);

    if (!bounds) {
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
      geometry: {
        type: "Polygon",
        coordinates: boundsToPolygon(bounds),
      },
    });
  }

  writeBoundsCache(cache);
  return features;
}

// Returns a style object for each building polygon.
function styleFeature(feature) {
  const { score } = feature.properties;

  return {
    color: getBorderColor(score),
    weight: 1.2,
    fillColor: getColor(score),
    fillOpacity: 0.42,
  };
}

// Attach interactivity to each GeoJSON feature as Leaflet adds it to the map.
function onEachFeature(feature, layer) {
  const { name, rooms, score, id } = feature.properties;

  layer.bindPopup(`
    <div class="room-popup">
      <h4>${name}</h4>
      <p>Mock availability score: ${Math.round(score * 100)}%</p>
      <p>Estimated free rooms: ${rooms}</p>
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
    setStatus(
      `Selected building ${name}. Bounding box comes from your EPFL OSM id dataset${feature.properties.bounds ? "" : ""}.`
    );
  });
}

// Draw all building polygons on the map and update the side summary.
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

// Load the local building source file supplied in the project.
async function loadBuildingRecords() {
  const response = await fetch("./epfl_buildings.json");

  if (!response.ok) {
    throw new Error("Could not load epfl_buildings.json");
  }

  return response.json();
}

// Convert a JavaScript Date into the exact string format required by <input type="datetime-local">.
function toLocalInputValue(date) {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 16);
}

// Pre-fill the form so the page opens with meaningful example values.
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

// Intercept normal form submission so the page does not reload.
// For now we only echo the selected values back to the user.
document.getElementById("availability-form").addEventListener("submit", (event) => {
  event.preventDefault();

  const start = document.getElementById("startTime").value;
  const end = document.getElementById("endTime").value;
  const duration = document.getElementById("duration").value;

  setStatus(
    `Demo search saved: ${start || "no start"} to ${end || "no end"} for ${duration} minutes. Building shapes now come from epfl_buildings.json and OSM ids.`
  );
});

// Add click behavior for the preset range chips.
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
    setStatus(`Preset applied: ${button.textContent}. OSM-linked building bounds remain loaded on the map.`);
  });
});

// Boot sequence:
// 1. initialize the form
// 2. load the local building id file
// 3. resolve bounds from local JSON or OSM API
// 4. render the map polygons
async function initializeApp() {
  try {
    seedDefaultTimes();
    setStatus("Loading EPFL buildings from epfl_buildings.json and resolving OSM bounds...");

    const records = await loadBuildingRecords();
    const features = await buildFeaturesFromRecords(records);

    if (!features.length) {
      throw new Error("No building bounds could be resolved.");
    }

    renderBuildings(features);
    setStatus(
      `Loaded ${features.length} buildings from your EPFL dataset. Geometry now comes from the JSON ids and resolved OSM bounds, not from hardcoded campus coordinates.`
    );
  } catch (error) {
    console.error(error);
    setStatus(
      "Failed to load building bounds. Make sure you run the site through a local server and that epfl_buildings.json is present."
    );
  }
}

initializeApp();
