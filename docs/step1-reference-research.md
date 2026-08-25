# Step 1 — 레퍼런스 리서치 결과

작성일: 2026-08-25 · 상태: **검토 대기(pending approval)** · 코드 미작성

---

## A. 레퍼런스 브랜드 사이트 분석

모바일 뷰포트 **390×844(iPhone 14 기준)** 로 실제 접속해 전체 페이지를 캡처하고 분석했습니다.

> 캡처 이미지는 타사 사이트 화면이라 저장소에 커밋하지 않습니다. 아래 분석만 남깁니다.
> 다시 보려면 각 사이트를 모바일 폭으로 직접 열어보시면 됩니다.

### A-1. On Running (on.com) — ⭐ AVORA와 가장 가까운 레퍼런스
| 항목 | 관찰 |
|---|---|
| 히어로 | 풀블리드 인물 사진 + 하단 정렬 텍스트 + CTA 2개(`Watch the film` / `Shop now`) — 영상형 CTA를 커머스 CTA와 나란히 |
| 네비게이션 | **하단 고정 아이콘 바**(검색·백·위시·계정·메뉴). 엄지 도달 영역을 정확히 씀 |
| 카테고리 탐색 | 이미지 그리드 대신 **텍스트 링크 목록**(`Running →` `Trail running →`) — 스캔 속도가 빠르고 가볍다 |
| 캐러셀 | 가로 스크롤 + 좌우 화살표 + **프로그레스 바 인디케이터** |
| 스토리 배치 | `Stories that move` 섹션으로 브랜드 서사를 커머스 흐름 안에 삽입 |
| 카피 | **"Our mission — Ignite the human spirit through movement"** |
| 지역화 | 푸터에 국가 선택기(🇺🇸 United States) |
| 톤 | 큰 여백, 타이포 중심, 절제된 무채색 |

**AVORA 적용 포인트:** `Ignite the human spirit through movement`와 AVORA의 `For every movement.`는 사실상 같은 언어입니다. 액티브 라이프스타일 브랜드가 "스포츠 브랜드로 보이지 않으면서 움직임을 말하는" 톤의 정답에 가깝습니다. 하단 고정 바 · 텍스트 링크 탐색 · 프로그레스 인디케이터 캐러셀 3가지는 모바일 퍼스트 원칙에 그대로 채택할 만합니다.

### A-2. Vacation (vacation.inc) — 세계관 구축의 극단
| 항목 | 관찰 |
|---|---|
| 컨셉 | 70년대 리조트 세계관을 끝까지 밀어붙임. 자체 라디오 방송국(`Radio Vacation`)까지 운영 |
| 레이아웃 | 섹션마다 배경색을 교차(민트/크림/피치/블루) — 스크롤 자체가 리듬이 됨 |
| 타이포 | 세리프 디스플레이 + 에디토리얼 캡션 |
| 제품 설명 | `Leisure-Enhancing Formulas`, `World's Best-Smelling Scents`, `Hawaii Act 104 Compliant & Dermatologist Tested` — **기능을 브랜드 언어로 번역**해 소제목화 |
| ⚠️ 나쁜 사례 | 진입 즉시 10% 할인 모달이 화면을 덮음 |

**AVORA 적용 포인트:** "섹션별 배경색 교차로 스크롤에 리듬 주기"는 원페이지 스토리 스크롤에 그대로 쓸 수 있습니다. 브랜드 컬러 A안/B안 어느 쪽이든 3~4단계 톤으로 교차 가능. 반대로 진입 모달은 **채택하지 않습니다**(LCP·CLS·이탈률 모두 악화).

