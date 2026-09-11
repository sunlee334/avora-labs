# PAROS Store — AVORA LABS 자사몰

「PAROS 제품기획안 v09」와 「AVORA LABS 사업기획서 v04」를 바탕으로 새로 설계한 브랜드 서사형 D2C 쇼핑몰입니다.
단일 제품(Daily Sunscreen 50ml)으로 시작해 로드맵 제품(미니 · 애프터케어 · 데오드란트)을 순차 공개하는 구조입니다.

## 스택

| 영역 | 선택 | 비고 |
|---|---|---|
| 프레임워크 | Next.js 16 App Router, React 19, TypeScript | `src/proxy.ts`(구 middleware)로 언어 라우팅 + `/admin`, `/account` 보호 |
| 스타일 | Tailwind CSS v4 | 디자인 토큰은 `src/app/globals.css`의 `@theme` |
| DB | Drizzle ORM + libsql | 로컬 `file:./data/paros.db`, 운영은 Turso URL로 전환 |
| 결제 | 토스페이먼츠 결제위젯 v2 | `.env`의 문서 공개 테스트 키로 샌드박스 결제 |
| 인증 | 자체 구현 | scrypt 비밀번호 해시, DB 세션 + httpOnly 쿠키 |
| 테스트 | Vitest | `tests/` — 도메인 로직 단위 + `:memory:` DB 통합 |

## 저장소

