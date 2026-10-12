"""Auth + ownership test suite (standalone script, like the other test files).

Run with:  python test_auth.py
Requires: migrations 008-013 applied and a reachable MySQL instance.
"""

import test_helpers as h

client = h.get_client()

print("=== public health endpoint stays open ===")
r = client.get("/api/health")
print("Status:", r.status_code)
assert r.status_code == 200
print()

print("=== protected routes reject anonymous / bad token ===")
r = client.get("/api/tasks")
print("GET /api/tasks without token ->", r.status_code)
assert r.status_code == 401
r = client.get("/api/tasks", headers={"Authorization": "Bearer not-a-real-token"})
print("GET /api/tasks with garbage token ->", r.status_code)
assert r.status_code == 401
r = client.post("/api/projects", json={"name": "x"}, headers={"Authorization": "Bearer x"})
print("POST /api/projects with garbage token ->", r.status_code)
assert r.status_code == 401
print()

print("=== register validations ===")
r = client.post("/api/auth/register", json={"name": "", "email": "a@b.com", "password": "password123"})
print("empty name ->", r.status_code)
assert r.status_code == 400
r = client.post("/api/auth/register", json={"name": "A", "email": "not-an-email", "password": "password123"})
print("bad email ->", r.status_code)
assert r.status_code == 400
r = client.post("/api/auth/register", json={"name": "A", "email": "a@b.com", "password": "short"})
print("short password ->", r.status_code)
assert r.status_code == 400
r = client.post("/api/auth/register", json={"name": "A", "email": "a@b.com"})
print("missing password ->", r.status_code)
assert r.status_code == 400
print()

print("=== register + duplicate email ===")
user = h.register_user(client)
print("register OK, user:", user["user"])
r = client.post("/api/auth/register", json={"name": "Other", "email": user["email"], "password": "password123"})
print("duplicate email ->", r.status_code)
assert r.status_code == 409
print()

print("=== login + wrong password ===")
r = client.post("/api/auth/login", json={"email": user["email"], "password": "wrongpass"})
print("wrong password ->", r.status_code)
assert r.status_code == 401
r = client.post("/api/auth/login", json={"email": user["email"] + ".x", "password": user["password"]})
print("unknown email ->", r.status_code)
assert r.status_code == 401
login = client.post("/api/auth/login", json={"email": user["email"], "password": user["password"]})
print("correct login ->", login.status_code)
assert login.status_code == 200
assert login.get_json()["user"]["email"] == user["email"]
print("login body:", login.get_json()["user"])
print()

print("=== GET /api/auth/me ===")
r = client.get("/api/auth/me", headers=h.auth(user))
print("Status:", r.status_code, r.get_json())
assert r.status_code == 200
assert r.get_json()["user"]["name"] == user["user"]["name"]
print()

print("=== logout revokes the token ===")
r = client.post("/api/auth/logout", headers=h.auth(user))
print("logout ->", r.status_code)
assert r.status_code == 200
r = client.get("/api/auth/me", headers=h.auth(user))
print("me after logout ->", r.status_code)
assert r.status_code == 401
print()

print("=== who can see whom: isolation between two users ===")
a = h.register_user(client, name="User A")
b = h.register_user(client, name="User B")
pa = h.create_project(client, a, name="A Private Project")
ta = h.create_task(client, a, title="A Private Task", project_id=pa["id"])

r = client.get("/api/projects/%d" % pa["id"], headers=h.auth(b))
print("B reads A project ->", r.status_code)
assert r.status_code == 404
r = client.get("/api/tasks/%d" % ta["id"], headers=h.auth(b))
print("B reads A task ->", r.status_code)
assert r.status_code == 404
r = client.put("/api/tasks/%d" % ta["id"], json={"status": "Completed"}, headers=h.auth(b))
print("B updates A task ->", r.status_code)
assert r.status_code == 404
r = client.delete("/api/tasks/%d" % ta["id"], headers=h.auth(b))
print("B deletes A task ->", r.status_code)
assert r.status_code == 404
r = client.post("/api/tasks/%d/subtasks" % ta["id"], json={"title": "x"}, headers=h.auth(b))
print("B adds subtask to A task ->", r.status_code)
assert r.status_code == 404
r = client.post("/api/tasks/%d/tags" % ta["id"], json={"tag_id": 1}, headers=h.auth(b))
print("B tags A task ->", r.status_code)
assert r.status_code == 404

