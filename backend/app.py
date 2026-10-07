from flask import Flask, request, jsonify
from flask.json.provider import DefaultJSONProvider
from flask_cors import CORS
from database import get_connection
import json
import os
import re
from datetime import datetime, date, timedelta
from decimal import Decimal

app = Flask(__name__)
CORS(app)


class NexusJSONProvider(DefaultJSONProvider):
    """Serialize MySQL values in a predictable, frontend-friendly way.

    * datetime / date  -> ISO 8601 (the React app splits ISO strings for
      <input type="date"> and slices them for chart labels)
    * Decimal (SUM)    -> real JSON numbers, never the string "3"
    """

    @staticmethod
    def default(o):
        if isinstance(o, datetime):
            return o.isoformat(timespec="seconds")
        if isinstance(o, date):
            return o.isoformat()
        if isinstance(o, Decimal):
            return int(o) if o == o.to_integral_value() else float(o)
        if isinstance(o, timedelta):
            return o.total_seconds()
        return DefaultJSONProvider.default(o)

    sort_keys = False


app.json = NexusJSONProvider(app)

VALID_STATUSES = ["Backlog", "Pending", "In Progress", "Completed", "Archived"]
VALID_PRIORITIES = ["Critical", "High", "Medium", "Low"]
VALID_COLOR = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")

# Analytics time ranges are a hard whitelist - never interpolate raw input.
ANALYTICS_RANGES = {"7d": 7, "30d": 30, "90d": 90, "1y": 365}
DEFAULT_RANGE = "30d"


def resolve_range(value=None):
    """Whitelist lookup for the analytics `range` query parameter."""
    key = str(value or DEFAULT_RANGE).strip().lower()
    return key if key in ANALYTICS_RANGES else DEFAULT_RANGE


def normalize_color(value, fallback="#00d4ff"):
    color = (value or "").strip()
    return color if VALID_COLOR.match(color) else fallback


def normalize_project_id(value):
    """Accept '', None, 0, '3' -> None / 3 (int). Raises ValueError when invalid."""
    if value is None or value == "" or value == 0 or value == "0":
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        raise ValueError("Invalid project ID")
    if parsed <= 0:
        raise ValueError("Invalid project ID")
    return parsed


def validate_task_data(data, is_update=False):
    """Validate task data"""
    errors = {}
    
    if "title" in data:
        title = data["title"].strip() if data["title"] else ""
        if not title:
            errors["title"] = "Task title is required"
        elif len(title) > 255:
            errors["title"] = "Title must be 255 characters or less"
    
    if not is_update and "title" not in data:
        errors["title"] = "Task title is required"
    
    if "status" in data and data["status"] not in VALID_STATUSES:
        errors["status"] = f"Status must be one of: {', '.join(VALID_STATUSES)}"
    
    if "priority" in data and data["priority"] not in VALID_PRIORITIES:
        errors["priority"] = f"Priority must be one of: {', '.join(VALID_PRIORITIES)}"
    
    if "due_date" in data and data["due_date"]:
        try:
            datetime.fromisoformat(data["due_date"].replace("Z", "+00:00"))
        except ValueError:
            errors["due_date"] = "Invalid date format. Use ISO 8601 format."
    
    if "estimated_minutes" in data and data["estimated_minutes"] is not None:
        try:
            val = int(data["estimated_minutes"])
            if val < 0:
                errors["estimated_minutes"] = "Estimated minutes must be positive"
        except (ValueError, TypeError):
            errors["estimated_minutes"] = "Estimated minutes must be a number"
    
    if "project_id" in data:
        try:
            normalize_project_id(data["project_id"])
        except ValueError as exc:
            errors["project_id"] = str(exc)

    return errors if errors else None


def project_exists(cursor, project_id):
    if not project_id:
        return True
    cursor.execute("SELECT id FROM projects WHERE id = %s", (project_id,))
    return cursor.fetchone() is not None


def task_exists(cursor, task_id):
    if not task_id:
        return True
    cursor.execute("SELECT id FROM tasks WHERE id = %s", (task_id,))
    return cursor.fetchone() is not None


def attach_task_relations(cursor, tasks):
    """Attach project / subtask progress / tags to a list of task rows.

    Uses 3 batched queries instead of a per-task N+1 lookup.
    """
    if not tasks:
        return tasks

    for task in tasks:
        if task.get("project_id"):
            task["project"] = {
                "id": task["project_id"],
                "name": task.pop("project_name", None),
                "color": task.pop("project_color", None),
            }
        else:
            task.pop("project_name", None)
            task.pop("project_color", None)
            task["project"] = None
        task["subtask_count"] = 0
        task["subtask_completed"] = 0

    ids = [t["id"] for t in tasks]
    placeholders = ",".join(["%s"] * len(ids))

    cursor.execute(
        f"""SELECT task_id,
                   COUNT(*) AS total,
                   COALESCE(SUM(completed), 0) AS completed
            FROM subtasks WHERE task_id IN ({placeholders})
            GROUP BY task_id""",
        ids,
    )
    subtask_rows = {row["task_id"]: row for row in cursor.fetchall()}

    cursor.execute(
        f"""SELECT tt.task_id, g.id, g.name, g.color
            FROM task_tags tt JOIN tags g ON g.id = tt.tag_id
            WHERE tt.task_id IN ({placeholders})""",
        ids,
    )
    tag_rows = {}
    for row in cursor.fetchall():
        tag_rows.setdefault(row["task_id"], []).append(
            {"id": row["id"], "name": row["name"], "color": row["color"]}
        )

    for task in tasks:
        subtask = subtask_rows.get(task["id"])
        if subtask:
            task["subtask_count"] = int(subtask["total"])
            task["subtask_completed"] = int(subtask["completed"])
        task["tags"] = tag_rows.get(task["id"], [])
    return tasks

