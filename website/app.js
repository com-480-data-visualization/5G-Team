// Create the Leaflet map immediately.
// We start zoomed out, then fit the viewport to the EPFL building footprints
// once the geometry has been loaded.
const map = L.map("map", {
  zoomControl: true,
  scrollWheelZoom: true,
}).setView([0, 0], 2);

// OpenStreetMap base tiles.
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

// Reference to the currently rendered building layer on the map.
let buildingLayer;

// LocalStorage key for cached building geometry fetched from OSM.
const osmGeometryCacheKey = "epfl-building-geometry-v2";
const themeStorageKey = "epfl-room-finder-theme";

// The room timeline is drawn as a fixed 24-hour day.
const timelineHours = Array.from({ length: 24 }, (_, hour) => hour);

// Cache important DOM nodes once instead of querying the DOM repeatedly.
const buildingPanel = document.getElementById("buildingPanel");
const buildingPanelTitle = document.getElementById("buildingPanelTitle");
const buildingPanelCopy = document.getElementById("buildingPanelCopy");
const buildingMeta = document.getElementById("buildingMeta");
const timelineHeader = document.getElementById("timelineHeader");
const timelineBody = document.getElementById("timelineBody");
const closeBuildingPanel = document.getElementById("closeBuildingPanel");
const themeToggle = document.getElementById("themeToggle");
const mapSection = document.getElementById("map-section");
const mapFrame = document.querySelector(".map-frame");
const mobilePanelMedia = window.matchMedia("(max-width: 720px)");
const systemDarkModeMedia = window.matchMedia("(prefers-color-scheme: dark)");
const buildingPanelDesktopAnchor = document.createComment("building-panel-desktop-anchor");

// The building panel lives inside the map on desktop, but on mobile we move it
// below the map so it behaves like a normal content card instead of competing
// with the map viewport.
mapFrame.insertBefore(buildingPanelDesktopAnchor, buildingPanel);

// Frontend state:
// - roomsDataset: canonical room list used for building membership
// - occupancyByRoom: occupancy slots indexed by normalized room id
// - baseBuildingFeatures: raw EPFL buildings before search scoring
// - activeSearchWindow: current searched period from the form
// - knownBuildingCodes: building names sorted for prefix-safe room matching
// - activeBuildingSelection: currently open building in the side panel
let roomsDataset = [];
let occupancyByRoom = new Map();
let baseBuildingFeatures = [];
let activeSearchWindow = null;
let knownBuildingCodes = [];
let activeBuildingSelection = null;
let lastThemeToggleAt = 0;

// Apply the selected theme to the <body> element and keep the toggle label
// synchronized with the actual current mode.
function applyTheme(theme) {
  document.body.dataset.theme = theme;
  themeToggle.textContent = theme === "light" ? "Dark mode" : "Light mode";
  themeToggle.setAttribute("aria-pressed", String(theme === "light"));
}

// Decide which theme to use on startup.
// Priority:
// 1. explicit user choice saved in localStorage
// 2. operating-system/browser preference
function resolveInitialTheme() {
  const storedTheme = localStorage.getItem(themeStorageKey);

  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  return systemDarkModeMedia.matches ? "dark" : "light";
}

// Toggle between light and dark mode and persist the user's choice so the
// page keeps the same look after a refresh.
function toggleTheme() {
  const nextTheme = document.body.dataset.theme === "light" ? "dark" : "light";
  localStorage.setItem(themeStorageKey, nextTheme);
  applyTheme(nextTheme);
}

// Theme toggle should react reliably on both desktop clicks and touch devices.
// Some mobile browsers can deliver touch/pointer interactions differently, so we
// centralize the action here and ignore the follow-up synthetic click if the
// same tap already triggered a pointer/touch handler.
function handleThemeToggle() {
  const now = Date.now();

  if (now - lastThemeToggleAt < 350) {
    return;
  }

  lastThemeToggleAt = now;
  toggleTheme();
}

function mountBuildingPanelForViewport() {
  if (mobilePanelMedia.matches) {
    if (buildingPanel.parentElement !== mapSection) {
      mapSection.appendChild(buildingPanel);
      buildingPanel.classList.add("panel-detached");
    }
    return;
  }

  if (buildingPanel.parentElement !== mapFrame) {
    mapFrame.insertBefore(buildingPanel, buildingPanelDesktopAnchor.nextSibling);
    buildingPanel.classList.remove("panel-detached");
  }
}

