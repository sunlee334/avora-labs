import type { Metadata } from "next";
import { Card, PageTitle } from "@/components/ui/Primitives";
import { localeAlternates } from "@/i18n/metadata";
import { getT } from "@/i18n/server";
import { LookupForm } from "./LookupForm";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, m } = await getT();
  return { title: m.lookup.metaTitle, alternates: localeAlternates(locale, "/orders/lookup") };
}

export default async function OrderLookupPage() {
  const { m } = await getT();
  return (
    <>
      <PageTitle eyebrow="ORDERS" title={m.lookup.title} lede={m.lookup.lede} />
      <div className="container-x pb-24">
        <Card className="mx-auto max-w-xl">
          <LookupForm />
        </Card>
      </div>
    </>
  );
}
