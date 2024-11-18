import psycopg2
import os
import json
from dotenv import load_dotenv

load_dotenv()

def create_table():
    conn = psycopg2.connect(
        dbname=os.getenv('DB_NAME'),
        user=os.getenv('DB_USER'),
        password=os.getenv('DB_PASSWORD'),
        host=os.getenv('DB_HOST'),
        port=os.getenv('DB_PORT')
    )
    cur = conn.cursor()

    # Create the datasets table if it doesn't already exist
    cur.execute('''
        CREATE TABLE IF NOT EXISTS datasets (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            data JSONB NOT NULL
        );
    ''')

    conn.commit()
    cur.close()
    conn.close()

def migrate_datasets():
    conn = psycopg2.connect(
        dbname=os.getenv('DB_NAME'),
        user=os.getenv('DB_USER'),
        password=os.getenv('DB_PASSWORD'),
        host=os.getenv('DB_HOST'),
        port=os.getenv('DB_PORT')
    )
    cur = conn.cursor()

    for file_name in os.listdir('data'):
        if file_name.endswith('.txt'):
            with open(os.path.join('data', file_name), 'r') as f:
                dataset_content = f.read() 
                dataset_json = {"content": dataset_content}  # Wrap as JSON

                cur.execute(
                    "INSERT INTO datasets (name, data) VALUES (%s, %s);",
                    (file_name, json.dumps(dataset_json))
                )
    
    conn.commit()
    cur.close()
    conn.close()

create_table()
migrate_datasets()