import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import th from '../../../src/i18n/th.json' with { type: 'json' };
import ko from '../../../src/i18n/ko.json' with { type: 'json' };
import paymentConfig from '../../../src/config/payment-config.json' with { type: 'json' };
import { TOSS_ORDER_ID, ORDER_NAME_MAX } from '../../../src/lib/toss';

/**
 * 주문서형 결제위젯.
 *
 * 체크아웃은 오랫동안 주문만 만들고 완료 화면으로 직행했습니다 —
 * "PG 가 아직 정해지지 않아 SDK 를 붙이지 않았습니다. 여기가 그 자리" 라는
 * 주석이 그 자리를 표시하고 있었습니다.
 *
 * ── 왜 진짜 SDK 를 부르지 않는가 ────────────────────────────
 * 실제 위젯을 띄우면 검사가 외부 서비스에 의존하고, 토스 iframe 안은 우리가
 * 볼 수도 없습니다. 대신 **SDK 가 노출하는 모양 그대로** 를 흉내 내는 대역을
 * 심고 **우리가 무엇을 넘기는지** 를 봅니다.
 *
 * 그 모양은 문서가 아니라 **실물 번들** 에서 확인했습니다
 * (`js.tosspayments.com/v2/standard`) — 문서 페이지가 SPA 라 코드가 제대로
 * 나오지 않고 일부는 v1 형태를 섞어 보여 줍니다:
 *
 *   window.TossPayments · ANONYMOUS="@@ANONYMOUS"
 *   widgets({customerKey}) · setAmount({currency,value})
 *   renderPaymentMethods({selector,variantKey}) · renderAgreement({…})
 *
 * ⚠️ 대역이 `ANONYMOUS` 값을 **스스로 정하면** 그 단언은 순환입니다. 그래서
 * 그 상수만은 대역이 정하지 않고 아래 `SDK_ANONYMOUS` 로 못 박아, 실물
 * 번들에서 읽은 값과 같은지를 확인합니다.
 */

/** 실물 번들에서 읽은 값. 대역이 정하는 값이 아닙니다. */
const SDK_ANONYMOUS = '@@ANONYMOUS';

/**
 * 검사가 화면에 심을 클라이언트 키.
 *
 * 검사 빌드는 **키 없이** 만들어집니다(`playwright.config.ts` 가
 * `PUBLIC_TOSS_CLIENT_KEY=off` 를 넘깁니다). 설정 파일의 테스트 키를 그대로
 * 실으면 체크아웃 검사들이 **실제 토스 SDK 를 부르게** 되어 외부 서비스에
 * 매달리고, 위젯이 뜨느라 완료 화면으로 넘어가지 않습니다.
 *
 * 그래서 이 파일만 키를 끼워 넣어 위젯 경로를 지나갑니다. 값은 설정 파일의
 * 것을 그대로 씁니다 — 지어낸 키를 쓰면 형식이 실제와 달라져도 모릅니다.
 */
const CONFIGURED_KEY = (
  paymentConfig.countries.KR as unknown as { provider: { clientKey: string } }
).provider.clientKey;

/**
 * 키를 **응답 HTML 에 끼워 넣습니다.**
 *
 * 브라우저 안에서 속성을 심는 방법은 졌습니다 — 위젯은 화면이 뜰 때 세워지고
 * 그 스크립트는 모듈(defer)이라, 속성을 붙이는 시점과 경쟁합니다. 응답을
 * 고치면 브라우저는 처음부터 그 속성이 있는 문서를 받습니다.
 *
 * ⚠️ **첫 항해 전에** 걸어야 합니다. 다른 화면을 거친 뒤에 걸었더니 체크아웃
 * 문서가 이미 캐시에 들어와 핸들러를 지나쳤습니다.
 */
async function serveWithKey(page: Page) {
  // 글로브가 아니라 술어입니다. 별표 두 개로 끝나는 체크아웃 글로브는
  // `/ko/checkout/` 를 **매치하지 않습니다** — 끝의 와일드카드 뒤에 남는
  // 것이 없기 때문입니다. 계측해 보니 핸들러가 0번 불렸고, 검사는 "키가 안
  // 넘어왔다" 로만 실패해 원인이 보이지 않았습니다.
  await page.route(
    (url) => url.pathname.endsWith('/checkout/') || url.pathname.endsWith('/checkout'),
    async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(
        /(<form[^>]*data-checkout)/,
        `$1 data-toss-client-key="${CONFIGURED_KEY}"`,
      );
      await route.fulfill({ response, body });
    },
  );
}

