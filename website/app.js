// Create the Leaflet map immediately.
// We start zoomed out, then fit the viewport to the EPFL building footprints
// once the geometry has been loaded.
const map = L.map("map", {
  zoomControl: true,
  scrollWheelZoom: true,
}).setView([46.519978, 6.566638], 17);

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
const languageStorageKey = "epfl-room-finder-language";

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
const languageToggle = document.getElementById("languageToggle");
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
let startTimePicker = null;
let endTimePicker = null;
let activeSegmentTooltip = null;
let currentLanguage = "en";

const translations = {
  en: {
    search_eyebrow: "Meeting availability",
    search_title: "Find free rooms across the EPFL campus",
    start_label: "Beginning",
    end_label: "End",
    duration_label: "Duration",
    room_type_label: "Room Type",
    search_button: "Search",
    shortcut_now: "Now",
    shortcut_tomorrow_morning: "Tomorrow morning",
    shortcut_tomorrow_afternoon: "Tomorrow afternoon",
    building_timeline: "Building timeline",
    close_panel: "Close panel",
    theme_light: "Light mode",
    theme_dark: "Dark mode",
    room_type_all: "All room types",
    room_type_conference: "Conference Room",
    room_type_study: "Study Room",
    room_header: "Room",
    available: "Available",
    unavailable: "Unavailable",
    none: "None",
    no_occupancy: "No occupancy data yet",
    no_room_found: "No room found",
    no_matching_room: "No matching room in room_occupancy.json",
    select_building: "Select a building",
    click_building_copy:
      "Click a building on the map to inspect its rooms. For now, the panel shows the first matching room and an empty one-day timeline.",
    no_building_selected: "No building selected yet",
    selected_panel_copy:
      "Rooms are grouped by whether they contain a continuous free interval long enough for the selected meeting duration within the searched time range.",
    open_on_plan: "Open on plan.epfl.ch",
    availability_in_window: "Availability in search window: {available}/{rooms} rooms",
    selected_building_status:
      "Selected building {name}. The room timeline is centered on your searched time window.",
    invalid_search_window:
      "Search window is invalid. Use DD/MM/YYYY HH:MM and choose a beginning before the end.",
    search_applied:
      "Search applied: {start} to {end} for {duration}, filtered to {roomType}. Rooms are now available only if they contain a continuous free interval at least that long within the selected window.{adjustment}",
    end_adjusted:
      " End time was automatically extended from {previousEnd} to {adjustedEnd} so the search range is at least {duration} long.",
    loading_data: "Loading EPFL buildings, rooms, and room occupancy data...",
    loaded_data:
      "Loaded {buildings} buildings, {rooms} known rooms, and {occupancy} occupancy-backed rooms. Use Search to update the heatmap for a specific time window.",
    failed_data:
      "Failed to load building, room, or occupancy data. Make sure you run the site through a local server and that epfl_buildings.json, rooms.json, and room_occupancy.json are present.",
    language_changed: "Language switched to English.",
    available_slot: "{start} - {end} available",
    occupied_slot: "{start} - {end} occupied{title}",
  },
  fr: {
    search_eyebrow: "Disponibilité des salles",
    search_title: "Trouvez des salles libres sur le campus de l'EPFL",
    start_label: "Début",
    end_label: "Fin",
    duration_label: "Durée",
    room_type_label: "Type de salle",
    search_button: "Rechercher",
    shortcut_now: "Maintenant",
    shortcut_tomorrow_morning: "Demain matin",
    shortcut_tomorrow_afternoon: "Demain après-midi",
    building_timeline: "Planning du bâtiment",
    close_panel: "Fermer le panneau",
    theme_light: "Mode clair",
    theme_dark: "Mode sombre",
    room_type_all: "Tous les types de salle",
    room_type_conference: "Salle de conférence",
    room_type_study: "Salle d'étude",
    room_header: "Salle",
    available: "Disponible",
    unavailable: "Indisponible",
    none: "Aucune",
    no_occupancy: "Pas encore de données d'occupation",
    no_room_found: "Aucune salle trouvée",
    no_matching_room: "Aucune salle correspondante dans room_occupancy.json",
    select_building: "Sélectionnez un bâtiment",
    click_building_copy:
      "Cliquez sur un bâtiment sur la carte pour inspecter ses salles. Pour l'instant, le panneau affiche la première salle correspondante et une timeline vide sur une journée.",
    no_building_selected: "Aucun bâtiment sélectionné",
    selected_panel_copy:
      "Les salles sont regroupées selon qu'elles contiennent un intervalle libre continu suffisamment long pour la durée de réunion choisie dans la plage horaire recherchée.",
    open_on_plan: "Ouvrir sur plan.epfl.ch",
    availability_in_window: "Disponibilité dans la plage recherchée : {available}/{rooms} salles",
    selected_building_status:
      "Bâtiment {name} sélectionné. La timeline des salles est centrée sur la plage horaire recherchée.",
    invalid_search_window:
      "La plage de recherche est invalide. Utilisez JJ/MM/AAAA HH:MM et choisissez un début avant la fin.",
    search_applied:
      "Recherche appliquée : de {start} à {end} pour {duration}, filtrée sur {roomType}. Une salle est maintenant considérée comme disponible uniquement si elle contient un intervalle libre continu d'au moins cette durée dans la plage sélectionnée.{adjustment}",
    end_adjusted:
      " L'heure de fin a été automatiquement étendue de {previousEnd} à {adjustedEnd} afin que la plage de recherche dure au moins {duration}.",
    loading_data: "Chargement des bâtiments EPFL, des salles et des données d'occupation...",
    loaded_data:
      "{buildings} bâtiments, {rooms} salles connues et {occupancy} salles avec occupation ont été chargés. Utilisez Rechercher pour mettre à jour la carte thermique pour une plage horaire précise.",
    failed_data:
      "Le chargement des bâtiments, des salles ou des données d'occupation a échoué. Vérifiez que vous utilisez un serveur local et que epfl_buildings.json, rooms.json et room_occupancy.json sont présents.",
    language_changed: "Langue changée en français.",
    available_slot: "{start} - {end} disponible",
    occupied_slot: "{start} - {end} occupé{title}",
  },
};

