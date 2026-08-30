/**
 * 검증단 지원.
 *
 * 2026년 10월 러닝 크루에 링크를 던졌을 때 **그 자리에서 지원이 완결되어야**
 * 합니다. 홈의 알림 폼은 "출시하면 알려 주세요" 이지 "저를 뽑아 주세요" 가
 * 아니라, 크루 단톡방에 걸 링크로는 쓸 수 없습니다.
 *
 * 표 구조와 "왜 알림 명단과 나누는가" 는 migrations/0009_panel_applications.sql
 * 에 적혀 있습니다.
 */
import { normalizeEmail } from './launch-notify';

const ALPHABET = 'ABCDEFGHIJKLMNPQRSTUVWXYZ23456789';

/**
 * 고를 수 있는 활동. **이 배열이 정의처입니다.**
 *
 * launch_notify 의 ACTIVITIES 와 값이 같습니다. 같은 사람이 알림도 신청하고
 * 지원도 했을 때 두 자료를 같은 기준으로 볼 수 있어야 하기 때문입니다.
 * 다만 이쪽은 **하나만** 고릅니다 — 셋을 고른 사람은 어느 종목으로도
 * 배정하기 어렵습니다.
 */
export const PANEL_ACTIVITIES = ['running', 'hiking', 'golf', 'water', 'gym', 'other'] as const;
export type PanelActivity = (typeof PANEL_ACTIVITIES)[number];

/** 얼마나 자주 하는가. 샘플을 며칠 안에 다 써 볼 수 있는지를 가늠합니다. */
export const FREQUENCIES = ['weekly_1', 'weekly_2_3', 'weekly_4_plus'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

/**
 * 거주 지역 — 시·도 단위까지만.
 *
 * 샘플 발송 권역을 가늠하는 것이 유일한 용도입니다. 상세 주소는 선정된 뒤에
 * 따로 받습니다 — 지원 단계에서 집 주소까지 받으면 이탈하고, 뽑히지 않은
 * 사람의 주소를 들고 있을 이유도 없습니다.
 */
export const REGIONS = [
  'seoul', 'busan', 'daegu', 'incheon', 'gwangju', 'daejeon', 'ulsan', 'sejong',
  'gyeonggi', 'gangwon', 'chungbuk', 'chungnam', 'jeonbuk', 'jeonnam',
  'gyeongbuk', 'gyeongnam', 'jeju', 'overseas',
] as const;
export type Region = (typeof REGIONS)[number];

export interface PanelApplication {
  name: string;
  email: string;
  activity: PanelActivity;
  frequency: Frequency;
  region: Region;
  locale: string;
  /** 광고성 정보 수신 동의. 선택 항목이라 없을 수 있습니다. */
  marketing: boolean;
}

function newId(now: Date): string {
  const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  let suffix = '';
  for (const byte of crypto.getRandomValues(new Uint8Array(6))) {
    suffix += ALPHABET[byte % ALPHABET.length];
  }
  return `PANEL-${stamp}-${suffix}`;
}

/**
 * 수신 거부 링크에 붙는 토큰.
 *
 * 이메일 주소를 링크에 그대로 실으면 그 주소가 로그·리퍼러·브라우저 기록에
 * 남고, 남의 주소를 넣어 남을 해지시킬 수도 있습니다. `launch_notify` 와
 * 같은 방식입니다.
 */
function newToken(): string {
  let out = '';
  for (const byte of crypto.getRandomValues(new Uint8Array(24))) {
    out += ALPHABET[byte % ALPHABET.length];
  }
  return out;
}

/**
 * 이름 또는 닉네임.
 *
 * 실명을 요구하지 않습니다. 러닝 크루에서는 닉네임으로 부르는 것이 보통이고,
 * 샘플을 보낼 때 필요한 것은 "부를 이름" 입니다.
 *
 * 길이만 봅니다. 어떤 글자가 이름이 될 수 있는지는 언어마다 다르고, 그걸
 * 코드가 정하려 들면 반드시 누군가의 이름을 거부합니다.
 */
export function normalizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length < 1 || name.length > 40) return null;
  return name;
}

/** 목록에 있는 값인지. 없으면 null 이고, 호출부가 400 으로 돌려줍니다. */
function pick<T extends readonly string[]>(list: T, raw: unknown): T[number] | null {
  return typeof raw === 'string' && (list as readonly string[]).includes(raw)
    ? (raw as T[number])
    : null;
}

export function normalizeActivity(raw: unknown) {
  return pick(PANEL_ACTIVITIES, raw);
}
export function normalizeFrequency(raw: unknown) {
  return pick(FREQUENCIES, raw);
}
export function normalizeRegion(raw: unknown) {
  return pick(REGIONS, raw);
}

