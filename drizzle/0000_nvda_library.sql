CREATE TABLE `library_plans` (
	`date` text PRIMARY KEY NOT NULL,
	`signal` text NOT NULL,
	`open_range_low` real NOT NULL,
	`open_range_high` real NOT NULL,
	`entry` real,
	`stop` real,
	`target` real,
	`expected_move` real NOT NULL,
	`confidence` real NOT NULL,
	`rationale` text NOT NULL,
	`actual_open` real,
	`first_minute_close` real,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `library_plans_date_idx` ON `library_plans` (`date` DESC);
