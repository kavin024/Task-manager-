-- Migration: Create activity_logs table

USE student_task_manager;

CREATE TABLE activity_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    task_id INT NULL,
    project_id INT NULL,
    action VARCHAR(50) NOT NULL,
    description TEXT,
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE INDEX idx_activity_logs_task_id ON activity_logs(task_id);
CREATE INDEX idx_activity_logs_project_id ON activity_logs(project_id);
CREATE INDEX idx_activity_logs_created_at ON activity_logs(created_at);
CREATE INDEX idx_activity_logs_action ON activity_logs(action);