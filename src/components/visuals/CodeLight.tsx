/** 세계관 코드 — LIGHT. 방사형 그라디언트로 빛을 추상화한다. 그리스 관광지 이미지 요소 없음. */
export function CodeLight({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" role="img" aria-hidden="true" className={className}>
      <defs>
        <radialGradient id="codeLightGlow" cx="50%" cy="42%" r="60%">
          <stop offset="0" stopColor="#f1f6f9" />
          <stop offset="0.55" stopColor="#cfdfe8" />
          <stop offset="1" stopColor="#afc8d8" />
        </radialGradient>
      </defs>
      <rect width="200" height="200" fill="url(#codeLightGlow)" />
      <circle cx="100" cy="84" r="34" fill="none" stroke="#567a93" strokeOpacity="0.35" strokeWidth="1" />
      <circle cx="100" cy="84" r="52" fill="none" stroke="#567a93" strokeOpacity="0.2" strokeWidth="1" />
      <g stroke="#8fb0c6" strokeWidth="1.5" strokeLinecap="round">
        <line x1="100" y1="18" x2="100" y2="32" />
        <line x1="100" y1="136" x2="100" y2="150" />
        <line x1="34" y1="84" x2="48" y2="84" />
        <line x1="152" y1="84" x2="166" y2="84" />
        <line x1="53" y1="37" x2="63" y2="47" />
        <line x1="137" y1="121" x2="147" y2="131" />
        <line x1="147" y1="37" x2="137" y2="47" />
        <line x1="63" y1="121" x2="53" y2="131" />
      </g>
    </svg>
  );
}