// On mobile the panel sits below the map as normal page content.
// After opening a building, bring that detached card into view so the user
// does not have to manually scroll past the map to find the timeline.
function revealBuildingPanelIfNeeded() {
  if (!mobilePanelMedia.matches || !buildingPanel.classList.contains("panel-detached")) {
    return;
  }

  requestAnimationFrame(() => {
    buildingPanel.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  });
}

// Single helper for the status line under the search form.
function setStatus(message) {
  document.getElementById("statusBanner").textContent = message;
}

// Deterministic pseudo-random hash used for initial demo availability values.
function hashCode(text) {
  return [...text].reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 1), 0);
}

// TO DO: Fix this, intially crap data just to have something on the map before wiring up the real search logic.
// Landing-page availability before the user applies a search window.
// Later, search recalculates score/room counts from the occupancy data instead.
function buildAvailability(name) {
  const hash = hashCode(name);
  const score = 0.2 + (hash % 70) / 100;
  const rooms = 1 + (hash % 6);
  return { score, rooms };
}

// Map fill colors for the building heatmap.
// Instead of discrete buckets, interpolate smoothly from red (low availability)
// to green (high availability).
function getColor(score) {
  const clamped = clamp(score, 0, 1);
  const hue = clamped * 120;
  return `hsl(${hue}, 62%, 42%)`;
}

// Slightly lighter outline colors so the polygon edges stay readable.
// We keep the same hue as the fill but increase lightness and reduce saturation.
function getBorderColor(score) {
  const clamped = clamp(score, 0, 1);
  const hue = clamped * 120;
  return `hsl(${hue}, 46%, 68%)`;
}

// Parse an OpenStreetMap URL like:
// https://www.openstreetmap.org/way/30334086
// into its type (`way`) and numeric id (`30334086`).
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

// Some data exports may already include full geometry/GeoJSON. If so, use it directly.
function extractLocalGeometry(record) {
  if (record.geometry?.type && record.geometry?.coordinates) {
    return record.geometry;
  }

  if (record.geojson?.type && record.geojson?.coordinates) {
    return record.geojson;
  }

  return null;
}

// Read previously cached geometry from localStorage.
function readGeometryCache() {
  try {
    return JSON.parse(localStorage.getItem(osmGeometryCacheKey) || "{}");
  } catch {
    return {};
  }
}

// Persist the geometry cache to localStorage.
function writeGeometryCache(cache) {
  localStorage.setItem(osmGeometryCacheKey, JSON.stringify(cache));
}

// Fetch the exact OSM geometry and convert it to GeoJSON using osmtogeojson.
// This avoids writing fragile custom code for OSM ways/relations.
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

// Resolve one building's geometry with this priority:
// 1. geometry already shipped in local JSON
// 2. geometry already cached in localStorage
// 3. live geometry fetched from OpenStreetMap
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
    };
  }

  return geometry;
}

// Turn the raw building records into GeoJSON features that Leaflet can render.
// This is where OSM ids become actual clickable building polygons.
async function buildFeaturesFromRecords(records) {
  const cache = readGeometryCache();
  const features = [];

  // Sort by descending length so specific codes like BCH are checked before BC.
  // This is important later when we infer a room's building from its room name.
  knownBuildingCodes = records
    .map((record) => normalizeBuildingCode(record.properties?.name))
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

  for (const record of records) {
    // The map now requires exact geometry only.
    // We intentionally skip old rectangle fallback behavior so every building
    // footprint matches the real OSM shape.
    const geometry = await resolveBuildingGeometry(record, cache);

    if (!geometry) {
      continue;
    }

    const name = record.properties?.name || "Unknown";
    const { score, rooms } = buildAvailability(name);

    // We keep geometry plus metadata in each feature so later steps can:
    // - color the building
    // - open popups
    // - compute search-window availability summaries
    features.push({
      type: "Feature",
      properties: {
        name,
        id: record.id,
        rooms,
        score,
      },
      geometry,
    });
  }

  writeGeometryCache(cache);
  return features;
}

// Leaflet style callback for one building polygon.
function styleFeature(feature) {
  const { score } = feature.properties;

  return {
    color: getBorderColor(score),
    weight: 1.2,
    fillColor: getColor(score),
    fillOpacity: 0.42,
  };
}

