"use client";

import { useEffect, useRef } from "react";

import { bboxFromPlaces } from "@/lib/active-trip";

export function ActiveTripPrecache({ slug }: { slug: string }) {
  const sentRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (sentRef.current === slug) return;

    let cancelled = false;
    const run = async () => {
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      if (!reg || cancelled) return;
      const controller = navigator.serviceWorker.controller;
      if (!controller) return;

      const [{ getBrowserToken }, { getTrip }] = await Promise.all([
        import("@/lib/auth.browser"),
        import("@/lib/api"),
      ]);
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
    };

    let idleId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    if ("requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(() => { void run(); }, { timeout: 3000 });
    } else {
      timeoutId = setTimeout(() => { void run(); }, 1200);
    }

    return () => {
      cancelled = true;
      if (idleId !== null) window.cancelIdleCallback(idleId);
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, [slug]);

  return null;
}
