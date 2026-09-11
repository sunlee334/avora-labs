"use server";

import { createHash } from "node:crypto";
import { tempPasswordState } from "@/lib/auth/temp-password";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { localizePath } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { attachCartToUser } from "@/lib/cart";
import { isRateLimited, rateLimit, resetRateLimit } from "@/lib/auth/rate-limit";
import { isUniqueViolation } from "@/lib/db-errors";
import { zodFieldErrors } from "@/lib/forms";
import { safeRelativePath } from "@/lib/auth/safe-path";
import { clientIp } from "@/lib/request-ip";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { eq } from "drizzle-orm";

export interface AuthState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

/** 같은 오리진의 상대 경로만 허용한다. "//"·절대 URL은 거부한다. */
function safeNext(raw: FormDataEntryValue | null | undefined, fallback: string): string {
  return typeof raw === "string" ? safeRelativePath(raw, fallback) : fallback;
}

// 타이밍 공격 방지용 더미 해시. 사용자를 찾지 못했을 때도 동일한 비용의 검증을 수행한다.
let dummyHash: string | null = null;
async function getDummyHash(): Promise<string> {
  dummyHash ??= await hashPassword("timing-safety-dummy-password-000");
  return dummyHash;
}

/** 스키마는 요청 언어의 문구로 매번 만든다. */
function buildRegisterSchema(m: Messages) {
  const a = m.actions.auth;
  return z.object({
    email: z.email({ message: a.emailInvalid }).max(254),
    password: z.string().min(8, { message: a.passwordMin }).max(72, { message: a.passwordMax }),
    name: z.string().min(1, { message: a.nameRequired }).max(40, { message: a.nameMax }),
    phone: z
      .string()
      .regex(/^\d{10,11}$/, { message: a.phoneInvalid })
      .optional(),
    terms: z.literal("on", { message: a.termsRequired }),
    privacy: z.literal("on", { message: a.privacyRequired }),
    marketingEmail: z.literal("on").optional(),
    marketingSms: z.literal("on").optional(),
  });
}

export async function registerAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const { locale, m } = await getT();
  const ip = await clientIp();
  const limit = await rateLimit(`register:${ip}`, { limit: 5, windowMs: 10 * 60_000 });
  if (!limit.ok) {
    return { error: m.actions.generic };
  }

  const rawPhone = String(formData.get("phone") ?? "").replace(/-/g, "").trim();
  const parsed = buildRegisterSchema(m).safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
    name: String(formData.get("name") ?? "").trim(),
    phone: rawPhone === "" ? undefined : rawPhone,
    terms: formData.get("terms"),
    privacy: formData.get("privacy"),
    // 체크하지 않은 체크박스는 FormData에서 null 이므로 optional literal 이 통과하도록 undefined 로 바꾼다.
    marketingEmail: formData.get("marketingEmail") ?? undefined,
    marketingSms: formData.get("marketingSms") ?? undefined,
  });
  if (!parsed.success) {
    return { error: m.actions.invalidInput, fieldErrors: zodFieldErrors(parsed.error) };
  }

  const { email, password, name, phone, marketingEmail, marketingSms } = parsed.data;

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) {
    return { fieldErrors: { email: m.actions.auth.emailTaken } };
  }

  let userId: number;
  try {
    const [row] = await db
      .insert(users)
      .values({
        email,
        passwordHash: await hashPassword(password),
        name,
        phone: phone ?? null,
        marketingEmailOptIn: marketingEmail === "on",
        marketingSmsOptIn: marketingSms === "on",
        consentAt: new Date(),
      })
      .returning();
    userId = row.id;
  } catch (error) {
    if (isUniqueViolation(error, "users.email")) {
      return { fieldErrors: { email: m.actions.auth.emailTaken } };
    }
    console.error("[auth] register insert failed", error);
    return { error: m.actions.auth.registerFailed };
  }

  await createSession(userId);
  await attachCartToUser(userId);
  redirect(safeNext(formData.get("next"), localizePath(locale, "/account")));
}

function buildLoginSchema(m: Messages) {
  return z.object({
    email: z.email({ message: m.actions.auth.emailInvalid }).max(254),
    password: z.string().min(1, { message: m.actions.auth.passwordRequired }),
  });
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const { locale, m } = await getT();
  const loginFailMessage = m.actions.auth.loginFailed;
  const ip = await clientIp();
  const rawEmail = String(formData.get("email") ?? "").trim().toLowerCase();

  // IP 버킷은 시도마다, 계정 버킷은 실패 시에만 카운트한다 (정상 사용자 잠금 방지).
  // 계정 버킷은 (이메일, IP) 조합이다 — 이메일만으로 묶으면 남의 계정을 10번 틀려 영구히 잠글 수 있다.
  // 키에는 검증 전 원문 대신 해시를 쓴다 — 임의 길이 문자열이 rate_limits PK 로 저장되지 않도록.
  const emailKey = `login:acct:${createHash("sha256").update(`${rawEmail.slice(0, 254)}|${ip}`).digest("hex").slice(0, 32)}`;
  const ipLimit = await rateLimit(`login:ip:${ip}`, { limit: 10, windowMs: 10 * 60_000 });
  if (!ipLimit.ok || (await isRateLimited(emailKey, 10))) {
    return { error: m.actions.generic };
  }
  const recordFailure = () => rateLimit(emailKey, { limit: 10, windowMs: 10 * 60_000 });

  const parsed = buildLoginSchema(m).safeParse({
    email: rawEmail,
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) {
    await recordFailure();
    return { error: loginFailMessage };
  }

  const { email, password } = parsed.data;
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user) {
    await verifyPassword(password, await getDummyHash());
    await recordFailure();
    return { error: loginFailMessage };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await recordFailure();
    return { error: loginFailMessage };
  }

  // 임시 비밀번호: 24시간이 지났으면 거부(다시 발급), 아직이면 로그인시키되 비밀번호 변경 화면으로 보낸다.
  const tempState = tempPasswordState(user);
  if (tempState === "expired") {
    return { error: m.actions.auth.tempPasswordExpired };
  }

  await resetRateLimit(emailKey);
  await createSession(user.id);
  await attachCartToUser(user.id);
  // 관리자 화면은 한국어 고정이라 접두사를 붙이지 않는다.
  const fallback = user.role === "admin" ? "/admin" : localizePath(locale, "/account");
  const next = safeNext(formData.get("next"), fallback);
  if (tempState === "reset_required") {
    redirect(`${localizePath(locale, "/account/password")}?next=${encodeURIComponent(next)}`);
  }
  redirect(next);
}

export async function logoutAction(): Promise<void> {
  const { locale } = await getT();
  await destroySession();
  redirect(localizePath(locale, "/"));
}