### A-3. Ultra Violette (ultraviolette.com.au) — 선스크린 전문 D2C
| 항목 | 관찰 |
|---|---|
| 제품 신뢰 | `OUR SPF TESTING STANDARDS` 섹션에서 시험 프로토콜을 직접 설명 → 기능성 신뢰 확보 |
| 제품 추천 | `WHICH SKINSCREEN™ IS RIGHT FOR ME?` 퀴즈 CTA |
| 제품 카드 | `BEST SELLER` 뱃지 + 용량(75ml/125ml) + 가격 |
| 푸터 | `SHOP ULTRA VIOLETTE` 아래 SPF 30+/50+/Face/Physical/Tinted/Fragrance Free/Spray/Mini — **속성별 진입 링크로 SEO 표면적 확보** |
| 지역화 | 푸터에 통화 선택기(Australia AUD $) |
| ⚠️ 나쁜 사례 | 여기도 진입 즉시 10% 할인 모달 |

**AVORA 적용 포인트:** 선스크린은 "믿을 수 있는가"가 구매 장벽입니다. 제품기획서의 `Water Resistant 처방 · 시험자료 확보 필요` 항목이 확정되면 **시험 기준을 설명하는 섹션**을 두는 게 전환에 직접 기여합니다. 푸터 속성 링크는 제품이 1종인 지금은 불필요하지만 SKU가 늘면 도입.

### A-4. Beauty of Joseon (beautyofjoseon.com) — 글로벌 K-뷰티, 지역 감지 실사례
| 항목 | 관찰 |
|---|---|
| **지역 감지** | 진입 시 *"Hi, looks like you're from Korea, Republic of 🇰🇷. Do you want to redirect to your local store?"* + `Yes Please!` / `No, Stay Here` |
| 제품 카드 | 리뷰 별점 + **리뷰 수**(1,228 Reviews) + 할인율 뱃지 + 원가 취소선 |
| 제품 선택 | `Find Your Tinted Dayscreen Shade` — 셰이드 선택 UI |
| ⚠️ 나쁜 사례 | 지역 모달 + 여름휴가 공지 모달이 **동시에** 첫 화면을 덮음 |

**AVORA 적용 포인트:** Round 13에서 정한 `Worker의 Accept-Language 기반 서버측 302`가 이 사이트의 클라이언트 모달 방식보다 우월하다는 걸 실물로 확인했습니다. Beauty of Joseon 방식은 화면 깜빡임 + 모달 중첩 + 사용자 액션 요구라는 3중 비용을 냅니다. **다만 "강제 전환하지 않고 선택권을 준다"는 원칙은 채택** — 서버측 302로 보내되 헤더에 언어 전환 UI를 항상 노출.

### A-5. Supergoop (supergoop.com) — 선케어 카테고리 리더
| 항목 | 관찰 |
|---|---|
| 히어로 | 폴라로이드 콜라주 + 손글씨 낙서 요소 — 밝고 캐주얼 |
| 헤드라인 | `PRIMED FOR NOW, PROTECTED FOR LATER` — 대문자 굵은 산세리프 |
| 제품 카드 | 별점 + 가격 **범위**($12–$58, 용량 옵션 반영) + `Bestseller` 뱃지 |
| 푸터 | 아코디언(RESOURCES / SUPERGOOP! / TERMS) + 대형 워드마크 |
| 관찰 | 전체 캡처에서 중간 섹션이 다수 비어 있음 → **스크롤 트리거 지연 로딩**을 광범위하게 사용 중 |

**AVORA 적용 포인트:** 대형 워드마크 푸터는 Bodoni 72 워드마크와 잘 맞습니다. 지연 로딩 패턴은 Round 10에서 정한 "무거운 라이브러리 LCP 이후 로딩"과 동일한 전략.

### A-6. 라운드랩 (roundlab.co.kr) — 🔴 국내 반례
390px 뷰포트로 접속했는데 **1300px 데스크톱 레이아웃 그대로 렌더**됐습니다. 반응형 대응 없이 별도 모바일 페이지를 운영하는 구조로 보입니다.

