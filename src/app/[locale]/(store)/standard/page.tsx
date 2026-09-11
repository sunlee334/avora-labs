import type { Metadata } from "next";
import { PageTitle, Section, Badge, Divider } from "@/components/ui/Primitives";
import { getContent } from "@/content";
import { fill } from "@/i18n/format";
import { Link } from "@/i18n/link";
import { localeAlternates } from "@/i18n/metadata";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, m } = await getT();
  return {
    title: m.pages.standard.metaTitle,
    description: m.pages.standard.metaDescription,
    alternates: localeAlternates(locale, "/standard"),
  };
}

export default async function StandardPage() {
  const { locale, m } = await getT();
  const { STANDARD } = getContent(locale);
  return (
    <>
      <PageTitle eyebrow={STANDARD.eyebrow} title={STANDARD.title} lede={STANDARD.intro} />

      <Section eyebrow={STANDARD.why.eyebrow} title={STANDARD.why.title} className="pt-0">
        <div className="measure space-y-4">
          {STANDARD.why.points.map((p, i) => (
            <p key={i} className="text-[15px] leading-relaxed text-stone">
              {p}
            </p>
          ))}
        </div>
      </Section>

      <Section eyebrow={STANDARD.priority.eyebrow} title={STANDARD.priority.title} lede={STANDARD.priority.lede} className="pt-0">
        <ol className="grid gap-3 sm:grid-cols-2">
          {STANDARD.priority.items.map((item) => (
            <li
              key={item.rank}
              className={`flex gap-4 rounded-lg border p-5 ${
                item.cutline ? "border-ink/70 bg-white" : "border-line bg-white/60"
              }`}
            >
              <span className="display text-2xl text-mist-500">{String(item.rank).padStart(2, "0")}</span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-[15px] font-semibold text-ink">{item.title}</h3>
                  {item.cutline ? <Badge tone="ink">{m.pages.standard.cutline}</Badge> : null}
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-stone">{item.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section eyebrow={STANDARD.criteria.eyebrow} title={STANDARD.criteria.title} className="pt-0">
        <ul className="measure space-y-2.5">
          {STANDARD.criteria.items.map((item) => (
            <li key={item} className="flex gap-2.5 text-[15px] leading-relaxed text-stone">
              <span aria-hidden="true" className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-mist-500" />
              {item}
            </li>
          ))}
        </ul>
      </Section>

      <Section eyebrow={STANDARD.evaluation.eyebrow} title={STANDARD.evaluation.title} className="pt-0">
        <div className="grid gap-6 md:grid-cols-2">
          <dl className="grid gap-4 sm:grid-cols-2">
            {STANDARD.evaluation.method.map((method) => (
              <div key={method.label} className="rounded-lg border border-line bg-white/60 p-5">
                <dt className="eyebrow text-stone-2">{method.label}</dt>
                <dd className="mt-2 text-[14px] leading-relaxed text-charcoal">{method.body}</dd>
              </div>
            ))}
          </dl>
          <div className="rounded-lg border border-line bg-white/60 p-6">
            <p className="text-[13px] text-stone">{STANDARD.evaluation.scoringNote}</p>
            <Divider className="my-4" />
            <ul className="space-y-2.5">
              {STANDARD.evaluation.scoring.map((s) => (
                <li key={s.rank} className="flex items-center justify-between text-[14px] text-charcoal">
                  <span>
                    {s.rank}. {s.title}
                  </span>
                  <span className="tabular-nums font-semibold text-ink">{fill(m.pages.standard.points, { n: s.points })}</span>
                </li>
              ))}
            </ul>
            <Divider className="my-4" />
            <div className="flex items-center justify-between text-[14px] font-semibold text-ink">
              <span>{m.pages.standard.totalScore}</span>
              <span className="tabular-nums">{fill(m.pages.standard.points, { n: 100 })}</span>
            </div>
          </div>
        </div>
      </Section>

      <Section className="pt-0">
        <div className="measure rounded-lg border border-line bg-mist-50 p-6">
          <p className="text-[14px] leading-relaxed text-charcoal">{STANDARD.closing}</p>
          <Link href="/products/daily-sunscreen" className="mt-4 inline-block text-[13px] font-medium text-ink underline underline-offset-4">
            {m.pages.standard.productLink}
          </Link>
        </div>
      </Section>
    </>
  );
}
