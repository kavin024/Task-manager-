import test_helpers as h

client = h.get_client()
user = h.register_user(client)
headers = h.auth(user)

print('=== /api/health ===')
r = client.get('/api/health')
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== GET /api/focus/sessions ===')
r = client.get('/api/focus/sessions', headers=headers)
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== GET /api/focus/stats ===')
r = client.get('/api/focus/stats', headers=headers)
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== POST /api/focus/sessions ===')
r = client.post('/api/focus/sessions', headers=headers, json={'duration_minutes': 25})
print('Status:', r.status_code)
session = r.get_json()
print('Body:', session)
session_id = session.get('id')
print()

print('=== PUT /api/focus/sessions/{id} (complete) ===')
r = client.put('/api/focus/sessions/' + str(session_id), headers=headers, json={'completed': True})
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== GET /api/focus/stats (after session) ===')
r = client.get('/api/focus/stats', headers=headers)
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== GET /api/focus/sessions (after session) ===')
r = client.get('/api/focus/sessions', headers=headers)
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== DELETE /api/focus/sessions/{id} ===')
r = client.delete('/api/focus/sessions/' + str(session_id), headers=headers)
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('All focus tests completed')