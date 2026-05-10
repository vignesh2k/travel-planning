import type { ButtonHTMLAttributes, HTMLAttributes } from "react";

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

type ButtonTone = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_TONE: Record<ButtonTone, string> = {
  primary:
    "bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-sm hover:shadow-md disabled:opacity-50",
  secondary:
    "border border-amber-700/12 bg-white/80 text-ink-900 hover:bg-white disabled:opacity-50",
  ghost:
    "text-ink-500 hover:bg-white/70 hover:text-ink-900 disabled:opacity-50",
  danger:
    "border border-rose-100 bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-50",
};

export function AtlasButton({
  tone = "secondary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone }) {
  return (
    <button
      {...props}
      type={type}
      className={cx(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-semibold transition-shadow",
        BUTTON_TONE[tone],
        className,
      )}
    />
  );
}

type PillTone = "neutral" | "ready" | "review" | "private";

const PILL_TONE: Record<PillTone, string> = {
  neutral: "border-amber-700/10 bg-white/70 text-ink-500",
  ready: "border-emerald-200 bg-emerald-50 text-emerald-700",
  review: "border-orange-200 bg-orange-50 text-orange-700",
  private: "border-amber-200 bg-amber-50 text-amber-700",
};

export function AtlasPill({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: PillTone }) {
  return (
    <span
      {...props}
      className={cx(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold",
        PILL_TONE[tone],
        className,
      )}
    />
  );
}

type BadgeTone = "amber" | "sage" | "blue" | "ink";

const BADGE_TONE: Record<BadgeTone, string> = {
  amber: "bg-amber-600 text-white",
  sage: "bg-sage-500 text-white",
  blue: "bg-sky-700 text-white",
  ink: "bg-ink-900 text-white",
};

export function AtlasIconBadge({
  tone = "amber",
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      {...props}
      className={cx(
        "grid h-6 w-6 shrink-0 place-items-center rounded-[9px] text-[11px] font-bold",
        BADGE_TONE[tone],
        className,
      )}
      aria-hidden={props["aria-hidden"] ?? true}
    >
      {children}
    </span>
  );
}

export function AtlasPanel({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cx(
        "rounded-[14px] border border-amber-700/10 bg-white/75 shadow-sm backdrop-blur-md",
        className,
      )}
    />
  );
}
