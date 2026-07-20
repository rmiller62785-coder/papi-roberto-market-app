CREATE TABLE `moo_safety_schema_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`schema_version` integer NOT NULL,
	`ready_at` integer NOT NULL,
	CONSTRAINT "moo_safety_schema_singleton_check" CHECK("moo_safety_schema_state"."id" = 1),
	CONSTRAINT "moo_safety_schema_version_check" CHECK("moo_safety_schema_state"."schema_version" >= 1)
);
--> statement-breakpoint
INSERT OR IGNORE INTO `moo_safety_schema_state` (`id`,`schema_version`,`ready_at`) VALUES (1,1,0);
