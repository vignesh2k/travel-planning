"use client";

const SUGGESTIONS = [
  "A long weekend in Lisbon",
  "Hiking week in the Dolomites",
  "10 days through Vietnam, street food focus",
];

export function SuggestionChips({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-2 max-w-xl">
      {SUGGESTIONS.map((s) => (
        <button
          key={s}
          onClick={() => onPick(s)}
          className="rounded-full px-3 py-1 text-xs text-ink-700 bg-white/60 border border-amber-700/10 hover:bg-white/85 hover:border-amber-600/30 hover:-translate-y-px"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
