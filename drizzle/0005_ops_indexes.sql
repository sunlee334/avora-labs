-- 세션 토큰을 sha256 으로 저장하도록 바뀌었다. 평문 토큰이 남아 있으면 이번 변경이 막으려던 위험이 그대로이므로 전부 지운다 (모든 로그인 1회 해제).
DELETE FROM `sessions`;--> statement-breakpoint
-- 아래 UNIQUE 인덱스가 기존 중복 행 때문에 실패하지 않도록 (같은 주문·쿠폰의 중복 적립은 가장 오래된 행만 남긴다).
DELETE FROM `coupon_redemptions` WHERE `id` NOT IN (SELECT MIN(`id`) FROM `coupon_redemptions` GROUP BY `order_id`, `coupon_id`);--> statement-breakpoint
CREATE INDEX `coupon_redemptions_user_idx` ON `coupon_redemptions` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `coupon_redemptions_order_coupon_uq` ON `coupon_redemptions` (`order_id`,`coupon_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);