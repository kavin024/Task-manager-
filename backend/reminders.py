"""Daily email reminders.

Delivery pipeline used by POST /api/internal/send-daily-reminders:

1. Load SMTP configuration from environment variables (never from source).
2. Find every eligible user (reminders enabled, has a reminder email).
3. Compute "today" in the single supported schedule: 06:00 Asia/Kolkata.
4. Build a concise summary from the user's own tasks.
5. Send HTML + plain-text email over SMTP.
6. Record the outcome in reminder_deliveries.

Delivery guarantees are deliberately modest: this is *at-most-once per IST
day, best effort*, not exactly-once. Overlapping runs are coordinated with a
MySQL advisory lock (GET_LOCK) so two concurrent passes cannot both send, and
a UNIQUE(user_id, reminder_date, status) row means a user is skipped once a
'sent' row exists for the day. A mail that is handed to SMTP but then times
out is recorded as 'failed' and may be retried the same day; SMTP itself
gives no acknowledgement we can trust to promise exactly-once.

Nothing here is a real credential; the SMTP password is read from the
environment at call time and is never logged.
"""

import html
import json
import os
import smtplib
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import database

DEFAULT_TIMEZONE = "Asia/Kolkata"
DEFAULT_REMIND_TIME = "06:00:00"
SUBJECT = "Your Daily Task Reminder"

# One reminder schedule for everyone: daily at 06:00 Asia/Kolkata.
# Names a MySQL advisory lock so concurrent runs cannot send twice.
JOB_LOCK_NAME = "student_task_manager_daily_reminders"

ACTIVE_STATUSES_EXPR = "status NOT IN ('Completed', 'Archived')"


def get_smtp_config():
    """Return a dict of SMTP settings, or None when configuration is incomplete."""
    host = os.getenv("SMTP_HOST", "").strip()
    username = os.getenv("SMTP_USERNAME", "").strip()
    password = os.getenv("SMTP_PASSWORD", "")
    from_email = os.getenv("SMTP_FROM_EMAIL", "").strip()
    if not (host and username and from_email):
        return None
    try:
        port = int(os.getenv("SMTP_PORT", "587"))
    except ValueError:
        port = 587
    return {
        "host": host,
        "port": port,
        "username": username,
        "password": password,
        "from_email": from_email,
    }


def get_frontend_url():
    return os.getenv("FRONTEND_URL", "").strip() or "https://kavin024.github.io/Task-manager-/"


def build_tz(tz_name):
    """Return a ZoneInfo for tz_name, falling back to Asia/Kolkata on error."""
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

    try:
        return ZoneInfo(tz_name or DEFAULT_TIMEZONE)
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo(DEFAULT_TIMEZONE)


def user_local_now(tz_name):
    return datetime.now(build_tz(tz_name)).replace(tzinfo=None)


def collect_eligible_users(conn):
    """Every user with reminders enabled and an email, independent of schedule.

    The schedule is fixed (06:00 Asia/Kolkata) for all users, so no per-user
    time or timezone is read here.
    """
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        """SELECT u.id, u.email AS account_email, u.name,
                  COALESCE(p.enabled, 1) AS enabled,
                  COALESCE(p.reminder_email, u.email) AS reminder_email
           FROM users u
           LEFT JOIN reminder_preferences p ON p.user_id = u.id
           WHERE COALESCE(p.enabled, 1) = 1
           ORDER BY u.id"""
    )
    rows = cursor.fetchall()
    cursor.close()
    return rows


def _already_sent_today(cursor, user_id, today):
    cursor.execute(
        "SELECT id FROM reminder_deliveries WHERE user_id = %s AND reminder_date = %s AND status = 'sent'",
        (user_id, today),
    )
    return cursor.fetchone() is not None


def build_summary(conn, user_id, today, now):
    """Count the user's own tasks needing attention. Uses existing statuses only."""
    cursor = conn.cursor(dictionary=True)
    summary = {"pending": 0, "overdue": 0, "due_today": 0, "upcoming": 0}

    cursor.execute(
        f"""SELECT COUNT(*) AS total FROM tasks
            WHERE user_id = %s AND {ACTIVE_STATUSES_EXPR}""",
        (user_id,),
    )
    summary["pending"] = int((cursor.fetchone() or {}).get("total") or 0)

    cursor.execute(
        f"""SELECT COUNT(*) AS total FROM tasks
            WHERE user_id = %s AND {ACTIVE_STATUSES_EXPR} AND due_date IS NOT NULL AND DATE(due_date) < %s""",
        (user_id, today),
    )
    summary["overdue"] = int((cursor.fetchone() or {}).get("total") or 0)

    cursor.execute(
        f"""SELECT COUNT(*) AS total FROM tasks
            WHERE user_id = %s AND {ACTIVE_STATUSES_EXPR}
              AND due_date IS NOT NULL AND DATE(due_date) = %s""",
        (user_id, today),
    )
    summary["due_today"] = int((cursor.fetchone() or {}).get("total") or 0)

    cursor.execute(
        f"""SELECT title, due_date FROM tasks
            WHERE user_id = %s AND {ACTIVE_STATUSES_EXPR}
              AND due_date IS NOT NULL AND due_date >= %s
            ORDER BY due_date ASC LIMIT 5""",
        (user_id, now),
    )
    summary["upcoming"] = [(row["title"], row["due_date"]) for row in cursor.fetchall()]
    cursor.close()
    return summary


