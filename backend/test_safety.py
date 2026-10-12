"""Guard that keeps the test suite away from the production database.

The backend tests create users and rows. That is fine against a scratch
database but never against the live FreeDB production database. Every
DB-touching test imports this module first; if the configured database looks
like production (or is any non-local host without an explicit opt-in), the
process exits before a single connection is opened.

To run tests safely, point the DB_* environment variables (or backend/.env) at
a local/test database, for example:

    DB_HOST=127.0.0.1 DB_USER=root DB_PASSWORD=... DB_NAME=student_task_manager_test

Override for a deliberately remote *test* database only:

    NEXUS_ALLOW_REMOTE_TESTS=1
"""

import os
import sys

import database


def _configured():
    return (
        (database.DB_HOST or "").strip(),
        (database.DB_NAME or "").strip(),
    )


def _abort(reason):
    host, name = _configured()
    print("", file=sys.stderr)
    print("=" * 72, file=sys.stderr)
    print("REFUSING TO RUN TESTS: " + reason, file=sys.stderr)
    print(f"  configured host: {host or '(empty)'}", file=sys.stderr)
    print(f"  configured db:   {name or '(empty)'}", file=sys.stderr)
    print("", file=sys.stderr)
    print("These tests create and delete rows. Point them at a local/test", file=sys.stderr)
    print("database instead of production, then re-run. Example:", file=sys.stderr)
    print("  DB_HOST=127.0.0.1 DB_USER=root DB_PASSWORD=... \\", file=sys.stderr)
    print("    DB_NAME=student_task_manager_test python test_api.py", file=sys.stderr)
    print("", file=sys.stderr)
    print("To override for a known remote test database, set NEXUS_ALLOW_REMOTE_TESTS=1.", file=sys.stderr)
    print("=" * 72, file=sys.stderr)
    sys.exit(2)


def ensure_safe_test_database():
    """Exit the process unless the configured database is safe to test against."""
    host, name = _configured()
    host_l = host.lower()
    name_l = name.lower()

    # Known production markers - never run mutating tests here.
    if "freedb" in host_l or "freedb" in name_l:
        _abort("the configured database looks like the production FreeDB database.")

    local_hosts = {"localhost", "127.0.0.1", "::1", "mysql", "db", "host.docker.internal"}
    if host_l not in local_hosts:
        if os.getenv("NEXUS_ALLOW_REMOTE_TESTS") != "1":
            _abort(
                f"host '{host}' is not local and NEXUS_ALLOW_REMOTE_TESTS is not set."
            )


# Run the guard as soon as this module is imported.
ensure_safe_test_database()
