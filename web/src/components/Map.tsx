"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";

import { fetchRoute, pickProfile } from "@/lib/osrm";
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
  dot: HTMLElement;
}

export function Map({
  places,
  focusPlaces,
  selectedPlaceName,
  onPlaceClick,
}: {
  places: Place[];
  focusPlaces?: Place[] | null;
  selectedPlaceName?: string | null;
  onPlaceClick?: (place: Place) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<MapMarker[]>([]);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const closeTimerRef = useRef<number | undefined>(undefined);
  const routeLabelsRef = useRef<maplibregl.Marker[]>([]);

  // Refs to latest callbacks/values so marker creation effect doesn't
  // re-run when they change.
  const onPlaceClickRef = useRef(onPlaceClick);
  const selectedRef = useRef(selectedPlaceName);

  useEffect(() => { onPlaceClickRef.current = onPlaceClick; }, [onPlaceClick]);
  useEffect(() => { selectedRef.current = selectedPlaceName; }, [selectedPlaceName]);

  // ── Initialise map (once) ────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [0, 30],
      zoom: 1.5,
    });
    mapRef.current = map;

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
      map.addSource("atlas-route", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "atlas-route-line",
        type: "line",
        source: "atlas-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#b45309",
          "line-opacity": 0.5,
          "line-width": 3,
          "line-dasharray": [2, 2],
        },
      });
    });

    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
      for (const m of routeLabelsRef.current) m.remove();
      routeLabelsRef.current = [];
      popup.remove();
      map.remove();
      mapRef.current = null;
      popupRef.current = null;
    };
  }, []);

  // ── Create / destroy markers only when places change ──────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const popup = popupRef.current;
    if (!map || !popup) return;

    const apply = () => {
      for (const m of markersRef.current) m.marker.remove();
      markersRef.current = [];

      const geocoded = places.filter(
        (p): p is Place & { lat: number; lng: number } =>
          p.lat !== null && p.lng !== null,
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
          for (const m of markersRef.current) {
            m.dot.style.transform = "scale(1)";
            m.dot.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2)";
          }
          popup.remove();
        }, 250);
      };

      const showFor = (
        p: Place & { lat: number; lng: number },
        dot: HTMLElement,
      ) => {
        cancelClose();
        for (const m of markersRef.current) {
          if (m.dot === dot) {
            m.dot.style.transform = "scale(1.4)";
            m.dot.style.boxShadow = "0 4px 10px rgba(0,0,0,0.35)";
          } else {
            m.dot.style.transform = "scale(1)";
            m.dot.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2)";
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
        dot.style.boxShadow =
          p.name === selectedRef.current
            ? "0 0 0 5px rgba(201,100,66,0.20), 0 4px 12px rgba(0,0,0,0.30)"
            : "0 2px 4px rgba(0,0,0,0.2)";
        dot.style.transform =
          p.name === selectedRef.current ? "scale(1.35)" : "scale(1)";
        dot.style.transition = "transform 120ms ease, box-shadow 120ms ease";
        dot.style.transformOrigin = "center";
        root.appendChild(dot);

        root.addEventListener("mouseenter", () => showFor(p, dot));
        root.addEventListener("mouseleave", scheduleClose);
        root.addEventListener("click", () =>
          onPlaceClickRef.current?.(p),
        );

        const marker = new maplibregl.Marker({ element: root })
          .setLngLat([p.lng, p.lat])
          .addTo(map);
        markersRef.current.push({ marker, place: p, dot });
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

  // ── Update marker visuals when selection changes (no DOM recreation) ─────
  useEffect(() => {
    for (const m of markersRef.current) {
      if (selectedPlaceName && m.place.name === selectedPlaceName) {
        m.dot.style.transform = "scale(1.35)";
        m.dot.style.boxShadow =
          "0 0 0 5px rgba(201,100,66,0.20), 0 4px 12px rgba(0,0,0,0.30)";
      } else {
        m.dot.style.transform = "scale(1)";
        m.dot.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2)";
      }
    }
  }, [selectedPlaceName]);

  // ── Refit when focusPlaces changes ──────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!focusPlaces || focusPlaces.length === 0) return;

    const apply = () => {
      const geocoded = focusPlaces.filter(
        (p): p is Place & { lat: number; lng: number } =>
          p.lat !== null && p.lng !== null,
      );
      if (geocoded.length === 0) return;

      if (geocoded.length === 1) {
        map.flyTo({
          center: [geocoded[0].lng, geocoded[0].lat],
          zoom: 15,
          duration: 700,
        });
        return;
      }

      const bounds = new maplibregl.LngLatBounds();
      for (const p of geocoded) bounds.extend([p.lng, p.lat]);
      map.fitBounds(bounds, { padding: 100, duration: 700, maxZoom: 14 });
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [focusPlaces]);

  // ── Update the route line whenever the active focus changes ─────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const ac = new AbortController();

    const apply = async () => {
      const source = map.getSource("atlas-route") as
        | maplibregl.GeoJSONSource
        | undefined;
      if (!source) return;

      const points = (focusPlaces ?? []).filter(
        (p): p is Place & { lat: number; lng: number } =>
          p.lat !== null && p.lng !== null,
      );

      for (const m of routeLabelsRef.current) m.remove();
      routeLabelsRef.current = [];

      if (points.length < 2) {
        source.setData({ type: "FeatureCollection", features: [] });
        return;
      }

      // Optimistic straight-line while OSRM is in flight.
      const straight: GeoJSON.FeatureCollection = {
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
      };
      source.setData(straight);

      for (const [i, point] of points.entries()) {
        const el = document.createElement("div");
        const isEnd = i === points.length - 1;
        el.style.cssText =
          `background:${isEnd ? "#b45309" : "#16a34a"};color:white;font-size:10px;font-weight:700;` +
          "min-width:18px;height:18px;padding:0 5px;border-radius:9999px;display:flex;align-items:center;justify-content:center;white-space:nowrap;" +
          "box-shadow:0 1px 4px rgba(0,0,0,0.2);pointer-events:none;" +
          "letter-spacing:0.02em;";
        el.textContent = `${i + 1}`;
        const marker = new maplibregl.Marker({ element: el, offset: [0, -22] })
          .setLngLat([point.lng, point.lat])
          .addTo(map);
        routeLabelsRef.current.push(marker);
      }

      const profile = pickProfile(points);
      const route = await fetchRoute(points, profile, ac.signal);
      if (ac.signal.aborted) return;
      if (!route) return;
      const stillCurrent = map.getSource("atlas-route") as
        | maplibregl.GeoJSONSource
        | undefined;
      if (!stillCurrent) return;
      stillCurrent.setData({
        type: "FeatureCollection",
        features: [
          { type: "Feature", properties: {}, geometry: route.geometry },
        ],
      });
    };

    if (map.isStyleLoaded() && map.getSource("atlas-route")) apply();
    else map.once("idle", apply);

    return () => {
      ac.abort();
    };
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
