/**
 * 번역 파일 키 구조 검사.
 *
 * ko.json 을 기준으로 나머지 언어에 빠진 키·남는 키·배열 길이 불일치를 찾습니다.
 * 번역을 추가하거나 새 문구를 넣은 뒤 `node scripts/check-i18n.mjs` 로 확인하세요.
 * 빌드(`npm run build`)에서도 자동으로 돌아갑니다.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../src/i18n');
const BASE = 'ko';

const load = (loc) => JSON.parse(readFileSync(resolve(DIR, `${loc}.json`), 'utf8'));
const locales = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace('.json', ''))
  .filter((l) => l !== BASE)
  .sort();

const base = load(BASE);

/** ref(기준) 와 cand(대상) 의 키 구조 차이를 모읍니다. `$` 로 시작하는 메타 키는 건너뜁니다. */
function diff(ref, cand, path = '') {
  const problems = [];

  if (Array.isArray(ref)) {
    if (!Array.isArray(cand)) {
      problems.push(`${path} — 배열이어야 하는데 ${typeof cand}`);
      return problems;
    }
    if (ref.length !== cand.length) {
      problems.push(`${path} — 항목 수 ${cand.length}개, 기준은 ${ref.length}개`);
      return problems;
    }
    ref.forEach((item, i) => problems.push(...diff(item, cand[i], `${path}[${i}]`)));
    return problems;
  }

  if (ref !== null && typeof ref === 'object') {
    if (cand === null || typeof cand !== 'object' || Array.isArray(cand)) {
      problems.push(`${path} — 객체여야 하는데 ${Array.isArray(cand) ? 'array' : typeof cand}`);
      return problems;
    }
    for (const key of Object.keys(ref)) {
      if (key.startsWith('$')) continue;
      if (!(key in cand)) problems.push(`${path}.${key} — 누락`);
      else problems.push(...diff(ref[key], cand[key], `${path}.${key}`));
    }
    for (const key of Object.keys(cand)) {
      if (key.startsWith('$')) continue;
      if (!(key in ref)) problems.push(`${path}.${key} — 기준에 없는 키`);
    }
    return problems;
  }

  if (typeof ref !== typeof cand) {
    problems.push(`${path} — 타입 불일치 (기준 ${typeof ref}, 대상 ${typeof cand})`);
  }
  return problems;
}

/**
 * 빈 문자열은 실패가 아니라 경고입니다.
 * 문장부호 관습이 언어마다 달라서(예: 태국어는 문장 끝에 마침표를 쓰지 않음)
 * 비어 있는 것이 정상인 자리가 실제로 존재합니다.
 */
function emptyStrings(ref, cand, path = '') {
  const found = [];
  if (Array.isArray(ref) && Array.isArray(cand) && ref.length === cand.length) {
    ref.forEach((item, i) => found.push(...emptyStrings(item, cand[i], `${path}[${i}]`)));
  } else if (ref !== null && typeof ref === 'object' && cand !== null && typeof cand === 'object') {
    for (const key of Object.keys(ref)) {
      if (key.startsWith('$') || !(key in cand)) continue;
      found.push(...emptyStrings(ref[key], cand[key], `${path}.${key}`));
    }
  } else if (typeof ref === 'string' && typeof cand === 'string') {
    if (ref.trim() !== '' && cand.trim() === '') found.push(path);
  }
  return found;
}

let failed = false;
const unreviewed = [];

for (const loc of locales) {
  const data = load(loc);
  const problems = diff(base, data);
  if (problems.length) {
    failed = true;
    console.error(`\n✗ ${loc}.json — 문제 ${problems.length}건`);
    problems.slice(0, 20).forEach((p) => console.error(`    ${p}`));
    if (problems.length > 20) console.error(`    … 외 ${problems.length - 20}건`);
  } else {
    console.log(`✓ ${loc}.json — ko.json 과 키 구조 일치`);
  }
  const empties = emptyStrings(base, data);
  if (empties.length) {
    console.log(`  ⚠ ${loc}: 빈 문자열 ${empties.length}곳 — ${empties.join(', ')}`);
    console.log(`     (문장부호 관습 차이로 의도된 것일 수 있습니다. 확인만 하세요.)`);
  }
  if (data.$meta?.reviewed === false) unreviewed.push(loc);
}

if (unreviewed.length) {
  console.log(`\n검수 전 언어: ${unreviewed.join(', ')} — 원어민 검수 후 $meta.reviewed 를 true 로 바꾸세요.`);
}

if (failed) {
  console.error('\n번역 키 구조가 어긋났습니다.');
  process.exit(1);
}
