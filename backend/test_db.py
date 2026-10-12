import database
import test_safety  # noqa: F401  (refuses to run against the production database)

try:
    conn = database.get_connection()
    print('MySQL connection: OK')
    cursor = conn.cursor()
    cursor.execute('SELECT 1')
    cursor.fetchall()  # consume result
    cursor.execute('SELECT * FROM %s.tasks' % database.DB_NAME)
    tasks = cursor.fetchall()
    print('Tasks in DB (%s):' % database.DB_NAME, len(tasks))
    for t in tasks:
        print('  -', t)
    cursor.close()
    conn.close()
except Exception as e:
    import traceback
    traceback.print_exc()
    print('MySQL connection error:', e)