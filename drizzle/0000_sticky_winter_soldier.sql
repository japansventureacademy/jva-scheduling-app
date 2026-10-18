CREATE TABLE `availability` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`interviewer_email` text NOT NULL,
	`department` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`booked` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `availability_interviewer_start_unique` ON `availability` (`interviewer_email`,`starts_at`);--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`availability_id` integer NOT NULL,
	`candidate_name` text NOT NULL,
	`candidate_email` text NOT NULL,
	`department` text NOT NULL,
	`preferences` text NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`calendar_event_id` text,
	`meet_url` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`availability_id`) REFERENCES `availability`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_availability_unique` ON `bookings` (`availability_id`);