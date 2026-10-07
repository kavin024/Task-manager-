#!/usr/bin/env python3
"""Run database migrations"""

import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from database import get_connection

MIGRATIONS_DIR = Path(__file__).parent / "database" / "migrations"

def run_migrations():
    conn = get_connection()
    cursor = conn.cursor()
    
    # Create migrations tracking table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS migrations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            filename VARCHAR(255) NOT NULL UNIQUE,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    
    # Get already applied migrations
    cursor.execute("SELECT filename FROM migrations")
    applied = {row[0] for row in cursor.fetchall()}
    
    # Get migration files
    migration_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    
    for migration_file in migration_files:
        if migration_file.name in applied:
            print(f"Skipping {migration_file.name} (already applied)")
            continue
        
        print(f"Applying {migration_file.name}...")
        sql = migration_file.read_text()
        
        # Split by semicolon and execute each statement
        statements = [s.strip() for s in sql.split(';') if s.strip()]
        for stmt in statements:
            if stmt:
                cursor.execute(stmt)
        
        # Record migration
        cursor.execute("INSERT INTO migrations (filename) VALUES (%s)", (migration_file.name,))
        conn.commit()
        print(f"  [OK] Applied {migration_file.name}")
    
    cursor.close()
    conn.close()
    print("\nAll migrations completed!")

if __name__ == "__main__":
    run_migrations()