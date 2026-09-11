import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { Card, PageTitle } from "@/components/ui/Primitives";
import { localizePath } from "@/i18n/config";
import { localeAlternates } from "@/i18n/metadata";
import { getT } from "@/i18n/server";
import { safeRelativePath } from "@/lib/auth/safe-path";
import { getCurrentUser } from "@/lib/auth/session";
import { firstParam } from "@/lib/search-params";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, m } = await getT();
  return { title: m.auth.registerTitle, alternates: localeAlternates(locale, "/register"), robots: { index: false } };
}

function safeNext(raw: string | undefined, fallback: string): string {
  return raw ? safeRelativePath(raw, fallback) : fallback;
}

export default async function RegisterPage({ searchParams }: PageProps<"/[locale]/register">) {
  const { locale, m } = await getT();
  const sp = await searchParams;
  const next = firstParam(sp.next) || undefined;
  const user = await getCurrentUser();
  if (user) {
    // 관리자 화면은 한국어 고정이라 접두사를 붙이지 않는다.
    redirect(safeNext(next, user.role === "admin" ? "/admin" : localizePath(locale, "/account")));
  }

  return (
    <>
      <PageTitle eyebrow="ACCOUNT" title={m.auth.registerTitle} lede={m.auth.registerLede} />
      <div className="container-x pb-24">
        <Card className="mx-auto max-w-md">
          <RegisterForm next={next} />
        </Card>
      </div>
    </>
  );
}
