"""Reminders test suite (standalone script, mirrors the other test files).

Run with:  python test_reminders.py
Covers: the fixed-schedule summary building, the advisory job lock that
serializes concurrent runs, duplicate delivery protection, SMTP success/failure
paths with a stubbed SMTP client, HTML escaping, and the internal job token gate.
No command actually emails a real person: the SMTP client is always stubbed.
"""

import os
import sys

import test_helpers as h
import reminders
from auth import hash_token  # noqa: F401 (used to demonstrate hashed storage)


class FakeSMTP:
    """Captures outbound addresses; never opens a real socket."""

    SENT = []
    LOGGED_IN = []

    def __init__(self, *args, **kwargs):
        pass

    def starttls(self):
        pass

    def login(self, username, password):
        FakeSMTP.LOGGED_IN.append((username, "password" if password else ""))

    def sendmail(self, from_email, to_emails, msg):
        FakeSMTP.SENT.extend(to_emails if isinstance(to_emails, list) else [to_emails])

    def quit(self):
        pass


def fake_config():
    return {
        "host": "smtp.example.com",
        "port": 587,
        "username": "bot@example.com",
        "password": "sekret",
        "from_email": "bot@example.com",
    }


client = h.get_client()

print("=== send_daily_reminders with no SMTP config ===")
orig_config = reminders.get_smtp_config
reminders.get_smtp_config = lambda: None
result = reminders.send_daily_reminders()
print("Result:", result)
assert result["ok"] is False
assert "SMTP" in result["error"]
assert result["failed"] == 0
assert result["sent"] == 0
print()

print("=== build_summary counts only the user's own tasks ===")
user = h.register_user(client)
now = reminders.user_local_now(reminders.DEFAULT_TIMEZONE)
today = now.date()
from datetime import timedelta

h.create_task(client, user, title="plain pending", status="Pending")
h.create_task(client, user, title="overdue", status="Pending", due_date=(today - timedelta(days=2)).isoformat())
h.create_task(client, user, title="due today", status="In Progress", due_date=today.isoformat())
h.create_task(client, user, title="upcoming", status="Backlog", due_date=(today + timedelta(days=1)).isoformat())
h.create_task(client, user, title="done", status="Completed")

other = h.register_user(client, name="Other User")
h.create_task(client, other, title="other person overdue", status="Pending",
              due_date=(today - timedelta(days=1)).isoformat())

conn = __import__("database").get_connection()
summary = reminders.build_summary(conn, user["user"]["id"], today, now)
print("Summary:", summary)
assert summary["pending"] == 4, summary
assert summary["overdue"] == 1, summary
assert summary["due_today"] == 1, summary
assert len(summary["upcoming"]) == 1 and summary["upcoming"][0][0] == "upcoming", summary

other_summary = reminders.build_summary(conn, other["user"]["id"], today, now)
print("Other user summary:", other_summary)
assert other_summary["overdue"] == 1 and other_summary["pending"] == 1, other_summary
print()

print("=== duplicate delivery prevention ===")
uid = user["user"]["id"]
reminders.record_delivery(conn, uid, today, "sent", summary)
reminders.record_delivery(conn, uid, today, "sent", summary)
cursor = conn.cursor()
cursor.execute(
    "SELECT COUNT(*) FROM reminder_deliveries WHERE user_id = %s AND reminder_date = %s AND status = 'sent'",
    (uid, today),
)
count = cursor.fetchone()[0]
print("sent rows after two record_delivery calls:", count)
assert count == 1, count
cursor.close()

cursor = conn.cursor(dictionary=True)
already = reminders._already_sent_today(cursor, uid, today)
cursor.close()
print("already sent today:", already)
assert already is True
reminders.record_delivery(conn, uid, today, "failed", {"pending": 4}, "Boom")
print()

print("=== concurrent runs are serialized by the advisory lock ===")
from database import get_connection

