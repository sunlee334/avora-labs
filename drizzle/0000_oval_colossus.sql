CREATE TABLE `cart_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cart_id` text NOT NULL,
	`variant_id` integer NOT NULL,
	`qty` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`cart_id`) REFERENCES `carts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cart_items_cart_variant_uq` ON `cart_items` (`cart_id`,`variant_id`);--> statement-breakpoint
CREATE TABLE `carts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `carts_user_idx` ON `carts` (`user_id`);--> statement-breakpoint
CREATE TABLE `coupon_redemptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`coupon_id` integer NOT NULL,
	`order_id` integer NOT NULL,
	`user_id` integer,
	`email` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `coupon_redemptions_coupon_idx` ON `coupon_redemptions` (`coupon_id`);--> statement-breakpoint
CREATE INDEX `coupon_redemptions_email_idx` ON `coupon_redemptions` (`email`);--> statement-breakpoint
CREATE TABLE `coupons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`type` text NOT NULL,
	`value` integer DEFAULT 0 NOT NULL,
	`min_subtotal_krw` integer DEFAULT 0 NOT NULL,
	`max_uses` integer,
	`used_count` integer DEFAULT 0 NOT NULL,
	`per_user_limit` integer DEFAULT 1 NOT NULL,
	`starts_at` integer,
	`ends_at` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coupons_code_uq` ON `coupons` (`code`);--> statement-breakpoint
CREATE TABLE `notify_signups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`interest` text DEFAULT 'all' NOT NULL,
	`marketing_opt_in` integer DEFAULT true NOT NULL,
	`source` text DEFAULT 'site' NOT NULL,
	`created_at` integer NOT NULL,
	`unsubscribed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notify_email_interest_uq` ON `notify_signups` (`email`,`interest`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`variant_id` integer NOT NULL,
	`product_name` text NOT NULL,
	`variant_name` text NOT NULL,
	`units_per_pack` integer DEFAULT 1 NOT NULL,
	`unit_price_krw` integer NOT NULL,
	`qty` integer NOT NULL,
	`line_total_krw` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_number` text NOT NULL,
	`user_id` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`email` text NOT NULL,
	`customer_name` text NOT NULL,
	`phone` text NOT NULL,
	`recipient_name` text NOT NULL,
	`recipient_phone` text NOT NULL,
	`postal_code` text NOT NULL,
	`address1` text NOT NULL,
	`address2` text DEFAULT '' NOT NULL,
	`delivery_memo` text DEFAULT '' NOT NULL,
	`subtotal_krw` integer NOT NULL,
	`discount_krw` integer DEFAULT 0 NOT NULL,
	`shipping_krw` integer DEFAULT 0 NOT NULL,
	`total_krw` integer NOT NULL,
	`coupon_id` integer,
	`coupon_code` text,
	`shipping_reason` text DEFAULT 'none' NOT NULL,
	`sms_opt_in` integer DEFAULT false NOT NULL,
	`payment_provider` text DEFAULT 'toss' NOT NULL,
	`payment_key` text,
	`payment_method` text,
	`paid_at` integer,
	`fail_reason` text,
	`tracking_carrier` text,
	`tracking_number` text,
	`shipped_at` integer,
	`delivered_at` integer,
	`cancelled_at` integer,
	`admin_memo` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_number_uq` ON `orders` (`order_number`);--> statement-breakpoint
CREATE INDEX `orders_user_idx` ON `orders` (`user_id`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `orders_email_idx` ON `orders` (`email`);--> statement-breakpoint
CREATE INDEX `orders_created_idx` ON `orders` (`created_at`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`subtitle` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`stage` integer DEFAULT 1 NOT NULL,
	`code` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'upcoming' NOT NULL,
	`launch_label` text DEFAULT '' NOT NULL,
	`image` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_uq` ON `products` (`slug`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`order_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`author_name` text NOT NULL,
	`rating` integer NOT NULL,
	`body` text NOT NULL,
	`activity_tag` text DEFAULT 'daily' NOT NULL,
	`photos` text DEFAULT '[]' NOT NULL,
	`disclosure` integer DEFAULT false NOT NULL,
	`admin_reply` text,
	`admin_replied_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reviews_order_product_uq` ON `reviews` (`order_id`,`product_id`);--> statement-breakpoint
CREATE INDEX `reviews_product_idx` ON `reviews` (`product_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`role` text DEFAULT 'customer' NOT NULL,
	`marketing_email_opt_in` integer DEFAULT false NOT NULL,
	`marketing_sms_opt_in` integer DEFAULT false NOT NULL,
	`consent_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `variants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`sku` text NOT NULL,
	`name` text NOT NULL,
	`units_per_pack` integer DEFAULT 1 NOT NULL,
	`price_krw` integer NOT NULL,
	`compare_at_krw` integer,
	`stock` integer DEFAULT 0 NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `variants_sku_uq` ON `variants` (`sku`);--> statement-breakpoint
CREATE INDEX `variants_product_idx` ON `variants` (`product_id`);