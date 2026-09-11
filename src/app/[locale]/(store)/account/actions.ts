"use server";

import { revalidatePath } from "next/cache";
import { safeRelativePath } from "@/lib/auth/safe-path";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { localizePath } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import { getT } from "@/i18n/server";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { rateLimit } from "@/lib/auth/rate-limit";
import { createSession, destroyAllSessions, destroySession, getCurrentUser } from "@/lib/auth/session";
import { zodFieldErrors } from "@/lib/forms";

export interface AccountState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
}

/** 스키마는 요청 언어의 문구로 매번 만든다. */
function buildProfileSchema(m: Messages) {
  const a = m.actions.auth;
  return z.object({
    name: z.string().min(1, { message: a.nameRequired }).max(40, { message: a.nameMax }),
    phone: z
      .string()
      .regex(/^\d{10,11}$/, { message: a.phoneInvalid })
      .optional(),
  });
}

export async function updateProfile(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const { m } = await getT();
  const user = await getCurrentUser();
  if (!user) return { error: m.actions.loginAgain };

  const rawPhone = String(formData.get("phone") ?? "").replace(/-/g, "").trim();
  const parsed = buildProfileSchema(m).safeParse({
    name: String(formData.get("name") ?? "").trim(),
    phone: rawPhone === "" ? undefined : rawPhone,
  });
  if (!parsed.success) {
    return { error: m.actions.invalidInput, fieldErrors: zodFieldErrors(parsed.error) };
  }

  try {
    await db
      .update(users)
      .set({ name: parsed.data.name, phone: parsed.data.phone ?? null, updatedAt: new Date() })
      .where(eq(users.id, user.id));
  } catch (error) {
    console.error("[account] profile update failed", error);
    return { error: m.actions.saveFailed };
  }

  revalidatePath("/[locale]/account", "page");
  return { success: m.actions.account.profileSaved };
}

export async function updateConsents(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const { m } = await getT();
  const user = await getCurrentUser();
  if (!user) return { error: m.actions.loginAgain };

  try {
    await db
      .update(users)
      .set({
        marketingEmailOptIn: formData.get("marketingEmail") === "on",
        marketingSmsOptIn: formData.get("marketingSms") === "on",
        consentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));
  } catch (error) {
    console.error("[account] consent update failed", error);
    return { error: m.actions.saveFailed };
  }

  revalidatePath("/[locale]/account", "page");
  return { success: m.actions.account.consentSaved };
}

/** 모든 기기에서 로그아웃. 세션 유출이 의심될 때 고객이 스스로 끊을 수 있는 유일한 수단이다. */
export async function logoutEverywhereAction(): Promise<void> {
  const { locale } = await getT();
  const user = await getCurrentUser();
  if (user) {
    await destroyAllSessions(user.id);
  }
  await destroySession();
  redirect(localizePath(locale, "/login"));
}

function buildPasswordSchema(m: Messages) {
  const a = m.actions.auth;
  return z
    .object({
      currentPassword: z.string().min(1, { message: a.currentPasswordRequired }),
      newPassword: z.string().min(8, { message: a.passwordMin }).max(72, { message: a.passwordMax }),
      confirmPassword: z.string(),
    })
    .refine((v) => v.newPassword === v.confirmPassword, {
      message: a.passwordMismatch,
      path: ["confirmPassword"],
    })
    .refine((v) => v.newPassword !== v.currentPassword, {
      message: a.passwordSame,
      path: ["newPassword"],
    });
}

/** 비밀번호 변경. 성공하면 다른 기기 세션을 모두 지우고 이 기기만 새 세션으로 유지한다. */
export async function changePasswordAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const { locale, m } = await getT();
  const user = await getCurrentUser();
  if (!user) return { error: m.actions.loginAgain };

  const limit = await rateLimit(`password-change:${user.id}`, { limit: 5, windowMs: 10 * 60_000 });
  if (!limit.ok) return { error: m.actions.generic };

  const parsed = buildPasswordSchema(m).safeParse({
    currentPassword: String(formData.get("currentPassword") ?? ""),
    newPassword: String(formData.get("newPassword") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });
  if (!parsed.success) {
    return { error: m.actions.invalidInput, fieldErrors: zodFieldErrors(parsed.error) };
  }

  try {
    const row = await db.query.users.findFirst({ where: eq(users.id, user.id) });
    if (!row || !(await verifyPassword(parsed.data.currentPassword, row.passwordHash))) {
      return {
        error: m.actions.auth.currentPasswordWrong,
        fieldErrors: { currentPassword: m.actions.auth.currentPasswordWrong },
      };
    }
    await db
      .update(users)
      .set({
        passwordHash: await hashPassword(parsed.data.newPassword),
        // 임시 비밀번호 강제 변경 흐름이면 여기서 풀린다.
        passwordResetRequired: false,
        tempPasswordExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));
    await destroyAllSessions(user.id);
    await createSession(user.id);
  } catch (error) {
    console.error("[account] password change failed", error);
    return { error: m.actions.saveFailed };
  }

  if (user.passwordResetRequired) {
    // 강제 변경을 마쳤으면 원래 가려던 곳으로 (관리자는 /admin, 그 외 현재 언어의 내 계정)
    const fallback = user.role === "admin" ? "/admin" : localizePath(locale, "/account");
    redirect(safeRelativePath(String(formData.get("next") ?? ""), fallback));
  }
  return { success: m.actions.auth.passwordChanged };
}
