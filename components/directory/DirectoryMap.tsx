// components/directory/DirectoryMap.tsx
"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { CATEGORY_META, DISPLAY_CATEGORIES, type DirectoryHub } from "@/lib/directory";

/** Plain-number viewport box reported on every pan/zoom. */
export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

type PinState = "normal" | "hovered" | "selected";

interface Props {
  hubs: DirectoryHub[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onBoundsChange: (bounds: MapBounds) => void;
}

function pinIcon(hub: DirectoryHub, state: PinState): L.DivIcon {
  const color = CATEGORY_META[hub.category].color;
  const size = state === "selected" ? 38 : state === "hovered" ? 34 : 28;
  const innerClass = state === "hovered" ? "ws-pin-inner ws-pin-pop" : "ws-pin-inner";
  const html = `
    <div class="${innerClass}" style="display:inline-block;">
      <svg width="${size}" height="${size}" viewBox="0 0 24 24" style="display:block;filter:drop-shadow(0 1px 3px rgba(0,0,0,.35))">
        <path d="M12 0C6.5 0 2 4.5 2 10c0 7 10 14 10 14s10-7 10-14C22 4.5 17.5 0 12 0z"
          fill="${color}" stroke="#fff" stroke-width="${state !== "normal" ? 2.5 : 2}"/>
        <circle cx="12" cy="10" r="3.2" fill="rgba(255,255,255,.85)"/>
      </svg>
    </div>`;
  return L.divIcon({
    html,
    className: "ws-pin",
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    tooltipAnchor: [0, -size + 6],
  });
}

export default function DirectoryMap({ hubs, selectedId, hoveredId, onSelect, onBoundsChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const onSelectRef = useRef(onSelect);
  const onBoundsChangeRef = useRef(onBoundsChange);
  const selectedRef = useRef<string | null>(selectedId);
  const hoveredRef = useRef<string | null>(hoveredId);
  const didInitialFitRef = useRef(false);

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { onBoundsChangeRef.current = onBoundsChange; }, [onBoundsChange]);

  // Icon a marker should currently show, given selection (wins) then hover.
  const stateFor = (id: string): PinState =>
    id === selectedRef.current ? "selected" : id === hoveredRef.current ? "hovered" : "normal";

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { center: [20, 0], zoom: 2, minZoom: 2, worldCopyJump: true, scrollWheelZoom: true });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);
    const cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 45,
      chunkedLoading: true,
      iconCreateFunction: (c) =>
        L.divIcon({ html: `<div class="ws-cluster">${c.getChildCount()}</div>`, className: "ws-pin", iconSize: [30, 30] }),
    });
    map.addLayer(cluster);
    map.on("moveend", () => {
      const b = map.getBounds();
      onBoundsChangeRef.current({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });
    });
    // The container can start hidden (mobile) or change size; keep Leaflet in sync
    // and run the one-time world fit as soon as the map actually has pixels.
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
      const el = containerRef.current;
      if (!didInitialFitRef.current && el && el.offsetWidth > 0 && cluster.getLayers().length > 0) {
        map.fitBounds(cluster.getBounds(), { padding: [48, 48], maxZoom: 8 });
        didInitialFitRef.current = true;
      }
    });
    ro.observe(containerRef.current);
    mapRef.current = map;
    clusterRef.current = cluster;
    const markers = markersRef.current;
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; clusterRef.current = null; markers.clear(); };
  }, []);

  useEffect(() => {
    const map = mapRef.current, cluster = clusterRef.current;
    if (!map || !cluster) return;
    cluster.clearLayers();
    markersRef.current.clear();
    const located = hubs.filter((h) => h.coords !== null);
    for (const hub of located) {
      const [lat, lng] = hub.coords as [number, number];
      const marker = L.marker([lat, lng], { icon: pinIcon(hub, stateFor(hub.id)) });
      marker.bindTooltip(`<strong>${hub.name}</strong>${hub.country ? ` · ${hub.country}` : ""}`, { direction: "top" });
      marker.on("click", () => onSelectRef.current(hub.id));
      cluster.addLayer(marker);
      markersRef.current.set(hub.id, marker);
    }
    // Fit the world to the pins once, on first load only. Re-fitting on every
    // filter change would yank the map out from under the user as they browse;
    // they keep whatever view they've panned/zoomed to.
    if (!didInitialFitRef.current && located.length > 0 && (containerRef.current?.offsetWidth ?? 0) > 0) {
      map.fitBounds(cluster.getBounds(), { padding: [48, 48], maxZoom: 8 });
      didInitialFitRef.current = true;
    }
  }, [hubs]);

  useEffect(() => {
    const map = mapRef.current, cluster = clusterRef.current;
    if (!map || !cluster) return;
    const prev = selectedRef.current;
    selectedRef.current = selectedId;
    const prevHub = prev ? hubs.find((h) => h.id === prev) : null;
    const prevMarker = prev ? markersRef.current.get(prev) : null;
    if (prev && prevHub && prevMarker) prevMarker.setIcon(pinIcon(prevHub, stateFor(prev)));
    const hub = selectedId ? hubs.find((h) => h.id === selectedId) : null;
    const marker = selectedId ? markersRef.current.get(selectedId) : null;
    if (hub && marker) {
      marker.setIcon(pinIcon(hub, "selected"));
      cluster.zoomToShowLayer(marker, () => { map.panTo(marker.getLatLng()); marker.openTooltip(); });
    }
  }, [selectedId, hubs]);

  useEffect(() => {
    if (!mapRef.current) return;
    const prev = hoveredRef.current;
    hoveredRef.current = hoveredId;
    for (const id of [prev, hoveredId]) {
      if (!id) continue;
      const hub = hubs.find((h) => h.id === id);
      const marker = markersRef.current.get(id);
      if (hub && marker) {
        marker.setIcon(pinIcon(hub, stateFor(id)));
        marker.setZIndexOffset(id === hoveredId ? 1000 : 0);
      }
    }
  }, [hoveredId, hubs]);

  return (
    <>
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      <div className="absolute bottom-5 left-3 z-[1000] rounded-[10px] border border-line bg-white/95 px-3 py-2.5 shadow-[0_2px_10px_rgba(0,0,0,0.07)]" style={{ backdropFilter: "blur(6px)" }}>
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.07em] text-faint">Hub type</p>
        {DISPLAY_CATEGORIES.map((c) => (
          <div key={c} className="mb-1 flex items-center gap-2 last:mb-0">
            <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full" style={{ background: CATEGORY_META[c].color }} />
            <span className="text-[11.5px] font-medium text-ink">{CATEGORY_META[c].label}</span>
          </div>
        ))}
      </div>
    </>
  );
}
