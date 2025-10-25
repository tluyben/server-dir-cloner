CREATE TABLE `servers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`server_id` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`api_key` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`last_seen` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `servers_server_id_unique` ON `servers` (`server_id`);--> statement-breakpoint
CREATE TABLE `sync_directories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`local_path` text NOT NULL,
	`remote_server_id` integer NOT NULL,
	`remote_path` text NOT NULL,
	`is_leader` integer DEFAULT false NOT NULL,
	`sync_direction` text DEFAULT 'bidirectional' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_sync_at` text,
	`error_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`remote_server_id`) REFERENCES `servers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sync_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sync_dir_id` integer NOT NULL,
	`action` text NOT NULL,
	`file_path` text NOT NULL,
	`direction` text NOT NULL,
	`status` text NOT NULL,
	`error_message` text,
	`file_size` integer,
	`checksum` text,
	`timestamp` text DEFAULT (datetime('now')) NOT NULL,
	`processing_time_ms` integer,
	FOREIGN KEY (`sync_dir_id`) REFERENCES `sync_directories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sync_queue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sync_dir_id` integer NOT NULL,
	`action` text NOT NULL,
	`file_path` text NOT NULL,
	`priority` integer DEFAULT 5 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error_message` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`sync_dir_id`) REFERENCES `sync_directories`(`id`) ON UPDATE no action ON DELETE cascade
);
