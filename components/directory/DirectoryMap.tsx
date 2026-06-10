// components/directory/DirectoryMap.tsx
"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { CATEGORY_META, type DirectoryHub } from "@/lib/directory";

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
  const { color, emoji } = CATEGORY_META[hub.category];
  const emphasised = state !== "normal";
  const size = state === "selected" ? 40 : state === "hovered" ? 38 : 30;
  const innerClass = state === "hovered" ? "ws-pin-inner ws-pin-pop" : "ws-pin-inner";
  const emojiSize = Math.round(size * 0.38);
  // Emoji is positioned at ~42% from top (where the pin body is widest)
  const html = `
    <div class="${innerClass}" style="position:relative;display:inline-block;">
      <svg width="${size}" height="${size}" viewBox="0 0 24 24" style="display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))">
        <path d="M12 0C6.5 0 2 4.5 2 10c0 7 10 14 10 14s10-7 10-14C22 4.5 17.5 0 12 0z"
          fill="${color}" stroke="#20140d" stroke-width="${emphasised ? 2.5 : 2}"/>
      </svg>
      <span style="position:absolute;top:42%;left:50%;transform:translate(-50%,-50%);font-size:${emojiSize}px;line-height:1;user-select:none;pointer-events:none;">${emoji}</span>
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
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19,
    }).addTo(map);
    const cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 45, chunkedLoading: true });
    map.addLayer(cluster);
    map.on("moveend", () => {
      const b = map.getBounds();
      onBoundsChangeRef.current({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });
    });
    mapRef.current = map;
    clusterRef.current = cluster;
    const markers = markersRef.current;
    return () => { map.remove(); mapRef.current = null; clusterRef.current = null; markers.clear(); };
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
    if (!didInitialFitRef.current && located.length > 0) {
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
      <div
        className="absolute bottom-5 left-3 z-[1000] rounded-xl border border-[#20140d]/15 bg-white/90 p-3 shadow-md"
        style={{ backdropFilter: "blur(6px)", fontFamily: "var(--font-body)" }}
      >
        <p className="mb-2 text-[9.5px] font-semibold uppercase tracking-widest text-[#20140d]/45" style={{ fontFamily: "var(--font-display)" }}>
          Hub type
        </p>
        {(Object.entries(CATEGORY_META) as [string, { label: string; color: string; emoji: string }][]).map(([, meta]) => (
          <div key={meta.label} className="mb-1 flex items-center gap-2 last:mb-0">
            <span className="inline-block h-3 w-3 flex-shrink-0 rounded-full border border-[#20140d]/20" style={{ background: meta.color }} />
            <span className="text-[11px] text-[#20140d]">{meta.emoji} {meta.label}</span>
          </div>
        ))}
      </div>
    </>
  );
}
