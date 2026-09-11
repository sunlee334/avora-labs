import type { Metadata } from "next";
import { PageTitle, Section } from "@/components/ui/Primitives";
import { getContent } from "@/content";
import { localeAlternates } from "@/i18n/metadata";
import { getT } from "@/i18n/server";
import { PolicySections } from "../_components/PolicySections";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, m } = await getT();
  return {
    title: m.pages.policy.termsMeta,
    description: m.pages.policy.termsDesc,
    alternates: localeAlternates(locale, "/policy/terms"),
  };
}

export default async function TermsPage() {
  const { locale, m } = await getT();
  const { TERMS_POLICY, legalNotice } = getContent(locale);
  return (
    <>
      <PageTitle eyebrow={m.pages.policy.eyebrow} title={TERMS_POLICY.title} lede={TERMS_POLICY.updatedNote} />
      <Section className="pt-0">
        <PolicySections sections={TERMS_POLICY.sections} legalNotice={legalNotice} />
      </Section>
    </>
  );
}
