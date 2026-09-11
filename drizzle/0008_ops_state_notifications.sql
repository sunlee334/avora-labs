CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel` text NOT NULL,
	`template` text NOT NULL,
	`recipient` text NOT NULL,
	`locale` text DEFAULT 'ko' NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`dedupe_key` text,
	`order_id` integer,
	`user_id` integer,
	`send_after` integer NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`sent_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_dedupe_uq` ON `notifications` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `notifications_due_idx` ON `notifications` (`status`,`send_after`);--> statement-breakpoint
CREATE TABLE `ops_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
