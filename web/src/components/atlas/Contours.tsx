/** Concentric "topographic relief" contour lines. */
export function Contours({
  cx, cy, count = 9, seed = 1, opacity = 0.1, color = "#1f1a14",
}: {
  cx: number;
  cy: number;
  count?: number;
  seed?: number;
  opacity?: number;
  color?: string;
}) {
  const lines: React.ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    const r = 8 + i * 6;
    const wobble = (Math.sin(i * 1.7 + seed) * 0.5 + 1) * 4;
    const path =
      `M ${cx - r} ${cy} ` +
      `C ${cx - r} ${cy - r * 0.8 - wobble}, ${cx - r * 0.4} ${cy - r - wobble}, ${cx + r * 0.2} ${cy - r * 0.9} ` +
      `S ${cx + r} ${cy - r * 0.2}, ${cx + r} ${cy + wobble * 0.5} ` +
      `S ${cx + r * 0.3} ${cy + r}, ${cx - r * 0.3} ${cy + r * 0.95} ` +
      `S ${cx - r} ${cy + r * 0.2}, ${cx - r} ${cy} Z`;
    lines.push(
      <path
        key={i}
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="0.25"
        opacity={1 - i / (count + 2)}
      />,
    );
  }
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity }}
    >
      {lines}
    </svg>
  );
}
