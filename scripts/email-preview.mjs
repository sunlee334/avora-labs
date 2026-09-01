/**
 * 확인 메일 열 통을 그대로 찍어 봅니다.
 *
 * 문구는 담당자 확인과 원어민 검수를 받아야 하는데, JSON 조각을 읽어서는
 * 최종 모습을 알 수 없습니다 — 날짜가 타임라인에서 끼워지고 서명이 붙습니다.
 * 실제로 받는 사람이 볼 것을 그대로 보여 줍니다.
 *
 *   npm run email:preview
 *   npm run email:preview -- ko      한 언어만
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchNotifyEmail, panelApplyEmail } from '../src/lib/email.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = ['ko', 'en', 'zh', 'th', 'vi'];

const only = process.argv[2];
const targets = only ? [only] : LOCALES;

const SAMPLE = 'you@example.com';
const UNSUB = 'https://avoralabs.co/api/launch-notify/unsubscribe?t=UNSUB-000-XXXXXX';

for (const locale of targets) {
  const t = JSON.parse(readFileSync(resolve(root, `src/i18n/${locale}.json`), 'utf8'));
  for (const [label, mail] of [
    ['출시 알림 신청', launchNotifyEmail(t, SAMPLE, UNSUB)],
    ['검증단 지원', panelApplyEmail(t, SAMPLE)],
  ]) {
    console.log('━'.repeat(70));
    console.log(`${locale.toUpperCase()} · ${label}`);
    console.log('━'.repeat(70));
    console.log(`제목: ${mail.subject}`);
    console.log();
    console.log(mail.text);
    console.log();
  }
}
