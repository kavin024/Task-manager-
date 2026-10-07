-- Migration: Create focus_sessions table

USE student_task_manager;

CREATE TABLE focus_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    task_id INT NULL,
    duration_minutes INT NOT NULL,
    started_at DATETIME NOT NULL,
    ended_at DATETIME NULL,
    completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_focus_sessions_task_id ON focus_sessions(task_id);
CREATE INDEX idx_focus_sessions_started_at ON focus_sessions(started_at);
CREATE INDEX idx_focus_sessions_completed ON focus_sessions(completed);