CREATE TABLE `site_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_name` text NOT NULL,
	`path` text NOT NULL,
	`props` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `site_events_name_idx` ON `site_events` (`event_name`);--> statement-breakpoint
CREATE INDEX `site_events_created_idx` ON `site_events` (`created_at`);