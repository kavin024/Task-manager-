import test_helpers as h

client = h.get_client()
user = h.register_user(client)
headers = h.auth(user)

# Give the dashboard a little data so the payloads are non-trivial.
project = h.create_project(client, user, name='Analytics Project')
for i in range(3):
    h.create_task(client, user, title='Analytics task %d' % i, status='Pending',
                  priority='High', project_id=project['id'])

print('=== GET /api/analytics/overview ===')
r = client.get('/api/analytics/overview', headers=headers)
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== GET /api/analytics/productivity ===')
r = client.get('/api/analytics/productivity', headers=headers)
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== GET /api/analytics/projects ===')
r = client.get('/api/analytics/projects', headers=headers)
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== GET /api/analytics/priority-distribution ===')
r = client.get('/api/analytics/priority-distribution', headers=headers)
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== GET /api/analytics/overview (range=30d) ===')
r = client.get('/api/analytics/overview?range=30d', headers=headers)
print('Status:', r.status_code)
print('range field:', r.get_json().get('range'))
print()

print('=== GET /api/analytics/priority-distribution (range=all) ===')
r = client.get('/api/analytics/priority-distribution?range=all', headers=headers)
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('All analytics tests completed')