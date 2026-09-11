"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useMessages } from "@/i18n/client";
import { Link } from "@/i18n/link";
import { LocaleSwitcher } from "./LocaleSwitcher";

export function MobileNav({
  nav,
  isLoggedIn,
  isAdmin,
}: {
  nav: readonly { href: string; label: string }[];
  isLoggedIn: boolean;
  isAdmin?: boolean;
}) {
  const m = useMessages();
  const [open, setOpen] = useState(false);
  // 헤더의 backdrop-filter 가 fixed 요소의 containing block 이 되므로 오버레이는 body 로 포털한다.
  // 서버에서는 false, 클라이언트 하이드레이션 이후 true.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? m.nav.menuClose : m.nav.menuOpen}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line-2 bg-white/60"
      >
        <span className="relative block h-3 w-4">
          <span
            className={`absolute left-0 top-0 h-px w-full bg-ink transition ${open ? "translate-y-[5.5px] rotate-45" : ""}`}
          />
          <span
            className={`absolute left-0 top-[5.5px] h-px w-full bg-ink transition ${open ? "opacity-0" : ""}`}
          />
          <span
            className={`absolute left-0 bottom-0 h-px w-full bg-ink transition ${open ? "-translate-y-[5.5px] -rotate-45" : ""}`}
          />
        </span>
      </button>

      {mounted
        ? createPortal(
            <div
              id="mobile-menu"
              hidden={!open}
              className="fixed inset-x-0 top-14 bottom-0 z-30 overflow-y-auto bg-paper md:hidden"
            >
              <nav className="container-x flex flex-col py-6" aria-label={m.nav.mobileMenu}>
                {nav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="border-b border-line py-4 text-xl font-medium tracking-tight text-ink"
                  >
                    {item.label}
                  </Link>
                ))}
                <div className="mt-6 flex flex-col gap-3 text-sm text-stone">
                  {isLoggedIn ? (
                    <Link href={isAdmin ? "/admin" : "/account"} onClick={() => setOpen(false)}>
                      {isAdmin ? m.nav.admin : m.nav.account}
                    </Link>
                  ) : (
                    <Link href="/login" onClick={() => setOpen(false)}>
                      {m.nav.loginRegister}
                    </Link>
                  )}
                  <Link href="/orders/lookup" onClick={() => setOpen(false)}>
                    {m.nav.guestLookup}
                  </Link>
                  <Link href="/notify" onClick={() => setOpen(false)}>
                    {m.nav.notify}
                  </Link>
                </div>
                <div className="mt-8 border-t border-line pt-6">
                  <p className="eyebrow mb-3">{m.common.language}</p>
                  <LocaleSwitcher variant="links" />
                </div>
              </nav>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
