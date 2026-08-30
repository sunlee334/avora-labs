/**
 * tokens/design-tokens.json → src/styles/tokens.css
 *
 * 컬러를 바꾸려면 이 스크립트가 아니라 tokens/design-tokens.json 을 고치세요.
 * 이 스크립트는 그 JSON을 CSS 커스텀 프로퍼티로 옮겨 적을 뿐입니다.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(root, 'tokens/design-tokens.json');
const OUT = resolve(root, 'src/styles/tokens.css');

const tokens = JSON.parse(readFileSync(SRC, 'utf8'));

/** "color.palette.ink" 같은 ref를 실제 값으로 풀어냅니다. */
function resolveRef(path) {
  const node = path.split('.').reduce((acc, key) => acc?.[key], tokens);
  if (!node) throw new Error(`토큰 참조를 찾을 수 없습니다: ${path}`);
  return node.ref ? resolveRef(node.ref) : node.value;
}

const lines = [];
const push = (name, value, comment) =>
  lines.push(`  --${name}: ${value};${comment ? ` /* ${comment} */` : ''}`);

/*
 * 두 계층으로 냅니다.
 *
 *   --paros-*   원시 팔레트. **색은 여기서만 정의됩니다.**
 *   --color-*   역할. 화면 코드는 이것만 참조합니다.
 *
 * 왜 나누는가: `--paros-ink` 는 값 이름이라 색이 바뀌면 이름이 거짓말이 됩니다.
 * `--color-text` 는 역할 이름이라 값이 바뀌어도 의미가 유지됩니다. 화면이
 * 역할만 참조하면 팔레트 교체가 이 JSON 한 곳 수정으로 끝납니다.
 */
lines.push('  /* ── 원시 팔레트 — 색은 여기서만 정의합니다 ──────────────── */');
for (const [key, t] of Object.entries(tokens.color.palette)) {
  push(`paros-${kebab(key)}`, t.value, t.name);
}
lines.push('');
lines.push('  /* ── 역할 — 화면 코드는 이것만 참조합니다 ────────────────── */');
for (const [key, t] of Object.entries(tokens.color.role)) {
  push(`color-${kebab(key)}`, t.ref ? `var(--paros-${kebab(t.ref.split('.').pop())})` : t.value);
}
lines.push('');
for (const [key, t] of Object.entries(tokens.font)) push(`font-${kebab(key)}`, t.value);
lines.push('');
for (const [key, t] of Object.entries(tokens.size)) push(`size-${kebab(key)}`, t.value);
lines.push('');
for (const [key, t] of Object.entries(tokens.space)) push(`space-${kebab(key)}`, t.value);
lines.push('');
for (const [key, t] of Object.entries(tokens.radius)) push(`radius-${kebab(key)}`, t.value);
lines.push('');
for (const [key, t] of Object.entries(tokens.motion)) push(`motion-${kebab(key)}`, t.value);

function kebab(s) {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

const css = `/* ─────────────────────────────────────────────────────────────
 * 이 파일은 자동 생성됩니다. 직접 수정하지 마세요.
 * 값을 바꾸려면 tokens/design-tokens.json 을 고치고 npm run tokens 실행.
 *
 * 팔레트: ${tokens.meta.palette}
 * ───────────────────────────────────────────────────────────── */
:root {
${lines.join('\n')}
}
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, css, 'utf8');
console.log(`tokens → ${OUT.replace(root + '/', '')} (팔레트 ${Object.keys(tokens.color.palette).length} · 역할 ${Object.keys(tokens.color.role).length})`);
