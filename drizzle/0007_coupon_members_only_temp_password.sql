ALTER TABLE `coupons` ADD `members_only` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `password_reset_required` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `temp_password_expires_at` integer;