def get_task_with_relations(cursor, task_id):
    """Get task with subtasks, tags, and project"""
    cursor.execute("SELECT * FROM tasks WHERE id = %s", (task_id,))
    task = cursor.fetchone()
    if not task:
        return None
    
    # Get subtasks
    cursor.execute("SELECT * FROM subtasks WHERE task_id = %s ORDER BY created_at", (task_id,))
    task["subtasks"] = cursor.fetchall()
    task["subtask_count"] = len(task["subtasks"])
    task["subtask_completed"] = sum(1 for s in task["subtasks"] if s["completed"])
    
    # Get tags
    cursor.execute("""
        SELECT t.* FROM tags t
        JOIN task_tags tt ON t.id = tt.tag_id
        WHERE tt.task_id = %s
    """, (task_id,))
    task["tags"] = cursor.fetchall()
    
    # Get project
    if task.get("project_id"):
        cursor.execute("SELECT * FROM projects WHERE id = %s", (task["project_id"],))
        task["project"] = cursor.fetchone()
    
    return task

@app.route("/api/health", methods=["GET"])
def health_check():
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
        cursor.close()
        conn.close()
        return jsonify({"status": "ok", "database": "connected"}), 200
    except Exception as e:
        return jsonify({"status": "error", "database": "disconnected"}), 500

@app.route("/api/tasks", methods=["GET"])
def get_tasks():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT t.*, p.name AS project_name, p.color AS project_color
        FROM tasks t
        LEFT JOIN projects p ON p.id = t.project_id
        ORDER BY t.created_at DESC, t.id DESC
    """)
    tasks = attach_task_relations(cursor, cursor.fetchall())
    cursor.close()
    conn.close()
    return jsonify(tasks), 200

@app.route("/api/tasks/<int:task_id>", methods=["GET"])
def get_task(task_id):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    task = get_task_with_relations(cursor, task_id)
    cursor.close()
    conn.close()
    if task is None:
        return jsonify({"error": "Task not found"}), 404
    return jsonify(task), 200

@app.route("/api/tasks", methods=["POST"])
def create_task():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request data"}), 400
    
    errors = validate_task_data(data)
    if errors:
        return jsonify({"error": "Validation failed", "details": errors}), 400
    
    title = data["title"].strip()
    description = data.get("description", "").strip() or ""
    status = data.get("status", "Pending")
    priority = data.get("priority", "Medium")
    due_date = data.get("due_date") or None
    project_id = normalize_project_id(data.get("project_id"))
    estimated_minutes = data.get("estimated_minutes")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    if not project_exists(cursor, project_id):
        cursor.close()
        conn.close()
        return jsonify({"error": "Project not found"}), 404

    cursor.execute(
        """INSERT INTO tasks (title, description, status, priority, due_date, project_id, estimated_minutes, completed_at)
           VALUES (%s, %s, %s, %s, %s, %s, %s, IF(%s = 'Completed', NOW(), NULL))""",
        (title, description, status, priority, due_date, project_id, estimated_minutes, status),
    )
    conn.commit()
    task_id = cursor.lastrowid
    task = get_task_with_relations(cursor, task_id)
    cursor.close()
    conn.close()
    log_activity(task_id, project_id, "created", f'Task "{title}" created', {"status": status})
    return jsonify(task), 201

@app.route("/api/tasks/<int:task_id>", methods=["PUT"])
def update_task(task_id):
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request data"}), 400
    
    errors = validate_task_data(data, is_update=True)
    if errors:
        return jsonify({"error": "Validation failed", "details": errors}), 400
    
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM tasks WHERE id = %s", (task_id,))
    if cursor.fetchone() is None:
        cursor.close()
        conn.close()
        return jsonify({"error": "Task not found"}), 404
    
    # Build dynamic update query
    fields = []
    values = []

    if "title" in data:
        fields.append("title = %s")
        values.append(data["title"].strip())
    if "description" in data:
        fields.append("description = %s")
        values.append(data["description"].strip() or "")
    if "status" in data:
        fields.append("status = %s")
        values.append(data["status"])
    if "priority" in data:
        fields.append("priority = %s")
        values.append(data["priority"])
    if "due_date" in data:
        fields.append("due_date = %s")
        values.append(data["due_date"] or None)
    if "project_id" in data:
        project_id = normalize_project_id(data["project_id"])
        if not project_exists(cursor, project_id):
            cursor.close()
            conn.close()
            return jsonify({"error": "Project not found"}), 404
        fields.append("project_id = %s")
        values.append(project_id)
    if "estimated_minutes" in data:
        fields.append("estimated_minutes = %s")
        values.append(data["estimated_minutes"])

    # Keep completed_at in sync with the status column (both directions).
    # NOW() comes from MySQL so analytics day/week bucketing stays consistent.
    if "status" in data:
        fields.append("completed_at = IF(%s = 'Completed', NOW(), NULL)")
        values.append(data["status"])

    if fields:
        values.append(task_id)
        cursor.execute(f"UPDATE tasks SET {', '.join(fields)} WHERE id = %s", values)
        conn.commit()
    
    task = get_task_with_relations(cursor, task_id)
    cursor.close()
    conn.close()
    action = "completed" if data.get("status") == "Completed" else "updated"
    log_activity(task_id, task.get("project_id"), action,
                 f'Task "{task["title"]}" {action}', {"fields": sorted(data.keys())})
    return jsonify(task), 200

@app.route("/api/tasks/<int:task_id>", methods=["DELETE"])
def delete_task(task_id):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id, title, project_id FROM tasks WHERE id = %s", (task_id,))
    task = cursor.fetchone()
    if task is None:
        cursor.close()
        conn.close()
        return jsonify({"error": "Task not found"}), 404
    cursor.execute("DELETE FROM tasks WHERE id = %s", (task_id,))
    conn.commit()
    cursor.close()
    conn.close()
    # The row is gone, so the log keeps project_id only (task_id FK is ON DELETE SET NULL).
    log_activity(None, task["project_id"], "deleted", f'Task "{task["title"]}" deleted')
    return jsonify({"message": "Task deleted successfully"}), 200

# ==================== PROJECTS ====================

PROJECT_SELECT = """
    SELECT p.*,
           CAST(COALESCE(SUM(CASE WHEN t.id IS NULL THEN 0 ELSE 1 END), 0) AS SIGNED) AS task_count,
           CAST(COALESCE(SUM(CASE WHEN t.status = 'Completed' THEN 1 ELSE 0 END), 0) AS SIGNED) AS completed_count,
           CAST(COALESCE(SUM(CASE WHEN t.status IN ('Pending', 'In Progress') THEN 1 ELSE 0 END), 0) AS SIGNED) AS active_count,
           CAST(COALESCE(SUM(CASE WHEN t.due_date IS NOT NULL AND t.due_date < NOW()
                                       AND t.status NOT IN ('Completed', 'Archived') THEN 1 ELSE 0 END), 0) AS SIGNED) AS overdue_count
    FROM projects p
    LEFT JOIN tasks t ON t.project_id = p.id
    {where}
    GROUP BY p.id, p.name, p.description, p.color, p.created_at, p.updated_at
    ORDER BY p.created_at DESC, p.id DESC
