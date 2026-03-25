// Geographic center of the EPFL campus used to initialize the map view.
const epflCenter = [46.5191, 6.5668];

// Full list of EPFL building codes provided for the prototype.
// We use these identifiers as the labels for the synthetic building polygons.
const buildingCodes = [
  "PPH", "SPP", "BCH", "BC", "CSB", "GEN", "QIJ", "DLLEL", "FBC", "AAC", "PSEB",
  "AAB", "BIO_A", "CO", "ALO", "PS_QN", "FO", "SOS2", "GA", "QIG", "BAR", "SPN",
  "INJ", "MXF", "DIA", "BFFA", "ALP", "TRIH", "EXTRA", "H4", "TCV", "AST", "GO10",
  "BAF", "TRIE", "PO", "PSEL", "STF", "BAP", "B25A", "SF", "AN", "QIH", "ELL",
  "PH", "PSEC", "BAH", "AI", "INR", "GR", "INN", "MA", "SS", "ELG", "MXD", "AU",
  "ZD", "I17", "H8", "QIE", "STT", "QIF", "INF", "ELB", "LE", "ODY", "MED", "AAD",
  "B1", "TRIC", "ELH", "MXH", "SV", "ELA", "SKIL", "G6", "ECAL", "QIK", "SSH",
  "RLC", "BS", "QII", "INM", "ELE", "CM", "ART", "PPB", "CH", "PV", "VOR", "CCT",
  "GEO", "CE", "CSN", "CAPU", "PSEA", "QIO", "BM", "QIN", "ELD", "ZP", "BAC", "BP",
  "HBL", "CSV", "I23", "SAUV", "CRR", "I19", "CSS", "CL", "VR15", "SCT", "BSP",
  "STCC", "MC", "JORD", "ME", "NH", "MXC", "CP1", "MXG", "BI", "SG", "PSED", "GC",
  "MXE", "ZC", "SOS1", "B3",
];

// A few recognisable building anchors are manually placed near plausible locations.
// This makes the map feel less arbitrary for known campus landmarks.
const anchoredCenters = {
  RLC: [46.51867, 6.56611],
  BC: [46.5202, 6.5682],
  CO: [46.5214, 6.5652],
  INM: [46.5181, 6.5695],
  MA: [46.5171, 6.5645],
  CM: [46.5162, 6.5678],
  CE: [46.5210, 6.5702],
  SV: [46.5178, 6.5712],
  PH: [46.5206, 6.5638],
  MX: [46.5198, 6.5628],
};

// Approximate campus area used to place synthetic building polygons.
// The boxes are placeholders until real building geometry is connected.
const campusBounds = {
  minLat: 46.5157,
  maxLat: 46.5226,
  minLng: 6.5616,
  maxLng: 6.5727,
};

// Create the Leaflet map inside <div id="map"> and center it on EPFL.
const map = L.map("map", {
  zoomControl: true,
  scrollWheelZoom: true,
}).setView(epflCenter, 16);

// Add the OpenStreetMap tile layer, which is the visible base map.
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

// GeoJSON layer reference so we can clear and redraw the building polygons.
let buildingLayer;

// Deterministic number from a building code.
// This avoids true randomness and gives stable shapes on every reload.
function hashCode(code) {
  return [...code].reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 1), 0);
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

// Generate a stable score and room count for demo purposes.
function buildAvailability(code) {
  const hash = hashCode(code);
  const score = 0.2 + (hash % 70) / 100;
  const rooms = 1 + (hash % 6);
  return { score, rooms };
}

// Create a simple rectangular polygon from a center point.
// Leaflet's L.geoJSON understands standard GeoJSON polygon coordinates.
function makeBoxPolygon(center, halfHeight, halfWidth) {
  const [lat, lng] = center;

  return [
    [
      [lng - halfWidth, lat - halfHeight],
      [lng + halfWidth, lat - halfHeight],
      [lng + halfWidth, lat + halfHeight],
      [lng - halfWidth, lat + halfHeight],
      [lng - halfWidth, lat - halfHeight],
    ],
  ];
}

