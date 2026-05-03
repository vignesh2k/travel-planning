"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { deleteTrip } from "@/lib/api";
import { getBrowserToken } from "@/lib/auth.browser";
import type { TripSummary } from "@/lib/types";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatMonth(iso: string | null, fallback: string): string {
  if (!iso) return fallback;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return fallback;
  return MONTHS[d.getMonth()] ?? fallback;
}

function splitDestination(dest: string): { place: string; country: string } {
  const i = dest.indexOf(",");
  if (i === -1) return { place: dest.trim(), country: "" };
  return {
    place: dest.slice(0, i).trim(),
    country: dest.slice(i + 1).trim(),
  };
}

/** "37.7° N · 25.4° W" — same artsy mono style as the original handoff.
 *  Returns null when either coord is missing OR isn't a finite number. */
function formatCoord(
  lat: number | null | undefined,
  lng: number | null | undefined,
): string | null {
  const la = typeof lat === "number" ? lat : Number(lat);
  const ln = typeof lng === "number" ? lng : Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  const ns = la >= 0 ? "N" : "S";
  const ew = ln >= 0 ? "E" : "W";
  return `${Math.abs(la).toFixed(1)}° ${ns} · ${Math.abs(ln).toFixed(1)}° ${ew}`;
}

export function Logbook({ trips: initial }: { trips: TripSummary[] }) {
  const router = useRouter();
  const [trips, setTrips] = useState(initial);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  if (trips.length === 0) return null;

  async function doDelete(slug: string) {
    setBusy(slug);
    try {
      const token = await getBrowserToken();
      if (!token) return;
      await deleteTrip(slug, token);
      setTrips((prev) => prev.filter((t) => t.slug !== slug));
      setConfirming(null);
    } catch (e) {
      console.error("delete failed", e);
    } finally {
      setBusy(null);
    }
  }

  const collapsedCount = 4;
  const visible = expanded ? trips : trips.slice(0, collapsedCount);
  const canExpand = trips.length > collapsedCount;

  return (
    <div
      className="absolute pointer-events-auto z-30 overflow-hidden"
      style={{
        left: 32,
        right: 32,
        bottom: 24,
        background: "rgba(255,255,255,0.55)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        border: "1px solid rgba(31,26,20,0.06)",
        borderRadius: 12,
        padding: "14px 22px",
        maxHeight: expanded ? 800 : 180,
        // Strong but smooth deceleration. Same curve in both directions
        // so the rhythm feels consistent. Cubic-bezier(0.22, 1, 0.36, 1)
        // is the "ease-out quint" — fast start, gentle landing — no
        // overshoot. Pairs with the per-row fade-rise on the new entries.
        transition:
          "max-height 540ms cubic-bezier(0.22, 1, 0.36, 1)",
        willChange: "max-height",
      }}
    >
      <div className="flex justify-between items-center" style={{ marginBottom: 10 }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--color-paper-ink-3)",
          }}
        >
          Logbook · last entries
        </div>
        <button
          type="button"
          onClick={() => canExpand && setExpanded((v) => !v)}
          disabled={!canExpand}
          className="inline-flex items-center gap-1.5 hover:opacity-80 disabled:opacity-100 disabled:cursor-default transition-opacity"
          style={{
            fontSize: 11.5,
            color: "var(--color-terracotta-500)",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
          aria-expanded={expanded}
          aria-label={
            canExpand
              ? expanded
                ? "Collapse logbook"
                : `Show all ${trips.length} entries`
              : `${trips.length} entries`
          }
        >
          <span>{trips.length} {trips.length === 1 ? "entry" : "entries"}</span>
          {canExpand && (
            <Chevron
              direction={expanded ? "down" : "up"}
              className="text-[var(--color-terracotta-500)]"
            />
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-[18px] gap-y-3">
        {visible.map((t, idx) => {
          const { place, country } = splitDestination(t.destination);
          const month = formatMonth(t.start_date, "—");
          const isConfirming = confirming === t.slug;
          const isBusy = busy === t.slug;
          // Rows beyond the 4 always-visible ones fade-rise in with a
          // stagger when the strip expands. Skip the animation on the
          // first 4 (they're always there) and on collapse.
          const isExtraRow = expanded && idx >= collapsedCount;
          const riseDelay = isExtraRow
            ? Math.min((idx - collapsedCount) * 40, 320)
            : 0;

          function go() {
            if (isConfirming || isBusy) return;
            router.push(`/trip/${t.slug}`);
          }
          function onKey(e: React.KeyboardEvent) {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              go();
            }
          }
          function stop(e: React.MouseEvent | React.KeyboardEvent) {
            e.stopPropagation();
          }

          return (
            <div
              key={t.id}
              role="link"
              tabIndex={0}
              onClick={go}
              onKeyDown={onKey}
              aria-label={`Open trip ${place}`}
              className={
                "group relative pl-3 flex flex-col gap-1 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-terracotta-500)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent rounded-r-md " +
                (isExtraRow ? "atlas-row-rise" : "")
              }
              style={{
                borderLeft: "1px solid rgba(31,26,20,0.12)",
                animationDelay: isExtraRow ? `${riseDelay}ms` : undefined,
              }}
            >
              <div className="flex items-baseline justify-between gap-2 pr-7">
                <span
                  className="truncate group-hover:text-[var(--color-terracotta-500)] transition-colors"
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: "var(--color-paper-ink)",
                  }}
                >
                  {place}
                </span>
                {/* Hidden while confirming so the absolute Delete? Yes No
                    controls aren't sitting on top of it. */}
                {!isConfirming && (
                  <span
                    className="shrink-0"
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: "var(--color-paper-ink-4)",
                    }}
                  >
                    {month} · {t.days} {t.days === 1 ? "day" : "days"}
                  </span>
                )}
              </div>
              <div
                className="truncate"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: "0.04em",
                  color: "var(--color-paper-ink-4)",
                }}
              >
                {formatCoord(t.centroid_lat, t.centroid_lng) ?? country ?? "—"}
              </div>

              {/* Delete affordance — sits in the top-right with click events
                  isolated so the entry's onClick doesn't navigate when the
                  user is interacting with the × / Yes / No controls. */}
              <div
                className="absolute right-0 top-0 flex items-center gap-1.5 text-[11px]"
                onClick={stop}
                onKeyDown={stop}
              >
                {!isConfirming ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirming(t.slug);
                    }}
                    aria-label={`Delete ${place}`}
                    className="opacity-0 group-hover:opacity-100 text-[var(--color-paper-ink-4)] hover:text-[var(--color-terracotta-500)] transition-opacity"
                  >
                    ×
                  </button>
                ) : (
                  <>
                    <span className="text-[var(--color-paper-ink-4)]">Delete?</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        doDelete(t.slug);
                      }}
                      disabled={isBusy}
                      className="font-semibold text-[var(--color-terracotta-500)] hover:text-[var(--color-terracotta-400)] disabled:opacity-50"
                    >
                      {isBusy ? "…" : "Yes"}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirming(null);
                      }}
                      disabled={isBusy}
                      className="text-[var(--color-paper-ink-3)] hover:text-[var(--color-paper-ink)] disabled:opacity-50"
                    >
                      No
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Chevron({
  direction, className,
}: {
  direction: "up" | "down";
  className?: string;
}) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={{
        transform: direction === "up" ? "rotate(180deg)" : "none",
        transition: "transform 220ms ease-out",
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
