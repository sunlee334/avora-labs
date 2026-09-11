import type { Metadata } from "next";
import { count, desc, eq } from "drizzle-orm";
import { Pagination } from "@/components/admin/Pagination";
import { db } from "@/db/client";
import { orders } from "@/db/schema";
import { ConsentToggles } from "@/components/account/ConsentToggles";
import { PasswordForm } from "@/components/account/PasswordForm";
import { ProfileCard } from "@/components/account/ProfileCard";
import { OrderStatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Card, Divider, PageTitle, Price } from "@/components/ui/Primitives";
import { localizePath } from "@/i18n/config";
import { fill, formatLocalDate } from "@/i18n/format";
import { Link } from "@/i18n/link";
import { getT } from "@/i18n/server";
import { requireUser } from "@/lib/auth/guards";
import { logoutAction } from "@/lib/auth/actions";
import { localizeOrderItems } from "@/lib/orders";
import { firstParam } from "@/lib/search-params";
import { logoutEverywhereAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getT();
  return { title: m.account.metaTitle, robots: { index: false } };
}

const PAGE_SIZE = 20;

export default async function AccountPage({ searchParams }: PageProps<"/[locale]/account">) {
  const { locale, m } = await getT();
  const user = await requireUser("/account");
  const sp = await searchParams;
  const requestedPage = Math.max(1, Number.parseInt(firstParam(sp.page) || "1", 10) || 1);
  const totalRow = await db.select({ c: count() }).from(orders).where(eq(orders.userId, user.id)).get();
  const totalPages = Math.max(1, Math.ceil((totalRow?.c ?? 0) / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const myOrders = await db.query.orders.findMany({
    where: eq(orders.userId, user.id),
    orderBy: [desc(orders.createdAt)],
    with: { items: { with: { variant: { columns: { sku: true } } } } },
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  return (
    <>
      <PageTitle eyebrow="ACCOUNT" title={fill(m.account.title, { name: user.name })} lede={m.account.lede} />
      <div className="container-x space-y-8 pb-24">
        <div className="grid gap-6 md:grid-cols-2">
          <ProfileCard email={user.email} name={user.name} phone={user.phone} />
          <ConsentToggles
            marketingEmailOptIn={user.marketingEmailOptIn}
            marketingSmsOptIn={user.marketingSmsOptIn}
          />
          <PasswordForm />
        </div>

        <Card>
          <h2 className="mb-4 text-sm font-semibold text-ink">{m.account.orders}</h2>
          {myOrders.length === 0 ? (
            <p className="text-sm text-stone">{m.account.noOrders}</p>
          ) : (
            <ul className="divide-y divide-line">
              {myOrders.map((order) => {
                const first = localizeOrderItems(
                  order.items.map((item) => ({ ...item, sku: item.variant?.sku ?? null })),
                  locale,
                )[0];
                const extra = order.items.length - 1;
                return (
                  <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <span className="font-mono text-[13px] text-stone">{order.orderNumber}</span>
                        <OrderStatusBadge status={order.status} />
                      </div>
                      <p className="text-sm text-charcoal">
                        {first ? `${first.productName} ${first.variantName}` : "-"}
                        {extra > 0 ? fill(m.account.extra, { n: extra }) : ""}
                      </p>
                      <p className="text-[13px] text-stone">
                        {formatLocalDate(order.createdAt, locale)}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <Price value={order.totalKrw} size="sm" />
                      <Link
                        href={`/account/orders/${order.id}`}
                        className="text-[13px] font-medium text-ink underline underline-offset-4"
                      >
                        {m.account.orderDetail}
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <Pagination
            page={page}
            totalPages={totalPages}
            buildHref={(p) => localizePath(locale, p > 1 ? `/account?page=${p}` : "/account")}
            labels={{ prev: m.common.prevPage, next: m.common.nextPage }}
          />
        </Card>

        <p className="text-[13px] text-stone">{m.account.fundingNote}</p>

        <Divider />
        <div className="flex flex-wrap items-center gap-3">
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="sm">
              {m.account.logout}
            </Button>
          </form>
          <form action={logoutEverywhereAction}>
            <Button type="submit" variant="ghost" size="sm" title={m.account.logoutEverywhereHint}>
              {m.account.logoutEverywhere}
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
