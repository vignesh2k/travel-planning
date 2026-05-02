"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";

import type { Place } from "@/lib/types";

const CATEGORY_COLOR: Record<Place["category"], string> = {
  neighbourhood: "#4285f4",
  restaurant: "#34a853",
  photography_spot: "#ea4335",
  logistics: "#9534e6",
};

const CATEGORY_LABEL: Record<Place["category"], string> = {
  neighbourhood: "Neighbourhood",
  restaurant: "Restaurant",
  photography_spot: "Photo spot",
  logistics: "Logistics",
};

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

export function Map({
  places,
  focusPlaces,
}: {
  places: Place[];
  focusPlaces?: Place[] | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map_Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [0, 30],
      zoom: 1.5,
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Re-render markers when the place list changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      for (const m of markersRef.current) m.marker.remove();
      markersRef.current = [];

      const geocoded = places.filter(
        (p): p is Place & { lat: number; lng: number } => p.lat !== null && p.lng !== null,
      );
      for (const p of geocoded) {
        const el = document.createElement("div");
        el.style.width = "14px";
        el.style.height = "14px";
        el.style.borderRadius = "50%";
        el.style.background = CATEGORY_COLOR[p.category];
        el.style.border = "2px solid #fff";
        el.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2)";
        el.style.cursor = "pointer";
        el.style.transition = "transform 120ms ease, box-shadow 120ms ease";

        const popup = new maplibregl.Popup({
          offset: 14,
          closeButton: false,
          closeOnClick: false,
          className: "atlas-popup",
        }).setHTML(
          `<div style="font-family:Inter,system-ui,sans-serif;max-width:240px">
            <div style="font-size:10px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:${CATEGORY_COLOR[p.category]}">${CATEGORY_LABEL[p.category]}</div>
            <div style="font-size:13px;font-weight:600;color:#2a1f15;margin-top:2px">${escapeHtml(p.name.split(",")[0])}</div>
            <div style="font-size:11px;color:#6b5840;margin-top:4px;line-height:1.4">${escapeHtml(p.description)}</div>
          </div>`,
        );

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([p.lng, p.lat])
          .addTo(map);

        // Show popup on hover (not click). Closing on mouseleave with a tiny
        // delay so a quick mouseout-to-popup doesn't flicker.
        let closeTimer: number | undefined;
        const open = () => {
          if (closeTimer) {
            window.clearTimeout(closeTimer);
            closeTimer = undefined;
          }
          el.style.transform = "scale(1.35)";
          el.style.boxShadow = "0 3px 8px rgba(0,0,0,0.3)";
          if (!popup.isOpen()) {
            popup.setLngLat([p.lng, p.lat]).addTo(map);
          }
        };
        const scheduleClose = () => {
          closeTimer = window.setTimeout(() => {
            el.style.transform = "scale(1)";
            el.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2)";
            popup.remove();
          }, 120);
        };
        el.addEventListener("mouseenter", open);
        el.addEventListener("mouseleave", scheduleClose);

        markersRef.current.push({ marker, place: p });
      }

      // Initial fit to all if no explicit focus is set yet.
      if (geocoded.length > 0 && (!focusPlaces || focusPlaces.length === 0)) {
        const bounds = new maplibregl.LngLatBounds();
        for (const p of geocoded) bounds.extend([p.lng, p.lat]);
        map.fitBounds(bounds, { padding: 80, duration: 800, maxZoom: 13 });
      }
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places]);

  // Refit when focusPlaces changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!focusPlaces || focusPlaces.length === 0) return;

    const apply = () => {
      const geocoded = focusPlaces.filter(
        (p): p is Place & { lat: number; lng: number } => p.lat !== null && p.lng !== null,
      );
      if (geocoded.length === 0) return;

      if (geocoded.length === 1) {
        map.flyTo({ center: [geocoded[0].lng, geocoded[0].lat], zoom: 15, duration: 700 });
        // Don't auto-open the popup here — popups are hover-driven, and
        // auto-opening on a fly-to caused them to flicker off-screen as
        // the camera repositioned.
        return;
      }

      const bounds = new maplibregl.LngLatBounds();
      for (const p of geocoded) bounds.extend([p.lng, p.lat]);
      map.fitBounds(bounds, { padding: 100, duration: 700, maxZoom: 14 });
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [focusPlaces]);

  return <div ref={containerRef} className="w-full h-full" />;
}

interface Map_Marker {
  marker: maplibregl.Marker;
  place: Place;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