"""


def decorate_project(project):
    """Derive the UI counters every project response shares."""
    task_count = int(project.get("task_count") or 0)
    completed_count = int(project.get("completed_count") or 0)
    project["task_count"] = task_count
    project["completed_count"] = completed_count
    project["active_count"] = int(project.get("active_count") or 0)
    project["overdue_count"] = int(project.get("overdue_count") or 0)
    project["remaining_count"] = max(task_count - completed_count, 0)
    project["progress"] = round((completed_count / task_count * 100), 1) if task_count else 0
    project["is_empty"] = task_count == 0
    project["is_completed"] = task_count > 0 and completed_count == task_count
    project["is_active"] = task_count > 0 and completed_count < task_count
    return project


@app.route("/api/projects", methods=["GET"])
def get_projects():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(PROJECT_SELECT.format(where=""))
    projects = [decorate_project(p) for p in cursor.fetchall()]
    cursor.close()
    conn.close()
    return jsonify(projects), 200


@app.route("/api/projects/<int:project_id>", methods=["GET"])
def get_project(project_id):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(PROJECT_SELECT.format(where="WHERE p.id = %s"), (project_id,))
    project = cursor.fetchone()
    if project is None:
        cursor.close()
        conn.close()
        return jsonify({"error": "Project not found"}), 404
    decorate_project(project)
    cursor.close()
    conn.close()
    return jsonify(project), 200


def validate_project_data(data, is_update=False):
    errors = {}
    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            errors["name"] = "Project name is required"
        elif len(name) > 255:
            errors["name"] = "Project name must be 255 characters or less"
    elif not is_update:
        errors["name"] = "Project name is required"

    if "description" in data and data["description"] is not None:
        if len(data["description"].strip()) > 2000:
            errors["description"] = "Description must be 2000 characters or less"

    if "color" in data and data["color"] not in (None, "") and not VALID_COLOR.match(str(data["color"]).strip()):
        errors["color"] = "Color must be a hex value such as #00d4ff"

    return errors or None


def load_project(conn, project_id, cursor=None):
    own_cursor = cursor is None
    if own_cursor:
        cursor = conn.cursor(dictionary=True)
    cursor.execute(PROJECT_SELECT.format(where="WHERE p.id = %s"), (project_id,))
    project = cursor.fetchone()
    if own_cursor:
        cursor.close()
    return decorate_project(project) if project else None


@app.route("/api/projects", methods=["POST"])
def create_project():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request data"}), 400

    errors = validate_project_data(data)
    if errors:
        return jsonify({"error": "Validation failed", "details": errors}), 400

    name = data["name"].strip()
    description = (data.get("description") or "").strip()
    color = normalize_color(data.get("color"), "#00d4ff")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        "INSERT INTO projects (name, description, color) VALUES (%s, %s, %s)",
        (name, description, color),
    )
    conn.commit()
    project_id = cursor.lastrowid
    project = load_project(conn, project_id, cursor)
    cursor.close()
    conn.close()
    log_activity(None, project_id, "created", f'Project "{name}" created')
    return jsonify(project), 201


@app.route("/api/projects/<int:project_id>", methods=["PUT"])
def update_project(project_id):
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request data"}), 400

    errors = validate_project_data(data, is_update=True)
    if errors:
        return jsonify({"error": "Validation failed", "details": errors}), 400

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id FROM projects WHERE id = %s", (project_id,))
    if cursor.fetchone() is None:
        cursor.close()
        conn.close()
        return jsonify({"error": "Project not found"}), 404

    fields = []
    values = []

    if "name" in data:
        fields.append("name = %s")
        values.append(data["name"].strip())
    if "description" in data:
        fields.append("description = %s")
        values.append((data.get("description") or "").strip())
    if "color" in data:
        fields.append("color = %s")
        values.append(normalize_color(data.get("color")))

    if fields:
        values.append(project_id)
        cursor.execute(f"UPDATE projects SET {', '.join(fields)} WHERE id = %s", values)
        conn.commit()

    project = load_project(conn, project_id, cursor)
    cursor.close()
    conn.close()
    log_activity(None, project_id, "updated", f'Project "{project["name"]}" updated',
                 {"fields": sorted(data.keys())})
    return jsonify(project), 200


@app.route("/api/projects/<int:project_id>", methods=["DELETE"])
def delete_project(project_id):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id, name FROM projects WHERE id = %s", (project_id,))
    project = cursor.fetchone()
    if project is None:
        cursor.close()
        conn.close()
        return jsonify({"error": "Project not found"}), 404

    # Keep the data safe: tasks and notes survive, they just become unassigned.
    cursor.execute("UPDATE tasks SET project_id = NULL WHERE project_id = %s", (project_id,))
    cursor.execute("UPDATE notes SET project_id = NULL WHERE project_id = %s", (project_id,))
    cursor.execute("DELETE FROM projects WHERE id = %s", (project_id,))
    conn.commit()
    cursor.close()
    conn.close()
    log_activity(None, None, "deleted", f'Project "{project["name"]}" deleted')
    return jsonify({"message": "Project deleted successfully", "unassigned_tasks": True}), 200

# ==================== SUBTASKS ====================

@app.route("/api/tasks/<int:task_id>/subtasks", methods=["GET"])
def get_subtasks(task_id):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM subtasks WHERE task_id = %s ORDER BY created_at", (task_id,))
    subtasks = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(subtasks), 200

@app.route("/api/tasks/<int:task_id>/subtasks", methods=["POST"])
def create_subtask(task_id):
    data = request.get_json()
    if not data or not data.get("title"):
        return jsonify({"error": "Subtask title is required"}), 400
    
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM tasks WHERE id = %s", (task_id,))
    if cursor.fetchone() is None:
        cursor.close()
        conn.close()
        return jsonify({"error": "Task not found"}), 404
    
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        "INSERT INTO subtasks (task_id, title) VALUES (%s, %s)",
        (task_id, data["title"].strip())
    )
    conn.commit()
    subtask_id = cursor.lastrowid
    cursor.execute("SELECT * FROM subtasks WHERE id = %s", (subtask_id,))
    subtask = cursor.fetchone()
    cursor.close()
    conn.close()
    return jsonify(subtask), 201

@app.route("/api/subtasks/<int:subtask_id>", methods=["PUT"])
def update_subtask(subtask_id):
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request data"}), 400
    
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM subtasks WHERE id = %s", (subtask_id,))
    if cursor.fetchone() is None:
        cursor.close()
        conn.close()
        return jsonify({"error": "Subtask not found"}), 404
    
    fields = []
    values = []
    
    if "title" in data:
        fields.append("title = %s")
        values.append(data["title"].strip())
    if "completed" in data:
        fields.append("completed = %s")
        values.append(data["completed"])
    
    if fields:
        values.append(subtask_id)
        cursor.execute(f"UPDATE subtasks SET {', '.join(fields)} WHERE id = %s", values)
        conn.commit()
    
    cursor.execute("SELECT * FROM subtasks WHERE id = %s", (subtask_id,))
    subtask = cursor.fetchone()
    cursor.close()
    conn.close()
    return jsonify(subtask), 200

@app.route("/api/subtasks/<int:subtask_id>", methods=["DELETE"])
def delete_subtask(subtask_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM subtasks WHERE id = %s", (subtask_id,))
    if cursor.fetchone() is None:
        cursor.close()
        conn.close()
        return jsonify({"error": "Subtask not found"}), 404
    
    cursor.execute("DELETE FROM subtasks WHERE id = %s", (subtask_id,))
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"message": "Subtask deleted successfully"}), 200

# ==================== TAGS ====================

@app.route("/api/tags", methods=["GET"])
def get_tags():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM tags ORDER BY name")
    tags = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(tags), 200

@app.route("/api/tags", methods=["POST"])
def create_tag():
    data = request.get_json()
    if not data or not data.get("name"):
        return jsonify({"error": "Tag name is required"}), 400
    
    name = data["name"].strip().lower()
    if not name:
        return jsonify({"error": "Tag name cannot be empty"}), 400
    if len(name) > 50:
        return jsonify({"error": "Tag name must be 50 characters or less"}), 400
    
    color = data.get("color", "#64748b")
    
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "INSERT INTO tags (name, color) VALUES (%s, %s)",
            (name, color)
        )
        conn.commit()
        tag_id = cursor.lastrowid
        cursor.execute("SELECT * FROM tags WHERE id = %s", (tag_id,))
        tag = cursor.fetchone()
        cursor.close()
        conn.close()
        return jsonify(tag), 201
    except Exception as e:
        if "Duplicate entry" in str(e):
            return jsonify({"error": "Tag already exists"}), 409
        raise

@app.route("/api/tasks/<int:task_id>/tags", methods=["POST"])
def add_tag_to_task(task_id):
    data = request.get_json()
    if not data or not data.get("tag_id"):
        return jsonify({"error": "tag_id is required"}), 400
    
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM tasks WHERE id = %s", (task_id,))
    if cursor.fetchone() is None:
        cursor.close()
        conn.close()
        return jsonify({"error": "Task not found"}), 404
    
    cursor.execute("SELECT * FROM tags WHERE id = %s", (data["tag_id"],))
    if cursor.fetchone() is None:
        cursor.close()
        conn.close()
        return jsonify({"error": "Tag not found"}), 404
    
    try:
        cursor.execute(
            "INSERT INTO task_tags (task_id, tag_id) VALUES (%s, %s)",
            (task_id, data["tag_id"])
        )
        conn.commit()
    except Exception as e:
        if "Duplicate entry" in str(e):
            return jsonify({"error": "Tag already assigned to task"}), 409
        raise
    
    cursor.close()
    conn.close()
    return jsonify({"message": "Tag added to task"}), 201

@app.route("/api/tasks/<int:task_id>/tags/<int:tag_id>", methods=["DELETE"])
def remove_tag_from_task(task_id, tag_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM task_tags WHERE task_id = %s AND tag_id = %s", (task_id, tag_id))
    conn.commit()
    affected = cursor.rowcount
    cursor.close()
    conn.close()
    if affected == 0:
        return jsonify({"error": "Tag not found on task"}), 404
    return jsonify({"message": "Tag removed from task"}), 200

# ==================== FOCUS SESSIONS ====================

FOCUS_SESSION_SELECT = """
    SELECT fs.*, t.title AS task_title, t.status AS task_status
    FROM focus_sessions fs
    LEFT JOIN tasks t ON t.id = fs.task_id
    {where}
    ORDER BY fs.started_at DESC, fs.id DESC
