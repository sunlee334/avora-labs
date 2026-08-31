import { test, expect } from '@playwright/test';
import { LOCALE_TAGS, OG_LOCALES, LOCALES } from '../../src/config/site';

/**
 * `og:locale` 은 hreflang 과 다른 규격입니다.
 *
 * 전에는 hreflang 태그의 `-` 를 `_` 로 바꿔 썼는데, 그러면 영어가 `en`,
 * 중국어가 `zh_Hans` 로 나갑니다 — 둘 다 og:locale 이 받지 않는 값입니다.
 * 화면에서는 전혀 티가 나지 않고, 카카오톡 미리보기에서만 드러납니다.
 */

/** og:locale 이 받는 형태: 소문자 두 글자 + `_` + 대문자 두 글자. */
const SHAPE = /^[a-z]{2}_[A-Z]{2}$/;

test.describe('og:locale', () => {
  for (const locale of LOCALES) {
    test(`/${locale}/ 가 언어_지역 형태다`, async ({ request }) => {
      const html = await (await request.get(`/${locale}/`)).text();
      const found = html.match(/property="og:locale" content="([^"]*)"/)?.[1];
      expect(found, `/${locale}/ 에 og:locale 이 없습니다`).toBeTruthy();
      expect(found, `«${found}» 는 언어_지역 형태가 아닙니다`).toMatch(SHAPE);
      expect(found).toBe(OG_LOCALES[locale]);
    });
  }

  test('hreflang 표에서 기계적으로 만들 수 없다', () => {
    /*
     * 값이 같은 언어도 있습니다 — `ko-KR` → `ko_KR` 은 우연히 맞습니다.
     * 그래서 "전부 달라야 한다" 는 틀린 단언입니다.
     *
     * 여기서 지키는 것은 **두 표를 합칠 수 없다** 는 사실입니다. hreflang 을
     * 그대로 변환하면 규격을 벗어나는 언어가 반드시 남는다는 것을 보이면,
     * 다음 사람이 "하나로 줄이자" 고 했을 때 이 검사가 답을 줍니다.
     */
    const broken = LOCALES.filter((l) => !SHAPE.test(LOCALE_TAGS[l].replace('-', '_')));
    expect(
      broken.length,
      'hreflang 표를 그대로 써도 전부 규격에 맞습니다 — 두 표를 합쳐도 됩니다',
    ).toBeGreaterThan(0);

    // 그 언어들은 og:locale 표에서 반드시 고쳐져 있어야 합니다.
    for (const l of broken) {
      expect(OG_LOCALES[l], `${l}: hreflang 이 규격을 벗어나는데 og:locale 도 같습니다`).not.toBe(
        LOCALE_TAGS[l].replace('-', '_'),
      );
    }
  });

  test('언어마다 다른 값이다', () => {
    const values = LOCALES.map((l) => OG_LOCALES[l]);
    expect(new Set(values).size, `겹치는 값이 있습니다: ${values.join(', ')}`).toBe(values.length);
  });
});