reminders.get_smtp_config = fake_config
lock_conn = get_connection()
assert reminders.acquire_job_lock(lock_conn, 0) is True, "external holder should get the lock"
FakeSMTP.SENT = []
locked = reminders.send_daily_reminders()
print("Locked pass:", {k: locked.get(k) for k in ("ok", "locked", "sent", "skipped_already_sent")})
assert locked.get("locked") is True, "second run must back off, not send"
assert locked["sent"] == 0
assert FakeSMTP.SENT == [], "no email may be sent while another pass holds the lock"
reminders.release_job_lock(lock_conn)
lock_conn.close()
# And the lock is free again afterwards.
unlock_probe = get_connection()
assert reminders.acquire_job_lock(unlock_probe, 0) is True
reminders.release_job_lock(unlock_probe)
unlock_probe.close()
reminders.get_smtp_config = orig_config
print()

print("=== send_email_via_smtp propagates failures ===")
reminders.smtplib.SMTP = FakeSMTP
config = fake_config()

class AlwaysFailSMTP(reminders.smtplib.SMTP):
    def sendmail(self, *args, **kwargs):
        raise RuntimeError("network down (stubbed)")

reminders.smtplib.SMTP = AlwaysFailSMTP
try:
    reminders.send_email_via_smtp(config, "x@example.com", "s", "<b>hi</b>", "hi")
    raised = False
except RuntimeError:
    raised = True
print("failure raises:", raised)
assert raised is True
reminders.smtplib.SMTP = FakeSMTP
print()

print("=== full pass with stubbed SMTP -> sent exactly once ===")
reminders.get_smtp_config = fake_config
# Fresh user so it has no 'sent' row for today yet.
send_user = h.register_user(client, name="Reminder Recipient")
h.create_task(client, send_user, title="needs attention", status="Pending")
FakeSMTP.SENT = []
first = reminders.send_daily_reminders()
print("First pass:", {k: first[k] for k in ("ok", "sent", "skipped_already_sent", "skipped_empty", "failed")})
assert first["ok"] is True
print("Outbound to:", FakeSMTP.SENT)
assert send_user["email"] in FakeSMTP.SENT
sent_after_first = len(FakeSMTP.SENT)

# The result must expose only aggregate counts - never recipient addresses.
assert isinstance(first["failed"], int), first["failed"]
assert all(not isinstance(v, list) for v in first.values()), first

second = reminders.send_daily_reminders()
print("Second pass:", {k: second[k] for k in ("ok", "sent", "skipped_already_sent", "failed")})
assert second["ok"] is True
assert len(FakeSMTP.SENT) == sent_after_first, "second pass must not email anyone again"
assert second["sent"] == 0
print()

print("=== HTML escapes task titles ===")
html_body = reminders.render_html("A&G <Team>", {"pending": 1, "overdue": 0, "due_today": 0, "upcoming": [("Calc <x>", None)]}, "https://x.test")
assert "&lt;x&gt;" in html_body, html_body
assert "<script>" not in html_body
print("escaping OK")
print()

print("=== internal job endpoint honours the token ===")
# Deterministic check even if SMTP is unset on this machine.
os.environ["REMINDER_JOB_TOKEN"] = "super-secret-test-token"
reminders.get_smtp_config = lambda: None
r = client.post("/api/internal/send-daily-reminders", headers={"X-Reminder-Token": "super-secret-test-token"})
print("correct token, SMTP unset ->", r.status_code)
assert r.status_code == 503
r = client.post("/api/internal/send-daily-reminders", headers={"X-Reminder-Token": "nope"})
print("wrong token ->", r.status_code)
assert r.status_code == 403
r = client.post("/api/internal/send-daily-reminders")
print("missing token ->", r.status_code)
assert r.status_code == 403
# With no server-side token configured, even a random guess is refused.
del os.environ["REMINDER_JOB_TOKEN"]
r = client.post("/api/internal/send-daily-reminders", headers={"X-Reminder-Token": "anything"})
print("server token unset ->", r.status_code)
assert r.status_code == 403
reminders.get_smtp_config = orig_config
print()

conn.close()

print("ALL REMINDER TESTS PASSED")