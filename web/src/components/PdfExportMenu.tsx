"use client";

import { useEffect, useRef, useState } from "react";

import { getBrowserToken } from "@/lib/auth.browser";

type Phase = "menu" | "building" | "done" | "error";

type StageStatus = "pending" | "running" | "done" | "error";
interface Stage {
  key: string;
  label: string;
  status: StageStatus;
  message?: string;
}

const SECTION_OPTIONS = [
  { key: "food", label: "Food spots" },
  { key: "photos", label: "Photo spots" },
  { key: "tips", label: "Tips & logistics" },
  { key: "costs", label: "Estimated costs" },
] as const;

type SectionKey = (typeof SECTION_OPTIONS)[number]["key"];
const STYLE_OPTIONS = [
  { key: "reference", label: "Reference" },
  { key: "compact", label: "Compact" },
  { key: "pretty", label: "Editorial" },
] as const;

type StyleKey = (typeof STYLE_OPTIONS)[number]["key"];

export function PdfExportMenu({
  slug,
  destination,
  days,
  prominent = false,
}: {
  slug: string;
  destination: string;
  days: number;
  prominent?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("menu");
  const [picked, setPicked] = useState<Record<SectionKey, boolean>>({
    food: true,
    photos: false,
    tips: true,
    costs: true,
  });
  const [style, setStyle] = useState<StyleKey>("reference");
  const [stages, setStages] = useState<Stage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  // Outside-click closes the popover (when not actively building).
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current?.contains(e.target as Node)) return;
      if (phase === "building") return; // don't dismiss mid-build
      setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open, phase]);

  function start() {
    const initial: Stage[] = [
      ...Array.from({ length: days }, (_, i) => ({
        key: `day_${i + 1}`,
        label: `Crafting Day ${i + 1}`,
        status: "pending" as StageStatus,
      })),
      ...(picked.costs
        ? [{ key: "costs", label: "Estimating costs", status: "pending" as StageStatus }]
        : []),
      { key: "compile", label: "Compiling PDF", status: "pending" as StageStatus },
    ];
    setStages(initial);
    setError(null);
    setPhase("building");
    startedRef.current = false;
  }

  // Run the build effect when phase flips to "building".
  useEffect(() => {
    if (phase !== "building" || startedRef.current) return;
    startedRef.current = true;

    (async () => {
      const token = await getBrowserToken();
      if (!token) {
        setError("Not signed in");
        setPhase("error");
        return;
      }
      let res: Response;
      try {
        res = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE}/trips/${slug}/pdf/build`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ ...picked, style }),
          },
        );
      } catch (e) {
        setError(`Network error: ${(e as Error).message}`);
        setPhase("error");
        return;
      }
      if (!res.ok || !res.body) {
        setError(`Build failed (${res.status})`);
        setPhase("error");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          let evt = "";
          let data = "";
          for (const line of chunk.split("\n")) {
            if (line.startsWith("event:")) evt = line.slice(6).trim();
            else if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          if (!evt || !data) continue;
          let parsed: unknown;
          try {
            parsed = JSON.parse(data);
          } catch {
            continue;
          }

          if (evt === "stage") {
            const s = parsed as Stage;
            setStages((prev) => prev.map((st) => (st.key === s.key ? { ...st, ...s } : st)));
          } else if (evt === "done") {
            const d = parsed as { pdf_base64: string; filename: string };
            const bytes = Uint8Array.from(atob(d.pdf_base64), (c) => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: "application/pdf" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = d.filename ?? `${destination}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
            setPhase("done");
          }
        }
      }
    })();
  }, [phase, picked, slug, destination, style]);

  function reset() {
    setPhase("menu");
    setStages([]);
    setError(null);
    startedRef.current = false;
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={() => {
          if (phase === "building") {
            setOpen((v) => !v);
          } else {
            if (!open) reset();
            setOpen((v) => !v);
          }
        }}
        className={
          prominent
            ? "rounded-[10px] bg-white/85 border border-amber-700/12 px-3 py-1.5 text-xs font-semibold text-ink-900 hover:bg-white flex items-center gap-1"
            : "frosted rounded-[10px] px-3 py-1 text-xs hover:bg-white/85 flex items-center gap-1"
        }
      >
        Guide PDF
        <span className="text-[9px] text-ink-500">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 frosted-strong rounded-[12px] z-30 w-72 max-h-[70vh] flex flex-col overflow-hidden anim-fade-in">
          {phase === "menu" && (
            <div className="p-3 flex flex-col gap-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                Include in PDF
              </div>
              <div className="grid grid-cols-3 gap-1 rounded-[10px] bg-white/55 border border-amber-700/10 p-1">
                {STYLE_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setStyle(option.key)}
                    className={
                      style === option.key
                        ? "rounded-[8px] bg-ink-900 text-white px-2 py-1 text-[10px] font-semibold"
                        : "rounded-[8px] px-2 py-1 text-[10px] font-medium text-ink-600 hover:bg-white/80"
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {SECTION_OPTIONS.map((s) => (
                <label
                  key={s.key}
                  className="flex items-center gap-2 text-xs text-ink-900 cursor-pointer rounded-md px-1 py-0.5 hover:bg-white/70"
                >
                  <input
                    type="checkbox"
                    checked={picked[s.key]}
                    onChange={(e) => setPicked({ ...picked, [s.key]: e.target.checked })}
                    className="accent-amber-600"
                  />
                  {s.label}
                </label>
              ))}
              <button
                onClick={start}
                className="mt-1 rounded-[8px] bg-gradient-to-br from-amber-400 to-amber-600 text-white text-xs py-2 font-medium hover:shadow-md"
              >
                Build PDF
              </button>
              <p className="text-[10px] text-ink-500 leading-snug">
                Day-by-day schedule is always included. Each section adds ~5-15s of generation time.
              </p>
            </div>
          )}

          {(phase === "building" || phase === "done" || phase === "error") && (
            <>
              <div className="px-4 pt-3 pb-1 text-xs font-semibold text-ink-900 shrink-0">
                {phase === "error"
                  ? "Build failed"
                  : phase === "done"
                  ? "Done — downloading"
                  : "Building your PDF…"}
              </div>
              <ul className="flex flex-col gap-1.5 px-4 py-2 overflow-y-auto min-h-0 flex-1">
                {stages.map((s) => (
                  <li key={s.key} className="flex items-center gap-2 text-xs">
                    <StageIcon status={s.status} />
                    <span
                      className={
                        s.status === "done"
                          ? "text-ink-500 line-through decoration-amber-700/30"
                          : "text-ink-900"
                      }
                    >
                      {s.label}
                    </span>
                  </li>
                ))}
              </ul>
              {error && <div className="px-4 pb-1 text-rose-500 text-[11px]">{error}</div>}
              {(phase === "done" || phase === "error") && (
                <div className="px-4 pb-3 pt-1 shrink-0 flex gap-2">
                  <button
                    onClick={reset}
                    className="flex-1 rounded-[8px] frosted text-xs py-1.5 hover:bg-white/85"
                  >
                    Build another
                  </button>
                  <button
                    onClick={() => setOpen(false)}
                    className="flex-1 rounded-[8px] bg-amber-600 text-white text-xs py-1.5 hover:bg-amber-700"
                  >
                    Close
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StageIcon({ status }: { status: StageStatus }) {
  if (status === "pending") {
    return <div className="w-3.5 h-3.5 rounded-full border-2 border-ink-300/40 shrink-0" aria-hidden />;
  }
  if (status === "running") {
    return (
      <div
        className="w-3.5 h-3.5 rounded-full border-2 border-amber-600 border-t-transparent animate-spin shrink-0"
        aria-hidden
      />
    );
  }
  if (status === "done") {
    return (
      <div className="w-3.5 h-3.5 rounded-full bg-amber-600 flex items-center justify-center text-white text-[9px] shrink-0" aria-hidden>
        ✓
      </div>
    );
  }
  return (
    <div className="w-3.5 h-3.5 rounded-full bg-rose-500 flex items-center justify-center text-white text-[9px] shrink-0" aria-hidden>
      !
    </div>
  );
}
