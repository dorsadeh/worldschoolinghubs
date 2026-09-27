// Basemap tiles shared by every Leaflet map in the app.
//
// We used CARTO Voyager until Sept 2026, when CARTO started stamping keyless
// requests with an "API KEY REQUIRED" watermark. OpenStreetMap's standard
// tiles need no key; keep the attribution in sync with the tile source.
export const BASEMAP_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
export const BASEMAP_MAX_ZOOM = 19;
