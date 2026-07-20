CREATE TABLE `market_observation_invalidations` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`feed` text NOT NULL,
	`symbol` text NOT NULL,
	`provider_trade_id` text NOT NULL,
	`kind` text NOT NULL,
	`replacement_provider_trade_id` text,
	`provider_time` integer NOT NULL,
	`received_at` integer NOT NULL,
	`processed_at` integer NOT NULL,
	`available_at` integer NOT NULL,
	`connection_epoch` text NOT NULL,
	`service_sequence` integer NOT NULL,
	`payload_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "market_observation_invalidation_kind_check" CHECK("market_observation_invalidations"."kind" IN ('CORRECTION','CANCEL'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `market_observation_invalidation_sequence_idx` ON `market_observation_invalidations` (`provider`,`feed`,`symbol`,`connection_epoch`,`service_sequence`);--> statement-breakpoint
CREATE INDEX `market_observation_invalidation_lookup_idx` ON `market_observation_invalidations` (`provider`,`feed`,`symbol`,`provider_trade_id`,`available_at`);--> statement-breakpoint
CREATE TABLE `market_stream_ingest_streams` (
	`stream_id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`feed` text NOT NULL,
	`symbol` text NOT NULL,
	`coverage_scope` text NOT NULL,
	`research_only_required` integer NOT NULL,
	`execution_eligible_allowed` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "market_stream_research_only_check" CHECK("market_stream_ingest_streams"."research_only_required" IN (0,1)),
	CONSTRAINT "market_stream_execution_eligible_check" CHECK("market_stream_ingest_streams"."execution_eligible_allowed" IN (0,1))
);
--> statement-breakpoint
CREATE TABLE `market_stream_ingest_cursors` (
	`stream_id` text PRIMARY KEY NOT NULL,
	`highest_contiguous_sequence` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "market_stream_cursor_sequence_check" CHECK("market_stream_ingest_cursors"."highest_contiguous_sequence" >= 0)
);
--> statement-breakpoint
CREATE TABLE `market_stream_ingest_emissions` (
	`stream_id` text NOT NULL,
	`service_sequence` integer NOT NULL,
	`emission_id` text NOT NULL,
	`connection_epoch` integer NOT NULL,
	`available_at` integer NOT NULL,
	`payload_hash` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "market_stream_emission_sequence_check" CHECK("market_stream_ingest_emissions"."service_sequence" > 0),
	CONSTRAINT "market_stream_emission_epoch_check" CHECK("market_stream_ingest_emissions"."connection_epoch" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `market_stream_emission_sequence_idx` ON `market_stream_ingest_emissions` (`stream_id`,`service_sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `market_stream_emission_id_idx` ON `market_stream_ingest_emissions` (`emission_id`);--> statement-breakpoint
CREATE INDEX `market_stream_emission_available_idx` ON `market_stream_ingest_emissions` (`available_at`);
