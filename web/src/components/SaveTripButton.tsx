"use client";

import { topNavButtonClass } from "./TopNavButton";

export function SaveTripButton({
  saved,
  hasUnsavedChanges = false,
  saving = false,
  error = null,
  onSave,
}: {
  saved: boolean;
  hasUnsavedChanges?: boolean;
  saving?: boolean;
  error?: string | null;
  onSave: () => void;
}) {
  const isSaving = saving;
  const isError = Boolean(error);
  const isDraft = !saved || hasUnsavedChanges;
  const disabled = isSaving || (saved && !hasUnsavedChanges);
  const label = isError ? "Retry save" : saved && hasUnsavedChanges ? "Save changes" : "Save";

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <span
        className={
          isDraft
            ? "shrink-0 rounded-full bg-orange-50 border border-orange-200 px-2 py-0.5 text-[10px] font-semibold text-orange-700"
            : "shrink-0 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"
        }
      >
        {isDraft ? "Draft" : "Saved"}
      </span>
      <button
        onClick={onSave}
        disabled={disabled}
        className={topNavButtonClass(
          disabled
            ? "bg-white/65 text-ink-500 shadow-none"
            : "bg-gradient-to-br from-amber-400 to-amber-600 text-white hover:shadow-md",
        )}
        title={isError ? error ?? "Could not save. Try again." : saved ? "Save itinerary changes" : "Save to Logbook"}
      >
        {isSaving ? (
          <>
            <span className="w-3 h-3 shrink-0 rounded-full border-2 border-current/60 border-t-transparent animate-spin" aria-hidden />
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