"""


@app.route("/api/focus/sessions", methods=["GET"])
def get_focus_sessions():
    limit = min(max(request.args.get("limit", 100, type=int) or 100, 1), 500)
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        FOCUS_SESSION_SELECT.format(where="") + " LIMIT %s",
        (limit,),
    )
    sessions = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(sessions), 200


@app.route("/api/focus/sessions", methods=["POST"])
def create_focus_session():
    data = request.get_json()
    if not data or not data.get("duration_minutes"):
        return jsonify({"error": "Duration is required"}), 400

    try:
        duration = int(data["duration_minutes"])
    except (TypeError, ValueError):
        return jsonify({"error": "Duration must be a number"}), 400
    if duration <= 0:
        return jsonify({"error": "Duration must be greater than 0"}), 400

    task_id = data.get("task_id") or None
    completed = bool(data.get("completed", False))

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    if not task_exists(cursor, task_id):
        cursor.close()
        conn.close()
        return jsonify({"error": "Task not found"}), 404

    # NOW() is evaluated by MySQL so timestamps stay aligned with the
    # CURDATE() based day/week bucketing used by /api/focus/stats.
    cursor.execute(
        """INSERT INTO focus_sessions (task_id, duration_minutes, started_at, ended_at, completed)
           VALUES (%s, %s, NOW(), IF(%s, NOW(), NULL), %s)""",
        (task_id, duration, completed, completed),
    )
    conn.commit()
    session_id = cursor.lastrowid
    cursor.execute(
        FOCUS_SESSION_SELECT.format(where="WHERE fs.id = %s"),
        (session_id,),
    )
    session = cursor.fetchone()
    cursor.close()
    conn.close()
    return jsonify(session), 201


@app.route("/api/focus/sessions/<int:session_id>", methods=["PUT"])
def update_focus_session(session_id):
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request data"}), 400

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id FROM focus_sessions WHERE id = %s", (session_id,))
    if cursor.fetchone() is None:
        cursor.close()
        conn.close()
        return jsonify({"error": "Focus session not found"}), 404

    fields = []
    values = []

    if "completed" in data:
        completed = bool(data["completed"])
        fields.append("completed = %s")
        values.append(completed)
        fields.append("ended_at = IF(%s, NOW(), NULL)")
        values.append(completed)

    if "duration_minutes" in data:
        try:
            fields.append("duration_minutes = %s")
            values.append(max(int(data["duration_minutes"]), 0))
        except (TypeError, ValueError):
            cursor.close()
            conn.close()
            return jsonify({"error": "Duration must be a number"}), 400

    if fields:
        values.append(session_id)
        cursor.execute(f"UPDATE focus_sessions SET {', '.join(fields)} WHERE id = %s", values)
        conn.commit()

    cursor.execute(
        FOCUS_SESSION_SELECT.format(where="WHERE fs.id = %s"),
        (session_id,),
    )
    session = cursor.fetchone()
    cursor.close()
    conn.close()
    return jsonify(session), 200

@app.route("/api/focus/sessions/<int:session_id>", methods=["DELETE"])
def delete_focus_session(session_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM focus_sessions WHERE id = %s", (session_id,))
    if cursor.fetchone() is None:
        cursor.close()
        conn.close()
        return jsonify({"error": "Focus session not found"}), 404
    
    cursor.execute("DELETE FROM focus_sessions WHERE id = %s", (session_id,))
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"message": "Focus session deleted successfully"}), 200

@app.route("/api/focus/stats", methods=["GET"])
def get_focus_stats():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("""
        SELECT
            CAST(COALESCE(SUM(completed = TRUE), 0) AS SIGNED) AS session_count,
            CAST(COALESCE(SUM(CASE WHEN completed = TRUE THEN duration_minutes ELSE 0 END), 0) AS SIGNED) AS total_minutes,
            CAST(COALESCE(SUM(CASE WHEN completed = TRUE AND DATE(started_at) = CURDATE() THEN duration_minutes ELSE 0 END), 0) AS SIGNED) AS today_minutes,
            CAST(COALESCE(SUM(CASE WHEN completed = TRUE AND YEARWEEK(started_at, 1) = YEARWEEK(CURDATE(), 1) THEN duration_minutes ELSE 0 END), 0) AS SIGNED) AS week_minutes
        FROM focus_sessions
    """)
    totals = cursor.fetchone()

    # Sessions by task
    cursor.execute("""
        SELECT t.title, CAST(COALESCE(SUM(fs.duration_minutes), 0) AS SIGNED) as minutes
        FROM focus_sessions fs
        LEFT JOIN tasks t ON fs.task_id = t.id
        WHERE fs.completed = TRUE
        GROUP BY fs.task_id, t.title
        ORDER BY minutes DESC
        LIMIT 10
    """)
    by_task = cursor.fetchall()

    cursor.close()
    conn.close()

    return jsonify({
        "total_minutes": int(totals["total_minutes"] or 0),
        "today_minutes": int(totals["today_minutes"] or 0),
        "week_minutes": int(totals["week_minutes"] or 0),
        "session_count": int(totals["session_count"] or 0),
        "by_task": by_task,
    }), 200


# ==================== ANALYTICS ====================

# Granularity keeps the chart readable: 30 daily points < 14 weekly < 12 monthly.
def range_granularity(days):
    if days <= 30:
        return "day"
    if days <= 90:
        return "week"
    return "month"


def week_start(day):
    return day - timedelta(days=day.weekday())


def month_start(day):
    return day.replace(day=1)


def short_day_label(day):
    """Portable 'Oct 2' label - strftime('%-d') does not exist on Windows."""
    return f"{day.strftime('%b')} {day.day}"


def build_buckets(start, end, granularity):
    """Dense list of {date, label} so charts never show gaps for empty days."""
    buckets = []
    cursor = start
    while cursor <= end:
        if granularity == "day":
            buckets.append({"date": cursor.isoformat(), "label": short_day_label(cursor)})
            cursor += timedelta(days=1)
        elif granularity == "week":
            buckets.append({"date": cursor.isoformat(), "label": short_day_label(cursor)})
            cursor += timedelta(days=7)
        else:
            buckets.append({"date": cursor.isoformat(), "label": cursor.strftime("%b %Y")})
            cursor = month_start(cursor + timedelta(days=32))
    return buckets


def bucket_key(day, granularity):
    if granularity == "day":
        return day.isoformat()
    if granularity == "week":
        return week_start(day).isoformat()
    return month_start(day).isoformat()


@app.route("/api/analytics/overview", methods=["GET"])
def get_analytics_overview():
    range_key = resolve_range(request.args.get("range"))
    days = ANALYTICS_RANGES[range_key]

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("""
        SELECT
            CAST(COUNT(*) AS SIGNED) AS total,
            CAST(COALESCE(SUM(status = 'Completed'), 0) AS SIGNED) AS completed,
            CAST(COALESCE(SUM(status = 'In Progress'), 0) AS SIGNED) AS in_progress,
            CAST(COALESCE(SUM(status = 'Pending'), 0) AS SIGNED) AS pending,
            CAST(COALESCE(SUM(status = 'Backlog'), 0) AS SIGNED) AS backlog,
            CAST(COALESCE(SUM(status = 'Archived'), 0) AS SIGNED) AS archived
        FROM tasks
    """)
    totals = cursor.fetchone()

    total = int(totals["total"] or 0)
    completed = int(totals["completed"] or 0)
    completion_rate = round(completed / total * 100, 1) if total else 0.0

    cursor.execute("""
        SELECT status, CAST(COUNT(*) AS SIGNED) as count
        FROM tasks GROUP BY status ORDER BY FIELD(status, 'Backlog','Pending','In Progress','Completed','Archived')
    """)
    by_status = cursor.fetchall()

    cursor.execute("""
        SELECT priority, CAST(COUNT(*) AS SIGNED) as count
        FROM tasks GROUP BY priority ORDER BY FIELD(priority, 'Critical','High','Medium','Low')
    """)
    by_priority = cursor.fetchall()

    cursor.execute("""
        SELECT CAST(COUNT(*) AS SIGNED) as count FROM tasks
        WHERE due_date IS NOT NULL AND due_date < NOW() AND status NOT IN ('Completed', 'Archived')
    """)
    overdue = cursor.fetchone()

    cursor.execute("""
        SELECT CAST(COUNT(*) AS SIGNED) as count FROM tasks
        WHERE YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1)
    """)
    created_this_week = cursor.fetchone()

    cursor.execute("""
        SELECT CAST(COUNT(*) AS SIGNED) as count FROM tasks
        WHERE status = 'Completed' AND completed_at IS NOT NULL
          AND YEARWEEK(completed_at, 1) = YEARWEEK(CURDATE(), 1)
    """)
    completed_this_week = cursor.fetchone()

    # Range-scoped counters (days always comes from the ANALYTICS_RANGES whitelist)
    cursor.execute("""
        SELECT
            CAST(COUNT(*) AS SIGNED) AS created,
            CAST(COALESCE(SUM(status = 'Completed'), 0) AS SIGNED) AS completed
        FROM tasks
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL %s DAY)
    """, (days,))
    created_in_range = cursor.fetchone()

    cursor.execute("""
        SELECT CAST(COUNT(*) AS SIGNED) AS completed
        FROM tasks
        WHERE status = 'Completed' AND completed_at IS NOT NULL
          AND completed_at >= DATE_SUB(CURDATE(), INTERVAL %s DAY)
    """, (days,))
    completed_in_range = cursor.fetchone()

    cursor.close()
    conn.close()

    created_range = int(created_in_range["created"] or 0)
    completed_range = int(completed_in_range["completed"] or 0)

    return jsonify({
        "range": range_key,
        "range_days": days,
        "completion_rate": completion_rate,
        "total_tasks": total,
        "completed_tasks": completed,
        "in_progress_tasks": int(totals["in_progress"] or 0),
        "pending_tasks": int(totals["pending"] or 0),
        "backlog_tasks": int(totals["backlog"] or 0),
        "archived_tasks": int(totals["archived"] or 0),
        "by_status": by_status,
        "by_priority": by_priority,
        "overdue_count": int(overdue["count"] or 0),
        "created_this_week": int(created_this_week["count"] or 0),
        "completed_this_week": int(completed_this_week["count"] or 0),
        "in_range": {
            "created": created_range,
            "completed": completed_range,
            "completion_rate": round(completed_range / created_range * 100, 1) if created_range else 0.0,
            "open": max(created_range - completed_range, 0),
        },
    }), 200


@app.route("/api/analytics/productivity", methods=["GET"])
def get_productivity_trends():
    range_key = resolve_range(request.args.get("range"))
    days = ANALYTICS_RANGES[range_key]
    granularity = range_granularity(days)

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("""
        SELECT DATE(created_at) AS day, CAST(COUNT(*) AS SIGNED) AS count
        FROM tasks
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL %s DAY)
        GROUP BY DATE(created_at)
    """, (days,))
    creation_rows = cursor.fetchall()

    cursor.execute("""
        SELECT DATE(completed_at) AS day, CAST(COUNT(*) AS SIGNED) AS count
        FROM tasks
        WHERE status = 'Completed' AND completed_at IS NOT NULL
          AND completed_at >= DATE_SUB(CURDATE(), INTERVAL %s DAY)
        GROUP BY DATE(completed_at)
    """, (days,))
    completion_rows = cursor.fetchall()

    cursor.execute("SELECT CURDATE() AS today")
    today = cursor.fetchone()["today"]
    cursor.close()
    conn.close()

    start = today - timedelta(days=days - 1)
    created_map = {bucket_key(row["day"], granularity): int(row["count"]) for row in creation_rows}
    completed_map = {bucket_key(row["day"], granularity): int(row["count"]) for row in completion_rows}

    buckets = []
    for bucket in build_buckets(start, today, granularity):
        key = bucket["date"]
        buckets.append({
            "date": key,
            "label": bucket["label"],
            "created": created_map.get(key, 0),
            "completed": completed_map.get(key, 0),
        })

    total_created = sum(b["created"] for b in buckets)
    total_completed = sum(b["completed"] for b in buckets)

    return jsonify({
        "range": range_key,
        "range_days": days,
        "granularity": granularity,
        "buckets": buckets,
        "total_created": total_created,
        "total_completed": total_completed,
        # legacy shape kept so existing consumers keep working
        "daily_creation": [
            {"date": row["day"].isoformat(), "count": int(row["count"])} for row in creation_rows
        ],
        "daily_completion": [
            {"date": row["day"].isoformat(), "count": int(row["count"])} for row in completion_rows
        ],
        "weekly_completion": [],
    }), 200

@app.route("/api/analytics/projects", methods=["GET"])
def get_project_analytics():
    range_key = resolve_range(request.args.get("range"))
    days = ANALYTICS_RANGES[range_key]

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("""
        SELECT
            p.id,
            p.name,
            p.color,
            CAST(COUNT(t.id) AS SIGNED) AS total_tasks,
            CAST(COALESCE(SUM(CASE WHEN t.status = 'Completed' THEN 1 ELSE 0 END), 0) AS SIGNED) AS completed_tasks,
            CAST(COALESCE(SUM(CASE WHEN t.status = 'In Progress' THEN 1 ELSE 0 END), 0) AS SIGNED) AS in_progress_tasks,
            CAST(COALESCE(SUM(CASE WHEN t.status = 'Pending' THEN 1 ELSE 0 END), 0) AS SIGNED) AS pending_tasks,
            CAST(COALESCE(SUM(CASE WHEN t.status = 'Backlog' THEN 1 ELSE 0 END), 0) AS SIGNED) AS backlog_tasks,
            CAST(COALESCE(SUM(CASE WHEN t.due_date IS NOT NULL AND t.due_date < NOW()
                                        AND t.status NOT IN ('Completed', 'Archived') THEN 1 ELSE 0 END), 0) AS SIGNED) AS overdue_tasks,
            CAST(COALESCE(SUM(CASE WHEN t.created_at >= DATE_SUB(CURDATE(), INTERVAL %s DAY) THEN 1 ELSE 0 END), 0) AS SIGNED) AS period_created,
            CAST(COALESCE(SUM(CASE WHEN t.status = 'Completed' AND t.completed_at IS NOT NULL
                                        AND t.completed_at >= DATE_SUB(CURDATE(), INTERVAL %s DAY) THEN 1 ELSE 0 END), 0) AS SIGNED) AS period_completed
        FROM projects p
        LEFT JOIN tasks t ON p.id = t.project_id
        GROUP BY p.id, p.name, p.color
        ORDER BY total_tasks DESC, p.name ASC
    """, (days, days))
    projects = cursor.fetchall()
    cursor.close()
    conn.close()

    for project in projects:
        total_tasks = int(project["total_tasks"] or 0)
        completed_tasks = int(project["completed_tasks"] or 0)
        project["remaining_tasks"] = max(total_tasks - completed_tasks, 0)
        project["progress"] = round(completed_tasks / total_tasks * 100, 1) if total_tasks else 0.0

    return jsonify({
        "range": range_key,
        "range_days": days,
        "projects": projects,
    }), 200


@app.route("/api/analytics/priority-distribution", methods=["GET"])
def get_priority_distribution():
    range_key = resolve_range(request.args.get("range"))
    days = ANALYTICS_RANGES[range_key]
    # Pass a "range" of "all" for lifetime data, otherwise filter by creation date.
    scoped = str(request.args.get("range") or "").strip().lower() != "all"
    where = "WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL %s DAY)" if scoped else ""

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute(f"""
        SELECT priority, CAST(COUNT(*) AS SIGNED) as count
        FROM tasks {where}
        GROUP BY priority
        ORDER BY FIELD(priority, 'Critical','High','Medium','Low')
    """, (days,) if scoped else ())
    by_priority = cursor.fetchall()

    cursor.execute(f"""
        SELECT priority, status, CAST(COUNT(*) AS SIGNED) as count
        FROM tasks {where}
        GROUP BY priority, status
    """, (days,) if scoped else ())
    by_priority_status = cursor.fetchall()

    total = sum(int(row["count"]) for row in by_priority)

    cursor.close()
    conn.close()

    return jsonify({
        "range": "all" if not scoped else range_key,
        "range_days": days if scoped else None,
        "total": total,
        "by_priority": by_priority,
        "by_priority_status": by_priority_status,
    }), 200

# ==================== NOTES ====================

@app.route("/api/notes", methods=["GET"])
def get_notes():
    project_id = request.args.get("project_id", type=int)
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    if project_id:
        cursor.execute("""
            SELECT n.*, p.name AS project_name, p.color AS project_color
            FROM notes n LEFT JOIN projects p ON p.id = n.project_id
            WHERE n.project_id = %s ORDER BY n.updated_at DESC, n.id DESC
        """, (project_id,))
    else:
        cursor.execute("""
            SELECT n.*, p.name AS project_name, p.color AS project_color
            FROM notes n LEFT JOIN projects p ON p.id = n.project_id
            ORDER BY n.updated_at DESC, n.id DESC
        """)
    notes = [decorate_note(row) for row in cursor.fetchall()]
    cursor.close()
    conn.close()
    return jsonify(notes), 200


def decorate_note(note):
    if note.get("project_id"):
        note["project"] = {
            "id": note["project_id"],
            "name": note.pop("project_name", None),
            "color": note.pop("project_color", None),
        }
    else:
        note.pop("project_name", None)
        note.pop("project_color", None)
        note["project"] = None
    return note


@app.route("/api/notes/<int:note_id>", methods=["GET"])
def get_note(note_id):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT n.*, p.name AS project_name, p.color AS project_color
        FROM notes n LEFT JOIN projects p ON p.id = n.project_id
        WHERE n.id = %s
    """, (note_id,))
    note = cursor.fetchone()
    cursor.close()
    conn.close()
    if note is None:
        return jsonify({"error": "Note not found"}), 404
    return jsonify(decorate_note(note)), 200

