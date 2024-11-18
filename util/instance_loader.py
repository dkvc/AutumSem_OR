import psycopg2
import json
import re
import pandas as pd
import math
from models.data_model import ProblemInstance

from dotenv import load_dotenv
import os

load_dotenv()

def load_instance(dataset_name: str, time_precision_scaler: int) -> ProblemInstance:
    """
    Load instance of Solomon benchmark with defined precision scaler from PostgreSQL.

    Parameters
    ----------
    dataset_name : str
        The name of the dataset to be loaded.
    time_precision_scaler : int
        Variable defining the precision of travel and service times, e.g., 100 means precision of two decimals.
    """
    # Connect to PostgreSQL database
    conn = psycopg2.connect(
        dbname=os.getenv('DB_NAME'),
        user=os.getenv('DB_USER'),
        password=os.getenv('DB_PASSWORD'),
        host=os.getenv('DB_HOST', 'localhost'),
        port=os.getenv('DB_PORT', '5432')
    )
    cur = conn.cursor()

    # Fetch the dataset content based on the dataset name
    cur.execute("SELECT data FROM datasets WHERE name = %s;", (dataset_name,))
    result = cur.fetchone()

    # If dataset is not found, return an error
    if result is None:
        cur.close()
        conn.close()
        raise ValueError(f"Dataset {dataset_name} not found in the database.")

    # Extract the JSON data from the database (which contains the 'content' key)
    dataset_json = result[0]  # This is the dictionary with 'content' as a key
    cur.close()
    conn.close()

    # Extract content from the JSON
    content = dataset_json.get('content', '')

    data = {}
    data["depot"] = 0
    lines = content.split('\n')
    
    # Extract the vehicle count and capacities from the content
    data["num_vehicles"] = int(re.findall("[0-9]+", lines[4])[0])
    data["vehicle_capacities"] = [int(re.findall("[0-9]+", lines[4])[1])] * data["num_vehicles"]

    # Parse the customer data (assuming the data starts after line 8)
    customer_data = []
    for line in lines[8:]:  # Assuming data starts after the 8th line
        if line.strip():
            customer_data.append(list(map(int, re.findall("[0-9]+", line))))

    df = pd.DataFrame(customer_data, columns=["customer", "xcord", "ycord", "demand", "ready_time", "due_date", "service_time"])
    df["service_time"] = df["service_time"] * time_precision_scaler
    df["ready_time"] = df["ready_time"] * time_precision_scaler
    df["due_date"] = df["due_date"] * time_precision_scaler

    # Add the demands to the data dictionary
    data["demands"] = list(df.demand)

    data["service_times"] = list(df.service_time)

    # Create time matrix
    travel_times = df[["xcord", "ycord", "service_time"]].to_dict()
    time_matrix = []
    for i in df.customer:
        time_vector = []
        for j in df.customer:
            if i == j:
                time_vector.append(0)
            else:
                time = int(
                    time_precision_scaler
                    * math.hypot(
                        (travel_times["xcord"][i] - travel_times["xcord"][j]),
                        (travel_times["ycord"][i] - travel_times["ycord"][j]),
                    )
                )
                time += travel_times["service_time"][j]
                time_vector.append(time)
        time_matrix.append(time_vector)
    data["time_matrix"] = time_matrix

    # Parse the time windows
    windows = df[["ready_time", "due_date", "service_time"]].to_dict()
    time_windows = []
    for i in df.customer:
        time_windows.append(
            (
                windows["ready_time"][i] + windows["service_time"][i],
                windows["due_date"][i] + windows["service_time"][i],
            )
        )
    data["time_windows"] = time_windows

    return data