interface Recorded {
  clientKey: string;
  customerKey: string;
  amount: { currency: string; value: number } | null;
  methods: { selector: string; variantKey?: string } | null;
  agreement: { selector: string; variantKey?: string } | null;
  request: Record<string, unknown> | null;
}

/**
 * SDK 대역. 페이지 스크립트보다 먼저 돌아야 합니다.
 *
 * `mode` 로 세 갈래를 만듭니다 — 정상, 위젯을 못 세움(잘못된 키·미등록
 * 도메인), 결제 요청 거절.
 */
async function stubSdk(
  page: Page,
  mode: 'ok' | 'setup-fails' | 'setup-hangs' | 'request-rejects' = 'ok',
) {
  await page.addInitScript(
    ([behaviour, anonymous]) => {
      const rec: Record<string, unknown> = {
        clientKey: '',
        customerKey: '',
        amount: null,
        methods: null,
        agreement: null,
        request: null,
      };
      (window as unknown as Record<string, unknown>).__toss = rec;

      const TossPayments = ((clientKey: string) => ({
        widgets: ({ customerKey }: { customerKey: string }) => {
          rec.clientKey = clientKey;
          rec.customerKey = customerKey;
          return {
            setAmount: async (amount: unknown) => {
              rec.amount = amount;
              if (behaviour === 'setup-fails') {
                throw { code: 'INVALID_CLIENT_KEY', message: '클라이언트 키가 올바르지 않습니다.' };
              }
              /*
               * 끝나지 않는 마운트. 느린 회선에서 SDK 가 480KB 를 받는
               * 동안의 상태입니다 — 네트워크를 막으면 `load` 자체가 걸려
               * 항해가 타임아웃되므로, 화면은 정상으로 뜨고 위젯만 안
               * 서는 상태를 만듭니다.
               */
              if (behaviour === 'setup-hangs') await new Promise(() => {});
            },
            renderPaymentMethods: async (o: unknown) => {
              rec.methods = o;
            },
            renderAgreement: async (o: unknown) => {
              rec.agreement = o;
            },
            requestPayment: (req: unknown) => {
              rec.request = req;
              if (behaviour === 'request-rejects') {
                return Promise.reject({
                  code: 'NOT_ALLOWED_ORIGIN',
                  message: '등록되지 않은 도메인입니다.',
                });
              }
              // 성공하면 브라우저가 successUrl 로 떠나므로 끝나지 않습니다.
              return new Promise(() => {});
            },
          };
        },
      })) as unknown as Record<string, unknown>;
      TossPayments.ANONYMOUS = anonymous;
      (window as unknown as Record<string, unknown>).TossPayments = TossPayments;
    },
    [mode, SDK_ANONYMOUS] as const,
  );
}

async function fillCheckout(page: Page) {
  await page.fill('[name="recipientName"]', '홍길동');
  await page.fill('[name="recipientPhone"]', '010-1234-5678');
  await page.fill('[name="postalCode"]', '04524');
  await page.fill('[name="address1"]', '서울 중구 세종대로 110');
  await page.fill('[name="email"]', 'buyer@example.com');
  await page.locator('[name="agree"]').check();
}

/**
 * 장바구니를 저장소에 직접 심습니다.
 *
 * 제품 화면을 거쳐 담으면 **체크아웃 문서가 그 사이에 캐시로 들어와** 위의
 * 가로채기를 지나칩니다(실측했습니다 — 속성이 끼워지지 않았습니다). 체크아웃이
 * **첫 항해** 여야 응답을 확실히 고칠 수 있습니다.
 *
 * 담는 동작 자체는 `cart.spec.ts` 가 봅니다. 여기서 확인하려는 것은 위젯이지
 * 장바구니가 아닙니다.
 */
async function seedCart(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('avora.cart.v1', JSON.stringify([{ id: 'daily-sunscreen', qty: 1 }]));
  });
}

async function goCheckout(page: Page) {
  await serveWithKey(page);
  await seedCart(page);
  await page.goto('/ko/checkout');
  await fillCheckout(page);
}

const recorded = (page: Page) =>
  page.evaluate(() => (window as unknown as { __toss: Recorded }).__toss);

