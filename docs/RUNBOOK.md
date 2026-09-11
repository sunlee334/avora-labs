# PAROS 스토어 운영 런북

결제·재고·대사에서 사람이 확인해야 하는 상황이 생기면 앱은 `{"level":"alert","event":"..."}` JSON 로그를 남기고,
`OPS_ALERT_WEBHOOK_URL` 이 설정돼 있으면 같은 내용을 Slack/Discord 로 보냅니다. 이 문서는 **알림 이벤트별로 무엇을 확인하고 무엇을 누르면 되는지**를 한 장으로 정리한 것입니다.

- 로그 보는 곳: Cloudflare 대시보드 → Workers & Pages → `avora-labs` → Logs. 필터 `level = alert` 또는 `event = <이름>`. 터미널에서는 `pnpm exec wrangler tail --env production --format pretty`.
- 주문 화면: `https://avoralabs.co/admin/orders/<id>` (Cloudflare Access 통과 후 관리자 로그인). 알림의 `order` 값은 주문번호(`PR-...`)이고, 주문 목록에서 검색하면 됩니다.
- 토스 상점관리자: 결제 조회·환불·가상계좌 처리. 알림의 `paymentKey` 로 검색합니다.
- 원칙: **DB 상태보다 토스 결제 상태가 사실**입니다. 애매하면 주문 화면의 **"토스 결제 상태 동기화"** 버튼을 먼저 누르세요(토스 조회 API 로 다시 읽어 주문을 맞춥니다).

## 1. 알림별 대응

### `checkout.confirm_outcome_unknown` — 승인 결과 불명
- 뜻: 결제 승인 요청이 타임아웃·네트워크 오류로 끝나 돈이 움직였는지 모르는 상태. 주문은 `pending` 이고 `paymentKey` 선점이 남아 있습니다.
- 자동 처리: 30분 cron(`cron.stuck_payment_claim`)이 토스에 다시 조회해 DONE 이면 `paid` 로, 취소·만료면 주문을 닫습니다. 대부분 사람이 손댈 일이 없습니다.
- 사람이 할 일: 1시간 뒤에도 같은 주문의 `cron.stuck_payment_claim` 이 반복되면 주문 화면 → "토스 결제 상태 동기화". 그래도 `pending` 이면 토스 상점관리자에서 `paymentKey` 로 결제를 찾아 (a) 승인돼 있으면 동기화 재시도, (b) 결제가 없으면 주문 화면에서 취소(결제 없는 pending 은 결제 취소 없이 주문만 닫힙니다).

### `cron.stuck_payment_claim` / `cron.pending_claims` — 승인 중단 주문 집계
- 뜻: `paymentKey` 는 있는데 1시간 넘게 `pending` 인 주문. 위 항목과 같은 주문일 가능성이 큽니다. `awaitingConfirmation` 은 가상계좌 입금 대기(`PAYMENT_NOT_DONE`) 건수라 알림 대상이 아닙니다.
- 사람이 할 일: 개별 알림은 2시간 동안만 반복됩니다. 그 뒤에도 `stuck` 집계가 0 이 되지 않으면 주문 목록에서 `결제 대기` 필터로 해당 주문을 찾아 "토스 결제 상태 동기화".

### `checkout.oversold` / `checkout.oversold_refund_failed` / `checkout.oversold_manual_refund_required` — 마지막 재고 동시 결제
- 뜻: 결제는 승인됐지만 재고 차감이 건너뛰어진 주문. `checkout.oversold` 는 자동으로 전액 환불하고 주문을 취소한 정상 처리 알림입니다(고객에게는 "품절로 자동 환불" 화면).
- `oversold_refund_failed`: 토스 취소 API 가 실패. 토스 상점관리자에서 `paymentKey` 로 결제를 찾아 전액 환불한 뒤, 주문 화면에서 **"상점관리자에서 직접 처리"** 확인란을 켜고 취소로 바꿉니다.
- `oversold_manual_refund_required`: 가상계좌 결제라 환불 계좌 없이는 API 취소가 안 됩니다. 고객에게 환불 계좌를 받아 상점관리자에서 환불 → 위와 같이 "직접 처리"로 취소. 주문 메모에 `[자동] 재고 소진…` 안내가 남아 있습니다.
- 재발 방지: 재고를 늘릴 계획이면 관리자 상품 화면에서 재고를 먼저 올리세요. 자동 환불된 고객은 재입고 알림 링크를 받았습니다.

