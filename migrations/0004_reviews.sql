-- 구매 후기.
--
-- 자격은 주문이 정합니다. 리뷰 한 건은 주문 한 건에 묶이고(UNIQUE), 그 주문이
-- 결제 완료여야 쓸 수 있습니다. 그래서 "구매 확인" 표시가 장식이 아니라 사실입니다.
--
-- author_name 을 따로 두는 이유: 주문의 수령인 이름을 그대로 쓰면 리뷰를 지웠을 때
-- 주문 기록까지 건드려야 합니다. 화면에는 마스킹해서 나갑니다(김*수).

CREATE TABLE IF NOT EXISTS reviews (
  id            TEXT PRIMARY KEY,   -- REVIEW-20260826120000-A1B2C3
  order_id      TEXT NOT NULL,      -- 어떤 구매에 대한 후기인가
  rating        INTEGER NOT NULL,   -- 1~5
  body          TEXT NOT NULL,
  author_name   TEXT NOT NULL,      -- 주문 시 수령인 이름을 복사해 둡니다
  locale        TEXT NOT NULL,      -- 어느 언어 화면에서 썼는가

  -- 대가를 받고 쓴 후기(체험단·무상 제공)는 표시할 의무가 있습니다.
  -- 표시 없이 노출하면 부당한 표시·광고가 됩니다.
  sponsored     INTEGER NOT NULL DEFAULT 0,

  status        TEXT NOT NULL DEFAULT 'visible',  -- visible | hidden

  -- 왜 숨겼는지 반드시 남깁니다.
  -- 기준 없이 지운 기록이 없으면, 부정적 리뷰만 골라 지웠는지 아닌지를
  -- 나중에 아무도 증명할 수 없습니다.
  hidden_reason TEXT,

  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- 주문 하나에 리뷰 하나. 같은 구매로 여러 번 쓰는 것을 데이터베이스가 막습니다.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_order   ON reviews(order_id);
CREATE INDEX        IF NOT EXISTS idx_reviews_created ON reviews(created_at DESC);
CREATE INDEX        IF NOT EXISTS idx_reviews_status  ON reviews(status);
