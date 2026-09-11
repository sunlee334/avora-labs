import { getContent } from "@/content";
import { Link } from "@/i18n/link";
import { getLocale } from "@/i18n/server";

/** 2차 메시지: 문제 제기 다음, 감각 소개 전에 놓는 근거 밴드. */
export async function Reason() {
  const { DAILY_SUNSCREEN } = getContent(await getLocale());
  const { reason } = DAILY_SUNSCREEN;
  return (
    <section className="container-x py-14 md:py-20">
      <div className="grid gap-6 border-y border-line py-10 md:grid-cols-[1.2fr_1fr] md:items-center md:py-14">
        <h2 className="display text-2xl text-ink md:text-4xl">{reason.title}</h2>
        <div>
          <p className="measure text-[15px] leading-relaxed text-stone">{reason.body}</p>
          <Link href={reason.link.href} className="mt-4 inline-block text-[13px] font-medium text-ink underline underline-offset-4">
            {reason.link.label}
          </Link>
        </div>
      </div>
    </section>
  );
}
