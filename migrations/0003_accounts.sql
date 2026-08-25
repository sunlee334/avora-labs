-- 회원 계정 (1단계: 로그인 + 주문내역 + 배송지 저장)
--
-- 비밀번호 컬럼이 없는 것은 의도입니다. 소셜 로그인만 쓰므로 이 서비스는
-- 비밀번호를 받지도, 보관하지도 않습니다. 유출될 비밀번호가 애초에 없습니다.
--
-- email 이 NULL 을 허용하는 것도 의도입니다. 카카오 문서에 따르면 이메일을
-- 필수 동의로 설정해도 사용자가 카카오계정에 이메일을 등록하지 않았으면
-- 값이 오지 않습니다. 이메일을 계정의 식별자로 삼으면 그런 사용자는
-- 로그인 자체가 안 됩니다. 식별자는 (provider, provider_user_id) 입니다.

CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  provider          TEXT NOT NULL,          -- 'kakao' | 'naver' | 'mock'
  provider_user_id  TEXT NOT NULL,          -- 제공자가 준 고유 id
  email             TEXT,                   -- 없을 수 있음
  name              TEXT,

  -- 마지막으로 쓴 배송지. 재구매 때 다시 입력하지 않게 하는 것이 목적이라
  -- 여러 개를 두지 않고 하나만 기억합니다.
  recipient_name    TEXT,
  recipient_phone   TEXT,                   -- 숫자만 저장 (normalizePhone)
  postal_code       TEXT,
  address1          TEXT,
  address2          TEXT,

  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  UNIQUE (provider, provider_user_id)
);

-- 세션.
--
-- 쿠키에는 원본 토큰을, 여기에는 그 해시를 저장합니다. DB 를 읽을 수 있게 된
-- 사람이 남의 세션을 그대로 쓰지 못하게 하기 위해서입니다.
--
-- 서명된 쿠키만 쓰는 방법도 있지만, 그러면 로그아웃과 강제 만료를 할 수
-- 없습니다. 배송지가 들어 있는 계정이라 취소할 수 있어야 합니다.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- 주문을 계정에 잇습니다. NULL 이면 비회원 주문입니다.
--
-- 비회원 주문은 앞으로도 계속 받습니다. 로그인을 강제하면 결제 직전에
-- 이탈합니다.
ALTER TABLE orders ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
