ALTER TABLE `library_plans` ADD `strategy_kind` text DEFAULT 'LEGACY_931_CONFIRMATION' NOT NULL;
--> statement-breakpoint
ALTER TABLE `library_plans` ADD `actual_open_source` text;
--> statement-breakpoint
ALTER TABLE `forecast_preopen_freezes` ADD `actionable_cutoff_at` integer;
--> statement-breakpoint
CREATE TABLE `session_quarantine` (
	`record_id` text PRIMARY KEY NOT NULL,
	`source_table` text NOT NULL,
	`source_key` text NOT NULL,
	`session_date` text NOT NULL,
	`reason` text NOT NULL,
	`quarantined_at` integer NOT NULL,
	`details_json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `session_quarantine_date_idx` ON `session_quarantine` (`session_date`);
