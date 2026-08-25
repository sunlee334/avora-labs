# Deep Interview Spec: AVORA 브랜드 웹사이트

## Metadata
- Interview ID: avora-homepage-2026-08-25
- Rounds: 15 (+ Round 0 토폴로지 게이트)
- Final Ambiguity Score: **10.0%**
- Type: greenfield
- Generated: 2026-08-25
- Threshold: 0.10
- Threshold Source: user override (Round 0) — 기본값 0.20에서 상향
- Initial Context Summarized: yes (`.omc/state/deep-interview-context.md`)
- Status: **PASSED**

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.90 | 0.40 | 0.360 |
| Constraint Clarity | 0.90 | 0.30 | 0.270 |
| Success Criteria Clarity | 0.90 | 0.30 | 0.270 |
| **Total Clarity** | | | **0.900** |
| **Ambiguity** | | | **0.100** |

---

## Topology

Round 0에서 6개 최상위 컴포넌트로 확정(2026-08-25). 연기된 컴포넌트 없음.
진행 방식은 사용자 지시에 따라 **Step1 → Step2 → Step3 → Step4 게이트별 점진 심화**.

| Component | Status | Description | Coverage |
|-----------|--------|-------------|----------|
| brand-story | active | 원페이지 스토리 스크롤 랜딩 + 모션 | R9(홈 구조), R10(모션 강도), R3(콘텐츠 소스), R8(합격 기준) |
| commerce | active | 제품 상세/장바구니/체크아웃 + 결제 승인 API | R2(실제 판매), R6(최소 범위), R7(통화·판매국), R14(PG), R15(단계 분리) |
| globalization | active | 5개 언어 i18n + 지역/통화 + 국가별 결제수단 설정 | R3(번역 소스), R7(통화·판매국), R13(URL 구조) |
| design-system | active | 컬러/타이포 토큰, 이미지 교체 구조, 설정 파일, 문서 | R1(팔레트 결정 방식), R11(시안 축) |
| infra-deploy | active | Cloudflare Workers 단독, wrangler, GitHub Actions | R4(제약), R5(플랫폼 확정), R12(도메인) |
| seo-geo | active | 메타·OG·sitemap·JSON-LD·hreflang·llms.txt | R12(도메인 상수화), R8(합격 기준), R15(오픈 범위) |

---

## Goal

**2026년 10월, AVORA의 브랜드 세계관을 모바일에서 완결적으로 전달하는 5개 언어 브랜드 사이트를 Cloudflare Workers 단독 호스팅으로 오픈한다.** 홈은 히어로 → 브랜드 철학 → 제품 여정(sun→sweat→water→movement→reapply) → 구매 CTA로 이어지는 원페이지 스토리 스크롤이며, 제품 상세(`/product`)만 SEO를 위해 독립 페이지로 분리한다. 1차 오픈 시 구매 버튼은 스마트스토어로 연결하고, 자사 결제(장바구니·체크아웃·Worker 승인 API)는 병행 개발해 두었다가 PG 심사와 도메인 확정 직후 스위치로 전환한다.

컴포넌트별 목표:

- **brand-story** — 스크롤에 따라 MOVEMENT 철학이 체감되는 원페이지. 콘텐츠는 기존 문서(ver3 docx, 디자인가이드 PDF)에서 웹 카피로 재구성한 초안을 한국어로 먼저 승인받는다.
- **commerce** — 선크림 단일 제품. 목록 페이지는 최소화하고 `/product` 상세에서 바로 구매. 장바구니는 localStorage. 비회원 주문만. 자체 DB 없음. Worker는 결제 승인 엔드포인트 1개.
- **globalization** — ko/en/zh/th/vi 전 언어 접두어 URL. 루트 `/`는 Worker가 `Accept-Language`를 읽어 서버측 302. `x-default = /en/`.
- **design-system** — 모든 컬러를 CSS 커스텀 프로퍼티 + Tailwind theme 한 곳에서만 정의. 역할 기반 네이밍. 프레임워크 중립 JSON 토큰 병행 산출.
- **infra-deploy** — Cloudflare Workers 단독(정적 에셋 + API 동일 오리진). GitHub은 private 소스 보관 + Actions로 `wrangler deploy`.
- **seo-geo** — 5개 언어 각각 독립 메타·hreflang·canonical·JSON-LD. 초기 HTML에 본문 텍스트 포함.

---

## Constraints

### 최우선 원칙 (충돌 시 판단 기준)
1. 모바일 최적화 & UX/UI가 다른 모든 요소보다 우선한다.
2. 메인 결과물은 웹사이트. 앱 대비로 웹을 무겁게 만들지 않는다.
3. 리서치 → 시안 → 확인 → 개발 순서를 지킨다. 코드를 먼저 쓰지 않는다.
4. 컬러·결제수단·번역은 하드코딩 금지. 토큰/설정 파일 중앙관리.
5. 애매하면 가정하지 말고 먼저 질문한다.

