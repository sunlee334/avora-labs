import { ButtonLink } from "@/components/ui/Button";
import { HeroVisual } from "@/components/visuals/HeroVisual";
import { getContent } from "@/content";
import { getT } from "@/i18n/server";

/** ① 한 문장 + 대표 비주얼. 이미지 안에 작은 글씨를 넣지 않는다. */
export async function Hero() {
  const { locale, m } = await getT();
  const { DAILY_SUNSCREEN } = getContent(locale);
  return (
    <section className="container-x grid items-center gap-10 pt-10 pb-16 md:grid-cols-2 md:gap-12 md:pt-16 md:pb-24">
      <div>
        <p className="eyebrow mb-5">{DAILY_SUNSCREEN.eyebrow}</p>
        <h1 className="display text-4xl text-ink md:text-6xl">{DAILY_SUNSCREEN.headline}</h1>
        <p className="measure mt-6 text-base leading-relaxed text-stone md:text-lg">{DAILY_SUNSCREEN.intro}</p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <ButtonLink href="/products/daily-sunscreen" size="lg">
            {m.common.viewProduct}
          </ButtonLink>
          <ButtonLink href="/standard" variant="secondary" size="lg">
            {m.common.viewStandard}
          </ButtonLink>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-line bg-white/40">
        <HeroVisual className="h-full w-full" />
      </div>
    </section>
  );
}
