/** Three sinuous "coastline" strokes. Pure atmosphere. */
export function WanderingStrokes({ className = "" }: { className?: string }) {
  const wandering = (offset: number, amp: number) => {
    const pts: string[] = [];
    for (let x = -10; x < 110; x += 4) {
      const y =
        50 +
        Math.sin((x + offset) * 0.07) * amp +
        Math.sin((x + offset) * 0.18) * amp * 0.3;
      pts.push(`${x},${y}`);
    }
    return "M " + pts.join(" L ");
  };
  return (
    <svg
      viewBox="0 0 100 65"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className={`absolute inset-0 w-full h-full pointer-events-none opacity-50 ${className}`}
    >
      <path d={wandering(0, 8)} fill="none" stroke="rgba(31,26,20,0.10)" strokeWidth="0.15" />
      <path d={wandering(50, 12)} fill="none" stroke="rgba(31,26,20,0.08)" strokeWidth="0.15" />
      <path d={wandering(120, 6)} fill="none" stroke="rgba(31,26,20,0.07)" strokeWidth="0.15" />
    </svg>
  );
}