/**
 * 빌드가 키를 마크업에 실어 보내는가.
 *
 * 아래 검사들은 `data-toss-client-key` 를 **자기가 심고** 시작합니다. 그
 * 대가로 `checkout.astro` 에서 그 속성을 내보내는 줄을 지워도 전부 통과합니다.
 * 여기서만 소스를 직접 보고 그 연결을 못 박습니다.
 *
 * 증명: 화면이 `TOSS_CLIENT_KEY` 를 읽어 그 속성으로 내보내는 코드를 갖고 있다.
 * 못 함: 그 코드가 실제로 옳은 HTML 을 만든다 — 그건 실물 빌드로 확인했습니다.
 */
test.describe('빌드가 키를 내보낸다', () => {
  test('checkout.astro 가 TOSS_CLIENT_KEY 를 data 속성으로 잇는다', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../../../src/pages/[lang]/checkout.astro', import.meta.url)),
      'utf8',
    );
    expect(source, 'runtime 에서 클라이언트 키를 가져오지 않습니다').toContain('TOSS_CLIENT_KEY');
    expect(
      source.replace(/\s+/g, ' '),
      'data-toss-client-key 로 내보내는 줄이 없습니다 — 키를 넣어도 위젯이 뜨지 않습니다',
    ).toMatch(/TOSS_CLIENT_KEY \? \{ 'data-toss-client-key': TOSS_CLIENT_KEY \}/);
  });
});

test.describe('결제수단은 위젯이 그린다', () => {
  test('우리 라디오는 남아 있지 않다', async ({ page }) => {
    /*
     * 전에는 라디오 넷이 있었지만 그 선택은 어디에도 전달되지 않았습니다 —
     * 제출 핸들러가 `paymentMethod` 를 읽지 않았고 결제는 늘 카드로 열렸습니다.
     * 위젯이 자기 목록을 그리므로, 남겨 두면 손님이 같은 것을 두 번 고르고
     * 그중 하나는 여전히 아무 일도 하지 않습니다.
     */
    await page.goto('/ko/checkout');
    await expect(page.locator('[name="paymentMethod"]')).toHaveCount(0);
  });

  test('위젯이 들어갈 자리가 둘 다 있다', async ({ page }) => {
    await page.goto('/ko/checkout');
    await expect(page.locator('[data-toss-methods]')).toHaveCount(1);
    await expect(page.locator('[data-toss-agreement]')).toHaveCount(1);
  });

  test('우리 개인정보 동의는 그대로 남는다', async ({ page }) => {
    /*
     * 토스 약관 동의(전자금융거래·결제대행)와 우리 개인정보 수집·이용 동의는
     * **다른 동의** 입니다. 하나로 묶으면 어느 쪽도 받은 것이 아니게 됩니다.
     */
    await page.goto('/ko/checkout');
    await expect(page.locator('[name="agree"]')).toHaveCount(1);
    await expect(page.locator('.agree').first()).toContainText(ko.checkout.agree.label);
  });
});

/**
 * 키가 없을 때의 대비책.
 *
 * ── 왜 e2e 가 아닌가 ────────────────────────────────────────
 * `payment-config.json` 에 테스트 키가 들어 있고 검사 빌드는 그것을 끕니다.
 * 계약 전 빌드(설정의 clientKey 가 빈 값)를 브라우저에서 지나가려면 키 없는
 * 빌드가 따로 있어야 하는데, 스위트에 세 번째 빌드를 얹을 수는 없습니다.
 *
 * ⚠️ 전에는 여기서 `if (!widgets || !widgets.ok)` 라는 **소스 문자열을 그대로
 * 못 박았습니다.** 그런데 그 한 줄이 바로 결함이었습니다 — 키가 있는데 위젯을
 * 못 세운 경우까지 완료 화면으로 보내서, 한 푼도 결제하지 않은 손님이
 * "주문이 완료되었습니다" 를 봤습니다. **검사가 결함을 지키고 있었습니다.**
 *
 * 그래서 구현의 모양이 아니라 **성질** 을 봅니다: 키가 없으면 위젯을 세우지
 * 않고 완료 화면으로 넘긴다. 실제 동작은 키 없는 빌드로 눈으로 확인했습니다
 * (`npm run build` → `data-toss-client-key` 속성 없음).
 */
test.describe('키가 없으면 위젯을 건너뛴다', () => {
  test('키를 읽는 자리가 하나뿐이다', () => {
    /*
     * 화면이 키를 여러 곳에서 읽으면 한 곳만 고쳐도 나머지가 조용히
     * 어긋납니다. 이름을 못 박는 대신 **개수** 를 봅니다.
     */
    const source = readFileSync(
      fileURLToPath(new URL('../../../src/pages/[lang]/checkout.astro', import.meta.url)),
      'utf8',
    );
    expect(
      [...source.matchAll(/dataset\.tossClientKey/g)].length,
      '클라이언트 키를 읽는 자리가 하나가 아닙니다',
    ).toBe(1);
  });
});

