-- Explicit migration after historical 0004/0005 files drifted from the
-- Drizzle journal. Do not replay or rewrite those already-deployed migrations.
CREATE TABLE IF NOT EXISTS `market_source_state_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`feed` text NOT NULL,
	`symbol` text NOT NULL,
	`state` text NOT NULL CHECK (`state` IN ('CURRENT','STALE','MARKET_CLOSED','RECOVERING','UNAVAILABLE','ERROR')),
	`entitlement` text NOT NULL CHECK (`entitlement` IN ('ENTITLED','NOT_ENTITLED','UNKNOWN')),
	`coverage` text NOT NULL,
	`observed_at` integer,
	`checked_at` integer NOT NULL,
	`received_at` integer NOT NULL,
	`processed_at` integer NOT NULL,
	`available_at` integer NOT NULL,
	`connection_epoch` text,
	`service_sequence` integer,
	`detail_code` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `market_source_state_lookup_idx` ON `market_source_state_events` (`provider`,`feed`,`symbol`,`checked_at` DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `market_qualified_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`feed` text NOT NULL,
	`symbol` text NOT NULL,
	`session_date` text NOT NULL,
	`kind` text NOT NULL CHECK (`kind` IN ('TRADE','QUOTE','OPENING_CROSS','INDICATIVE')),
	`qualification` text NOT NULL CHECK (`qualification` IN ('RESEARCH','STRICT_EXECUTION')),
	`entitlement` text NOT NULL CHECK (`entitlement` IN ('ENTITLED','NOT_ENTITLED','UNKNOWN')),
	`coverage` text NOT NULL,
	`price` real NOT NULL,
	`size` real,
	`provider_event_id` text,
	`provider_time` integer NOT NULL,
	`received_at` integer NOT NULL,
	`processed_at` integer NOT NULL,
	`available_at` integer NOT NULL,
	`connection_epoch` text NOT NULL,
	`service_sequence` integer NOT NULL,
	`payload_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `market_observation_sequence_idx` ON `market_qualified_observations` (`provider`,`feed`,`symbol`,`connection_epoch`,`service_sequence`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `market_observation_time_idx` ON `market_qualified_observations` (`symbol`,`session_date`,`provider_time` DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `market_completed_minute_bars` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`feed` text NOT NULL,
	`symbol` text NOT NULL,
	`session_date` text NOT NULL,
	`minute_start` integer NOT NULL,
	`minute_end` integer NOT NULL,
	`open` real NOT NULL,
	`high` real NOT NULL,
	`low` real NOT NULL,
	`close` real NOT NULL,
	`volume` real NOT NULL,
	`trade_count` integer,
	`provider_time` integer NOT NULL,
	`received_at` integer NOT NULL,
	`processed_at` integer NOT NULL,
	`available_at` integer NOT NULL,
	`connection_epoch` text NOT NULL,
	`service_sequence` integer NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`recovered` integer DEFAULT 0 NOT NULL,
	`payload_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	CHECK (`minute_end` = `minute_start` + 60000),
	CHECK (`high` >= `low`),
	CHECK (`open` BETWEEN `low` AND `high`),
	CHECK (`close` BETWEEN `low` AND `high`),
	CHECK (`volume` >= 0),
	CHECK (`revision` >= 0),
	CHECK (`recovered` IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `market_minute_revision_idx` ON `market_completed_minute_bars` (`provider`,`feed`,`symbol`,`minute_start`,`revision`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `market_minute_lookup_idx` ON `market_completed_minute_bars` (`symbol`,`session_date`,`minute_start` DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `market_session_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`target_date` text NOT NULL,
	`checkpoint` text NOT NULL,
	`provider` text NOT NULL,
	`feed` text NOT NULL,
	`symbol` text NOT NULL,
	`captured_at` integer NOT NULL,
	`source_watermark_at` integer NOT NULL,
	`received_at` integer NOT NULL,
	`processed_at` integer NOT NULL,
	`available_at` integer NOT NULL,
	`quality_state` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `market_session_snapshot_watermark_idx` ON `market_session_snapshots` (`target_date`,`checkpoint`,`provider`,`feed`,`symbol`,`source_watermark_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `market_session_snapshot_lookup_idx` ON `market_session_snapshots` (`target_date`,`captured_at` DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `scheduler_runs` (
	`run_id` text PRIMARY KEY NOT NULL,
	`job_key` text NOT NULL,
	`scheduled_at` integer NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer NOT NULL,
	`phase` text NOT NULL,
	`checkpoint` text NOT NULL,
	`status` text NOT NULL,
	`target_date` text,
	`transport_succeeded` integer NOT NULL CHECK (`transport_succeeded` IN (0,1)),
	`snapshot_succeeded` integer NOT NULL CHECK (`snapshot_succeeded` IN (0,1)),
	`freeze_succeeded` integer NOT NULL CHECK (`freeze_succeeded` IN (0,1)),
	`detail_code` text,
	`detail` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `scheduler_runs_scheduled_idx` ON `scheduler_runs` (`scheduled_at` DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `scheduler_runs_job_idx` ON `scheduler_runs` (`job_key`,`completed_at` DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `market_ingest_nonces` (
	`nonce` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `market_ingest_nonces_expiry_idx` ON `market_ingest_nonces` (`expires_at`);