@app.route("/api/notes", methods=["POST"])
def create_note():
    data = request.get_json()
    if not data or not data.get("title"):
        return jsonify({"error": "Note title is required"}), 400
    
    title = data["title"].strip()
    content = data.get("content", "").strip() or ""
    project_id = normalize_project_id(data.get("project_id"))

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    if not project_exists(cursor, project_id):
        cursor.close()
        conn.close()
        return jsonify({"error": "Project not found"}), 404

    cursor.execute(
        "INSERT INTO notes (title, content, project_id) VALUES (%s, %s, %s)",
        (title, content, project_id)
    )
    conn.commit()
    note_id = cursor.lastrowid
    cursor.execute("""
        SELECT n.*, p.name AS project_name, p.color AS project_color
        FROM notes n LEFT JOIN projects p ON p.id = n.project_id WHERE n.id = %s
    """, (note_id,))
    note = cursor.fetchone()
    cursor.close()
    conn.close()
    return jsonify(decorate_note(note)), 201

@app.route("/api/notes/<int:note_id>", methods=["PUT"])
def update_note(note_id):
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request data"}), 400

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id FROM notes WHERE id = %s", (note_id,))
    if cursor.fetchone() is None:
        cursor.close()
        conn.close()
        return jsonify({"error": "Note not found"}), 404

    fields = []
    values = []

    if "title" in data:
        title = (data.get("title") or "").strip()
        if not title:
            cursor.close()
            conn.close()
            return jsonify({"error": "Note title cannot be empty"}), 400
        if len(title) > 255:
            cursor.close()
            conn.close()
            return jsonify({"error": "Note title must be 255 characters or less"}), 400
        fields.append("title = %s")
        values.append(title)
    if "content" in data:
        fields.append("content = %s")
        values.append((data.get("content") or "").strip())
    if "project_id" in data:
        project_id = normalize_project_id(data["project_id"])
        if not project_exists(cursor, project_id):
            cursor.close()
            conn.close()
            return jsonify({"error": "Project not found"}), 404
        fields.append("project_id = %s")
        values.append(project_id)

    if fields:
        values.append(note_id)
        cursor.execute(f"UPDATE notes SET {', '.join(fields)} WHERE id = %s", values)
        conn.commit()

    cursor.execute("""
        SELECT n.*, p.name AS project_name, p.color AS project_color
        FROM notes n LEFT JOIN projects p ON p.id = n.project_id WHERE n.id = %s
    """, (note_id,))
    note = cursor.fetchone()
    cursor.close()
    conn.close()
    return jsonify(decorate_note(note)), 200