function t(key, vars = {}) {
  const languagePack = translations[currentLanguage] || translations.en;
  const template = languagePack[key] || translations.en[key] || key;
  return Object.entries(vars).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    template
  );
}

function formatDurationLabel(minutes) {
  const totalMinutes = Number.parseInt(minutes, 10);
  const hours = Math.floor(totalMinutes / 60);
  const remainder = totalMinutes % 60;

  if (currentLanguage === "fr") {
    if (!hours) {
      return `${totalMinutes} minute${totalMinutes > 1 ? "s" : ""}`;
    }
    if (!remainder) {
      return `${hours} heure${hours > 1 ? "s" : ""}`;
    }
    return `${hours} heure${hours > 1 ? "s" : ""} ${remainder} minute${remainder > 1 ? "s" : ""}`;
  }

  if (!hours) {
    return `${totalMinutes} minutes`;
  }
  if (!remainder) {
    return `${hours} hour${hours > 1 ? "s" : ""}`;
  }
  return `${hours} hour${hours > 1 ? "s" : ""} ${remainder} minutes`;
}

function formatRoomCountLabel(count) {
  if (currentLanguage === "fr") {
    return `${count} salle${count > 1 ? "s" : ""} trouvee${count > 1 ? "s" : ""}`;
  }
  return `${count} room${count === 1 ? "" : "s"} found`;
}

function formatAvailabilityCountLabel(count, key) {
  if (currentLanguage === "fr") {
    return `${count} ${t(key).toLowerCase()}${count > 1 ? "s" : ""}`;
  }
  return `${count} ${t(key).toLowerCase()}`;
}

function refreshStaticTranslations() {
  document.documentElement.lang = currentLanguage === "fr" ? "fr" : "en-GB";
  document.getElementById("searchEyebrow").textContent = t("search_eyebrow");
  document.getElementById("searchTitle").textContent = t("search_title");
  document.getElementById("startTimeLabel").textContent = t("start_label");
  document.getElementById("endTimeLabel").textContent = t("end_label");
  document.getElementById("durationLabel").textContent = t("duration_label");
  document.getElementById("roomTypeLabel").textContent = t("room_type_label");
  document.getElementById("searchButton").textContent = t("search_button");
  document.getElementById("shortcutNow").textContent = t("shortcut_now");
  document.getElementById("shortcutTomorrowMorning").textContent = t("shortcut_tomorrow_morning");
  document.getElementById("shortcutTomorrowAfternoon").textContent = t("shortcut_tomorrow_afternoon");
  document.getElementById("buildingTimelineEyebrow").textContent = t("building_timeline");
  closeBuildingPanel.setAttribute("aria-label", t("close_panel"));

  document.querySelectorAll("#duration option").forEach((option) => {
    option.textContent = formatDurationLabel(option.value);
  });

  document.querySelector('#roomType option[value="all"]').textContent = t("room_type_all");
  document.querySelector('#roomType option[value="conference"]').textContent = t("room_type_conference");
  document.querySelector('#roomType option[value="study"]').textContent = t("room_type_study");
}

