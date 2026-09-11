import type { Metadata } from "next";
import { NotFoundContent } from "@/components/site/NotFoundContent";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getT();
  return { title: m.pages.notFound.metaTitle };
}

/** 스토어 라우트 안에서 notFound() 가 호출될 때. 헤더·푸터는 (store)/layout 이 그린다. */
export default function StoreNotFound() {
  return <NotFoundContent />;
}
