import { getContent } from "@/content";
import { Link } from "@/i18n/link";
import { getT } from "@/i18n/server";
import { fill } from "@/i18n/format";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { getCart } from "@/lib/cart";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { MobileNav } from "./MobileNav";
import { Wordmark } from "./Wordmark";

export async function SiteHeader() {
  const { locale, m } = await getT();
  const { NAV } = getContent(locale);
  // 헤더는 모든 스토어 페이지의 레이아웃에 있다. 여기서 DB 오류를 던지면 FAQ·정책처럼 DB 가 필요 없는
  // 페이지까지 오류 화면이 되므로, 조회에 실패하면 비로그인·빈 장바구니로 그린다.
  let user: SessionUser | null = null;
  let itemCount = 0;
  try {
    const [u, cart] = await Promise.all([getCurrentUser(), getCart()]);
    user = u;
    itemCount = cart.itemCount;
  } catch (error) {
    // Next 가 정적 렌더링을 포기시키려고 던지는 내부 신호(cookies() 사용 등)는 오류가 아니다. 그대로 올린다.
    const digest = (error as { digest?: unknown })?.digest;
    if (
      typeof digest === "string" &&
      (digest.startsWith("NEXT_") || digest === "DYNAMIC_SERVER_USAGE" || digest === "BAILOUT_TO_CLIENT_SIDE_RENDERING")
    ) {
      throw error;
    }
    console.error(
      JSON.stringify({
        level: "error",
        event: "header.session_or_cart_unavailable",
        cause: error instanceof Error ? error.message.slice(0, 200) : String(error),
      }),
    );
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/85 backdrop-blur-md">
      <div className="container-x flex h-14 items-center justify-between gap-6 md:h-16">
        <div className="flex items-center gap-8">
          <Link href="/" aria-label={`PAROS ${m.common.home}`} className="flex items-center">
            <Wordmark className="h-[18px] w-auto text-ink md:h-5" />
          </Link>
          <nav aria-label={m.nav.mainMenu} className="hidden items-center gap-6 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-[13px] font-medium tracking-tight text-charcoal/80 transition hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4 text-[13px] font-medium">
          <LocaleSwitcher className="hidden md:inline-flex" />
          {user ? (
            <Link
              href={user.role === "admin" ? "/admin" : "/account"}
              // /admin 은 Cloudflare Access 뒤에 있어 프리페치가 CORS 로 막히므로 끈다.
              prefetch={user.role === "admin" ? false : undefined}
              className="hidden text-charcoal/80 hover:text-ink md:inline"
            >
              {user.role === "admin" ? m.nav.admin : m.nav.account}
            </Link>
          ) : (
            <Link href="/login" className="hidden text-charcoal/80 hover:text-ink md:inline">
              {m.nav.login}
            </Link>
          )}
          <Link
            href="/cart"
            className="inline-flex items-center gap-1.5 rounded-full border border-line-2 bg-white/60 px-3 py-1.5 text-ink transition hover:border-ink"
            aria-label={fill(m.nav.cartAria, { n: itemCount })}
          >
            <span>{m.nav.cart}</span>
            <span
              className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] tabular-nums ${
                itemCount > 0 ? "bg-ink text-paper" : "bg-paper-2 text-stone"
              }`}
            >
              {itemCount}
            </span>
          </Link>
          <MobileNav nav={NAV} isLoggedIn={Boolean(user)} isAdmin={user?.role === "admin"} />
        </div>
      </div>
    </header>
  );
}
