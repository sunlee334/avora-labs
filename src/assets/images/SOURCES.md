# 목업 이미지 출처

**디자인 방향을 보여주기 위한 임시 이미지입니다.** 실제 런칭 시 브랜드가 촬영·구매한
이미지로 교체됩니다. 교체할 때는 같은 파일명으로 덮어쓰면 코드를 고칠 필요가 없습니다.
(Astro 가 빌드 때 webp·avif 로 변환하고 화면 폭별 크기를 자동 생성합니다.)

전부 [Unsplash](https://unsplash.com) — 무료 상업적 이용 가능.

| 파일 | Unsplash | 설명 | 쓰이는 곳 |
|---|---|---|---|
| `hero-runner-sunrise.jpg` | [I1EWTM5mFEM](https://unsplash.com/photos/I1EWTM5mFEM) | 낮은 태양을 배경으로 바위길을 달리는 실루엣 | 홈 히어로 |
| `skin-sweat.jpg` | [AMPQP0OPJTE](https://unsplash.com/photos/AMPQP0OPJTE) | 등에 맺힌 작은 땀방울 | 홈 이미지 브레이크 |
| `product-daily-sunscreen.jpg` | [O59iUx4_Cdc](https://unsplash.com/photos/O59iUx4_Cdc) | 밝은 표면 위 흰색 용기 | 제품 상세 히어로 |
| `water-droplets.jpg` | [7VyXToCotr4](https://unsplash.com/photos/7VyXToCotr4) | 물방울 클로즈업 | 제품 상세 하단 |

## 교체 방법
1. 새 이미지를 위 파일명 그대로 이 폴더에 덮어쓰기 (원본 해상도 그대로 두세요 — 축소는 빌드가 합니다)
2. `src/i18n/{언어}.json` 의 `imageAlt` 값을 새 사진 내용에 맞게 수정
3. `npm run build`
