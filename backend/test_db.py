from database import get_connection

try:
    conn = get_connection()
    print('MySQL connection: OK')
    cursor = conn.cursor()
    cursor.execute('SELECT 1')
    cursor.fetchall()  # consume result
    cursor.execute('SELECT * FROM student_task_manager.tasks')
    tasks = cursor.fetchall()
    print('Tasks in DB:', len(tasks))
    for t in tasks:
        print('  -', t)
    cursor.close()
    conn.close()
except Exception as e:
    import traceback
    traceback.print_exc()
    print('MySQL connection error:', e)