### 아키텍처
- **호스팅: Cloudflare Workers 단독** (Round 5 확정). GitHub Pages 사용 안 함.
  - 근거: 저장소가 PRIVATE이라 GitHub Pages는 유료 플랜 필요 → "비용 0원" 제약과 충돌.
  - Workers Free: 10만 요청/일, CPU 10ms/호출. **정적 에셋 요청은 무료·무제한, 저장 비용 없음**(공식 문서 확인).
  - 동일 오리진이므로 CORS 설정 불필요. 결제 시크릿은 Workers 환경변수 한 곳.
- **저장소**: `https://github.com/sunlee334/avora-labs.git` — 현재 **완전히 빈 private 저장소**. clone이 아니라 로컬 init 후 origin 연결.
- **배포**: GitHub Actions → `wrangler deploy`. 커밋 전 항상 변경사항 요약을 사용자에게 보여준 뒤 진행.
- **도메인**: 미보유. 개발은 `*.workers.dev`로 진행하되 사이트 URL을 **상수/환경변수 한 곳**에서만 관리해 canonical·hreflang·OG·sitemap이 자동으로 따라오게 한다.
  - ⚠️ **선행조건**: PG 가맹 심사 시 서비스 도메인 등록이 필요하고 이후 변경은 재심사 대상이 될 수 있음. 결제 2차 오픈 전까지 도메인 확정 필요.

### 커머스
- 1차 오픈: 구매 버튼 → 스마트스토어 링크. 자사 결제 비활성.
- 2차: PG 심사 완료 후 자사 결제 스위치 ON.
- 판매 국가는 **한국만**, 통화는 **KRW 단일**. 해외 4개 언어는 브랜드 소개까지.
- 회원가입·로그인 없음. 비회원 주문만.
- 자체 DB(D1/KV) 없음. 주문·결제 기록은 PG 대시보드 + 고객 이메일 영수증.
- 결제 어댑터를 인터페이스로 분리 → PG 교체 시 화면 코드 무변경.
- `payment-config` 설정 파일로 국가코드 → 노출 결제수단 매핑. 1차엔 KR만 활성, 나머지 국가 항목은 구조로만 존재.

### 디자인 시스템
- **팔레트 미확정 — 시안 단계에서 결정.** 두 후보가 충돌 상태:
  - A안(디자인가이드 PDF, 2025-07): Deep Forest `#23291F` / Warm Cream `#E9E4D6` / Soft Paper `#F5F3EC` / Stone Accent `#6F6D61`
  - B안(브랜딩 ver3 docx, 2025-08): Mist Blue `#AFC8D8` / Off White / Charcoal + Campaign Lime `#B8C92A`
  - 보유 로고 자산은 cream/forest 두 버전만 존재 → B안 채택 시 로고 리컬러 선행 필요. 시안 단계에서는 **임시 리컬러만** 하고 원본 자산은 수정하지 않는다.
- 토큰 네이밍은 역할 기반: `brand.primary`, `brand.base.offwhite`, `brand.base.charcoal`, `brand.accent.campaign`.
- 테마 변형(캠페인 시즌 팔레트 스위칭) 확장 가능한 구조.
- 타이포(디자인가이드 PDF 기준): 로고 = Bodoni 72 아웃라인 / 국문 헤드라인 = Noto Serif KR / 본문·UI = Pretendard (모두 SIL OFL, 상업적 사용 가능).
- 접근성: Stone Accent `#6F6D61`는 어두운 배경 본문에 명암비 미달 → 다크 표면용 밝은 토큰(`#A6A38F` 등) 별도 정의.

### 모션 (중간 강도 — Round 10 확정)
허용: fade-in / slide-up / 이미지 스케일 / Lenis 스무스 스크롤 / GSAP ScrollTrigger 기반 텍스트·배경 전환.
금지 또는 조건부:
- 히어로 영역은 **순수 CSS**로 구현 (LCP 보호).
- 무거운 라이브러리(GSAP ~50KB, Framer Motion ~30KB gzip)는 **LCP 이후 지연 로딩**.
- `prefers-reduced-motion` 시 모션 전면 정지.
- 호버 기반 인터랙션은 모바일에서 탭·스와이프로 대체.
- **스크롤 스크러빙 이미지 시퀀스는 채택하지 않음** (모바일 Performance ≥90 달성 불가).

### 콘텐츠
- 한국어 카피: 기존 문서(ver3 docx 1·5장, 디자인가이드 PDF 05장)에서 웹 카피 초안 추출 → 승인 후 확정.
- 영/중/태/베: 승인된 한국어 기준 번역 초안 생성, **"검수 전" 표시**를 달아 나중에 원어민 검수본으로 교체.
- 번역 제외(원문 유지): `AVORA`, `For every movement.`, `MOVE. SWEAT. REAPPLY.`, `Stay · Breathe · Pure`, `ACTIVE LIFESTYLE BEAUTY`.
- 규제 준수: 화장품 표시·광고 규정상 효능 과장 표현 금지. 디자인가이드 05장의 지양 어휘(성별 한정 표현, 기능성 심사 범위 초과 효능 주장) 준수.
- **이미지: AI 생성 금지.** Unsplash/Pexels 등 무료 상업적 이용 가능 사이트에서 조달하고 **출처(사이트명·링크)를 매번 기록**. 핀터레스트는 레퍼런스/플레이스홀더로만 구분 표기. 실촬영 이미지로 교체하기 쉬운 경로·컴포넌트 분리 구조.
- **제품 가격 미확정** (제품기획서: OEM 원가·용기 견적 후 재계산). 데이터 파일에 플레이스홀더를 두고 확정 시 한 줄 교체. JSON-LD `Product`의 `offers`도 같은 값을 참조.

