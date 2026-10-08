-- Migration: Create the initial tasks table
-- The active database is selected by DB_NAME in database.py
-- Never hardcode a USE <database> statement here.

CREATE TABLE IF NOT EXISTS tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Full-text search index used by /api/search (MATCH ... AGAINST)
CREATE FULLTEXT INDEX idx_tasks_title_description ON tasks(title, description);
