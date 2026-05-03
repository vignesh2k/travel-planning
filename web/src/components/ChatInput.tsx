"use client";

import { useEffect, useRef, useState } from "react";

import type { TripBriefIn } from "@/lib/types";

const DEFAULT_PLACEHOLDER =
  "7 days in Kyoto, vegetarian, photography focus, mid-October…";

function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function ChatInput({
  text,
  setText,
  onSubmit,
  pending,
  placeholder = DEFAULT_PLACEHOLDER,
  startDate,
  setStartDate,
  airportEntry,
  setAirportEntry,
  airportExit,
  setAirportExit,
}: {
  text: string;
  setText: (s: string) => void;
  onSubmit: (brief: TripBriefIn) => void;
  pending: boolean;
  placeholder?: string;
  startDate: string | null;
  setStartDate: (v: string | null) => void;
  airportEntry: string | null;
  setAirportEntry: (v: string | null) => void;
  airportExit: string | null;
  setAirportExit: (v: string | null) => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim() || pending) return;
        onSubmit({
          text: text.trim(),
          start_date: startDate || undefined,
          airport_entry: airportEntry || undefined,
          airport_exit: airportExit || undefined,
        });
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
        <div className="flex gap-1.5">
          <DatesPill
            value={startDate}
            onChange={setStartDate}
            disabled={pending}
          />
          <AirportsPill
            entry={airportEntry}
            exit={airportExit}
            onChange={(en, ex) => {
              setAirportEntry(en);
              setAirportExit(ex);
            }}
            disabled={pending}
          />
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

function PillButton({
  active, onClick, disabled, children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        active
          ? "rounded-full bg-amber-600 text-white text-[11px] font-semibold px-2.5 py-1 hover:bg-amber-700 disabled:opacity-50"
          : "rounded-full bg-white/60 text-ink-700 text-[11px] px-2.5 py-1 border border-amber-700/12 hover:bg-white/85 disabled:opacity-50"
      }
    >
      {children}
    </button>
  );
}

function DatesPill({
  value, onChange, disabled,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (wrapperRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <PillButton
        active={Boolean(value)}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
      >
        📅 {value ? formatShortDate(value) : "Dates"}
      </PillButton>
      {open && (
        <div className="absolute left-0 top-full mt-2 w-[240px] frosted-strong rounded-[12px] p-3 shadow-lg z-30 flex flex-col gap-2">
          <div className="text-[10px] uppercase tracking-wider text-amber-700">
            Trip start date
          </div>
          <input
            type="date"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            className="w-full rounded-[8px] bg-white/85 border border-amber-700/12 px-2 py-1.5 text-sm text-ink-900 outline-none focus:border-amber-600/40"
          />
          <div className="flex items-center gap-2 mt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-[8px] bg-amber-600 text-white text-xs font-semibold px-3 py-1 hover:bg-amber-700"
            >
              Done
            </button>
            {value && (
              <button
                type="button"
                onClick={() => { onChange(null); setOpen(false); }}
                className="text-xs text-rose-500 hover:text-rose-700 ml-auto"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AirportsPill({
  entry, exit, onChange, disabled,
}: {
  entry: string | null;
  exit: string | null;
  onChange: (entry: string | null, exit: string | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [entryDraft, setEntryDraft] = useState(entry ?? "");
  const [exitDraft, setExitDraft] = useState(exit ?? "");
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setEntryDraft(entry ?? "");
    setExitDraft(exit ?? "");
  }, [open, entry, exit]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (wrapperRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [open]);

  function commit() {
    const en = entryDraft.trim().toUpperCase().slice(0, 3);
    const ex = exitDraft.trim().toUpperCase().slice(0, 3);
    onChange(en || null, ex || null);
    setOpen(false);
  }

  const summary = entry && exit && entry !== exit
    ? `${entry} → ${exit}`
    : entry || exit || "Airports";

  return (
    <div ref={wrapperRef} className="relative">
      <PillButton
        active={Boolean(entry || exit)}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
      >
        ✈️ {summary}
      </PillButton>
      {open && (
        <div className="absolute left-0 top-full mt-2 w-[260px] frosted-strong rounded-[12px] p-3 shadow-lg z-30 flex flex-col gap-2">
          <div className="text-[10px] uppercase tracking-wider text-amber-700">
            Airports (IATA)
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-ink-500">Entry</span>
              <input
                value={entryDraft}
                onChange={(e) => setEntryDraft(e.target.value.toUpperCase())}
                maxLength={3}
                placeholder="LHR"
                className="rounded-[8px] bg-white/85 border border-amber-700/12 px-2 py-1.5 text-sm text-ink-900 outline-none focus:border-amber-600/40 uppercase tracking-wide"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-ink-500">Exit</span>
              <input
                value={exitDraft}
                onChange={(e) => setExitDraft(e.target.value.toUpperCase())}
                maxLength={3}
                placeholder="ITM"
                className="rounded-[8px] bg-white/85 border border-amber-700/12 px-2 py-1.5 text-sm text-ink-900 outline-none focus:border-amber-600/40 uppercase tracking-wide"
              />
            </label>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <button
              type="button"
              onClick={commit}
              className="rounded-[8px] bg-amber-600 text-white text-xs font-semibold px-3 py-1 hover:bg-amber-700"
            >
              Done
            </button>
            {(entry || exit) && (
              <button
                type="button"
                onClick={() => {
                  setEntryDraft("");
                  setExitDraft("");
                  onChange(null, null);
                  setOpen(false);
                }}
                className="text-xs text-rose-500 hover:text-rose-700 ml-auto"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
