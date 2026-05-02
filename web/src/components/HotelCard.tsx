import type { Hotel } from "@/lib/types";

export function HotelCard({ hotel }: { hotel: Hotel }) {
  return (
    <a
      href={hotel.booking_url}
      target="_blank"
      rel="noopener noreferrer"
      className="frosted rounded-[14px] p-3 flex flex-col gap-1 hover:bg-white/85"
    >
      <div className="text-sm font-semibold text-ink-900">{hotel.name}</div>
      <div className="text-xs text-ink-700 leading-snug">{hotel.description}</div>
      <div className="text-[11px] text-amber-700 mt-1">View on Booking →</div>
    </a>
  );
}
