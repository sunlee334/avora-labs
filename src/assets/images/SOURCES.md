# 목업 이미지 출처

**디자인 방향을 보여주기 위한 임시 이미지입니다.** 실제 런칭 시 브랜드가 촬영·구매한
이미지로 교체됩니다. 교체할 때는 같은 파일명으로 덮어쓰면 코드를 고칠 필요가 없습니다.
(Astro 가 빌드 때 webp·avif 로 변환하고 화면 폭별 크기를 자동 생성합니다.)

전부 [Unsplash](https://unsplash.com) — 무료 상업적 이용 가능.

| 파일 | Unsplash | 설명 | 쓰이는 곳 |
|---|---|---|---|
| `hero-runner-sunrise.jpg` | [I1EWTM5mFEM](https://unsplash.com/photos/I1EWTM5mFEM) | 낮은 태양을 배경으로 바위길을 달리는 실루엣 | 홈 히어로 |
| `skin-sweat.jpg` | [AMPQP0OPJTE](https://unsplash.com/photos/AMPQP0OPJTE) | 등에 맺힌 작은 땀방울 | 홈 이미지 브레이크 |
| `product-daily-sunscreen.jpg` | [O59iUx4_Cdc](https://unsplash.com/photos/O59iUx4_Cdc) | 흰색 아치 조형물과 테라조 바닥 (**잘라 쓴 것** — 아래 참조) | 제품 상세 히어로 |
| `water-droplets.jpg` | [7VyXToCotr4](https://unsplash.com/photos/7VyXToCotr4) | 물방울 클로즈업 | 제품 상세 하단 |

## 교체 방법
1. 새 이미지를 위 파일명 그대로 이 폴더에 덮어쓰기 (원본 해상도 그대로 두세요 — 축소는 빌드가 합니다)
2. `src/i18n/{언어}.json` 의 `imageAlt` 값을 새 사진 내용에 맞게 수정
3. `npm run build`

## `product-daily-sunscreen.jpg` 를 잘라 쓰는 이유

원본에는 **다른 브랜드의 제품이 상표가 읽히는 상태로** 담겨 있습니다. 사진가가
The Ordinary 제품을 찍은 것인데, 그것을 우리 제품 페이지의 히어로와 공유
이미지로 쓰면 두 가지가 문제입니다.

1. **상표권은 저작권과 별개입니다.** Unsplash 라이선스는 사진의 사용을
   허락하지만 사진에 담긴 상표까지 허락하지 않습니다.
2. **손님이 그것을 우리 제품으로 봅니다.** 아직 제품이 없는 브랜드의 제품
   페이지 히어로라, 남의 제품을 우리 것으로 보여 주는 셈입니다. 지시서가
   경쟁사를 언급하거나 비교하지 말라고 한 것과도 어긋납니다.

그래서 병이 있는 오른쪽 아래를 잘라내고 **조형물과 바닥의 질감만** 남겼습니다
(원본 1200×1800 → 740×1400, `left:0 top:200`). 남은 것은 제품 사진이 아니라
재질 사진이고, 그건 `water-droplets.jpg` 와 같은 성격입니다.

실촬영으로 교체할 때는 위 표대로 같은 파일명에 덮어쓰면 됩니다.
