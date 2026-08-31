import { test, expect } from '@playwright/test';

/**
 * 첫 화면 이미지.
 *
 * 홈 히어로는 LCP 요소입니다. 여기가 늦거나 뭉개지면 다른 최적화는 의미가
 * 없습니다.
 */

test.describe('히어로 이미지', () => {
  /*
   * 이 파일은 **모바일 프로필에서만** 돕니다.
   *
   * 히어로 높이는 `svh` 로 정해집니다. desktop 프로필은 1280×900 으로 시작한
   * 창의 크기를 바꿔 쓰는데, 그러면 `svh` 가 바뀐 화면이 아니라 **창** 기준으로
   * 풀리는 일이 있습니다 — CI 에서 히어로가 658px 이 아니라 1049px 로 계산돼
   * 필요한 이미지 폭이 1600px 로 나왔습니다.
   *
   * 실제 사용자에게는 없는 상황입니다. 휴대폰은 화면 크기가 바뀌지 않고,
   * mobile 프로필(iPhone 14)은 처음부터 그 크기로 뜹니다. 여기서 보려는 것도
   * 휴대폰에서의 선명도입니다.
   */
  test.skip(({ isMobile }) => !isMobile, 'svh 기준이 흔들리지 않는 모바일 프로필에서만 봅니다');

  test('휴대폰에서 늘려 그리지 않는다', async ({ page }) => {
    /*
     * 사진은 가로 1600×1049 인데 히어로는 세로로 깁니다. `object-fit: cover`
     * 가 높이를 채우려고 사진을 키우므로, 화면 폭이 390px 이어도 브라우저가
     * 그려야 하는 사진의 실제 폭은 그 2.3배입니다.
     *
     * `sizes` 에 그 배율을 적지 않으면 브라우저는 화면 폭만 보고 작은 후보를
     * 받아 늘려 그립니다 — 측정값으로 선명도가 4분의 1이 됐습니다.
     */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/');

    const m = await page.evaluate(async () => {
      const img = document.querySelector<HTMLImageElement>('.hero__media img')!;
      await img.decode();
      const box = img.getBoundingClientRect();
      /*
       * srcset 에서 고른 이미지의 실제 픽셀 수를 구합니다.
       *
       * `naturalWidth` 는 srcset 후보에서 온 이미지라면 밀도로 나눈 CSS px 을
       * 돌려줍니다. 파일이 몇 픽셀짜리인지는 currentSrc 와 srcset 을 맞춰
       * 봐야 압니다.
       */
      const file = img.currentSrc.split('/').pop()!;
      const source = img.closest('picture')!.querySelector('source[type="image/avif"]')!;
      const candidates = (source.getAttribute('srcset') ?? '')
        .split(',')
        .map((s) => s.trim().split(/\s+/))
        .map(([u, w]) => ({ file: u.split('/').pop()!, width: parseInt(w, 10) }));
      const picked = candidates.find((c) => c.file === file);
      return {
        file,
        realWidth: picked?.width ?? 0,
        largest: Math.max(...candidates.map((c) => c.width)),
        drawnWidth: (img.naturalWidth / img.naturalHeight) * box.height,
        dpr: window.devicePixelRatio,
      };
    });

    expect(m.realWidth, `srcset 에서 ${m.file} 을 못 찾았습니다`).toBeGreaterThan(0);

    /*
     * 필요한 만큼 받되, 원본보다 클 수는 없습니다.
     *
     * DPR 3 기기에서 필요한 폭은 2,649px 인데 원본 사진이 1,600px 입니다.
     * 그 경우 브라우저가 **가진 것 중 가장 큰 후보** 를 골랐으면 통과입니다.
     * 더 선명하게 하려면 sizes 가 아니라 더 큰 원본이 필요합니다.
     */
    const needed = m.drawnWidth * m.dpr;
    const enough = m.realWidth >= needed * 0.92 || m.realWidth === m.largest;
    expect(
      enough,
      `받은 이미지가 ${m.realWidth}px 인데 ${Math.round(needed)}px 로 그립니다. ` +
        `srcset 에는 ${m.largest}px 후보가 있습니다 — sizes 를 확인하세요.`,
    ).toBe(true);
  });

  test('폭이 넓어지면 과하게 큰 파일을 받지 않는다', async ({ page }) => {
    /*
     * 배율을 넉넉히 잡아 두면 데스크톱에서 필요 없는 바이트를 받게 됩니다.
     *
     * 여기서는 화면을 넓혀야 하므로 `svh` 가 다시 흔들릴 수 있습니다. 그래서
     * 이 검사는 "받은 것이 그린 것의 1.6배를 넘지 않는가" 만 봅니다 — 높이가
     * 어떻게 풀리든 그 비율은 같이 움직입니다.
     */
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/ko/');
    const over = await page.evaluate(async () => {
      const img = document.querySelector<HTMLImageElement>('.hero__media img')!;
      await img.decode();
      const box = img.getBoundingClientRect();
      const drawn = (img.naturalWidth / img.naturalHeight) * box.height;
      return (img.naturalWidth * window.devicePixelRatio) / (drawn * window.devicePixelRatio);
    });
    expect(over, `필요한 것보다 ${over.toFixed(2)}배 큰 이미지를 받습니다`).toBeLessThan(1.6);
  });

  test('자리를 미리 잡아 화면이 흔들리지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ko/');
    const img = page.locator('.hero__media img');
    // width/height 가 없으면 이미지가 도착할 때 아래 내용이 밀립니다.
    await expect(img).toHaveAttribute('width', /\d+/);
    await expect(img).toHaveAttribute('height', /\d+/);
    await expect(img).toHaveAttribute('fetchpriority', 'high');
    await expect(img).toHaveAttribute('loading', 'eager');
  });
});
