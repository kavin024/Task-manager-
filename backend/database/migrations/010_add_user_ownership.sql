-- Migration: Add user ownership to user-owned tables
-- New rows get user_id NULL until a registered user claims them:
-- legacy records stay hidden and are never exposed to any account.
-- The claim_legacy_data.py script can assign unowned rows to one chosen user.
-- The active database is selected by DB_NAME in database.py - no USE statement.

ALTER TABLE tasks ADD COLUMN user_id INT NULL;
ALTER TABLE tasks ADD INDEX idx_tasks_user_id (user_id);
ALTER TABLE tasks ADD CONSTRAINT fk_tasks_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE projects ADD COLUMN user_id INT NULL;
ALTER TABLE projects ADD INDEX idx_projects_user_id (user_id);
ALTER TABLE projects ADD CONSTRAINT fk_projects_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE notes ADD COLUMN user_id INT NULL;
ALTER TABLE notes ADD INDEX idx_notes_user_id (user_id);
ALTER TABLE notes ADD CONSTRAINT fk_notes_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE tags ADD COLUMN user_id INT NULL;
ALTER TABLE tags ADD INDEX idx_tags_user_id (user_id);
ALTER TABLE tags ADD CONSTRAINT fk_tags_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE focus_sessions ADD COLUMN user_id INT NULL;
ALTER TABLE focus_sessions ADD INDEX idx_focus_sessions_user_id (user_id);
ALTER TABLE focus_sessions ADD CONSTRAINT fk_focus_sessions_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE activity_logs ADD COLUMN user_id INT NULL;
ALTER TABLE activity_logs ADD INDEX idx_activity_logs_user_id (user_id);
ALTER TABLE activity_logs ADD CONSTRAINT fk_activity_logs_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;