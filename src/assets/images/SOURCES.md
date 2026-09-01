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
| `panel-skin.jpg` | [hZQLs0Pq2Qg](https://unsplash.com/photos/hZQLs0Pq2Qg) | 야외 운동 뒤 어깨에 맺힌 땀방울 | /panel 머리말 뒤 |
| `panel-sample.jpg` | [PA6Ra3X-6_o](https://unsplash.com/photos/PA6Ra3X-6_o) | 상표 없는 흰 튜브 (3D 목업) | /panel "무엇을 하시게 되나요" 뒤 |
| `panel-notes.jpg` | [IZj7vckPGiw](https://unsplash.com/photos/IZj7vckPGiw) | 펼쳐 놓은 빈 노트와 펜 | /panel 배점표 뒤 |
| `cream-texture.jpg` | [kD9qprR6HBI](https://unsplash.com/photos/kD9qprR6HBI) | 베이지 바탕의 흰 크림 스와치 | 제품 상세 — 기준 섹션 뒤 |

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

## I8 네 컷을 스톡으로 채운 이유와, 채우지 **않은** 것

지시서 I8 은 촬영 네 종을 요구했습니다 — 샘플 튜브 · 평가 시트 · 백탁 비교 ·
운동 직후 피부. 실촬영이 10월 검증단 운영에 붙기 전까지 홈과 /panel 이 글자만
남는 문제를 먼저 풀기로 하고, 네 자리를 스톡으로 채웠습니다.

**다만 "백탁 비교" 자리에는 비교 사진을 두지 않았습니다.**

비교 사진은 *결과* 입니다. 도포 전후를 나란히 놓은 그림은 "우리 제품은 백탁이
없다" 는 **주장의 근거처럼** 읽히는데, 그 비교는 아직 하지 않았습니다. 남의
제품으로 찍힌 스톡 사진을 그 자리에 놓으면 하지 않은 시험의 결과를 내보이는
것이 되고, 그건 사진을 나중에 바꾼다고 없던 일이 되지 않습니다.

그래서 그 자리에는 **질감 사진**(`cream-texture.jpg`)을 두었습니다. 크림이
어떻게 생겼는가는 주장이 아니라 사실이고, 바로 위 문단이 "백탁을 양보하지
않는다" 는 기준을 말하고 있으므로 문맥도 맞습니다.

같은 이유로 `panel-notes.jpg` 는 **빈** 노트입니다. 채워진 평가지 사진을 쓰면
평가가 이미 진행된 것처럼 보입니다.

실촬영이 오면 위 표대로 같은 파일명에 덮어쓰면 됩니다. 백탁 비교를 실제로
찍은 뒤에는 그 자리를 비교 사진으로 바꾸고, 이 문단을 지우세요.
