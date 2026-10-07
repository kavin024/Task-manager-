import sys
sys.path.insert(0, 'D:/software/student-task-manager/backend')
from app import app

client = app.test_client()

print('=== GET /api/analytics/overview ===')
r = client.get('/api/analytics/overview')
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== GET /api/analytics/productivity ===')
r = client.get('/api/analytics/productivity')
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== GET /api/analytics/projects ===')
r = client.get('/api/analytics/projects')
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('=== GET /api/analytics/priority-distribution ===')
r = client.get('/api/analytics/priority-distribution')
print('Status:', r.status_code)
print('Body:', r.get_json())
print()

print('All analytics tests completed')