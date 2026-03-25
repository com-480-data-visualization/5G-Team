// Geographic center of the EPFL campus used to initialize the map view.
const epflCenter = [46.5191, 6.5668];

// Mock room-availability data.
// In the final version this would likely come from a scraper result or backend API.
const mockRooms = [
  { name: "Rolex Learning Center", coords: [46.51867, 6.56611], score: 0.92, rooms: 5 },
  { name: "BC Cluster", coords: [46.5202, 6.5682], score: 0.48, rooms: 2 },
  { name: "CO Building", coords: [46.5214, 6.5652], score: 0.64, rooms: 3 },
  { name: "INM Hub", coords: [46.5181, 6.5695], score: 0.76, rooms: 4 },
  { name: "MA Zone", coords: [46.5171, 6.5645], score: 0.31, rooms: 1 },
  { name: "CM Sector", coords: [46.5162, 6.5678], score: 0.57, rooms: 3 },
];

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

// Layer groups make it easy to clear and redraw all availability markers at once.
const group = L.layerGroup().addTo(map);

// Translate a numeric availability score into a color.
// Higher score = brighter color, which visually suggests higher availability.
function getColor(score) {
  if (score > 0.8) return "#8ef2c6";
  if (score > 0.6) return "#6ac0df";
  if (score > 0.4) return "#4b82d9";
  return "#2f4f85";
}

// Render all current room markers and update the summary metrics beside the map.
function renderMarkers() {
  // Remove any previous markers before drawing the current dataset.
  group.clearLayers();

  // These values are accumulated while looping through the mock data.
  let bestRoom = mockRooms[0];
  let totalRooms = 0;

  mockRooms.forEach((room) => {
    // Count the total number of free rooms shown on the map.
    totalRooms += room.rooms;

    // Track the room cluster with the highest availability score.
    if (room.score > bestRoom.score) bestRoom = room;

    // Circle markers are simpler than a heatmap, but already communicate density and strength.
    const marker = L.circleMarker(room.coords, {
      // Radius is scaled by score so more available areas feel more prominent.
      radius: 14 + room.score * 20,
      weight: 1,
      color: getColor(room.score),
      fillColor: getColor(room.score),
      fillOpacity: 0.45,
    });

    // Popups let the user inspect the mocked numbers behind each point.
    marker.bindPopup(`
      <div class="room-popup">
        <h4>${room.name}</h4>
        <p>Mock availability score: ${Math.round(room.score * 100)}%</p>
        <p>Estimated free rooms: ${room.rooms}</p>
      </div>
    `);

    marker.addTo(group);
  });

  // Reflect the current dataset in the legend card.
  document.getElementById("visibleRooms").textContent = totalRooms;
  document.getElementById("bestZone").textContent = bestRoom.name.replace(
    " Learning Center",
    ""
  );
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

// Central helper for updating the feedback banner under the search controls.
function setStatus(message) {
  document.getElementById("statusBanner").textContent = message;
}

// Intercept normal form submission so the page does not reload.
// For now we only echo the selected values back to the user.
document.getElementById("availability-form").addEventListener("submit", (event) => {
  event.preventDefault();

  const start = document.getElementById("startTime").value;
  const end = document.getElementById("endTime").value;
  const duration = document.getElementById("duration").value;

  setStatus(
    `Demo search saved: ${start || "no start"} to ${end || "no end"} for ${duration} minutes. Live room availability is not connected yet.`
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
    setStatus(`Preset applied: ${button.textContent}. This is still using mocked availability data.`);
  });
});

// Boot sequence: initialize the form first, then paint the map markers.
seedDefaultTimes();
renderMarkers();
