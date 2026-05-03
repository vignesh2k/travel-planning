"use client";

import { useEffect, useRef, useState } from "react";

const RADIUS = 360;          // px from title centre at which the warp begins
const MAX_LETTER_TIGHTEN = 0.07; // em — extra negative tracking at full warp
const MAX_SCALE_X_SQUEEZE = 0.10; // 0–1 — horizontal squeeze at full warp

/**
 * The page title squeezes toward the cursor: as the mouse approaches,
 * letters tighten and the whole word compresses on the X axis. Pulls
 * apart back to its rest layout when the cursor leaves. Skipped on
 * coarse pointers (touch) — the cursor isn't a thing there.
 */
export function WhereToTitle() {
  const ref = useRef<HTMLHeadingElement>(null);
  const [warp, setWarp] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const dist = Math.hypot(dx, dy);
        // Smoothstep so the warp eases in around the edge of the field
        // rather than turning on linearly.
        const t = Math.max(0, Math.min(1, 1 - dist / RADIUS));
        setWarp(t * t * (3 - 2 * t));
      });
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  const sx = 1 - warp * MAX_SCALE_X_SQUEEZE;
  const tracking = -0.03 - warp * MAX_LETTER_TIGHTEN;

  return (
    <h1
      ref={ref}
      style={{
        fontFamily: "var(--font-serif)",
        fontWeight: 400,
        letterSpacing: `${tracking}em`,
        lineHeight: 0.92,
        margin: 0,
        color: "var(--color-paper-ink)",
        transform: `scaleX(${sx})`,
        transformOrigin: "center center",
        transition: "transform 120ms ease-out, letter-spacing 120ms ease-out",
        willChange: "transform, letter-spacing",
      }}
      className="text-5xl sm:text-6xl md:text-8xl lg:text-[100px] atlas-rise atlas-rise-2"
    >
      Where to <em style={{ fontStyle: "italic" }}>next</em>?
    </h1>
  );
}