### 앱 확장성 (가벼운 참고 수준만)
- 상품 정보·브랜드 콘텐츠·결제 설정·번역 리소스를 UI 코드와 분리된 데이터/설정 파일로 관리.
- 데이터 접근부를 나중에 API 호출로 교체 가능한 형태로 추상화.
- 디자인 토큰을 프레임워크 중립 JSON으로도 병행 산출.
- **이 항목 때문에 웹 개발 속도·단순함·완성도를 희생하지 않는다.**

---

## Non-Goals

- 회원가입 / 로그인 / 계정 체계 (Round 6에서 범위 제외 확정)
- 자체 주문 데이터베이스 (D1 / KV / 외부 DB)
- 재고 관리, 프로모션 코드, 멀티 SKU 카탈로그
- 한국 외 국가에서의 실제 판매 및 결제 (중국 NMPA 등 화장품 등록 규제 미해결)
- 다통화 실청구 및 환율 API 연동
- GitHub Pages 배포
- 모바일 앱(iOS/Android) 개발
- 스크롤 스크러빙 이미지 시퀀스 / 캔버스 연출
- AI 이미지 생성

---

## Acceptance Criteria

### 전 단계 공통 (정량 — Round 8 확정)
- [ ] 모바일 Lighthouse **Performance ≥ 90**
- [ ] 모바일 Lighthouse **Accessibility ≥ 95**
- [ ] 모바일 Lighthouse **SEO = 100**
- [ ] **LCP ≤ 2.5s**, **CLS ≤ 0.1** (모바일 기준)
- [ ] 탭 가능한 모든 요소의 터치 영역 **≥ 44×44px**
- [ ] **360px ~ 430px** 폭에서 가로 스크롤 없음
- [ ] 5개 언어 전 페이지의 본문 텍스트가 **초기 HTML에 포함** (JS 렌더링 의존 아님)
- [ ] `prefers-reduced-motion: reduce` 시 모든 모션 정지
- [ ] 각 Step 종료 시 모바일·데스크톱 화면을 함께 제시하고 사용자 승인 획득

### Playwright E2E (Round 8 확정)
- [ ] 언어 전환 플로우: 5개 언어 전환 후 각 언어 URL·본문·hreflang 확인
- [ ] 루트 `/` 접속 시 `Accept-Language`에 따른 서버측 302 동작
- [ ] 제품 상세 페이지: 이미지 전환·확대 인터랙션 동작
- [ ] 장바구니: 담기 → localStorage 유지 → 새로고침 후 복원
- [ ] 체크아웃 폼: 모바일 키보드 타입 최적화(숫자 필드에서 숫자 키패드)
- [ ] 결제 스위치 OFF 시 구매 버튼이 스마트스토어로 이동, ON 시 결제창 호출

### Step 1 — 레퍼런스 리서치
- [ ] 액티브 라이프스타일 / 스포츠 뷰티 / 미니멀 클린 뷰티 D2C 브랜드 사이트 다수 조사
- [ ] 각 사이트의 레이아웃·인터랙션·타이포·제품 소개 방식·이커머스 UX 정리
- [ ] **국내 PG 비교표**: 수수료 · 심사 요건 · 심사 기간 · 정산 주기 · 간편결제 커버리지 · Cloudflare Workers 서버측 연동 난이도 (각 PG사 공식 페이지에서 실제 확인)
- [ ] `llms.txt` 최신 관행 조사 후 적용 여부 제안

### Step 2 — 디자인 시안
- [ ] **레이아웃 3안**: 미니멀·에디토리얼 / 다이나믹·스포티 / 클린·웰니스
- [ ] 각 시안에 **팔레트 토글 버튼**(A안 포레스트·크림 ↔ B안 미스트블루·라임) 탑재 → 6가지 조합 즉석 비교
- [ ] 팔레트 토글이 CSS 변수 한 곳 교체로 동작 = 요구사항 2-1의 토큰 구조가 실제로 작동함을 시안 단계에서 검증
- [ ] **모바일 화면을 먼저** 제시하고 데스크톱은 그다음
- [ ] 시안별 레이아웃 구조 · 무드 · 컬러 활용 방식 · **대표 인터랙션/모션 컨셉** 설명 포함
- [ ] 모든 목업 이미지에 출처(사이트명·링크) 기록

### Step 3 — IA
- [ ] 사이트맵 확정: `/{lang}/` (원페이지 스토리) · `/{lang}/product` · `/{lang}/cart` · `/{lang}/checkout` · 정책 페이지
- [ ] 5개 언어 × 페이지 매트릭스와 `hreflang` 매핑표

