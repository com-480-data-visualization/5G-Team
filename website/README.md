# EPFL Room Finder Prototype

This directory contains a static frontend prototype for the course project.

## Files

- The code is intentionally kept simple so it is easy to study in a browser plus a text editor.
- `index.html`: page structure, search controls, and the map container
- `styles.css`: Dawarich-inspired dark UI styling and responsive layout
- `app.js`: map setup, loading building ids from `epfl_buildings.json`, resolving OSM geometry, and demo-only search interactions

## Current behavior

- The search form accepts beginning, end, and duration inputs
- The search button does not call a backend yet
- The map loads building ids from `epfl_buildings.json`
- It resolves each id to real OpenStreetMap geometry or, if needed, a fallback bounds envelope
- Demo availability scores are layered on top of those building shapes for visualization

## Next steps

1. Extend `epfl_buildings.json` so it stores full geometry locally and avoids repeated OSM API calls.
2. Replace the demo availability scores with real room availability from the scraper or API.
3. Add filtering by room capacity, building, or equipment if needed.
