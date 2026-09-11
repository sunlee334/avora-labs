import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Analytics } from "@/components/site/Analytics";
import { LocaleProvider } from "@/i18n/client";
import { LOCALE_META } from "@/i18n/config";
import { getT } from "@/i18n/server";
import { SITE } from "@/lib/config";
import "./globals.css";

const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  display: "swap",
  weight: "45 920",
});

export async function generateMetadata(): Promise<Metadata> {
  const { locale, m } = await getT();
  return {
    metadataBase: new URL(SITE.url),
    title: {
      default: `${SITE.name} — ${SITE.tagline}`,
      template: `%s · ${SITE.name}`,
    },
    description: m.common.siteDescription,
    openGraph: {
      type: "website",
      locale: LOCALE_META[locale].ogLocale,
      siteName: SITE.fullName,
      title: `${SITE.name} — ${SITE.tagline}`,
      description: m.common.siteDescription,
    },
    icons: { icon: "/icon.svg" },
  };
}

export const viewport: Viewport = {
  themeColor: "#f6f4ef",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // 루트 레이아웃은 [locale] 파라미터를 받지 못하므로 프록시가 넣은 헤더로 언어를 읽는다.
  // 관리자·루트 404·루트 오류 경계까지 같은 프로바이더 아래 두어 useMessages() 가 어디서나 동작한다.
  const { locale, m } = await getT();
  return (
    <html lang={LOCALE_META[locale].htmlLang} className={`${pretendard.variable} h-full`}>
      <body className="flex min-h-full flex-col bg-paper text-charcoal">
        <LocaleProvider locale={locale} messages={m}>
          {children}
        </LocaleProvider>
        <Analytics />
      </body>
    </html>
  );
}