// If a building is not manually anchored, place it on a dense campus grid.
function generateGridCenter(code, fallbackIndex) {
  const hash = hashCode(code);
  const columns = 12;
  const col = fallbackIndex % columns;
  const row = Math.floor(fallbackIndex / columns);
  const latStep = 0.00058;
  const lngStep = 0.00078;
  const latJitter = ((hash % 7) - 3) * 0.00005;
  const lngJitter = ((Math.floor(hash / 7) % 7) - 3) * 0.00005;

  const lat = campusBounds.maxLat - row * latStep + latJitter;
  const lng = campusBounds.minLng + col * lngStep + lngJitter;

  return [lat, lng];
}

// Turn the building code list into a GeoJSON feature collection.
function generateBuildingsGeoJSON() {
  let fallbackIndex = 0;

  const features = buildingCodes.map((code) => {
    const center = anchoredCenters[code] || generateGridCenter(code, fallbackIndex++);
    const hash = hashCode(code);
    const { score, rooms } = buildAvailability(code);

    // Vary box sizes slightly so the map feels less uniform.
    const halfHeight = 0.00011 + (hash % 4) * 0.000025;
    const halfWidth = 0.00014 + (Math.floor(hash / 5) % 4) * 0.00003;

    return {
      type: "Feature",
      properties: {
        name: code,
        rooms,
        score,
      },
      geometry: {
        type: "Polygon",
        coordinates: makeBoxPolygon(center, halfHeight, halfWidth),
      },
    };
  });

  return {
    type: "FeatureCollection",
    features,
  };
}

// Shared building dataset used by the GeoJSON layer.
const buildingsData = generateBuildingsGeoJSON();

// Central helper for updating the feedback banner under the search controls.
function setStatus(message) {
  document.getElementById("statusBanner").textContent = message;
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

// This mirrors the Leaflet pattern you shared:
// each feature gets event handlers as it is added to the layer.
function onEachFeature(feature, layer) {
  const { name, rooms, score } = feature.properties;

  layer.bindPopup(`
    <div class="room-popup">
      <h4>${name}</h4>
      <p>Mock availability score: ${Math.round(score * 100)}%</p>
      <p>Estimated free rooms: ${rooms}</p>
      <p>Click to focus this building.</p>
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
    // A static prototype does not have real /buildings/:name pages yet,
    // so clicking updates the UI instead of navigating to a broken route.
    setStatus(
      `Selected building ${name}. Demo availability: ${rooms} rooms, ${Math.round(score * 100)}% score. This will later open a building-specific view.`
    );
  });
}

// Draw all building polygons on the map and update the side summary.
function renderBuildings() {
  if (buildingLayer) {
    map.removeLayer(buildingLayer);
  }

  buildingLayer = L.geoJSON(buildingsData, {
    style: styleFeature,
    onEachFeature,
  }).addTo(map);

  const bestBuilding = buildingsData.features.reduce((best, current) => {
    return current.properties.score > best.properties.score ? current : best;
  });

  const totalRooms = buildingsData.features.reduce((sum, feature) => {
    return sum + feature.properties.rooms;
  }, 0);

  document.getElementById("visibleRooms").textContent = buildingsData.features.length;
  document.getElementById("bestZone").textContent = bestBuilding.properties.name;

  setStatus(
    `Showing ${buildingsData.features.length} synthetic building boxes over EPFL. They use demo availability data and are ready to be replaced with real geometry.`
  );

  // Fit the map to the generated buildings with a little padding.
  map.fitBounds(buildingLayer.getBounds(), { padding: [24, 24] });

  // Keep the total room count available in the legend title tooltip.
  document.getElementById("visibleRooms").title = `${totalRooms} mocked free rooms across all buildings`;
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

  // Round to the next whole hour to make the inputs cleaner.
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);

  // Default search window spans two hours.
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
    `Demo search saved: ${start || "no start"} to ${end || "no end"} for ${duration} minutes. The map shows building boxes, but live availability is not connected yet.`
  );
});

// Add click behavior for the preset range chips.
// Each button exposes its mode through a data-range attribute in the HTML.
document.querySelectorAll(".shortcut-chip").forEach((button) => {
  button.addEventListener("click", () => {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);
    const range = button.dataset.range;

    // Each branch assigns a different example time window.
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

    // Push the computed dates into the form inputs.
    document.getElementById("startTime").value = toLocalInputValue(start);
    document.getElementById("endTime").value = toLocalInputValue(end);
    setStatus(`Preset applied: ${button.textContent}. Building boxes still use mocked availability data.`);
  });
});

// Boot sequence: initialize the form first, then paint the building polygons.
seedDefaultTimes();
renderBuildings();
