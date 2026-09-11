import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

/** 스토어(고객) 화면 공통 골격. 관리자 화면은 이 레이아웃을 쓰지 않는다. */
export default function StoreLayout({ children }: LayoutProps<"/[locale]">) {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </>
  );
}