### Step 4 — 개발
- [ ] 컬러 hex 값이 **토큰 정의 파일 밖 어디에도 존재하지 않음** (grep으로 검증)
- [ ] 번역 문자열이 컴포넌트 코드에 하드코딩되지 않음 (`locales/*.json`으로 분리)
- [ ] `payment-config`가 설정 파일로 분리되고 국가 추가/제거가 그 파일 수정만으로 가능
- [ ] 컬러 토큰 수정 위치와 방법을 담은 가이드 문서 작성 (개발 지식 없이도 따라할 수 있는 수준)
- [ ] 디자인 토큰의 프레임워크 중립 JSON 산출물 존재
- [ ] `sitemap.xml` · `robots.txt` 자동 생성
- [ ] JSON-LD: `Product` · `Organization` · `BreadcrumbList`
- [ ] 5개 언어 전부에 `hreflang` + `canonical` + 언어별 `title`/`description`/`og:*`
- [ ] 이미지 `alt` 텍스트가 언어별로 번역됨
- [ ] 시맨틱 마크업: `h1~h6` 계층, `nav`/`main`/`article`
- [ ] Worker 결제 승인 엔드포인트가 샌드박스 키로 테스트 승인 1건 성공

---

## Assumptions Exposed & Resolved

| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| 브랜드 팔레트는 Mist Blue + Lime이다 | 디자인가이드 PDF는 Deep Forest/Warm Cream을 지정하고 "이 네 색 외 사용 금지"라고 명시. 로고 자산도 forest/cream만 존재 | 시안 단계에서 두 팔레트를 토글로 비교 후 결정 (R1) |
| 커머스는 구조·UI만 만들면 된다 | 실제로 주문을 받는지 문서에 없음 | 실제 판매. GitHub Pages + Cloudflare Workers 승인 API (R2) |
| 브랜드 스토리 콘텐츠가 없다 | ver3 docx와 디자인가이드 PDF에 이미 완성도 높은 한국어 원문 존재 | 기존 문서에서 웹 카피 초안 추출 → 승인 → 4개 국어 번역 초안 (R3) |
| **GitHub Pages는 유지해야 할 제약이다** | 선택 이유가 "비용" 하나뿐인데 이미 Workers를 쓰기로 함. 게다가 저장소가 PRIVATE이라 Pages는 유료 | **Cloudflare Workers 단독으로 전환** (R4 Contrarian → R5) |
| 목록·장바구니·멀티 SKU가 필요하다 | 첫 제품이 선크림 1종. 주문 기록도 PG 대시보드에 이미 남음 | 최소 범위 — 단일 제품, 자체 DB 없음, 비회원 주문 (R6 Simplifier) |
| 5개국에서 실제 판매한다 | 선크림은 중국에서 특수화장품으로 NMPA 등록 필요 등 규제 장벽. 다통화는 백엔드를 다시 복잡하게 만듦 | 1차는 한국만 판매(KRW), 해외는 브랜드 소개까지 (R7) |
| "모바일에서 잘 되는가"로 판정한다 | 검토 방식이지 합격 기준이 아님. 최우선 원칙인데 판정할 숫자가 없음 | 정량 기준 + Playwright E2E (R8) |
| 홈과 브랜드 스토리는 별도 페이지다 | 문서 1번은 "랜딩/스토리"로 합쳐 표현, Step3 예시는 분리 | 홈 = 원페이지 스토리 스크롤, `/product`만 독립 (R9) |
| 팔레트 2종 × 스타일 3안 = 6개 시안 | 토큰 구조를 쓰면 팔레트는 스위치 한 번 | 레이아웃 3안 + 팔레트 토글 (R11) |
| 도메인은 나중에 정해도 된다 | canonical·hreflang·OG·PG 심사 도메인 등록이 전부 종속. PG는 변경 시 재심사 가능성 | 임시 도메인 + URL 상수 한 곳 관리. 결제 2차 전까지 확정 필요 (R12) |
| PG는 개발하면서 정하면 된다 | PG마다 결제창 호출·승인 API·웹훅 서명·시크릿이 전부 다름 → 미정이면 Worker 구현 불가 | Step1에 PG 비교조사 포함, 샌드박스 개발, 어댑터 인터페이스 분리 (R14) |
| 웹사이트 일정은 자유롭다 | 제품기획서상 목표 판매 개시 **2026.10** = 약 5~6주. 가격 미확정, 기능성화장품 심사 병행 중 | 10월 = 브랜드사이트 오픈, 결제는 2차 (R15) |

---

## Technical Context

### 리포지토리 상태 (2026-08-25 실측)
- `/Users/sunlee/Projects/avora-labs/homepage` — 비어 있음(`.omc`만). greenfield.
- `github.com/sunlee334/avora-labs` — `visibility: PRIVATE`, `isEmpty: true`, ref 0개.
- 상위 폴더 `/Users/sunlee/Projects/avora-labs` 보유 자산:
  - `logo/` — 워드마크·컴팩트마크 SVG/PNG (cream / forest), `sizes/` 16~1024px, `favicon.ico`
  - `AVORA_디자인_가이드.pdf` — 팔레트·타이포·보이스&톤·접근성 명암비·이미지 방향
  - `AVORA_선스크린_제품기획서.pdf` (Draft v0.5, 2026.07.17) — 목표 판매 개시 2026.10, SPF50+/PA++++(안), 제형·INCI 미확정, 가격 미확정, 판매 채널 "자사몰·스마트스토어"
  - `AVORA 브랜드 소개서.pdf`, `AVORA_회사소개서.pdf`, `AVORA_사업계획서.pdf`, `사업자등록증명.pdf`, `책임판매관리자/`, `개발의뢰서/`

