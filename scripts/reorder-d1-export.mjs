#!/usr/bin/env node
/**
 * `wrangler d1 export` 결과를 D1 에 다시 넣을 수 있는 순서로 재배열한다.
 *
 * 내보내기 파일은 테이블을 알파벳 순으로 쓰기 때문에 `carts`(users 참조) 의 INSERT 가 `users` CREATE TABLE 보다 먼저 나온다.
 * D1 은 외래키 검사를 켠 채 실행하므로 "no such table: main.users" 로 복원이 실패한다 (2026-09-12 복구 리허설에서 확인).
 * 순서: PRAGMA → CREATE TABLE 전부 → INSERT (부모 테이블 먼저: CREATE TABLE 의 REFERENCES 로 의존 순서 계산) → CREATE INDEX.
 * `wrangler d1 execute --file` 은 문장을 한 트랜잭션으로 묶지 않아 defer_foreign_keys 가 문장 사이에는 통하지 않는다.
 *
 * 사용: node scripts/reorder-d1-export.mjs <export.sql> [out.sql]
 */
import { readFileSync, writeFileSync } from "node:fs";

const [, , input, output = input.replace(/\.sql$/, "") + ".restore.sql"] = process.argv;
if (!input) {
  console.error("usage: node scripts/reorder-d1-export.mjs <export.sql> [out.sql]");
  process.exit(1);
}

const text = readFileSync(input, "utf8");
// 문장은 줄 끝의 ';' 로 끝난다 (INSERT 는 한 줄, CREATE TABLE 은 여러 줄).
const statements = [];
let buf = [];
for (const line of text.split("\n")) {
  if (line.trim() === "") continue;
  buf.push(line);
  if (line.trimEnd().endsWith(";")) {
    statements.push(buf.join("\n"));
    buf = [];
  }
}
if (buf.length) statements.push(buf.join("\n"));

const kind = (s) => {
  const head = s.trimStart().toUpperCase();
  if (head.startsWith("PRAGMA")) return 0;
  if (head.startsWith("CREATE TABLE")) return 1;
  if (head.startsWith("INSERT")) return 2;
  if (head.startsWith("CREATE UNIQUE INDEX") || head.startsWith("CREATE INDEX")) return 3;
  return 4;
};
// INSERT 는 테이블 의존 순서(부모 먼저)로 재배열한다.
const tableOf = (s) => {
  const m = /^\s*(?:CREATE TABLE(?: IF NOT EXISTS)?|INSERT INTO)\s+[`"]?([A-Za-z0-9_]+)[`"]?/i.exec(s);
  return m ? m[1] : null;
};
const deps = new Map(); // table → Set(parent tables)
for (const s of statements) {
  if (kind(s) !== 1) continue;
  const t = tableOf(s);
  const parents = new Set();
  for (const m of s.matchAll(/REFERENCES\s+[`"]?([A-Za-z0-9_]+)[`"]?/gi)) if (m[1] !== t) parents.add(m[1]);
  deps.set(t, parents);
}
const order = [];
const visiting = new Set();
const visit = (t) => {
  if (order.includes(t) || !t) return;
  if (visiting.has(t)) return; // 순환 참조는 원래 순서에 맡긴다
  visiting.add(t);
  for (const p of deps.get(t) ?? []) visit(p);
  visiting.delete(t);
  order.push(t);
};
for (const t of deps.keys()) visit(t);
const rank = (t) => (t === "sqlite_sequence" ? Number.MAX_SAFE_INTEGER : order.indexOf(t) === -1 ? order.length : order.indexOf(t));
const inserts = statements.filter((s) => kind(s) === 2);
const insertsSorted = inserts
  .map((s, i) => ({ s, i, r: rank(tableOf(s)) }))
  .sort((a, b) => a.r - b.r || a.i - b.i)
  .map((x) => x.s);
const ordered = [
  ...statements.filter((s) => kind(s) === 0),
  ...statements.filter((s) => kind(s) === 1),
  ...insertsSorted,
  ...statements.filter((s) => kind(s) === 3),
  ...statements.filter((s) => kind(s) === 4),
];
writeFileSync(output, ordered.join("\n") + "\n");
console.log(`${statements.length} statements → ${output}`);
