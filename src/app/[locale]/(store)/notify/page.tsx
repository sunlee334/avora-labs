import type { Metadata } from "next";
import { NotifyForm } from "@/components/notify/NotifyForm";
import { PageTitle } from "@/components/ui/Primitives";
import { Link } from "@/i18n/link";
import { localeAlternates } from "@/i18n/metadata";
import { getT } from "@/i18n/server";
import { getProducts } from "@/lib/catalog";

// DB 를 읽는 페이지는 항상 요청 시점에 렌더링한다 (Workers 빌드 프리렌더 중 D1 접근 방지).
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, m } = await getT();
  return { title: m.notify.metaTitle, alternates: localeAlternates(locale, "/notify") };
}

export default async function NotifyPage({ searchParams }: PageProps<"/[locale]/notify">) {
  const { m } = await getT();
  const { interest } = await searchParams;
  const rawInterest = Array.isArray(interest) ? interest[0] : interest;
  const products = await getProducts();
  const upcoming = products.filter((p) => p.status === "upcoming");

  const tabs = [{ value: "all", label: m.notify.all }, ...upcoming.map((p) => ({ value: p.slug, label: p.name }))];
  const selected = tabs.some((t) => t.value === rawInterest) ? (rawInterest as string) : "all";

  return (
    <>
      <PageTitle eyebrow={m.notify.eyebrow} title={m.notify.title} lede={m.notify.lede} />
      <div className="container-x pb-24">
        <div className="mx-auto max-w-md space-y-6">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <Link
                key={tab.value}
                href={`/notify?interest=${tab.value}`}
                className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition ${
                  selected === tab.value ? "bg-ink text-paper" : "bg-paper-2 text-stone hover:text-ink"
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </div>
          <NotifyForm interest={selected} buttonLabel={m.notify.button} />
        </div>
      </div>
    </>
  );
}
