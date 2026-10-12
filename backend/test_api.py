import test_helpers as h

client = h.get_client()
user = h.register_user(client)
headers = h.auth(user)

print('=== /api/health ===')
r = client.get('/api/health')
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== GET /api/tasks ===')
r = client.get('/api/tasks', headers=headers)
print('Status:', r.status_code)
print('Count:', len(r.get_json()))
print()

print('=== POST /api/tasks ===')
r = client.post('/api/tasks', headers=headers, json={
    'title': 'Test Priority Task',
    'description': 'Testing new fields',
    'status': 'In Progress',
    'priority': 'High',
    'estimated_minutes': 60
})
print('Status:', r.status_code)
task = r.get_json()
print('Body:', task)
task_id = task.get('id')
print()

print('=== GET /api/tasks/{id} ===')
r = client.get('/api/tasks/' + str(task_id), headers=headers)
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== PUT /api/tasks/{id} (update status) ===')
r = client.put('/api/tasks/' + str(task_id), headers=headers, json={'status': 'Completed'})
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== GET /api/projects ===')
r = client.get('/api/projects', headers=headers)
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== POST /api/projects ===')
r = client.post('/api/projects', headers=headers, json={'name': 'Test Project', 'description': 'A test project', 'color': '#ef4444'})
print('Status:', r.status_code)
project = r.get_json()
print('Body:', project)
project_id = project.get('id')
print()

print('=== POST /api/tasks with project_id ===')
r = client.post('/api/tasks', headers=headers, json={
    'title': 'Task with Project',
    'description': 'Linked to project',
    'project_id': project_id,
    'priority': 'Critical'
})
print('Status:', r.status_code)
task2 = r.get_json()
print('Body:', task2)
print()

print('=== GET /api/tasks/{id} with relations ===')
r = client.get('/api/tasks/' + str(task2['id']), headers=headers)
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== POST /api/tasks/{id}/subtasks ===')
r = client.post('/api/tasks/' + str(task_id) + '/subtasks', headers=headers, json={'title': 'Subtask 1'})
print('Status:', r.status_code)
subtask = r.get_json()
print('Body:', subtask)
print()

print('=== GET /api/tasks/{id}/subtasks ===')
r = client.get('/api/tasks/' + str(task_id) + '/subtasks', headers=headers)
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== POST /api/tags ===')
tag_name = 'urgent-%d' % user['user']['id']  # unique per user, so re-runs don't 409
r = client.post('/api/tags', headers=headers, json={'name': tag_name, 'color': '#ef4444'})
print('Status:', r.status_code)
tag = r.get_json()
print('Body:', tag)
print()

print('=== POST /api/tasks/{id}/tags ===')
r = client.post('/api/tasks/' + str(task_id) + '/tags', headers=headers, json={'tag_id': tag['id']})
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== GET /api/tasks/{id} with all relations ===')
r = client.get('/api/tasks/' + str(task_id), headers=headers)
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== DELETE /api/tasks/{id} ===')
r = client.delete('/api/tasks/' + str(task_id), headers=headers)
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== DELETE /api/projects/{id} ===')
r = client.delete('/api/projects/' + str(project_id), headers=headers)
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== GET /api/projects (after delete) ===')
r = client.get('/api/projects', headers=headers)
print('Status:', r.status_code)
print('Count:', len(r.get_json()))
print()

print('=== GET /api/tasks (after cleanup) ===')
r = client.get('/api/tasks', headers=headers)
print('Status:', r.status_code)
print('Count:', len(r.get_json()))
print()

print('All tests completed')