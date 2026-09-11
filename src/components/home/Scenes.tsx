import { Section } from "@/components/ui/Primitives";
import { getContent } from "@/content";
import { getT } from "@/i18n/server";

/** ④ 사용 장면 타임라인 */
export async function Scenes() {
  const { locale, m } = await getT();
  const { DAILY_SUNSCREEN } = getContent(locale);
  return (
    <Section eyebrow={m.home.scenes.eyebrow} title={m.home.scenes.title}>
      <ol className="space-y-0">
        {DAILY_SUNSCREEN.scenes.map((scene, i) => (
          <li key={scene.title} className="flex gap-6 border-t border-line py-6 first:border-t-0 md:gap-10">
            <span className="w-16 shrink-0 text-[13px] font-medium tabular-nums text-mist-600 md:w-20">{scene.time}</span>
            <div>
              <h3 className="text-[15px] font-semibold text-ink">{scene.title}</h3>
              <p className="mt-1.5 max-w-xl text-[14px] leading-relaxed text-stone">{scene.body}</p>
            </div>
            <span aria-hidden="true" className="ml-auto hidden text-xs text-stone-2 md:block">
              {String(i + 1).padStart(2, "0")}
            </span>
          </li>
        ))}
      </ol>
    </Section>
  );
}
