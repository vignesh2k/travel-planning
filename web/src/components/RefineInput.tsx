"use client";

import { useEffect, useRef, useState } from "react";

import { refineTrip } from "@/lib/api";
import { getBrowserToken } from "@/lib/auth.browser";
import type { TripFull } from "@/lib/types";

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
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (prefill !== undefined) {
      setText(prefill);
      // Wait a tick for state to flush, then focus & move caret to end.
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(prefill.length, prefill.length);
      });
    }
  }, [prefill, prefillKey]);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim() || pending) return;
        setPending(true);
        try {
          const token = await getBrowserToken();
          if (!token) return;
          const updated = await refineTrip(slug, text.trim(), token);
          onUpdated(updated);
          setText("");
        } finally {
          setPending(false);
        }
      }}
      className="bg-white/95 border border-amber-700/12 rounded-[14px] flex items-center px-3 py-2 gap-2 transition-shadow focus-within:shadow-md"
    >
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={pending}
        className="flex-1 bg-transparent outline-none text-xs text-ink-900 placeholder:text-ink-500"
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
  );
}
