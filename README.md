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

**운영 주소: https://avoralabs.co**

`main` 브랜치에 푸시하면 GitHub Actions가 자동으로 Cloudflare Workers에 배포합니다.

먼저 저장소 Settings → Secrets and variables → Actions 에 두 값을 등록해야 합니다.

| 이름 | 어디서 얻나 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare 대시보드 → My Profile → API Tokens → *Edit Cloudflare Workers* 템플릿 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 대시보드 우측의 Account ID |

수동 배포는 `npm run deploy` 입니다.

### 도메인

정식 주소는 **avoralabs.co** 하나입니다(Cloudflare Registrar).

| 주소 | 하는 일 |
|---|---|
| `avoralabs.co` | 정식 주소. canonical·hreflang·sitemap·OG·JSON-LD 가 전부 이 주소 |
| `www.avoralabs.co` | Redirect Rule 이 apex 로 **301** |
| `*.workers.dev` | **꺼짐** (`workers_dev: false`) |

workers.dev 를 끈 이유는 같은 내용을 두 주소가 서빙하면 검색엔진이 색인을
나눠 갖고, canonical 이 가리키지 않는 쪽이 먼저 잡히기도 하기 때문입니다.

#### www 301 은 Worker 가 아니라 Redirect Rule 이 합니다

Worker 안에서 `www` 를 처리하면 **안 됩니다.** `/ko/` 같은 정적 경로는
`run_worker_first` 목록에 없어서 Worker 가 호출조차 되지 않고, 그대로
`www` 주소로 서빙됩니다. Redirect Rule 은 요청 처리 순서상 Worker 보다 먼저
돌기 때문에 정적 파일까지 빠짐없이 잡습니다.

대시보드에서 한 번만 만들면 됩니다:

```
Cloudflare → avoralabs.co → Rules → Redirect Rules → Create rule
  When incoming requests match…   Hostname  equals  www.avoralabs.co
  Then…  Dynamic redirect
         URL       concat("https://avoralabs.co", http.request.uri.path)
         Status    301
         Preserve query string  ✅
```

#### 사이트맵에는 색인할 것만 넣습니다

사이트맵은 "이 주소를 색인해 달라" 는 제출입니다. noindex 페이지나
robots.txt 가 막은 경로가 거기 들어가면 서로 반대되는 신호를 동시에 보내는
셈이고, Search Console 은 이것을 오류로 보고합니다.

한동안 46개 주소 중 26개가 그 상태였고, **관리 화면 경로(`/admin/`)까지
공개 사이트맵에 실려 있었습니다.** 지금은 `astro.config.ts` 의 sitemap
`filter` 가 걸러냅니다. 새 페이지에 `noindex` 를 달면 그 목록에도 넣으세요.

`tests/e2e/product-seo.spec.ts` 가 사이트맵의 모든 주소를 실제로 열어 보고
noindex 가 섞여 있으면 실패합니다. robots.txt 의 Disallow 규칙과도 대조합니다.

#### 주소를 바꿔야 할 때

`src/config/site.ts` 의 `ORIGIN`, `public/robots.txt` 의 Sitemap 줄,
`wrangler.jsonc` 의 `routes` — 세 곳입니다.

어긋나면 정규 URL이 존재하지 않는 주소를 가리키는데, 화면으로는 드러나지
않고 검색엔진에만 보입니다. `tests/e2e/product-seo.spec.ts` 가
robots·sitemap·canonical 세 곳이 같은 주소인지 검사합니다.

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

현재 설정:

| | 값 |
|---|---|
| 팀 도메인 | `https://avoralabs.cloudflareaccess.com` |
| Access 애플리케이션 | `avoralabs.co/admin` · `avoralabs.co/api/admin` |
| 세션 | 24시간 |

> 🚨 **Workers & Pages → Domains & Routes 의 "Enable Cloudflare Access"
> 원클릭 버튼은 누르지 마세요.** 그 버튼은 `/admin` 만이 아니라 **호스트 전체**를
> 로그인 뒤로 보냅니다. 브랜드 사이트 5개 언어가 통째로 비공개가 됩니다.
> 경로별 보호는 아래처럼 Zero Trust 애플리케이션으로 합니다.

