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

interface MapMarker {
  marker: maplibregl.Marker;
  place: Place & { lat: number; lng: number };
}

export function Map({
  places,
  focusPlaces,
}: {
  places: Place[];
  focusPlaces?: Place[] | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<MapMarker[]>([]);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const closeTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [0, 30],
      zoom: 1.5,
    });
    mapRef.current = map;

    // One shared hover popup re-used across all markers. Anchored
    // explicitly to "bottom" so the body always grows UP from the dot
    // (no auto-flip that could overlap the marker), with a generous
    // 18px offset for clear visual separation. closeOnMove=false so
    // panning the map while reading doesn't dismiss it.
    const popup = new maplibregl.Popup({
      offset: 18,
      anchor: "bottom",
      closeButton: false,
      closeOnClick: false,
      closeOnMove: false,
      className: "atlas-popup",
      maxWidth: "260px",
    });
    popupRef.current = popup;

    map.on("load", () => {
      // Route source (always present; data swapped on focusPlaces change).
      map.addSource("atlas-route", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      // HTML markers float above any GL layer, so the dots stay clickable.
      map.addLayer({
        id: "atlas-route-line",
        type: "line",
        source: "atlas-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#b45309",      // amber-700
          "line-opacity": 0.5,
          "line-width": 3,
          "line-dasharray": [2, 2],
        },
      });
    });

    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
      popup.remove();
      map.remove();
      mapRef.current = null;
      popupRef.current = null;
    };
  }, []);

  // Re-render markers when the place list changes.
  useEffect(() => {
    const map = mapRef.current;
    const popup = popupRef.current;
    if (!map || !popup) return;

    const apply = () => {
      for (const m of markersRef.current) m.marker.remove();
      markersRef.current = [];

      const geocoded = places.filter(
        (p): p is Place & { lat: number; lng: number } => p.lat !== null && p.lng !== null,
      );

      const cancelClose = () => {
        if (closeTimerRef.current) {
          window.clearTimeout(closeTimerRef.current);
          closeTimerRef.current = undefined;
        }
      };
      const scheduleClose = () => {
        cancelClose();
        closeTimerRef.current = window.setTimeout(() => {
          // Reset the inner-dot scale on every marker. Importantly we
          // touch the inner dot, NEVER the marker root (which holds
          // maplibre's `translate(...)` for positioning).
          for (const m of markersRef.current) {
            const dot = m.marker.getElement().firstElementChild as HTMLElement | null;
            if (dot) {
              dot.style.transform = "scale(1)";
              dot.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2)";
            }
          }
          popup.remove();
        }, 250);
      };

      const showFor = (p: Place & { lat: number; lng: number }, dot: HTMLElement) => {
        cancelClose();
        for (const m of markersRef.current) {
          const otherDot = m.marker.getElement().firstElementChild as HTMLElement | null;
          if (!otherDot) continue;
          if (otherDot === dot) {
            otherDot.style.transform = "scale(1.4)";
            otherDot.style.boxShadow = "0 4px 10px rgba(0,0,0,0.35)";
          } else {
            otherDot.style.transform = "scale(1)";
            otherDot.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2)";
          }
        }
        popup
          .setLngLat([p.lng, p.lat])
          .setHTML(
            `<div style="font-family:Inter,system-ui,sans-serif;max-width:240px">
              <div style="font-size:10px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:${CATEGORY_COLOR[p.category]}">${CATEGORY_LABEL[p.category]}</div>
              <div style="font-size:13px;font-weight:600;color:#2a1f15;margin-top:2px">${escapeHtml(p.name.split(",")[0])}</div>
              <div style="font-size:11px;color:#6b5840;margin-top:4px;line-height:1.4">${escapeHtml(p.description)}</div>
            </div>`,
          )
          .addTo(map);

        requestAnimationFrame(() => {
          const popupEl = popup.getElement();
          if (!popupEl) return;
          popupEl.style.pointerEvents = "auto";
          popupEl.onmouseenter = cancelClose;
          popupEl.onmouseleave = scheduleClose;
        });
      };

      for (const p of geocoded) {
        // The marker ROOT must remain "pristine" — maplibre rewrites its
        // transform to position it. We render the visual dot as a CHILD
        // and animate scale on the child instead.
        const root = document.createElement("div");
        root.style.width = "14px";
        root.style.height = "14px";
        root.style.cursor = "pointer";

        const dot = document.createElement("div");
        dot.style.width = "100%";
        dot.style.height = "100%";
        dot.style.borderRadius = "50%";
        dot.style.background = CATEGORY_COLOR[p.category];
        dot.style.border = "2px solid #fff";
        dot.style.boxSizing = "border-box";
        dot.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2)";
        dot.style.transition = "transform 120ms ease, box-shadow 120ms ease";
        dot.style.transformOrigin = "center";
        root.appendChild(dot);

        root.addEventListener("mouseenter", () => showFor(p, dot));
        root.addEventListener("mouseleave", scheduleClose);

        const marker = new maplibregl.Marker({ element: root })
          .setLngLat([p.lng, p.lat])
          .addTo(map);
        markersRef.current.push({ marker, place: p });
      }

      // Initial fit if no explicit focus set yet.
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
        return;
      }

      const bounds = new maplibregl.LngLatBounds();
      for (const p of geocoded) bounds.extend([p.lng, p.lat]);
      map.fitBounds(bounds, { padding: 100, duration: 700, maxZoom: 14 });
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [focusPlaces]);

  // Update the route line whenever the active focus changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const source = map.getSource("atlas-route") as
        | maplibregl.GeoJSONSource
        | undefined;
      if (!source) return;

      const points = (focusPlaces ?? []).filter(
        (p): p is Place & { lat: number; lng: number } =>
          p.lat !== null && p.lng !== null,
      );

      if (points.length < 2) {
        source.setData({ type: "FeatureCollection", features: [] });
        return;
      }

      source.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: points.map((p) => [p.lng, p.lat]),
            },
          },
        ],
      });
    };

    if (map.isStyleLoaded() && map.getSource("atlas-route")) apply();
    else map.once("idle", apply);
  }, [focusPlaces]);

  return <div ref={containerRef} className="w-full h-full" />;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
