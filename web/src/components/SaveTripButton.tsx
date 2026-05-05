"use client";

import { useState } from "react";

import { saveTrip } from "@/lib/api";
import { getBrowserToken } from "@/lib/auth.browser";

type Phase = "unsaved" | "saving" | "saved" | "error";

export function SaveTripButton({
  slug,
  saved,
  hasUnsavedChanges = false,
  savingChanges = false,
  onSaved,
  onSaveDraft,
  onSaveChanges,
}: {
  slug: string;
  saved: boolean;
  hasUnsavedChanges?: boolean;
  savingChanges?: boolean;
  onSaved?: () => void;
  onSaveDraft?: () => Promise<void>;
  onSaveChanges?: () => Promise<void>;
}) {
  const [phase, setPhase] = useState<Phase>(saved ? "saved" : "unsaved");

  async function save() {
    if (saved) {
      if (!hasUnsavedChanges || !onSaveChanges) return;
      setPhase("saving");
      try {
        await onSaveChanges();
        setPhase("saved");
      } catch (e) {
        console.error("save changes failed", e);
        setPhase("error");
      }
      return;
    }
    if (phase === "saving") return;
    setPhase("saving");
    try {
      if (onSaveDraft) {
        await onSaveDraft();
      } else {
        const token = await getBrowserToken();
        if (!token) { setPhase("error"); return; }
        await saveTrip(slug, token);
      }
      setPhase("saved");
      onSaved?.();
    } catch (e) {
      console.error("saveTrip failed", e);
      setPhase("error");
    }
  }

  if (saved && !hasUnsavedChanges) {
    return (
      <span
        className="frosted rounded-[10px] px-3 py-1 text-xs text-ink-500 flex items-center gap-1.5 cursor-default"
        title="In your Logbook"
      >
        <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.14)]" aria-hidden />
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="text-amber-600">
          <path d="M2.5 6.2 5 8.7l4.5-5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Saved
      </span>
    );
  }

  const isSaving = phase === "saving" || savingChanges;
  const isError = phase === "error";

  return (
    <button
      onClick={save}
      disabled={isSaving || (saved && !hasUnsavedChanges)}
      className="rounded-[10px] bg-gradient-to-br from-amber-400 to-amber-600 text-white text-xs px-3 py-1 font-medium shadow-sm hover:shadow-md disabled:opacity-60 flex items-center gap-1.5"
      title={isError ? "Couldn't save — try again" : saved ? "Save itinerary changes" : "Save to Logbook"}
    >
      {isSaving ? (
        <>
          <span className="w-3 h-3 rounded-full border-2 border-white/60 border-t-transparent animate-spin" aria-hidden />
          Saving…
        </>
      ) : (
        <>
          <span className="h-2 w-2 rounded-full bg-orange-300 shadow-[0_0_0_2px_rgba(251,146,60,0.24)]" aria-hidden />
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M3 1.5h6l1.5 1.5v7.5h-9v-9z" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinejoin="round" />
            <path d="M4.5 1.5v3h3v-3" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinejoin="round" />
          </svg>
          {isError ? "Retry save" : saved ? "Save changes" : "Save"}
        </>
      )}
    </button>
  );
}
