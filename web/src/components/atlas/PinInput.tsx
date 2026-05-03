"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AirportInput } from "@/components/AirportInput";
import { StreamingOverlay } from "@/components/StreamingOverlay";
import { airportByCode } from "@/lib/airports";
import { getBrowserToken } from "@/lib/auth.browser";
import { streamTrip } from "@/lib/streamingTrip";
import type { Place } from "@/lib/types";

const SUGGESTIONS: { coord: string; label: string; prompt: string }[] = [
  { coord: "38.7° N", label: "Lisbon, slow weekend", prompt: "A long weekend in Lisbon" },
  { coord: "46.4° N", label: "Dolomites, on foot", prompt: "Hiking week in the Dolomites" },
  { coord: "16.0° N", label: "Vietnam, by bowl", prompt: "10 days through Vietnam, street food focus" },
  { coord: "64.1° N", label: "Reykjavík, in winter", prompt: "5 days in Reykjavík, in winter" },
];

function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function PinInput() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [chars, setChars] = useState(0);
  const [places, setPlaces] = useState<Place[]>([]);

  // Structured fields that ride along on the brief.
  const [startDate, setStartDate] = useState<string | null>(null);
  const [airportEntry, setAirportEntry] = useState<string | null>(null);
  const [airportExit, setAirportExit] = useState<string | null>(null);

  const canSubmit = text.trim().length >= 3 && !pending;

  async function submit() {
    if (!canSubmit) return;
    setPending(true);
    setStatus("Sending your brief…");
    setChars(0);
    setPlaces([]);
    try {
      const token = await getBrowserToken();
      if (!token) {
        router.push("/auth/signin");
        return;
      }
      await streamTrip(
        process.env.NEXT_PUBLIC_API_BASE!,
        token,
        {
          text: text.trim(),
          start_date: startDate || undefined,
          airport_entry: airportEntry || undefined,
          airport_exit: airportExit || undefined,
        },
        {
          onStatus: setStatus,
          onProgress: setChars,
          onPlace: (p) => setPlaces((prev) => [...prev, p]),
          onDone: (slug) => router.push(`/trip/${slug}`),
          onError: (e) => {
            console.error(e);
            setStatus(`Error: ${e.message}`);
            setPending(false);
          },
        },
      );
    } catch (e) {
      console.error(e);
      setPending(false);
    }
  }

  return (
    <>
      <form
        className="relative flex justify-center"
        style={{ marginTop: 36 }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {/* Concentric pin-ripple rings behind the input. */}
        <div
          className={
            "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none hidden md:block " +
            (focused ? "atlas-ripple-on" : "")
          }
          style={{ width: 580, height: 100 }}
          aria-hidden="true"
        >
          <div
            className="absolute"
            style={{
              inset: -20,
              border: "1px solid rgba(201,100,66,0.18)",
              borderRadius: 100,
            }}
          />
          <div
            className="absolute"
            style={{
              inset: -60,
              border: "1px solid rgba(201,100,66,0.10)",
              borderRadius: 100,
            }}
          />
          <div
            className="absolute"
            style={{
              inset: -110,
              border: "1px solid rgba(201,100,66,0.05)",
              borderRadius: 100,
            }}
          />
        </div>

        <div
          className="bg-white flex items-center gap-3 relative z-10 w-full md:w-[580px] transition-colors"
          style={{
            border: focused
              ? "1px solid rgba(201,100,66,0.55)"
              : "1px solid rgba(31,26,20,0.10)",
            borderRadius: 14,
            padding: "14px 14px 14px 18px",
            boxShadow:
              "0 16px 40px -20px rgba(31,26,20,0.25), 0 2px 6px -3px rgba(31,26,20,0.08)",
          }}
        >
          <PinIcon className="shrink-0 text-[var(--color-terracotta-500)]" />
          <label htmlFor="atlas-pin" className="sr-only">
            Describe your trip
          </label>
          <input
            id="atlas-pin"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            disabled={pending}
            placeholder="7 days in Kyoto, mid-October — slow & cultural"
            className="flex-1 bg-transparent outline-none text-[14px] text-[var(--color-paper-ink-2)] placeholder:text-[var(--color-paper-ink-4)] disabled:opacity-60"
            style={{ fontFamily: "var(--font-sans)" }}
          />
          <button
            type="submit"
            disabled={!canSubmit}
            aria-label="Plan trip"
            className="shrink-0 w-[38px] h-[38px] rounded-[10px] flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-shadow hover:shadow-md"
            style={{
              background:
                "linear-gradient(135deg, var(--color-terracotta-400) 0%, var(--color-terracotta-500) 100%)",
            }}
          >
            <ArrowUp />
          </button>
        </div>
      </form>

      {/* Context pills (dates + airports) — match the suggestion chip
          aesthetic so the controls don't break the cartographic feel. */}
      <div
        className="flex flex-wrap justify-center"
        style={{ marginTop: 18, gap: 10 }}
      >
        <DatesPill value={startDate} onChange={setStartDate} disabled={pending} />
        <AirportsPill
          entry={airportEntry}
          exit={airportExit}
          onChange={(en, ex) => {
            setAirportEntry(en);
            setAirportExit(ex);
          }}
          disabled={pending}
        />
      </div>

      {/* Suggestion chips */}
      <div
        className="flex flex-wrap justify-center"
        style={{ marginTop: 18, gap: 10 }}
      >
        {SUGGESTIONS.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setText(s.prompt)}
            className="atlas-pill inline-flex items-center gap-2 rounded-full border"
            style={{
              padding: "6px 12px 6px 8px",
              background: "rgba(255,255,255,0.6)",
              borderColor: "rgba(31,26,20,0.06)",
              backdropFilter: "blur(4px)",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9.5,
                color: "var(--color-paper-ink-4)",
                letterSpacing: "0.06em",
                padding: "2px 6px",
                background: "var(--color-paper-cream-2)",
                borderRadius: 999,
              }}
            >
              {s.coord}
            </span>
            <span style={{ fontSize: 12.5, color: "var(--color-paper-ink-2)" }}>
              {s.label}
            </span>
          </button>
        ))}
      </div>

      {pending && <StreamingOverlay status={status} chars={chars} places={places} />}
    </>
  );
}

