#!/usr/bin/env node
/**
 * Cloudflare Workers 빌드 래퍼.
 * OpenNext 는 Next 의 .env 파일들을 읽어 `.open-next/cloudflare/next-env.mjs` 로 번들에 내장한다.
 * 저장소의 `.env`(로컬 개발 비밀값)가 운영 번들에 들어가지 않도록 빌드 동안 격리하고,
 * 빌드 후 번들에 비밀 키가 남아 있으면 실패시킨다. 공개 빌드 값은 `.env.production` 만 사용한다.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const QUARANTINE = [".env", ".env.local", ".env.development", ".env.development.local", ".env.production.local"];
const FORBIDDEN_KEYS = ["AUTH_SECRET", "TOSS_SECRET_KEY", "ADMIN_PASSWORD", "DATABASE_AUTH_TOKEN"];

// 이전 빌드가 Ctrl-C 등으로 끊겨 `.env.cfbuild-hold` 가 남아 있으면 먼저 되돌린다 (dev 가 깨진 채로 남지 않도록).
for (const name of QUARANTINE) {
  const held = path.join(root, `${name}.cfbuild-hold`);
  const original = path.join(root, name);
  if (existsSync(held) && !existsSync(original)) {
    renameSync(held, original);
    console.warn(`[cf-build] 이전 빌드에서 격리된 ${name} 을 복구했습니다.`);
  }
}

const moved = [];
const restore = () => {
  for (const [to, from] of moved.splice(0)) {
    if (existsSync(to) && !existsSync(from)) renameSync(to, from);
  }
};
for (const name of QUARANTINE) {
  const from = path.join(root, name);
  if (existsSync(from)) {
    const to = path.join(root, `${name}.cfbuild-hold`);
    renameSync(from, to);
    moved.push([to, from]);
  }
}
// 빌드 중 중단돼도 .env 를 제자리에 돌려놓는다.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    restore();
    process.exit(130);
  });
}
process.on("exit", restore);

let status = 1;
try {
  const result = spawnSync("pnpm", ["exec", "opennextjs-cloudflare", "build"], {
    stdio: "inherit",
    env: { ...process.env, CF_BUILD: "1" },
  });
  status = result.status ?? 1;
} finally {
  restore();
}

if (status !== 0) process.exit(status);

// 비밀 키 검사. 검사 대상 파일이 없으면 통과가 아니라 실패다 (OpenNext 출력 구조가 바뀐 경우 조용히 넘어가지 않도록).
const envFile = path.join(root, ".open-next", "cloudflare", "next-env.mjs");
if (!existsSync(envFile)) {
  console.error(`[cf-build] ${path.relative(root, envFile)} 이 없어 비밀 키 검사를 할 수 없습니다. 빌드를 중단합니다.`);
  process.exit(2);
}
const content = readFileSync(envFile, "utf8");
const leaked = FORBIDDEN_KEYS.filter((key) => content.includes(`"${key}"`));
if (leaked.length > 0) {
  console.error(`[cf-build] 번들(next-env.mjs)에 비밀 키가 포함되어 빌드를 중단합니다: ${leaked.join(", ")}`);
  process.exit(2);
}
console.log("[cf-build] next-env.mjs 에 비밀 키 없음 (확인 완료)");

// 키 이름이 아니라 실제 비밀 "값" 이 .open-next 어디에든 인라인됐는지도 본다 (다른 이름으로 들어간 값, 서버 함수 번들 포함).
function envValues(file) {
  const out = new Map();
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m || !FORBIDDEN_KEYS.includes(m[1])) continue;
    const value = m[2].trim().replace(/^(["'])(.*)\1$/, "$2");
    if (value.length >= 12) out.set(m[1], value);
  }
  return out;
}
// .env.example 의 값은 공개 자리표시자다 (order-token.ts 가 운영에서 거부할 값으로 소스에 그대로 들어 있다). 검사에서 뺀다.
const placeholders = new Set(envValues(path.join(root, ".env.example")).values());
const secretValues = new Set();
for (const name of [...QUARANTINE, ".dev.vars"]) {
  for (const value of envValues(path.join(root, name)).values()) {
    if (!placeholders.has(value)) secretValues.add(value);
  }
}
function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(m?js|json|html|txt)$/.test(entry)) yield full;
  }
}
if (secretValues.size > 0) {
  const openNext = path.join(root, ".open-next");
  for (const file of walk(openNext)) {
    const text = readFileSync(file, "utf8");
    for (const value of secretValues) {
      if (text.includes(value)) {
        console.error(`[cf-build] 번들에 비밀 값이 그대로 들어 있습니다: ${path.relative(root, file)}. 빌드를 중단합니다.`);
        process.exit(2);
      }
    }
  }
  console.log(`[cf-build] .open-next 전체에서 비밀 값 ${secretValues.size}개 미검출 (확인 완료)`);
}

// Workers Assets 는 정적 파일을 Worker 앞에서 응답하므로 next.config 의 headers() 가 적용되지 않는다.
// 같은 보안 헤더를 _headers 파일로 준다. Next 의 해시 자산(/_next/static)은 내용이 바뀌면 경로도 바뀌므로
// 1년 immutable 로 두고, 해시가 없는 public/ 자산은 하루만 캐시한다 (Assets 기본값은 max-age=0 이라 브라우저가 매번 재검증한다).
const assetsDir = path.join(root, ".open-next", "assets");
if (existsSync(assetsDir)) {
  writeFileSync(
    path.join(assetsDir, "_headers"),
    [
      "/*",
      "  X-Content-Type-Options: nosniff",
      "  X-Frame-Options: SAMEORIGIN",
      "  Referrer-Policy: strict-origin-when-cross-origin",
      "  Permissions-Policy: camera=(), microphone=(), geolocation=()",
      "  Strict-Transport-Security: max-age=63072000; includeSubDomains",
      "",
      "/_next/static/*",
      "  Cache-Control: public, max-age=31536000, immutable",
      "",
      "/visuals/*",
      "  Cache-Control: public, max-age=86400, stale-while-revalidate=604800",
      "",
      "/brand/*",
      "  Cache-Control: public, max-age=86400, stale-while-revalidate=604800",
      "",
      "/icon.svg",
      "  Cache-Control: public, max-age=86400, stale-while-revalidate=604800",
      "",
    ].join("\n"),
  );
  console.log("[cf-build] .open-next/assets/_headers 작성 (정적 자산 보안·캐시 헤더)");
}
