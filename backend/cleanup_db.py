#!/usr/bin/env python3
"""Clean up database for fresh migrations"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from database import get_connection

def cleanup():
    conn = get_connection()
    cursor = conn.cursor()
    
    # Drop dependent tables first
    tables_to_drop = ['migrations', 'task_tags', 'tags', 'subtasks', 'projects']
    for table in tables_to_drop:
        try:
            cursor.execute(f'DROP TABLE IF EXISTS {table}')
            print(f"Dropped table: {table}")
        except Exception as e:
            print(f"Could not drop {table}: {e}")
    
    # Check existing columns in tasks
    cursor.execute("SHOW COLUMNS FROM tasks")
    columns = [row[0] for row in cursor.fetchall()]
    
    columns_to_drop = ['priority', 'due_date', 'project_id', 'estimated_minutes', 'completed_at', 'updated_at']
    for col in columns_to_drop:
        if col in columns:
            try:
                cursor.execute(f'ALTER TABLE tasks DROP COLUMN {col}')
                print(f"Dropped column: {col}")
            except Exception as e:
                print(f"Could not drop column {col}: {e}")
    
    conn.commit()
    cursor.close()
    conn.close()
    print("Cleanup completed!")

if __name__ == "__main__":
    cleanup()