### `order.toss_cancel_failed` — 관리자 취소·환불 시 토스 취소 실패
- 뜻: 관리자가 취소/환불을 눌렀지만 토스 취소 API 가 실패해 **주문 상태는 그대로** 두었습니다(돈과 상태가 어긋나지 않게).
- 사람이 할 일: 알림의 `cause` 를 봅니다. `ALREADY_CANCELED_PAYMENT` 계열이면 "토스 결제 상태 동기화"로 맞춰집니다. 그 외(잔액 부족, 토스 장애)면 잠시 뒤 다시 시도하고, 계속 실패하면 상점관리자에서 직접 환불 후 "직접 처리"로 상태 변경.

### `checkout.captured_on_closed_order_refunded` / `_refund_failed` / `_manual` — 닫힌 주문에 뒤늦게 승인된 결제
- 뜻: 이미 취소·만료된 주문에 결제 승인이 뒤늦게 도착했습니다. 주문은 되살리지 않고 결제만 환불합니다.
- `_refunded`: 자동 환불 완료, 할 일 없음. 고객이 문의하면 "결제는 취소되었고 3~7영업일 내 환급"으로 안내.
- `_refund_failed` / `_manual`(가상계좌): 상점관리자에서 `paymentKey` 로 찾아 환불. 주문 상태는 이미 닫혀 있으므로 바꾸지 않습니다.

### `checkout.captured_amount_mismatch` — 승인 금액 불일치
- 뜻: 토스에서 승인된 금액이 주문 금액과 다릅니다. 주문은 확정하지 않았습니다.
- 사람이 할 일: 상점관리자에서 해당 결제를 전액 취소하고, 고객에게 다시 주문하도록 안내. 반복되면 개발자에게(결제위젯 금액 갱신 버그 가능성).

### `checkout.post_payment_side_effects_failed` / `checkout.cart_clear_failed` / `checkout.paid_update_missed` — 결제 후 부수 작업 실패
- 뜻: 결제와 주문 확정은 끝났지만 장바구니 비우기·쿠폰 사용 기록·재고 표시 같은 후속 작업 일부가 실패했습니다.
- 사람이 할 일: 주문 화면에서 상태가 `결제 완료` 인지 확인. 쿠폰이 걸린 주문이면 관리자 쿠폰 화면에서 사용 횟수가 맞는지 확인(사용 횟수는 실제 사용 행 수로 다시 계산되므로 대개 맞습니다). 재고가 어긋나 보이면 상품 화면에서 직접 조정.

### `order.stock_restore_failed` / `order.coupon_restore_failed` — 취소 시 재고·쿠폰 복원 실패
- 뜻: 취소는 됐지만 재고(또는 쿠폰 사용 기록) 복원이 실패했습니다.
- 사람이 할 일: 주문 화면의 **"재고 복원"** 버튼을 다시 누릅니다(이미 복원된 품목은 다시 늘지 않습니다). 쿠폰은 관리자 쿠폰 화면에서 사용 횟수를 확인합니다.

### `reconcile.paid_order_but_toss_not_done` / `reconcile.partial_cancel` / `reconcile.transition_failed` / `reconcile.failed` — 대사 불일치
- 뜻: 30분·일일 대사에서 DB 와 토스가 다릅니다. `paid_order_but_toss_not_done` 은 우리는 결제 완료인데 토스는 만료·중단, `partial_cancel` 은 토스에서 부분 취소가 일어남(우리 시스템은 부분 취소를 만들지 않으므로 상점관리자에서 누가 수동으로 한 것).
- 사람이 할 일: 상점관리자에서 실제 결제 상태를 확인하고 주문 화면에서 그에 맞게 상태를 바꿉니다(부분 취소는 "직접 처리"로 환불 처리 후 메모에 금액 기록). `reconcile.failed` 가 연속으로 나오면 `CRON_SECRET` 이나 토스 키 문제일 수 있으니 개발자에게.

### `reconcile.transactions_truncated` — 일일 대사 상한 초과
- 뜻: 하루 거래가 5,000건을 넘어 일부만 대조했습니다. 출시 초기에는 나올 일이 없습니다. 나오면 개발자에게(대사 구간을 나눠야 함).