r = client.post("/api/tasks", json={"title": "B task in A project", "project_id": pa["id"]}, headers=h.auth(b))
print("B creates task in A project ->", r.status_code)
assert r.status_code == 404

r = client.get("/api/tasks", headers=h.auth(b))
print("B task list count:", len(r.get_json()))
assert all(t["id"] != ta["id"] for t in r.get_json())
r = client.get("/api/projects", headers=h.auth(b))
print("B project list count:", len(r.get_json()))
assert all(p["id"] != pa["id"] for p in r.get_json())
print()

print("=== tags belong to one user ===")
unique_tag_name = "personal-%d" % a["user"]["id"]
r = client.post("/api/tags", json={"name": unique_tag_name, "color": "#123456"}, headers=h.auth(a))
print("A creates tag ->", r.status_code)
atag = r.get_json()
r = client.post("/api/tasks/%d/tags" % ta["id"], json={"tag_id": atag["id"]}, headers=h.auth(b))
print("B attaches A tag to A task ->", r.status_code)
assert r.status_code == 404
r = client.post("/api/tasks/%d/tags" % ta["id"], json={"tag_id": atag["id"]}, headers=h.auth(a))
print("A attaches own tag ->", r.status_code)
assert r.status_code == 201
r = client.get("/api/tags", headers=h.auth(b))
print("B tag list:", r.get_json())
assert all(t["id"] != atag["id"] for t in r.get_json())
print()

print("=== notes & focus sessions scoped ===")
r = client.post("/api/notes", json={"title": "A note", "content": "secret", "project_id": pa["id"]}, headers=h.auth(a))
print("A creates note ->", r.status_code)
anote = r.get_json()
r = client.get("/api/notes/%d" % anote["id"], headers=h.auth(b))
print("B reads A note ->", r.status_code)
assert r.status_code == 404
r = client.put("/api/notes/%d" % anote["id"], json={"title": "hacked"}, headers=h.auth(b))
print("B edits A note ->", r.status_code)
assert r.status_code == 404
r = client.post("/api/focus/sessions", json={"duration_minutes": 25}, headers=h.auth(a))
print("A focus session ->", r.status_code)
sess = r.get_json()
r = client.put("/api/focus/sessions/%d" % sess["id"], json={"completed": True}, headers=h.auth(b))
print("B edits A session ->", r.status_code)
assert r.status_code == 404
r = client.get("/api/focus/sessions", headers=h.auth(b))
assert all(s["id"] != sess["id"] for s in r.get_json())
print()

print("=== activity + search scoped ===")
r = client.get("/api/activity", headers=h.auth(b))
print("B activity count:", len(r.get_json()))
assert all(l["task_id"] != ta["id"] for l in r.get_json())
r = client.get("/api/search?q=Private%20Task", headers=h.auth(b))
print("B searches A task -> tasks:", len(r.get_json()["tasks"]))
assert all(t["id"] != ta["id"] for t in r.get_json()["tasks"])
print()

