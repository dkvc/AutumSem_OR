import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

def check_datasets():
    conn = psycopg2.connect(
        dbname=os.getenv('DB_NAME'),
        user=os.getenv('DB_USER'),
        password=os.getenv('DB_PASSWORD'),
        host=os.getenv('DB_HOST'),
        port=os.getenv('DB_PORT')
    )
    cur = conn.cursor()

    # Fetch all rows from the datasets table
    cur.execute("SELECT * FROM datasets;")
    rows = cur.fetchall()
    for row in rows:
        print(row)
    
    cur.close()
    conn.close()

check_datasets()
