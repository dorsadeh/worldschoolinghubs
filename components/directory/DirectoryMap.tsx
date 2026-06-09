// components/directory/DirectoryMap.tsx
"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { CATEGORY_META, type DirectoryHub } from "@/lib/directory";

interface Props {
  hubs: DirectoryHub[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function pinIcon(hub: DirectoryHub, selected: boolean): L.DivIcon {
  const color = CATEGORY_META[hub.category].color;
  const size = selected ? 40 : 30;
  const html = `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))">
      <path d="M12 0C6.5 0 2 4.5 2 10c0 7 10 14 10 14s10-7 10-14C22 4.5 17.5 0 12 0z"
        fill="${color}" stroke="#20140d" stroke-width="${selected ? 2.5 : 2}"/>
      <circle cx="12" cy="10" r="3.4" fill="#fff"/>
    </svg>`;
  return L.divIcon({ html, className: "ws-pin", iconSize: [size, size], iconAnchor: [size / 2, size], tooltipAnchor: [0, -size + 6] });
}

export default function DirectoryMap({ hubs, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const onSelectRef = useRef(onSelect);
  const selectedRef = useRef<string | null>(selectedId);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { center: [20, 0], zoom: 2, minZoom: 2, worldCopyJump: true, scrollWheelZoom: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19,
    }).addTo(map);
    const cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 45, chunkedLoading: true });
    map.addLayer(cluster);
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
      const marker = L.marker([lat, lng], { icon: pinIcon(hub, hub.id === selectedRef.current) });
      marker.bindTooltip(`<strong>${hub.name}</strong>${hub.country ? ` · ${hub.country}` : ""}`, { direction: "top" });
      marker.on("click", () => onSelectRef.current(hub.id));
      cluster.addLayer(marker);
      markersRef.current.set(hub.id, marker);
    }
    if (located.length > 0) map.fitBounds(cluster.getBounds(), { padding: [48, 48], maxZoom: 8 });
  }, [hubs]);

  useEffect(() => {
    const map = mapRef.current, cluster = clusterRef.current;
    if (!map || !cluster) return;
    const prev = selectedRef.current;
    selectedRef.current = selectedId;
    const prevHub = prev ? hubs.find((h) => h.id === prev) : null;
    const prevMarker = prev ? markersRef.current.get(prev) : null;
    if (prevHub && prevMarker) prevMarker.setIcon(pinIcon(prevHub, false));
    const hub = selectedId ? hubs.find((h) => h.id === selectedId) : null;
    const marker = selectedId ? markersRef.current.get(selectedId) : null;
    if (hub && marker) {
      marker.setIcon(pinIcon(hub, true));
      cluster.zoomToShowLayer(marker, () => { map.panTo(marker.getLatLng()); marker.openTooltip(); });
    }
  }, [selectedId, hubs]);

  return <div ref={containerRef} className="absolute inset-0 h-full w-full" />;
}