// Normalize a building code so comparisons are stable.
// Example: "CH H" -> "CHH"
function normalizeBuildingCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

// Build a compact room key so data coming from different sources can still match.
// Example:
// - "BCH 1113" -> "bch1113"
// - "BC 133" -> "bc133"
// - "MA C-1 C2" -> "mac1c2"
function normalizeRoomKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Extract the room's building code by taking the longest matching known code.
// This avoids prefix collisions such as BC matching BCH, or MA matching MAC.
function extractBuildingCodeFromRoom(roomName) {
  const normalizedRoom = normalizeBuildingCode(roomName);
  return knownBuildingCodes.find((code) => normalizedRoom.startsWith(code)) || null;
}

// True if a room belongs to the given building.
// We do not rely on naive startsWith(buildingCode) because that breaks for
// collisions like BC vs BCH.
function roomBelongsToBuilding(roomName, buildingCode) {
  const normalizedBuilding = normalizeBuildingCode(buildingCode);

  if (!normalizedBuilding) {
    return false;
  }

  return extractBuildingCodeFromRoom(roomName) === normalizedBuilding;
}

// Build the room list shown in the side panel for one building.
// rooms.json defines the canonical room names/types, and room_occupancy.json is
// used as a filter so we only keep rooms that actually have timeline data.
function getRoomsForBuilding(buildingCode) {
  return roomsDataset
    .filter((entry) => Array.isArray(entry) && entry.length >= 2)
    .map(([room, type]) => ({ room, type }))
    .filter((entry) => roomBelongsToBuilding(entry.room, buildingCode))
    .filter((entry) => occupancyByRoom.has(normalizeRoomKey(entry.room)));
}

// Label formatter for the timeline header.
function formatHour(hour) {
  return `${String(hour).padStart(2, "0")}:00`;
}

// Create either:
// - the header grid with hour labels
// - or a room grid that receives colored segments later
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

// The visible timeline day should follow the current search window.
// If no search exists yet, fall back to the current local day.
function getTimelineDayStart() {
  const sourceDate = activeSearchWindow?.start || new Date();
  return new Date(
    sourceDate.getFullYear(),
    sourceDate.getMonth(),
    sourceDate.getDate(),
    0,
    0,
    0,
    0
  );
}

