CREATE TABLE `forecast_weights` (`key` text PRIMARY KEY NOT NULL, `label` text NOT NULL, `category` text NOT NULL, `enabled` integer DEFAULT true NOT NULL, `direction_weight` real DEFAULT 0 NOT NULL, `range_weight` real DEFAULT 0 NOT NULL, `updated_at` integer NOT NULL);
--> statement-breakpoint
CREATE TABLE `market_events` (`id` text PRIMARY KEY NOT NULL, `source` text NOT NULL, `category` text NOT NULL, `headline` text NOT NULL, `summary` text NOT NULL, `url` text NOT NULL, `event_time` integer NOT NULL, `severity` real NOT NULL, `created_at` integer NOT NULL);
--> statement-breakpoint
CREATE INDEX `market_events_time_idx` ON `market_events` (`event_time` DESC);
--> statement-breakpoint
CREATE TABLE `forecast_snapshots` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `target_date` text NOT NULL, `captured_at` integer NOT NULL, `interval_label` text NOT NULL, `base_median` real NOT NULL, `adjusted_median` real NOT NULL, `adjusted_low` real NOT NULL, `adjusted_high` real NOT NULL, `factors_json` text NOT NULL, `actual_open` real, `median_error` real);
--> statement-breakpoint
CREATE UNIQUE INDEX `forecast_snapshots_target_interval_idx` ON `forecast_snapshots` (`target_date`, `interval_label`);
