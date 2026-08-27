-- 사람과 로그인 수단을 분리합니다.
--
-- ── 왜 ─────────────────────────────────────────────────────
-- 지금까지는 users 한 테이블에 사람과 로그인 수단이 함께 있었습니다.
--   users(id, provider, provider_user_id, …)  UNIQUE(provider, provider_user_id)
--
-- 이 구조로는 **한 사람이 로그인 수단을 두 개 가질 수 없습니다.** 구글로 한 번,
-- 카카오로 한 번 들어오면 서로 다른 사람이 되고, 한쪽에서 주문한 내역이
-- 다른 쪽에서 보이지 않습니다.
--
-- ── 지금 바꾸는 이유 ────────────────────────────────────────
-- 운영 사용자가 0명입니다(회원 기능이 꺼져 있습니다). 사용자가 생긴 뒤에
-- 이 작업을 하면 훨씬 비싸고 위험해집니다.
--
-- ── 세션은 비워집니다 ───────────────────────────────────────
-- sessions 는 users(id) 를 ON DELETE CASCADE 로 참조합니다. D1 문서에 따르면
-- defer_foreign_keys 로도 CASCADE 동작은 멈추지 않으므로, users 를 다시
-- 만드는 동안 세션이 함께 지워집니다. 로그인해 있던 사람은 다시 로그인해야
-- 하는데, 지금은 그런 사람이 없습니다.

PRAGMA defer_foreign_keys = on;

-- 로그인 수단. 한 사람이 여러 개를 가질 수 있습니다.
CREATE TABLE IF NOT EXISTS identities (
  provider          TEXT NOT NULL,     -- 'google' | 'kakao' | 'naver' | 'mock'
  provider_user_id  TEXT NOT NULL,     -- 제공자가 준 고유 id
  user_id           TEXT NOT NULL,
  -- 이 수단으로 받은 이메일. 사람의 대표 이메일(users.email)과 다를 수 있어
  -- 따로 둡니다 — 어느 계정으로 연결했는지 화면에 보여주는 데 씁니다.
  email             TEXT,
  created_at        TEXT NOT NULL,
  PRIMARY KEY (provider, provider_user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_identities_user ON identities(user_id);

-- 기존 사용자의 로그인 수단을 옮깁니다.
INSERT OR IGNORE INTO identities (provider, provider_user_id, user_id, email, created_at)
  SELECT provider, provider_user_id, id, email, created_at FROM users;

-- users 에서 로그인 수단 컬럼을 걷어냅니다.
-- SQLite 는 UNIQUE 제약이 걸린 컬럼을 DROP COLUMN 으로 지울 수 없어,
-- 표준 절차대로 새 테이블을 만들어 옮깁니다.
CREATE TABLE users_rebuilt (
  id                TEXT PRIMARY KEY,
  email             TEXT,              -- 대표 이메일. 없을 수 있습니다
  name              TEXT,

  -- 마지막으로 쓴 배송지. 재구매 때 다시 입력하지 않게 하는 것이 목적이라
  -- 여러 개를 두지 않고 하나만 기억합니다.
  recipient_name    TEXT,
  recipient_phone   TEXT,              -- 숫자만 저장 (normalizePhone)
  postal_code       TEXT,
  address1          TEXT,
  address2          TEXT,

  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

INSERT INTO users_rebuilt
  SELECT id, email, name, recipient_name, recipient_phone,
         postal_code, address1, address2, created_at, updated_at
  FROM users;

DROP TABLE users;
ALTER TABLE users_rebuilt RENAME TO users;

PRAGMA defer_foreign_keys = off;