test.describe('키가 있으면 주문서에 위젯을 그린다', () => {
  test.beforeEach(async ({ page }) => {
    await stubSdk(page);
    await goCheckout(page);
  });

  test('문서 규격대로 위젯을 세운다', async ({ page }) => {
    await expect.poll(async () => (await recorded(page)).methods).not.toBeNull();
    const seen = await recorded(page);

    expect(seen.clientKey, '마크업의 클라이언트 키가 SDK 로 넘어가지 않았습니다').toBe(CONFIGURED_KEY);
    /*
     * 이 비교가 증명하는 것을 정확히 적습니다.
     *
     * `SDK_ANONYMOUS` 는 대역에도 주입되므로 **값 자체를 검증하지는
     * 못합니다.** 증명되는 것은 `src/lib/toss.ts` 가 그 값을 하드코딩하지
     * 않고 **`TossPayments.ANONYMOUS` 를 읽어 그대로 넘긴다** 는 것이고,
     * 그게 여기서 지켜야 할 바로 그것입니다 — SDK 가 상수를 바꾸면 우리는
     * 따라갑니다. 값이 실제로 `@@ANONYMOUS` 라는 사실은 번들에서 확인했고
     * 파일 머리에 적어 두었습니다.
     */
    expect(seen.customerKey, 'ANONYMOUS 상수가 실물 SDK 와 다릅니다').toBe(SDK_ANONYMOUS);

    expect(seen.amount?.currency, 'setAmount 는 { currency, value } 객체입니다').toBe('KRW');
    expect(typeof seen.amount?.value).toBe('number');
    expect(seen.methods?.selector).toBe('[data-toss-methods]');
    expect(seen.agreement?.selector).toBe('[data-toss-agreement]');
    expect(seen.methods?.variantKey).toBe('DEFAULT');
    expect(seen.agreement?.variantKey).toBe('AGREEMENT');
  });

  test('금액이 화면의 합계와 정확히 같다', async ({ page }) => {
    /*
     * "0보다 크다" 로는 부족합니다 — 1원을 넘겨도 통과합니다. 이 파일에서
     * 가장 중요한 값이라 화면에 그려진 합계와 **같은 수** 인지를 봅니다.
     */
    await expect.poll(async () => (await recorded(page)).amount).not.toBeNull();
    const shown = await page.locator('[data-sum-total]').textContent();
    const digits = Number((shown ?? '').replace(/\D/g, ''));
    expect(digits, '화면 합계를 읽지 못했습니다').toBeGreaterThan(0);
    expect((await recorded(page)).amount!.value).toBe(digits);
  });

  test('결제 요청이 방금 만든 주문의 번호로 나간다', async ({ page }) => {
    /*
     * 접두어와 정규식만 보면, 코드가 실수로 `newOrderId()` 를 한 번 더 불러
     * **다른 번호** 를 위젯에 넘겨도 전부 통과합니다. 그러면 승인은 영원히
     * 실패합니다 — D1 에 없는 주문번호이기 때문입니다.
     *
     * 그래서 `/api/orders` 로 실제로 나간 번호를 가로채 대조합니다.
     */
    const created = page.waitForRequest(
      (r) => r.url().includes('/api/orders') && r.method() === 'POST',
    );
    await page.locator('[data-pay]').click();
    const orderId = (await created).postDataJSON().orderId as string;

    await expect.poll(async () => (await recorded(page)).request).not.toBeNull();
    expect((await recorded(page)).request!.orderId).toBe(orderId);
    // 정규식을 여기 다시 적지 않습니다 — 구현을 고쳐도 검사가 따라옵니다.
    expect(String(orderId)).toMatch(TOSS_ORDER_ID);
  });

  test('성공 주소에 amount·orderId 를 미리 넣지 않는다', async ({ page }) => {
    /*
     * 토스가 `amount`·`orderId`·`paymentKey` 를 successUrl 에 붙여 줍니다.
     * 우리가 먼저 넣으면 완료 화면의 `params.get('amount')` 가 **항상 우리
     * 값** 을 돌려주고 토스가 보낸 값은 영영 읽히지 않습니다 — 문서가 요구하는
     * "쿼리의 amount 와 요청한 amount 대조" 가 자기 메아리를 자기와 비교하는
     * 일이 됩니다.
     */
    await page.locator('[data-pay]').click();
    await expect.poll(async () => (await recorded(page)).request).not.toBeNull();
    const req = (await recorded(page)).request!;

    const success = new URL(String(req.successUrl));
    expect(success.origin).toBe(new URL(page.url()).origin);
    expect(success.pathname).toBe('/ko/order/complete/');
    expect(success.searchParams.get('amount'), 'amount 를 미리 넣었습니다').toBeNull();
    expect(success.searchParams.get('orderId'), 'orderId 를 미리 넣었습니다').toBeNull();

    /*
     * 실패 주소에는 주문번호를 남깁니다 — 어느 주문이었는지 확실히 알아야
     * 합니다. 접두어만 보면 다른 주문의 번호가 실려도 통과하므로, 결제
     * 요청에 나간 번호와 **같은지** 봅니다.
     */
    const fail = new URL(String(req.failUrl));
    expect(fail.searchParams.get('orderId')).toBe(String(req.orderId));
  });

  test('구매자 정보가 문서 형식으로 넘어간다', async ({ page }) => {
    await page.locator('[data-pay]').click();
    await expect.poll(async () => (await recorded(page)).request).not.toBeNull();
    const req = (await recorded(page)).request!;
    // 문서 예시가 `01012345678` 꼴입니다.
    expect(req.customerMobilePhone).toBe('01012345678');
    expect(req.customerEmail).toBe('buyer@example.com');
    /*
     * "비어 있지 않다" 로는 부족합니다 — `l.name` 대신 `l.id` 를 넘겨도
     * 통과합니다. 이 문장은 **토스 결제 화면에** 뜨므로 상품 이름이어야
     * 합니다. 화면의 주문 요약에 그려진 이름과 대조합니다.
     */
    const shownName = (await page.locator('[data-checkout-lines] li').first().textContent()) ?? '';
    expect(shownName, '주문 요약을 읽지 못했습니다').not.toBe('');
    expect(
      shownName.startsWith(String(req.orderName)),
      `orderName 이 화면의 상품 이름과 다릅니다: ${req.orderName}`,
    ).toBe(true);
    expect(String(req.orderName).length, 'orderName 이 상한을 넘습니다').toBeLessThanOrEqual(
      ORDER_NAME_MAX,
    );
  });
});

