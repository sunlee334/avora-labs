/** 세계관 코드 — STONE. 쌓인 돌의 형태로 '책상 위에 두는 오브제' 태도를 추상화한다. */
export function CodeStone({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" role="img" aria-hidden="true" className={className}>
      <rect width="200" height="200" fill="#ede9e1" />
      <ellipse cx="100" cy="160" rx="58" ry="10" fill="#1e2124" opacity="0.06" />
      <path d="M56 150 C50 128 62 112 92 110 C124 108 140 122 138 144 C136 158 116 164 94 163 C74 162 60 160 56 150 Z" fill="#8fb0c6" />
      <path d="M70 112 C66 96 78 84 100 84 C120 84 130 96 126 112 C122 122 108 126 96 125 C82 124 73 120 70 112 Z" fill="#afc8d8" />
      <path d="M86 82 C84 70 92 62 104 62 C116 62 122 72 118 82 C115 89 106 91 100 90 C92 89 87 87 86 82 Z" fill="#cfdfe8" />
    </svg>
  );
}
