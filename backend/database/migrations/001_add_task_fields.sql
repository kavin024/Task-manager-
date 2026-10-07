-- Migration: Add priority, due_date, project_id, completed_at, estimated_minutes to tasks
-- Run this after the initial tasks table exists

USE student_task_manager;

-- Add new columns to tasks table
ALTER TABLE tasks 
ADD COLUMN priority VARCHAR(20) DEFAULT 'Medium',
ADD COLUMN due_date DATETIME NULL,
ADD COLUMN project_id INT NULL,
ADD COLUMN estimated_minutes INT NULL,
ADD COLUMN completed_at DATETIME NULL,
ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Add indexes for new columns only
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_project_id ON tasks(project_id);