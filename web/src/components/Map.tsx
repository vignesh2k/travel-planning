"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

import type { Place } from "@/lib/types";

const CATEGORY_COLOR: Record<Place["category"], string> = {
  neighbourhood: "#4285f4",
  restaurant: "#34a853",
  photography_spot: "#ea4335",
  logistics: "#9534e6",
};

export function Map({ places }: { places: Place[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [0, 30],
      zoom: 1.5,
    });
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const geocoded = places.filter((p): p is Place & { lat: number; lng: number } =>
      p.lat !== null && p.lng !== null,
    );
    if (geocoded.length === 0) return;

    const apply = () => {
      const old = (map as unknown as { _atlasMarkers?: mapboxgl.Marker[] })._atlasMarkers ?? [];
      for (const m of old) m.remove();

      const markers: mapboxgl.Marker[] = geocoded.map((p) => {
        const el = document.createElement("div");
        el.style.width = "14px";
        el.style.height = "14px";
        el.style.borderRadius = "50%";
        el.style.background = CATEGORY_COLOR[p.category];
        el.style.border = "2px solid #fff";
        el.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2)";
        return new mapboxgl.Marker(el).setLngLat([p.lng, p.lat]).addTo(map);
      });
      (map as unknown as { _atlasMarkers?: mapboxgl.Marker[] })._atlasMarkers = markers;

      const bounds = new mapboxgl.LngLatBounds();
      for (const p of geocoded) bounds.extend([p.lng, p.lat]);
      map.fitBounds(bounds, { padding: 80, duration: 800, maxZoom: 13 });
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [places]);

  return <div ref={containerRef} className="w-full h-full" />;
}
