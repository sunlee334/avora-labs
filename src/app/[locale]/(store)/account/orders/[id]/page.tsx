import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, reviews } from "@/db/schema";
import { CustomerCancelForm } from "@/components/orders/CustomerCancelForm";
import { OrderDetail } from "@/components/orders/OrderDetail";
import { ReviewForm } from "@/components/reviews/ReviewForm";
import { Card, PageTitle } from "@/components/ui/Primitives";
import { getT } from "@/i18n/server";
import { requireUser } from "@/lib/auth/guards";
import { isCustomerCancellable } from "@/lib/config";
import { localizeOrderItems, toPublicOrder } from "@/lib/orders";
import { localizedActivityLabel, parseReviewPhotos } from "@/lib/reviews";
import { cancelMyOrderAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getT();
  return { title: m.account.orderDetailTitle, robots: { index: false } };
}

export default async function AccountOrderDetailPage({ params }: PageProps<"/[locale]/account/orders/[id]">) {
  const { locale, m } = await getT();
  const { id } = await params;
  const orderId = Number(id);
  const user = await requireUser("/account");
  if (!Number.isInteger(orderId)) notFound();

  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.userId, user.id)),
    with: { items: { with: { variant: { columns: { sku: true } } } } },
  });
  if (!order) notFound();
  const publicOrder = toPublicOrder(order);
  publicOrder.items = localizeOrderItems(publicOrder.items, locale);

  const existingReviews =
    order.status === "delivered"
      ? await db.query.reviews.findMany({ where: eq(reviews.orderId, order.id) })
      : [];

  const reviewableItems =
    order.status === "delivered"
      ? [...new Map(order.items.map((item) => [item.productId, item])).values()]
      : [];

  return (
    <>
      <PageTitle eyebrow="ACCOUNT" title={m.account.orderDetailTitle} />
      <div className="container-x space-y-8 pb-24">
        <OrderDetail order={publicOrder} />

        {isCustomerCancellable(order.status) ? (
          <CustomerCancelForm
            action={cancelMyOrderAction}
            hidden={{ orderId: String(order.id) }}
            totalKrw={order.totalKrw}
          />
        ) : null}

        {order.status === "delivered" && reviewableItems.length > 0 ? (
          <div className="space-y-6">
            <h2 className="text-sm font-semibold text-ink">{m.account.reviewsTitle}</h2>
            {reviewableItems.map((item) => {
              const existing = existingReviews.find((r) => r.productId === item.productId);
              if (existing) {
                return (
                  <Card key={item.productId}>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-ink">{item.productName}</h3>
                      <span className="text-[13px] text-stone">{"★".repeat(existing.rating)}</span>
                    </div>
                    <p className="mb-2 text-[13px] text-stone">
                      {localizedActivityLabel(m, existing.activityTag)}
                    </p>
                    <p className="text-sm leading-relaxed text-charcoal">{existing.body}</p>
                    {parseReviewPhotos(existing.photos).length > 0 ? (
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {parseReviewPhotos(existing.photos).map((src) => (
                          <li key={src}>
                            <Image
                              src={src}
                              alt=""
                              width={80}
                              height={80}
                              unoptimized
                              className="h-20 w-20 rounded-md border border-line object-cover"
                            />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {existing.adminReply ? (
                      <div className="mt-3 rounded-md bg-paper-2 p-3 text-[13px] text-charcoal">
                        <p className="mb-1 font-medium text-ink">{m.account.reviewReply}</p>
                        {existing.adminReply}
                      </div>
                    ) : null}
                  </Card>
                );
              }
              return (
                <ReviewForm
                  key={item.productId}
                  orderId={order.id}
                  productId={item.productId}
                  productName={item.productName}
                />
              );
            })}
          </div>
        ) : null}
      </div>
    </>
  );
}
