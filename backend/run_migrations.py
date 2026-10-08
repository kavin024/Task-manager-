#!/usr/bin/env python3
"""Run database migrations"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from database import get_connection, DB_HOST
from mysql.connector import Error

MIGRATIONS_DIR = Path(__file__).parent / "database" / "migrations"

# Errors that mean "this object already exists" - safe to skip, never destructive.
ALREADY_EXISTS_ERRORS = {
    1050,  # table already exists
    1060,  # duplicate column name
    1061,  # duplicate key name (index)
    1022,  # duplicate key
}


def is_comment_only(stmt):
    """True when a statement chunk contains nothing but comments / whitespace."""
    for line in stmt.splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("--"):
            return False
    return True


def list_tables(cursor):
    cursor.execute("SHOW TABLES")
    return sorted(row[0] for row in cursor.fetchall())


def verify_connection(cursor):
    cursor.execute("SELECT VERSION()")
    version = cursor.fetchone()[0]
    print(f"Connected to MySQL server {version} on host: {DB_HOST}")

    cursor.execute("SELECT DATABASE()")
    current = cursor.fetchone()[0]
    if not current:
        sys.exit("ERROR: No database selected. Check the DB_NAME environment variable.")
    print(f"Active database: {current}")

    tables = list_tables(cursor)
    if tables:
        print(f"Existing tables ({len(tables)}): {', '.join(tables)}")
    else:
        print("Existing tables: none (empty database - all migrations will be applied)")


def run_migrations():
    conn = get_connection()
    cursor = conn.cursor()

    verify_connection(cursor)
    print()

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
    if not migration_files:
        print("No migration files found.")
        sys.exit(1)

    for migration_file in migration_files:
        if migration_file.name in applied:
            print(f"Skipping {migration_file.name} (already applied)")
            continue

        print(f"Applying {migration_file.name}...")
        sql = migration_file.read_text()

        # Split by semicolon and execute each statement
        statements = [s.strip() for s in sql.split(';') if s.strip()]
        for stmt in statements:
            if not stmt or is_comment_only(stmt):
                continue
            try:
                cursor.execute(stmt)
            except Error as e:
                if e.errno in ALREADY_EXISTS_ERRORS:
                    print(f"  [SKIP] already exists: {e.msg}")
                    continue
                print(f"  [ERROR] {stmt[:80]}...")
                raise

        # Record migration
        cursor.execute("INSERT INTO migrations (filename) VALUES (%s)", (migration_file.name,))
        conn.commit()
        print(f"  [OK] Applied {migration_file.name}")

    print()
    print("Current tables:")
    for table in list_tables(cursor):
        print(f"  - {table}")

    cursor.close()
    conn.close()
    print("\nAll migrations completed!")


if __name__ == "__main__":
    try:
        run_migrations()
    except Error as exc:
        print(f"\nMigration failed: {exc}")
        sys.exit(1)