**AVORA 적용 포인트:** 제품기획서가 라운드랩 자작나무 선크림(15,900원)을 가격 기준점으로 삼았는데, **웹 경험에서는 정반대로 가야 할 반례**입니다. 국내 뷰티 D2C 상당수가 쇼핑몰 솔루션 기본 템플릿에 머물러 있어, 모바일 퍼스트 완성도 자체가 AVORA의 차별점이 될 수 있습니다.

### A-7. 공통 패턴 요약
| 패턴 | 채택 | 근거 |
|---|---|---|
| 하단 고정 액션 바 | ✅ | On. 엄지 도달 영역 |
| 섹션 배경색 교차 | ✅ | Vacation. 스크롤 리듬 |
| 기능을 브랜드 언어로 소제목화 | ✅ | Vacation. `LIGHT/COMFORT/PROTECTION/RESET`을 그대로 씀 |
| 시험·기준 설명 섹션 | ✅ | Ultra Violette. 선스크린 신뢰 장벽 해소 |
| 지연 로딩 + 스크롤 트리거 | ✅ | Supergoop. Round 10 제약과 일치 |
| 대형 워드마크 푸터 | ✅ | Supergoop. Bodoni 워드마크와 궁합 |
| 진입 즉시 할인/지역 모달 | ❌ | Vacation·UV·BOJ 3곳 모두. LCP·CLS·이탈 악화 |
| 클라이언트 지역 감지 모달 | ❌ | BOJ. 서버측 302가 우월 |

---

## B. 국내 PG 비교 (공식 페이지 실측, 2026-08-25)

### B-1. 수수료·정산 (VAT 별도)

| 항목 | 토스페이먼츠 | 나이스페이 베이직 | 나이스페이 스페셜 |
|---|---|---|---|
| 신용·체크카드 | **3.4%** | 3.5% | **2.9%** |
| 정산주기(카드) | 평균 5일 이내 | D+7 | **D+3** |
| 계좌이체 | 2.0% (최저 200원) | 2.5% (최저 250원) | 1.8% (최저 200원) |
| 가상계좌 | 건당 400원 | 건당 300원 | 건당 250원 |
| 네이버페이 | 3.4%(일부 추가) | 3.6% | 3.0% |
| 카카오페이 | 3.4%(일부 추가) | 3.5% | 2.9% |
| 삼성페이 | — | 3.8% | 3.2% |
| 토스페이 | — | 별도 협의 | 별도 협의 |
| 가입비 | **220,000원** | 프로모션 기간 면제 | 프로모션 기간 면제 |
| 연관리비 | **110,000원** | 프로모션 기간 면제 | 프로모션 기간 면제 |