// Apply the selected theme to the <body> element and keep the toggle label
// synchronized with the actual current mode.
function applyTheme(theme) {
  document.body.dataset.theme = theme;
  themeToggle.textContent = theme === "light" ? t("theme_dark") : t("theme_light");
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

function resolveInitialLanguage() {
  const storedLanguage = localStorage.getItem(languageStorageKey);
  return storedLanguage === "fr" ? "fr" : "en";
}

// Toggle between light and dark mode and persist the user's choice so the
// page keeps the same look after a refresh.
function toggleTheme() {
  const nextTheme = document.body.dataset.theme === "light" ? "dark" : "light";
  localStorage.setItem(themeStorageKey, nextTheme);
  applyTheme(nextTheme);
}

function applyLanguage(language) {
  currentLanguage = language === "fr" ? "fr" : "en";
  localStorage.setItem(languageStorageKey, currentLanguage);
  languageToggle.textContent = currentLanguage === "en" ? "FR" : "EN";
  languageToggle.setAttribute(
    "aria-label",
    currentLanguage === "en" ? "Switch language to French" : "Passer la langue en anglais"
  );
  refreshStaticTranslations();
  applyTheme(document.body.dataset.theme || resolveInitialTheme());

  if (activeBuildingSelection) {
    openBuildingPanel(activeBuildingSelection, getRoomsForBuilding(activeBuildingSelection));
  } else {
    resetBuildingPanel();
  }

  if (baseBuildingFeatures.length) {
    renderBuildings(applyAvailabilityToFeatures(baseBuildingFeatures, activeSearchWindow));
  }
}

function toggleLanguage() {
  applyLanguage(currentLanguage === "en" ? "fr" : "en");
  setStatus(t("language_changed"));
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

const ROOM_TYPE_GROUPS = {
  conference: new Set(["CONFERENCES", "CONF MULTIMEDIA"]),
  study: new Set(["SALLE TP", "SALLE DE COURS"]),
};

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

// Read the currently selected room-type filter from the search form.
function getSelectedRoomType() {
  return document.getElementById("roomType").value || "all";
}

// Map the selected search category to the raw EPFL room type labels.
function roomMatchesSelectedType(roomType) {
  const selectedRoomType = getSelectedRoomType();

  if (selectedRoomType === "all") {
    return true;
  }

  return ROOM_TYPE_GROUPS[selectedRoomType]?.has(roomType) || false;
}

// Build the room list shown in the side panel for one building.
// rooms.json defines the canonical room names/types, and room_occupancy.json is
// used as a filter so we only keep rooms that actually have timeline data. The
// active room-type dropdown is applied here so the map and open timeline stay
// aligned around the same subset of rooms.
function getRoomsForBuilding(buildingCode) {
  return roomsDataset
    .filter((entry) => Array.isArray(entry) && entry.length >= 2)
    .map(([room, type]) => ({ room, type }))
    .filter((entry) => roomBelongsToBuilding(entry.room, buildingCode))
    .filter((entry) => roomMatchesSelectedType(entry.type))
    .filter((entry) => occupancyByRoom.has(normalizeRoomKey(entry.room)));
}

// Label formatter for the timeline header.
function formatHour(hour) {
  return `${String(hour).padStart(2, "0")}:00`;
}

// Draw the active search-window boundaries on top of a timeline grid so the
// user can immediately see where the requested interval begins and ends.
function appendSearchWindowMarkers(grid) {
  if (!activeSearchWindow) {
    return;
  }

  const markers = [
    minutesWithinDay(activeSearchWindow.start),
    minutesWithinDay(activeSearchWindow.end),
  ];

  markers.forEach((minutes) => {
    const marker = document.createElement("div");
    marker.className = "timeline-search-marker";
    marker.style.left = `${(clamp(minutes, 0, 24 * 60) / (24 * 60)) * 100}%`;
    grid.appendChild(marker);
  });
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

  appendSearchWindowMarkers(grid);

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

// Lookup all occupancy events for one room by its normalized room id.
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

  const start = parseEuropeanDateTimeInput(startValue);
  const end = parseEuropeanDateTimeInput(endValue);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return null;
  }

  return { start, end };
}

// Read the requested meeting duration from the form in minutes.
function getSearchDurationMinutes() {
  const rawValue = document.getElementById("duration").value;
  const duration = Number.parseInt(rawValue, 10);

  return Number.isFinite(duration) && duration > 0 ? duration : 0;
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
    .map((slot) => ({
      title: slot.title,
      startIso: slot.startIso,
      endIso: slot.endIso,
      startDateKey: slot.startIso.slice(0, 10),
      startMinutes: clamp(minutesSinceDayStart(slot.startIso), 0, 24 * 60),
      endMinutes: clamp(minutesSinceDayStart(slot.endIso), 0, 24 * 60),
    }))
    // Only draw occupancy blocks for the currently visible timeline day.
    // If a room has data on other days but nothing on this day, that means
    // the room is fully available here, not "missing data".
    .filter((slot) => slot.startDateKey === getTimelineDateKey())
    .filter((slot) => slot.endMinutes > slot.startMinutes)
    .sort((left, right) => left.startMinutes - right.startMinutes);
}

// Check whether a room has a continuous free interval inside the searched
// window that is at least as long as the requested meeting duration.
function getLongestFreeIntervalInWindow(roomName, searchWindow) {
  if (!searchWindow) {
    return Number.POSITIVE_INFINITY;
  }

  const windowStartMs = searchWindow.start.getTime();
  const windowEndMs = searchWindow.end.getTime();

  if (windowEndMs <= windowStartMs) {
    return 0;
  }

  const slots = getRoomSlots(roomName)
    .map((slot) => ({
      start: new Date(slot.startIso),
      end: new Date(slot.endIso),
    }))
    .filter((slot) => slot.end > searchWindow.start && slot.start < searchWindow.end)
    .sort((left, right) => left.start.getTime() - right.start.getTime());

  let freeCursor = windowStartMs;
  let longestFreeIntervalMs = 0;

  for (const slot of slots) {
    const occupiedStart = Math.max(slot.start.getTime(), windowStartMs);
    const occupiedEnd = Math.min(slot.end.getTime(), windowEndMs);

    longestFreeIntervalMs = Math.max(longestFreeIntervalMs, occupiedStart - freeCursor);

    freeCursor = Math.max(freeCursor, occupiedEnd);
  }

  return Math.max(longestFreeIntervalMs, windowEndMs - freeCursor);
}

// Check whether a room has a continuous free interval inside the searched
// window that is at least as long as the requested meeting duration.
function roomIsAvailableInWindow(roomName, searchWindow, durationMinutes) {
  if (!searchWindow || durationMinutes <= 0) {
    return true;
  }

  const requestedDurationMs = durationMinutes * 60000;
  const windowDurationMs = searchWindow.end.getTime() - searchWindow.start.getTime();

  if (windowDurationMs < requestedDurationMs) {
    return false;
  }

  return getLongestFreeIntervalInWindow(roomName, searchWindow) >= requestedDurationMs;
}

// Build a new feature list for the active search window.
// The map colors come from this computed score, not from a fixed landing-page value.
function applyAvailabilityToFeatures(features, searchWindow) {
  const durationMinutes = getSearchDurationMinutes();

  return features.map((feature) => {
    // Find every occupancy-backed room in this building.
    const rooms = getRoomsForBuilding(feature.properties.name);
    const { available, unavailable } = splitRoomsByAvailability(
      rooms,
      searchWindow,
      durationMinutes
    );
    const totalRooms = available.length + unavailable.length;

    // The heatmap is binary: each room is either available or unavailable for
    // the selected search window and requested duration. The score is therefore
    // available / (available + unavailable).
    const score = totalRooms ? available.length / totalRooms : 0;

    return {
      ...feature,
      properties: {
        ...feature.properties,
        score,
        rooms: totalRooms,
        availableRooms: available.length,
      },
    };
  });
}

// Split the building's rooms into the two timeline sections the panel shows.
// Each room keeps its full metadata; only the grouping and display order change.
// Inside each section, rooms with longer continuous free intervals rank first.
function splitRoomsByAvailability(rooms, searchWindow, durationMinutes) {
  const available = [];
  const unavailable = [];

  rooms.forEach((roomEntry) => {
    const longestFreeIntervalMs = getLongestFreeIntervalInWindow(roomEntry.room, searchWindow);
    const rankedRoom = {
      ...roomEntry,
      longestFreeIntervalMs,
    };

    if (roomIsAvailableInWindow(roomEntry.room, searchWindow, durationMinutes)) {
      available.push(rankedRoom);
      return;
    }

    unavailable.push(rankedRoom);
  });

  const byLongestAvailability = (left, right) =>
    right.longestFreeIntervalMs - left.longestFreeIntervalMs || left.room.localeCompare(right.room);

  available.sort(byLongestAvailability);
  unavailable.sort(byLongestAvailability);

  return { available, unavailable };
}

// Build a direct EPFL campus plan link for a building or room label.
// We keep the displayed text, including spaces, in the room query and let URL
// encoding preserve it safely in the outgoing link.
function buildPlanEpflUrl(label) {
  return `https://plan.epfl.ch/?room==${encodeURIComponent(label)}`;
}

function hideSegmentTooltip() {
  if (!activeSegmentTooltip) {
    return;
  }

  activeSegmentTooltip.remove();
  activeSegmentTooltip = null;
}

// Show the full event title in a floating tooltip when the inline label is
// truncated inside a narrow occupied segment.
function showSegmentTooltip(target, text) {
  hideSegmentTooltip();

  const tooltip = document.createElement("div");
  tooltip.className = "timeline-segment-tooltip";
  tooltip.textContent = text;
  document.body.appendChild(tooltip);

  const targetRect = target.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const top = Math.max(12, targetRect.top - tooltipRect.height - 8);
  const left = Math.min(
    window.innerWidth - tooltipRect.width - 12,
    Math.max(12, targetRect.left)
  );

  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;
  activeSegmentTooltip = tooltip;
}

// Draw one colored block in a timeline row.
// Blocks are positioned as percentages of the full 24-hour width.
function appendSegment(grid, startMinutes, endMinutes, className, title, labelText = "") {
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

  // Occupied blocks can show the event title directly on the segment so the
  // user understands why the room is unavailable without relying on hover only.
  if (labelText) {
    const label = document.createElement("span");
    label.className = "timeline-segment-label";
    label.textContent = labelText;
    segment.appendChild(label);

    const maybeShowFullLabel = () => {
      if (label.scrollWidth <= label.clientWidth) {
        return;
      }

      showSegmentTooltip(label, labelText);
    };

    segment.addEventListener("mouseenter", maybeShowFullLabel);
    segment.addEventListener("mouseleave", hideSegmentTooltip);
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
    emptyState.textContent = t("no_occupancy");
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
      t("available_slot", {
        start: formatHour(Math.floor(cursor / 60)),
        end: slot.startIso.slice(11, 16),
      })
    );

    // Occupied block itself.
    appendSegment(
      grid,
      slot.startMinutes,
      slot.endMinutes,
      "timeline-segment-occupied",
      t("occupied_slot", {
        start: slot.startIso.slice(11, 16),
        end: slot.endIso.slice(11, 16),
        title: slot.title ? `: ${slot.title}` : "",
      }),
      slot.title || ""
    );
    cursor = slot.endMinutes;
  });

  // Final available block until the end of the day.
  appendSegment(
    grid,
    cursor,
    24 * 60,
    "timeline-segment-available",
    t("available_slot", {
      start: formatHour(Math.floor(cursor / 60)),
      end: "24:00",
    })
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
  let syncFrame = null;
  let activeSource = null;

  scrollElements.forEach((element) => {
    element.addEventListener("scroll", () => {
      if (activeSource && activeSource !== element) {
        return;
      }

      activeSource = element;

      if (syncFrame !== null) {
        return;
      }

      // Coalesce scroll mirroring into one animation-frame update so touch
      // dragging does not trigger a full fan-out write on every raw event.
      syncFrame = requestAnimationFrame(() => {
        scrollElements.forEach((other) => {
          if (other !== element) {
            other.scrollLeft = element.scrollLeft;
          }
        });

        syncFrame = null;
        activeSource = null;
      });
    }, { passive: true });
  });
}

