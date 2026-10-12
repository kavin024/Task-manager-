"""Migration-safety tests (standalone, no database required).

Run with:  python test_migrations.py

Checks the things that must never regress in the schema layer:
  * the runner aborts on unexpected SQL errors instead of recording success
  * the "already exists" whitelist stays narrow (no data-conflict errnos)
  * migrations 008-013 are additive and never destroy existing records
  * migration 010 leaves legacy ownership as NULL (unclaimed)
"""

import re
import tempfile
from pathlib import Path

from mysql.connector import Error

import run_migrations

MIGRATIONS_DIR = Path(__file__).parent / "database" / "migrations"


# ---------------------------------------------------------------------------
# 1. Error whitelist: only genuine "object already exists" codes are skippable.
# ---------------------------------------------------------------------------
print("=== runner aborts on unrelated SQL errors, skips only 'already exists' ===")

SAFE = {1050, 1060, 1061, 1091, 1826}
UNSAFE = {
    1022,  # duplicate key - could be a real data conflict
    1062,  # duplicate entry - data conflict
    1064,  # syntax error
    1146,  # table doesn't exist
    1054,  # unknown column
    1452,  # FK constraint fails
    1690,  # value out of range
}
assert run_migrations.ALREADY_EXISTS_ERRORS == SAFE, run_migrations.ALREADY_EXISTS_ERRORS
assert not (run_migrations.ALREADY_EXISTS_ERRORS & UNSAFE), run_migrations.ALREADY_EXISTS_ERRORS
print("whitelist:", sorted(run_migrations.ALREADY_EXISTS_ERRORS))


class FakeCursor:
    """Minimal cursor that answers the runner's introspection queries."""

    def __init__(self, fail_on=None, applied=None):
        self.fail_on = fail_on or {}
        self.applied = applied or set()
        self.statements = []
        self._rows = []

    def execute(self, stmt, params=None):
        text = str(stmt).strip()
        self.statements.append(text)
        for needle, errno in self.fail_on.items():
            if needle in text:
                raise Error(msg="stubbed failure", errno=errno)
        upper = text.upper()
        if upper.startswith("SELECT VERSION()"):
            self._rows = [("8.0.0-stub",)]
        elif upper.startswith("SELECT DATABASE()"):
            self._rows = [("stub_db",)]
        elif upper.startswith("SHOW TABLES"):
            self._rows = []
        elif upper.startswith("SELECT FILENAME FROM MIGRATIONS"):
            self._rows = [(name,) for name in self.applied]
        else:
            self._rows = []

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def fetchall(self):
        return self._rows

    def close(self):
        pass


class FakeConn:
    def __init__(self, cursor):
        self._cursor = cursor
        self.commits = 0

    def cursor(self, *args, **kwargs):
        return self._cursor

    def commit(self):
        self.commits += 1

    def close(self):
        pass


def run_with(sql_text, fail_on):
    """Run the runner against a temp migration file; return the FakeCursor."""
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        (tmp_path / "900_test.sql").write_text(sql_text, encoding="utf-8")
        cursor = FakeCursor(fail_on=fail_on)
        conn = FakeConn(cursor)
        original_dir = run_migrations.MIGRATIONS_DIR
        original_conn = run_migrations.get_connection
        run_migrations.MIGRATIONS_DIR = tmp_path
        run_migrations.get_connection = lambda: conn
        try:
            run_migrations.run_migrations()
        finally:
            run_migrations.MIGRATIONS_DIR = original_dir
            run_migrations.get_connection = original_conn
        return cursor


skippable_sql = "CREATE TABLE a (id INT);\nCREATE INDEX idx_a ON a(id);\n"
cursor = run_with(skippable_sql, fail_on={"CREATE INDEX idx_a": 1061})
recorded = [s for s in cursor.statements if s.upper().startswith("INSERT INTO MIGRATIONS")]
assert recorded, "migration should still be recorded when an object already exists"
print("skippable duplicate index -> recorded:", bool(recorded))

try:
    run_with(skippable_sql, fail_on={"CREATE INDEX idx_a": 1064})
except Error as exc:
    print("unexpected error aborts with errno:", exc.errno)
    assert exc.errno == 1064
else:
    raise AssertionError("runner must NOT swallow a syntax error (1064)")

# Prove the aborted run never recorded the migration.
with tempfile.TemporaryDirectory() as tmp:
    tmp_path = Path(tmp)
    (tmp_path / "900_test.sql").write_text(skippable_sql, encoding="utf-8")
    bad_cursor = FakeCursor(fail_on={"CREATE INDEX idx_a": 1064})
    bad_conn = FakeConn(bad_cursor)
    original_dir, original_conn = run_migrations.MIGRATIONS_DIR, run_migrations.get_connection
    run_migrations.MIGRATIONS_DIR, run_migrations.get_connection = tmp_path, (lambda: bad_conn)
    try:
        run_migrations.run_migrations()
    except Error:
        pass
    finally:
        run_migrations.MIGRATIONS_DIR, run_migrations.get_connection = original_dir, original_conn
    assert not [s for s in bad_cursor.statements if s.upper().startswith("INSERT INTO MIGRATIONS")], \
        "a failed migration must never be recorded as applied"
print("aborted run is not recorded")
print()

# ---------------------------------------------------------------------------
# 2. Static scan: the new migrations must be additive / non-destructive.
# ---------------------------------------------------------------------------
print("=== migrations 008-013 are additive and preserve records ===")

new_files = sorted(MIGRATIONS_DIR.glob("0[01][89]_*.sql")) + sorted(MIGRATIONS_DIR.glob("01[0-3]_*.sql"))
assert new_files, "expected migrations 008-013 to exist"
DESTRUCTIVE = re.compile(r"\b(DROP\s+TABLE|TRUNCATE|DELETE\s+FROM|DROP\s+DATABASE)\b", re.IGNORECASE)
for path in new_files:
    text = path.read_text(encoding="utf-8")
    match = DESTRUCTIVE.search(text)
    assert not match, f"{path.name} contains a destructive statement: {match.group(0)}"
    print(f"  {path.name}: no destructive statements")
print()

print("=== migration 010 leaves legacy ownership NULL (unclaimed) ===")
ownership = (MIGRATIONS_DIR / "010_add_user_ownership.sql").read_text(encoding="utf-8")
# user_id must be nullable and must NOT be given a default owner.
assert re.search(r"ADD COLUMN user_id INT NULL", ownership), "user_id must be added as NULL"
assert not re.search(r"user_id[^;]*NOT NULL", ownership, re.IGNORECASE), "legacy user_id must stay NULL"
assert "DEFAULT" not in ownership, "legacy rows must not be auto-assigned an owner"
print("user_id added as NULL, no default owner")
print()

print("ALL MIGRATION SAFETY TESTS PASSED")