test.describe('위젯이 서기 전에는 결제할 수 없다', () => {
  /*
   * 여기가 blocker 였던 자리입니다.
   *
   * 버튼이 처음부터 활성이면, SDK(480KB · 외부 CDN)가 뜨기 전에 누른 손님의
   * 주문 행만 만들어지고 **결제 없이 "주문이 완료되었습니다" 화면** 으로
   * 넘어갔습니다. 느린 회선·사내 방화벽에서 실제로 일어납니다.
   */
  test('위젯이 뜨는 동안 버튼이 잠겨 있다', async ({ page }) => {
    // 마운트가 끝나지 않는 상태 = 느린 회선에서 SDK 를 받는 동안.
    await stubSdk(page, 'setup-hangs');
    await goCheckout(page);
    await expect(
      page.locator('[data-pay]'),
      '위젯이 서기 전인데 결제 버튼이 눌립니다 — 누르면 결제 없이 완료 화면으로 갑니다',
    ).toBeDisabled();
  });

  test('위젯이 서면 버튼이 풀린다', async ({ page }) => {
    await stubSdk(page);
    await goCheckout(page);
    await expect(page.locator('[data-pay]')).toBeEnabled();
  });

  test('마운트가 실패하면 버튼이 잠긴 채로 남는다', async ({ page }) => {
    /*
     * 잠긴 채로 두는 것이 핵심입니다. 풀어 주면 그 클릭이 갈 곳이 없고,
     * 예전 구조에서는 완료 화면으로 샜습니다.
     */
    await stubSdk(page, 'setup-fails');
    await goCheckout(page);
    await expect(page.locator('[data-widget-error]')).toBeVisible();
    await expect(page.locator('[data-pay]')).toBeDisabled();
  });
});

