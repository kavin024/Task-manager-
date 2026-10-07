import os
from pathlib import Path
from dotenv import load_dotenv
import mysql.connector
from mysql.connector import Error

# Load .env from the backend directory explicitly
BACKEND_DIR = Path(__file__).parent
load_dotenv(BACKEND_DIR / ".env")

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "student_task_manager")

def get_connection():
    try:
        conn = mysql.connector.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME,
        )
        return conn
    except Error as e:
        print(f"Database connection error: {e}")
        raise