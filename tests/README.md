# 테스트 구조

Vitest(`pnpm test`)로 실행한다. Node 환경, `@/` alias는 `vitest.config.ts`에서 `src/`로 매핑되어 있다.

- `tests/unit/` — 순수 함수 단위 테스트 (`pricing`, `orders`, `password`, `rate-limit`), 브랜드 카피 금지어 검사(`copy-rules`), 다국어 사전·경로·포맷 검사(`i18n`: 다섯 언어 사전의 키와 `{placeholder}` 가 한국어와 같은지, 콘텐츠 형태, `localizePath`/`switchLocalePath`, `formatPrice`).
- `tests/integration/` — 인메모리 libsql DB(`:memory:`)에 마이그레이션을 적용해 스키마 제약(유니크 인덱스, cascade delete)과 `seedBase()` 동작을 검증한다.
- `tests/integration/reconcile.test.ts` — 토스 대사(`reconcileOrderWithToss`, 30분 pending 대조, 일일 거래 대사)를 토스 조회 API mock 으로 검증한다.
- `tests/integration/checkout.test.ts`, `order-admin.test.ts`, `coupons.test.ts`, `order-maintenance.test.ts` — 결제 승인(`confirmOrder`, 비-DONE 응답 포함)·주문 생성·관리자 취소/환불(토스 취소 + 재고·쿠폰 복원)·쿠폰 한도·cron 정리(pending 만료, 세션, 비회원 장바구니) 로직을 인메모리 DB 로 검증한다. 시드는 `vitest.config.ts` 의 `ADMIN_PASSWORD` 로 관리자를 만든다.
- `tests/helpers/db.ts` — `withTestDb({ seed?: boolean })`. 테스트마다 독립된 `:memory:` DB를 만들고 마이그레이션을 적용한다. `client.close()`는 각 테스트의 `afterEach`에서 직접 호출한다. `installTestDb()`/`uninstallTestDb()` 는 같은 DB 를 `@/db/client` 의 `db` 프록시에 꽂아, `db` 를 직접 import 하는 서버 모듈을 mock 없이 테스트할 수 있게 한다.

## 주의

- `server-only` 는 `vitest.config.ts` 의 alias 로 빈 모듈(`tests/helpers/server-only.ts`)로 대체된다. 단 `next/headers`(쿠키)를 쓰는 `auth/session.ts`, `cart.ts`, `catalog.ts`, `uploads.ts` 와 네트워크에 닿는 `payments/toss.ts` 는 직접 호출하지 말고 `vi.mock` 으로 대체한다 (`checkout.test.ts` 참고).
- `src/db/migrate.ts`, `src/db/seed.ts`는 직접 실행 가드(`isDirectRun`)가 있어 테스트에서 import해도 안전하다.
- `copy-rules.test.ts`는 `src/content/**/*.ts`, `src/i18n/messages/*.ts`, `src/app/**/*.tsx`, `src/components/**/*.tsx`를 실행 시점 기준으로 스캔한다. 다른 레인이 아직 작성하지 않은 파일은 자연히 건너뛴다.
