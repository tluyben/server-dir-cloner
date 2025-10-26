CREATE TABLE `sync_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_path` text NOT NULL,
	`remote_server_id` integer NOT NULL,
	`remote_file_path` text NOT NULL,
	`is_leader` integer DEFAULT false NOT NULL,
	`sync_direction` text DEFAULT 'bidirectional' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`file_exists` integer DEFAULT false NOT NULL,
	`parent_directory` text NOT NULL,
	`last_sync_at` text,
	`error_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`remote_server_id`) REFERENCES `servers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sync_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sync_dir_id` integer,
	`sync_file_id` integer,
	`action` text NOT NULL,
	`file_path` text NOT NULL,
	`direction` text NOT NULL,
	`status` text NOT NULL,
	`error_message` text,
	`file_size` integer,
	`checksum` text,
	`timestamp` text DEFAULT (datetime('now')) NOT NULL,
	`processing_time_ms` integer,
	FOREIGN KEY (`sync_dir_id`) REFERENCES `sync_directories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sync_file_id`) REFERENCES `sync_files`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_sync_logs`("id", "sync_dir_id", "action", "file_path", "direction", "status", "error_message", "file_size", "checksum", "timestamp", "processing_time_ms") SELECT "id", "sync_dir_id", "action", "file_path", "direction", "status", "error_message", "file_size", "checksum", "timestamp", "processing_time_ms" FROM `sync_logs`;--> statement-breakpoint
DROP TABLE `sync_logs`;--> statement-breakpoint
ALTER TABLE `__new_sync_logs` RENAME TO `sync_logs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_sync_queue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sync_dir_id` integer,
	`sync_file_id` integer,
	`action` text NOT NULL,
	`file_path` text NOT NULL,
	`priority` integer DEFAULT 5 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error_message` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`sync_dir_id`) REFERENCES `sync_directories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sync_file_id`) REFERENCES `sync_files`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_sync_queue`("id", "sync_dir_id", "action", "file_path", "priority", "attempts", "max_attempts", "status", "error_message", "created_at", "updated_at") SELECT "id", "sync_dir_id", "action", "file_path", "priority", "attempts", "max_attempts", "status", "error_message", "created_at", "updated_at" FROM `sync_queue`;--> statement-breakpoint
DROP TABLE `sync_queue`;--> statement-breakpoint
ALTER TABLE `__new_sync_queue` RENAME TO `sync_queue`;