### 검증한 외부 사실 (Cloudflare 공식 문서, context7 경유)
- Workers Free: 10만 요청/일, CPU 10ms/호출, 메모리 128MB, 서브요청 50개 (`workers/platform/limits`)
- 정적 에셋 요청은 무료·무제한이며 저장 비용 없음. Worker 스크립트를 호출하는 요청만 과금 (`workers/static-assets/billing-and-limitations`)
- Workers가 정적 에셋을 네이티브 지원. `assets.directory` + `binding` + `run_worker_first: ["/api/*"]`로 API만 Worker가 선처리 (`workers/wrangler/configuration`)
- Cloudflare가 Pages → Workers 마이그레이션을 공식 권고

### 프레임워크 선택 (Step1에서 최종 확정)
Next.js와 Astro를 비교해 제시할 것. 판단 축:
- Cloudflare Workers 배포 궁합 (`@opennextjs/cloudflare` vs Astro Cloudflare 어댑터)
- 5개 언어 × 페이지 정적 생성 방식
- 초기 JS 페이로드 (모바일 Performance ≥ 90 제약)
- `next-intl` / `astro:i18n`의 정적 환경 호환성

### 미해결 외부 의존성 (웹 개발 범위 밖이나 일정에 영향)
- 제품 가격 (OEM 원가 견적 후)
- 제품 실촬영 이미지
- 기능성화장품 보고/심사 완료
- 통신판매업 신고 및 PG 가맹 심사
- 서비스 도메인 등록

---

## Ontology (Key Entities)

| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| Brand | core domain | name, slogan, philosophy, promise[] | Brand has one Product (1차) |
| Product | core domain | id, name, spf, volume, price(미정), ingredients(미정), images[] | Product has many ProductVariant |
| ProductVariant | supporting | id, volume, price | belongs to Product |
| StorySection | supporting | id, order, headline, body, mediaRef, motionSpec | composes 홈 원페이지 |
| Cart | supporting | items[], updatedAt (localStorage) | Cart has many CartItem |
| CheckoutSession | supporting | items[], amount, buyerContact, shippingAddress | produces PaymentApproval |
| PaymentMethod | supporting | code, label, countryCode, enabled | listed by Market |
| PaymentAdapter | supporting | requestPayment(), verifyApproval() | 인터페이스, PG별 구현 교체 |
| PaymentApproval | external system | orderId, pgTxId, amount, status | Worker 엔드포인트가 PG에 위임 |
| Market | supporting | countryCode, defaultLocale, currency, sellable | Market has many PaymentMethod |
| Locale | supporting | code(ko/en/zh/th/vi), urlPrefix, isDefault | Locale has many TranslationEntry |
| TranslationEntry | supporting | key, value, reviewed(bool) | belongs to Locale |
| DesignToken | supporting | role, value, theme | 팔레트 A/B 두 테마를 가짐 |
| MediaAsset | supporting | path, alt(per locale), source, license | referenced by StorySection/Product |
| TestScenario | supporting | name, steps[], expected | Playwright E2E |

---

## Ontology Convergence

| Round | Entity Count | New | Changed | Removed | Stable | Stability |
|-------|-------------|-----|---------|---------|--------|-----------|
| 1 | 11 | 11 | - | - | - | N/A |
| 2 | 14 | 3 | 0 | 0 | 11 | 78.6% |
| 3 | 15 | 1 | 0 | 0 | 14 | 93.3% |
| 4 | 15 | 0 | 0 | 0 | 15 | 100% |
| 5 | 15 | 0 | 0 | 0 | 15 | 100% |
| 6 | 14 | 0 | 0 | 1 | 14 | 93.3% |
| 7 | 12 | 0 | 0 | 2 | 12 | 85.7% |
| 8 | 13 | 1 | 0 | 0 | 12 | 92.3% |
| 9–15 | 13 | 0 | 0 | 0 | 13 | 100% |

9라운드부터 15라운드까지 7회 연속 완전 수렴. 도메인 모델 안정.

---

## Ambiguity Trajectory

