"use client";

import { useEffect, useRef } from "react";

import { getTrip } from "@/lib/api";
import { getBrowserToken } from "@/lib/auth.browser";
import { bboxFromPlaces } from "@/lib/active-trip";

export function ActiveTripPrecache({ slug }: { slug: string }) {
  const sentRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (sentRef.current === slug) return;

    let cancelled = false;
    (async () => {
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      if (!reg || cancelled) return;
      const controller = navigator.serviceWorker.controller;
      if (!controller) return;

      const token = await getBrowserToken();
      if (!token || cancelled) return;
      const trip = await getTrip(slug, token).catch(() => null);
      if (!trip || cancelled) return;

      const bbox = bboxFromPlaces(trip.document.places);
      controller.postMessage({
        type: "precache-trip",
        slug,
        apiBase: process.env.NEXT_PUBLIC_API_BASE,
        bbox,
      });
      sentRef.current = slug;
    })();

    return () => { cancelled = true; };
  }, [slug]);

  return null;
}
