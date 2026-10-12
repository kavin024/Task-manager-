import test_helpers as h

client = h.get_client()
user = h.register_user(client)
headers = h.auth(user)
project = h.create_project(client, user, name='Notes Project')
project_id = project['id']

print('=== GET /api/notes ===')
r = client.get('/api/notes', headers=headers)
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== POST /api/notes ===')
r = client.post('/api/notes', headers=headers, json={
    'title': 'Test Note',
    'content': 'This is a test note',
    'project_id': project_id
})
print('Status:', r.status_code)
note = r.get_json()
print('Body:', note)
note_id = note.get('id')
print()

print('=== GET /api/notes/{id} ===')
r = client.get('/api/notes/' + str(note_id), headers=headers)
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== PUT /api/notes/{id} ===')
r = client.put('/api/notes/' + str(note_id), headers=headers, json={
    'title': 'Updated Note',
    'content': 'Updated content',
    'project_id': project_id
})
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== GET /api/notes (after update) ===')
r = client.get('/api/notes', headers=headers)
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== GET /api/notes?project_id={id} ===')
r = client.get('/api/notes?project_id=%d' % project_id, headers=headers)
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== DELETE /api/notes/{id} ===')
r = client.delete('/api/notes/' + str(note_id), headers=headers)
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== GET /api/notes (after delete) ===')
r = client.get('/api/notes', headers=headers)
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== POST /api/notes without project ===')
r = client.post('/api/notes', headers=headers, json={
    'title': 'Note without project',
    'content': 'No project assigned'
})
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== POST /api/notes with someone else project ===')
r = client.post('/api/notes', headers=headers, json={
    'title': 'Foreign project note',
    'content': 'Should fail',
    'project_id': 999999
})
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== GET /api/activity ===')
r = client.get('/api/activity?limit=10', headers=headers)
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== GET /api/search?q=test ===')
r = client.get('/api/search?q=test', headers=headers)
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('All notes tests completed')