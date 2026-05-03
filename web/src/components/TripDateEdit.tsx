"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { patchTrip } from "@/lib/api";
import { getBrowserToken } from "@/lib/auth.browser";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function TripDateEdit({
  slug, initial,
}: {
  slug: string;
  initial: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string>(initial ?? "");
  const [current, setCurrent] = useState<string | null>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  async function save(next: string | null) {
    setSaving(true);
    setError(null);
    try {
      const token = await getBrowserToken();
      if (!token) { setError("Not signed in"); return; }
      const updated = await patchTrip(slug, { start_date: next }, token);
      setCurrent(updated.start_date);
      setValue(updated.start_date ?? "");
      setOpen(false);
      router.refresh();
    } catch (e) {
      console.error("patchTrip failed", e);
      setError("Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={wrapperRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          current
            ? "text-sm text-ink-700 hover:text-ink-900 underline-offset-2 hover:underline"
            : "text-xs text-amber-700 hover:text-amber-900 underline-offset-2 hover:underline"
        }
        title={current ? "Edit start date" : "Add a start date"}
      >
        {current ? formatDate(current) : "+ Add dates"}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[260px] frosted-strong rounded-[12px] p-3 shadow-lg z-30 flex flex-col gap-2">
          <div className="text-[10px] uppercase tracking-wider text-amber-700">
            Trip start date
          </div>
          <input
            type="date"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-[8px] bg-white/85 border border-amber-700/12 px-2 py-1.5 text-sm text-ink-900 outline-none focus:border-amber-600/40"
          />
          <div className="flex items-center gap-2 mt-1">
            <button
              type="button"
              onClick={() => save(value || null)}
              disabled={saving || (!value && !current)}
              className="rounded-[8px] bg-amber-600 text-white text-xs font-semibold px-3 py-1.5 hover:bg-amber-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {current && (
              <button
                type="button"
                onClick={() => save(null)}
                disabled={saving}
                className="text-xs text-rose-500 hover:text-rose-700 disabled:opacity-50 ml-auto"
              >
                Clear
              </button>
            )}
          </div>
          {error && <span className="text-xs text-rose-600">{error}</span>}
          <p className="text-[10px] text-ink-500">
            Setting a date enables the Today view on the home screen.
          </p>
        </div>
      )}
    </div>
  );
}
