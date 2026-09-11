import type { Metadata } from "next";
import Image from "next/image";
import { PageTitle, Section, Divider } from "@/components/ui/Primitives";
import { getContent } from "@/content";
import { Link } from "@/i18n/link";
import { localeAlternates } from "@/i18n/metadata";
import { getT } from "@/i18n/server";
import { CodeLight } from "@/components/visuals/CodeLight";
import { CodeWind } from "@/components/visuals/CodeWind";
import { CodeWater } from "@/components/visuals/CodeWater";
import { CodeStone } from "@/components/visuals/CodeStone";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, m } = await getT();
  return {
    title: m.pages.brand.metaTitle,
    description: m.pages.brand.metaDescription,
    alternates: localeAlternates(locale, "/brand"),
  };
}

const CODE_VISUALS = { light: CodeLight, wind: CodeWind, water: CodeWater, stone: CodeStone } as const;

export default async function BrandPage() {
  const { locale, m } = await getT();
  const { BRAND, BRAND_CODES } = getContent(locale);
  return (
    <>
      <PageTitle eyebrow={BRAND.eyebrow} title={BRAND.title} lede={BRAND.intro} />

      <Section eyebrow={BRAND.company.eyebrow} title={BRAND.company.title} className="pt-0">
        <div className="measure space-y-4">
          {BRAND.company.body.map((p, i) => (
            <p key={i} className="text-[15px] leading-relaxed text-stone">
              {p}
            </p>
          ))}
          <p className="text-[15px] leading-relaxed text-stone">
            {BRAND.company.standardNote.before}{" "}
            <Link href={BRAND.company.standardNote.link.href} className="font-medium text-ink underline underline-offset-4">
              {BRAND.company.standardNote.link.label}
            </Link>
            {BRAND.company.standardNote.after}
          </p>
        </div>
        <div className="mt-10 flex items-center gap-3 text-stone-2">
          <span className="text-xs">by</span>
          <Image src="/brand/avora-wordmark-forest.svg" alt="AVORA LABS" width={140} height={30} className="h-6 w-auto" />
        </div>
      </Section>

      <Section eyebrow={BRAND.movementCare.eyebrow} title={BRAND.movementCare.title} className="pt-0">
        <p className="measure text-[15px] leading-relaxed text-stone">{BRAND.movementCare.body}</p>
      </Section>

      <Section eyebrow={BRAND.positioning.eyebrow} title={BRAND.positioning.title} className="pt-0">
        <p className="measure text-[15px] leading-relaxed text-stone">{BRAND.positioning.body}</p>
      </Section>

      <Section eyebrow={BRAND.target.eyebrow} title={BRAND.target.title} className="pt-0">
        <p className="measure text-[15px] leading-relaxed text-stone">{BRAND.target.body}</p>
      </Section>

      <Section eyebrow={m.pages.brand.worldCodeEyebrow} title={m.pages.brand.worldCodeTitle} className="pt-0">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {BRAND_CODES.map((code) => {
            const Visual = CODE_VISUALS[code.key as keyof typeof CODE_VISUALS];
            return (
              <div key={code.key} className="overflow-hidden rounded-lg border border-line bg-white/60">
                <Visual className="aspect-square w-full" />
                <div className="p-5">
                  <p className="eyebrow text-stone-2">
                    {code.name}{code.ko.toLowerCase() === code.name.toLowerCase() ? "" : ` · ${code.ko}`}
                  </p>
                  <p className="mt-2 text-[14px] leading-relaxed text-charcoal">{code.line}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section eyebrow={BRAND.principle.eyebrow} title={BRAND.principle.title} lede={BRAND.principle.body} className="pt-0">
        <ol className="grid gap-4 sm:grid-cols-3">
          {BRAND.principle.steps.map((s, i) => (
            <li key={s.key} className="rounded-lg border border-line bg-white/60 p-5">
              <span className="eyebrow text-stone-2">0{i + 1}</span>
              <h3 className="mt-2 text-[15px] font-semibold text-ink">{s.key}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-stone">{s.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section eyebrow={BRAND.dayFlow.eyebrow} title={BRAND.dayFlow.title} lede={BRAND.dayFlow.body} className="pt-0" />

      <Section eyebrow={BRAND.honesty.eyebrow} title={BRAND.honesty.title} className="pt-0">
        <ul className="measure space-y-3">
          {BRAND.honesty.points.map((p) => (
            <li key={p} className="flex gap-2.5 text-[15px] leading-relaxed text-stone">
              <span aria-hidden="true" className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-mist-500" />
              {p}
            </li>
          ))}
        </ul>
        <Divider className="my-10" />
        <Link href="/shop" className="text-[13px] font-medium text-ink underline underline-offset-4">
          {m.common.viewRoadmap}
        </Link>
      </Section>
    </>
  );
}
