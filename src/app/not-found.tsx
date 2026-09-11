import type { Metadata } from "next";
import { NotFoundContent } from "@/components/site/NotFoundContent";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getT();
  return { title: m.pages.notFound.metaTitle };
}

/** 어떤 라우트에도 해당하지 않는 URL. 루트 레이아웃에는 스토어 골격이 없으므로 직접 그린다. */
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <NotFoundContent />
      </main>
      <SiteFooter />
    </>
  );
}
