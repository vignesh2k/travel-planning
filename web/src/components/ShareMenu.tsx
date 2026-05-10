"use client";

import { useEffect, useRef, useState } from "react";

import { createShare, revokeShare } from "@/lib/api";
import { getBrowserToken } from "@/lib/auth.browser";

type Phase = "idle" | "busy" | "error";

export function ShareMenu({
  slug, initialToken, prominent = false,
}: {
  slug: string;
  initialToken: string | null;
  prominent?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(initialToken);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
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

  const shareUrl = token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/s/${token}`
    : null;

  async function generate() {
    setPhase("busy");
    setError(null);
    try {
      const auth = await getBrowserToken();
      if (!auth) { setError("Not signed in"); setPhase("error"); return; }
      const out = await createShare(slug, auth);
      setToken(out.token);
      setPhase("idle");
    } catch (e) {
      console.error("createShare failed", e);
      setError("Couldn't create share link");
      setPhase("error");
    }
  }

  async function stop() {
    setPhase("busy");
    setError(null);
    try {
      const auth = await getBrowserToken();
      if (!auth) { setError("Not signed in"); setPhase("error"); return; }
      await revokeShare(slug, auth);
      setToken(null);
      setPhase("idle");
    } catch (e) {
      console.error("revokeShare failed", e);
      setError("Couldn't stop sharing");
      setPhase("error");
    }
  }

  async function copy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error("clipboard failed", e);
    }
  }

  return (
    <div ref={wrapperRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          token
            ? "inline-flex shrink-0 items-center rounded-[10px] bg-amber-100 text-amber-800 text-xs font-semibold px-3 py-1.5 hover:bg-amber-200"
            : prominent
              ? "inline-flex shrink-0 items-center rounded-[10px] bg-ink-900 text-white text-xs font-semibold px-3 py-1.5 shadow-sm hover:shadow-md"
            : "inline-flex shrink-0 items-center rounded-[10px] bg-white/70 text-ink-700 text-xs px-3 py-1.5 border border-amber-700/12 hover:bg-white/90"
        }
        title={token ? "Public link active — manage" : "Share this trip"}
      >
        {token ? "Public" : "Share"}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[min(320px,calc(100vw-2rem))] frosted-strong rounded-[14px] p-4 shadow-lg z-30 flex flex-col gap-3">
          {!token && (
            <>
              <p className="text-xs text-ink-700">
                Generate a link anyone can open — no account needed.
              </p>
              <button
                type="button"
                onClick={generate}
                disabled={phase === "busy"}
                className="rounded-[10px] bg-gradient-to-br from-amber-400 to-amber-600 text-white text-sm py-2 font-medium hover:shadow-md disabled:opacity-50"
              >
                {phase === "busy" ? "Generating…" : "Generate share link"}
              </button>
            </>
          )}

          {token && shareUrl && (
            <>
              <div className="text-[10px] uppercase tracking-wider text-amber-700">
                Public link
              </div>
              <input
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-[8px] bg-white/85 border border-amber-700/12 px-2 py-1.5 text-xs text-ink-900 outline-none focus:border-amber-600/40"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={copy}
                  className="rounded-[8px] bg-amber-600 text-white text-xs font-semibold px-3 py-1.5 hover:bg-amber-700"
                >
                  {copied ? "Copied ✓" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={generate}
                  disabled={phase === "busy"}
                  className="text-xs text-ink-500 hover:text-ink-900 disabled:opacity-50"
                  title="Generate a new link (the current one stops working)"
                >
                  Rotate link
                </button>
                <button
                  type="button"
                  onClick={stop}
                  disabled={phase === "busy"}
                  className="text-xs text-rose-500 hover:text-rose-700 sm:ml-auto disabled:opacity-50"
                >
                  Stop sharing
                </button>
              </div>
              <p className="text-[10px] text-ink-500">
                Anyone with the link can view the itinerary, hotels, and map.
                Budget stays private.
              </p>
            </>
          )}

          {error && <span className="text-xs text-rose-600">{error}</span>}
        </div>
      )}
    </div>
  );
}
