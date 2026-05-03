"use client";

import { useState } from "react";

import { saveTrip } from "@/lib/api";
import { getBrowserToken } from "@/lib/auth.browser";

type Phase = "unsaved" | "saving" | "saved" | "error";

export function SaveTripButton({
  slug, initialSaved,
}: {
  slug: string;
  initialSaved: boolean;
}) {
  const [phase, setPhase] = useState<Phase>(initialSaved ? "saved" : "unsaved");

  async function save() {
    if (phase !== "unsaved") return;
    setPhase("saving");
    try {
      const token = await getBrowserToken();
      if (!token) { setPhase("error"); return; }
      await saveTrip(slug, token);
      setPhase("saved");
    } catch (e) {
      console.error("saveTrip failed", e);
      setPhase("error");
    }
  }

  if (phase === "saved") {
    return (
      <span
        className="frosted rounded-[10px] px-3 py-1 text-xs text-ink-500 flex items-center gap-1.5 cursor-default"
        title="In your Logbook"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="text-amber-600">
          <path d="M2.5 6.2 5 8.7l4.5-5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Saved
      </span>
    );
  }

  return (
    <button
      onClick={save}
      disabled={phase === "saving"}
      className="rounded-[10px] bg-gradient-to-br from-amber-400 to-amber-600 text-white text-xs px-3 py-1 font-medium shadow-sm hover:shadow-md disabled:opacity-60 flex items-center gap-1.5"
      title={phase === "error" ? "Couldn't save — try again" : "Save to Logbook"}
    >
      {phase === "saving" ? (
        <>
          <span className="w-3 h-3 rounded-full border-2 border-white/60 border-t-transparent animate-spin" aria-hidden />
          Saving…
        </>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M3 1.5h6l1.5 1.5v7.5h-9v-9z" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinejoin="round" />
            <path d="M4.5 1.5v3h3v-3" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinejoin="round" />
          </svg>
          {phase === "error" ? "Retry save" : "Save"}
        </>
      )}
    </button>
  );
}