// ── Atlas-styled context pills ───────────────────────────────────────────────

function ContextPill({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="atlas-pill inline-flex items-center gap-2 rounded-full border disabled:opacity-50"
      style={
        active
          ? {
              padding: "6px 12px 6px 10px",
              background: "rgba(201,100,66,0.10)",
              borderColor: "rgba(201,100,66,0.35)",
              color: "var(--color-terracotta-500)",
              backdropFilter: "blur(4px)",
              fontSize: 12.5,
              lineHeight: 1,
            }
          : {
              padding: "6px 12px 6px 10px",
              background: "rgba(255,255,255,0.6)",
              borderColor: "rgba(31,26,20,0.06)",
              color: "var(--color-paper-ink-2)",
              backdropFilter: "blur(4px)",
              fontSize: 12.5,
              lineHeight: 1,
            }
      }
    >
      {children}
    </button>
  );
}

function DatesPill({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (wrapperRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div ref={wrapperRef} className="relative">
      <ContextPill
        active={Boolean(value)}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
      >
        <CalendarGlyph />
        {value ? formatShortDate(value) : "Pick a start date"}
      </ContextPill>
      {open && (
        <div
          className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-30 flex flex-col gap-2"
          style={{
            width: 240,
            padding: 12,
            background: "rgba(255,255,255,0.96)",
            border: "1px solid rgba(31,26,20,0.08)",
            borderRadius: 12,
            boxShadow: "0 16px 40px -20px rgba(31,26,20,0.25)",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--color-paper-ink-3)",
            }}
          >
            Trip start date
          </div>
          <input
            type="date"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            className="w-full rounded-[8px] px-2 py-1.5 text-sm outline-none"
            style={{
              background: "rgba(255,255,255,0.85)",
              border: "1px solid rgba(31,26,20,0.10)",
              color: "var(--color-paper-ink)",
            }}
          />
          <div className="flex items-center gap-2 mt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-[8px] text-xs font-semibold px-3 py-1"
              style={{ background: "var(--color-paper-ink)", color: "white" }}
            >
              Done
            </button>
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="text-xs ml-auto"
                style={{ color: "var(--color-terracotta-500)" }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AirportsPill({
  entry,
  exit,
  onChange,
  disabled,
}: {
  entry: string | null;
  exit: string | null;
  onChange: (en: string | null, ex: string | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (wrapperRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [open]);

  const entryAirport = entry ? airportByCode(entry) : null;
  const exitAirport = exit ? airportByCode(exit) : null;
  const left = entryAirport?.city || entry;
  const right = exitAirport?.city || exit;
  let label: string;
  if (left && right && left !== right) label = `${left} → ${right}`;
  else if (left) label = left;
  else if (right) label = right;
  else label = "Add airports";

  return (
    <div ref={wrapperRef} className="relative">
      <ContextPill
        active={Boolean(entry || exit)}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
      >
        <AirplaneGlyph />
        {label}
      </ContextPill>
      {open && (
        <div
          className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-30 flex flex-col gap-3"
          style={{
            width: 300,
            padding: 12,
            background: "rgba(255,255,255,0.96)",
            border: "1px solid rgba(31,26,20,0.08)",
            borderRadius: 12,
            boxShadow: "0 16px 40px -20px rgba(31,26,20,0.25)",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--color-paper-ink-3)",
            }}
          >
            Airports
          </div>
          <AirportInput
            label="Entry (arriving)"
            value={entry}
            onChange={(en) => onChange(en, exit)}
            placeholder="e.g. London or LHR"
            autoFocus
          />
          <AirportInput
            label="Exit (departing home)"
            value={exit}
            onChange={(ex) => onChange(entry, ex)}
            placeholder="Same as entry, or different"
          />
          <div className="flex items-center gap-2 mt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-[8px] text-xs font-semibold px-3 py-1"
              style={{ background: "var(--color-paper-ink)", color: "white" }}
            >
              Done
            </button>
            {(entry || exit) && (
              <button
                type="button"
                onClick={() => {
                  onChange(null, null);
                  setOpen(false);
                }}
                className="text-xs ml-auto"
                style={{ color: "var(--color-terracotta-500)" }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PinIcon({ className }: { className?: string }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

/** SF Symbols-style "calendar" glyph. Stroke-only, rounded line caps,
 *  scales with the surrounding font-size so the optical weight stays
 *  matched to the pill text. */
function CalendarGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </svg>
  );
}

/** SF Symbols-style "airplane" glyph. The swept-wing shape Apple
 *  uses, simplified to a single fill so it renders crisply at 14px. */
function AirplaneGlyph() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d="M21.45 11.04 13.5 7.05V3.5a1.5 1.5 0 1 0-3 0v3.55l-7.95 3.99a.6.6 0 0 0-.33.54v1.18c0 .35.33.6.67.51l7.61-2.04v4.27l-2.4 1.6a.6.6 0 0 0-.27.5v.83c0 .34.32.59.65.5l3.52-.94 3.52.94c.33.09.65-.16.65-.5v-.83a.6.6 0 0 0-.27-.5l-2.4-1.6v-4.27l7.61 2.04a.55.55 0 0 0 .67-.51v-1.18a.6.6 0 0 0-.33-.54Z" />
    </svg>
  );
}

function ArrowUp() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#fff"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </svg>
  );
}
