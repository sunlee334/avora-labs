# AVORA 웹사이트

활동적인 매력과 부드러운 케어가 함께하는 스킨케어 브랜드 AVORA의 공식 웹사이트입니다.
한국어·영어·중국어(간체)·태국어·베트남어 5개 언어를 지원합니다.

- **프레임워크** Astro 7 (정적 생성)
- **호스팅** Cloudflare Workers — 정적 파일과 API가 같은 도메인에서 동작합니다
- **주문 저장** Cloudflare D1
- **상태** 1차(브랜드 사이트)와 2차(자사 결제) 코드 모두 완료 · 결제 스위치는 꺼져 있음

---

## 🎨 이것만 알면 됩니다 — 어디를 고치면 무엇이 바뀌나

개발 지식이 없어도 아래 표만 보고 값을 바꿀 수 있게 만들었습니다.
**값은 항상 한 곳에서만 정의됩니다.** 같은 값이 여러 파일에 흩어져 있지 않습니다.

| 바꾸고 싶은 것 | 고칠 파일 | 따라 바뀌는 것 |
|---|---|---|
| **브랜드 컬러** | `tokens/design-tokens.json` | 사이트 전체 색 |
| **제품 가격** | `src/data/product.json` | 제품 상세 · 장바구니 · 체크아웃 · 구조화 데이터 |
| **배송비 정책** | `src/config/commerce.json` | 장바구니·체크아웃의 배송비 계산 |
| **문구 (언어별)** | `src/i18n/{ko,en,zh,th,vi}.json` | 해당 언어의 모든 화면 · 이미지 대체텍스트 |
| **판매 국가 · 결제수단** | `src/config/payment-config.json` | 결제수단 노출 · 구매 버튼 동작 |
| **도메인** | `src/config/site.ts` 의 `ORIGIN` | 정규 URL · 언어별 대체 URL · SNS 공유 · 사이트맵 |
| **이미지** | `src/assets/images/` | 해당 이미지 (파일명 유지 시 코드 수정 불필요) |
| **사업자 정보** | `src/config/site.ts` 의 `BUSINESS` | 푸터 표기 (빈 값은 표시되지 않음) |

고친 뒤에는 항상 `npm run build` 를 실행하세요.

### 컬러를 바꾸는 예시

`tokens/design-tokens.json` 을 열면 이렇게 생겼습니다.

```jsonc
"brand": {
  "primary":    { "value": "#23291F", "name": "Deep Forest", "use": "로고·핵심 브랜드 요소" },
  "surface":    { "value": "#F5F3EC", "name": "Soft Paper",  "use": "기본 배경" },
  "surfaceAlt": { "value": "#E9E4D6", "name": "Warm Cream",  "use": "교차 배경" },
  ...
}
```

`"value"` 의 색상 코드만 바꾸고 `npm run build` 하면 사이트 전체에 반영됩니다.
`src/styles/tokens.css` 는 이 파일에서 자동 생성되므로 **직접 고치지 마세요.**

> 이 JSON은 웹 전용 형식이 아닙니다. 나중에 앱(React Native 등)을 만들 때
> 같은 파일을 그대로 읽어 동일한 브랜드 컬러를 쓸 수 있습니다.

---

## 실행

```bash
npm install
npm run dev               # 개발 서버 (http://localhost:4321)
npm run build             # 정적 빌드 → dist/
npm run preview           # Worker 까지 포함해 실제와 같은 환경으로 확인
npm run db:migrate:local  # 로컬 주문 DB 준비 (최초 1회)
npm test                  # 브라우저 테스트 — 두 모드 모두
```

### 두 가지 모드

이 사이트는 설정에 따라 두 모드로 동작하고, 테스트도 둘 다 돕니다.

| 모드 | 구매 버튼 | 언제 |
|---|---|---|
| **launch** (1차) | 외부몰로 이동 | 지금. `payment-config.json` 의 `KR.checkout` 이 `"external"` |
| **commerce** (2차) | 자사 장바구니·결제 | PG 계약·도메인 확정 후 |

2차 흐름을 미리 보고 싶다면 설정을 바꾸지 않고도 켤 수 있습니다.

```bash
PUBLIC_CHECKOUT_MODE=internal PUBLIC_PRODUCT_PRICE=32000 npm run build
```

