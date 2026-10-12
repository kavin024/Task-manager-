-- Migration: Create reminder_deliveries table
-- Idempotency log: UNIQUE(user_id, reminder_date, status) guarantees at most
-- one 'sent' delivery per user per local reminder date, even on retries.
-- A 'failed' row keeps failed sends diagnosable and retryable without
-- ever sending a duplicate to a user who already received the reminder.
-- The active database is selected by DB_NAME in database.py - no USE statement.

CREATE TABLE IF NOT EXISTS reminder_deliveries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    reminder_date DATE NOT NULL,
    status VARCHAR(10) NOT NULL,
    summary_json JSON NULL,
    error_message TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_reminder_delivery (user_id, reminder_date, status),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_reminder_deliveries_user ON reminder_deliveries(user_id, reminder_date);