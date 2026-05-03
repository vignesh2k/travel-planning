/** Vertical "ATLAS · LAT · LONG · CITY" caption along the left edge. */
export function SideRail() {
  return (
    <div
      aria-hidden="true"
      className="absolute hidden lg:block pointer-events-none select-none"
      style={{
        left: 32,
        top: 110,
        fontFamily: "var(--font-mono)",
        fontSize: 10.5,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "var(--color-paper-ink-4)",
        writingMode: "vertical-rl",
        transform: "rotate(180deg)",
      }}
    >
      Atlas · 38.7223° N · 9.1393° W · Lisboa
    </div>
  );
}
