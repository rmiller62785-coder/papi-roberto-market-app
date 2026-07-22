CREATE TABLE `market_archive_segments` (
	`segment_id` text PRIMARY KEY NOT NULL,
	`stream_id` text NOT NULL,
	`provider` text NOT NULL,
	`feed` text NOT NULL,
	`symbol` text NOT NULL,
	`session_date` text NOT NULL,
	`from_sequence` integer NOT NULL,
	`to_sequence` integer NOT NULL,
	`object_key` text NOT NULL,
	`content_hash` text NOT NULL,
	`row_count` integer NOT NULL,
	`byte_length` integer NOT NULL,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`verified_at` integer,
	`failure_code` text,
	CONSTRAINT "market_archive_sequence_check" CHECK("market_archive_segments"."from_sequence" > 0 AND "market_archive_segments"."to_sequence" >= "market_archive_segments"."from_sequence"),
	CONSTRAINT "market_archive_counts_check" CHECK("market_archive_segments"."row_count" > 0 AND "market_archive_segments"."byte_length" > 0),
	CONSTRAINT "market_archive_state_check" CHECK("market_archive_segments"."state" IN ('PENDING','VERIFIED','FAILED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `market_archive_range_idx` ON `market_archive_segments` (`stream_id`,`from_sequence`,`to_sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `market_archive_stream_start_idx` ON `market_archive_segments` (`stream_id`,`from_sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `market_archive_object_key_idx` ON `market_archive_segments` (`object_key`);--> statement-breakpoint
CREATE INDEX `market_archive_session_idx` ON `market_archive_segments` (`symbol`,`session_date`,`stream_id`,`from_sequence`);--> statement-breakpoint
CREATE TABLE `moo_decision_artifacts` (
	`artifact_id` text PRIMARY KEY NOT NULL,
	`target_session` text NOT NULL,
	`state` text NOT NULL,
	`execution_environment` text NOT NULL,
	`evaluated_at` integer NOT NULL,
	`cutoff_at` integer NOT NULL,
	`frozen_at` integer NOT NULL,
	`feature_snapshot_id` text,
	`model_version` text,
	`risk_policy_version` text,
	`content_hash` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "moo_decision_state_check" CHECK("moo_decision_artifacts"."state" IN ('READY','NO_EDGE','BLOCKED')),
	CONSTRAINT "moo_decision_environment_check" CHECK("moo_decision_artifacts"."execution_environment" IN ('paper','live'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `moo_decision_target_idx` ON `moo_decision_artifacts` (`target_session`);--> statement-breakpoint
CREATE UNIQUE INDEX `moo_decision_content_hash_idx` ON `moo_decision_artifacts` (`content_hash`);--> statement-breakpoint
CREATE TABLE `moo_decision_outcomes` (
	`artifact_id` text PRIMARY KEY NOT NULL,
	`target_session` text NOT NULL,
	`content_hash` text NOT NULL,
	`payload_json` text NOT NULL,
	`captured_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `moo_decision_outcome_hash_idx` ON `moo_decision_outcomes` (`content_hash`);--> statement-breakpoint
CREATE INDEX `moo_decision_outcome_target_idx` ON `moo_decision_outcomes` (`target_session`);--> statement-breakpoint
CREATE TABLE `moo_feature_snapshots` (
	`snapshot_id` text PRIMARY KEY NOT NULL,
	`target_session` text NOT NULL,
	`as_of` integer NOT NULL,
	`captured_at` integer NOT NULL,
	`feature_schema_version` text NOT NULL,
	`state` text NOT NULL,
	`quality_state` text NOT NULL,
	`quality_score` real,
	`content_hash` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "moo_feature_state_check" CHECK("moo_feature_snapshots"."state" IN ('PARTIAL','QUALIFIED','REJECTED')),
	CONSTRAINT "moo_feature_quality_state_check" CHECK("moo_feature_snapshots"."quality_state" IN ('PASS','FAIL','UNAVAILABLE')),
	CONSTRAINT "moo_feature_quality_score_check" CHECK("moo_feature_snapshots"."quality_score" IS NULL OR ("moo_feature_snapshots"."quality_score" >= 0 AND "moo_feature_snapshots"."quality_score" <= 100))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `moo_feature_content_hash_idx` ON `moo_feature_snapshots` (`content_hash`);--> statement-breakpoint
CREATE INDEX `moo_feature_target_asof_idx` ON `moo_feature_snapshots` (`target_session`,"as_of" desc);--> statement-breakpoint
CREATE TABLE `moo_model_entries` (
	`model_version` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`feature_schema_version` text NOT NULL,
	`expected_target_session` text NOT NULL,
	`artifact_key` text NOT NULL,
	`artifact_hash` text NOT NULL,
	`trained_through` integer NOT NULL,
	`promoted_at` integer,
	`content_hash` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "moo_model_status_check" CHECK("moo_model_entries"."status" IN ('CANDIDATE','PROMOTED','RETIRED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `moo_model_content_hash_idx` ON `moo_model_entries` (`content_hash`);--> statement-breakpoint
CREATE INDEX `moo_model_status_target_idx` ON `moo_model_entries` (`status`,`expected_target_session`);--> statement-breakpoint
CREATE TABLE `moo_model_promotion_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`model_version` text NOT NULL,
	`from_status` text NOT NULL,
	`to_status` text NOT NULL,
	`actor_email` text NOT NULL,
	`event_at` integer NOT NULL,
	`reason` text NOT NULL,
	`content_hash` text NOT NULL,
	CONSTRAINT "moo_model_promotion_from_check" CHECK("moo_model_promotion_events"."from_status" IN ('CANDIDATE','PROMOTED','RETIRED')),
	CONSTRAINT "moo_model_promotion_to_check" CHECK("moo_model_promotion_events"."to_status" IN ('CANDIDATE','PROMOTED','RETIRED'))
);
--> statement-breakpoint
CREATE INDEX `moo_model_promotion_version_idx` ON `moo_model_promotion_events` (`model_version`,"event_at" desc);