def _is_empty_summary(summary):
    return (
        summary["pending"] == 0
        and summary["overdue"] == 0
        and summary["due_today"] == 0
        and not summary["upcoming"]
    )


def render_html(user_name, summary, frontend_url):
    name = html.escape(user_name or "there")
    lines = []

    def li(label, value):
        lines.append(f"<li><strong>{html.escape(label)}:</strong> {value}</li>")

    if summary["pending"]:
        li("Pending tasks", summary["pending"])
    if summary["overdue"]:
        li("Overdue", summary["overdue"])
    if summary["due_today"]:
        li("Due today", summary["due_today"])
    if summary["upcoming"]:
        upcoming = "".join(
            f"<span>&middot; {html.escape(title)}</span>"
            for title, _due in summary["upcoming"]
        )
        lines.append(f"<li><strong>Upcoming:</strong> {upcoming}</li>")

    bullets = "\n".join(lines)
    return f"""<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#0a0e17;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:24px auto;border-radius:12px;overflow:hidden;border:1px solid #2d3a52;">
    <div style="padding:20px 24px;background:#111827;border-bottom:1px solid #2d3a52;">
      <span style="font-size:18px;font-weight:bold;color:#00d4ff;">NEXUS</span>
    </div>
    <div style="padding:24px;background:#161e2e;color:#f1f5f9;">
      <h1 style="margin:0 0 12px;font-size:20px;color:#f1f5f9;">Your Daily Task Reminder</h1>
      <p>Hi {name}, here is your task summary:</p>
      <ul>{bullets}</ul>
      <p style="margin-top:20px;">
        <a href="{html.escape(frontend_url)}"
           style="display:inline-block;padding:10px 20px;border-radius:8px;background:#00d4ff;color:#0a0e17;text-decoration:none;font-weight:bold;">
          Open NEXUS
        </a>
      </p>
    </div>
    <div style="padding:12px 24px;background:#111827;color:#64748b;font-size:12px;">
      You are receiving this because daily email reminders are enabled in your settings.
    </div>
  </div>
</body>
</html>"""


def render_text(user_name, summary, frontend_url):
    name = user_name or "there"
    lines = [f"Hi {name},", "", "Your Daily Task Reminder", ""]
    if summary["pending"]:
        lines.append(f"- Pending tasks: {summary['pending']}")
    if summary["overdue"]:
        lines.append(f"- Overdue: {summary['overdue']}")
    if summary["due_today"]:
        lines.append(f"- Due today: {summary['due_today']}")
    for title, _due in summary["upcoming"]:
        lines.append(f"- Upcoming: {title}")
    lines.append("")
    lines.append(f"Open NEXUS: {frontend_url}")
    lines.append("")
    lines.append("You are receiving this because daily email reminders are enabled in your settings.")
    return "\n".join(lines)


def send_email_via_smtp(config, to_email, subject, html_body, text_body):
    """Send one email. Raises on delivery failure so callers never fake success."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = config["from_email"]
    msg["To"] = to_email
    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    if config["port"] == 465:
        smtp = smtplib.SMTP_SSL(config["host"], config["port"], timeout=20)
    else:
        smtp = smtplib.SMTP(config["host"], config["port"], timeout=20)
        smtp.starttls()
    try:
        if config["username"]:
            smtp.login(config["username"], config["password"])
        smtp.sendmail(config["from_email"], [to_email], msg.as_string())
    finally:
        smtp.quit()


def record_delivery(conn, user_id, reminder_date, status, summary=None, error_message=None):
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO reminder_deliveries (user_id, reminder_date, status, summary_json, error_message)
           VALUES (%s, %s, %s, %s, %s)
           ON DUPLICATE KEY UPDATE
             status = VALUES(status),
             summary_json = VALUES(summary_json),
             error_message = VALUES(error_message)""",
        (user_id, reminder_date, status, json.dumps(summary, default=str) if summary is not None else None, error_message),
    )
    conn.commit()
    cursor.close()