### `/api/admin` 을 빠뜨리면 안 됩니다

Access 애플리케이션의 Destinations 에 경로가 **두 개** 있어야 합니다.

```
avoralabs.co / admin        ← 화면
avoralabs.co / api/admin    ← 화면이 부르는 API
```

Cloudflare 는 `Cf-Access-Jwt-Assertion` 헤더를 **Access 가 덮는 경로에만** 붙입니다.
`/admin` 만 걸면 로그인은 성공해 화면까지 오는데, 화면이 부르는 API 는 토큰이
없어 전부 401 이 됩니다. 증상은 "표가 영원히 불러오는 중" 이라 원인이 안 보입니다.

그래서 관리 화면은 그 경우 "로그인이 필요합니다" 가 아니라 **경로 설정을
지목하는 메시지**를 띄웁니다. `tests/e2e/commerce/admin.spec.ts` 가
`/api/admin` 요청에서만 토큰을 떼어내 그 상황을 재현합니다.

### 처음부터 설정하는 순서

1. Zero Trust → **Settings** 에서 팀 이름 정하기 (로그인 페이지 주소가 됩니다)
2. **Access → Applications** → Self-hosted 추가
3. Destinations 에 위의 경로 두 개
4. Policies 에 Allow 정책 하나 — 비어 있으면 default-deny 라 본인도 못 들어갑니다
5. **Additional settings** 탭의 Application Audience (AUD) Tag 복사
6. `wrangler.jsonc` 의 vars 에 두 값을 넣고 배포

   ```jsonc
   "vars": {
     "ACCESS_TEAM_DOMAIN": "https://<팀이름>.cloudflareaccess.com",
     "ACCESS_POLICY_AUD": "<64자 16진수 AUD 태그>"
   }
   ```

   둘 중 하나라도 없거나 비면 관리 화면은 **잠긴 채로** 있습니다(열린 채가 아니라).
   `tests/e2e/commerce/admin.spec.ts` 가 이 파일을 직접 읽어 두 값의 형식까지
   확인합니다 — Access 는 로컬에서 재현할 수 없어 그렇게라도 봐야 합니다.

> ⚠️ **팀 이름을 바꾸면 `ACCESS_TEAM_DOMAIN` 도 함께 바꿔야 합니다.**
> Worker 가 이 값을 JWT 의 issuer 로 대조하므로, 어긋나면 로그인에 성공해도
> 통과하지 못합니다.

### 로컬 테스트는 어떻게 도나

Access 는 요청이 Worker 에 닿기 전에 Cloudflare 가 처리하는 것이라
`wrangler dev` 로는 재현할 수 없습니다. 그리고 `worker/admin.ts` 는 **Access 가
설정돼 있으면 개발용 토큰을 아예 읽지 않습니다** — 운영에 개발용 토큰이 섞여도
통로가 열리지 않게 하려는 의도적인 순서입니다.

그래서 `playwright.config.ts` 가 로컬 서버에 한해 두 값을 빈 문자열로 덮습니다
(`accessOff`). 그 덮어쓰기는 거기에만 있고 운영 배포에는 존재하지 않습니다.

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

**결제되지 않은 주문은 발송 처리할 수 없습니다.** 목록에는 결제 대기·실패 주문도
함께 나오는데(그래야 무슨 일이 있었는지 보입니다), 그 상태에서 송장번호를 넣으면
돈을 받지 않은 물건이 나갑니다. 화면에서 발송 항목을 잠그고 서버도 409 로 막습니다.
'미발송' 으로 되돌리는 것은 결제 상태와 무관하게 허용합니다 — 잘못 누른 것을
되돌리는 길까지 막으면 안 됩니다.

