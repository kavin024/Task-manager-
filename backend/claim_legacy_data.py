#!/usr/bin/env python3
"""Assign pre-authentication ("legacy") rows to one account.

Rows created before authentication existed have user_id = NULL and are hidden
from every account. Run this once after creating the account that should own
that old data:

    python claim_legacy_data.py you@example.com
    python claim_legacy_data.py you@example.com --dry-run

This only ever touches rows whose user_id IS NULL, so it is safe to re-run.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from database import get_connection

# Tables that gained a user_id ownership column in migration 010.
OWNED_TABLES = [
    "tasks",
    "projects",
    "notes",
    "focus_sessions",
    "activity_logs",
]

# tags.name is unique per (name, user_id) since migration 013, so a legacy tag
# whose name the account already owns must be skipped to avoid a conflict.
TAG_CLAIM_SQL = """
    UPDATE tags t
    SET t.user_id = %s
    WHERE t.user_id IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM (
              SELECT name FROM tags WHERE user_id = %s
          ) existing
          WHERE existing.name = t.name
      )
"""


def count_unowned(cursor, table):
    cursor.execute(f"SELECT COUNT(*) FROM {table} WHERE user_id IS NULL")
    return cursor.fetchone()[0]


def find_user(cursor, email):
    cursor.execute("SELECT id, name, email FROM users WHERE email = %s", (email.lower().strip(),))
    return cursor.fetchone()


def claim(email, dry_run=False):
    email = (email or "").strip().lower()
    if not email:
        sys.exit("ERROR: An account email is required.")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    user = find_user(cursor, email)
    if not user:
        cursor.close()
        conn.close()
        sys.exit(f"ERROR: No account found for '{email}'. Create it first (register in the app).")

    user_id = user["id"]
    print(f"Claiming legacy data for user #{user_id} <{user['email']}> ({user['name']})")
    print()

    planned = {}
    for table in OWNED_TABLES:
        planned[table] = count_unowned(cursor, table)
    cursor.execute("SELECT COUNT(*) AS c FROM tags WHERE user_id IS NULL")
    planned["tags"] = cursor.fetchone()["c"]

    for table, count in planned.items():
        print(f"  {table}: {count} unowned row(s)")

    if dry_run:
        cursor.close()
        conn.close()
        print("\nDry run - nothing was changed.")
        return

    print()
    for table in OWNED_TABLES:
        cursor.execute(f"UPDATE {table} SET user_id = %s WHERE user_id IS NULL", (user_id,))
        print(f"  {table}: claimed {cursor.rowcount} row(s)")

    cursor.execute(TAG_CLAIM_SQL, (user_id, user_id))
    print(f"  tags: claimed {cursor.rowcount} row(s)")

    conn.commit()
    cursor.close()
    conn.close()
    print("\nDone. Sign in and your previous data will be visible.")


def main():
    parser = argparse.ArgumentParser(description="Assign legacy (user_id NULL) rows to one account.")
    parser.add_argument("email", help="Email of the account that should own the legacy data")
    parser.add_argument("--dry-run", action="store_true", help="Show what would change without writing")
    args = parser.parse_args()
    claim(args.email, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