// Build the right-side building panel for the selected building.
// This creates one timeline row per room and keeps all rows horizontally linked.
function openBuildingPanel(buildingCode, rooms) {
  activeBuildingSelection = buildingCode;
  buildingPanel.classList.remove("is-empty");
  buildingPanelTitle.textContent = buildingCode;
  buildingPanelCopy.textContent = t("selected_panel_copy");

  const durationMinutes = getSearchDurationMinutes();
  const { available, unavailable } = splitRoomsByAvailability(
    rooms,
    activeSearchWindow,
    durationMinutes
  );
  const roomCount = rooms.length;

  buildingMeta.innerHTML = "";
  [
    formatRoomCountLabel(roomCount),
    formatAvailabilityCountLabel(available.length, "available"),
    formatAvailabilityCountLabel(unavailable.length, "unavailable"),
  ].forEach((label) => {
    const chip = document.createElement("span");
    chip.textContent = label;
    buildingMeta.appendChild(chip);
  });

  timelineHeader.innerHTML = "";
  timelineBody.innerHTML = "";

  const headerLabel = document.createElement("div");
  headerLabel.textContent = t("room_header");
  const headerScroll = createTimelineScroll(true);
  timelineHeader.append(headerLabel, headerScroll);

  // The header scroll plus every row scroll are synchronized together.
  const scrollElements = [headerScroll];

  // The timeline should always present rooms in two explicit blocks so the
  // user can scan qualifying rooms first, then the ones that do not fit.
  const sections = rooms.length
    ? [
        { title: t("available"), entries: available },
        { title: t("unavailable"), entries: unavailable },
      ]
    : [];

  sections.forEach((section) => {
    const sectionHeading = document.createElement("div");
    sectionHeading.className = "timeline-section-heading";
    sectionHeading.textContent = section.title;
    timelineBody.appendChild(sectionHeading);

    // Show an explicit placeholder when one side of the split is empty so the
    // user can distinguish "no matching rooms" from a rendering issue.
    if (!section.entries.length) {
      const emptyRow = document.createElement("div");
      emptyRow.className = "timeline-section-empty";
      emptyRow.textContent = t("none");
      timelineBody.appendChild(emptyRow);
      return;
    }

    section.entries.forEach((roomEntry) => {
      const row = document.createElement("div");
      row.className = "timeline-row";

      const rowLabel = document.createElement("div");
      rowLabel.className = "timeline-room-label";

      const roomLink = document.createElement("a");
      roomLink.className = "timeline-room-link";
      roomLink.href = buildPlanEpflUrl(roomEntry.room);
      roomLink.target = "_blank";
      roomLink.rel = "noreferrer";

      const roomName = document.createElement("strong");
      roomName.textContent = roomEntry.room;
      roomLink.appendChild(roomName);

      const roomType = document.createElement("span");
      roomType.textContent = roomEntry.type;

      rowLabel.append(roomLink, roomType);

      const rowScroll = createTimelineScroll(false);
      addTimelineSegments(rowScroll.firstChild, roomEntry.room);

      row.append(rowLabel, rowScroll);
      timelineBody.appendChild(row);
      scrollElements.push(rowScroll);
    });
  });

  if (!rooms.length) {
    const row = document.createElement("div");
    row.className = "timeline-row";

    const rowLabel = document.createElement("div");
    rowLabel.className = "timeline-room-label";
    rowLabel.innerHTML = `<strong>${t("no_room_found")}</strong><span>${t("no_matching_room")}</span>`;

    const rowScroll = createTimelineScroll(false);
    addTimelineSegments(rowScroll.firstChild, "No room found");

    row.append(rowLabel, rowScroll);
    timelineBody.appendChild(row);
    scrollElements.push(rowScroll);
  }

  syncTimelineScroll(scrollElements);
  centerTimelineOnSearchWindow(scrollElements);
  revealBuildingPanelIfNeeded();
}

