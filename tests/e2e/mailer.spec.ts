import { test, expect } from '@playwright/test';
import {
  mailerConfigured,
  sendNotifyConfirmation,
  sendPanelConfirmation,
  type MailerEnv,
} from '../../worker/mailer';
import { BUSINESS } from '../../src/config/site';

/**
 * 확인 메일 발송.
 *
 * ── 왜 화면이 아니라 여기서 보는가 ──────────────────────────
 * 이 코드는 **운영 호스트에서만** 돕니다. 검사는 `wrangler dev` 로 도니까
 * 화면을 아무리 눌러도 한 통도 나가지 않습니다 — 그것이 이 설계의 요점이고,
 * 동시에 화면 검사로는 아무것도 증명할 수 없다는 뜻입니다.
 *
 * 그래서 함수를 직접 부르고 `fetch` 를 가로챕니다. 여기서 보는 것 셋입니다.
 *   1. 나가면 안 되는 자리에서 정말 안 나가는가 (가장 중요)
 *   2. 나갈 때 Resend 가 받는 모양이 맞는가
 *   3. 회신 주소가 붙는가 — 본문이 "회신해 주세요" 라고 말하므로
 */

interface Sent {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** fetch 를 가로채고, 그동안 나간 요청을 모읍니다. */
function intercept() {
  const sent: Sent[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({
      url: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: JSON.parse(String(init?.body ?? '{}')),
    });
    return new Response('{"id":"stub"}', { status: 200 });
  }) as typeof fetch;
  return {
    sent,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

/** waitUntil 로 붙은 일이 끝날 때까지 기다립니다. */
function fakeCtx() {
  const pending: Promise<unknown>[] = [];
  return {
    ctx: { waitUntil: (p: Promise<unknown>) => void pending.push(p) },
    settle: () => Promise.all(pending),
  };
}

const READY: MailerEnv = {
  RESEND_API_KEY: 're_test_key',
  MAIL_FROM: 'PAROS <hello@avoralabs.co>',
};

const PROD = () => new Request('https://avoralabs.co/api/launch-notify', { method: 'POST' });
const LOCAL = () => new Request('http://localhost:8788/api/launch-notify', { method: 'POST' });
const UNSUB = 'https://avoralabs.co/api/launch-notify/unsubscribe?t=TOKEN';

test.describe('확인 메일 발송', () => {
  test('설정 판정은 키와 보내는 주소를 둘 다 요구한다', () => {
    expect(mailerConfigured({})).toBe(false);
    expect(mailerConfigured({ RESEND_API_KEY: 'k' })).toBe(false);
    expect(mailerConfigured({ MAIL_FROM: 'a@b.co' })).toBe(false);
    expect(mailerConfigured(READY)).toBe(true);
  });

  test('검사·개발 호스트에서는 한 통도 나가지 않는다', async () => {
    /*
     * 이 검사가 이 파일에서 가장 중요합니다.
     *
     * `wrangler dev` 는 운영과 같은 설정 파일을 읽습니다. 누군가 `.dev.vars` 에
     * 키를 넣는 순간, 이 방어가 없으면 E2E 가 돌 때마다 실재하지 않는 주소로
     * 수백 통이 나갑니다. 반송률이 오르면 도메인 평판이 깎이고, 그때부터는
     * **진짜 손님의 확인 메일이 스팸함으로** 갑니다.
     *
     * 그래서 키가 있는 상태(READY)로 시험합니다 — 키가 없어서 안 나가는 것은
     * 아무것도 증명하지 못합니다.
     */
    const net = intercept();
    const { ctx, settle } = fakeCtx();
    try {
      sendNotifyConfirmation(READY, ctx, LOCAL(), {
        to: 'a@b.com', locale: 'ko', unsubscribeUrl: UNSUB,
      });
      sendPanelConfirmation(READY, ctx, LOCAL(), { to: 'a@b.com', locale: 'ko' });
      await settle();
      expect(net.sent, `검사 호스트에서 나간 요청: ${net.sent.map((s) => s.url).join(', ')}`)
        .toEqual([]);
    } finally {
      net.restore();
    }
  });

  test('키가 없으면 운영 호스트에서도 나가지 않는다', async () => {
    const net = intercept();
    const { ctx, settle } = fakeCtx();
    try {
      sendNotifyConfirmation({ MAIL_FROM: READY.MAIL_FROM }, ctx, PROD(), {
        to: 'a@b.com', locale: 'ko', unsubscribeUrl: UNSUB,
      });
      await settle();
      expect(net.sent).toEqual([]);
    } finally {
      net.restore();
    }
  });

  test('운영에서는 Resend 가 받는 모양으로 나간다', async () => {
    const net = intercept();
    const { ctx, settle } = fakeCtx();
    try {
      sendNotifyConfirmation(READY, ctx, PROD(), {
        to: 'runner@example.com', locale: 'ko', unsubscribeUrl: UNSUB,
      });
      await settle();

      expect(net.sent).toHaveLength(1);
      const [call] = net.sent;
      expect(call.url).toBe('https://api.resend.com/emails');
      expect(call.headers.Authorization).toBe(`Bearer ${READY.RESEND_API_KEY}`);
      // 응답을 못 받고 재시도가 들어와도 두 번 보내지 않게 합니다.
      expect(call.headers['Idempotency-Key'], '멱등 키가 없습니다').toBeTruthy();

      expect(call.body.from).toBe(READY.MAIL_FROM);
      // Resend 는 받는 사람을 배열로 받습니다.
      expect(call.body.to).toEqual(['runner@example.com']);
      expect(String(call.body.subject).length).toBeGreaterThan(0);
      expect(String(call.body.text)).toContain(UNSUB);
    } finally {
      net.restore();
    }
  });

  test('회신 주소가 사람이 읽는 주소다', async () => {
    /*
     * 검증단 확인 메일 본문이 5개 언어에서 "이 메일에 회신해 주세요" 라고
     * 말합니다. reply_to 가 없으면 그 회신은 Resend 의 발송 전용 주소로 가고
     * 아무도 읽지 않습니다 — 문구가 거짓말이 됩니다.
     */
    const net = intercept();
    const { ctx, settle } = fakeCtx();
    try {
      sendPanelConfirmation(READY, ctx, PROD(), { to: 'a@b.com', locale: 'ko' });
      await settle();
      expect(net.sent).toHaveLength(1);
      expect(net.sent[0].body.reply_to).toBe(BUSINESS.email);
    } finally {
      net.restore();
    }
  });

  test('모르는 언어로 신청해도 메일은 나간다', async () => {
    /*
     * `locale` 은 손님이 보내는 값이고 저장할 때 8자로 자르기만 합니다.
     * 목록에 없는 값이 들어와도 사전을 찾다 터지면 안 됩니다.
     */
    const net = intercept();
    const { ctx, settle } = fakeCtx();
    try {
      sendNotifyConfirmation(READY, ctx, PROD(), {
        to: 'a@b.com', locale: 'fr-CA', unsubscribeUrl: UNSUB,
      });
      await settle();
      expect(net.sent).toHaveLength(1);
      expect(String(net.sent[0].body.text).length).toBeGreaterThan(0);
    } finally {
      net.restore();
    }
  });

  test('언어마다 그 언어로 나간다', async () => {
    const net = intercept();
    const { ctx, settle } = fakeCtx();
    try {
      for (const locale of ['ko', 'en', 'th']) {
        sendNotifyConfirmation(READY, ctx, PROD(), {
          to: 'a@b.com', locale, unsubscribeUrl: UNSUB,
        });
      }
      await settle();
      const subjects = net.sent.map((s) => String(s.body.subject));
      expect(new Set(subjects).size, `제목이 겹칩니다: ${subjects.join(' | ')}`).toBe(3);
    } finally {
      net.restore();
    }
  });
});
