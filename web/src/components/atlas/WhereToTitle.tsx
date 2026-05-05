"use client";

import { useLayoutEffect, useRef } from "react";

const TEXT_PARTS: { text: string; italic: boolean }[] = [
  { text: "Where to ", italic: false },
  { text: "next", italic: true },
  { text: "?", italic: false },
];

const RADIUS = 140;       // px — cursor's influence range per letter
const LIFT = 14;          // px — max upward travel
const PUSH = 8;           // px — max horizontal push away from cursor
const SCALE_BUMP = 0.12;  // 0–1 — max extra scale at peak

/**
 * Each letter is its own span and reacts to the cursor's distance from
 * its own centre. Letters rise (and gently push aside) as the cursor
 * approaches, then settle on the way out — so dragging the mouse
 * through the word leaves a wake behind it. CSS transitions on each
 * letter give the trailing/lagging "fluid" feel without manual physics.
 *
 * Transforms are written directly to each letter's style on every
 * mousemove via rAF — React doesn't re-render per frame.
 */
export function WhereToTitle() {
  const ref = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;

    const root = ref.current;
    if (!root) return;
    const fine = window.matchMedia("(pointer: fine)");

    type LetterRec = { el: HTMLSpanElement; cx: number; cy: number };
    let letters: LetterRec[] = [];

    function measure() {
      const els = root!.querySelectorAll<HTMLSpanElement>("[data-letter]");
      letters = Array.from(els).map((el) => {
        const r = el.getBoundingClientRect();
        return { el, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
      });
    }

    function reset() {
      for (const { el } of letters) {
        el.style.transform = "translate3d(0,0,0) scale(1)";
      }
    }

    let raf = 0;
    let mx = -9999;
    let my = -9999;

    function apply() {
      for (const { el, cx, cy } of letters) {
        const dx = mx - cx;
        const dy = my - cy;
        const d = Math.hypot(dx, dy);
        const t = Math.max(0, 1 - d / RADIUS);
        // smoothstep so the influence eases in at the edge of the field
        const s = t * t * (3 - 2 * t);

        if (s < 0.005) {
          el.style.transform = "translate3d(0,0,0) scale(1)";
          continue;
        }
        // Repulsion: letter is pushed AWAY from cursor on the X axis,
        // so the cursor parts the word like a finger through water.
        const tx = d > 0 ? (-dx / d) * PUSH * s : 0;
        // Vertical: letter rises toward the cursor, capped by LIFT.
        const ty = -LIFT * s;
        const sc = 1 + SCALE_BUMP * s;
        el.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${sc})`;
      }
    }

    function onMove(e: MouseEvent) {
      mx = e.clientX;
      my = e.clientY;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(apply);
    }

    function onLeave() {
      mx = -9999;
      my = -9999;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(apply);
    }

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true, capture: true });

    if (fine.matches) {
      window.addEventListener("mousemove", onMove);
      document.addEventListener("mouseleave", onLeave);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      reset();
    };
  }, []);

  return (
    <h1
      ref={ref}
      style={{
        fontFamily: "var(--font-serif)",
        fontWeight: 400,
        letterSpacing: "-0.03em",
        lineHeight: 0.92,
        margin: 0,
        color: "var(--color-paper-ink)",
      }}
      className="text-5xl sm:text-6xl md:text-8xl lg:text-[100px] atlas-rise atlas-rise-2"
    >
      {TEXT_PARTS.map((part, pi) =>
        part.italic ? (
          <em key={pi} style={{ fontStyle: "italic" }}>
            {Array.from(part.text).map((ch, i) => (
              <Letter key={`${pi}-${i}`} ch={ch} />
            ))}
          </em>
        ) : (
          <span key={pi}>
            {Array.from(part.text).map((ch, i) => (
              <Letter key={`${pi}-${i}`} ch={ch} />
            ))}
          </span>
        ),
      )}
    </h1>
  );
}

function Letter({ ch }: { ch: string }) {
  // Spaces need a non-breaking space, otherwise the inline-block span
  // collapses to width zero and the layout closes up.
  const display = ch === " " ? " " : ch;
  return (
    <span
      data-letter
      style={{
        display: "inline-block",
        // Long, eased transition so a fast cursor sweep leaves a
        // visible wake behind. The wake is what reads as fluid.
        transition: "transform 380ms cubic-bezier(0.22, 1, 0.36, 1)",
        willChange: "transform",
      }}
    >
      {display}
    </span>
  );
}
