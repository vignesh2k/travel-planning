import type { Hotel } from "@/lib/types";

export function HotelCard({ hotel }: { hotel: Hotel }) {
  return (
    <a
      href={hotel.booking_url}
      target="_blank"
      rel="noopener noreferrer"
      className="frosted rounded-[14px] p-3 flex items-start gap-2 hover:bg-white/85 hover:border-amber-600/30"
    >
      <span className="text-[14px] leading-none mt-0.5 shrink-0" aria-hidden>🏨</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-ink-900">{hotel.name}</div>
        <div className="text-xs text-ink-700 leading-snug mt-0.5">{hotel.description}</div>
        <div className="text-[11px] text-amber-700 mt-1.5">View on Booking →</div>
      </div>
    </a>
  );
}
