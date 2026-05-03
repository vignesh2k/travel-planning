/** 80×80 grid of latitude/longitude lines — gives the page its
 *  "map paper" texture. */
export function GraticuleBg({
  opacity = 0.06,
  color = "#1f1a14",
}: {
  opacity?: number;
  color?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 w-full h-full pointer-events-none"
      preserveAspectRatio="none"
      style={{ opacity }}
    >
      <defs>
        <pattern id="atlas-grat" width="80" height="80" patternUnits="userSpaceOnUse">
          <path d="M 80 0 L 0 0 0 80" fill="none" stroke={color} strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#atlas-grat)" />
    </svg>
  );
}
