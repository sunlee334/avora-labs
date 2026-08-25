-- 주문 테이블
--
-- 담는 것은 배송에 필요한 최소한입니다. 결제 수단 상세(카드번호 등)는
-- 우리가 받지도, 저장하지도 않습니다 — 그건 PG 결제창 안에서만 오갑니다.
--
-- amount 를 여기 저장하는 이유가 중요합니다. 승인 단계에서 클라이언트가 보낸
-- 금액을 그대로 믿으면 조작할 수 있으므로, 반드시 이 값과 대조한 뒤 승인합니다.

CREATE TABLE IF NOT EXISTS orders (
  id              TEXT PRIMARY KEY,   -- AVORA-20261025120000-A1B2C3
  status          TEXT NOT NULL,      -- pending | paid | failed | cancelled
  amount          INTEGER NOT NULL,   -- 최소 화폐 단위 (KRW 는 원)
  currency        TEXT NOT NULL,
  items           TEXT NOT NULL,      -- JSON: [{id, name, qty, unitPrice}]
  locale          TEXT NOT NULL,

  recipient_name  TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  postal_code     TEXT NOT NULL,
  address1        TEXT NOT NULL,
  address2        TEXT,
  memo            TEXT,
  email           TEXT,

  payment_key     TEXT,               -- PG 가 돌려준 거래 식별자
  payment_method  TEXT,
  paid_at         TEXT,

  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

-- 주문 조회(주문번호 + 연락처)와 관리자 목록 조회에 쓰입니다.
CREATE INDEX IF NOT EXISTS idx_orders_phone   ON orders(recipient_phone);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(status);
