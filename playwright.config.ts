import { defineConfig, devices } from '@playwright/test';

/**
 * E2E 는 `wrangler dev` 위에서 돕니다.
 * astro preview 가 아니라 Worker 를 태우는 이유: 루트 302 와 결제 API 가
 * Worker 안에 있어서, 정적 서버로 띄우면 그 둘을 검증할 수 없습니다.
 */
const PORT = 8787;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },

  projects: [
    {
      // 모바일이 기준입니다 — 요구사항 7번의 최우선 원칙.
      name: 'mobile',
      use: { ...devices['iPhone 14'] },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
  ],

  webServer: {
    command: `npx wrangler dev --port ${PORT} --local`,
    url: `http://127.0.0.1:${PORT}/ko/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
