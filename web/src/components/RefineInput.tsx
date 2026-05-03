"use client";

import { useEffect, useRef, useState } from "react";

import { refineTrip } from "@/lib/api";
import { getBrowserToken } from "@/lib/auth.browser";
import type { TripFull } from "@/lib/types";

type Phase = "idle" | "refining" | "done" | "error";

function inferDayLabel(text: string): string | null {
  // Pulls "Day 3" out of "Refine Day 3: less touristy", etc.
  const m = text.match(/\bDay\s*(\d{1,2})\b/i);
  return m ? `Day ${m[1]}` : null;
}

export function RefineInput({
  slug,
  onUpdated,
  prefill,
  prefillKey,
}: {
  slug: string;
  onUpdated: (trip: TripFull) => void;
  /** Set this to push text into the input from outside. */
  prefill?: string;
  /** Bump this whenever you want to re-apply prefill (even if the string repeats). */
  prefillKey?: number;
}) {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const doneTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (prefill !== undefined) {
      setText(prefill);
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(prefill.length, prefill.length);
      });
    }
  }, [prefill, prefillKey]);

  useEffect(() => () => {
    if (doneTimerRef.current) window.clearTimeout(doneTimerRef.current);
  }, []);

  const pending = phase === "refining";

  return (
    <div className="relative">
      {(phase === "refining" || phase === "done" || phase === "error") && (
        <RefineStatusPill phase={phase} text={statusText} error={error} />
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim() || pending) return;
          const trimmed = text.trim();
          const day = inferDayLabel(trimmed);
          setStatusText(day ? `Refining ${day}…` : "Refining your trip…");
          setError(null);
          setPhase("refining");
          try {
            const token = await getBrowserToken();
            if (!token) {
              setPhase("error");
              setError("Not signed in");
              return;
            }
            const updated = await refineTrip(slug, trimmed, token);
            onUpdated(updated);
            setText("");
            setStatusText(day ? `${day} refined ✓` : "Refined ✓");
            setPhase("done");
            if (doneTimerRef.current) window.clearTimeout(doneTimerRef.current);
            doneTimerRef.current = window.setTimeout(() => {
              setPhase("idle");
            }, 2000);
          } catch (e) {
            console.error("refineTrip failed", e);
            setError("Refine failed. Try again.");
            setPhase("error");
            doneTimerRef.current = window.setTimeout(() => {
              setPhase("idle");
            }, 3000);
          }
        }}
        className="bg-white/95 border border-amber-700/12 rounded-[14px] flex items-center px-3 py-2 gap-2 transition-shadow focus-within:shadow-md"
      >
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={pending}
          className="flex-1 bg-transparent outline-none text-xs text-ink-900 placeholder:text-ink-500 disabled:opacity-60"
          placeholder={pending ? "Refining…" : "Refine — e.g. make day 2 less touristy"}
        />
        <button
          type="submit"
          className="text-amber-600 text-sm disabled:opacity-40"
          disabled={pending || !text.trim()}
        >
          ↑
        </button>
      </form>
    </div>
  );
}

function RefineStatusPill({
  phase, text, error,
}: {
  phase: "refining" | "done" | "error";
  text: string;
  error: string | null;
}) {
  const isError = phase === "error";
  const isDone = phase === "done";
  return (
    <div
      className={
        "absolute left-0 right-0 -top-9 mx-auto w-fit max-w-full px-3 py-1.5 rounded-full text-[11px] font-medium flex items-center gap-2 anim-slide-up shadow-sm " +
        (isError
          ? "bg-rose-50 text-rose-700 border border-rose-200"
          : isDone
            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
            : "bg-amber-50 text-amber-800 border border-amber-200")
      }
      role="status"
      aria-live="polite"
    >
      {phase === "refining" && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-600" />
        </span>
      )}
      {isDone && <span aria-hidden>✓</span>}
      {isError && <span aria-hidden>!</span>}
      <span className="truncate">{isError ? (error ?? "Refine failed") : text}</span>
    </div>
  );
}
