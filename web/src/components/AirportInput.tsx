"use client";

import { useEffect, useRef, useState } from "react";

import { airportByCode, searchAirports, type Airport } from "@/lib/airports";

/**
 * Combobox-style airport input. User can type a city name, airport name,
 * or IATA code. Top matches appear in a dropdown; click or Enter selects.
 *
 * If the user types something that doesn't match any known airport, the
 * value is still accepted as a 3-letter code (uppercased). This keeps
 * regional / smaller airports working even though they're not in the list.
 */
export function AirportInput({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string | null;
  onChange: (code: string | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState<string>(value ? formatLabel(value) : "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Sync external value into the visible label when not actively typing.
  useEffect(() => {
    if (!open) setQuery(value ? formatLabel(value) : "");
  }, [value, open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (wrapperRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      // Commit whatever's in the input on outside-click.
      commit(query);
    };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query]);

  const queryIsLikelyCode = /^[A-Za-z]{1,3}$/.test(query.trim());
  const results: Airport[] = searchAirports(query, 8);

  function commit(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      onChange(null);
      return;
    }
    // If the trimmed value matches a known airport's display label,
    // extract its code; otherwise treat as a free-form 3-char code.
    const match = results.find(
      (a) => formatLabel(a.code).toLowerCase() === trimmed.toLowerCase(),
    );
    if (match) {
      onChange(match.code);
      return;
    }
    // Free-text fallback: take up to 3 alpha chars, uppercase.
    const code = trimmed.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase();
    onChange(code || null);
  }

  function selectAirport(a: Airport) {
    onChange(a.code);
    setQuery(formatLabel(a.code));
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className="relative flex flex-col gap-1">
      <span className="text-[10px] text-ink-500">{label}</span>
      <input
        value={query}
        onFocus={() => { setOpen(true); setActiveIndex(0); }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (results[activeIndex]) selectAirport(results[activeIndex]);
            else {
              commit(query);
              setOpen(false);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        autoFocus={autoFocus}
        placeholder={placeholder ?? "City or IATA"}
        className="rounded-[8px] bg-white/85 border border-amber-700/12 px-2 py-1.5 text-sm text-ink-900 outline-none focus:border-amber-600/40"
      />
      {open && (results.length > 0 || queryIsLikelyCode) && (
        <ul className="absolute left-0 right-0 top-full mt-1 max-h-[220px] overflow-auto bg-white rounded-[10px] border border-amber-700/12 shadow-lg z-30">
          {results.map((a, i) => (
            <li
              key={a.code}
              onMouseDown={(e) => { e.preventDefault(); selectAirport(a); }}
              onMouseEnter={() => setActiveIndex(i)}
              className={
                "px-2.5 py-1.5 text-xs cursor-pointer flex items-center gap-2 " +
                (i === activeIndex ? "bg-amber-50" : "hover:bg-amber-50/50")
              }
            >
              <span className="font-mono font-semibold text-ink-900 w-9 shrink-0">
                {a.code}
              </span>
              <span className="text-ink-700 truncate">
                {a.city}
                <span className="text-ink-500"> · {a.name}</span>
              </span>
            </li>
          ))}
          {results.length === 0 && queryIsLikelyCode && (
            <li className="px-2.5 py-1.5 text-xs text-ink-500">
              Press Enter to use{" "}
              <span className="font-mono font-semibold text-ink-900">
                {query.toUpperCase()}
              </span>{" "}
              as a custom code
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function formatLabel(code: string): string {
  const known = airportByCode(code);
  return known ? `${known.code} · ${known.city}` : code.toUpperCase();
}
