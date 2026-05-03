export function BrandMark() {
  return (
    <div className="flex items-center gap-2">
      <BrandIcon className="w-6 h-6" />
      <div className="font-display text-sm font-semibold text-ink-900 tracking-tight">Atlas</div>
    </div>
  );
}

export function BrandIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="atlas-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffd28a" />
          <stop offset="45%" stopColor="#ff8a3a" />
          <stop offset="100%" stopColor="#e8470f" />
        </linearGradient>
        <radialGradient id="atlas-sheen" cx="20%" cy="0%" r="80%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <clipPath id="atlas-squircle">
          <rect x="0" y="0" width="512" height="512" rx="114.5" ry="114.5" />
        </clipPath>
      </defs>
      <g clipPath="url(#atlas-squircle)">
        <rect width="512" height="512" fill="url(#atlas-bg)" />
        <circle cx="256" cy="208" r="62" fill="#fffaf2" />
        <path d="M120 396 L 224 196 L 328 396 Z" fill="#fffaf2" opacity="0.55" />
        <path d="M232 396 L 336 232 L 440 396 Z" fill="#fffaf2" />
        <rect width="512" height="512" fill="url(#atlas-sheen)" />
      </g>
    </svg>
  );
}
