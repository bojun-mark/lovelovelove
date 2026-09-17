CREATE INDEX `quiz_sessions_guest_session_hash_idx` ON `quiz_sessions` (`guestSessionHash`);--> statement-breakpoint
CREATE INDEX `quiz_sessions_expires_at_idx` ON `quiz_sessions` (`expiresAt`);