실제로 열 때는 환경변수가 아니라 `payment-config.json` 과 `product.json` 을 고치세요 —
그래야 무엇이 켜져 있는지가 저장소에 남습니다.

`npm run build` 는 앞서 다음을 자동으로 실행합니다.

| 단계 | 하는 일 |
|---|---|
| `tokens` | 디자인 토큰 JSON → CSS 변수 생성 |
| `og` | SNS 공유 이미지 1200×630 생성 |
| `check:i18n` | 5개 언어 번역 파일의 키 구조가 한국어와 일치하는지 검사 |
| `check:fonts` | 폰트 서브셋이 현재 문구의 모든 글자를 담고 있는지 검사 |
| `check:types` | Cloudflare 런타임 타입 생성 후 타입 오류 검사 |

검사에서 걸리면 빌드가 멈춥니다. 화면에 무엇이 빠졌는지 나오니 그대로 고치면 됩니다.

---

## 폴더 구조

```
tokens/design-tokens.json   ★ 컬러·타이포·간격의 유일한 원본
src/
  config/site.ts            도메인·언어 목록·사업자 정보
  config/payment-config.json  국가코드 → 결제수단
  config/commerce.json      배송비·수량 한도
  config/runtime.ts         빌드 시점 오버라이드 (미리보기용)
  lib/cart.ts               장바구니 (localStorage)
  data/product.json         제품 정보·가격
  i18n/{언어}.json          번역 문구
  styles/tokens.css         ⚠️ 자동 생성 — 직접 고치지 마세요
  styles/global.css         레이아웃·컴포넌트 스타일
  assets/images/            사진 (빌드가 webp·avif 로 변환)
  components/ layouts/      화면 조각
  pages/[lang]/             언어별 페이지 (파일 하나가 5개 언어를 만듭니다)
public/
  fonts/{언어}/             언어별 폰트 서브셋 (자동 생성, 커밋함)
  brand/                    로고
  robots.txt  llms.txt
worker/index.ts             루트 언어 판별 + 주문·결제 API
worker/orders.ts            주문 저장·조회
worker/payments/            PG 어댑터 (tosspayments · types · mock)
migrations/                 D1 스키마
tests/e2e/                  브라우저 테스트
docs/                       기획·리서치 문서
```

---

## 폰트

본문은 **Pretendard**, 헤드라인은 **Noto Serif KR** 입니다(둘 다 SIL OFL, 상업적 사용 가능).
두 서체 모두 **각 언어 페이지에 실제로 쓰이는 글자만 남겨** 자체 호스팅합니다.

| 언어 | 본문 | 헤드라인 |
|---|---|---|
| 한국어 | 78KB | 55KB |
| 영어 | 20KB | 19KB |
| 중국어 | 21KB | 44KB |
| 태국어 | 20KB | 19KB |
| 베트남어 | 24KB | 22KB |

처음에는 Google Fonts로 불러왔는데, 한글 조각 5개 + CSS로 **약 210KB**가 외부 서버에서
내려오면서 모바일 LCP가 7.5초, Lighthouse 성능 점수가 59까지 떨어졌습니다.
언어별 서브셋으로 바꾼 뒤 **99~100점**이 됐습니다.

**문구를 바꾸면 폰트도 다시 만들어야 합니다.** 새 글자가 서브셋에 없으면 빌드가 멈추고
어떤 글자가 빠졌는지 알려줍니다. 그때 아래를 실행하세요.

```bash
# 최초 1회 준비
mkdir -p .fontsrc
curl -L -o .fontsrc/NotoSerifKR.ttf \
  "https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifkr/NotoSerifKR%5Bwght%5D.ttf"
python3 -m venv .fontsrc/venv && .fontsrc/venv/bin/pip install fonttools brotli

# 서브셋 다시 만들기
npm run fonts
```

> **알아두실 점** — 중국어와 태국어 본문 일부는 Pretendard·Noto Serif KR에 없는 글자라
> 기기의 기본 서체로 표시됩니다. 해당 언어권에서는 자연스러운 결과이며,
> 전용 서체가 필요해지면 같은 방식으로 서브셋을 추가하면 됩니다.

---

## 배포

`main` 브랜치에 푸시하면 GitHub Actions가 자동으로 Cloudflare Workers에 배포합니다.

먼저 저장소 Settings → Secrets and variables → Actions 에 두 값을 등록해야 합니다.

