import "server-only";
import { redirect } from "next/navigation";
import { localizePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { destroyAllSessions, getCurrentUser, type SessionUser } from "./session";
import { tempPasswordState } from "./temp-password";

/**
 * 임시 비밀번호로 들어온 사용자는 새 비밀번호를 정하기 전까지 비밀번호 변경 화면으로만 보낸다.
 * 로그인 뒤 24시간이 지나도록 바꾸지 않았으면 세션을 끊고 다시 발급받게 한다 (유출된 임시 비밀번호의 유효 창을 로그인 시점이 아니라 실제 사용 시점으로 묶는다).
 */
async function redirectIfPasswordResetRequired(user: SessionUser, nextPath: string): Promise<void> {
  const state = tempPasswordState(user);
  if (state === "ok") return;
  const locale = await getLocale();
  if (state === "expired") {
    // 서버 컴포넌트 렌더링 중이라 쿠키는 지울 수 없다. DB 세션을 지우면 쿠키는 더 이상 유효하지 않다.
    await destroyAllSessions(user.id);
    redirect(`${localizePath(locale, "/login")}?next=${encodeURIComponent(localizePath(locale, nextPath))}`);
  }
  redirect(`${localizePath(locale, "/account/password")}?next=${encodeURIComponent(localizePath(locale, nextPath))}`);
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