> 출처: [토스페이먼츠 수수료 안내](https://www.tosspayments.com/about/fee) · [나이스페이먼츠 수수료 안내](https://www.nicepay.co.kr/apply/guide/fee.do)
> 나이스페이 스페셜 플랜의 적용 조건은 공개 페이지에 명시돼 있지 않아 **직접 문의 필요**. KG이니시스·KCP는 공개 요율표를 게시하지 않아 개별 견적 필요.

### B-2. 포트원(PortOne)의 위치
포트원은 PG가 아니라 여러 PG를 **하나의 API로 묶어주는 허브**입니다. 신규 사업자에게 유의미한 지점:
- 가입비(업계 평균 약 22만원) 면제 패키지 제공
- 나중에 PG를 교체하거나 해외로 확장할 때 프론트 코드 변경 최소화
- 대신 중간 사업자가 하나 더 끼고, 수수료 구조가 달라질 수 있음

> 출처: [포트원 PG 비교 2026](https://blog.portone.io/opi_pg-comparison2026/)

### B-3. Cloudflare Workers 연동 가능성 — ✅ 검증 완료
토스페이먼츠 v2 결제 흐름을 공식 문서로 확인했습니다:
1. 프론트에서 `TossPayments(clientKey)` → `requestPayment({successUrl, failUrl})`로 결제창 호출
2. 성공 시 `successUrl`로 리다이렉트되며 쿼리에 `paymentKey` · `orderId` · `amount` 전달
3. 서버가 **시크릿 키 + 콜론을 base64 인코딩한 Basic 인증**으로 승인 API에 POST
4. **결제 요청 후 10분 이내 승인 필수**

문서에 *"순수 REST API 호출이므로 Node.js가 아닌 모든 서버 언어에서 구현 가능"* 이라고 명시돼 있습니다.
→ **Cloudflare Workers의 `fetch()`만으로 구현 가능. Node 런타임 불필요.** Round 2~6에서 설계한 "Worker 승인 엔드포인트 1개" 구조가 실제로 성립합니다.

> 출처: [토스페이먼츠 결제 연동 가이드 v2](https://docs.tosspayments.com/guides/v2/payment-widget/integration)

### B-4. 권고
| 순위 | 안 | 근거 |
|---|---|---|
| 1 | **나이스페이 스페셜 플랜 조건 문의 → 가능하면 채택** | 카드 2.9% / D+3은 표 안에서 최저·최속. 가입비도 프로모션 면제. 초도자금 2천만원 규모에서 D+3 정산은 현금흐름에 직접 도움 |
| 2 | **토스페이먼츠** | 개발 문서 품질이 가장 좋고 REST 흐름이 단순해 Workers 연동 리스크가 가장 낮음. 대신 가입비 22만 + 연 11만이 확정 비용 |
| 3 | 포트원 경유 | PG 교체·해외 확장 가능성을 크게 본다면. 지금은 한국 단독 판매라 이점이 작음 |

> ⚠️ **모든 PG 공통 선행조건:** 사업자등록 + 통신판매업 신고 + **서비스 도메인 확정**. 스펙의 도메인 리스크와 직결됩니다.

---

## C. 프레임워크 — Next.js vs Astro

### C-1. 🔴 판을 바꾸는 사실
**2026년 1월 16일, Cloudflare가 Astro 개발사(The Astro Technology Company)를 인수했습니다.** Astro는 오픈소스로 유지되며, 인수 발표 같은 주에 나온 **Astro 6 베타는 Cloudflare의 `workerd` 런타임 위에서 도는 개발 서버**를 탑재했습니다.

> 출처: [Cloudflare 공식 보도자료](https://www.cloudflare.com/press/press-releases/2026/cloudflare-acquires-astro-to-accelerate-the-future-of-high-performance-web-development/)

우리는 Round 5에서 이미 **Cloudflare Workers 단독 호스팅**을 확정했습니다. 그 플랫폼의 소유사가 만드는 프레임워크라면 배포 궁합·장기 지원 면에서 다른 조건이 됩니다.

### C-2. 비교

| 기준 | Astro | Next.js |
|---|---|---|
| 기본 JS 페이로드 | 0에 가까움 (아일랜드 하이드레이션) | React 런타임 포함 |
| 정적 사이트 Lighthouse | 95–100 | 85–95 |
| Cloudflare Workers | **네이티브 (인수 + Astro 6 workerd)** | `@opennextjs/cloudflare` 어댑터 경유 |
| i18n | `astro:i18n` 내장, 언어별 정적 경로 생성 | `next-intl` 등 외부 라이브러리 |
| 인터랙션(GSAP/Lenis/Framer) | 아일랜드로 필요한 곳만 하이드레이션 → 지연 로딩 제약과 궁합 좋음 | 전역 React 트리에 얹힘 |
| 생태계·자료 | 상대적으로 작음 | 압도적으로 큼 |
| 사용자 원 선호 | — | ✅ 문서에서 선호 표명 |

> 출처: [Astro vs Next.js 2026 벤치마크](https://alexbobes.com/programming/astro-vs-nextjs/) · [Astro vs Next.js 정적 사이트 가이드](https://eastondev.com/blog/en/posts/dev/20251202-astro-vs-nextjs-static-site/)

### C-3. 권고 — **Astro**
근거를 우선순위 순으로:
1. **1순위 원칙이 모바일 성능**이고, Round 8에서 모바일 Lighthouse Performance ≥90을 합격선으로 못 박았습니다. Astro는 이 선을 여유롭게 넘고 Next.js는 빠듯합니다.
2. **호스팅이 Cloudflare Workers로 확정**됐고, 이제 Astro는 그 플랫폼의 자사 프레임워크입니다. 어댑터 레이어가 사라집니다.
3. 이 사이트의 성격이 **콘텐츠 중심 원페이지 + 제품 상세 + 최소 커머스**입니다. Next.js의 강점(대규모 동적 앱, 서버 컴포넌트)이 쓰일 자리가 거의 없습니다.
4. SEO/GEO 요구인 "초기 HTML에 본문 텍스트 포함"은 두 프레임워크 모두 만족하지만, Astro는 JS 없이도 만족합니다.

**단, 사용자님이 문서에서 Next.js를 선호한다고 명시하셨으므로 이건 제 권고일 뿐이고 결정은 확인받겠습니다.** Next.js를 택해도 Round 8 기준을 맞출 수는 있으나, 번들 예산 관리에 더 많은 노력이 듭니다.

---

## D. llms.txt — 적용 여부 검토

### D-1. 조사 결과
| 항목 | 사실 |
|---|---|
| 채택률 | 측정 방식별 편차 큼. Tranco 상위 1,000 기준 **8.7%**(2026-06), Web Almanac 2025 기준 **약 2.1%** |
| 주요 AI사 지원 | **2026년 1분기 기준 OpenAI·Google·Anthropic·Meta·Mistral 중 프로덕션에서 읽겠다고 공개 약속한 곳 없음** |
| Google 입장 | 2026년 6월 문서 업데이트에서 *"llms.txt는 검색 순위와 AI Overviews에 긍정·부정 어느 쪽으로도 영향 없음. 검색은 이 파일을 무시함"* |
| 실효 용례 | 개발자 도구 쪽(Cursor·Copilot·Claude가 문서를 실시간 조회할 때)에서 주로 유효 |

> 출처: [The State of llms.txt in 2026](https://ai.aeo.press/the-state-of-llms-txt-in-2026) · [llms.txt in Practice](https://www.digitalapplied.com/blog/llms-txt-in-practice-adoption-evidence-2026)

### D-2. 권고 — **넣되, GEO 예산은 다른 곳에**
`llms.txt`는 생성 비용이 사실상 0이고 해가 없으므로 **넣습니다.** 다만 이걸로 AI 검색 노출이 늘 거라 기대하지 않습니다.

**실제 GEO 레버는 요구사항 문서 9번이 이미 정확히 짚은 쪽입니다:**
- 브랜드·제품 핵심 사실을 **모호한 감성 문구가 아니라 명확한 사실 문장**으로 제공
- `schema.org` JSON-LD (`Product` / `Organization` / `BreadcrumbList`)
- 초기 HTML에 본문 텍스트 포함 (Astro면 자동 충족)
- 언어별 `hreflang` + 독립 메타데이터

즉 GEO 작업의 90%는 llms.txt가 아니라 **콘텐츠 구조와 구조화 데이터**에 있습니다.

---

## E. Step 1 결론 — 승인이 필요한 결정 3가지

| # | 결정 사항 | 권고 |
|---|---|---|
| 1 | 프레임워크 | **Astro** (Next.js 선호를 뒤집는 권고이므로 반드시 확인 필요) |
| 2 | PG | 나이스페이 스페셜 플랜 조건 문의 → 불가 시 토스페이먼츠 |
| 3 | llms.txt | 적용하되 GEO 투자는 구조화 데이터에 집중 |

승인해 주시면 **Step 2 — 디자인 시안 3안(팔레트 토글 포함, 모바일 우선)** 으로 넘어갑니다.
