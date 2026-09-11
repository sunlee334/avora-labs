"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/orders", label: "주문" },
  { href: "/admin/products", label: "상품" },
  { href: "/admin/reviews", label: "리뷰" },
  { href: "/admin/coupons", label: "쿠폰" },
  { href: "/admin/users", label: "회원" },
  { href: "/admin/signups", label: "알림 신청" },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="w-40 shrink-0">
      <ul className="space-y-1 text-[14px]">
        {NAV.map((item) => {
          const active =
            item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`block rounded-md px-3 py-2 transition ${
                  active ? "bg-ink text-paper" : "text-charcoal hover:bg-white"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