def get_reminder_history(conn, user_id, limit=30):
    """Return the latest reminder delivery rows for one user (newest first)."""
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        """SELECT id, reminder_date, status, summary_json, error_message, created_at
           FROM reminder_deliveries
           WHERE user_id = %s
           ORDER BY reminder_date DESC, id DESC
           LIMIT %s""",
        (user_id, limit),
    )
    rows = cursor.fetchall()
    cursor.close()
    for row in rows:
        raw = row.pop("summary_json", None)
        row["summary"] = None
        if raw:
            try:
                row["summary"] = json.loads(raw)
            except (ValueError, TypeError):
                row["summary"] = None
    return rows


def acquire_job_lock(conn, timeout=0):
    """Take the cross-process reminder lock.

    Returns True if acquired, False if another run holds it, or None if the
    server could not grant a lock at all (callers may then continue best-effort
    instead of silently blocking every reminder forever).

    GET_LOCK is per MySQL connection and released automatically when the
    connection closes, so a crashed worker never leaves the job stuck.
    timeout=0 means "do not wait": a concurrent run gets False and backs off.
    """
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT GET_LOCK(%s, %s)", (JOB_LOCK_NAME, timeout))
        row = cursor.fetchone()
    finally:
        cursor.close()
    if not row or row[0] is None:
        return None
    return row[0] == 1


def release_job_lock(conn):
    """Release the reminder lock. Never raises - the lock also frees on close."""
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT RELEASE_LOCK(%s)", (JOB_LOCK_NAME,))
        cursor.fetchone()
        cursor.close()
    except Exception:
        pass


def send_daily_reminders():
    """Run the full reminder pass. Returns a {ok: bool, ...} summary dict.

    Returns only aggregate counts - never recipient addresses - so the caller
    (the scheduled workflow) can log it safely.
    """
    config = get_smtp_config()
    if config is None:
        return {
            "ok": False,
            "error": (
                "SMTP is not configured. Set SMTP_HOST, SMTP_USERNAME, "
                "SMTP_PASSWORD, SMTP_FROM_EMAIL (and optionally SMTP_PORT) in Render."
            ),
            "processed": 0,
            "sent": 0,
            "skipped_already_sent": 0,
            "skipped_empty": 0,
            "failed": 0,
        }

    conn = database.get_connection()
    try:
        # Serialize overlapping runs: the second caller is told to back off
        # instead of racing the first and sending duplicate mail.
        lock_status = acquire_job_lock(conn)
        if lock_status is False:
            return {
                "ok": True,
                "locked": True,
                "message": "Another reminder pass is already running.",
                "processed": 0,
                "sent": 0,
                "skipped_already_sent": 0,
                "skipped_empty": 0,
                "failed": 0,
            }
        try:
            result = {
                "ok": True,
                "processed": 0,
                "sent": 0,
                "skipped_already_sent": 0,
                "skipped_empty": 0,
                "failed": 0,
            }

            users = collect_eligible_users(conn)
            frontend_url = get_frontend_url()
            now = user_local_now(DEFAULT_TIMEZONE)
            today = now.date()

            for user in users:
                user_id = user["id"]

                cursor = conn.cursor(dictionary=True)
                already_sent = _already_sent_today(cursor, user_id, today)
                cursor.close()
                if already_sent:
                    result["skipped_already_sent"] += 1
                    continue

                summary = build_summary(conn, user_id, today, now)
                if _is_empty_summary(summary):
                    result["skipped_empty"] += 1
                    continue

                to_email = (user["reminder_email"] or user["account_email"] or "").strip()
                if not to_email:
                    result["skipped_empty"] += 1
                    continue

                result["processed"] += 1
                html_body = render_html(user["name"], summary, frontend_url)
                text_body = render_text(user["name"], summary, frontend_url)

                try:
                    send_email_via_smtp(config, to_email, SUBJECT, html_body, text_body)
                except Exception as exc:
                    counts = {k: v for k, v in summary.items() if not isinstance(v, list)}
                    # Store only the exception type, never SMTP host/response
                    # details that could disclose infrastructure.
                    record_delivery(conn, user_id, today, "failed", counts, type(exc).__name__)
                    result["failed"] += 1
                    continue

                counts = {k: v for k, v in summary.items() if not isinstance(v, list)}
                record_delivery(conn, user_id, today, "sent", counts)
                result["sent"] += 1

            return result
        finally:
            release_job_lock(conn)
    finally:
        conn.close()