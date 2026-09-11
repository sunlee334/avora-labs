import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/auth/guards";
import { adminLogoutAction } from "./actions";

/** 관리자 화면은 항상 요청 시점에 렌더링한다 (빌드 프리렌더 중 D1 접근 방지). */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "관리자", template: "%s · PAROS Admin" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireAdmin("/admin");

  return (
    <div className="min-h-screen bg-paper-2/40">
      <div className="border-b border-line bg-white">
        <div className="container-x flex h-14 items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="eyebrow">PAROS ADMIN</span>
            <span className="text-[13px] text-stone">{user.name}</span>
          </div>
          <div className="flex items-center gap-5 text-[13px]">
            <Link href="/" className="text-stone hover:text-ink">
              스토어 보기
            </Link>
            <form action={adminLogoutAction}>
              <button type="submit" className="text-stone hover:text-ink">
                로그아웃
              </button>
            </form>
          </div>
        </div>
      </div>
      <div className="container-x flex flex-col gap-6 py-8 md:flex-row md:gap-8">
        <AdminNav />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
