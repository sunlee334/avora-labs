/**
 * 홈 히어로 비주얼. Landscape → Lifestyle → Product 순서를 한 구성 안에 압축한다.
 * 수평선(landscape) + 움직임의 궤적(lifestyle, 점 하나의 이동으로만 암시) + 제품 실루엣(product, 비중 최소).
 * 그리스 관광지 이미지·스포츠 시각 언어(번개·스피드라인·네온) 없음. 오렌지는 움직임 지점에만 소량.
 */
export function HeroVisual({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 640 640" role="img" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="heroSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6f4ef" />
          <stop offset="1" stopColor="#e3edf3" />
        </linearGradient>
        <linearGradient id="heroGround" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#cfdfe8" />
          <stop offset="1" stopColor="#afc8d8" />
        </linearGradient>
        <radialGradient id="heroSun" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#f1f6f9" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="640" height="640" fill="url(#heroSky)" />
      <circle cx="452" cy="176" r="120" fill="url(#heroSun)" />
      <circle cx="452" cy="176" r="46" fill="#f1f6f9" />
      <path d="M0 392 C160 356 480 356 640 400 L640 640 L0 640 Z" fill="url(#heroGround)" />
      <path d="M0 392 C160 356 480 356 640 400" fill="none" stroke="#8fb0c6" strokeWidth="1.5" opacity="0.6" />

      <path
        d="M96 320 C180 300 232 244 300 250 C368 256 392 210 470 214"
        fill="none"
        stroke="#567a93"
        strokeWidth="2"
        strokeDasharray="1 14"
        strokeLinecap="round"
        opacity="0.7"
      />
      <circle cx="470" cy="214" r="7" fill="#e2622e" />
      <circle cx="470" cy="214" r="14" fill="none" stroke="#e2622e" strokeWidth="1.5" opacity="0.4" />

      <g transform="translate(150 430)">
        <path
          d="M40 46 C40 34 46 26 60 26 L96 26 C110 26 116 34 116 46 L124 168 C124 182 112 192 98 192 L58 192 C44 192 32 182 32 168 Z"
          fill="#f6f4ef"
          fillOpacity="0.85"
          stroke="#afc8d8"
          strokeWidth="1.5"
        />
        <rect x="62" y="10" width="32" height="20" rx="6" fill="#afc8d8" fillOpacity="0.85" />
      </g>
    </svg>
  );
}
