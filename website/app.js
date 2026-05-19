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
let previousBuildingScores = new Map();

// LocalStorage key for cached building geometry fetched from OSM.
const osmGeometryCacheKey = "epfl-building-geometry-v2";
const themeStorageKey = "epfl-room-finder-theme";
const languageStorageKey = "epfl-room-finder-language";

// The room timeline is drawn as a fixed 24-hour day.
const timelineHours = Array.from({ length: 24 }, (_, hour) => hour);
const timelineHourWidth = 180;
const timelineWidth = timelineHours.length * timelineHourWidth;
const timelineHeaderHeight = 46;
const timelineRowHeight = 74;
let timelineClipId = 0;

const AVAILABILITY_BINS = [
  { label: "0-20%", min: 0, max: 0.2 },
  { label: "20-40%", min: 0.2, max: 0.4 },
  { label: "40-60%", min: 0.4, max: 0.6 },
  { label: "60-80%", min: 0.6, max: 0.8 },
  { label: "80-100%", min: 0.8, max: 1.01 },
];

// Cache important DOM nodes once instead of querying the DOM repeatedly.
const buildingPanel = document.getElementById("buildingPanel");
const buildingPanelTitle = document.getElementById("buildingPanelTitle");
const buildingPanelCopy = document.getElementById("buildingPanelCopy");
const buildingMeta = document.getElementById("buildingMeta");
const buildingSummaryChart = document.getElementById("buildingSummaryChart");
const buildingHeatmapChart = document.getElementById("buildingHeatmapChart");
const timelineHeader = document.getElementById("timelineHeader");
const timelineBody = document.getElementById("timelineBody");
const closeBuildingPanel = document.getElementById("closeBuildingPanel");
const themeToggle = document.getElementById("themeToggle");
const languageToggle = document.getElementById("languageToggle");
const mapSection = document.getElementById("map-section");
const mapFrame = document.querySelector(".map-frame");
const campusAvailabilityChart = document.getElementById("campusAvailabilityChart");
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
let activeAvailabilityFilter = null;
let hasUsedAvailabilityFilter = false;
let lastThemeToggleAt = 0;
let startTimePicker = null;
let endTimePicker = null;
let activeSegmentTooltip = null;
let currentLanguage = "en";

