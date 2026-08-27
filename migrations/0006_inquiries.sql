-- 문의.
--
-- 공개 게시판이 아닙니다. 본인과 관리자만 봅니다.
--
-- 공개로 두면 답이 달릴 때까지 미답변 글이 모두에게 보입니다. 혼자 운영하는
-- 가게에서 그것은 "관리되지 않는 곳" 이라는 신호가 되고, 라운드랩도 CS팀이
-- 있는데도 결국 게시판을 접고 카카오채널로 옮겼습니다.
--
-- ── 소유가 두 갈래입니다 ────────────────────────────────────
-- 로그인한 사람은 user_id 로, 주문만 한 사람은 order_id + 연락처로 자기
-- 문의를 찾습니다. 둘 다 없는 행은 **아무도 조회할 수 없는 유령**이 되므로
-- CHECK 로 막습니다.
--
-- 저장소에 CHECK 선례가 없는 것은 필요가 없었기 때문입니다 — 0001~0005 에는
-- "두 컬럼 중 하나는 반드시" 라는 불변식 자체가 없었습니다. 유령 행은 예외를
-- 던지지 않고 손님은 답을 못 받습니다. 조용한 실패라 데이터베이스가 막습니다.
--
-- ⚠️ 경로가 셋으로 늘면 SQLite 는 ALTER TABLE 로 CHECK 를 못 고칩니다.
--    그때는 0005_identities.sql 의 테이블 재구축 패턴을 씁니다.

CREATE TABLE IF NOT EXISTS inquiries (
  id             TEXT PRIMARY KEY,   -- INQUIRY-20260827120000-A1B2C3

  -- 로그인한 사람이면 채웁니다. 주문 경로로 남겨도 알 수 있으면 함께 채웁니다.
  user_id        TEXT,
  -- 주문에 대한 문의면 채웁니다. 구매 전 질문이면 비어 있습니다.
  order_id       TEXT,
  -- 주문 경로의 조회 열쇠. 정규화해서 넣습니다(숫자만).
  contact_phone  TEXT,

  subject        TEXT NOT NULL,
  body           TEXT NOT NULL,
  locale         TEXT NOT NULL,      -- 어느 언어 화면에서 썼는가

  status         TEXT NOT NULL DEFAULT 'open',  -- open | answered

  answer_body    TEXT,
  answered_at    TEXT,
  -- 누가 답했는지. Cloudflare Access 가 확인한 이메일입니다.
  answered_by    TEXT,

  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,

  -- 아무도 조회할 수 없는 행을 만들지 않습니다.
  CHECK (user_id IS NOT NULL OR order_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_inquiries_user    ON inquiries(user_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_order   ON inquiries(order_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_status  ON inquiries(status);
CREATE INDEX IF NOT EXISTS idx_inquiries_created ON inquiries(created_at DESC);
