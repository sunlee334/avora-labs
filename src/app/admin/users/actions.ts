"use server";

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { assertAdmin } from "@/lib/auth/guards";
import { hashPassword } from "@/lib/auth/password";
import { destroyAllSessions } from "@/lib/auth/session";
import { TEMP_PASSWORD_TTL_MS } from "@/lib/auth/temp-password";

export interface TempPasswordState {
  error?: string;
  email?: string;
  tempPassword?: string;
}

const schema = z.object({ userId: z.coerce.number().int().positive() });

/**
 * 임시 비밀번호 발급. 이메일 발송 연동 전까지 고객 비밀번호 분실의 유일한 복구 경로다.
 * 발급 즉시 해당 회원의 모든 세션을 끊고, 비밀번호는 이 응답에만 한 번 보여준다 (URL·로그에 남기지 않는다).
 * 관리자는 CS 채널로 전달하고, 고객은 24시간 안에 로그인해 새 비밀번호를 정한다 (그 전까지는 비밀번호 변경 화면만 열린다).
 */
export async function issueTempPasswordAction(_prev: TempPasswordState, formData: FormData): Promise<TempPasswordState> {
  await assertAdmin();
  const parsed = schema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return { error: "회원을 확인해 주세요." };

  const user = await db.query.users.findFirst({ where: eq(users.id, parsed.data.userId) });
  if (!user) return { error: "회원을 찾을 수 없습니다." };

  // 12자 base64url (약 72비트). 혼동 없는 문자 집합으로 한 번 더 걸러 읽어 주기 쉽게 한다.
  const tempPassword = randomBytes(18).toString("base64url").replace(/[-_0OIl1]/g, "x").slice(0, 12);
  try {
    await db
      .update(users)
      .set({
        passwordHash: await hashPassword(tempPassword),
        // 24시간 안에 로그인해 새 비밀번호를 정해야 한다. 그 전까지 계정 화면은 비밀번호 변경 화면으로만 열린다.
        passwordResetRequired: true,
        tempPasswordExpiresAt: new Date(Date.now() + TEMP_PASSWORD_TTL_MS),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));
    await destroyAllSessions(user.id);
  } catch (error) {
    console.error("[admin] temp password failed", error);
    return { error: "임시 비밀번호를 발급하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
  console.log(JSON.stringify({ level: "info", event: "admin.temp_password_issued", userId: user.id }));
  return { email: user.email, tempPassword };
}
