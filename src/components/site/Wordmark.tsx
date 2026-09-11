/** PAROS 워드마크 — 타이포 중심, 텍스트로 렌더링해 색상/크기를 CSS로 제어한다. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 20"
      role="img"
      aria-label="PAROS"
      className={className}
      fill="currentColor"
    >
      <text
        x="0"
        y="16"
        fontFamily="var(--font-pretendard), Pretendard, system-ui, sans-serif"
        fontSize="19"
        fontWeight="600"
        letterSpacing="4.2"
      >
        PAROS
      </text>
    </svg>
  );
}
