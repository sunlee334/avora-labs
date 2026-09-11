import "server-only";
import { redirect } from "next/navigation";
import { localizePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { getCurrentUser, type SessionUser } from "./session";

/** 임시 비밀번호로 들어온 사용자는 새 비밀번호를 정하기 전까지 비밀번호 변경 화면으로만 보낸다. */
async function redirectIfPasswordResetRequired(user: SessionUser, nextPath: string): Promise<void> {
  if (!user.passwordResetRequired) return;
  const locale = await getLocale();
  redirect(`${localizePath(locale, "/account/password")}?next=${encodeURIComponent(nextPath)}`);
}

/** 로그인 필수. 미로그인 시 (현재 언어의) /login?next= 로 이동. `nextPath` 는 접두사 없는 스토어 경로. */
export async function requireUser(nextPath = "/account"): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    const locale = await getLocale();
    redirect(`${localizePath(locale, "/login")}?next=${encodeURIComponent(localizePath(locale, nextPath))}`);
  }
  await redirectIfPasswordResetRequired(user, nextPath);
  return user;
}

/** 관리자 필수. 미로그인 → /login, 권한 없음 → /. 관리자 화면은 한국어 고정이라 접두사를 붙이지 않는다. */
export async function requireAdmin(nextPath = "/admin"): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  if (user.role !== "admin") redirect("/");
  await redirectIfPasswordResetRequired(user, nextPath);
  return user;
}

/** 서버 액션 내부용: 리다이렉트 대신 에러를 던진다. */
export async function assertAdmin(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}
