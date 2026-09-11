import type { Metadata } from "next";
import { PageTitle, Section } from "@/components/ui/Primitives";
import { getContent } from "@/content";
import { localeAlternates } from "@/i18n/metadata";
import { getT } from "@/i18n/server";
import { PolicySections } from "../_components/PolicySections";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, m } = await getT();
  return {
    title: m.pages.policy.shippingMeta,
    description: m.pages.policy.shippingDesc,
    alternates: localeAlternates(locale, "/policy/shipping-returns"),
  };
}

export default async function ShippingReturnsPage() {
  const { locale, m } = await getT();
  const { SHIPPING_RETURNS_POLICY, legalNotice } = getContent(locale);
  return (
    <>
      <PageTitle eyebrow={m.pages.policy.eyebrow} title={SHIPPING_RETURNS_POLICY.title} lede={SHIPPING_RETURNS_POLICY.updatedNote} />
      <Section className="pt-0">
        <PolicySections sections={SHIPPING_RETURNS_POLICY.sections} legalNotice={legalNotice} />
      </Section>
    </>
  );
}
