-- 0003 이전에 결제된 주문은 승인 시점에 재고가 차감됐지만 표시가 없다. 취소·환불 시 복원 대상이 되도록 채워 넣는다.
UPDATE `order_items` SET `stock_deducted` = 1 WHERE `order_id` IN (
  SELECT `id` FROM `orders` WHERE `status` IN ('paid', 'preparing', 'shipped', 'delivered')
);
