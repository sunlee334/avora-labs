import type { OrderStatus } from "@/lib/config";

/** 택배사 선택지 (관리자 배송 입력 폼) */
export const CARRIERS = ["CJ대한통운", "한진", "롯데", "우체국", "로젠", "기타"] as const;

/** 허용된 상태 전이. paid→preparing→shipped→delivered / paid·preparing→cancelled / shipped·delivered→refunded / pending→cancelled */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["cancelled"],
  paid: ["preparing", "cancelled"],
  preparing: ["shipped", "cancelled"],
  shipped: ["delivered", "refunded"],
  delivered: ["refunded"],
  cancelled: [],
  refunded: [],
};