송장번호를 넣으면 상태를 따로 고르지 않아도 **발송**으로 넘어갑니다.
송장이 있는데 미발송인 주문은 존재할 수 없기 때문입니다.
등록한 송장번호는 고객의 주문조회 화면에도 함께 나갑니다.
관리 메모는 내부용이라 고객에게 나가지 않습니다.

### 새 주문 알림

결제가 성사되면 판매자에게 알립니다. **주문이 만들어진 순간이 아니라 결제가 끝난
순간입니다.** 체크아웃까지 왔다가 결제창에서 그만두는 사람이 훨씬 많고, 그걸 다
알리면 판매자에게 오는 알림 대부분이 처리할 일 없는 알림이 됩니다.

두 채널이 있고, 설정한 것으로만 나갑니다. 둘 다 설정하지 않으면 조용히 넘어갑니다.

| 채널 | 필요한 것 | 상태 |
|---|---|---|
| 웹훅 (Slack · Discord · 구글 챗 · 카카오워크) | 웹훅 URL 하나 | **동작 확인 완료** |
| 이메일 (Cloudflare Email Routing) | 도메인 등록 + 인증된 수신 주소 | 코드만 있음, 발송 미확인 |

웹훅을 켜려면:

```bash
npx wrangler secret put NOTIFY_WEBHOOK_URL
# Slack: 앱 → Incoming Webhooks → Add New Webhook to Workspace
# Discord: 채널 설정 → 연동 → 웹후크 → 새 웹후크
```

URL 자체가 발송 권한이라 `vars` 가 아니라 `secret` 으로 넣습니다.
Discord 는 본문 키가 `content`, 나머지는 `text` 라 URL 호스트를 보고 갈라 보냅니다.

**알림에는 주소와 연락처를 넣지 않습니다.** 웹훅이 닿는 곳은 채팅방이고, 채팅방은
관리 화면과 달리 Cloudflare Access 뒤에 있지 않습니다. 배송에 필요한 정보는
알림에 붙은 관리 화면 링크를 눌러서 봅니다.

**알림 실패는 결제를 방해하지 않습니다.** `waitUntil` 로 응답 뒤에 돌리고, 실패는
로그로만 남깁니다. 고객은 이미 결제를 마쳤고, Slack 이 죽은 것은 고객의 문제가
아닙니다. 알림이 안 왔다고 주문이 사라지는 것도 아닙니다 — 주문은 D1 에 있고
관리 화면에서 보입니다.

이메일 알림은 이제 켤 수 있습니다 — Cloudflare Email Routing 이 도메인을
요구했는데 `avoralabs.co` 가 붙었습니다. `wrangler.jsonc` 의 주석대로 바인딩과
vars 를 넣으면 됩니다(보내는 주소는 `orders@avoralabs.co` 같은 형태).
**실제로 한 번 발송해 보기 전까지는 "된다" 고 말하지 마세요** — 이 코드는 아직
실제 발송을 거쳐 본 적이 없습니다.

### 회원 계정 (1단계)

**기본값은 꺼져 있습니다.** `PUBLIC_ACCOUNTS=on` 으로 빌드해야 켜집니다.

| 켜면 생기는 것 | 끄면 |
|---|---|
| `/{언어}/account` 마이페이지 | 페이지 자체가 만들어지지 않음 |
| 헤더의 마이페이지 링크 | 링크 없음 |
| 이용약관의 "카카오로 로그인할 수 있습니다" | "회원가입과 로그인이 없습니다" |

문구가 플래그를 따르는 것이 중요합니다. 회원 기능이 없는데 약관에 있다고 적으면
그건 고객에게 게시된 거짓말입니다.

**비밀번호는 어디에도 없습니다.** 소셜 로그인만 쓰므로 이 서비스는 비밀번호를
받지도 저장하지도 않습니다. 유출될 것이 없고 재설정·잠금·무차별 대입 방어를
만들 필요도 없습니다.

**로그인은 선택입니다.** 비회원 주문은 계속 받습니다 — 결제 직전에 로그인을
요구하면 거기서 이탈합니다.

#### 켜려면 (도메인 확정 후)