[![CI](https://github.com/sunlee334/avora-labs/actions/workflows/ci.yml/badge.svg)](https://github.com/sunlee334/avora-labs/actions/workflows/ci.yml) [![D1 backup](https://github.com/sunlee334/avora-labs/actions/workflows/d1-backup.yml/badge.svg)](https://github.com/sunlee334/avora-labs/actions/workflows/d1-backup.yml)

소스는 https://github.com/sunlee334/avora-labs (`main`). 이전 사이트(Astro) 이력은 2026-09-11 병합 커밋 아래에 남아 있습니다. push/PR 마다 CI 가 typecheck·lint·test·`cf:build` 를 실행하고(수동 실행도 가능), 운영 배포는 사람이 `pnpm cf:deploy:prod` 로 합니다. 배포한 커밋에는 `deploy/<날짜>-<워커 버전 앞 8자>` 태그를 남깁니다.

## 시작하기

```bash
pnpm install
cp .env.example .env          # 이미 있으면 생략
pnpm db:migrate               # 마이그레이션 적용 (data/paros.db 생성)
pnpm db:seed:demo             # 카탈로그 + 관리자 + 데모 고객/주문/리뷰
pnpm dev                      # http://localhost:3000
```

기본 계정(시드):

| 역할 | 이메일 | 비밀번호 |
|---|---|---|
| 관리자 | `admin@avoralabs.co` | `change-me-before-launch` (`.env`의 `ADMIN_*`로 변경) |
| 데모 고객 | `runner@example.com` | `demo-password-1234` |

## 스크립트

| 명령 | 설명 |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | 개발 · 빌드 · 실행 |
| `pnpm typecheck` | `next typegen` 후 `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest |
| `pnpm db:generate` | 스키마 변경 → `drizzle/` 마이그레이션 생성 |
| `pnpm db:migrate` | 마이그레이션 적용 |
| `pnpm db:seed` / `pnpm db:seed:demo` | 기본 시드 / 데모 데이터 포함 |
| `pnpm db:reset` | 로컬 DB 삭제 후 재생성(데모 포함) |

## 환경 변수

`.env.example` 참고. 핵심:

- `AUTH_SECRET` — 주문 소유 토큰(결제 완료 영수증·실패 취소 권한) 서명 키. 운영에서는 16자 이상 무작위 값 필수.
- `DATABASE_URL`, `DATABASE_AUTH_TOKEN` — 로컬은 `file:./data/paros.db`. 운영은 Turso(`libsql://…`) + 토큰.
- `NEXT_PUBLIC_TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY` — 결제위젯 클라이언트 키 / 서버 시크릿 키. 계약 후 상점 키로 교체.
- `UPLOAD_DIR` — 리뷰 사진 저장 경로. 운영에서는 `src/lib/uploads.ts` 한 곳만 Blob 스토리지로 교체.
- `NEXT_PUBLIC_SITE_URL` — OG/메타데이터 기준 URL.
- `NEXT_PUBLIC_KAKAO_CHANNEL_URL` — CS 단일 채널(카카오톡 채널) 링크.

## 구조

```
src/
  app/                # 라우트. 스토어는 [locale]/(store)/ 아래 (홈, shop, products/[slug], cart, checkout(success 라우트 → complete), account, policy …), admin 은 언어 구분 없음
  components/         # site(헤더/푸터/언어 전환), ui(기본 요소), home/product/cart/checkout/account/admin …
  content/            # 언어별 서사 콘텐츠: ko/(원본) + en.ts·th.ts·vi.ts·zh.ts, getContent(locale)
  i18n/               # 언어 라우팅(config), 서버/클라이언트 사전 접근(getT/useMessages), Link, 가격·날짜 포맷, messages/<locale>.ts
  db/                 # schema.ts, client.ts, migrate.ts, seed.ts
  lib/                # config(정책 상수), pricing(순수 계산), cart, catalog, checkout, coupons, auth/*, uploads
  proxy.ts            # 언어 접두사 라우팅(한국어는 접두사 없이 내부 재작성) + 쿠키 기반 낙관적 접근 제어
drizzle/              # 생성된 SQL 마이그레이션
tests/                # Vitest
```

## 다국어 (KO · EN · TH · VI · ZH)

- URL: 한국어는 접두사 없이(`/shop`), 나머지는 `/en/shop`, `/th/shop`, `/vi/shop`, `/zh/shop`. `src/proxy.ts` 가 한국어 요청을 `/ko/...` 로 내부 재작성하고 현재 언어를 `x-paros-locale` 헤더로 넘긴다. 관리자(`/admin`)·API 는 한국어 고정.
- 서버 컴포넌트·서버 액션은 `getT()`(`src/i18n/server.ts`)로 `{ locale, m }` 을, 클라이언트 컴포넌트는 `useMessages()`/`useLocale()` 로 읽는다. 루트 레이아웃이 현재 언어 사전만 `LocaleProvider` 로 내려보내므로 클라이언트 번들에는 한국어(기본값)만 들어간다.
- 내부 링크는 `@/i18n/link` 의 `Link` 를 쓴다(현재 언어 접두사를 자동으로 붙임). 로그인 리다이렉트·결제 successUrl/failUrl 도 `localizePath(locale, path)` 로 접두사를 유지한다.
- 문구는 두 층: UI 문구(버튼·폼·오류·상태 라벨)는 `src/i18n/messages/<locale>.ts`(한국어가 타입 기준, `Messages = DeepString<typeof ko>`), 서사 콘텐츠(홈·브랜드·기준·FAQ·정책)는 `src/content/<locale>.ts`. DB 카탈로그(상품 부제·옵션명)는 `CATALOG.products[slug]`/`CATALOG.variants[sku]` 로 언어별 표시 문구를 덮어쓴다.
- 가격은 모든 언어에서 KRW: `formatPrice(value, locale)` → 한국어 `32,000원`, 그 외 `₩32,000`. 날짜는 `formatLocalDate/DateTime` 이 Asia/Seoul 기준으로 언어별 표기.
- 정책(이용약관·개인정보·배송/반품)은 영어 번역본 하나를 TH/VI/ZH 가 공유하며, 번역본 상단에 "한국어 원문이 법적 효력을 가진다" 고지(`legalNotice`)를 표시한다.
- 메타데이터: 페이지마다 `localeAlternates(locale, path)` 로 canonical + hreflang 을 내고, `src/app/sitemap.ts` 가 언어별 URL 을 나열한다.
- 저장 데이터는 언어 중립: 배송 메모는 고정 키(`DELIVERY_MEMO_KEYS`: door·security·call·locker)를 저장하고 고객 화면은 사전, 관리자 화면은 `deliveryMemoLabel()`(한국어)로 보여준다. 주문 품목 옵션명은 저장 스냅샷(한국어) 대신 `variant.sku` → `CATALOG.variants` 로 표시만 덮어쓴다. 토스 `orderName`·관리자 이력·리뷰 본문은 번역하지 않는다.
- 검사: `tests/unit/i18n.test.ts` 가 다섯 사전의 키·자리표시자 동일성, 콘텐츠 형태, 경로 헬퍼, 가격 포맷을 확인한다. 새 문구는 반드시 다섯 파일에 모두 넣어야 타입·테스트를 통과한다. `tests/unit/copy-rules.test.ts` 는 번역 파일에도 언어별 금지 표현(스웨트프루프·미백·주름·여드름·재생·자체 개발 처방 계열)을 건다.

## 정책 요약 (기획안 반영)

- 정가 32,000원 고정. 2개 세트 56,000원(개당 28,000원)은 자사몰 전용.
- 배송비 3,000원, 50,000원 이상 무료, 회원 첫 구매 배송비 면제. 상수는 `src/lib/config.ts`.
- 쿠폰: 코드 기반(배송비 면제 / 정액 / 정률). 펀딩 참여자 코드 `WITHPAROS` 시드. 정액·정률은 전체 한도 필수, `회원 전용` 체크 시 비회원 주문에서는 거부(마이그레이션 0007).
- 리뷰: 배송 완료 구매자만 작성, 활동 태그·사진·대가 제공 표시. 삭제·숨김 없음, 관리자 답글만. 상품 페이지는 태그 필터 + 10건 단위 페이지로 읽는다(`getProductReviewsPage`).
- 금지 표현(스웨트프루프 등)은 `tests/unit/copy-rules.test.ts`가 검사.

## Cloudflare 배포 (운영: avoralabs.co)

운영은 기존 사이트와 같은 방식인 **Cloudflare Workers(OpenNext) + D1 + R2** 입니다. `CF_BUILD=1` 빌드에서는 `next.config.ts` 의 alias 로
DB 드라이버가 `src/db/driver.workerd.ts`(D1), 업로드가 `src/lib/upload-driver.workerd.ts`(R2)로 바뀝니다.
D1 은 BEGIN/COMMIT 을 지원하지 않으므로 체크아웃은 트랜잭션 대신 `db.batch()` 를 씁니다.

| 리소스 | 값 |
|---|---|
| 프리뷰 Worker | `paros-store` → `https://paros-store.<account>.workers.dev` |
| 운영 Worker | `avora-labs` (avoralabs.co · www 커스텀 도메인이 붙어 있음) — `wrangler.jsonc` `env.production` |
| D1 | `paros-store` (스토어 전용). 이전 사이트의 `avora-orders` 는 2026-09-12 백업 후 삭제 |
| R2 | `paros-uploads` (리뷰 사진) — 대시보드에서 R2 활성화 후 버킷 생성·바인딩 주석 해제 |

```bash
pnpm cf:migrate:remote                       # drizzle/*.sql → D1 paros-store
ADMIN_PASSWORD=... pnpm cf:seed:sql > data/seed.sql && pnpm exec wrangler d1 execute paros-store --remote --file=data/seed.sql
pnpm cf:deploy                               # 프리뷰(workers.dev)
echo -n "<random>" | pnpm exec wrangler secret put AUTH_SECRET        # 프리뷰 워커 시크릿
echo -n "<toss secret>" | pnpm exec wrangler secret put TOSS_SECRET_KEY
pnpm cf:deploy:prod                          # 운영: avora-labs 워커를 새 버전으로 교체 (롤백은 대시보드 Rollback)
echo -n "<random>" | pnpm exec wrangler secret put AUTH_SECRET --env production
echo -n "<toss secret>" | pnpm exec wrangler secret put TOSS_SECRET_KEY --env production
```

- 로컬 워커 실행: `pnpm cf:preview` (로컬 D1: `pnpm cf:migrate:local` 후 시드 SQL 적용). 로컬 비밀값은 `.dev.vars`.
- `cf:*` 스크립트는 `scripts/cf-build.mjs` 를 거칩니다. 빌드 동안 `.env`(로컬 비밀값)를 격리해 워커 번들(`next-env.mjs`)에 들어가지 않게 하고, 번들에 비밀 키가 남으면 빌드를 실패시킵니다.
- 프리뷰 워커 `paros-store` 는 운영 D1 을 공유하므로 `workers_dev: false` 로 공개 호스트를 닫아 두었습니다. 외부 확인이 필요하면 별도 D1 을 붙인 뒤에만 여세요.
- 레이트리밋은 D1 `rate_limits` 테이블 기반입니다(Workers 는 isolate 별 메모리라 인메모리 제한이 무의미). 클라이언트 IP 는 Cloudflare 의 `cf-connecting-ip` 만 신뢰합니다.
- OG 이미지는 정적 파일 `src/app/opengraph-image.png`(1200×630) 입니다. 워커 번들에서 `@vercel/og`(satori·resvg wasm ≈ 3MB)를 빼기 위해 런타임 생성 대신 파일로 둡니다. 문구를 바꾸려면 PNG 를 다시 만들어 교체하세요(`docs/` 의 브랜드 자산 또는 Figma).
- 정적 자산 캐시: `scripts/cf-build.mjs` 가 `_headers` 에 `/_next/static/*` 1년 immutable, `/visuals`·`/brand`·`/icon.svg` 하루 캐시를 씁니다. 워커는 Smart Placement 로 D1(APAC) 가까이서 실행됩니다.
- 공개 빌드 변수(`NEXT_PUBLIC_*`)는 `.env.production` 에서 빌드 시 인라인됩니다. 토스 상점 키로 교체 후 재빌드가 필요합니다.
- 운영 원칙(2026-09-12): **무료 기능만 사용**합니다 — Workers Free(하루 10만 요청, 요청당 CPU 10ms, Time Travel 7일), D1, Turnstile, 무료 WAF 규칙 1개, GitHub Actions, Resend 무료 플랜. 유료 서비스(Workers Paid, Cloudflare Images, 알림톡 등)는 백로그에 [유료·보류]로만 적어 둡니다. 한도와 증상은 `docs/RUNBOOK.md` 1-b 절.
- 운영에서 토스 테스트 키(`test_*`)는 `wrangler.jsonc` 의 `TOSS_TEST_MODE=1` 이 있을 때만 동작합니다. 실 키로 바꿀 때 이 변수를 제거하세요 (주문서에도 "결제 테스트 환경" 안내가 자동으로 표시됩니다).

### 운영 안정성 장치

- **취소·환불**: 관리자 주문 화면에서 취소·환불하면 DB 를 바꾸기 전에 토스 결제 취소 API(`POST /v1/payments/{paymentKey}/cancel`, 멱등키 `cancel-<주문번호>-<사유 해시>`)를 먼저 호출합니다. 취소가 실패하면 주문 상태는 그대로 두고 오류를 보여줍니다. paymentKey 가 남은 pending 주문(승인 중 중단)도 같은 경로를 타며, 토스에 결제가 없으면(404) 주문만 취소합니다. 가상계좌 결제는 환불 계좌가 필요해 API 로 취소할 수 없으므로 상점관리자에서 환불한 뒤 "상점관리자에서 직접 처리" 확인란으로 상태만 바꿉니다(메모에 기록).
- **승인 결과 불명 처리**: 토스 승인 요청이 타임아웃·네트워크 오류로 끝나면 돈이 움직였을 수 있으므로 선점(paymentKey)을 풀지 않습니다. 같은 paymentKey 의 재시도만 승인되고, 다른 결제 시도는 "승인 진행 중"으로 막히며, cron 만료 대상에서 빠지고 1시간 뒤 승인 중단 알림이 납니다. 카드사 거절처럼 토스가 명시적으로 거절한 경우에만 선점을 풀어 다시 결제할 수 있게 합니다.
- **재고 복원**: 결제 승인 때 실제로 차감된 품목만 `order_items.stock_deducted=1` 로 표시(차감과 같은 batch)하고, 출고 전 취소(cancelled)에서는 그 품목만 바로 되돌린 뒤 표시를 지웁니다. 출고 후 환불(refunded)은 반품이 입고된 뒤 주문 화면의 "재고 복원" 버튼으로 되돌립니다(취소 시 복원이 실패했을 때의 재시도 버튼도 같습니다). 재고 부족·batch 실패로 차감이 안 된 품목이나 이미 복원한 주문은 다시 늘어나지 않습니다. 마이그레이션 `0004` 가 그 이전에 결제된 주문의 표시를 채워 넣습니다.
- **알림**: `src/lib/ops-alert.ts` 가 결제 금액 불일치, 재고 미차감, 쿠폰 한도 초과, 결제 취소 실패, cron 실패 등을 `{"level":"alert","event":"..."}` JSON 로그로 남깁니다(Workers Logs 에서 `event` 로 검색). `OPS_ALERT_WEBHOOK_URL` 시크릿을 넣으면 같은 내용을 Slack/Discord 웹훅으로도 보냅니다.
- **cron**: `worker.ts` 가 OpenNext 핸들러를 감싸 `scheduled` 핸들러를 더하고, 운영 환경은 30분마다(`triggers.crons`) ① paymentKey 없는 pending 주문 24시간 경과 시 `cancelled/EXPIRED` 처리 ② paymentKey 가 있는데 1시간 넘게 pending 인 주문 알림 ③ 만료된 `rate_limits` 정리를 실행합니다. 로컬 확인: `pnpm cf:build && wrangler dev --test-scheduled` 후 `curl http://localhost:8787/__scheduled`.
- **헬스체크**: `GET /api/health` 가 D1 에 한 행을 읽어 `{ ok, at, cron }` 를 돌려줍니다(DB 실패 시 503). `cron` 에는 각 cron 작업의 마지막 성공 시각(`ops_state` 테이블)과 `lagMinutes`·`stale`(90분 넘게 기록 없음)이 들어 있어, 사이트는 살아 있는데 cron 만 멈춘 상황을 잡습니다. `.github/workflows/health-probe.yml` 이 15분마다 이 값을 확인하고 실패 시 GitHub 알림을 보냅니다(전용 모니터로 바꿔도 됩니다).
- **알림 발송 대기열**: 주문 확인·송장·리뷰 요청·재구매 리마인드는 `notifications` 테이블에 예약되고 30분 cron(`job=notifications`)이 보냅니다. 이메일 채널은 `RESEND_API_KEY` + `NOTIFY_FROM_EMAIL`(운영: `wrangler secret put ... --env production`) 이 있을 때만 실제 발송하고, 없으면 `skipped` 로 남깁니다. 알림톡(sms)은 대행사 연동 전까지 항상 skipped.
- **장애 격리**: 헤더의 세션·장바구니 조회, 장바구니·알림 신청·주문 조회·계정 서버 액션은 DB 오류를 인라인 메시지로 바꿉니다. D1 이 흔들려도 정책·FAQ 페이지는 그대로 열리고 제품 페이지가 통째로 오류 화면이 되지 않습니다.
- **임시 비밀번호**: 관리자가 `/admin/users` 에서 발급하면 24시간 동안만 유효하고(`temp_password_expires_at`), 그 비밀번호로 로그인하면 새 비밀번호를 정할 때까지 계정·관리자 화면이 `/account/password` 로만 열립니다(`password_reset_required`). 기간이 지나면 로그인이 거부되므로 다시 발급해야 합니다.
- **승인 상태 확인**: 토스 승인 응답의 `status` 가 `DONE` 이 아니면(가상계좌 입금 대기 등) 주문을 paid 로 바꾸지 않고 선점만 유지합니다(`PAYMENT_NOT_DONE`). 이런 주문은 cron 이 `cron.pending_claims.awaitingConfirmation` 으로 집계만 하고 자동으로 확정하지 못하므로, **입금 웹훅을 연동하기 전까지는 토스 상점관리자에서 가상계좌 결제수단을 꺼 두세요.** 승인 중단(TIMEOUT 등) 주문 알림은 TTL 을 넘긴 뒤 2시간 동안만 반복되고 그 뒤에는 집계 로그로만 남습니다.
- **재고 편집 충돌 방지**: 관리자 상품 화면의 재고 저장은 화면을 열었을 때의 값과 같을 때만 반영됩니다. 그 사이 결제가 차감했다면 저장을 거부하고 새로고침을 안내합니다.
- **쿠폰 복원**: 취소·환불 시 해당 주문의 쿠폰 사용 기록을 지우고 `usedCount` 를 되돌립니다.
- **세션**: DB 에는 세션 토큰의 sha256 만 저장합니다(배포 직후 기존 로그인은 한 번 풀립니다). 만료 세션·90일 지난 비회원 장바구니는 cron 이 정리하고, 내 계정에서 "모든 기기에서 로그아웃" 할 수 있습니다.
- **서버 액션 본문 한도**: 전역 `1mb` 입니다. R2 활성화 후 리뷰 사진은 전용 라우트 핸들러로 올려야 합니다.
- **토스 웹훅·대사**: 상점관리자에 웹훅 URL `https://avoralabs.co/api/payments/toss/webhook` 을 등록하세요(PAYMENT_STATUS_CHANGED, 가상계좌 입금 콜백). 토스는 서명을 주지 않으므로 본문은 "이 주문을 다시 확인하라"는 신호로만 쓰고, 실제 상태는 토스 조회 API 로 읽어 DB 를 맞춥니다(`src/lib/payments/reconcile.ts`). 같은 대사가 30분 cron(승인 중단·입금 대기 주문), 매일 03:15 KST cron(최근 26시간 거래 전체), 관리자 주문 화면의 "토스 결제 상태 동기화" 버튼에서도 돕니다. 이제 가상계좌 입금·상점관리자 직접 취소도 DB 에 반영됩니다.
- **cron 내부 호출**: `worker.ts` 의 scheduled 핸들러가 Worker 안에서 `/api/internal/cron` 을 호출합니다. **`CRON_SECRET` 이 필수**입니다(`wrangler secret put CRON_SECRET --env production`, 로컬은 `.dev.vars`/`.env`). 시크릿이 없으면 라우트는 모든 요청을 거부하고 cron 은 `cron.secret_missing` 알림만 남깁니다 (승인 중단 주문 대조·일일 대사가 돌지 않습니다).
- **웹훅 응답**: 결과와 무관하게 `{ ok: true }` 만 돌려줍니다(주문번호 존재 여부를 응답으로 알 수 없게). 같은 주문의 대사는 30초에 두 번까지만 토스를 조회합니다.
- **비회원 취소 범위**: 비회원 주문 조회의 취소는 비회원 주문(userId 없음)에만 허용합니다. 회원 주문은 로그인 후 내 계정에서만 취소할 수 있습니다.
- **오버셀 자동 환불**: 마지막 재고를 두 명이 동시에 결제해 재고 차감이 건너뛰어진 주문은 토스 결제를 자동 취소(전액 환불)하고 `failReason=OVERSOLD` 로 닫습니다. 취소 API 가 실패하면 paid 로 두고 `checkout.oversold_refund_failed` 알림을 냅니다.
- **고객 셀프 취소**: 출고 전(결제 완료·상품 준비 중) 주문은 마이페이지 주문 상세 또는 비회원 주문 조회(주문번호+이메일)에서 고객이 직접 취소합니다. 관리자 취소와 같은 `transitionOrder` 를 타므로 토스 취소·재고·쿠폰 복원이 함께 처리됩니다.
- **주문 이력**: `order_events` 테이블(마이그레이션 0006)에 누가·언제·왜 상태를 바꿨는지 남기고 관리자 주문 화면에 표시합니다.
- **비밀번호**: 고객은 내 계정에서 변경(다른 기기 로그아웃), 관리자는 `/admin/users` 에서 임시 비밀번호를 발급합니다(한 번만 표시, 해당 회원 세션 전부 해제). 이메일 발송 연동 전까지의 분실 복구 경로입니다.
- `WORKER_SELF_REFERENCE` 서비스 바인딩은 두지 않습니다. OpenNext 에서 ISR 재검증 큐·pages router `res.revalidate` 에만 쓰이고, 이 앱은 모든 페이지가 동적입니다. ISR 을 켜는 시점에 다시 추가하세요.
- 워커 런타임은 `NODE_ENV=production` 이라 `.env.example` 의 예제 `AUTH_SECRET` 은 거부됩니다. 반드시 무작위 값을 넣으세요.

## 운영 문서

- `docs/RUNBOOK.md` — 알림 이벤트별(승인 결과 불명, 오버셀 환불, 토스 취소 실패, 대사 불일치, cron 실패 등) 대응 절차, 관리자 계정 잠금 대비, 배포·롤백.
- `docs/D1_BACKUP.md` — Time Travel 복구와 일일 내보내기(`.github/workflows/d1-backup.yml`, 저장소 시크릿 `CLOUDFLARE_API_TOKEN`·`CLOUDFLARE_ACCOUNT_ID` 필요) 및 복구 절차.
- `.github/workflows/ci.yml` — push/PR 마다 typecheck·lint·test·`cf:build`. 배포는 사람이 `pnpm cf:deploy:prod` 로 실행한다.

## 운영 전환 체크리스트

1. (Cloudflare) 위 절차대로 D1 마이그레이션·시드·시크릿 설정. Node 호스팅을 쓸 때만 Turso `DATABASE_URL`/`DATABASE_AUTH_TOKEN` 사용.
2. 토스페이먼츠 상점 키로 교체, 상점관리자에서 `successUrl`/`failUrl` 도메인 등록.
3. R2 활성화 후 `paros-uploads` 버킷 생성·바인딩 활성화(그 전까지 리뷰 사진 업로드는 "준비 중" 안내). 사진 업로드는 서버 액션 본문 한도(1mb) 밖이므로 전용 라우트 핸들러(`/api/reviews/photos` 등)로 옮겨야 합니다.
4. `ADMIN_PASSWORD`·`AUTH_SECRET` 변경, `NEXT_PUBLIC_SITE_URL`을 실제 도메인으로.
5. 광고 픽셀/웹 분석 설치(`NEXT_PUBLIC_ANALYTICS_ID`), 이메일·알림톡 발송 연동.
6. 운영 알림 웹훅 등록: `wrangler secret put OPS_ALERT_WEBHOOK_URL --env production` (Slack Incoming Webhook 등). Cloudflare 대시보드 Workers Logs 에서 `level=alert` 필터로도 확인할 수 있습니다.
7. `wrangler secret put CRON_SECRET --env production` (필수, 임의의 긴 문자열) 을 넣고, 토스 상점관리자에 웹훅 URL(`https://avoralabs.co/api/payments/toss/webhook`)을 등록합니다.
8. 외형 모니터를 `https://avoralabs.co/api/health` 에 연결하고, 관리자 비밀번호 교체는 `pnpm cf:seed:sql --reset-admin-password > data/seed.sql` 로만 합니다(플래그 없이 재실행하면 기존 관리자 비밀번호를 건드리지 않습니다).
7. Content-Security-Policy 도입(토스 결제창 도메인 허용 목록 확정 후).