@app.route("/api/notes/<int:note_id>", methods=["DELETE"])
def delete_note(note_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM notes WHERE id = %s", (note_id,))
    if cursor.fetchone() is None:
        cursor.close()
        conn.close()
        return jsonify({"error": "Note not found"}), 404
    
    cursor.execute("DELETE FROM notes WHERE id = %s", (note_id,))
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"message": "Note deleted successfully"}), 200

# ==================== ACTIVITY LOGS ====================

@app.route("/api/activity", methods=["GET"])
def get_activity_logs():
    limit = request.args.get("limit", 50, type=int)
    task_id = request.args.get("task_id", type=int)
    project_id = request.args.get("project_id", type=int)
    
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    
    query = "SELECT * FROM activity_logs WHERE 1=1"
    params = []
    
    if task_id:
        query += " AND task_id = %s"
        params.append(task_id)
    if project_id:
        query += " AND project_id = %s"
        params.append(project_id)
    
    query += " ORDER BY created_at DESC LIMIT %s"
    params.append(limit)
    
    cursor.execute(query, params)
    logs = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(logs), 200

def log_activity(task_id, project_id, action, description, metadata=None):
    """Helper function to log activity.

    Never allowed to break the primary request - logging is best effort.
    """
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO activity_logs (task_id, project_id, action, description, metadata) VALUES (%s, %s, %s, %s, %s)",
            (task_id, project_id, action, description, json.dumps(metadata) if metadata else None)
        )
        conn.commit()
        cursor.close()
        conn.close()
    except Exception as exc:  # pragma: no cover - logging must never break a request
        print(f"Activity logging failed: {exc}")

