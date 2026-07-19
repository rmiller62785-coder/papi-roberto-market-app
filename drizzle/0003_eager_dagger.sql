CREATE TABLE `forecast_preopen_freezes` (
	`target_date` text PRIMARY KEY NOT NULL,
	`frozen_at` integer NOT NULL,
	`payload_json` text NOT NULL
);
