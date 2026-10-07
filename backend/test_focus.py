import sys
sys.path.insert(0, 'D:/software/student-task-manager/backend')
from app import app

client = app.test_client()

print('=== /api/health ===')
r = client.get('/api/health')
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== GET /api/focus/sessions ===')
r = client.get('/api/focus/sessions')
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== GET /api/focus/stats ===')
r = client.get('/api/focus/stats')
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== POST /api/focus/sessions ===')
r = client.post('/api/focus/sessions', json={'duration_minutes': 25})
print('Status:', r.status_code)
session = r.get_json()
print('Body:', session)
session_id = session.get('id')
print()

print('=== PUT /api/focus/sessions/{id} (complete) ===')
r = client.put('/api/focus/sessions/' + str(session_id), json={'completed': True})
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== GET /api/focus/stats (after session) ===')
r = client.get('/api/focus/stats')
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== GET /api/focus/sessions (after session) ===')
r = client.get('/api/focus/sessions')
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('All focus tests completed')