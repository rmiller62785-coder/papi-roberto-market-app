ALTER TABLE `forecast_snapshots` ADD `first_minute_close` real;
--> statement-breakpoint
ALTER TABLE `forecast_snapshots` ADD `first_minute_error` real;
--> statement-breakpoint
ALTER TABLE `forecast_snapshots` ADD `outcome_captured_at` integer;