// Return the side panel to its initial "select a building" state.
function resetBuildingPanel() {
  activeBuildingSelection = null;
  buildingPanel.classList.add("is-empty");
  buildingPanelTitle.textContent = t("select_building");
  buildingPanelCopy.textContent = t("click_building_copy");
  buildingMeta.innerHTML = `<span>${t("no_building_selected")}</span>`;
  timelineHeader.innerHTML = "";
  timelineBody.innerHTML = "";
}

closeBuildingPanel.addEventListener("click", () => {
  resetBuildingPanel();
});

themeToggle.addEventListener("click", () => {
  handleThemeToggle();
});

languageToggle.addEventListener("click", () => {
  toggleLanguage();
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
  const { name, availableRooms, rooms } = feature.properties;
  const enableMapPopup = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  // On desktop we keep the Leaflet popup as a lightweight map detail.
  // On touch/mobile we skip it, because popup autopan competes with the
  // custom building panel and can make the map jump around awkwardly.
  if (enableMapPopup) {
    layer.bindPopup(`
      <div class="room-popup">
        <h4>${name}</h4>
        <p>${t("availability_in_window", { available: availableRooms, rooms })}</p>
        <p><a href="${buildPlanEpflUrl(name)}" target="_blank" rel="noreferrer">${t("open_on_plan")}</a></p>
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
    setStatus(t("selected_building_status", { name }));
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

  // Leaflet computes the bounds from the real rendered geometry.
  // On mobile we still zoom in a bit after fitting so the campus is easier to
  // inspect on a smaller screen, but not so much that the context is lost.
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

// Convert the nested occupancy JSON structure into a map:
// normalized room name -> list of { title, startIso, endIso } events
// This keeps availability calculations fast while preserving event titles for
// the timeline's occupied blocks.
function indexOccupancyByRoom(payload) {
  const indexed = new Map();

  const rooms = Array.isArray(payload?.rooms) ? payload.rooms : [];

  rooms.forEach((entry) => {
    const roomName = entry?.name;

    if (!roomName) {
      return;
    }

    const events = [];

    (Array.isArray(entry.dates) ? entry.dates : []).forEach((dateEntry) => {
      (Array.isArray(dateEntry?.events) ? dateEntry.events : []).forEach((event) => {
        if (!Array.isArray(event) || event.length < 3) {
          return;
        }

        const [title, startIso, endIso] = event;
        if (!startIso || !endIso) {
          return;
        }

        events.push({
          title: title || "",
          startIso,
          endIso,
        });
      });
    });

    indexed.set(normalizeRoomKey(roomName), events);
  });

  return indexed;
}

// Parse a fixed "DD/MM/YYYY HH:MM" input string into a local Date object.
// This avoids browser-locale-dependent parsing and guarantees 24-hour handling.
function parseEuropeanDateTimeInput(value) {
  const match = String(value || "").trim().match(
    /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/
  );

  if (!match) {
    return new Date(Number.NaN);
  }

  const [, dayText, monthText, yearText, hourText, minuteText] = match;
  const day = Number.parseInt(dayText, 10);
  const month = Number.parseInt(monthText, 10);
  const year = Number.parseInt(yearText, 10);
  const hour = Number.parseInt(hourText, 10);
  const minute = Number.parseInt(minuteText, 10);

  const date = new Date(year, month - 1, day, hour, minute, 0, 0);

  // Reject impossible dates like 31/02/2026 14:00 instead of letting the Date
  // constructor silently roll them into another month.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return new Date(Number.NaN);
  }

  return date;
}

// Render a local Date object in the fixed "DD/MM/YYYY HH:MM" format used by
// the search inputs so the UI stays European and 24-hour everywhere.
function formatEuropeanDateTimeInput(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${day}/${month}/${year} ${hour}:${minute}`;
}

// If the requested meeting duration is longer than the chosen search window,
// automatically extend the end time so the window is at least that long.
function ensureRangeCanFitDuration() {
  const startInput = document.getElementById("startTime");
  const endInput = document.getElementById("endTime");
  const startDate = parseEuropeanDateTimeInput(startInput.value);
  const endDate = parseEuropeanDateTimeInput(endInput.value);
  const durationMinutes = getSearchDurationMinutes();

  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    durationMinutes <= 0 ||
    endDate <= startDate
  ) {
    return null;
  }

  const rangeMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);

  if (rangeMinutes >= durationMinutes) {
    return null;
  }

  const adjustedEnd = new Date(startDate.getTime() + durationMinutes * 60000);
  const adjustedEndValue = formatEuropeanDateTimeInput(adjustedEnd);

  endInput.value = adjustedEndValue;

  if (endTimePicker) {
    endTimePicker.setDate(adjustedEnd, false);
  }

  return {
    adjustedEnd,
    adjustedEndValue,
    previousEndValue: formatEuropeanDateTimeInput(endDate),
  };
}

// Keep end time convenient: whenever a valid start is chosen, prefill end to
// the same day and one hour later.
function syncEndWithStartPlusOneHour() {
  const startInput = document.getElementById("startTime");
  const endInput = document.getElementById("endTime");
  const startDate = parseEuropeanDateTimeInput(startInput.value);

  if (Number.isNaN(startDate.getTime())) {
    return;
  }

  const endDate = new Date(startDate);
  endDate.setHours(endDate.getHours() + 1);

  if (endTimePicker) {
    endTimePicker.setDate(endDate, false);
    return;
  }

  endInput.value = formatEuropeanDateTimeInput(endDate);
}

// Attach a custom date/time picker that still stores values in the same
// European 24-hour text format used by the form and validation logic.
function initializeDateTimePickers() {
  if (typeof flatpickr !== "function") {
    return;
  }

  const buildPicker = (selector) =>
    flatpickr(selector, {
      enableTime: true,
      time_24hr: true,
      allowInput: true,
      dateFormat: "d/m/Y H:i",
      minuteIncrement: 5,
      disableMobile: true,
      parseDate: parseEuropeanDateTimeInput,
      formatDate: formatEuropeanDateTimeInput,
    });

  startTimePicker = buildPicker("#startTime");
  endTimePicker = buildPicker("#endTime");

  startTimePicker.config.onChange.push(() => {
    syncEndWithStartPlusOneHour();
  });

  startTimePicker.config.onClose.push(() => {
    syncEndWithStartPlusOneHour();
  });

  document.getElementById("startTime").addEventListener("change", () => {
    syncEndWithStartPlusOneHour();
  });

  document.getElementById("startTime").addEventListener("blur", () => {
    syncEndWithStartPlusOneHour();
  });

  // The explicit calendar buttons open the matching picker on demand.
  document.querySelectorAll(".datetime-trigger").forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.dataset.pickerTarget;
      const picker = targetId === "startTime" ? startTimePicker : endTimePicker;
      picker?.open();
    });
  });
}

