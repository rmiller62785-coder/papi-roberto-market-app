CREATE TABLE `ops_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`record_type` text NOT NULL,
	`title` text NOT NULL,
	`client` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`due_date` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`value` real DEFAULT 0 NOT NULL,
	`link` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ops_items_owner_idx` ON `ops_items` (`owner_email`);--> statement-breakpoint
CREATE INDEX `ops_items_owner_type_idx` ON `ops_items` (`owner_email`,`record_type`);--> statement-breakpoint
CREATE INDEX `ops_items_owner_due_idx` ON `ops_items` (`owner_email`,`due_date`);