| 이름 | 어디서 얻나 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare 대시보드 → My Profile → API Tokens → *Edit Cloudflare Workers* 템플릿 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 대시보드 우측의 Account ID |

수동 배포는 `npm run deploy` 입니다.

### 도메인
현재는 `*.workers.dev` 기본 도메인을 씁니다. 커스텀 도메인이 정해지면
`src/config/site.ts` 의 `ORIGIN` 한 줄만 바꾸면 정규 URL·언어별 대체 URL·
SNS 공유 주소·사이트맵이 전부 따라옵니다.

> ⚠️ 결제를 열기 전에 도메인이 확정돼야 합니다. 국내 PG는 가맹 심사 때
> 서비스 도메인을 등록하며, 나중에 바꾸면 재심사 대상이 될 수 있습니다.

---

## 결제 (2차)

장바구니 · 체크아웃 · 주문 완료 · 주문 조회가 모두 만들어져 있고, 스위치만 꺼져 있습니다.

### 주문 흐름

```
체크아웃 폼
  → POST /api/orders          주문을 D1 에 pending 으로 저장 (서버가 금액을 기억)
  → PG 결제창
  → /order/complete
  → POST /api/payments/confirm  저장된 금액과 대조한 뒤 PG 에 승인 요청 → paid
```

**주문을 먼저 저장하는 이유는 금액 조작을 막기 위해서입니다.** 승인 단계에서
브라우저가 보낸 금액을 그대로 믿으면 값을 바꿔 싸게 결제할 수 있습니다.
서버는 저장해 둔 금액과 대조하고, 어긋나면 승인하지 않고 그 주문을 실패 처리합니다.

### 켜는 순서

1. **PG 계약** — 비교표는 `docs/step1-reference-research.md`
2. **D1 준비**
   ```bash
   npx wrangler d1 create avora-orders     # 나온 database_id 를 wrangler.jsonc 에 넣기
   npm run db:migrate                       # 운영 DB 에 테이블 생성
   ```
3. **시크릿 등록** — `npx wrangler secret put TOSS_SECRET_KEY`
4. **`wrangler.jsonc`** 에 `"vars": { "PAYMENT_PROVIDER": "tosspayments" }` 추가
5. **`src/data/product.json`** 의 `price` 채우기
6. **`src/config/payment-config.json`** 의 `KR.checkout` 을 `"internal"` 로 변경
7. **`src/config/commerce.json`** 의 배송비 정책 확정
8. **`checkout.astro`** 의 PG SDK 호출 부분 연결 (주석으로 자리를 표시해 두었습니다)

다른 PG를 쓰려면 `worker/payments/` 에 어댑터 파일 하나를 추가하고
`worker/index.ts` 의 `ADAPTERS` 에 등록하면 됩니다. **화면 코드는 고치지 않습니다.**

### 주문 관리 화면 (`/admin`)

들어온 주문을 보고 송장번호를 넣는 화면입니다. 한국어 전용이고 `noindex` 이며,
언어 접두어(`/ko/`)가 붙지 않습니다 — 고객이 보는 사이트가 아니기 때문입니다.

**이 화면은 인증이 설정되지 않으면 열리지 않습니다.** 로그인을 직접 만드는 대신
Cloudflare Access 를 앞에 세웠습니다. 설정을 깜빡한 채 배포하면 주문의 연락처와
배송지가 인터넷에 그대로 노출되므로, 잠기는 쪽이 기본값입니다.

여는 순서:

1. Cloudflare Zero Trust → **Access → Applications** → Self-hosted 추가
2. 도메인은 `<사이트도메인>`, 경로는 `/admin` 과 `/api/admin`
3. 정책에 로그인을 허용할 이메일(또는 도메인)을 넣기
4. `wrangler.jsonc` 에 두 값을 넣고 배포

   ```jsonc
   "vars": {
     "ACCESS_TEAM_DOMAIN": "https://<팀이름>.cloudflareaccess.com",
     "ACCESS_POLICY_AUD": "<애플리케이션 Audience 태그>"
   }
   ```

검증은 `worker/admin.ts` 가 합니다. Cloudflare 가 붙여 주는 `Cf-Access-Jwt-Assertion`
헤더의 서명을 팀 공개키로 확인하고, 발급자와 대상(aud)까지 대조합니다.
공식 문서 권고에 따라 쿠키가 아니라 헤더를 봅니다 — 쿠키는 오리진까지 전달된다는
보장이 없습니다.

