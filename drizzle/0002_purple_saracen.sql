CREATE TABLE IF NOT EXISTS `automation_capture_health` (
	`id` integer PRIMARY KEY NOT NULL,
	`last_attempt_at` integer NOT NULL,
	`last_success_at` integer,
	`last_preopen_at` integer,
	`last_outcome_at` integer,
	`scheduled_at` integer NOT NULL,
	`phase` text NOT NULL,
	`status` text NOT NULL,
	`target_date` text,
	`detail` text
);
