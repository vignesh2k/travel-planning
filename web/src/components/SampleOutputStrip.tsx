export function SampleOutputStrip() {
  return (
    <div className="atlas-rise atlas-rise-3 mt-7 hidden md:grid grid-cols-3 gap-2 text-left">
      <SampleTile
        label="Travel desk"
        title="Day-by-day map plan"
        detail="Pins, routing, restaurants, budget, and stays in one working view."
      />
      <SampleTile
        label="Plan health"
        title="Gaps surfaced early"
        detail="Dates, bookings, coverage, and map anchors stay visible."
      />
      <SampleTile
        label="Guide PDF"
        title="Reference-ready export"
        detail="A polished downloadable guide once the trip is ready."
      />
    </div>
  );
}

function SampleTile({
  label,
  title,
  detail,
}: {
  label: string;
  title: string;
  detail: string;
}) {
  return (
    <div
      className="rounded-[8px] border px-3 py-3"
      style={{
        background: "rgba(255,255,255,0.38)",
        borderColor: "rgba(168,95,37,0.12)",
        boxShadow: "0 18px 40px -34px rgba(31,26,20,0.45)",
      }}
    >
      <div
        className="text-[9px] font-semibold uppercase"
        style={{ color: "var(--color-terracotta-500)", letterSpacing: "0.14em" }}
      >
        {label}
      </div>
      <div className="mt-1 text-[12px] font-semibold text-ink-900 leading-snug">
        {title}
      </div>
      <div className="mt-1 text-[10px] leading-4 text-ink-500">
        {detail}
      </div>
    </div>
  );
}