const translations = {
  en: {
    // search_eyebrow: "Meeting availability",
    search_title: "Find by time",
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
    room_type_conference: "Conference Room",
    room_type_study: "Study Room",
    room_header: "Room",
    available: "Available",
    unavailable: "Unavailable",
    summary_title: "Room summary",
    heatmap_title: "Hourly occupancy",
    campus_summary_title: "Campus availability",
    availability_filter_title: "Availability filter",
    availability_filter_clear: "Show all",
    mostly_occupied: "Mostly occupied",
    mostly_free: "Mostly free",
    buildings_label: "Buildings",
    search_window_label: "Search window",
    busy: "Busy",
    quiet: "Quiet",
    all_rooms: "All rooms",
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
    // search_eyebrow: "Disponibilité des salles",
    search_title: "Find by time",
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
    room_type_conference: "Salle de conférence",
    room_type_study: "Salle d'étude",
    room_header: "Salle",
    available: "Disponible",
    unavailable: "Indisponible",
    summary_title: "Résumé des salles",
    heatmap_title: "Occupation horaire",
    campus_summary_title: "Disponibilité du campus",
    availability_filter_title: "Filtre de disponibilité",
    availability_filter_clear: "Tout afficher",
    mostly_occupied: "Très occupé",
    mostly_free: "Plutôt libre",
    buildings_label: "Bâtiments",
    search_window_label: "Plage recherchée",
    busy: "Occupé",
    quiet: "Calme",
    all_rooms: "Toutes les salles",
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

function getRoomTypeGroup(roomType) {
  if (ROOM_TYPE_GROUPS.conference.has(roomType)) {
    return "conference";
  }

  if (ROOM_TYPE_GROUPS.study.has(roomType)) {
    return "study";
  }

  return "other";
}

function refreshStaticTranslations() {
  document.documentElement.lang = currentLanguage === "fr" ? "fr" : "en-GB";
  // document.getElementById("searchEyebrow").textContent = t("search_eyebrow");
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

  document.getElementById("roomTypeConferenceLabel").textContent = t("room_type_conference");
  document.getElementById("roomTypeStudyLabel").textContent = t("room_type_study");
}

// Apply the selected theme to the <body> element and keep the toggle label
// synchronized with the actual current mode.
function applyTheme(theme) {
  document.body.dataset.theme = theme;
  const switchLabel = theme === "light" ? t("theme_dark") : t("theme_light");
  themeToggle.textContent = theme === "light" ? "☾" : "☀";
  themeToggle.setAttribute("aria-label", switchLabel);
  themeToggle.setAttribute("title", switchLabel);
  themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
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
// D3 owns the same red-to-green availability scale used by the map overlays.
function getColor(score) {
  const clamped = clamp(score, 0, 1);
  return d3.scaleSequential(d3.interpolateRdYlGn).domain([0, 1])(clamped);
}

// Slightly lighter outline colors so the polygon edges stay readable.
function getBorderColor(score) {
  const color = d3.color(getColor(score));
  return color ? color.brighter(0.65).formatHex() : getColor(score);
}

function buildAvailabilityBins(features) {
  return AVAILABILITY_BINS.map((bin) => ({
    ...bin,
    count: features.filter((feature) => {
      const score = feature.properties?.score || 0;
      return score >= bin.min && score < bin.max;
    }).length,
    midpoint: (bin.min + Math.min(bin.max, 1)) / 2,
  }));
}

function getRenderedScore(feature) {
  const name = feature?.properties?.name;

  if (name && previousBuildingScores.has(name)) {
    return previousBuildingScores.get(name);
  }

  return feature?.properties?.score ?? 0;
}

function isScoreInActiveFilter(score) {
  if (!activeAvailabilityFilter) {
    return true;
  }

  return score >= activeAvailabilityFilter.min && score < activeAvailabilityFilter.max;
}

function muteColor(color, saturationScale = 0.12, lightnessBoost = 0.18, maxLightness = 0.82) {
  const hsl = d3.hsl(color);

  if (!Number.isFinite(hsl.h)) {
    return color;
  }

  hsl.s = Math.max(0, hsl.s * saturationScale);
  hsl.l = Math.min(maxLightness, hsl.l + lightnessBoost);
  return hsl.formatHex();
}

function getFeatureStyle(feature) {
  const score = getRenderedScore(feature);
  const baseColor = getColor(score);
  const baseBorder = getBorderColor(score);

  if (!activeAvailabilityFilter) {
    return {
      color: baseBorder,
      weight: 1.2,
      fillColor: baseColor,
      fillOpacity: 0.42,
      opacity: 1,
    };
  }

  if (isScoreInActiveFilter(score)) {
    return {
      color: baseBorder,
      weight: 1.2,
      fillColor: baseColor,
      fillOpacity: 0.56,
      opacity: 1,
    };
  }

  return {
    color: muteColor(baseBorder, 0.18, 0.2, 0.78),
    weight: 1,
    fillColor: muteColor(baseColor),
    fillOpacity: 0.14,
    opacity: 0.45,
  };
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
  return getFeatureStyle(feature);
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

// Read the currently selected room-type filters from the search form.
// If both are unchecked, we keep both enabled so filtering never becomes empty
// by accident.
function getSelectedRoomTypes() {
  const conferenceCheckbox = document.getElementById("roomTypeConference");
  const studyCheckbox = document.getElementById("roomTypeStudy");
  const selectedTypes = [];

  if (conferenceCheckbox?.checked) {
    selectedTypes.push("conference");
  }

  if (studyCheckbox?.checked) {
    selectedTypes.push("study");
  }

  if (!selectedTypes.length) {
    conferenceCheckbox.checked = true;
    studyCheckbox.checked = true;
    return ["conference", "study"];
  }

  return selectedTypes;
}

function formatSelectedRoomTypesLabel() {
  const labels = getSelectedRoomTypes().map((type) =>
    type === "conference" ? t("room_type_conference") : t("room_type_study")
  );

  if (labels.length === 2) {
    return currentLanguage === "fr" ? `${labels[0]} et ${labels[1]}` : `${labels[0]} and ${labels[1]}`;
  }

  return labels[0] || t("room_type_conference");
}

// Map the selected search category to the raw EPFL room type labels.
function roomMatchesSelectedType(roomType) {
  const selectedRoomTypes = getSelectedRoomTypes();
  return selectedRoomTypes.some((selectedType) => ROOM_TYPE_GROUPS[selectedType]?.has(roomType));
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

function formatClockTime(date) {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function buildTimelineScale() {
  return d3.scaleLinear()
    .domain([0, 24 * 60])
    .range([0, timelineWidth]);
}

function getSearchWindowTimelineRange() {
  if (!activeSearchWindow) {
    return null;
  }

  const dayStart = getTimelineDayStart().getTime();
  const dayEnd = dayStart + 24 * 60 * 60000;
  const startMs = Math.max(activeSearchWindow.start.getTime(), dayStart);
  const endMs = Math.min(activeSearchWindow.end.getTime(), dayEnd);

  if (endMs <= startMs) {
    return null;
  }

  return {
    startMinutes: Math.round((startMs - dayStart) / 60000),
    endMinutes: Math.round((endMs - dayStart) / 60000),
  };
}

function appendTimelineGrid(svg, height, xScale) {
  svg.append("rect")
    .attr("class", "timeline-grid-background")
    .attr("width", timelineWidth)
    .attr("height", height)
    .attr("rx", 18);

  svg.append("g")
    .selectAll("line")
    .data(timelineHours)
    .join("line")
    .attr("class", "timeline-grid-line")
    .attr("x1", (hour) => xScale(hour * 60))
    .attr("x2", (hour) => xScale(hour * 60))
    .attr("y1", 0)
    .attr("y2", height);
}

function appendSearchWindowBand(svg, height, xScale, withLabel = false) {
  const range = getSearchWindowTimelineRange();

  if (!range) {
    return;
  }

  const x = xScale(range.startMinutes);
  const width = xScale(range.endMinutes) - x;

  svg.append("rect")
    .attr("class", "timeline-search-window-band")
    .attr("x", x)
    .attr("y", 0)
    .attr("width", width)
    .attr("height", height);

  if (withLabel && width > 120) {
    svg.append("text")
      .attr("class", "timeline-search-window-label")
      .attr("x", x + width / 2)
      .attr("y", 16)
      .attr("text-anchor", "middle")
      .text(`${formatClockTime(activeSearchWindow.start)} - ${formatClockTime(activeSearchWindow.end)}`);
  }
}

// Draw the active search-window boundaries on top of a timeline SVG so the
// user can immediately see where the requested interval begins and ends.
function appendSearchWindowMarkers(svg, height, xScale) {
  const range = getSearchWindowTimelineRange();

  if (!range) {
    return;
  }

  [range.startMinutes, range.endMinutes].forEach((minutes) => {
    svg.append("line")
      .attr("class", "timeline-search-marker")
      .attr("x1", xScale(minutes))
      .attr("x2", xScale(minutes))
      .attr("y1", 0)
      .attr("y2", height);
  });
}

function createTimelineSvg(isHeader = false) {
  const height = isHeader ? timelineHeaderHeight : timelineRowHeight;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

  svg.setAttribute("class", `timeline-grid${isHeader ? " timeline-hours" : ""}`);
  svg.setAttribute("width", String(timelineWidth));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${timelineWidth} ${height}`);
  svg.setAttribute("role", "img");
  svg.style.width = `${timelineWidth}px`;
  svg.style.minWidth = `${timelineWidth}px`;
  svg.style.height = `${height}px`;

  return svg;
}

function drawTimelineHeader(svgElement) {
  const svg = d3.select(svgElement);
  const xScale = buildTimelineScale();

  appendTimelineGrid(svg, timelineHeaderHeight, xScale);
  appendSearchWindowBand(svg, timelineHeaderHeight, xScale, true);

  const axis = d3.axisBottom(xScale)
    .tickValues(d3.range(0, 24 * 60 + 1, 120))
    .tickSize(8)
    .tickPadding(6)
    .tickFormat((minutes) => minutes === 24 * 60 ? "24:00" : formatHour(minutes / 60));

  svg.append("g")
    .attr("class", "timeline-axis")
    .attr("transform", `translate(0, ${timelineHeaderHeight - 24})`)
    .call(axis)
    .call((axisGroup) => {
      axisGroup.selectAll(".tick text")
        .attr("text-anchor", (minutes) => {
          if (minutes === 0) {
            return "start";
          }

          if (minutes === 24 * 60) {
            return "end";
          }

          return "middle";
        })
        .attr("dx", (minutes) => {
          if (minutes === 0) {
            return "12px";
          }

          if (minutes === 24 * 60) {
            return "-12px";
          }

          return "0";
        });
    });

  appendSearchWindowMarkers(svg, timelineHeaderHeight, xScale);
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

function buildBuildingSummaryRows(available, unavailable) {
  const rows = [
    {
      key: "all",
      label: t("all_rooms"),
      available: available.length,
      unavailable: unavailable.length,
    },
  ];

  [
    { key: "conference", label: t("room_type_conference") },
    { key: "study", label: t("room_type_study") },
  ].forEach((group) => {
    const availableCount = available.filter((room) => getRoomTypeGroup(room.type) === group.key).length;
    const unavailableCount = unavailable.filter((room) => getRoomTypeGroup(room.type) === group.key).length;

    if (availableCount || unavailableCount) {
      rows.push({
        key: group.key,
        label: group.label,
        available: availableCount,
        unavailable: unavailableCount,
      });
    }
  });

  return rows.map((row) => ({
    ...row,
    total: row.available + row.unavailable,
  }));
}

function renderBuildingSummaryChart(available, unavailable) {
  buildingSummaryChart.innerHTML = "";

  const rows = buildBuildingSummaryRows(available, unavailable);
  const totalRooms = available.length + unavailable.length;
  const availableRatio = totalRooms ? available.length / totalRooms : 0;
  const chartWidth = 560;
  const rowHeight = 32;
  const headerHeight = 28;
  const footerHeight = 24;
  const donutSize = 104;
  const donutCenter = { x: 52, y: headerHeight + donutSize / 2 };
  const barStartX = 124;
  const labelWidth = 128;
  const valueWidth = 48;
  const barGap = 12;
  const barWidth = chartWidth - barStartX - labelWidth - valueWidth - barGap;
  const chartBodyHeight = Math.max(donutSize, rows.length * rowHeight);
  const chartHeight = headerHeight + chartBodyHeight + footerHeight;

  const svg = d3.select(buildingSummaryChart)
    .append("svg")
    .attr("class", "building-summary-svg")
    .attr("viewBox", `0 0 ${chartWidth} ${chartHeight}`)
    .attr("role", "img")
    .attr(
      "aria-label",
      `${t("summary_title")}: ${available.length} ${t("available").toLowerCase()}, ${unavailable.length} ${t("unavailable").toLowerCase()}`
    );

  svg.append("text")
    .attr("class", "building-summary-title")
    .attr("x", 0)
    .attr("y", 18)
    .text(t("summary_title"));

  const donutData = [
    { key: "available", value: available.length },
    { key: "unavailable", value: unavailable.length },
  ];
  const arc = d3.arc()
    .innerRadius(30)
    .outerRadius(46)
    .cornerRadius(8);
  const pie = d3.pie()
    .sort(null)
    .value((entry) => entry.value || 0.0001);

  const donut = svg.append("g")
    .attr("class", "building-summary-donut")
    .attr("transform", `translate(${donutCenter.x}, ${donutCenter.y})`);

  donut.selectAll("path")
    .data(pie(donutData))
    .join("path")
    .attr("class", (entry) => `building-summary-donut-${entry.data.key}`)
    .attr("d", arc)
    .each(function storeInitialArc(entry) {
      this._current = { ...entry, startAngle: entry.startAngle, endAngle: entry.startAngle };
    })
    .transition()
    .duration(650)
    .attrTween("d", function tweenArc(entry) {
      const interpolate = d3.interpolate(this._current, entry);
      this._current = entry;
      return (progress) => arc(interpolate(progress));
    });

  donut.append("text")
    .attr("class", "building-summary-donut-value")
    .attr("text-anchor", "middle")
    .attr("y", -2)
    .text(`${Math.round(availableRatio * 100)}%`);

  donut.append("text")
    .attr("class", "building-summary-donut-label")
    .attr("text-anchor", "middle")
    .attr("y", 17)
    .text(t("available"));

  const rowGroups = svg.append("g")
    .attr("transform", `translate(${barStartX}, ${headerHeight})`)
    .selectAll("g")
    .data(rows)
    .join("g")
    .attr("transform", (_, index) => `translate(0, ${index * rowHeight})`);

  rowGroups.append("text")
    .attr("class", "building-summary-label")
    .attr("x", 0)
    .attr("y", 19)
    .text((row) => row.label);

  rowGroups.append("rect")
    .attr("class", "building-summary-bar-bg")
    .attr("x", labelWidth)
    .attr("y", 6)
    .attr("width", barWidth)
    .attr("height", 14)
    .attr("rx", 7);

  rowGroups.append("rect")
    .attr("class", "building-summary-bar-unavailable")
    .attr("x", (row) => labelWidth + (row.total ? (row.available / row.total) * barWidth : 0))
    .attr("y", 6)
    .attr("width", 0)
    .attr("height", 14)
    .attr("rx", 7)
    .transition()
    .duration(650)
    .attr("width", (row) => row.total ? (row.unavailable / row.total) * barWidth : 0);

  rowGroups.append("rect")
    .attr("class", "building-summary-bar-available")
    .attr("x", labelWidth)
    .attr("y", 6)
    .attr("width", 0)
    .attr("height", 14)
    .attr("rx", 7)
    .transition()
    .duration(650)
    .attr("width", (row) => row.total ? (row.available / row.total) * barWidth : 0);

  rowGroups.append("text")
    .attr("class", "building-summary-value")
    .attr("x", labelWidth + barWidth + barGap + valueWidth)
    .attr("y", 19)
    .attr("text-anchor", "end")
    .text((row) => `${row.available}/${row.total}`);

  const legend = svg.append("g")
    .attr("class", "building-summary-legend")
    .attr("transform", `translate(${barStartX + labelWidth}, ${chartHeight - 8})`);

  [
    { className: "building-summary-dot-available", label: t("available") },
    { className: "building-summary-dot-unavailable", label: t("unavailable") },
  ].forEach((item, index) => {
    const group = legend.append("g")
      .attr("transform", `translate(${index * 120}, 0)`);

    group.append("circle")
      .attr("class", item.className)
      .attr("cx", 0)
      .attr("cy", -4)
      .attr("r", 4);

    group.append("text")
      .attr("x", 10)
      .attr("y", 0)
      .text(item.label);
  });
}

function roomIsBusyDuringHour(roomName, hour) {
  const dayStart = getTimelineDayStart();
  const hourStart = new Date(dayStart.getTime() + hour * 60 * 60000);
  const hourEnd = new Date(hourStart.getTime() + 60 * 60000);

  return getRoomSlots(roomName).some((slot) => {
    const start = new Date(slot.startIso);
    const end = new Date(slot.endIso);
    return end > hourStart && start < hourEnd;
  });
}

function buildHourlyHeatmapRows(rooms) {
  const groups = [
    { key: "all", label: t("all_rooms"), rooms },
    {
      key: "conference",
      label: t("room_type_conference"),
      rooms: rooms.filter((room) => getRoomTypeGroup(room.type) === "conference"),
    },
    {
      key: "study",
      label: t("room_type_study"),
      rooms: rooms.filter((room) => getRoomTypeGroup(room.type) === "study"),
    },
  ];

  return groups
    .filter((group) => group.rooms.length)
    .map((group) => ({
      ...group,
      hours: timelineHours.map((hour) => {
        const busyRooms = group.rooms.filter((room) => roomIsBusyDuringHour(room.room, hour)).length;
        return {
          hour,
          busyRooms,
          totalRooms: group.rooms.length,
          ratio: busyRooms / group.rooms.length,
        };
      }),
    }));
}

function renderBuildingHeatmapChart(rooms) {
  buildingHeatmapChart.innerHTML = "";

  const rows = buildHourlyHeatmapRows(rooms);
  const chartWidth = 560;
  const headerHeight = 28;
  const labelWidth = 135;
  const cellGap = 3;
  const cellWidth = 14;
  const cellHeight = 22;
  const rowGap = 8;
  const legendHeight = 28;
  const heatmapWidth = timelineHours.length * cellWidth + (timelineHours.length - 1) * cellGap;
  const chartHeight = headerHeight + rows.length * (cellHeight + rowGap) + 24 + legendHeight;
  const colorScale = d3.scaleSequential(d3.interpolateRgb("#2b3242", "#ff6868"))
    .domain([0, 1]);

  const svg = d3.select(buildingHeatmapChart)
    .append("svg")
    .attr("class", "building-heatmap-svg")
    .attr("viewBox", `0 0 ${chartWidth} ${chartHeight}`)
    .attr("role", "img")
    .attr("aria-label", t("heatmap_title"));

  svg.append("text")
    .attr("class", "building-heatmap-title")
    .attr("x", 0)
    .attr("y", 18)
    .text(t("heatmap_title"));

  const plotX = labelWidth;
  const plotY = headerHeight;

  const rowGroups = svg.append("g")
    .attr("transform", `translate(0, ${plotY})`)
    .selectAll("g")
    .data(rows)
    .join("g")
    .attr("transform", (_, index) => `translate(0, ${index * (cellHeight + rowGap)})`);

  rowGroups.append("text")
    .attr("class", "building-heatmap-label")
    .attr("x", 0)
    .attr("y", 15)
    .text((row) => row.label);

  rowGroups.selectAll("rect")
    .data((row) => row.hours.map((hour) => ({ ...hour, label: row.label })))
    .join("rect")
    .attr("class", "building-heatmap-cell")
    .attr("x", (hour) => plotX + hour.hour * (cellWidth + cellGap))
    .attr("y", 0)
    .attr("width", cellWidth)
    .attr("height", cellHeight)
    .attr("rx", 5)
    .attr("fill", (hour) => colorScale(hour.ratio))
    .attr("opacity", 0)
    .append("title")
    .text((hour) => `${hour.label} ${formatHour(hour.hour)}-${formatHour(hour.hour + 1)}: ${hour.busyRooms}/${hour.totalRooms} ${t("busy").toLowerCase()}`);

  rowGroups.selectAll("rect")
    .transition()
    .delay((hour) => hour.hour * 18)
    .duration(320)
    .attr("opacity", 0.95);

  const hourAxisY = plotY + rows.length * (cellHeight + rowGap) + 7;
  svg.append("g")
    .selectAll("text")
    .data([0, 6, 12, 18, 24])
    .join("text")
    .attr("class", "building-heatmap-hour")
    .attr("x", (hour) => hour === 24 ? plotX + heatmapWidth + cellWidth : plotX + hour * (cellWidth + cellGap))
    .attr("y", hourAxisY)
    .attr("text-anchor", (hour) => hour === 24 ? "end" : "middle")
    .text((hour) => formatHour(hour));

  const range = getSearchWindowTimelineRange();
  if (range) {
    [range.startMinutes, range.endMinutes].forEach((minutes) => {
      svg.append("line")
        .attr("class", "building-heatmap-search-marker")
        .attr("x1", plotX + (minutes / 60) * (cellWidth + cellGap))
        .attr("x2", plotX + (minutes / 60) * (cellWidth + cellGap))
        .attr("y1", plotY - 3)
        .attr("y2", plotY + rows.length * (cellHeight + rowGap) - rowGap + 3);
    });
  }

  const legendY = chartHeight - 10;
  const legendWidth = 248;
  const legendX = plotX + heatmapWidth / 2 - legendWidth / 2;
  const legendSwatchWidth = 15;
  const legendSwatchGap = 2;
  const legendSwatchCount = 8;
  const legendStripWidth =
    legendSwatchCount * legendSwatchWidth + (legendSwatchCount - 1) * legendSwatchGap;
  const legendStripX = (legendWidth - legendStripWidth) / 2;
  const legend = svg.append("g")
    .attr("class", "building-heatmap-legend")
    .attr("transform", `translate(${legendX}, ${legendY})`);

  legend.append("text")
    .attr("x", 0)
    .attr("y", 0)
    .attr("text-anchor", "start")
    .text(t("quiet"));

  d3.range(0, 8).forEach((step) => {
    legend.append("rect")
      .attr("x", legendStripX + step * (legendSwatchWidth + legendSwatchGap))
      .attr("y", -11)
      .attr("width", legendSwatchWidth)
      .attr("height", 10)
      .attr("rx", 3)
      .attr("fill", colorScale(step / 7));
  });

  legend.append("text")
    .attr("x", legendWidth)
    .attr("y", 0)
    .attr("text-anchor", "end")
    .text(t("busy"));
}

function applyAvailabilityFilter() {
  if (!buildingLayer) {
    return;
  }

  buildingLayer.setStyle(styleFeature);
}

function toggleAvailabilityFilter(bin) {
  hasUsedAvailabilityFilter = true;

  if (activeAvailabilityFilter && activeAvailabilityFilter.label === bin.label) {
    activeAvailabilityFilter = null;
  } else {
    activeAvailabilityFilter = bin;
  }

  applyAvailabilityFilter();
  renderAvailabilityLegend();
}

function renderAvailabilityLegend() {
  if (!campusAvailabilityChart) {
    return;
  }

  const existingLegend = campusAvailabilityChart.querySelector(".campus-availability-legend");

  if (existingLegend) {
    existingLegend.remove();
  }

  const legend = document.createElement("div");
  legend.className = "campus-availability-legend";

  const header = document.createElement("div");
  header.className = "campus-availability-legend-header";

  const title = document.createElement("span");
  title.textContent = t("availability_filter_title");
  header.appendChild(title);

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "campus-availability-legend-clear";
  clearButton.textContent = t("availability_filter_clear");
  clearButton.disabled = !activeAvailabilityFilter;
  clearButton.addEventListener("click", () => {
    if (!activeAvailabilityFilter) {
      return;
    }

    hasUsedAvailabilityFilter = true;

    activeAvailabilityFilter = null;
    applyAvailabilityFilter();
    renderAvailabilityLegend();
  });

  header.appendChild(clearButton);
  legend.appendChild(header);

  const width = 320;
  const height = 76;
  const margin = { top: 26, right: 12, bottom: 22, left: 12 };
  const trackX = margin.left;
  const trackY = 30;
  const trackWidth = width - margin.left - margin.right;
  const trackHeight = 12;

  const svg = d3.select(legend)
    .append("svg")
    .attr("class", "campus-availability-legend-svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-label", t("availability_filter_title"));

  const gradientId = "map-legend-gradient";
  const defs = svg.append("defs");
  const gradient = defs.append("linearGradient")
    .attr("id", gradientId)
    .attr("x1", "0%")
    .attr("x2", "100%");

  d3.range(0, 1.01, 0.2).forEach((step) => {
    gradient.append("stop")
      .attr("offset", `${step * 100}%`)
      .attr("stop-color", getColor(step));
  });

  svg.append("rect")
    .attr("class", "campus-availability-legend-track")
    .attr("x", trackX)
    .attr("y", trackY)
    .attr("width", trackWidth)
    .attr("height", trackHeight)
    .attr("rx", 6)
    .attr("fill", `url(#${gradientId})`);

  const binScale = d3.scaleBand()
    .domain(AVAILABILITY_BINS.map((bin) => bin.label))
    .range([trackX, trackX + trackWidth])
    .paddingInner(0.08)
    .paddingOuter(0.02);

  const shouldPulse = !activeAvailabilityFilter && !hasUsedAvailabilityFilter;

  const bins = svg.append("g")
    .attr("class", "campus-availability-legend-bins")
    .selectAll("rect")
    .data(AVAILABILITY_BINS)
    .join("rect")
    .attr("class", (bin) => {
      const classes = ["campus-availability-legend-bin"];

      if (activeAvailabilityFilter && activeAvailabilityFilter.label === bin.label) {
        classes.push("is-active");
      }

      if (shouldPulse) {
        classes.push("is-attention");
      }

      return classes.join(" ");
    })
    .style("animation-delay", (_, index) => (shouldPulse ? `${index * 120}ms` : null))
    .attr("x", (bin) => binScale(bin.label))
    .attr("y", trackY - 6)
    .attr("width", binScale.bandwidth())
    .attr("height", trackHeight + 12)
    .attr("rx", 7)
    .attr("role", "button")
    .attr("tabindex", 0)
    .attr("aria-label", (bin) => bin.label)
    .on("click", (_, bin) => toggleAvailabilityFilter(bin))
    .on("keydown", (event, bin) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleAvailabilityFilter(bin);
      }
    });

  bins.append("title")
    .text((bin) => bin.label);

  svg.append("text")
    .attr("class", "campus-availability-legend-label")
    .attr("x", trackX)
    .attr("y", trackY + 28)
    .attr("text-anchor", "start")
    .text(t("mostly_occupied"));

  svg.append("text")
    .attr("class", "campus-availability-legend-label")
    .attr("x", trackX + trackWidth)
    .attr("y", trackY + 28)
    .attr("text-anchor", "end")
    .text(t("mostly_free"));

  campusAvailabilityChart.appendChild(legend);
}

function formatSearchWindowShort() {
  if (!activeSearchWindow) {
    return "-";
  }

  const startDate = [
    String(activeSearchWindow.start.getDate()).padStart(2, "0"),
    String(activeSearchWindow.start.getMonth() + 1).padStart(2, "0"),
    String(activeSearchWindow.start.getFullYear()),
  ].join("/");
  const startTime = formatClockTime(activeSearchWindow.start);
  const endTime = formatClockTime(activeSearchWindow.end);

  return `${startDate} ${startTime} - ${endTime}`;
}

function renderCampusAvailabilityChart(features) {
  campusAvailabilityChart.innerHTML = "";

  if (!features.length) {
    return;
  }

  const chartWidth = 360;
  const chartHeight = 228;
  const margin = { top: 58, right: 14, bottom: 30, left: 14 };
  const plotWidth = chartWidth - margin.left - margin.right;
  const plotHeight = chartHeight - margin.top - margin.bottom;
  const bins = buildAvailabilityBins(features);
  const maxCount = Math.max(1, d3.max(bins, (bin) => bin.count));
  const xScale = d3.scaleBand()
    .domain(bins.map((bin) => bin.label))
    .range([0, plotWidth])
    .padding(0.24);
  const yScale = d3.scaleLinear()
    .domain([0, maxCount])
    .nice()
    .range([plotHeight, 0]);
  const curvePoints = bins.map((bin) => ({
    x: xScale(bin.label) + xScale.bandwidth() / 2,
    y: yScale(bin.count),
  }));
  const curveArea = d3.area()
    .x((point) => point.x)
    .y0(plotHeight)
    .y1((point) => point.y)
    .curve(d3.curveCatmullRom.alpha(0.6));
  const curveLine = d3.line()
    .x((point) => point.x)
    .y((point) => point.y)
    .curve(d3.curveCatmullRom.alpha(0.6));

  const svg = d3.select(campusAvailabilityChart)
    .append("svg")
    .attr("class", "campus-availability-svg")
    .attr("viewBox", `0 0 ${chartWidth} ${chartHeight}`)
    .attr("role", "img")
    .attr("aria-label", t("campus_summary_title"));

  svg.append("text")
    .attr("class", "campus-availability-title")
    .attr("x", chartWidth / 2)
    .attr("y", 14)
    .attr("text-anchor", "middle")
    .text(t("campus_summary_title"));

  svg.append("text")
    .attr("class", "campus-availability-window")
    .attr("x", chartWidth / 2)
    .attr("y", 30)
    .attr("text-anchor", "middle")
    .text(formatSearchWindowShort());

  const plot = svg.append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

  plot.append("g")
    .attr("class", "campus-availability-grid")
    .call(
      d3.axisLeft(yScale)
        .ticks(3)
        .tickSize(-plotWidth)
        .tickFormat("")
    )
    .call((axisGroup) => axisGroup.select(".domain").remove());

  const curveGroup = plot.append("g")
    .attr("class", "campus-availability-curve-group");

  curveGroup.append("path")
    .attr("class", "campus-availability-curve-fill")
    .attr("d", curveArea(curvePoints))
    .attr("opacity", 0)
    .transition()
    .duration(600)
    .attr("opacity", 1);

  const curvePath = curveGroup.append("path")
    .attr("class", "campus-availability-curve")
    .attr("d", curveLine(curvePoints));

  const curveLength = curvePath.node().getTotalLength();

  curvePath
    .attr("stroke-dasharray", `${curveLength} ${curveLength}`)
    .attr("stroke-dashoffset", curveLength)
    .transition()
    .duration(800)
    .ease(d3.easeCubicOut)
    .attr("stroke-dashoffset", 0);

  const bars = plot.selectAll(".campus-availability-bar")
    .data(bins)
    .join("rect")
    .attr("class", "campus-availability-bar")
    .attr("x", (bin) => xScale(bin.label))
    .attr("y", plotHeight)
    .attr("width", xScale.bandwidth())
    .attr("height", 0)
    .attr("rx", 8)
    .attr("fill", (bin) => getColor(bin.midpoint));

  bars.append("title")
    .text((bin) => `${bin.count} ${t("buildings_label").toLowerCase()} (${bin.label})`);

  bars.transition()
    .duration(700)
    .delay((_, index) => index * 70)
    .attr("y", (bin) => yScale(bin.count))
    .attr("height", (bin) => plotHeight - yScale(bin.count));

  plot.selectAll(".campus-availability-count")
    .data(bins)
    .join("text")
    .attr("class", "campus-availability-count")
    .attr("x", (bin) => xScale(bin.label) + xScale.bandwidth() / 2)
    .attr("y", (bin) => yScale(bin.count) - 7)
    .attr("text-anchor", "middle")
    .text((bin) => bin.count || "");

  plot.append("g")
    .attr("class", "campus-availability-axis")
    .attr("transform", `translate(0, ${plotHeight + 6})`)
    .call(d3.axisBottom(xScale).tickSize(0))
    .call((axisGroup) => axisGroup.select(".domain").remove());

  renderAvailabilityLegend();
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

function appendD3Segment(svg, xScale, segment) {
  const { startMinutes, endMinutes, className, title, labelText } = segment;

  if (endMinutes <= startMinutes) {
    return;
  }

  const x = xScale(startMinutes);
  const width = Math.max(1, xScale(endMinutes) - x);
  const group = svg.append("g")
    .attr("class", `timeline-segment ${className}`)
    .attr("tabindex", title ? 0 : null)
    .attr("transform", `translate(${x}, 10)`);

  group.append("rect")
    .attr("width", width)
    .attr("height", timelineRowHeight - 20)
    .attr("rx", 12)
    .attr("ry", 12);

  if (title) {
    group.append("title").text(title);
  }

  // Occupied blocks show their event title directly when there is enough room;
  // the full label is still available through the shared floating tooltip.
  if (labelText) {
    const clipId = `timeline-clip-${timelineClipId++}`;
    const labelPadding = 10;

    svg.append("clipPath")
      .attr("id", clipId)
      .append("rect")
      .attr("x", x + labelPadding)
      .attr("y", 10)
      .attr("width", Math.max(0, width - labelPadding * 2))
      .attr("height", timelineRowHeight - 20);

    group.append("text")
      .attr("class", "timeline-segment-label")
      .attr("x", labelPadding)
      .attr("y", 31)
      .attr("clip-path", `url(#${clipId})`)
      .text(labelText);

    group
      .on("mouseenter", (event) => showSegmentTooltip(event.currentTarget, labelText))
      .on("mouseleave", hideSegmentTooltip)
      .on("focus", (event) => showSegmentTooltip(event.currentTarget, labelText))
      .on("blur", hideSegmentTooltip);
  }
}

function buildRoomTimelineSegments(roomName) {
  const allRoomSlots = getRoomSlots(roomName);
  const slots = normalizeSlots(roomName);

  // If the room is not present in room_occupancy.json at all, only then do we
  // show the "no occupancy data" state. If it has records on other days but not
  // on the selected day, it should appear fully available.
  if (!allRoomSlots.length) {
    return null;
  }

  const segments = [];
  let cursor = 0;

  slots.forEach((slot) => {
    segments.push({
      startMinutes: cursor,
      endMinutes: slot.startMinutes,
      className: "timeline-segment-available",
      title: t("available_slot", {
        start: formatHour(Math.floor(cursor / 60)),
        end: slot.startIso.slice(11, 16),
      }),
    });

    segments.push({
      startMinutes: slot.startMinutes,
      endMinutes: slot.endMinutes,
      className: "timeline-segment-occupied",
      title: t("occupied_slot", {
        start: slot.startIso.slice(11, 16),
        end: slot.endIso.slice(11, 16),
        title: slot.title ? `: ${slot.title}` : "",
      }),
      labelText: slot.title || "",
    });

    cursor = slot.endMinutes;
  });

  segments.push({
    startMinutes: cursor,
    endMinutes: 24 * 60,
    className: "timeline-segment-available",
    title: t("available_slot", {
      start: formatHour(Math.floor(cursor / 60)),
      end: "24:00",
    }),
  });

  return segments;
}

// Draw the room timeline as a D3 SVG Gantt row:
// - red rounded bars for occupied periods
// - green rounded bars for the gaps between them
// If the room has no occupancy record at all, show the empty-data label instead.
function drawRoomTimeline(svgElement, roomName) {
  const svg = d3.select(svgElement);
  const xScale = buildTimelineScale();
  const segments = buildRoomTimelineSegments(roomName);

  appendTimelineGrid(svg, timelineRowHeight, xScale);
  appendSearchWindowBand(svg, timelineRowHeight, xScale);

  if (!segments) {
    svg.append("text")
      .attr("class", "timeline-empty-state")
      .attr("x", timelineWidth / 2)
      .attr("y", timelineRowHeight / 2)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .text(t("no_occupancy"));
    appendSearchWindowMarkers(svg, timelineRowHeight, xScale);
    return;
  }

  segments.forEach((segment) => {
    appendD3Segment(svg, xScale, segment);
  });

  appendSearchWindowMarkers(svg, timelineRowHeight, xScale);
}

// Wrap a timeline grid in a horizontally scrollable container.
function createTimelineScroll(isHeader = false, roomName = "") {
  const scroll = document.createElement("div");
  scroll.className = "timeline-scroll";
  const svg = createTimelineSvg(isHeader);

  if (isHeader) {
    drawTimelineHeader(svg);
  } else {
    drawRoomTimeline(svg, roomName);
  }

  scroll.appendChild(svg);
  return scroll;
}

// Touch devices struggle with the nested "vertical body + horizontal row"
// scrolling pattern. We resolve that by explicitly routing the gesture:
// horizontal drags move the row, vertical drags move the surrounding timeline.
function enableTouchTimelineGestures(scrollElements) {
  const coarsePointer = window.matchMedia("(hover: none) and (pointer: coarse)").matches;

  if (!coarsePointer) {
    return;
  }

  scrollElements.forEach((scrollElement) => {
    let touchState = null;

    scrollElement.addEventListener("touchstart", (event) => {
      const touch = event.touches[0];
      const timelineContainer = scrollElement.closest(".timeline-shell")?.querySelector(".timeline-body");

      touchState = {
        startX: touch.clientX,
        startY: touch.clientY,
        startLeft: scrollElement.scrollLeft,
        startTop: timelineContainer?.scrollTop || 0,
        mode: null,
        timelineContainer,
      };
    }, { passive: true });

    scrollElement.addEventListener("touchmove", (event) => {
      if (!touchState) {
        return;
      }

      const touch = event.touches[0];
      const deltaX = touch.clientX - touchState.startX;
      const deltaY = touch.clientY - touchState.startY;

      if (!touchState.mode) {
        touchState.mode = Math.abs(deltaX) >= Math.abs(deltaY) ? "horizontal" : "vertical";
      }

      if (touchState.mode === "horizontal") {
        event.preventDefault();
        scrollElement.scrollLeft = touchState.startLeft - deltaX;
        return;
      }

      if (touchState.timelineContainer) {
        event.preventDefault();
        touchState.timelineContainer.scrollTop = touchState.startTop - deltaY;
      }
    }, { passive: false });

    const clearTouchState = () => {
      touchState = null;
    };

    scrollElement.addEventListener("touchend", clearTouchState, { passive: true });
    scrollElement.addEventListener("touchcancel", clearTouchState, { passive: true });
  });
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
  let isSyncingProgrammatically = false;

  scrollElements.forEach((element) => {
    element.addEventListener("scroll", () => {
      if (isSyncingProgrammatically) {
        return;
      }

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
        isSyncingProgrammatically = true;
        scrollElements.forEach((other) => {
          if (other !== element) {
            other.scrollLeft = element.scrollLeft;
          }
        });

        isSyncingProgrammatically = false;
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
  buildingPanel.hidden = false;
  buildingPanel.classList.remove("is-empty");
  buildingPanelTitle.textContent = buildingCode;
  buildingPanelCopy.hidden = true;
  buildingMeta.hidden = true;

  const durationMinutes = getSearchDurationMinutes();
  const { available, unavailable } = splitRoomsByAvailability(
    rooms,
    activeSearchWindow,
    durationMinutes
  );

  renderBuildingSummaryChart(available, unavailable);
  renderBuildingHeatmapChart(rooms);

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

      const rowScroll = createTimelineScroll(false, roomEntry.room);

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

    const rowScroll = createTimelineScroll(false, "No room found");

    row.append(rowLabel, rowScroll);
    timelineBody.appendChild(row);
    scrollElements.push(rowScroll);
  }

  syncTimelineScroll(scrollElements);
  enableTouchTimelineGestures(scrollElements);
  centerTimelineOnSearchWindow(scrollElements);
  revealBuildingPanelIfNeeded();
}

// Return the side panel to its initial "select a building" state.
function resetBuildingPanel() {
  activeBuildingSelection = null;
  buildingPanel.hidden = true;
  buildingPanel.classList.add("is-empty");
  buildingPanelTitle.textContent = t("select_building");
  buildingPanelCopy.hidden = false;
  buildingPanelCopy.textContent = t("click_building_copy");
  buildingMeta.hidden = false;
  buildingMeta.innerHTML = `<span>${t("no_building_selected")}</span>`;
  buildingSummaryChart.innerHTML = "";
  buildingHeatmapChart.innerHTML = "";
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

function createPopupChartId(buildingName) {
  return `room-popup-chart-${normalizeBuildingCode(buildingName) || "building"}`;
}

function renderPopupAvailabilityChart(container, availableRooms, totalRooms) {
  container.innerHTML = "";

  const unavailableRooms = Math.max(0, totalRooms - availableRooms);
  const score = totalRooms ? availableRooms / totalRooms : 0;
  const width = 190;
  const height = 54;
  const barX = 0;
  const barY = 28;
  const barWidth = 188;
  const barHeight = 12;

  const svg = d3.select(container)
    .append("svg")
    .attr("class", "room-popup-chart-svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-label", t("availability_in_window", {
      available: availableRooms,
      rooms: totalRooms,
    }));

  svg.append("rect")
    .attr("class", "room-popup-chart-bg")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", width)
    .attr("height", height)
    .attr("rx", 10);

  svg.append("text")
    .attr("class", "room-popup-chart-value")
    .attr("x", 0)
    .attr("y", 14)
    .text(`${availableRooms}/${totalRooms}`);

  svg.append("text")
    .attr("class", "room-popup-chart-label")
    .attr("x", 48)
    .attr("y", 14)
    .text(t("available"));

  svg.append("rect")
    .attr("class", "room-popup-chart-track")
    .attr("x", barX)
    .attr("y", barY)
    .attr("width", barWidth)
    .attr("height", barHeight)
    .attr("rx", 6);

  svg.append("rect")
    .attr("class", "room-popup-chart-unavailable")
    .attr("x", barX + score * barWidth)
    .attr("y", barY)
    .attr("width", 0)
    .attr("height", barHeight)
    .attr("rx", 6)
    .transition()
    .duration(520)
    .attr("width", totalRooms ? (unavailableRooms / totalRooms) * barWidth : 0);

  svg.append("rect")
    .attr("class", "room-popup-chart-available")
    .attr("x", barX)
    .attr("y", barY)
    .attr("width", 0)
    .attr("height", barHeight)
    .attr("rx", 6)
    .transition()
    .duration(520)
    .attr("width", score * barWidth);

  svg.append("circle")
    .attr("class", "room-popup-chart-dot")
    .attr("cx", score * barWidth)
    .attr("cy", barY + barHeight / 2)
    .attr("r", 0)
    .attr("fill", getColor(score))
    .transition()
    .delay(260)
    .duration(320)
    .attr("r", 5);
}

function buildBuildingPopupContent(feature) {
  const { name, availableRooms, rooms } = feature.properties;
  const chartId = createPopupChartId(name);

  return `
    <div class="room-popup">
      <h4>${name}</h4>
      <div class="room-popup-chart" id="${chartId}"></div>
      <p>${t("availability_in_window", { available: availableRooms, rooms })}</p>
      <p><a href="${buildPlanEpflUrl(name)}" target="_blank" rel="noreferrer">${t("open_on_plan")}</a></p>
    </div>
  `;
}

function animateBuildingLayerStyles(features) {
  const nextScores = new Map(features.map((feature) => [
    feature.properties.name,
    feature.properties.score,
  ]));

  buildingLayer.eachLayer((layer) => {
    const element = layer.getElement?.();
    const feature = layer.feature;

    if (!element || !feature?.properties) {
      return;
    }

    const { name, score } = feature.properties;
    const inRange = isScoreInActiveFilter(score);

    if (activeAvailabilityFilter && !inRange) {
      const filteredStyle = getFeatureStyle(feature);

      d3.select(element)
        .interrupt()
        .transition()
        .duration(360)
        .ease(d3.easeCubicOut)
        .attr("fill", filteredStyle.fillColor)
        .attr("stroke", filteredStyle.color)
        .attr("fill-opacity", filteredStyle.fillOpacity)
        .attr("opacity", filteredStyle.opacity ?? 1)
        .attr("stroke-width", filteredStyle.weight ?? 1.2);
      return;
    }

    const previousScore = previousBuildingScores.has(name)
      ? previousBuildingScores.get(name)
      : score;
    const fillInterpolator = d3.interpolateRgb(getColor(previousScore), getColor(score));
    const borderInterpolator = d3.interpolateRgb(getBorderColor(previousScore), getBorderColor(score));
    const isStrongOption = score >= 0.8 && score > previousScore;

    d3.select(element)
      .interrupt()
      .transition()
      .duration(720)
      .ease(d3.easeCubicOut)
      .attrTween("fill", () => fillInterpolator)
      .attrTween("stroke", () => borderInterpolator)
      .attr("fill-opacity", 0.46)
      .on("end", () => {
        if (!isStrongOption) {
          return;
        }

        d3.select(element)
          .transition()
          .duration(180)
          .attr("stroke-width", 3)
          .attr("fill-opacity", 0.68)
          .transition()
          .duration(420)
          .attr("stroke-width", 1.2)
          .attr("fill-opacity", 0.42);
      });
  });

  previousBuildingScores = nextScores;
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
    layer.bindPopup(buildBuildingPopupContent(feature));
    layer.on("popupopen", () => {
      const chart = document.getElementById(createPopupChartId(name));

      if (chart) {
        renderPopupAvailabilityChart(chart, availableRooms, rooms);
      }
    });
  }

  layer.on("mouseover", () => {
    if (activeAvailabilityFilter && !isScoreInActiveFilter(getRenderedScore(feature))) {
      return;
    }

    layer.setStyle({
      weight: 2,
      fillOpacity: 0.62,
    });

    if (enableMapPopup) {
      layer.openPopup();
    }
  });

  layer.on("mouseout", () => {
    buildingLayer.resetStyle(layer);

    if (enableMapPopup) {
      layer.closePopup();
    }
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
  renderCampusAvailabilityChart(features);

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

  animateBuildingLayerStyles(features);

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
    const response = await fetch("https://ftpsens.epfl.ch/occupancy");

  if (!response.ok) {
    throw new Error("Could not load room occupancy data");
  }

  return await response.json();
}

// Convert the nested occupancy JSON structure into a map:
// normalized room name -> list of { title, startIso, endIso } events
// This keeps availability calculations fast while preserving event titles for
// the timeline's occupied blocks.
function indexOccupancyByRoom(payload) {
  const indexed = new Map();

  if (payload && typeof payload.then === "function") {
    console.warn("Occupancy payload is still a Promise. Await it before indexing.", payload);
    return indexed;
  }

  const entries = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.rooms)
      ? payload.rooms
      : [];

  if (!entries.length) {
    console.warn("Unexpected occupancy payload shape:", payload);
    return indexed;
  }

  entries.forEach((entry) => {
    const roomName = entry?.room || entry?.name;
    const date = entry?.date || entry?.day;

    if (!roomName || !date) {
      console.warn("Skipping malformed occupancy entry:", entry);
      return;
    }

    const roomKey = normalizeRoomKey(roomName);
    const events = [];

    (Array.isArray(entry?.events) ? entry.events : []).forEach((event) => {
      if (!event?.start || !event?.end) {
        console.warn(`Skipping malformed event for room ${roomName} on ${date}:`, event);
        return;
      }

      const [title, startIso, endIso] = [event.title, event.start, event.end];

      events.push({
        title: title || "",
        startIso,
        endIso,
      });
    });

    const existingEvents = indexed.get(roomKey) || [];
    indexed.set(roomKey, existingEvents.concat(events));
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
  const roomType = formatSelectedRoomTypesLabel();
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

let autoSearchTimer = null;

// Reuse the same search path as the submit button, but debounce free typing so
// we do not flash transient validation errors while the user is mid-input.
function scheduleAutoSearchApply(delayMs = 320) {
  if (autoSearchTimer) {
    clearTimeout(autoSearchTimer);
  }

  autoSearchTimer = setTimeout(() => {
    autoSearchTimer = null;
    const searchWindow = getSearchWindowFromForm();

    if (!searchWindow) {
      return;
    }

    applyCurrentSearch();
  }, delayMs);
}

function initializeAutoSearchListeners() {
  const startInput = document.getElementById("startTime");
  const endInput = document.getElementById("endTime");
  const durationSelect = document.getElementById("duration");
  const roomTypeCheckboxes = [
    document.getElementById("roomTypeConference"),
    document.getElementById("roomTypeStudy"),
  ];

  [startInput, endInput].forEach((input) => {
    input.addEventListener("input", () => {
      scheduleAutoSearchApply();
    });

    input.addEventListener("change", () => {
      applyCurrentSearch();
    });

    input.addEventListener("blur", () => {
      const searchWindow = getSearchWindowFromForm();

      if (searchWindow) {
        applyCurrentSearch();
      }
    });
  });

  durationSelect.addEventListener("change", () => {
    applyCurrentSearch();
  });

  roomTypeCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const checkedCount = roomTypeCheckboxes.filter((entry) => entry.checked).length;

      if (!checkedCount) {
        checkbox.checked = true;
      }

      applyCurrentSearch();
    });
  });
}

document.getElementById("availability-form").addEventListener("submit", (event) => {
  event.preventDefault();
  applyCurrentSearch();
});

initializeAutoSearchListeners();

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

    const [records, rooms, occupancyPayload] = await Promise.all([
      loadBuildingRecords(),
      loadRoomsDataset(),
      loadRoomOccupancyDataset(),
    ]);

    const occupancy =
      occupancyPayload && typeof occupancyPayload.then === "function"
        ? await occupancyPayload
        : occupancyPayload;

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