| Round | Ambiguity (게이트) | 이번 라운드에서 확정된 것 |
|-------|-----------|--------------|
| 0 | 미측정 | 6개 컴포넌트 토폴로지, 임계값 10% |
| 1 | 62.5% | 팔레트는 시안에서 두 방향 비교 후 결정 |
| 2 | 57.5% | 실제 결제. Cloudflare Workers 승인 API |
| 3 | 52.0% | 콘텐츠는 기존 문서에서 초안 추출 |
| 4 | 52.0% (정체) | 비용 0원이 하드 제약 |
| 5 | 43.5% | Cloudflare Workers 단독 호스팅 |
| 6 | 43.5% | 커머스 최소 범위, 자체 DB 없음, 비회원 |
| 7 | 40.5% | 1차 한국만 판매, KRW 단일 |
| 8 | 30.0% | 정량 합격 기준 + Playwright E2E |
| 9 | 28.0% | 홈 = 원페이지 스토리 스크롤 |
| 10 | 26.5% | 모션 중간 강도 + 하드 제약 4개 |
| 11 | 21.5% | 레이아웃 3안 + 팔레트 토글 |
| 12 | 16.5% | 임시 도메인 + URL 상수화 |
| 13 | 17.1% (정정) | 전 언어 접두어 + Worker 자동감지 |
| 14 | 15.0% | PG 미계약 → 비교조사 + 어댑터 분리 |
| 15 | **10.0%** | 10월 브랜드사이트 오픈, 결제 2차 |

Challenge modes used: Contrarian (R4), Simplifier (R6). Ontologist는 R8에서 검토했으나 엔티티 안정성이 이미 92%여서 보류하고 Criteria를 직접 겨냥.

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| 2026.10 판매 개시까지 5~6주 | 웹사이트 완성도 저하 | 결제를 2차로 분리 (R15). 1차는 브랜드사이트 + 스마트스토어 링크 |
| 도메인 미확정 | PG 심사 지연, 확정 후 재심사 가능성 | URL 상수 1곳 관리. 결제 2차 전까지 도메인 확정 필요 |
| 제품 가격 미확정 | 제품 상세·JSON-LD 완성 불가 | 데이터 파일 플레이스홀더 + 확정 시 한 줄 교체 |
| 실촬영 이미지 부재 | 목업 이미지로 오픈 | 이미지 경로·컴포넌트 분리로 교체 용이하게. 출처 전량 기록 |
| 기능성화장품 심사 지연 | 제품 출시 자체 지연 | 웹 범위 밖. 웹사이트는 제품 일정과 독립적으로 완성도 유지 |
| 팔레트 B안 채택 시 로고 리컬러 | 브랜드 자산 재작업 | 시안은 임시 리컬러만. 확정 후 원본 자산 정식 재작업 |
| 모션 + Performance ≥90 양립 | 합격 기준 미달 | 히어로 순수 CSS, 무거운 라이브러리 LCP 이후 지연 로딩, 매 빌드 검증 |

---

## Interview Transcript

<details>
<summary>Full Q&A (Round 0 + 15 rounds)</summary>

**Round 0 | 토폴로지 확인**
Q: 6개 최상위 컴포넌트 구성이 맞나요?
A: "Step1 부터 하나씩 추가 인터뷰 후, 구현. threshold는 10%까지."
→ 6개 확정, 임계값 10%로 상향, Step 게이트별 점진 심화 방식

**Round 1 | design-system / Goal | 62.5%**
Q: 디자인가이드 PDF(포레스트·크림)와 ver3 docx(미스트블루·라임) 팔레트 충돌을 어떻게 정리할까요?
A: 시안에서 둘 다 보고 결정

**Round 2 | commerce / Goal | 57.5%**
Q: 첫 런칭 시점에 이 사이트가 어느 지점까지 기능해야 하나요?
A: "github page에서는 결제창 호출을 하고, Cloudflare Workers를 사용해서 승인 API를 구현할"

**Round 3 | brand-story / Criteria | 52.0%**
Q: 브랜드 스토리·제품 설명 텍스트를 누가 공급하나요?
A: 기존 문서에서 초안 뽑아줘

**Round 4 | infra-deploy / Constraints | 52.0% | CONTRARIAN**
Q: 이미 Workers를 쓰는데 GitHub Pages는 왜 남아야 하나요?
A: "비용 들지 않는 선으로 진행 예정"

**Round 5 | infra-deploy / Constraints | 43.5%**
Q: (저장소 PRIVATE → Pages 유료 확인 후) 비용 0원을 만족하는 두 방안 중 어느 쪽?
A: A. Cloudflare Workers 단독

**Round 6 | commerce / Criteria | 43.5% | SIMPLIFIER**
Q: 1차 런칭의 커머스 범위를 어디까지?
A: 최소 — 단일 제품, 자체 DB 없음

**Round 7 | globalization / Constraints | 40.5%**
Q: 가격 표시와 실제 청구 통화를 어떻게?
A: 1차는 한국만 판매, 해외는 브랜드 소개만

**Round 8 | 전 컴포넌트 / Criteria | 30.0%**
Q: 각 Step을 "통과"로 판정하는 기준은?
A: 정량 기준 + Playwright E2E 자동화

**Round 9 | brand-story / Goal | 28.0%**
Q: 홈과 브랜드 스토리의 관계는?
A: 홈 = 원페이지 스토리 스크롤

**Round 10 | brand-story / Constraints | 26.5%**
Q: 모바일에서 인터랙션 강도를 어디까지?
A: 중간 — 스무스스크롤 + 스크롤 연동