// Local YYYY-MM-DD key for the currently visible timeline day.
// This intentionally uses local date parts, not UTC, so the page does not
// accidentally shift occupancy to the wrong calendar day.
function getTimelineDateKey() {
  const dayStart = getTimelineDayStart();
  const year = dayStart.getFullYear();
  const month = String(dayStart.getMonth() + 1).padStart(2, "0");
  const day = String(dayStart.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Generic helper used when converting times into timeline positions.
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Convert a timestamp to "minutes since the start of the visible day".
// This is the x-position unit for the timeline.
function minutesSinceDayStart(isoString) {
  const date = new Date(isoString);
  return Math.round((date.getTime() - getTimelineDayStart().getTime()) / 60000);
}

// Lookup all occupancy slots for one room by its normalized room id.
function getRoomSlots(roomName) {
  return occupancyByRoom.get(normalizeRoomKey(roomName)) || [];
}

// Parse the current search form into a concrete time window.
// The rest of the page uses this as the single source of truth for filtering.
function getSearchWindowFromForm() {
  const startValue = document.getElementById("startTime").value;
  const endValue = document.getElementById("endTime").value;

  if (!startValue || !endValue) {
    return null;
  }

  const start = new Date(startValue);
  const end = new Date(endValue);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return null;
  }

  return { start, end };
}

// Convert a timestamp into minutes within its own day so it can be positioned
// on the 24-hour timeline grid.
function minutesWithinDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

// Parse and normalize the current room's occupancy slots for the visible day only.
// If a room has occupancy data on another day but nothing on this day, the room
// should appear fully available, not "missing".
function normalizeSlots(roomName) {
  const slots = getRoomSlots(roomName);

  if (!slots.length) {
    return [];
  }

  return slots
    .map(([startIso, endIso]) => ({
      startIso,
      endIso,
      startDateKey: startIso.slice(0, 10),
      startMinutes: clamp(minutesSinceDayStart(startIso), 0, 24 * 60),
      endMinutes: clamp(minutesSinceDayStart(endIso), 0, 24 * 60),
    }))
    // Only draw occupancy blocks for the currently visible timeline day.
    // If a room has data on other days but nothing on this day, that means
    // the room is fully available here, not "missing data".
    .filter((slot) => slot.startDateKey === getTimelineDateKey())
    .filter((slot) => slot.endMinutes > slot.startMinutes)
    .sort((left, right) => left.startMinutes - right.startMinutes);
}

// Check whether a room has any occupancy block that intersects the searched window.
// If one interval overlaps, the room is considered unavailable for that search.
function roomIsAvailableInWindow(roomName, searchWindow) {
  if (!searchWindow) {
    return true;
  }

  const slots = getRoomSlots(roomName);

  return !slots.some(([startIso, endIso]) => {
    const slotStart = new Date(startIso);
    const slotEnd = new Date(endIso);
    return searchWindow.start < slotEnd && searchWindow.end > slotStart;
  });
}

// Build a new feature list for the active search window.
// The map colors come from this computed score, not from a fixed landing-page value.
function applyAvailabilityToFeatures(features, searchWindow) {
  return features.map((feature) => {
    // Find every occupancy-backed room in this building.
    const rooms = getRoomsForBuilding(feature.properties.name);
    const totalRooms = rooms.length;

    // A room is considered available if none of its occupied slots overlap the
    // selected search interval.
    const availableRooms = rooms.filter((room) => roomIsAvailableInWindow(room.room, searchWindow));
    const score = totalRooms ? availableRooms.length / totalRooms : 0;

    return {
      ...feature,
      properties: {
        ...feature.properties,
        score,
        rooms: totalRooms,
        availableRooms: availableRooms.length,
      },
    };
  });
}

// Draw one colored block in a timeline row.
// Blocks are positioned as percentages of the full 24-hour width.
function appendSegment(grid, startMinutes, endMinutes, className, title) {
  if (endMinutes <= startMinutes) {
    return;
  }

  const segment = document.createElement("div");
  segment.className = `timeline-segment ${className}`;
  segment.style.left = `${(startMinutes / (24 * 60)) * 100}%`;
  segment.style.width = `${((endMinutes - startMinutes) / (24 * 60)) * 100}%`;
  if (title) {
    segment.title = title;
  }
  grid.appendChild(segment);
}

// Draw the room timeline:
// - red rounded blocks for occupied periods
// - green rounded blocks for the gaps between them (available time)
// If the room has no occupancy record at all, show the empty-data label instead.
function addTimelineSegments(grid, roomName) {
  const allRoomSlots = getRoomSlots(roomName);
  const slots = normalizeSlots(roomName);

  // If the room is not present in room_occupancy.json at all, only then do we
  // show the "no occupancy data" state. If it has records on other days but not
  // on the selected day, it should appear fully available.
  if (!allRoomSlots.length) {
    const emptyState = document.createElement("div");
    emptyState.className = "timeline-empty-state";
    emptyState.textContent = "No occupancy data yet";
    grid.appendChild(emptyState);
    return;
  }

  let cursor = 0;

  slots.forEach((slot) => {
    // Available gap before the next occupied block.
    appendSegment(
      grid,
      cursor,
      slot.startMinutes,
      "timeline-segment-available",
      `${formatHour(Math.floor(cursor / 60))} - ${slot.startIso.slice(11, 16)} available`
    );

    // Occupied block itself.
    appendSegment(
      grid,
      slot.startMinutes,
      slot.endMinutes,
      "timeline-segment-occupied",
      `${slot.startIso.slice(11, 16)} - ${slot.endIso.slice(11, 16)} occupied`
    );
    cursor = slot.endMinutes;
  });

  // Final available block until the end of the day.
  appendSegment(
    grid,
    cursor,
    24 * 60,
    "timeline-segment-available",
    `${formatHour(Math.floor(cursor / 60))} - 24:00 available`
  );
}

// Wrap a timeline grid in a horizontally scrollable container.
function createTimelineScroll(isHeader = false) {
  const scroll = document.createElement("div");
  scroll.className = "timeline-scroll";
  scroll.appendChild(createTimelineGrid(isHeader));
  return scroll;
}

// Keep the searched period in view by centering the horizontal timeline near
// the middle of the requested time window.
function centerTimelineOnSearchWindow(scrollElements) {
  if (!activeSearchWindow || !scrollElements.length) {
    return;
  }

  const midpointMinutes =
    (minutesWithinDay(activeSearchWindow.start) + minutesWithinDay(activeSearchWindow.end)) / 2;

  scrollElements.forEach((scrollElement) => {
    const content = scrollElement.firstChild;
    const target =
      (midpointMinutes / (24 * 60)) * content.scrollWidth - scrollElement.clientWidth / 2;
    scrollElement.scrollLeft = Math.max(0, target);
  });
}

// Keep the hour header and all room rows horizontally synchronized.
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

// Build the right-side building panel for the selected building.
// This creates one timeline row per room and keeps all rows horizontally linked.
function openBuildingPanel(buildingCode, rooms) {
  activeBuildingSelection = buildingCode;
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

  // The header scroll plus every row scroll are synchronized together.
  const scrollElements = [headerScroll];
  const visibleRooms = rooms.length ? rooms : [{ room: "No room found", type: "No matching room in room_occupancy.json" }];

  visibleRooms.forEach((roomEntry) => {
    const row = document.createElement("div");
    row.className = "timeline-row";

    const rowLabel = document.createElement("div");
    rowLabel.className = "timeline-room-label";
    rowLabel.innerHTML = `<strong>${roomEntry.room}</strong><span>${roomEntry.type}</span>`;

    const rowScroll = createTimelineScroll(false);
    addTimelineSegments(rowScroll.firstChild, roomEntry.room);

    row.append(rowLabel, rowScroll);
    timelineBody.appendChild(row);
    scrollElements.push(rowScroll);
  });

  syncTimelineScroll(scrollElements);
  centerTimelineOnSearchWindow(scrollElements);
  revealBuildingPanelIfNeeded();
}

// Return the side panel to its initial "select a building" state.
function resetBuildingPanel() {
  activeBuildingSelection = null;
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

themeToggle.addEventListener("click", () => {
  handleThemeToggle();
});

themeToggle.addEventListener("pointerup", (event) => {
  if (event.pointerType === "touch" || event.pointerType === "pen") {
    handleThemeToggle();
  }
});

themeToggle.addEventListener("touchend", () => {
  handleThemeToggle();
}, { passive: true });

// If the user has not explicitly chosen a theme yet, follow the system theme
// when it changes. Once a choice is saved, the stored preference wins.
systemDarkModeMedia.addEventListener("change", () => {
  if (localStorage.getItem(themeStorageKey)) {
    return;
  }

  applyTheme(systemDarkModeMedia.matches ? "dark" : "light");
});

mobilePanelMedia.addEventListener("change", () => {
  mountBuildingPanelForViewport();
});

// If the user changes the search while a building panel is open, rebuild the
// panel immediately so the room timelines reflect the new searched period.
function refreshOpenBuildingPanel() {
  if (!activeBuildingSelection) {
    return;
  }

  const rooms = getRoomsForBuilding(activeBuildingSelection);
  openBuildingPanel(activeBuildingSelection, rooms);
}

// Leaflet feature callback for each building polygon.
// This wires hover feedback, popup content, and click-to-open behavior.
function onEachFeature(feature, layer) {
  const { name, score, id, availableRooms, rooms } = feature.properties;
  const enableMapPopup = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  // On desktop we keep the Leaflet popup as a lightweight map detail.
  // On touch/mobile we skip it, because popup autopan competes with the
  // custom building panel and can make the map jump around awkwardly.
  if (enableMapPopup) {
    layer.bindPopup(`
      <div class="room-popup">
        <h4>${name}</h4>
        <p>Availability in search window: ${availableRooms}/${rooms} rooms</p>
        <p>Availability score: ${Math.round(score * 100)}%</p>
        <p><a href="${id}" target="_blank" rel="noreferrer">Open in OpenStreetMap</a></p>
      </div>
    `);
  }

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
    if (!enableMapPopup) {
      layer.closePopup();
    }

    const rooms = getRoomsForBuilding(name);
    openBuildingPanel(name, rooms);
    setStatus(
      `Selected building ${name}. The room timeline is centered on your searched time window.`
    );
  });
}

