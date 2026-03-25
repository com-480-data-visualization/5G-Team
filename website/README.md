# EPFL Room Finder Prototype

This directory contains a static frontend prototype for the course project.

## Files

- The code is intentionally kept simple so it is easy to study in a browser plus a text editor.
- `index.html`: page structure, search controls, and the map container
- `styles.css`: Dawarich-inspired dark UI styling and responsive layout
- `app.js`: map setup, synthetic building polygons, default form values, and demo-only search interactions

## Current behavior

- The search form accepts beginning, end, and duration inputs
- The search button does not call a backend yet
- The OpenStreetMap view is centered on EPFL using Leaflet
- Synthetic GeoJSON building boxes simulate future availability intensity

## Next steps

1. Replace the mock room array in `app.js` with data from the scraper or API.
2. Replace the synthetic boxes with real EPFL building geometry or footprints.
3. Add filtering by room capacity, building, or equipment if needed.
