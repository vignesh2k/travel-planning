"use client";

import { useEffect, useRef, useState } from "react";

import { getBrowserToken } from "@/lib/auth.browser";

export type StageStatus = "pending" | "running" | "done" | "error";
export interface Stage {
  key: string;
  label: string;
  status: StageStatus;
  message?: string;
}

const COMPILE_KEY = "compile";

export function PdfExportModal({
  slug,
  destination,
  sections,
  initialStages,
  onClose,
}: {
  slug: string;
  destination: string;
  sections: string[];
  initialStages: Stage[];
  onClose: () => void;
}) {
  const [stages, setStages] = useState<Stage[]>(initialStages);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      const token = await getBrowserToken();
      if (!token) {
        setError("Not signed in");
        return;
      }

      let res: Response;
      try {
        res = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE}/trips/${slug}/pdf/build`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ sections }),
          },
        );
      } catch (e) {
        setError(`Network error: ${(e as Error).message}`);
        return;
      }
      if (!res.ok || !res.body) {
        setError(`Build failed (${res.status})`);
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
            const s = parsed as { key: string; label: string; status: StageStatus; message?: string };
            setStages((prev) =>
              prev.map((st) => (st.key === s.key ? { ...st, status: s.status, message: s.message } : st)),
            );
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
            setDone(true);
          }
        }
      }
    })();
  }, [slug, sections, destination]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink-900/30 backdrop-blur-sm anim-fade-in"
      onClick={done || error ? onClose : undefined}
    >
      <div
        className="frosted-strong rounded-[18px] p-5 w-[380px] max-w-[90vw] flex flex-col gap-3 anim-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-base font-semibold text-ink-900">
          {error ? "Build failed" : done ? "Done — downloading" : "Building your PDF…"}
        </div>
        <ul className="flex flex-col gap-2 mt-1">
          {stages.map((s) => (
            <li key={s.key} className="flex items-center gap-2.5 text-sm">
              <StageIcon status={s.status} />
              <span className={s.status === "done" ? "text-ink-500 line-through decoration-amber-700/30" : "text-ink-900"}>
                {s.label}
              </span>
            </li>
          ))}
        </ul>
        {error && <div className="text-rose-500 text-xs mt-1">{error}</div>}
        {(done || error) && (
          <button
            onClick={onClose}
            className="mt-2 rounded-[10px] bg-amber-600 text-white text-sm py-2 hover:bg-amber-700"
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
}

function StageIcon({ status }: { status: StageStatus }) {
  if (status === "pending") {
    return <div className="w-4 h-4 rounded-full border-2 border-ink-300/40 shrink-0" aria-hidden />;
  }
  if (status === "running") {
    return (
      <div
        className="w-4 h-4 rounded-full border-2 border-amber-600 border-t-transparent animate-spin shrink-0"
        aria-hidden
      />
    );
  }
  if (status === "done") {
    return (
      <div className="w-4 h-4 rounded-full bg-amber-600 flex items-center justify-center text-white text-[10px] shrink-0" aria-hidden>
        ✓
      </div>
    );
  }
  return (
    <div className="w-4 h-4 rounded-full bg-rose-500 flex items-center justify-center text-white text-[10px] shrink-0" aria-hidden>
      !
    </div>
  );
}

export { COMPILE_KEY };