// Render the building heatmap and update the summary card beside the map.
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
  document.getElementById("visibleRooms").title = `${totalRooms} rooms represented across all loaded buildings`;

  // Leaflet computes the bounds from the real rendered geometry.
  // On mobile we intentionally zoom one extra level in after fitting so the
  // campus is easier to inspect on a smaller screen.
  map.fitBounds(buildingLayer.getBounds(), { padding: [24, 24] });

  if (mobilePanelMedia.matches) {
    map.setZoom(map.getZoom() + 1);
  }
}

// Fetch the building source file that maps EPFL codes to OSM ids.
async function loadBuildingRecords() {
  const response = await fetch("./epfl_buildings.json");

  if (!response.ok) {
    throw new Error("Could not load epfl_buildings.json");
  }

  return response.json();
}

// Fetch the canonical room list.
async function loadRoomsDataset() {
  const response = await fetch("./rooms.json");

  if (!response.ok) {
    throw new Error("Could not load rooms.json");
  }

  return response.json();
}

// Fetch occupancy records for the rooms that have timeline data.
async function loadRoomOccupancyDataset() {
  const response = await fetch("./room_occupancy.json");

  if (!response.ok) {
    throw new Error("Could not load room_occupancy.json");
  }

  return response.json();
}

// Convert the occupancy JSON array into a map:
// normalized room name -> list of [start, end] slots
// This makes room timeline lookups fast.
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
    indexed.set(normalizeRoomKey(roomName), slots);
  });

  return indexed;
}

