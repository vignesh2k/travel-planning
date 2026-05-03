"use client";

import type { TripBriefIn } from "@/lib/types";

const DEFAULT_PLACEHOLDER =
  "7 days in Kyoto, vegetarian, photography focus, mid-October…";

export function ChatInput({
  text,
  setText,
  onSubmit,
  pending,
  placeholder = DEFAULT_PLACEHOLDER,
}: {
  text: string;
  setText: (s: string) => void;
  onSubmit: (brief: TripBriefIn) => void;
  pending: boolean;
  placeholder?: string;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim() || pending) return;
        onSubmit({ text: text.trim() });
      }}
      className="frosted-strong rounded-[18px] p-4 w-full max-w-xl transition-shadow hover:shadow-lg"
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        className="w-full bg-transparent outline-none text-sm text-ink-900 placeholder:text-ink-500 resize-none"
        placeholder={placeholder}
        disabled={pending}
      />
      <div className="flex items-center justify-between mt-2">
        <div className="flex gap-1">
          <span className="pill">📅 Dates</span>
          <span className="pill">✈️ Airports</span>
        </div>
        <button
          type="submit"
          disabled={!text.trim() || pending}
          className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-md disabled:opacity-40 hover:shadow-lg"
        >
          {pending ? "…" : "↑"}
        </button>
      </div>
    </form>
  );
}
