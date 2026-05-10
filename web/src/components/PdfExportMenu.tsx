"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { getBrowserToken } from "@/lib/auth.browser";
import {
  defaultPdfSectionSelection,
  PDF_SECTION_LABEL,
  PDF_STYLE_OPTIONS,
  type PdfSectionKey,
  type PdfStyleKey,
} from "@/lib/pdf-options";

type Phase = "menu" | "building" | "done" | "error";

type StageStatus = "pending" | "running" | "done" | "error";
type MenuPosition = {
  left: number;
  maxHeight: number;
  top: number;
  width: number;
};

interface Stage {
  key: string;
  label: string;
  status: StageStatus;
  message?: string;
}

const SECTION_OPTIONS = [
  { key: "food", label: PDF_SECTION_LABEL.food },
  { key: "photos", label: PDF_SECTION_LABEL.photos },
  { key: "tips", label: PDF_SECTION_LABEL.tips },
  { key: "costs", label: PDF_SECTION_LABEL.costs },
] as const satisfies readonly { key: PdfSectionKey; label: string }[];

type SectionKey = PdfSectionKey;
const STYLE_OPTIONS = PDF_STYLE_OPTIONS;

type StyleKey = PdfStyleKey;

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
  const [picked, setPicked] = useState<Record<SectionKey, boolean>>(
    defaultPdfSectionSelection,
  );
  const [style, setStyle] = useState<StyleKey>("reference");
  const [stages, setStages] = useState<Stage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);

  const updateMenuPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const margin = 16;
    const gap = 8;
    const width = Math.min(320, window.innerWidth - margin * 2);
    const left = Math.min(
      Math.max(margin, rect.right - width),
      window.innerWidth - margin - width,
    );
    const preferredMaxHeight = Math.min(window.innerHeight * 0.7, 480);
    const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
    const spaceAbove = rect.top - gap - margin;
    const openAbove = spaceBelow < 260 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(
      180,
      Math.min(preferredMaxHeight, openAbove ? spaceAbove : spaceBelow),
    );
    const top = openAbove
      ? Math.max(margin, rect.top - maxHeight - gap)
      : rect.bottom + gap;

    setMenuPosition({ left, maxHeight, top, width });
  }, []);

  // Outside-click closes the popover (when not actively building).
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current?.contains(e.target as Node)) return;
      if (menuRef.current?.contains(e.target as Node)) return;
      if (phase === "building") return; // don't dismiss mid-build
      setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open, phase]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

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

  const menu =
    open && menuPosition && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            style={{
              left: menuPosition.left,
              maxHeight: menuPosition.maxHeight,
              top: menuPosition.top,
              width: menuPosition.width,
            }}
            className="fixed z-[80] flex flex-col overflow-hidden rounded-[12px] frosted-strong anim-fade-in"
          >
            {phase === "menu" && (
              <div className="p-3 flex flex-col gap-3">
                <div>
                  <div className="text-xs font-semibold text-ink-900">Guide PDF</div>
                  <div className="mt-0.5 text-[10px] leading-4 text-ink-500">
                    Build a polished final guide with the sections you need.
                  </div>
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
                    className="flex min-h-7 cursor-pointer items-center gap-2 rounded-md px-1.5 py-0.5 text-xs text-ink-900 hover:bg-white/70"
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
                  className="mt-1 rounded-[8px] bg-gradient-to-br from-amber-400 to-amber-600 py-2 text-xs font-semibold text-white hover:shadow-md"
                >
                  Build guide
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
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={wrapperRef}>
      <button
        ref={buttonRef}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          if (phase === "building") {
            if (!open) updateMenuPosition();
            setOpen((v) => !v);
          } else {
            if (!open) reset();
            if (!open) updateMenuPosition();
            setOpen((v) => !v);
          }
        }}
        className={
          prominent
            ? "inline-flex shrink-0 items-center gap-1 rounded-[10px] border border-amber-700/12 bg-white/85 px-3 py-1.5 text-xs font-semibold text-ink-900 hover:bg-white"
            : "frosted inline-flex shrink-0 items-center gap-1 rounded-[10px] px-3 py-1 text-xs hover:bg-white/85"
        }
      >
        Guide PDF
        <span className="text-[9px] text-ink-500">▾</span>
      </button>

      {menu}
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
