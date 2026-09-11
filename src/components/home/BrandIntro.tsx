import { Section } from "@/components/ui/Primitives";
import { getContent } from "@/content";
import { Link } from "@/i18n/link";
import { getT } from "@/i18n/server";
import { CodeLight } from "@/components/visuals/CodeLight";
import { CodeWind } from "@/components/visuals/CodeWind";
import { CodeWater } from "@/components/visuals/CodeWater";
import { CodeStone } from "@/components/visuals/CodeStone";

const CODE_VISUALS = { light: CodeLight, wind: CodeWind, water: CodeWater, stone: CodeStone } as const;

/** ⑥ 브랜드 소개. 첫 브랜드임을 숨기지 않는다 + 세계관 4코드 */
export async function BrandIntro() {
  const { locale, m } = await getT();
  const { BRAND_CODES } = getContent(locale);
  return (
    <Section eyebrow={m.home.brandIntro.eyebrow} title={m.home.brandIntro.title}>
      <p className="measure text-base leading-relaxed text-stone md:text-lg">
        {m.home.brandIntro.body}{" "}
        <Link href="/brand" className="font-medium text-ink underline underline-offset-4">
          {m.home.brandIntro.link}
        </Link>
      </p>

      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {BRAND_CODES.map((code) => {
          const Visual = CODE_VISUALS[code.key as keyof typeof CODE_VISUALS];
          return (
            <div key={code.key} className="overflow-hidden rounded-lg border border-line bg-white/60">
              <Visual className="aspect-square w-full" />
              <div className="p-5">
                <p className="eyebrow text-stone-2">
                  {code.name}{code.ko.toLowerCase() === code.name.toLowerCase() ? "" : ` · ${code.ko}`}
                </p>
                <p className="mt-2 text-[13px] leading-relaxed text-charcoal">{code.line}</p>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
