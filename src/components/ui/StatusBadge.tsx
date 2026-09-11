"use client";

import { Badge } from "@/components/ui/Primitives";
import { useMessages } from "@/i18n/client";
import type { OrderStatus, ProductStatus } from "@/lib/config";

type Tone = "neutral" | "mist" | "accent" | "success" | "danger" | "ink";

const ORDER_TONE: Record<OrderStatus, Tone> = {
  pending: "neutral",
  paid: "mist",
  preparing: "mist",
  shipped: "accent",
  delivered: "success",
  cancelled: "danger",
  refunded: "danger",
};

const PRODUCT_TONE: Record<ProductStatus, Tone> = {
  on_sale: "success",
  upcoming: "mist",
  sold_out: "danger",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const m = useMessages();
  return <Badge tone={ORDER_TONE[status]}>{m.orderStatus[status]}</Badge>;
}

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  const m = useMessages();
  return <Badge tone={PRODUCT_TONE[status]}>{m.productStatus[status]}</Badge>;
}
