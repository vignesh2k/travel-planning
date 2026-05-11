"use client";

import type { Place, PlanningStatusValue } from "@/lib/types";
import { PLACE_CATEGORY_EMOJI } from "@/lib/place-category";

import { StatusChip } from "./StatusChip";
import { AtlasIconBadge, cx } from "./ui/AtlasPrimitives";

const CATEGORY_BADGE: Record<
  Place["category"],
  { label: string; tone: "amber" | "sage" | "blue" | "ink" }
> = {
  neighbourhood: { label: PLACE_CATEGORY_EMOJI.neighbourhood, tone: "blue" },
  restaurant: { label: PLACE_CATEGORY_EMOJI.restaurant, tone: "sage" },
  photography_spot: { label: PLACE_CATEGORY_EMOJI.photography_spot, tone: "amber" },
  logistics: { label: PLACE_CATEGORY_EMOJI.logistics, tone: "ink" },
};

export function ActivityCard({
  id,
  text,
  place,
  status,
  selected,
  focused,
  onFocus,
  onResetFocus,
}: {
  id?: string;
  text: string;
  place: Place | null;
  status?: PlanningStatusValue;
  selected: boolean;
  focused: boolean;
  onFocus: () => void;
  onResetFocus: () => void;
}) {
  const clickable = Boolean(place && place.lat !== null && place.lng !== null);
  const badge = place ? CATEGORY_BADGE[place.category] : null;

  return (
    <div
      className={cx(
        "rounded-[13px] border bg-white/68 shadow-sm transition",
        focused && "border-amber-500/45 bg-amber-50 ring-2 ring-amber-500/25",
        selected && !focused && "border-amber-600/45 bg-[rgba(201,100,66,0.10)]",
        !selected && !focused && "border-amber-700/10",
        clickable && !selected && !focused && "hover:border-amber-600/30 hover:bg-white/92",
      )}
    >
      <button
        id={id}
        type="button"
        onClick={() => {
          if (clickable) onFocus();
        }}
        onMouseEnter={() => {
          if (clickable) onFocus();
        }}
        onMouseLeave={onResetFocus}
        disabled={!clickable}
        className="flex w-full min-w-0 items-start gap-2 px-3 py-2 text-left disabled:cursor-default"
      >
        {badge ? (
          <AtlasIconBadge tone={badge.tone}>{badge.label}</AtlasIconBadge>
        ) : (
          <AtlasIconBadge tone="ink">•</AtlasIconBadge>
        )}
        <span className="min-w-0 flex-1 text-[12px] leading-5 text-ink-900">
          {text}
        </span>
        {status && (
          <span className="shrink-0 pt-0.5">
            <StatusChip value={status} compact />
          </span>
        )}
      </button>
    </div>
  );
}
