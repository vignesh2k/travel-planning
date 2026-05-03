/** Decorative compass rose — top-right corner ornament. */
export function CompassMark() {
  return (
    <div
      aria-hidden="true"
      className="absolute hidden md:block pointer-events-none"
      style={{ top: 76, right: 32, width: 70, height: 70, opacity: 0.5 }}
    >
      <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
        <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(31,26,20,0.3)" strokeWidth="0.4" />
        <circle cx="50" cy="50" r="32" fill="none" stroke="rgba(31,26,20,0.15)" strokeWidth="0.4" />
        <g
          className="atlas-compass-needle"
          style={{ transformBox: "fill-box", transformOrigin: "50% 50%" }}
        >
          <path d="M50 8 L54 50 L50 54 L46 50 Z" fill="rgba(201,100,66,0.7)" />
          <path d="M50 92 L54 50 L50 46 L46 50 Z" fill="rgba(31,26,20,0.4)" />
        </g>
        <text
          x="50"
          y="6"
          textAnchor="middle"
          fontSize="6"
          fontFamily="JetBrains Mono"
          fill="rgba(31,26,20,0.6)"
        >
          N
        </text>
      </svg>
    </div>
  );
}
