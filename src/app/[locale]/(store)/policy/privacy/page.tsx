import type { Metadata } from "next";
import { PageTitle, Section } from "@/components/ui/Primitives";
import { getContent } from "@/content";
import { localeAlternates } from "@/i18n/metadata";
import { getT } from "@/i18n/server";
import { COMPANY } from "@/lib/config";
import { PolicySections } from "../_components/PolicySections";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, m } = await getT();
  return {
    title: m.pages.policy.privacyMeta,
    description: m.pages.policy.privacyDesc,
    alternates: localeAlternates(locale, "/policy/privacy"),
  };
}

export default async function PrivacyPage() {
  const { locale, m } = await getT();
  const { PRIVACY_POLICY, legalNotice } = getContent(locale);
  // 법정 표시: 상호는 등록된 한글 상호를 항상 함께 적는다.
  const companyLine = locale === "ko" ? `${COMPANY.name} (${COMPANY.nameEn})` : `${COMPANY.nameEn} (${COMPANY.name})`;
  return (
    <>
      <PageTitle eyebrow={m.pages.policy.eyebrow} title={PRIVACY_POLICY.title} lede={PRIVACY_POLICY.updatedNote} />
      <Section className="pt-0">
        <PolicySections sections={PRIVACY_POLICY.sections} legalNotice={legalNotice} />
        <div className="mt-10 border-t border-line pt-8">
          <h2 className="text-lg font-semibold tracking-tight text-ink">{m.pages.policy.contactTitle}</h2>
          <p className="measure mt-3 text-[15px] leading-relaxed text-stone">{m.pages.policy.contactBody}</p>
          <dl className="mt-4 space-y-1.5 text-[14px] text-stone">
            <div className="flex gap-2">
              <dt className="shrink-0 text-stone-2">{m.footer.company.name}</dt>
              <dd>{companyLine}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 text-stone-2">{m.footer.company.ceo}</dt>
              <dd>{COMPANY.ceo}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 text-stone-2">{m.footer.company.address}</dt>
              <dd>{m.footer.address}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 text-stone-2">{m.footer.company.cs}</dt>
              <dd>
                {m.common.csChannel} · {m.common.csHours}
              </dd>
            </div>
          </dl>
        </div>
      </Section>
    </>
  );
}