/**
 * 지원서를 받습니다.
 *
 * 같은 주소로 다시 내면 **나중 것이 앞의 것을 덮습니다.** 마음이 바뀌어 다시
 * 낸 것이라고 보는 편이 맞고, 두 행을 남기면 한 사람에게 샘플을 두 번 보내는
 * 사고로 이어집니다.
 *
 * ── 왜 한 문장인가 ─────────────────────────────────────────
 * 처음에는 UPDATE 를 치고 바뀐 행이 없으면 INSERT 했습니다. 그 사이에 같은
 * 주소의 두 번째 요청이 끼어들면 **둘 다 INSERT 로 내려가** 늦은 쪽이
 * `UNIQUE constraint failed` 로 터집니다. 그러면 지원서는 저장됐는데 지원자
 * 화면에는 "접수되지 않았습니다" 가 뜹니다. 느린 회선에서 제출 버튼을 두 번
 * 누르면 만들어지는 상황이라 드물지 않습니다.
 *
 * `ON CONFLICT` 는 한 문장이라 그 틈이 없습니다. `worker/launch-notify.ts` 의
 * `signup()` 이 이미 같은 방식을 씁니다.
 *
 * 동의 시각(`consented_at`)은 덮어씁니다 — 다시 낼 때도 동의를 다시 받으므로
 * 마지막 동의 시각이 유효한 값입니다.
 */
export async function apply(
  db: D1Database,
  a: PanelApplication,
  now: Date,
): Promise<void> {
  const iso = now.toISOString();
  const marketingAt = a.marketing ? iso : null;

  await db
    .prepare(
      `INSERT INTO panel_applications
         (id, name, email, activity, frequency, region, locale,
          created_at, consented_at, marketing_at, unsubscribe_token)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         name = excluded.name,
         activity = excluded.activity,
         frequency = excluded.frequency,
         region = excluded.region,
         locale = excluded.locale,
         consented_at = excluded.consented_at,
         marketing_at = excluded.marketing_at,
         -- 다시 지원했다는 것은 받겠다는 뜻입니다. 예전에 해지했더라도 되살립니다.
         unsubscribed_at = NULL`,
    )
    .bind(
      newId(now), a.name, a.email, a.activity, a.frequency, a.region, a.locale,
      iso, iso, marketingAt, newToken(),
    )
    .run();
}

/**
 * 수신 거부.
 *
 * 없는 토큰이어도 성공처럼 응답합니다 — 토큰을 찍어 보며 어떤 것이 살아
 * 있는지 알아낼 이유를 없앱니다. `launch_notify` 의 unsubscribe 와 같습니다.
 *
 * 행을 지우지 않고 시각만 남깁니다. 지우면 같은 사람이 다시 지원했을 때
 * "예전에 거부한 사람" 인지 알 수 없고, 그건 다시 보내면 안 되는 사람에게
 * 보내는 사고로 이어집니다.
 */
export async function unsubscribe(db: D1Database, token: string, now: Date): Promise<void> {
  await db
    .prepare(
      `UPDATE panel_applications
          SET unsubscribed_at = ?, marketing_at = NULL
        WHERE unsubscribe_token = ? AND unsubscribed_at IS NULL`,
    )
    .bind(now.toISOString(), token)
    .run();
}

/**
 * 관리 화면용 목록.
 *
 * 이메일은 **그대로** 돌려줍니다. 이 API 는 관리자 인증 뒤에만 열리고,
 * 선정 연락을 하려면 주소가 필요합니다.
 */
export async function listApplications(
  db: D1Database,
  { limit, offset, activity }: { limit: number; offset: number; activity?: string },
) {
  const where = activity ? 'WHERE activity = ?' : '';
  const args = activity ? [activity] : [];
  const { results } = await db
    .prepare(
      `SELECT id, name, email, activity, frequency, region, locale,
              created_at, consented_at, marketing_at, unsubscribed_at
         FROM panel_applications ${where}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?`,
    )
    .bind(...args, limit, offset)
    .all<Record<string, unknown>>();

  return (results ?? []).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    email: String(r.email),
    activity: String(r.activity),
    frequency: String(r.frequency),
    region: String(r.region),
    locale: String(r.locale),
    createdAt: String(r.created_at),
    consentedAt: String(r.consented_at),
    marketingAt: r.marketing_at ? String(r.marketing_at) : null,
    unsubscribedAt: r.unsubscribed_at ? String(r.unsubscribed_at) : null,
  }));
}

/** 종목별로 몇 명이 모였는가. 모집 기간의 주 관심사입니다. */
export async function countByActivity(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT activity, COUNT(*) AS n FROM panel_applications GROUP BY activity`,
    )
    .all<{ activity: string; n: number }>();
  return results ?? [];
}

export { normalizeEmail };
