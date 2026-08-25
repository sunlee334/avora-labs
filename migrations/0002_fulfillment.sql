-- 배송 상태
--
-- 결제 상태(status)와 배송 상태를 한 칸에 섞으면 "결제는 됐고 아직 발송 전" 같은
-- 실제 상황을 표현할 수 없습니다. 두 축을 따로 둡니다.
--
--   status:      pending | paid | failed | cancelled        (결제)
--   fulfillment: unfulfilled | preparing | shipped | delivered | returned  (배송)

ALTER TABLE orders ADD COLUMN fulfillment TEXT NOT NULL DEFAULT 'unfulfilled';
ALTER TABLE orders ADD COLUMN carrier TEXT;
ALTER TABLE orders ADD COLUMN tracking_number TEXT;
ALTER TABLE orders ADD COLUMN shipped_at TEXT;
ALTER TABLE orders ADD COLUMN admin_memo TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_fulfillment ON orders(fulfillment);
