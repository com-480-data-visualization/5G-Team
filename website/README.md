# EPFL Room Finder Prototype

This directory contains a static frontend prototype for the course project.

## Files

- The code is intentionally kept simple so it is easy to study in a browser plus a text editor.
- `index.html`: page structure, search controls, and the map container
- `styles.css`: Dawarich-inspired dark UI styling and responsive layout
- `app.js`: map setup, mocked availability markers, default form values, and demo-only search interactions

## Current behavior

- The search form accepts beginning, end, and duration inputs
- The search button does not call a backend yet
- The OpenStreetMap view is centered on EPFL using Leaflet
- Mocked building markers simulate future availability intensity

## Next steps

1. Replace the mock room array in `app.js` with data from the scraper or API.
2. Swap circle markers for a true heatmap layer once room coordinates and availability scores are available.
3. Add filtering by room capacity, building, or equipment if needed.