test.describe('위젯이 서지 않으면 말한다', () => {
  test('잘못된 키·미등록 도메인이면 안내와 코드가 뜬다', async ({ page }) => {
    /*
     * 라이브 전환일에 가장 흔한 실패입니다. 조용히 넘기면 "결제수단이 안
     * 보인다" 로만 나타나고 원인을 알 길이 없습니다.
     */
    await stubSdk(page, 'setup-fails');
    await goCheckout(page);
    await expect(page.locator('[data-widget-error]')).toBeVisible();
    await expect(page.locator('[data-widget-error]')).toContainText('INVALID_CLIENT_KEY');
    // 결제수단을 고를 수 없는데 결제 버튼이 살아 있으면 안 됩니다.
    await expect(page.locator('[data-pay]')).toBeDisabled();
  });

  test('SDK 를 못 불러오면 안내가 뜬다', async ({ page }) => {
    // 광고 차단기나 사내 방화벽이 js.tosspayments.com 을 막는 경우입니다.
    await page.route('https://js.tosspayments.com/**', (route) => route.abort());
    await goCheckout(page);
    await expect(page.locator('[data-widget-error]')).toBeVisible();
    await expect(page.locator('[data-pay]')).toBeDisabled();
  });
});

test.describe('결제 요청이 거절되면 말한다', () => {
  test('거절 코드를 화면에 남기고 버튼을 되살린다', async ({ page }) => {
    /*
     * ⚠️ 여기 오는 것은 "손님이 그만둔 것" 이 **아닙니다.**
     *
     * 리다이렉트 방식(successUrl·failUrl)에서 결제를 그만두면 프라미스가
     * 거절되는 대신 failUrl 로 `PAY_PROCESS_CANCELED` 를 달고 이동합니다.
     * 이 갈래에 실제로 도달하는 것은 결제가 시작되기도 전의 검증 실패뿐이라
     * — 미등록 도메인, 주문번호 규격 위반 — 전부 말해야 합니다.
     *
     * 전에는 이것을 USER_CANCEL 로 보고 조용히 넘겼습니다.
     */
    await stubSdk(page, 'request-rejects');
    await goCheckout(page);
    await page.locator('[data-pay]').click();

    await expect(page.locator('[data-form-error]')).toBeVisible();
    await expect(page.locator('[data-form-error]')).toContainText('NOT_ALLOWED_ORIGIN');
    await expect(page.locator('[data-pay]')).toBeEnabled();
  });
});

test.describe('결제창이 실패로 돌려보내면', () => {
  test('완료 화면이 실패 상태와 코드를 그린다', async ({ page }) => {
    /*
     * failUrl 로는 `paymentKey` 가 오지 않습니다. 이 갈래가 없으면 완료
     * 화면의 "PG 연동 전" 경로로 흘러 들어가 **실패한 결제가 접수 완료로
     * 보입니다.**
     */
    await page.goto(
      '/ko/order/complete/?code=PAY_PROCESS_CANCELED&message=%EC%B7%A8%EC%86%8C&orderId=AVORA-20260101000000-TEST01',
    );
    await expect(page.locator('[data-state-failed]')).toBeVisible();
    await expect(page.locator('[data-state-ok]')).toBeHidden();
    await expect(page.locator('[data-failed-code]')).toContainText('PAY_PROCESS_CANCELED');
  });

  test('코드에 $ 가 섞여도 그대로 보여준다', async ({ page }) => {
    /*
     * `String.replace` 의 두 번째 인자가 문자열이면 `$` 가 치환 시퀀스입니다.
     * 코드는 주소창에서 오므로 `$\`` 같은 값이 들어올 수 있고, 그러면 문의에
     * 필요한 코드가 화면에서 사라집니다.
     */
    await page.goto('/ko/order/complete/?code=%24%60ODD%24%27&orderId=AVORA-20260101000000-TEST01');
    await expect(page.locator('[data-failed-code]')).toContainText('ODD');
  });

  test('PG 가 보낸 문장을 화면에 그대로 넣지 않는다', async ({ page }) => {
    await page.goto(
      '/th/order/complete/?code=PAY_PROCESS_CANCELED&message=%EA%B2%B0%EC%A0%9C%EA%B0%80%20%EC%B7%A8%EC%86%8C%EB%90%98%EC%97%88%EC%8A%B5%EB%8B%88%EB%8B%A4&orderId=AVORA-20260101000000-TEST01',
    );
    await expect(page.locator('[data-state-failed]')).toBeVisible();
    // 설명은 **그 화면의 사전** 에서 와야 합니다.
    await expect(page.locator('[data-failed-message]')).toHaveText(th.order.failed.body);
    await expect(
      page.locator('[data-state-failed]'),
      '결제사가 보낸 한국어 문장이 태국어 화면에 그대로 나왔습니다',
    ).not.toContainText('결제가 취소되었습니다');
    await expect(page.locator('[data-failed-code]')).toContainText('PAY_PROCESS_CANCELED');
  });
});
