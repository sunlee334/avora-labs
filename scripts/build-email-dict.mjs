/**
 * src/i18n/*.json → worker/generated/email-dict.ts
 *
 * ── 왜 워커가 사전을 통째로 읽지 않는가 ─────────────────────
 * 5개 언어 JSON 은 합쳐서 338KB 입니다. 워커가 그것을 import 하면 그 무게가
 * 번들에 그대로 들어가고, 이 워커는 **모든 요청의 앞단** 이라 콜드 스타트가
 * 그만큼 늘어납니다. 확인 메일에 실제로 필요한 것은 `email` 절과 타임라인
 * 다섯 줄, 다 합쳐 6.5KB 뿐입니다.
 *
 * ── 왜 손으로 적지 않는가 ───────────────────────────────────
 * 적어 두면 화면의 문구를 고칠 때 메일이 따라오지 않습니다. 그러면 손님이
 * 화면과 메일에서 서로 다른 일정을 봅니다 — `src/lib/email.ts` 가 날짜를
 * 본문에 박지 않고 타임라인에서 끼우는 것과 같은 이유입니다.
 *
 * 그래서 **생성** 합니다. prebuild 가 매번 다시 만들므로 어긋날 수 없습니다.
 * `src/styles/tokens.css` 와 같은 성격의 파일이고, 같은 이유로 커밋합니다 —
 * 저장소만 받은 사람이 워커 코드를 읽을 때 빈 import 를 보지 않도록.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALES } from '../src/config/site.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'worker/generated/email-dict.ts');

/**
 * 가져올 부분만 고릅니다.
 *
 * `src/lib/email.ts` 의 `EmailDict` 가 요구하는 것과 **정확히 같아야** 합니다.
 * 여기서 빠뜨리면 타입 검사가 잡습니다(`npm run check:types`).
 */
function slice(t) {
  return {
    email: t.email,
    home: {
      timeline: {
        /*
         * `when` 과 `what` 만 남깁니다. 화면의 타임라인에는 `state`("진행중"·
         * "예정")도 있지만 메일 본문은 그것을 쓰지 않습니다. 그대로 들고 오면
         * 워커 번들에 안 쓰는 문자열이 25개 실리고, `EmailDict` 가 선언하지
         * 않은 필드라 타입 검사도 막습니다.
         */
        steps: t.home.timeline.steps.map(({ when, what }) => ({ when, what })),
      },
    },
  };
}

const entries = LOCALES.map((locale) => {
  const t = JSON.parse(readFileSync(resolve(root, `src/i18n/${locale}.json`), 'utf8'));
  return [locale, slice(t)];
});

const body = entries
  .map(([locale, d]) => `  ${locale}: ${JSON.stringify(d, null, 2).replace(/\n/g, '\n  ')},`)
  .join('\n');

const out = `/*
 * 생성된 파일입니다. 고치지 마세요 — \`npm run email:dict\` 가 덮어씁니다.
 *
 * 원본은 \`src/i18n/{언어}.json\` 의 \`email\` 절과 \`home.timeline.steps\` 입니다.
 * 문구를 고치려면 그쪽을 고치세요. 빌드가 이 파일을 다시 만듭니다.
 */
import type { EmailDict } from '../../src/lib/email.ts';
import type { Locale } from '../../src/config/site.ts';

export const EMAIL_DICT: Record<Locale, EmailDict> = {
${body}
};
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out);
console.log(`email-dict: ${entries.length}개 언어 → ${OUT.replace(root + '/', '')}`);