### `cron.job_failed` / `cron.secret_missing` — cron 자체 실패
- `cron.secret_missing`: 운영 워커에 `CRON_SECRET` 이 없습니다. `echo -n "<임의의 긴 문자열>" | pnpm exec wrangler secret put CRON_SECRET --env production` 으로 넣으면 다음 실행부터 정상.
- `cron.job_failed`: `/api/internal/cron` 응답이 오류. 로그의 `body` 를 보고 개발자에게. 30분 cron 이 `cron.heartbeat` 를 남기지 않는 상태가 1시간 이상이면 Cloudflare 대시보드 Triggers 에서 cron 이 살아 있는지 확인.

### `toss_webhook.failed` / `toss_webhook.throttled` — 웹훅 처리 실패
- `failed`: 웹훅 본문의 주문을 토스에 다시 조회하다 실패. 같은 주문에 대해 30분 cron 이 다시 시도하므로 대개 저절로 맞춰집니다. 반복되면 상점관리자 웹훅 URL(`https://avoralabs.co/api/payments/toss/webhook`)이 맞는지 확인.
- `throttled`: 같은 주문 웹훅이 짧은 시간에 몰려 일부를 무시했습니다. 할 일 없음.

### `health.db_unavailable` — DB 장애
- 뜻: `/api/health` 가 D1 에 닿지 못했습니다(외형 모니터가 503 을 보게 됩니다).
- 사람이 할 일: Cloudflare 상태 페이지(D1)를 확인. 5분 넘게 계속되면 Cloudflare 지원 티켓. 이 동안 FAQ·정책 페이지는 열리고, 주문·로그인은 "잠시 후 다시 시도" 안내가 나갑니다.

### `admin.temp_password_issued` — 임시 비밀번호 발급 기록
- 뜻: 관리자가 회원에게 임시 비밀번호를 발급했습니다(감사 로그). 본인이 한 일이 아니면 즉시 관리자 비밀번호를 바꾸고(아래 2절) 다른 관리자 계정을 확인하세요.
- 임시 비밀번호는 **24시간**만 유효합니다. 그 안에 로그인하면 새 비밀번호를 정하는 화면(`/account/password`)으로 먼저 보내지고, 정하기 전까지 다른 계정 화면은 열리지 않습니다. 24시간이 지나면 로그인이 거부되고(이미 로그인돼 있던 세션도 끊김) 다시 발급해야 합니다.

## 2. 관리자 계정 잠금 대비

- 관리자 계정은 **2개**를 유지합니다(각자 다른 이메일·비밀번호 관리자). `/admin/users` 에서 역할이 `admin` 인 계정을 확인하세요.
- 한 계정을 잃었을 때: 다른 관리자로 로그인해 `/admin/users` 에서 임시 비밀번호를 발급합니다(한 번만 표시, 기존 세션 전부 해제). 복구하는 관리자는 24시간 안에 그 비밀번호로 로그인하면 `/account/password` 로 먼저 이동해 새 비밀번호를 정해야 `/admin` 이 열립니다 — 오류가 아니라 정상 흐름입니다.
- 둘 다 잃었을 때: `ADMIN_EMAIL`/`ADMIN_PASSWORD`(12자 이상) 를 넣고 `pnpm cf:seed:sql --reset-admin-password > data/seed.sql` → `pnpm exec wrangler d1 execute paros-store --remote --file=data/seed.sql`. 플래그 없이 실행하면 기존 관리자 비밀번호는 건드리지 않습니다.
- `/admin` 은 Cloudflare Access 뒤에 있습니다. Access 허용 이메일 목록에 두 관리자가 모두 있어야 합니다.

## 3. 배포·롤백

- 배포: `pnpm cf:deploy:prod` (빌드 중 `.env` 를 격리하고 번들에 비밀 값이 남으면 실패). 배포 직후 `https://avoralabs.co/api/health` 가 200 인지, `pnpm exec wrangler tail --env production` 에서 첫 `cron.heartbeat` 가 찍히는지 확인.
- 롤백: Cloudflare 대시보드 → Workers → `avora-labs` → Deployments → 이전 버전 **Rollback**. D1 스키마 마이그레이션은 되돌리지 않으므로, 마이그레이션이 포함된 배포는 롤백 전에 개발자와 상의.
- DB 복구: `docs/D1_BACKUP.md` 참고(일일 내보내기 + Time Travel).