| 상태 | 배송 상태 값 | 뜻 |
|---|---|---|
| 미발송 | `unfulfilled` | 결제됨, 아직 준비 전 |
| 준비중 | `preparing` | 포장·출고 준비 |
| 발송 | `shipped` | 송장 등록됨 (발송 시각이 자동 기록) |
| 배송완료 | `delivered` | |
| 반품 | `returned` | |

송장번호를 넣으면 상태를 따로 고르지 않아도 **발송**으로 넘어갑니다.
송장이 있는데 미발송인 주문은 존재할 수 없기 때문입니다.
등록한 송장번호는 고객의 주문조회 화면에도 함께 나갑니다.
관리 메모는 내부용이라 고객에게 나가지 않습니다.

### 법적 고지 페이지

세 페이지가 5개 언어로 있습니다. `/{언어}/legal/terms` · `/legal/privacy` · `/legal/shipping`.

각 페이지는 두 종류의 내용으로 나뉩니다.

**코드에서 끌어온 사실** — 제가 채웠고, 설정을 바꾸면 함께 바뀝니다.

| 내용 | 값의 정의처 |
|---|---|
| 배송비 문장 | `src/config/commerce.json` (장바구니·체크아웃·서버 계산과 같은 파일) |
| 배송 단계 표 | `worker/orders.ts` 의 `FULFILLMENTS` |
| 판매 국가 표 | `src/config/payment-config.json` |
| 결제수단 목록 | 같은 파일의 `enabled: true` 인 것만 |
| 주문 수량·품목 한도 | `commerce.json` + `worker/catalog.ts` |
| 개인정보 수집 항목 표 | 체크아웃 폼이 실제로 받는 항목 |

설정만 바꾸고 안내문에 옛날 값이 남는 것이 법적 문서에서 가장 흔한 사고라,
`tests/e2e/legal.spec.ts` 가 이 값들이 서로 어긋나지 않는지 검사합니다.

**아직 비어 있는 법적 문안** — 감추지 않고 "확정이 필요한 항목"을 목록으로 드러냅니다.
빈 페이지보다 무엇이 확정돼야 하는지 보이는 편이 낫고, 그럴듯한 문구로 채우면
확인되지 않은 약속이 게시되기 때문입니다. 특히 화장품은 개봉 여부에 따라
청약철회가 제한될 수 있어 확인 없이 적으면 안 되는 영역입니다.

문안이 확정되면 `src/i18n/{언어}.json` 의 `legal.terms` · `legal.shipping` 아래에
넣으면 5개 언어에 함께 반영됩니다.

카드번호·계좌번호 같은 결제수단 정보는 이 사이트가 받지도, 저장하지도 않습니다.

---

## 품질 기준

각 단계를 "통과"로 판정하는 기준입니다. 실제 측정값을 함께 적었습니다.

| 항목 | 기준 | 측정값 (모바일) |
|---|---|---|
| Lighthouse Performance | ≥ 90 | **96~100** (전 페이지) |
| Lighthouse Accessibility | ≥ 95 | **100** |
| Lighthouse SEO | 100 | **100** (색인 대상 페이지) |
| LCP | ≤ 2.5s | **1.4~2.5s** |
| CLS | ≤ 0.1 | **0** |
| 탭 영역 | ≥ 44×44px | 테스트로 강제 |
| 360~430px 가로 스크롤 | 없음 | 테스트로 강제 |
| 브라우저 테스트 | 전부 통과 | **396개 통과** (commerce 258 + launch 138) |

> 장바구니·체크아웃·주문조회는 Lighthouse SEO 가 69 로 나옵니다.
> `noindex` 페이지를 감점하는 항목 때문이며, 이 세 페이지는 색인되면 안 되는 페이지라 정상입니다.

`npm test` 가 이 중 측정 가능한 항목을 두 모드 모두에서 자동으로 검사합니다.

---

## 문서

| 문서 | 내용 |
|---|---|
| `docs/deep-interview-spec.md` | 요구사항 인터뷰 결과 — 무엇을 왜 이렇게 정했는지 |
| `docs/step1-reference-research.md` | 레퍼런스 사이트 · PG 비교 · 프레임워크 선택 근거 |
| `docs/step3-ia.html` | 사이트맵 · 페이지 구성 · 메타데이터 매트릭스 |
