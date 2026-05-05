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

  const isSaving = phase === "saving" || savingChanges;
  const isError = phase === "error";
  const isDraft = !saved || hasUnsavedChanges;
  const disabled = isSaving || (saved && !hasUnsavedChanges);
  const label = isError ? "Retry save" : saved && hasUnsavedChanges ? "Save changes" : "Save";

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={
          isDraft
            ? "rounded-full bg-orange-50 border border-orange-200 px-2 py-0.5 text-[10px] font-semibold text-orange-700"
            : "rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"
        }
      >
        {isDraft ? "Draft" : "Saved"}
      </span>
      <button
        onClick={save}
        disabled={disabled}
        className={
          disabled
            ? "rounded-[10px] bg-white/65 border border-amber-700/10 text-ink-400 text-xs px-3 py-1 font-medium flex items-center gap-1.5 cursor-default"
            : "rounded-[10px] bg-gradient-to-br from-amber-400 to-amber-600 text-white text-xs px-3 py-1 font-medium shadow-sm hover:shadow-md flex items-center gap-1.5"
        }
        title={isError ? "Couldn't save — try again" : saved ? "Save itinerary changes" : "Save to Logbook"}
      >
        {isSaving ? (
          <>
            <span className="w-3 h-3 rounded-full border-2 border-current/60 border-t-transparent animate-spin" aria-hidden />
            Saving…
          </>
        ) : (
          <>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <path d="M3 1.5h6l1.5 1.5v7.5h-9v-9z" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinejoin="round" />
              <path d="M4.5 1.5v3h3v-3" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinejoin="round" />
            </svg>
            {label}
          </>
        )}
      </button>
    </div>
  );
}
