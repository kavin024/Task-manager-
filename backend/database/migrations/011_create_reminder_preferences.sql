-- Migration: Create reminder preference table
-- Stores each user's daily email reminder settings in MySQL.
-- Defaults: enabled, 06:00 in Asia/Kolkata, delivered to the account email.
-- The active database is selected by DB_NAME in database.py - no USE statement.

CREATE TABLE IF NOT EXISTS reminder_preferences (
    user_id INT PRIMARY KEY,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    remind_time TIME NOT NULL DEFAULT '06:00:00',
    timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    reminder_email VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_reminder_preferences_enabled ON reminder_preferences(enabled, reminder_email);