// Give the search form a sensible initial time range.
function seedDefaultTimes() {
  const now = new Date();
  const start = new Date(now);

  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);

  const end = new Date(start);
  end.setHours(end.getHours() + 1);

  document.getElementById("startTime").value = formatEuropeanDateTimeInput(start);
  document.getElementById("endTime").value = formatEuropeanDateTimeInput(end);

  if (endTimePicker) {
    endTimePicker.setDate(end, false);
  }
}

// Search submission turns the current form values into the active search window.
// Then it:
// 1. recomputes the building heatmap
// 2. refreshes the currently open building panel, if any
function applyCurrentSearch() {
  const start = document.getElementById("startTime").value;
  const duration = document.getElementById("duration").value;
  const roomType = document.getElementById("roomType").selectedOptions[0]?.textContent || "All room types";
  const rangeAdjustment = ensureRangeCanFitDuration();
  const end = document.getElementById("endTime").value;
  const searchWindow = getSearchWindowFromForm();

  if (!searchWindow) {
    setStatus(t("invalid_search_window"));
    return;
  }

  activeSearchWindow = searchWindow;
  renderBuildings(applyAvailabilityToFeatures(baseBuildingFeatures, activeSearchWindow));
  refreshOpenBuildingPanel();

  const adjustmentMessage = rangeAdjustment
    ? t("end_adjusted", {
        previousEnd: rangeAdjustment.previousEndValue,
        adjustedEnd: rangeAdjustment.adjustedEndValue,
        duration: formatDurationLabel(duration),
      })
    : "";

  setStatus(t("search_applied", {
    start,
    end,
    duration: formatDurationLabel(duration),
    roomType,
    adjustment: adjustmentMessage,
  }));
}

