"use client";

import { useState } from "react";

import { refineTrip } from "@/lib/api";
import { getBrowserToken } from "@/lib/auth.browser";
import type { TripFull } from "@/lib/types";

export function RefineInput({
  slug,
  onUpdated,
}: {
  slug: string;
  onUpdated: (trip: TripFull) => void;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
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
      className="bg-white/95 border border-amber-700/12 rounded-[14px] flex items-center px-3 py-2 gap-2"
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={pending}
        className="flex-1 bg-transparent outline-none text-xs text-ink-900 placeholder:text-ink-500"
        placeholder={pending ? "Refining…" : "Refine — e.g. make day 2 less touristy"}
      />
      <button type="submit" className="text-amber-600 text-sm" disabled={pending}>
        ↑
      </button>
    </form>
  );
}
