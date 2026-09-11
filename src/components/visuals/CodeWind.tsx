/** 세계관 코드 — WIND. 흐르는 곡선으로 가벼운 사용감을 추상화한다. */
export function CodeWind({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" role="img" aria-hidden="true" className={className}>
      <rect width="200" height="200" fill="#e3edf3" />
      <g fill="none" stroke="#8fb0c6" strokeWidth="2" strokeLinecap="round">
        <path d="M20 66 C70 46 110 46 150 66 C170 76 180 66 186 54" opacity="0.9" />
        <path d="M14 96 C64 76 120 76 168 100" opacity="0.65" />
        <path d="M26 126 C76 110 116 112 158 134" opacity="0.45" />
        <path d="M40 154 C80 142 110 144 140 158" opacity="0.3" />
      </g>
      <g fill="none" stroke="#e2622e" strokeWidth="2" strokeLinecap="round">
        <path d="M118 44 C138 40 150 46 156 58" opacity="0.55" />
      </g>
    </svg>
  );
}