document.getElementById("availability-form").addEventListener("submit", (event) => {
  event.preventDefault();
  applyCurrentSearch();
});

// Preset buttons update the form and immediately apply the same search logic
// so both the heatmap and any already-open building timeline refresh at once.
document.querySelectorAll(".shortcut-chip").forEach((button) => {
  button.addEventListener("click", () => {
    const now = new Date();
    const start = new Date(now);
    const range = button.dataset.range;

    if (range === "now") {
      start.setMinutes(0, 0, 0);
      start.setHours(start.getHours() + 1);
    } else if (range === "tomorrow") {
      start.setDate(start.getDate() + 1);
      start.setHours(9, 0, 0, 0);
    } else if (range === "tomorrow-afternoon") {
      start.setDate(start.getDate() + 1);
      start.setHours(14, 0, 0, 0);
    } else {
      start.setMinutes(0, 0, 0);
      start.setHours(start.getHours() + 1);
    }

    const end = new Date(start);
    end.setHours(end.getHours() + 1);

    // Presets always use a 1-hour meeting duration for faster future-date setup.
    document.getElementById("duration").value = "60";

    document.getElementById("startTime").value = formatEuropeanDateTimeInput(start);
    document.getElementById("endTime").value = formatEuropeanDateTimeInput(end);

    if (startTimePicker) {
      startTimePicker.setDate(start, false);
    }

    if (endTimePicker) {
      endTimePicker.setDate(end, false);
    }

    applyCurrentSearch();
  });
});

// Main boot sequence for the whole page.
// 1. seed the search form
// 2. load buildings, rooms, and occupancy
// 3. resolve OSM geometry
// 4. render the initial searched heatmap
async function initializeApp() {
  try {
    applyLanguage(resolveInitialLanguage());
    applyTheme(resolveInitialTheme());
    mountBuildingPanelForViewport();
    initializeDateTimePickers();
    seedDefaultTimes();
    resetBuildingPanel();
    setStatus(t("loading_data"));

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
    setStatus(t("loaded_data", {
      buildings: baseBuildingFeatures.length,
      rooms: roomsDataset.length,
      occupancy: occupancyByRoom.size,
    }));
  } catch (error) {
    console.error(error);
    setStatus(t("failed_data"));
  }
}

initializeApp();
