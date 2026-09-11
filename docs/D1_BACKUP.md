# D1 백업과 복구

운영 DB 는 Cloudflare D1 `paros-store` 하나입니다. 두 겹으로 지킵니다.

1. **Time Travel(기본 제공)** — D1 은 최근 30일 안의 어느 시점(분 단위)으로든 되돌릴 수 있습니다. 잘못된 관리자 작업·마이그레이션 사고의 1차 복구 수단.
2. **일일 내보내기(GitHub Actions)** — `.github/workflows/d1-backup.yml` 이 매일 03:30 KST 에 `wrangler d1 export --remote` 로 전체 SQL 을 받아 아티팩트로 90일 보관합니다. Time Travel 창(30일)을 넘긴 복구, 계정 사고, 로컬 재현용.

## 설정 (한 번만)

GitHub 저장소 → Settings → Secrets and variables → Actions:

| 시크릿 | 값 |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 대시보드 우측 Account ID |
| `CLOUDFLARE_API_TOKEN` | My Profile → API Tokens → Create Token → 권한 **Account · D1 · Edit** 만 (Workers 배포 권한은 주지 않음) |

설정 후 Actions 탭에서 `D1 backup` 을 `Run workflow` 로 한 번 수동 실행해 아티팩트가 생기는지 확인합니다.

## 복구 절차

### A. 최근 30일 안 — Time Travel

```bash
# 1) 되돌릴 시점의 북마크 확인 (UTC)
pnpm exec wrangler d1 time-travel info paros-store --timestamp=2026-09-10T17:00:00Z
# 2) 복구 (되돌리기 전 현재 상태도 북마크로 남는다 — 출력의 bookmark 값을 기록해 둘 것)
pnpm exec wrangler d1 time-travel restore paros-store --timestamp=2026-09-10T17:00:00Z
```

- 복구 중에는 주문·결제가 들어오지 않게 먼저 Cloudflare 대시보드에서 토스 결제위젯 키를 잠깐 비우거나(재배포 필요) 짧은 점검 공지를 띄웁니다. 실제로는 몇 초 안에 끝납니다.
- 복구 뒤 **토스와 DB 를 다시 맞춥니다**: 30분 cron 이 자동으로 대사하지만, 되돌린 구간에 결제가 있었다면 관리자 주문 화면 "토스 결제 상태 동기화" 로 즉시 확인하세요. `reconcile.*` 알림이 나오면 `docs/RUNBOOK.md` 대로 처리합니다.

### B. 내보내기 파일에서 복구

```bash
# 1) Actions 아티팩트 다운로드 후 압축 해제
gunzip paros-store-20260910T183000Z.sql.gz
# 2) 새 D1 에 복구해 먼저 확인 (운영 DB 를 바로 덮어쓰지 않는다)
pnpm exec wrangler d1 create paros-store-restore
pnpm exec wrangler d1 execute paros-store-restore --remote --file=paros-store-20260910T183000Z.sql
# 3) 내용을 확인한 뒤 wrangler.jsonc 의 database_id 를 바꿔 배포하거나, 운영 DB 를 비우고 같은 파일을 실행
```

- 내보내기 SQL 은 스키마 + 데이터 전체입니다. 운영 DB 에 직접 실행하려면 먼저 `DROP TABLE` 이 필요하므로, 안전하게는 새 DB 에 복구한 뒤 바인딩을 바꾸는 쪽을 권합니다.
- 복구 시점 이후의 주문은 사라집니다. 토스 상점관리자의 거래 내역으로 누락 주문을 확인하고, 일일 대사(`runDailyReconcileJob`)를 수동으로 돌리려면 `curl -H "authorization: Bearer $CRON_SECRET" "https://avoralabs.co/api/internal/cron?job=daily"`.

## 리허설 기록

복구를 실제로 한 번 연습하고 아래에 남겨 두세요 (분기마다 권장).

| 날짜 | 방식 | 걸린 시간 | 메모 |
|---|---|---|---|
| (미실시) | Time Travel → 프리뷰 D1 | | 프리뷰 전용 D1(t29)이 생기면 그쪽에서 연습 |