카카오 로그인은 두 가지가 먼저 있어야 합니다.

1. **도메인** — ✅ `avoralabs.co` 확정. Redirect URI 는
   `https://avoralabs.co/api/auth/callback` 로 등록하면 됩니다.
2. **사업자등록번호** — 이메일을 필수 동의로 받으려면 비즈 앱이어야 하고,
   비즈 앱 전환에는 사업자등록번호 등록(또는 전화번호 본인인증)이 필요합니다.

```bash
npx wrangler secret put KAKAO_REST_API_KEY
npx wrangler secret put KAKAO_CLIENT_SECRET    # 활성화한 경우만
# wrangler.jsonc vars: { "AUTH_PROVIDER": "kakao" }
```

> ⚠️ `worker/auth/kakao.ts` 는 **실제 로그인을 거쳐 본 적이 없습니다.**
> 엔드포인트는 공식 문서를 따랐지만, 한 번 돌려보기 전까지 된다고 하지 마세요.

#### 설계에서 중요한 것

**이메일은 계정 식별자가 아닙니다.** 카카오는 이메일을 필수 동의로 설정해도
사용자가 카카오계정에 이메일을 등록하지 않았으면 값을 주지 않습니다. 이메일을
식별자로 삼았다면 그런 사용자는 로그인 자체가 막힙니다. 식별자는
`(provider, provider_user_id)` 입니다.

**이전 주문은 연락처만으로 자동 연결하지 않습니다.** 번호는 재사용되고 오타도
나서, 남의 주문이 남의 계정에 붙을 수 있습니다. 주문번호와 연락처를 **둘 다**
아는 사람만 가져올 수 있습니다 — 주문 조회와 같은 조건입니다.

**세션은 DB 에 둡니다.** 쿠키에는 원본 토큰을, DB 에는 해시를 저장합니다.
서명된 쿠키만 쓰면 조회가 없어 빠르지만 로그아웃과 강제 만료를 할 수 없습니다.
배송지가 들어 있는 계정이라 취소할 수 있어야 합니다.

#### 아직 없는 것

적립금·등급·쿠폰(2단계), 리뷰·문의(3단계), 마케팅 알림은 만들지 않았습니다.
적립금은 결제가 살아난 뒤에 의미가 생기고, 마케팅 알림은 이메일을 받을 수
있어야 하므로 사업자 정보가 선행됩니다.

### 사업자 정보

`src/config/site.ts` 의 `BUSINESS` 한 곳에서 나옵니다. 값이 비어 있으면 푸터에
그 줄이 아예 렌더링되지 않습니다 — **지어내지 말고 비워 두세요.** 없는 신고번호를
적는 것은 없는 것보다 나쁩니다.

전자상거래법 제10조가 표시를 요구하는 항목입니다.

| 항목 | 상태 |
|---|---|
| 상호 (아보라랩스) | ✅ |
| 대표자 (이영규) | ✅ |
| 사업장 소재지 | ✅ |
| 사업자등록번호 (392-32-01888) | ✅ |
| 전화번호 | ✅ |
| 전자우편주소 | ✅ |
| **통신판매업 신고번호** | ⬜ 사업자등록만으로는 생기지 않습니다 |

> 통신판매업 신고는 관할 구청에 따로 해야 하고, 신고할 때 **구매안전서비스
> 이용확인증**이 필요합니다. 그건 PG 계약이나 은행에서 발급받으므로 보통
> PG 계약이 먼저입니다.

`tests/e2e/business-info.spec.ts` 가 지킵니다: 설정된 값이 실제로 화면에 나오는지,
비어 있는 값이 라벨만 남기지 않는지, 그리고 **주민등록번호 형식이 어디에도 없는지**.
사업자등록증명 원본에는 대표자 주민등록번호가 들어 있어서, 실수로 설정에 들어오면
사이트에 그대로 노출됩니다.

