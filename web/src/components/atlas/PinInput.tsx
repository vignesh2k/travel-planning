"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { StreamingOverlay } from "@/components/StreamingOverlay";
import { getBrowserToken } from "@/lib/auth.browser";
import { streamTrip } from "@/lib/streamingTrip";
import type { Place } from "@/lib/types";

const SUGGESTIONS: { coord: string; label: string; prompt: string }[] = [
  { coord: "38.7° N", label: "Lisbon, slow weekend", prompt: "A long weekend in Lisbon" },
  { coord: "46.4° N", label: "Dolomites, on foot", prompt: "Hiking week in the Dolomites" },
  { coord: "16.0° N", label: "Vietnam, by bowl", prompt: "10 days through Vietnam, street food focus" },
  { coord: "64.1° N", label: "Reykjavík, in winter", prompt: "5 days in Reykjavík, in winter" },
];

export function PinInput() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [chars, setChars] = useState(0);
  const [places, setPlaces] = useState<Place[]>([]);

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
        { text: text.trim() },
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
            className="flex-1 bg-transparent outline-none text-[15.5px] font-serif italic text-[var(--color-paper-ink-2)] placeholder:text-[var(--color-paper-ink-4)] disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!canSubmit}
            aria-label="Plan trip"
            className="shrink-0 w-[38px] h-[38px] rounded-[10px] bg-[var(--color-paper-ink)] hover:bg-[var(--color-paper-ink-2)] flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowUp />
          </button>
        </div>
      </form>

      {/* Suggestion chips */}
      <div
        className="flex flex-wrap justify-center gap-[10px]"
        style={{ marginTop: 32 }}
      >
        {SUGGESTIONS.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setText(s.prompt)}
            className="inline-flex items-center gap-2 rounded-full border transition-colors"
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