**Round 11 | design-system / Goal | 21.5%**
Q: Step2 시안을 어떤 축으로 몇 개?
A: 레이아웃 3안 + 팔레트 토글

**Round 12 | seo-geo / Constraints | 16.5%**
Q: 최종 서비스 도메인 상황은?
A: 아직 없음 — 임시 도메인으로 개발 진행

**Round 13 | globalization / Constraints | 17.1%**
Q: 5개 언어 URL 구조와 기본 언어 처리는?
A: 전 언어 접두어 + Worker 자동감지

**Round 14 | commerce / Constraints | 15.0%**
Q: 국내 PG 계약 현황은?
A: 아직 계약 전 — 비교조사부터

**Round 15 | 전 컴포넌트 / Constraints | 10.0%**
Q: (제품기획서상 2026.10 판매 개시 발견) 웹사이트 런칭 일정과 범위를 어떻게 맞출까요?
A: 10월 = 브랜드사이트 오픈, 결제는 2차

</details>

---

## Step 1 Decisions (2026-08-25, 승인 완료)

| # | 결정 | 근거 |
|---|---|---|
| 1 | **프레임워크 = Astro** (Next.js 선호를 뒤집음) | Cloudflare가 2026-01-16 Astro 인수 → Workers 배포 네이티브. 기본 JS 페이로드 0에 가까워 모바일 Performance ≥90 여유. `astro:i18n` 내장 |
| 2 | **PG = 나이스페이 스페셜 플랜 조건 문의 → 불가 시 토스페이먼츠** | 나이스 스페셜 카드 2.9%/D+3이 최저·최속, 가입비 프로모션 면제. 토스는 3.4% + 가입비 22만 + 연 11만이나 문서 품질 최상 |
| 3 | **llms.txt = 적용하되 GEO 예산은 구조화 데이터에** | Google이 2026-06 문서에서 "검색 순위·AI Overviews에 영향 없음, 무시함" 명시. 주요 AI사 프로덕션 지원 약속 없음 |

### Workers 연동 검증 완료
토스페이먼츠 v2: 프론트 `requestPayment({successUrl, failUrl})` → 성공 리다이렉트 쿼리(`paymentKey`/`orderId`/`amount`) → 서버가 시크릿키 Basic 인증으로 승인 API POST. **결제 요청 후 10분 이내 승인 필수.** 공식 문서에 "순수 REST이므로 Node.js가 아닌 모든 서버 언어에서 구현 가능" 명시 → Workers `fetch()`만으로 성립.

### 레퍼런스에서 채택할 패턴
- 하단 고정 액션 바 (On Running) — 엄지 도달 영역
- 섹션 배경색 교차로 스크롤 리듬 (Vacation)
- 브랜드 프로미스(LIGHT/COMFORT/PROTECTION/RESET)를 섹션 소제목으로 (Vacation)
- 시험·기준 설명 섹션으로 선스크린 신뢰 확보 (Ultra Violette)
- 지연 로딩 + 스크롤 트리거 (Supergoop)
- 대형 워드마크 푸터 (Supergoop) — Bodoni 72와 궁합

### 채택하지 않을 패턴
- 진입 즉시 할인/지역 모달 (Vacation·Ultra Violette·Beauty of Joseon 3곳 모두 사용 중) — LCP·CLS·이탈률 악화
- 클라이언트 지역 감지 모달 (Beauty of Joseon) — Worker 서버측 302가 우월
- 비반응형 데스크톱 레이아웃 (라운드랩) — 국내 D2C 반례. 모바일 완성도가 AVORA 차별점

---

## Step 2 Decisions (2026-08-25, 승인 완료)

**확정: 시안 01 Minimal Editorial + 팔레트 A (Deep Forest / Warm Cream / Soft Paper / Stone Accent)**

시안 비교 아티팩트: https://claude.ai/code/artifact/b749a1f6-f11b-4374-8191-dd6e940e3aa6

### 확정된 팔레트 (디자인가이드 PDF가 정본)
| 역할 토큰 | 값 | 용도 |
|---|---|---|
| `--brand-primary` | `#23291F` Deep Forest | 로고·핵심 브랜드 요소·강조 면 |
| `--brand-surface` | `#F5F3EC` Soft Paper | 기본 배경 |
| `--brand-surface-alt` | `#E9E4D6` Warm Cream | 교차 배경·역상 잉크 |
| `--brand-ink` | `#23291F` | 본문 텍스트 |
| `--brand-muted` | `#6F6D61` Stone Accent | 보조 텍스트·구분선 |
| `--brand-muted-on-dark` | `#A6A38F` | **다크 면 위 보조 텍스트** (Stone은 Deep Forest 위 2.87:1로 미달) |
| `--brand-accent-campaign` | `#E9E4D6` (잠정) | 캠페인 포인트 — 아래 참고 |

