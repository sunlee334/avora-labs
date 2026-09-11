import type { Metadata } from "next";
import { Hero } from "@/components/home/Hero";
import { Problem } from "@/components/home/Problem";
import { Reason } from "@/components/home/Reason";
import { Senses } from "@/components/home/Senses";
import { Scenes } from "@/components/home/Scenes";
import { SpecStrip } from "@/components/home/SpecStrip";
import { BrandIntro } from "@/components/home/BrandIntro";
import { Usage } from "@/components/home/Usage";
import { Reviews } from "@/components/home/Reviews";
import { Roadmap } from "@/components/home/Roadmap";
import { NotifySection } from "@/components/home/NotifySection";
import { localeAlternates } from "@/i18n/metadata";
import { getT } from "@/i18n/server";
import { SITE } from "@/lib/config";

// DB 를 읽는 페이지는 항상 요청 시점에 렌더링한다 (Workers 빌드 프리렌더 중 D1 접근 방지).
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, m } = await getT();
  return {
    title: `${SITE.name} — ${SITE.tagline}`,
    description: m.common.siteDescription,
    alternates: localeAlternates(locale, "/"),
  };
}

export default function HomePage() {
  return (
    <>
      <Hero />
      <Problem />
      <Reason />
      <Senses />
      <Scenes />
      <SpecStrip />
      <BrandIntro />
      <Usage />
      <Reviews />
      <Roadmap />
      <NotifySection />
    </>
  );
}
