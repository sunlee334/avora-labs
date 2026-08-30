-- 검증단 지원자의 수신 거부 경로.
--
-- ── 왜 뒤늦게 붙이는가 ──────────────────────────────────────────────
-- 0009 를 만들 때 빠뜨렸습니다. 지원 폼의 광고성 정보 수신 동의 문구는
-- "보내는 메일의 링크로 언제든 해지할 수 있습니다" 라고 약속하는데, 그 링크에
-- 넣을 토큰도 해지했다는 사실을 적을 자리도 없었습니다. 지킬 수 없는 고지가
-- 화면에 남아 있는 상태였습니다.
--
-- 「정보통신망법」 제50조 4항은 광고성 정보에 수신거부 방법을 명시하고 그
-- 수단을 제공할 것을 요구합니다. 아직 한 통도 보내지 않았고 표가 비어 있는
-- 지금이 가장 싼 시점입니다 — 행이 쌓인 뒤에는 NOT NULL UNIQUE 열을 붙이려면
-- 표를 다시 만들고 값을 채워 넣어야 합니다.
--
-- ── 왜 NULL 을 허용하는가 ──────────────────────────────────────────
-- launch_notify.unsubscribe_token 은 NOT NULL 인데 이쪽은 아닙니다. SQLite 의
-- ALTER TABLE ADD COLUMN 은 기본값 없는 NOT NULL 을 붙일 수 없습니다.
-- 지금은 행이 0이라 실질적 차이가 없고, 코드(worker/panel.ts 의 apply)가 항상
-- 토큰을 발급합니다. 값이 없는 행은 해지 링크를 못 만들 뿐 다른 문제는
-- 일으키지 않습니다.
ALTER TABLE panel_applications ADD COLUMN unsubscribe_token TEXT;

-- 지운 것이 아니라 내린 것입니다. 지우면 같은 사람이 다시 지원했을 때
-- "예전에 거부한 사람" 인지 알 수 없고, 그건 다시 보내면 안 되는 사람에게
-- 보내는 사고로 이어집니다. launch_notify 와 같은 방식입니다.
ALTER TABLE panel_applications ADD COLUMN unsubscribed_at TEXT;

-- 토큰으로 한 행을 찾는 것이 이 열의 유일한 용도입니다.
CREATE UNIQUE INDEX IF NOT EXISTS idx_panel_applications_token
  ON panel_applications (unsubscribe_token);