// Convert a Date object into the exact string required by datetime-local inputs.
function toLocalInputValue(date) {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 16);
}

// Give the search form a sensible initial time range.
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

// Search submission turns the current form values into the active search window.
// Then it:
// 1. recomputes the building heatmap
// 2. refreshes the currently open building panel, if any
document.getElementById("availability-form").addEventListener("submit", (event) => {
  event.preventDefault();

  const start = document.getElementById("startTime").value;
  const end = document.getElementById("endTime").value;
  const duration = document.getElementById("duration").value;
  const searchWindow = getSearchWindowFromForm();

  if (!searchWindow) {
    setStatus("Search window is invalid. Please choose a beginning before the end.");
    return;
  }

  activeSearchWindow = searchWindow;
  renderBuildings(applyAvailabilityToFeatures(baseBuildingFeatures, activeSearchWindow));
  refreshOpenBuildingPanel();

  setStatus(
    `Search applied: ${start} to ${end} for ${duration} minutes. Building colors now reflect room availability only within that time window.`
  );
});

// Preset buttons only update the search form values.
// The user still has to press Search to apply them to the map.
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
    setStatus(`Preset applied: ${button.textContent}. Press Search to update building availability for that time window.`);
  });
});

// Main boot sequence for the whole page.
// 1. seed the search form
// 2. load buildings, rooms, and occupancy
// 3. resolve OSM geometry
// 4. render the initial searched heatmap
async function initializeApp() {
  try {
    applyTheme(resolveInitialTheme());
    mountBuildingPanelForViewport();
    seedDefaultTimes();
    resetBuildingPanel();
    setStatus("Loading EPFL buildings, rooms, and room occupancy data...");

    const [records, rooms, occupancy] = await Promise.all([
      loadBuildingRecords(),
      loadRoomsDataset(),
      loadRoomOccupancyDataset(),
    ]);
    roomsDataset = rooms;
    occupancyByRoom = indexOccupancyByRoom(occupancy);

    baseBuildingFeatures = await buildFeaturesFromRecords(records);
    activeSearchWindow = getSearchWindowFromForm();

    if (!baseBuildingFeatures.length) {
      throw new Error("No building bounds could be resolved.");
    }

    renderBuildings(applyAvailabilityToFeatures(baseBuildingFeatures, activeSearchWindow));
    setStatus(
      `Loaded ${baseBuildingFeatures.length} buildings, ${roomsDataset.length} known rooms, and ${occupancyByRoom.size} occupancy-backed rooms. Use Search to update the heatmap for a specific time window.`
    );
  } catch (error) {
    console.error(error);
    setStatus(
      "Failed to load building, room, or occupancy data. Make sure you run the site through a local server and that epfl_buildings.json, rooms.json, and room_occupancy.json are present."
    );
  }
}

initializeApp();
