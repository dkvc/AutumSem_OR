from flask import Flask, render_template, request, jsonify
from solver.base_solver import Solver
from util.instance_loader import load_instance
import os

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

# Load available datasets from the data directory
@app.route('/load_datasets')
def load_datasets():
    datasets = [f for f in os.listdir('data') if f.endswith('.txt')]
    return jsonify(datasets)

# Get initial data information (like vehicle capacity) from the selected dataset
@app.route('/get_data_info', methods=['POST'])
def get_data_info():
    dataset_name = request.json['dataset']
    path = f'data/{dataset_name}'
    time_precision_scaler = 100
    data = load_instance(path, time_precision_scaler)
    return jsonify({
        'num_vehicles': data['num_vehicles'],
        'vehicle_capacity': data['vehicle_capacities'][0]
    })

# Run optimization and provide updates for each step
@app.route('/optimize', methods=['POST'])
def optimize():
    dataset_name = request.json['dataset']
    time_precision_scaler = int(request.json['time_precision_scaler'])
    time_limit = int(request.json['time_limit'])

    path = f'data/{dataset_name}'
    data = load_instance(path, time_precision_scaler)
    solver = Solver(data, time_precision_scaler)
    solver.create_model()

    # Run the optimization once
    settings = {'time_limit': time_limit}
    solver.solve_model(settings)

    # Get final route information (adjust these methods based on your Solver implementation)
    solution = {
        "routes": solver.get_routes(),  # Make sure get_routes is implemented in Solver
        "total_time": solver.get_total_time(),  # Method to get total time
        "num_vehicles": solver.get_num_vehicles()  # Method to get number of vehicles used
    }
    return jsonify(solution)


if __name__ == '__main__':
    app.run(debug=True)
