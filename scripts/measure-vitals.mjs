/**
 * Core Web Vitals 실측.
 *
 * ── 왜 도구를 따로 두는가 ───────────────────────────────────
 * Lighthouse 점수는 실행할 때마다 흔들립니다. 여기서 재는 것은 **원인이
 * 있는 숫자** 뿐입니다 — LCP 가 무엇이었고, 어떤 파일을 받았고, 그 파일이
 * 몇 배로 늘어났는가. 점수 하나로는 무엇을 고쳐야 할지 알 수 없습니다.
 *
 * ── 왜 느린 회선을 흉내내는가 ───────────────────────────────
 * 태국·베트남 접속자가 대상에 있습니다. 사무실 회선에서 재면 이 사이트는
 * 무엇을 해도 빠릅니다.
 *
 * 사용법:
 *   node scripts/measure-vitals.mjs                  # 기본 화면들
 *   node scripts/measure-vitals.mjs /ko/ /ko/panel/  # 지정한 경로만
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:4321';
const PATHS = process.argv.slice(2).length ? process.argv.slice(2) : ['/ko/', '/ko/product/', '/ko/panel/'];

/* 저가 안드로이드 + 4G. Lighthouse 모바일 기본값과 같은 조건입니다. */
const THROTTLE = { downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, latency: 150 };
const CPU_SLOWDOWN = 4;

const b = await chromium.launch();

for (const path of PATHS) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  const bytes = [];
  page.on('response', async (r) => {
    const len = Number(r.headers()['content-length'] ?? 0);
    if (len) bytes.push({ url: r.url().split('/').pop(), len, type: r.request().resourceType() });
  });

  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, ...THROTTLE });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });

  await page.goto(BASE + path, { waitUntil: 'load' });
  /* LCP 는 상호작용이 있을 때까지 갱신됩니다. 조용히 기다렸다가 확정합니다. */
  await page.waitForTimeout(3500);

  const v = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const out = { lcp: 0, cls: 0, lcpEl: '', lcpUrl: '' };
        new PerformanceObserver((l) => {
          const e = l.getEntries().at(-1);
          out.lcp = e.startTime;
          out.lcpEl = e.element?.tagName + (e.element?.className ? '.' + String(e.element.className).split(' ')[0] : '');
          out.lcpUrl = e.url?.split('/').pop() ?? '';
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) if (!e.hadRecentInput) out.cls += e.value;
        }).observe({ type: 'layout-shift', buffered: true });
        const nav = performance.getEntriesByType('navigation')[0];
        setTimeout(() => resolve({ ...out, ttfb: nav.responseStart, fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0 }), 400);
      }),
  );

  /* LCP 이미지가 몇 배로 늘어나 그려지는지. 1 을 넘으면 뭉개져 보입니다. */
  const upscale = await page.evaluate(() => {
    const img = document.querySelector('img[fetchpriority="high"]');
    if (!img) return null;
    const r = img.getBoundingClientRect();
    const scale = Math.max(r.width / img.naturalWidth, r.height / img.naturalHeight);
    return {
      file: img.currentSrc.split('/').pop(),
      natural: `${img.naturalWidth}x${img.naturalHeight}`,
      drawn: `${Math.round(img.naturalWidth * scale)}x${Math.round(img.naturalHeight * scale)}`,
      ratio: +(scale * devicePixelRatio).toFixed(2),
    };
  });

  const total = bytes.reduce((a, x) => a + x.len, 0);
  console.log(`\n── ${path}`);
  console.log(`   LCP ${(v.lcp / 1000).toFixed(2)}s   CLS ${v.cls.toFixed(3)}   FCP ${(v.fcp / 1000).toFixed(2)}s   TTFB ${Math.round(v.ttfb)}ms`);
  console.log(`   LCP 요소: ${v.lcpEl}${v.lcpUrl ? ' · ' + v.lcpUrl : ''}`);
  if (upscale) console.log(`   히어로: ${upscale.file} (${upscale.natural}) → ${upscale.drawn}, 확대 ${upscale.ratio}배`);
  console.log(`   전송 ${(total / 1024).toFixed(0)}KB`);
  const top = bytes.sort((a, x) => x.len - a.len).slice(0, 4);
  for (const t of top) console.log(`     ${(t.len / 1024).toFixed(1).padStart(6)}KB  ${t.type.padEnd(10)} ${t.url.slice(0, 44)}`);

  await ctx.close();
}
await b.close();