print("=== preference defaults + fixed schedule ===")
r = client.get("/api/auth/preferences", headers=h.auth(b))
print("Defaults:", r.get_json())
assert r.status_code == 200
assert r.get_json()["timezone"] == "Asia/Kolkata"
assert r.get_json()["remind_time"] == "06:00:00"
assert "6:00 AM" in r.get_json().get("schedule_label", "")
# Custom schedules are rejected - the API is fixed to 06:00 Asia/Kolkata.
r = client.put("/api/auth/preferences", json={"timezone": "America/New_York"}, headers=h.auth(b))
print("custom timezone ->", r.status_code)
assert r.status_code == 400
r = client.put("/api/auth/preferences", json={"remind_time": "08:30"}, headers=h.auth(b))
print("custom remind_time ->", r.status_code)
assert r.status_code == 400
# The fixed defaults are still accepted.
r = client.put(
    "/api/auth/preferences",
    json={"remind_time": "06:00", "timezone": "Asia/Kolkata"},
    headers=h.auth(b),
)
print("fixed values ->", r.status_code)
assert r.status_code == 200
assert r.get_json()["timezone"] == "Asia/Kolkata"
assert r.get_json()["remind_time"] == "06:00:00"
# Toggle + destination email are the only user-controlled settings.
r = client.put(
    "/api/auth/preferences",
    json={"enabled": False, "reminder_email": "reminders@example.com"},
    headers=h.auth(b),
)
print("Disable + email:", r.status_code, r.get_json())
assert r.status_code == 200
assert r.get_json()["enabled"] is False
assert r.get_json()["reminder_email"] == "reminders@example.com"
assert r.get_json()["timezone"] == "Asia/Kolkata"
r = client.put("/api/auth/preferences", json={"reminder_email": "not-an-email"}, headers=h.auth(b))
print("bad email ->", r.status_code)
assert r.status_code == 400
print()

print("=== reminder preferences: partial updates preserve omitted fields ===")
p = h.register_user(client, name="Pref User")
# Fresh user -> documented defaults (defaults only apply on first creation).
r = client.get("/api/auth/preferences", headers=h.auth(p))
print("fresh defaults:", r.get_json())
assert r.status_code == 200
assert r.get_json()["enabled"] is True
assert r.get_json()["reminder_email"] == p["email"]
assert r.get_json()["remind_time"] == "06:00:00"
assert r.get_json()["timezone"] == "Asia/Kolkata"

# Disable only -> the omitted email must be preserved, not reset.
r = client.put("/api/auth/preferences", json={"enabled": False}, headers=h.auth(p))
print("disable only:", r.get_json())
assert r.status_code == 200
assert r.get_json()["enabled"] is False
assert r.get_json()["reminder_email"] == p["email"]

# Email only -> the omitted enabled flag must stay False, not flip to True.
r = client.put("/api/auth/preferences", json={"reminder_email": "prefs@example.com"}, headers=h.auth(p))
print("email only:", r.get_json())
assert r.status_code == 200
assert r.get_json()["enabled"] is False, "omitted enabled must be preserved"
assert r.get_json()["reminder_email"] == "prefs@example.com"

# Re-enable only -> the custom email must be preserved.
r = client.put("/api/auth/preferences", json={"enabled": True}, headers=h.auth(p))
print("enable only:", r.get_json())
assert r.status_code == 200
assert r.get_json()["enabled"] is True
assert r.get_json()["reminder_email"] == "prefs@example.com", "omitted email must be preserved"

# A rejected custom timezone on a partial update must change nothing.
r = client.put(
    "/api/auth/preferences",
    json={"enabled": True, "timezone": "UTC"},
    headers=h.auth(p),
)
print("partial + bad timezone ->", r.status_code)
assert r.status_code == 400
r = client.get("/api/auth/preferences", headers=h.auth(p))
assert r.get_json()["enabled"] is True
assert r.get_json()["reminder_email"] == "prefs@example.com"
assert r.get_json()["timezone"] == "Asia/Kolkata"
print()

print("=== reminder history empty for a fresh user ===")
r = client.get("/api/reminders/history", headers=h.auth(a))
print("Status:", r.status_code, r.get_json())
assert r.status_code == 200
assert r.get_json() == []
print()

print("=== internal endpoint token gate ===")
r = client.post("/api/internal/send-daily-reminders")
print("no token ->", r.status_code)
assert r.status_code == 403
r = client.post("/api/internal/send-daily-reminders", headers={"X-Reminder-Token": "wrong"})
print("wrong token ->", r.status_code)
assert r.status_code == 403
print()

print("ALL AUTH TESTS PASSED")