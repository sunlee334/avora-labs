-- 검증단 지원서.
--
-- ── 왜 launch_notify 와 나누는가 ────────────────────────────────────
-- 두 표는 성격이 다릅니다. launch_notify 는 "나중에 연락할 주소" 이고 이쪽은
-- "10월에 샘플을 보낼 사람" 입니다. 받는 항목도, 보유 기간도, 파기 시점도
-- 다릅니다 — 알림 명단은 출시까지 들고 가지만 지원서는 검증이 끝나고 3개월
-- 뒤에 파기합니다.
--
-- 한 표에 섞으면 명단을 뽑을 때마다 "지원자인가 알림인가" 를 가려야 하고,
-- 파기할 때 지워야 할 행과 남겨야 할 행이 한 표에 있게 됩니다.
--
-- ── 왜 실명을 강요하지 않는가 ──────────────────────────────────────
-- 러닝 크루에서는 닉네임으로 부르는 것이 보통입니다. 샘플을 보낼 때 필요한
-- 것은 "부를 이름" 이지 주민등록상 이름이 아닙니다. 배송 주소는 선정된 뒤에
-- 따로 받습니다 — 지원 단계에서 집 주소까지 받으면 이탈합니다.
--
-- ── 활동은 하나만 고릅니다 ─────────────────────────────────────────
-- launch_notify.activities 는 여러 개를 고를 수 있지만(관심사 파악),
-- 여기서는 하나입니다. "주로 하는 것" 을 알아야 그 종목에 맞는 평가를
-- 부탁할 수 있고, 셋을 고른 사람은 어느 쪽으로도 배정하기 어렵습니다.
--
-- ── 동의를 시각으로 남깁니다 ───────────────────────────────────────
-- launch_notify.consented_at 과 같은 이유입니다. "동의했다" 만 남기면 언제
-- 받았는지 증명할 수 없습니다. 개인정보 수집·이용 동의는 필수라 NOT NULL,
-- 광고성 정보 수신 동의는 선택이라 NULL 을 허용합니다.

CREATE TABLE IF NOT EXISTS panel_applications (
  id            TEXT PRIMARY KEY,   -- PANEL-20261001120000-A1B2C3

  -- 이름 또는 닉네임. 실명이 아니어도 됩니다.
  name          TEXT NOT NULL,

  -- 소문자로 정규화해서 넣습니다. 같은 사람이 두 번 지원하면 나중 것이
  -- 앞의 것을 덮습니다 — 마음이 바뀌어 다시 낸 것이라고 보는 편이 맞습니다.
  email         TEXT NOT NULL UNIQUE,

  -- running | hiking | golf | water | gym | other
  -- 값의 정의처는 worker/panel.ts 의 ACTIVITIES 입니다.
  activity      TEXT NOT NULL,

  -- weekly_1 | weekly_2_3 | weekly_4_plus
  frequency     TEXT NOT NULL,

  -- 시·도 단위. 샘플 발송 권역을 가늠하는 데만 씁니다.
  region        TEXT NOT NULL,

  -- 어느 언어 화면에서 지원했는가.
  locale        TEXT NOT NULL,

  created_at    TEXT NOT NULL,

  -- 개인정보 수집·이용 동의(필수). 없는 행은 존재할 수 없습니다.
  consented_at  TEXT NOT NULL,

  -- 광고성 정보 수신 동의(선택). NULL 이 미동의입니다.
  marketing_at  TEXT
);

-- 접수 순서대로 보는 것이 기본 조회입니다.
CREATE INDEX IF NOT EXISTS idx_panel_applications_created
  ON panel_applications (created_at DESC);

-- 종목별로 몇 명이 모였는지 세는 것이 모집 기간의 주 관심사입니다.
CREATE INDEX IF NOT EXISTS idx_panel_applications_activity
  ON panel_applications (activity, created_at DESC);
