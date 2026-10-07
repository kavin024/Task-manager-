import sys
sys.path.insert(0, 'D:/software/student-task-manager/backend')
from app import app

client = app.test_client()

print('=== GET /api/notes ===')
r = client.get('/api/notes')
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== POST /api/notes ===')
r = client.post('/api/notes', json={
    'title': 'Test Note',
    'content': 'This is a test note',
    'project_id': 1
})
print('Status:', r.status_code)
note = r.get_json()
print('Body:', note)
note_id = note.get('id')
print()

print('=== GET /api/notes/{id} ===')
r = client.get('/api/notes/' + str(note_id))
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== PUT /api/notes/{id} ===')
r = client.put('/api/notes/' + str(note_id), json={
    'title': 'Updated Note',
    'content': 'Updated content',
    'project_id': 1
})
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== GET /api/notes (after update) ===')
r = client.get('/api/notes')
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== DELETE /api/notes/{id} ===')
r = client.delete('/api/notes/' + str(note_id))
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== GET /api/notes (after delete) ===')
r = client.get('/api/notes')
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== POST /api/notes without project ===')
r = client.post('/api/notes', json={
    'title': 'Note without project',
    'content': 'No project assigned'
})
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== GET /api/activity ===')
r = client.get('/api/activity?limit=10')
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== GET /api/search?q=test ===')
r = client.get('/api/search?q=test')
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('All notes tests completed')