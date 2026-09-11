import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PasswordForm } from "@/components/account/PasswordForm";
import { PageTitle } from "@/components/ui/Primitives";
import { localizePath } from "@/i18n/config";
import { getT } from "@/i18n/server";
import { safeRelativePath } from "@/lib/auth/safe-path";
import { getCurrentUser } from "@/lib/auth/session";
import { firstParam } from "@/lib/search-params";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getT();
  return { title: m.account.password, robots: { index: false } };
}

/**
 * 비밀번호 변경 화면. 임시 비밀번호로 로그인한 사용자는 새 비밀번호를 정하기 전까지 다른 계정 화면 대신 여기로 온다.
 * requireUser 를 쓰지 않는다 — 그 가드가 다시 이 화면으로 보내 루프가 되기 때문.
 */
export default async function AccountPasswordPage({ searchParams }: PageProps<"/[locale]/account/password">) {
  const { locale, m } = await getT();
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) {
    redirect(`${localizePath(locale, "/login")}?next=${encodeURIComponent(localizePath(locale, "/account/password"))}`);
  }
  const fallback = user.role === "admin" ? "/admin" : localizePath(locale, "/account");
  const next = safeRelativePath(firstParam(sp.next), fallback);
  const forced = user.passwordResetRequired;

  return (
    <>
      <PageTitle
        eyebrow="ACCOUNT"
        title={forced ? m.account.passwordResetTitle : m.account.password}
        lede={forced ? m.account.passwordResetLede : m.account.passwordLede}
      />
      <div className="container-x max-w-xl pb-24">
        <PasswordForm next={next} />
      </div>
    </>
  );
}
