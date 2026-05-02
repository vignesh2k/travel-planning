"use client";

export function RefineInput({ slug: _slug }: { slug: string }) {
  return (
    <div className="bg-white/95 border border-amber-700/12 rounded-[14px] flex items-center px-3 py-2 gap-2">
      <input
        className="flex-1 bg-transparent outline-none text-xs text-ink-900 placeholder:text-ink-500"
        placeholder="Refine…"
      />
      <span className="text-amber-600 text-sm">↑</span>
    </div>
  );
}