# ==================== GLOBAL SEARCH ====================

@app.route("/api/search", methods=["GET"])
def global_search():
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify({"tasks": [], "projects": [], "notes": []}), 200
    
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    
    # Search tasks - use FULLTEXT if available, otherwise fall back to LIKE
    try:
        cursor.execute("""
            SELECT id, title, description, status, priority, due_date, project_id, created_at
            FROM tasks
            WHERE MATCH(title, description) AGAINST(%s IN NATURAL LANGUAGE MODE)
            OR title LIKE %s
            OR description LIKE %s
            ORDER BY 
                CASE WHEN MATCH(title, description) AGAINST(%s IN NATURAL LANGUAGE MODE) > 0 THEN 1 ELSE 2 END,
                created_at DESC
            LIMIT 20
        """, (query, f"%{query}%", f"%{query}%", query))
        tasks = cursor.fetchall()
    except Exception as e:
        # Fallback to LIKE query if FULLTEXT index not available
        print(f"FULLTEXT search failed for tasks, falling back to LIKE: {e}")
        cursor.execute("""
            SELECT id, title, description, status, priority, due_date, project_id, created_at
            FROM tasks
            WHERE title LIKE %s OR description LIKE %s
            ORDER BY created_at DESC
            LIMIT 20
        """, (f"%{query}%", f"%{query}%"))
        tasks = cursor.fetchall()
    
    # Search projects
    cursor.execute("""
        SELECT id, name, description, color, created_at
        FROM projects
        WHERE name LIKE %s OR description LIKE %s
        ORDER BY created_at DESC
        LIMIT 10
    """, (f"%{query}%", f"%{query}%"))
    projects = cursor.fetchall()
    
    # Search notes
    try:
        cursor.execute("""
            SELECT id, title, content, project_id, created_at, updated_at
            FROM notes
            WHERE MATCH(title, content) AGAINST(%s IN NATURAL LANGUAGE MODE)
            OR title LIKE %s
            OR content LIKE %s
            ORDER BY updated_at DESC
            LIMIT 20
        """, (query, f"%{query}%", f"%{query}%"))
        notes = cursor.fetchall()
    except Exception as e:
        # Fallback to LIKE query if FULLTEXT index not available
        print(f"FULLTEXT search failed for notes, falling back to LIKE: {e}")
        cursor.execute("""
            SELECT id, title, content, project_id, created_at, updated_at
            FROM notes
            WHERE title LIKE %s OR content LIKE %s
            ORDER BY updated_at DESC
            LIMIT 20
        """, (f"%{query}%", f"%{query}%"))
        notes = cursor.fetchall()
    
    cursor.close()
    conn.close()
    
    return jsonify({
        "tasks": tasks,
        "projects": projects,
        "notes": notes
    }), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)