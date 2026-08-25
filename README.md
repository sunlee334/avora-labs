# AVORA 웹사이트

활동적인 매력과 부드러운 케어가 함께하는 스킨케어 브랜드 AVORA의 공식 웹사이트입니다.
한국어·영어·중국어(간체)·태국어·베트남어 5개 언어를 지원합니다.

- **프레임워크** Astro 7 (정적 생성)
- **호스팅** Cloudflare Workers — 정적 파일과 API가 같은 도메인에서 동작합니다
- **상태** 1차(브랜드 사이트) 개발 완료 · 자사 결제는 2차

---

## 🎨 이것만 알면 됩니다 — 어디를 고치면 무엇이 바뀌나

개발 지식이 없어도 아래 표만 보고 값을 바꿀 수 있게 만들었습니다.
**값은 항상 한 곳에서만 정의됩니다.** 같은 값이 여러 파일에 흩어져 있지 않습니다.

| 바꾸고 싶은 것 | 고칠 파일 | 따라 바뀌는 것 |
|---|---|---|
| **브랜드 컬러** | `tokens/design-tokens.json` | 사이트 전체 색 |
| **제품 가격** | `src/data/product.json` | 제품 상세 · 검색엔진용 구조화 데이터 |
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
npm run dev        # 개발 서버 (http://localhost:4321)
npm run build      # 정적 빌드 → dist/
npm run preview    # Worker 까지 포함해 실제와 같은 환경으로 확인
npm run test:e2e   # 브라우저 테스트 (모바일 Safari + 데스크톱 Chrome)
```

`npm run build` 는 앞서 다음을 자동으로 실행합니다.

| 단계 | 하는 일 |
|---|---|
| `tokens` | 디자인 토큰 JSON → CSS 변수 생성 |
| `og` | SNS 공유 이미지 1200×630 생성 |
| `check:i18n` | 5개 언어 번역 파일의 키 구조가 한국어와 일치하는지 검사 |
| `check:fonts` | 폰트 서브셋이 현재 문구의 모든 글자를 담고 있는지 검사 |

검사에서 걸리면 빌드가 멈춥니다. 화면에 무엇이 빠졌는지 나오니 그대로 고치면 됩니다.

---

## 폴더 구조

```
tokens/design-tokens.json   ★ 컬러·타이포·간격의 유일한 원본
src/
  config/site.ts            도메인·언어 목록·사업자 정보
  config/payment-config.json  국가코드 → 결제수단
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
worker/index.ts             루트 언어 판별 + 결제 승인 API
tests/e2e/                  브라우저 테스트
docs/                       기획·리서치 문서
```

---

## 폰트

본문은 **Pretendard**, 헤드라인은 **Noto Serif KR** 입니다(둘 다 SIL OFL, 상업적 사용 가능).
두 서체 모두 **각 언어 페이지에 실제로 쓰이는 글자만 남겨** 자체 호스팅합니다.

| 언어 | 본문 | 헤드라인 |
|---|---|---|
| 한국어 | 74KB | 55KB |
| 영어 | 20KB | 19KB |
| 중국어 | 21KB | 44KB |
| 태국어 | 20KB | 19KB |
| 베트남어 | 23KB | 22KB |

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

1차 오픈에서는 구매 버튼이 외부몰로 연결되고 자사 결제는 꺼져 있습니다.
결제 승인 엔드포인트(`/api/payments/confirm`)는 이미 만들어져 있으며,
설정이 없으면 이유를 담아 503을 돌려줍니다.

켜는 순서는 이렇습니다.

1. PG 계약 완료 (Step 1 리서치의 비교표 참고 — `docs/step1-reference-research.md`)
2. `wrangler secret put TOSS_SECRET_KEY` 로 시크릿 등록
3. `wrangler.jsonc` 에 `"vars": { "PAYMENT_PROVIDER": "tosspayments" }` 추가
4. `src/config/payment-config.json` 의 `KR.checkout` 을 `"internal"` 로 변경

다른 PG를 쓰려면 `worker/payments/` 에 어댑터 파일 하나를 추가하고
`worker/index.ts` 의 `ADAPTERS` 에 등록하면 됩니다. **화면 코드는 고치지 않습니다.**

---

## 품질 기준

각 단계를 "통과"로 판정하는 기준입니다. 실제 측정값을 함께 적었습니다.

| 항목 | 기준 | 측정값 (모바일) |
|---|---|---|
| Lighthouse Performance | ≥ 90 | **99~100** |
| Lighthouse Accessibility | ≥ 95 | **100** |
| Lighthouse SEO | 100 | **100** |
| LCP | ≤ 2.5s | **1.4~2.2s** |
| CLS | ≤ 0.1 | **0** |
| 탭 영역 | ≥ 44×44px | 테스트로 강제 |
| 360~430px 가로 스크롤 | 없음 | 테스트로 강제 |
| 브라우저 테스트 | 전부 통과 | **90개 통과** |

`npm run test:e2e` 가 이 중 측정 가능한 항목을 자동으로 검사합니다.

---

## 문서

| 문서 | 내용 |
|---|---|
| `docs/deep-interview-spec.md` | 요구사항 인터뷰 결과 — 무엇을 왜 이렇게 정했는지 |
| `docs/step1-reference-research.md` | 레퍼런스 사이트 · PG 비교 · 프레임워크 선택 근거 |
| `docs/step3-ia.html` | 사이트맵 · 페이지 구성 · 메타데이터 매트릭스 |
