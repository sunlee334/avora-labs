import "dotenv/config";
import { hashPassword } from "../src/lib/auth/password";

/**
 * Cloudflare D1 용 기본 시드 SQL 을 stdout 으로 출력한다 (카탈로그 4종, 관리자, 펀딩 재구매 코드).
 *   pnpm cf:seed:sql > data/seed.sql
 *   pnpm exec wrangler d1 execute paros-store --remote --file=data/seed.sql
 * 멱등: 이미 있는 행은 건너뛴다 (INSERT OR IGNORE, unique 인덱스 기준). 관리자 계정도 이미 있으면 비밀번호를 바꾸지 않는다 —
 * 로컬 .env 의 ADMIN_PASSWORD 가 실수로 운영 관리자 비밀번호를 덮어쓰지 않도록.
 * 비밀번호를 교체하려면 명시적으로 `--reset-admin-password` 를 붙인다.
 */
function q(value: string | number | null): string {
  if (value === null) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${value.replace(/'/g, "''")}'`;
}

async function main() {
  const now = Date.now();
  const resetAdminPassword = process.argv.includes("--reset-admin-password");
  const adminEmail = (process.env.ADMIN_EMAIL ?? "admin@avoralabs.co").toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.length < 12) {
    throw new Error("ADMIN_PASSWORD(12자 이상) 환경 변수가 필요합니다.");
  }
  const passwordHash = await hashPassword(adminPassword);

  const products = [
    ["daily-sunscreen", "PAROS Daily Sunscreen", "움직이는 하루 전체를 위한 데일리 선크림 50ml", "SPF50+ / PA++++. 무향, 무톤업. 무엇을 포기하지 않을지 먼저 정하고 그 기준으로 고른 처방.", 1, "SUN · MOVE", "on_sale", "2027 상반기 출시", "/visuals/product-tube.svg", 1],
    ["mini", "PAROS Mini", "핸드폰 케이스에 끼우는 휴대용 재도포 사이즈", "재도포는 휴대할 수 있어야 성립합니다. 러닝이나 야외 활동 시 가방 없이 챙기는 납작한 형태.", 2, "REAPPLY", "upcoming", "2028 상반기 예정", "/visuals/product-mini.svg", 2],
    ["after-care", "PAROS After Care", "활동 후 케어 — 샴푸 · 바디워시", "땀 흘린 뒤 씻어내는 순간. 선케어의 계절성을 보완하는 연중 라인.", 3, "SWEAT · RESET", "upcoming", "2028 하반기 이후", "/visuals/product-aftercare.svg", 3],
    ["deodorant", "PAROS Deodorant", "활동 중 냄새 관리", "타깃의 사용 맥락과 가장 직접적으로 연결되는 품목. 3단계 이후 검토.", 4, "SWEAT", "upcoming", "3단계 이후", "/visuals/product-deodorant.svg", 4],
  ] as const;

  // D1 은 파일 내 BEGIN/COMMIT 을 허용하지 않는다. wrangler 가 문장들을 하나의 batch 로 실행한다.
  const lines: string[] = [
    `-- PAROS base seed (generated${resetAdminPassword ? ", admin password reset" : ""})`,
  ];
  for (const p of products) {
    lines.push(
      `INSERT OR IGNORE INTO products (slug, name, subtitle, description, stage, code, status, launch_label, image, sort_order, created_at, updated_at) VALUES (${p.map((v) => q(v)).join(", ")}, ${now}, ${now});`,
    );
  }
  lines.push(
    `INSERT OR IGNORE INTO variants (product_id, sku, name, units_per_pack, price_krw, compare_at_krw, stock, is_default, is_active, sort_order) SELECT id, 'PAROS-DS-50-1', '본품 50ml', 1, 32000, NULL, 2000, 1, 1, 1 FROM products WHERE slug = 'daily-sunscreen';`,
    `INSERT OR IGNORE INTO variants (product_id, sku, name, units_per_pack, price_krw, compare_at_krw, stock, is_default, is_active, sort_order) SELECT id, 'PAROS-DS-50-2SET', '2개 세트 (자사몰 전용)', 2, 56000, 64000, 500, 0, 1, 2 FROM products WHERE slug = 'daily-sunscreen';`,
    resetAdminPassword
      ? `INSERT INTO users (email, password_hash, name, phone, role, marketing_email_opt_in, marketing_sms_opt_in, consent_at, created_at, updated_at) VALUES (${q(adminEmail)}, ${q(passwordHash)}, 'AVORA LABS', NULL, 'admin', 0, 0, ${now}, ${now}, ${now}) ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, role = 'admin', updated_at = excluded.updated_at;`
      : `INSERT OR IGNORE INTO users (email, password_hash, name, phone, role, marketing_email_opt_in, marketing_sms_opt_in, consent_at, created_at, updated_at) VALUES (${q(adminEmail)}, ${q(passwordHash)}, 'AVORA LABS', NULL, 'admin', 0, 0, ${now}, ${now}, ${now});`,
    `INSERT OR IGNORE INTO coupons (code, type, value, min_subtotal_krw, max_uses, used_count, per_user_limit, starts_at, ends_at, is_active, note, created_at) VALUES ('WITHPAROS', 'free_shipping', 0, 0, 500, 0, 1, NULL, NULL, 1, '펀딩 참여자 전용 재구매 코드. 리워드 발송 시 동봉.', ${now});`,
  );
  process.stdout.write(lines.join("\n") + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