### ⚠️ 캠페인 액센트 처리
팔레트 A에는 **전용 캠페인 컬러가 없습니다.** 디자인가이드 PDF가 네 색 외 사용을 금지하고, ver3 docx의 Lime `#B8C92A`는 이번 결정으로 채택하지 않습니다.
- 현재 `--brand-accent-campaign`은 **Warm Cream 역상 대비**로 대체합니다.
- 토큰 슬롯 자체는 유지하므로, 향후 캠페인 컬러를 도입하면 **이 값 한 줄만 교체**하면 전체에 반영됩니다.
- ver3 문서의 "브랜드의 에너지 버튼" 전략은 컬러가 아니라 **타이포 스케일·역상 블록**으로 구현합니다.

### 로고 — 선행 과제 소멸
팔레트 A 확정으로 보유 자산이 그대로 정본이 됩니다. **로고 SVG 재작업 불필요.**
- 워드마크: `logo/avora-wordmark-{cream,forest}.svg`
- 컴팩트 마크: `logo/avora-mark-square-{cream,forest}-bg.svg`
- 파비콘: `logo/sizes/favicon.ico` (단, 디자인가이드가 32px 이하에서 뭉개진다고 경고 → 별도 "A" 이니셜 버전 제작 권장)

### 시안 01 확정에 따른 하위 제약
- **모션은 Round 10 상한선보다 더 절제**: 텍스트 fade-up + 강조어 밑줄(좌→우) + 이미지 미세 스케일. Lenis 스무스 스크롤 O, **패럴랙스 X**, 스크롤 스크러빙 X.
- **실촬영 의존도가 세 안 중 가장 높음** — 히어로 1장, 섹션 브레이크 1~2장의 품질이 완성도를 좌우. 런칭 전 교체 필수.
- **성능 여유 가장 큼** — Lighthouse 모바일 ≥90 달성이 세 안 중 가장 쉬움.
- 타이포: 국문 헤드라인 Noto Serif KR / 본문·UI Pretendard / 워드마크 Bodoni 72 아웃라인(실자산)

### 확정된 홈 섹션 순서 (원페이지 스토리 스크롤)
1. Hero — 풀블리드 이미지 + `For every movement.` / `MOVE. SWEAT. REAPPLY.`
2. Origin — 브랜드 한 줄 정의 (강조어 밑줄 애니메이션)
3. The Question — 탄생 서사
4. The Journey — sun → sweat → water → movement → reapply
5. Visual break — SKIN 이미지
6. Brand Promise — LIGHT / COMFORT / PROTECTION / RESET
7. Philosophy — "움직임은 삶의 가장 순수하고 강력한 표현입니다"
8. First Product — Daily Sunscreen + CTA → `/product`
9. Footer

---

## Step 3 — IA (2026-08-25, 승인 대기)

산출물: https://claude.ai/code/artifact/b6eb6cbf-cdd5-40f1-8c0c-7bc53ad365aa

### 확정 사이트맵
```
/                              → Worker가 Accept-Language 읽고 302
/{lang}/                       홈 · 원페이지 스토리 스크롤
/{lang}/product                제품 상세
/{lang}/cart                   2차
/{lang}/checkout               2차
/{lang}/order/complete         2차
/{lang}/legal/privacy          1차
/{lang}/legal/terms            2차
/{lang}/legal/shipping-returns 2차
/{lang}/404
/sitemap.xml  /robots.txt  /llms.txt
/api/payments/confirm          Worker · 2차
```
- 언어 5벌 대칭 생성(ko/en/zh/th/vi), `x-default = /en/`
- **제품 목록 페이지 없음** — 선크림 1종이므로 홈 "First Product" 섹션이 진입점

### 확정 파일 구조 / 값의 정의처
| 바꾸고 싶은 것 | 고칠 파일 |
|---|---|
| 브랜드 컬러 | `src/styles/tokens.css` (원본은 `tokens/design-tokens.json`) |
| 제품 가격 | `src/data/product.json` |
| 문구(언어별) | `src/i18n/{lang}.json` — alt 텍스트 포함 |
| 판매 국가·결제수단 | `src/config/payment-config.json` |
| 도메인 | `src/config/site.ts` |
| 이미지 | `public/images/` |

### 번역 제외(원문 유지) 기준
브랜드 자산이거나 국제 규격 표기면 원문, 설명 문장이면 번역.
→ `AVORA` · `For every movement.` · `MOVE. SWEAT. REAPPLY.` · `Stay · Breathe · Pure` · `ACTIVE LIFESTYLE BEAUTY` · `SPF50+ / PA++++`

### "에너지 버튼" 대체 방식
팔레트 A에 캠페인 컬러가 없으므로, 홈 7번 Philosophy 섹션의 **역상 블록**(Deep Forest 배경 + Warm Cream 잉크)이 그 역할을 맡습니다. 밝은 지반이 이어지다 한 섹션만 어두워지는 대비.

### 남은 확인 사항 (Step 4 중 답변 가능)
1. 중국어권 음역 브랜드명 사용 여부 → 있으면 `zh.json`의 브랜드명 키만 예외 처리
2. 법적 고지 문안 — 구조·배치만 잡고 문안은 확인 후 채움 (법적 효력 문서라 초안 작성 안 함)

### 2차 오픈 선행조건 3가지
도메인 확정 · PG 가맹 심사 완료 · 통신판매업 신고. 셋 중 하나라도 미완이면 결제 스위치를 켤 수 없음.
