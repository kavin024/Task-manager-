"""Shared helpers for the standalone test scripts.

Creates a fresh, isolated user per test run so suites never collide and
never touch legacy (user_id NULL) rows.
"""

import os
import sys
import time

# Ensure the backend directory is importable regardless of where the
# script is launched from, because tests run with the raw interpreter.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import test_safety  # noqa: E402,F401  (runs the production-database guard on import)

from app import app  # noqa: E402  (import order matters: env must be ready)

DEFAULT_PASSWORD = "password123"


def get_client():
    return app.test_client()


def unique_email(prefix="user"):
    return "%s%d@example.com" % (prefix, int(time.time() * 1000))


def register_user(client=None, name="Test User", email=None, password=DEFAULT_PASSWORD):
    client = client or get_client()
    email = email or unique_email()
    resp = client.post(
        "/api/auth/register",
        json={"name": name, "email": email, "password": password},
    )
    assert resp.status_code == 201, (resp.status_code, resp.get_json())
    body = resp.get_json()
    return {
        "email": email,
        "password": password,
        "token": body["token"],
        "user": body["user"],
        "headers": {"Authorization": "Bearer %s" % body["token"]},
    }


def auth(user):
    return user["headers"]


def create_task(client, user_id_headers, **overrides):
    payload = {"title": "Test Task", "status": "Pending", "priority": "Medium"}
    payload.update(overrides)
    resp = client.post("/api/tasks", json=payload, headers=auth(user_id_headers))
    assert resp.status_code == 201, (resp.status_code, resp.get_json())
    return resp.get_json()


def create_project(client, user_id_headers, name="Test Project"):
    resp = client.post(
        "/api/projects",
        json={"name": name, "description": "A test project", "color": "#ef4444"},
        headers=auth(user_id_headers),
    )
    assert resp.status_code == 201, (resp.status_code, resp.get_json())
    return resp.get_json()