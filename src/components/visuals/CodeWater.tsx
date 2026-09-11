/** 세계관 코드 — WATER. 동심원 물결로 밀착과 내수성을 추상화한다. */
export function CodeWater({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" role="img" aria-hidden="true" className={className}>
      <rect width="200" height="200" fill="#cfdfe8" />
      <g fill="none" stroke="#567a93" strokeWidth="1.4">
        <circle cx="100" cy="108" r="18" opacity="0.55" />
        <circle cx="100" cy="108" r="36" opacity="0.42" />
        <circle cx="100" cy="108" r="54" opacity="0.3" />
        <circle cx="100" cy="108" r="72" opacity="0.18" />
      </g>
      <circle cx="100" cy="108" r="5" fill="#6f96b0" />
      <path
        d="M40 46 C46 40 54 40 60 46 C66 52 66 60 60 66"
        fill="none"
        stroke="#f1f6f9"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  );
}