같은 값이 **구조화 데이터(Organization)** 에도 들어갑니다. 답변엔진이 "이 브랜드는
누가 파는가" 에 답할 수 있어야 하고, 그 답이 푸터의 법정 표시와 어긋나면 안 됩니다.
테스트가 둘의 일치를 확인하고, 확정되지 않은 값이 빈 문자열로 새어 들어가지
않는지도 봅니다 — 빈 값을 넣으면 답변엔진이 "없음" 이 아니라 "빈 값" 을 배웁니다.

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
| Lighthouse Performance | ≥ 90 | **96~100** (로컬) / **95** (운영, 캐시 워밍 후) |
| Lighthouse Accessibility | ≥ 95 | **100** |
| Lighthouse SEO | 100 | **100** (색인 대상 페이지) |
| LCP | ≤ 2.5s | **1.4~2.5s** (로컬) / **2.6s** (운영) |
| CLS | ≤ 0.1 | **0** |
| 탭 영역 | ≥ 44×44px | 테스트로 강제 |
| 320~430px 가로 스크롤 | 없음 | 테스트로 강제 (5개 언어 전부) |
| 접근성 자동 검사 (axe, WCAG 2.1 AA) | 위반 0 | **위반 0** (44개 화면·상태) |
| 브라우저 테스트 | 전부 통과 | **992개 통과** (commerce 676 + launch 316) |

> 장바구니·체크아웃·주문조회는 Lighthouse SEO 가 69 로 나옵니다.
> `noindex` 페이지를 감점하는 항목 때문이며, 이 세 페이지는 색인되면 안 되는 페이지라 정상입니다.

> 운영 실측은 한국에서 재현했습니다. 배포 직후 엣지 캐시가 비어 있을 때는
> Performance 89 / LCP 3.2s 까지 떨어지고, 캐시가 데워지면 95 / 2.6s 로
> 안정됩니다. **배포 직후 값으로 판단하지 마세요.** LCP 가 목표를 0.1초 넘는
> 것은 엣지까지의 실제 왕복 때문이며, 커스텀 도메인 연결 후 다시 잴 항목입니다.

### 모바일 검사는 목록 기반입니다 — 새 페이지를 만들면 추가하세요

가로 넘침·탭 영역·입력 글자 크기 검사는 **페이지 목록을 돌면서** 확인합니다.
자동으로 늘지 않으므로, 새 화면을 만들면 아래 두 곳에 직접 넣어야 합니다.

| 파일 | 대상 |
|---|---|
| `tests/e2e/mobile-ux.spec.ts` | 두 모드에 모두 있는 페이지 |
| `tests/e2e/commerce/mobile-ux-commerce.spec.ts` | 자사 결제·회원 기능이 켜져야 있는 페이지 |

실제로 이 목록이 4개(`/ko/`, `/ko/product`, `/en/`, `/th/`)뿐이던 동안 법적 페이지와
장바구니·체크아웃·계정이 전부 빠져 있었고, 목록을 넓히자마자 결함 5건이 나왔습니다.
그 뒤 한국어만 여러 폭에서 보고 있던 것을 **5개 언어 전부**로 넓히자 태국어에서
가로 넘침이 또 나왔습니다(아래 "언어마다 줄바꿈 규칙이 다릅니다").

검사 항목: 320~430px 가로 넘침 없음 · 탭 영역 44×44px · 입력 글자 16px 이상
(iOS 확대 방지) · 내용이 채워질 때 레이아웃 이동 없음.

320px 는 WCAG 2.1 의 1.4.10 Reflow 기준 폭입니다 — 데스크톱을 200% 확대한 것과
같은 폭이고, 아직 쓰이는 작은 단말이 여기에 해당합니다.

### 언어마다 줄바꿈 규칙이 다릅니다

`word-break: keep-all` 은 한국어에 필요합니다. 없으면 "부드러운 케어" 가
"부드러 / 운 케어" 로 잘립니다. 그런데 이것을 `body` 에 걸면 **띄어쓰기가 없는
중국어·태국어 문장이 통째로 낱말 하나가 되어 줄바꿈 지점을 잃습니다.**

