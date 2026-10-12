"""Authentication helpers used by the Flask app.

Design:
- Bearer tokens: an opaque random token is returned once to the client and
  stored in MySQL as its SHA-256 hash, so a database leak never exposes a
  usable token.
- Tokens expire after TOKEN_TTL_DAYS (7) and we never extend them: when a
  session expires the client logs in again.
- The frontend stores the raw token in localStorage and sends it as the
  `Authorization: Bearer <token>` header. Cross-site cookies are NOT used
  because the GitHub Pages frontend and the Render API are different origins.
"""

import hashlib
import secrets
from datetime import datetime, timedelta

from flask import g, request, jsonify
from functools import wraps
from werkzeug.security import check_password_hash, generate_password_hash

import database

TOKEN_TTL_DAYS = 7
_TOKEN_BYTES = 48


def hash_token(raw_token):
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def generate_token():
    return secrets.token_urlsafe(_TOKEN_BYTES)


def create_session(user_id, conn=None):
    """Insert a hashed token row and return the single-use raw token."""
    raw = generate_token()
    token_hash = hash_token(raw)
    expires_at = datetime.utcnow() + timedelta(days=TOKEN_TTL_DAYS)

    own_conn = conn is None
    conn = conn or database.get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO auth_tokens (user_id, token_hash, expires_at) VALUES (%s, %s, %s)",
            (user_id, token_hash, expires_at),
        )
        conn.commit()
        cursor.close()
    finally:
        if own_conn:
            conn.close()
    return raw


def revoke_session(raw_token, conn=None):
    """Delete a session by its raw token. Returns True if a row was removed."""
    if not raw_token:
        return False
    own_conn = conn is None
    conn = conn or database.get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM auth_tokens WHERE token_hash = %s", (hash_token(raw_token),))
        conn.commit()
        deleted = cursor.rowcount > 0
        cursor.close()
    finally:
        if own_conn:
            conn.close()
    return deleted


def user_for_token(raw_token, conn=None):
    """Return a dict of the user owning a valid, unexpired token, or None."""
    if not raw_token:
        return None
    own_conn = conn is None
    conn = conn or database.get_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            """SELECT u.id, u.name, u.email
               FROM auth_tokens t
               JOIN users u ON u.id = t.user_id
               WHERE t.token_hash = %s AND t.expires_at > NOW()""",
            (hash_token(raw_token),),
        )
        user = cursor.fetchone()
        cursor.close()
    finally:
        if own_conn:
            conn.close()
    return user


def require_auth(fn):
    """Decorator: require a valid bearer token; expose g.user_id/g.user_email."""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        raw_token = None
        if auth_header.startswith("Bearer "):
            raw_token = auth_header[7:].strip()
        user = user_for_token(raw_token)
        if not user:
            return jsonify({"error": "Authentication required"}), 401
        g.user_id = user["id"]
        g.user_name = user["name"]
        g.user_email = user["email"]
        return fn(*args, **kwargs)

    return wrapper


def hash_password(plaintext):
    return generate_password_hash(plaintext)


def verify_password(plaintext, password_hash):
    return check_password_hash(password_hash, plaintext)


def normalize_email(raw):
    return (raw or "").strip().lower()