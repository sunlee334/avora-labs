/**
 * 명단 내보내기.
 *
 * ── 왜 필요한가 ─────────────────────────────────────────────
 * **이메일 명단이 이 사업의 유일한 자산입니다.** 지금은 Cloudflare D1 한
 * 곳에만 있습니다. 실수로 지우거나 계정에 문제가 생기면 되돌릴 방법이
 * 없습니다.
 *
 * ── 왜 자동이 아닌가 ────────────────────────────────────────
 * 백업본에도 개인정보가 담깁니다. 자동으로 어딘가에 쌓아 두면 그 위치의
 * 접근 통제까지 관리해야 하는데, 지금은 그럴 사람이 없습니다. 필요할 때
 * 손으로 내려받아 안전한 곳에 두는 편이 관리 범위가 작습니다.
 *
 * 사용법:
 *   node scripts/export-lists.mjs            내보낼 파일 이름만 보여줍니다
 *   node scripts/export-lists.mjs --write    실제로 내려받습니다
 *
 * 나온 파일은 **저장소에 넣지 마세요.** .gitignore 가 backups/ 를 막습니다.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(root, 'backups');
const write = process.argv.includes('--write');

/** 내보낼 표. 개인정보가 담긴 것만 적습니다. */
const TABLES = ['launch_notify', 'panel_applications'];

function query(sql) {
  const out = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'avora-orders', '--remote', '--json', '--command', sql],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  // wrangler 는 앞뒤로 안내문을 섞어 냅니다. JSON 배열만 잘라 씁니다.
  const start = out.indexOf('[');
  return JSON.parse(out.slice(start));
}

/*
 * 날짜는 **호출 시점** 에 만듭니다. 파일 이름이 겹치면 앞의 백업을 덮어씁니다.
 */
const stamp = new Date().toISOString().slice(0, 10);

for (const table of TABLES) {
  const file = resolve(OUT_DIR, `${table}-${stamp}.json`);
  if (!write) {
    console.log(`  ${file.replace(root + '/', '')}  (--write 를 붙이면 내려받습니다)`);
    continue;
  }
  const [result] = query(`SELECT * FROM ${table}`);
  const rows = result?.results ?? [];
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(file, JSON.stringify(rows, null, 2), 'utf8');
  console.log(`  ${table}: ${rows.length}행 → ${file.replace(root + '/', '')}`);
}

if (write) {
  console.log('\n  이 파일에는 개인정보가 들어 있습니다. 저장소에 올리지 말고');
  console.log('  접근이 통제된 곳에 두세요.');
}