그래서 `src/styles/global.css` 는 `:lang(ko)` 로만 걸고, 나머지 언어는 브라우저
기본 규칙(중국어는 글자 사이, 태국어는 사전 기반)에 맡깁니다.
`tests/e2e/mobile-ux.spec.ts` 의 "언어별 줄바꿈 규칙" 이 언어마다 계산된 값을
확인합니다.

실제 피해는 이랬습니다: `/th/product` 가 360px 에서 13px, `/th/` 가 320px 에서
18px 넘쳤는데, `body` 에 `overflow-x: hidden` 이 있어 **가로 스크롤바조차 없이
태국어 문장 끝이 그냥 잘려 보이지 않았습니다.**

### 관리 화면 CSS 는 공개 페이지로 샙니다 — 반드시 한정하세요

Astro 는 사이트의 모든 `is:global` CSS 를 **한 파일로 묶어 모든 페이지에 링크**
합니다. `src/pages/admin.astro` 의 `<style is:global>` 에 있던 `body`, `table`,
`th, td`, `tbody tr` 같은 맨몸 선택자가 5개 언어 공개 페이지에 전부 적용되고
있었고, 위의 태국어 줄바꿈 결함이 바로 그 경로로 들어왔습니다.

지금은 관리 화면 규칙이 모두 `.admin` 아래로 한정되어 있습니다(`<body class="admin">`).
새 규칙을 넣을 때도 같은 접두사를 붙이세요.

### 접근성 자동 검사

`tests/e2e/a11y.spec.ts` 와 `tests/e2e/commerce/a11y-commerce.spec.ts` 가 axe-core 로
WCAG 2.1 A/AA 규칙을 돌립니다. Lighthouse 접근성 점수와 겹치지 않는 것을 봅니다 —
Lighthouse 는 axe 규칙의 일부만, 그것도 **처음 그려진 화면만** 봅니다.

그래서 여기서는 **움직인 뒤의 상태**도 함께 검사합니다. 열린 언어 시트, 담기 토스트,
자바스크립트가 채운 장바구니 줄, 표시된 입력 오류, 관리 화면 상세 대화상자.

검사할 때는 `prefers-reduced-motion: reduce` 를 켭니다. 등장 애니메이션이 도는 동안
재면 반쯤 투명한 글자의 혼합색이 잡혀 실제와 다른 값이 나오고, 더 나쁘게는 아직
투명한 요소를 **아예 건너뜁니다** — 실제로 그것 때문에 대비 결함 두 건이 오래
숨어 있었습니다.

`tests/e2e/tokens-contrast.spec.ts` 는 페이지와 무관하게 **팔레트 값끼리 직접**
명암비를 계산합니다. axe 는 화면에 실제로 나타난 조합만 보므로, 아직 어느 페이지에도
쓰이지 않은 조합은 잡히지 않습니다. 브랜드 컬러를 조정하면 이 검사가 먼저 걸리고,
실패 메시지가 어떤 조합이 몇 대 몇인지 알려줍니다.

> 자동 검사가 잡는 것은 접근성 문제의 일부입니다. 통과했다고 접근성이 확보된 것은
> 아니며, 키보드로 끝까지 갈 수 있는지·탭 영역 크기 같은 것은 `mobile-ux.spec.ts` 가
> 따로 봅니다. `a11y.spec.ts` 에는 검사기가 실제로 도는지 확인하는 자체 검사도
> 들어 있습니다 — 늘 통과하는 검사는 없는 것보다 나쁩니다.

`npm test` 가 이 중 측정 가능한 항목을 두 모드 모두에서 자동으로 검사합니다.

---

## 문서

| 문서 | 내용 |
|---|---|
| `docs/deep-interview-spec.md` | 요구사항 인터뷰 결과 — 무엇을 왜 이렇게 정했는지 |
| `docs/step1-reference-research.md` | 레퍼런스 사이트 · PG 비교 · 프레임워크 선택 근거 |
| `docs/step3-ia.html` | 사이트맵 · 페이지 구성 · 메타데이터 매트릭스 |
