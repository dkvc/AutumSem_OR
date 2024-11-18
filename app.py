from flask import Flask, render_template, request, jsonify, g
from solver.base_solver import Solver
from util.instance_loader import load_instance

import psycopg2
import os
from dotenv import load_dotenv
import re

load_dotenv()

app = Flask(__name__)

# Function to get the database connection
def get_db():
    if 'db' not in g:
        g.db = psycopg2.connect(
            dbname=os.getenv('DB_NAME'),
            user=os.getenv('DB_USER'),
            password=os.getenv('DB_PASSWORD'),
            host=os.getenv('DB_HOST', 'localhost'),
            port=os.getenv('DB_PORT', '5432')
        )
    return g.db

# Close the database connection when the request ends
@app.teardown_appcontext
def close_db(error):
    db = getattr(g, 'db', None)
    if db is not None:
        db.close()

@app.route('/')
def index():
    return render_template('index.html')

# Load available datasets from the postgres
@app.route('/load_datasets')
def load_datasets():
    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT name FROM datasets;")  # Fetch dataset names from the PostgreSQL database
    datasets = [row[0] for row in cur.fetchall()]  # Extract names

    cur.close()
    return jsonify(datasets)

# Get initial data information (like vehicle capacity) from the selected dataset
@app.route('/get_data_info', methods=['POST'])
def get_data_info():
    # Extract dataset_name from the incoming JSON request
    dataset_name = request.json.get('dataset')

    # Check if dataset_name was provided
    if not dataset_name:
        return jsonify({'error': 'Dataset name is required'}), 400

    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT data FROM datasets WHERE name = %s;", (dataset_name,))
    result = cur.fetchone()

    # If dataset is not found, return an error response
    if result is None:
        cur.close()
        conn.close()
        return jsonify({'error': 'Dataset not found'}), 404

    dataset_json = result[0]
    cur.close()
    conn.close()

    # Extract content from JSON
    content = dataset_json.get('content', '')

    # Extract vehicle capacity (we assume it's the second number in the 'VEHICLE' section)
    vehicle_capacity = None
    vehicle_capacity_match = re.search(r'VEHICLE\nNUMBER\s+CAPACITY\s+(\d+)', content)
    if vehicle_capacity_match:
        vehicle_capacity = int(vehicle_capacity_match.group(1))

    # Extract number of vehicles (we assume it's the count of rows in the 'VEHICLE' section)
    num_vehicles = len(re.findall(r'\d+\s+\d+\s+\d+', content))  # Counts the rows under VEHICLE section

    # Return the extracted information
    return jsonify({
        'num_vehicles': num_vehicles,
        'vehicle_capacity': vehicle_capacity
    })    

@app.route('/optimize', methods=['POST'])
def optimize():
    # Extract request parameters
    dataset_name = request.json['dataset']
    time_precision_scaler = int(request.json['time_precision_scaler'])
    time_limit = int(request.json['time_limit'])
    method = request.json.get('method', 'or-tools')  # Default to 'or-tools' if not specified

    # Load data instance
    data = load_instance(dataset_name, time_precision_scaler)
    solver = Solver(data, time_precision_scaler)

    # Optimize based on the selected method
    if method == 'or-tools':
        solver.create_model()
        solver.solve_model({'time_limit': time_limit})
        routes, metadata = solver.get_routes()
        objective = solver.get_total_time()
    elif method == 'genetic':
        routes, objective = solver.genetic_algorithm()
        routes, metadata = solver.get_ga_solution()
    else:
        return jsonify({"error": f"Unknown method: {method}"}), 400

    # Prepare solution to send back
    solution = {
        "status": 1,
        "objective": objective,
        "routes": routes,
        "metadata": metadata,
        "total_time": solver.get_total_time(),
        "total_travel_time": solver.get_total_travel_time(),
        "num_vehicles": solver.get_num_vehicles()
    }

    return jsonify(solution)



if __name__ == '__main__':
    app.run(debug=True)
