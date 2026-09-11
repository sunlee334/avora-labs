import Image from "next/image";
import { getContent } from "@/content";
import { Link } from "@/i18n/link";
import { getT } from "@/i18n/server";
import { COMPANY } from "@/lib/config";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { Wordmark } from "./Wordmark";

export async function SiteFooter() {
  const { locale, m } = await getT();
  const { FOOTER_LINKS, TAGLINES } = getContent(locale);
  const groups: { title: string; items: readonly { href: string; label: string; external?: boolean }[] }[] = [
    { title: m.footer.groups.shop, items: FOOTER_LINKS.shop },
    { title: m.footer.groups.brand, items: FOOTER_LINKS.brand },
    { title: m.footer.groups.help, items: FOOTER_LINKS.help },
    { title: m.footer.groups.legal, items: FOOTER_LINKS.legal },
  ];
  // 법정 표시: 상호는 등록된 한글 상호를 항상 함께 적는다.
  const companyLine = locale === "ko" ? `${COMPANY.name} (${COMPANY.nameEn})` : `${COMPANY.nameEn} (${COMPANY.name})`;

  return (
    <footer className="mt-24 border-t border-line bg-paper-2/60">
      <div className="container-x py-14">
        <div className="grid gap-12 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div className="space-y-5">
            <Wordmark className="h-5 w-auto text-ink" />
            <p className="measure text-sm leading-relaxed text-stone">
              {TAGLINES.tertiary}
              <br />
              {m.footer.tagline}
            </p>
            <div className="flex items-center gap-3 text-xs text-stone">
              <span>by</span>
              <Image
                src="/brand/avora-wordmark-forest.svg"
                alt="AVORA LABS"
                width={96}
                height={21}
                className="h-[11px] w-auto opacity-80"
              />
            </div>
          </div>

          {groups.map((group) => (
            <div key={group.title}>
              <p className="eyebrow mb-4">{group.title}</p>
              <ul className="space-y-2.5 text-sm">
                {group.items.map((item) =>
                  item.external ? (
                    <li key={item.href}>
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-charcoal/80 transition hover:text-ink"
                      >
                        {item.label}
                      </a>
                    </li>
                  ) : (
                    <li key={item.href}>
                      <Link href={item.href} className="text-charcoal/80 transition hover:text-ink">
                        {item.label}
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 border-t border-line pt-8">
          <dl className="grid gap-x-8 gap-y-1.5 text-[12px] leading-relaxed text-stone sm:grid-cols-2 lg:grid-cols-3">
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
              <dt className="shrink-0 text-stone-2">{m.footer.company.businessNumber}</dt>
              <dd>{COMPANY.businessNumber}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 text-stone-2">{m.footer.company.mailOrder}</dt>
              <dd>{COMPANY.mailOrderNumber}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 text-stone-2">{m.footer.company.phone}</dt>
              <dd>{COMPANY.phone}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 text-stone-2">{m.footer.company.cs}</dt>
              <dd>
                <a href={COMPANY.csChannelUrl} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
                  {m.common.csChannel}
                </a>{" "}
                · {m.common.csHours}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 text-stone-2">{m.footer.company.license}</dt>
              <dd>{m.footer.license}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 text-stone-2">{m.footer.company.domain}</dt>
              <dd>{COMPANY.domain}</dd>
            </div>
          </dl>
          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-stone-2">
              © {new Date().getFullYear()} {COMPANY.nameEn}. {TAGLINES.company}
            </p>
            <LocaleSwitcher variant="links" className="text-[12px]" />
          </div>
        </div>
      </div>
    </footer>
  );
}
