from ortools.constraint_solver import pywrapcp, routing_enums_pb2

from models.data_model import ProblemInstance
from models.solver_model import SolverSetting

import random

class Solver:
    """
    Solver object that takes a problem instance as input, creates and solves a capacitated vehicle routing problem with time
    windows. Objective of the optimization are hierarchical: 1) Minimize number of vehicles 2) Minimize total distance.
    Distance is Euclidean, and the value of travel time is equal to the value of distance between two nodes.

    Parameters
    ----------
    data : ProblemInstance
        Problem data according to ProblemInstance model.
    time_precision_scaler : int
        Variable defining the precision of travel and service times, e.g. 100 means precision of two decimals.
    """

    def __init__(self, data: ProblemInstance, time_precision_scaler: int):
        self.data = data
        self.time_precision_scaler = time_precision_scaler
        self.manager = None
        self.routing = None
        self.solution = None
        self.best_solution = None # GA soln

    # -------------------------------- #

    # Split a sequence of nodes into valid routes
    def split_routes(self, nodes):
        routes = []
        route = []
        load = 0
        for node in nodes:
            demand = self.data["demands"][node]
            if load + demand > self.data["vehicle_capacities"][0]:
                routes.append(route + [self.data["depot"]])
                route = [self.data["depot"]]
                load = 0
            route.append(node)
            load += demand
        routes.append(route + [self.data["depot"]])  # Add depot to the last route
        return routes

    def genetic_algorithm(self, population_size=50, generations=100, mutation_rate=0.1):
        """
        Solve CVRP using Genetic Algorithm.

        Parameters:
        - population_size: Number of solutions in each generation.
        - generations: Number of generations to evolve.
        - mutation_rate: Probability of mutation for a route.

        Returns:
        - Best solution found with its objective value.
        """

        # Helper function to calculate total distance for a route
        def calculate_distance(route):
            distance = 0
            for i in range(len(route) - 1):
                distance += self.data["time_matrix"][route[i]][route[i + 1]]
            return distance

        # Fitness function: minimize distance + penalty for over-capacity
        def fitness(individual):
            total_distance = 0
            for route in individual:
                if len(route) > 1:  # Ignore empty routes
                    route_distance = calculate_distance(route)
                    load = sum(self.data["demands"][node] for node in route)
                    capacity_penalty = max(0, load - self.data["vehicle_capacities"][0]) * 1000
                    total_distance += route_distance + capacity_penalty
            return total_distance

        # Initialize population
        def initialize_population():
            population = []
            for _ in range(population_size):
                nodes = list(range(len(self.data["time_matrix"])))
                random.shuffle(nodes)
                individual = self.split_routes(nodes)
                population.append(individual)
            return population

        # Selection: Tournament Selection
        def tournament_selection(population):
            tournament = random.sample(population, 5)
            return min(tournament, key=fitness)

        # Crossover: Order Crossover (OX)
        def crossover(parent1, parent2):
            nodes1 = [node for route in parent1 for node in route if node != self.data["depot"]]
            nodes2 = [node for route in parent2 for node in route if node != self.data["depot"]]

            start, end = sorted(random.sample(range(len(nodes1)), 2))
            offspring = nodes1[start:end + 1]
            for node in nodes2:
                if node not in offspring:
                    offspring.append(node)
            return self.split_routes(offspring)

        def mutate(individual):
            for route in individual:
                if len(route) > 2:  # Ensure there's at least one node other than depot
                    if len(route) > 3:  # Only perform mutation if there are enough nodes to swap
                        i, j = random.sample(range(1, len(route) - 1), 2)  # Avoid depot
                        route[i], route[j] = route[j], route[i]

        # Genetic Algorithm Loop
        population = initialize_population()
        best_individual = min(population, key=fitness)

        for generation in range(generations):
            new_population = []
            for _ in range(population_size):
                parent1 = tournament_selection(population)
                parent2 = tournament_selection(population)
                offspring = crossover(parent1, parent2)
                mutate(offspring)
                new_population.append(offspring)
            population = new_population
            current_best = min(population, key=fitness)
            if fitness(current_best) < fitness(best_individual):
                best_individual = current_best

        self.best_solution = best_individual
        return best_individual, fitness(best_individual)

    def get_ga_solution(self):
        """Return the GA solution in the required format."""
        routes = self.best_solution
        metadata = []
        for route in routes:
            load = sum(self.data["demands"][node] for node in route if node != self.data["depot"])
            time = sum(self.data["time_matrix"][route[i]][route[i + 1]] for i in range(len(route) - 1))
            metadata.append({"load": load, "time": time / self.time_precision_scaler})
        return routes, metadata

    # ------------------------- #
    def create_model(self):
        """
        Create vehicle routing model for Solomon instance.
        """
        # Create the routing index manager, i.e. number of nodes, vehicles and depot
        self.manager = pywrapcp.RoutingIndexManager(
            len(self.data["time_matrix"]), self.data["num_vehicles"], self.data["depot"]
        )

        # Create routing model
        self.routing = pywrapcp.RoutingModel(self.manager)

        # Create and register a transit callback
        def time_callback(from_index, to_index):
            """Returns the travel time between the two nodes."""
            # Convert from solver internal routing variable Index to time matrix NodeIndex.
            from_node = self.manager.IndexToNode(from_index)
            to_node = self.manager.IndexToNode(to_index)
            return self.data["time_matrix"][from_node][to_node]

        transit_callback_index = self.routing.RegisterTransitCallback(time_callback)

        # Define cost of each arc and fixed vehicle cost
        self.routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)
        # Make sure to first minimize number of vehicles
        self.routing.SetFixedCostOfAllVehicles(100000)

        # Create and register demand callback
        def demand_callback(from_index):
            """Returns the demand of the node."""
            # Convert from routing variable Index to demands NodeIndex.
            from_node = self.manager.IndexToNode(from_index)
            return self.data["demands"][from_node]

        demand_callback_index = self.routing.RegisterUnaryTransitCallback(demand_callback)

        # Register vehicle capacitites
        self.routing.AddDimensionWithVehicleCapacity(
            demand_callback_index,
            0,  # null capacity slack
            self.data["vehicle_capacities"],  # vehicle maximum capacities
            True,  # start cumul to zero
            "Capacity",
        )

        # Add Time Windows constraint.
        self.routing.AddDimension(
            transit_callback_index,
            10 ** 10,  # allow waiting time at nodes
            10 ** 10,  # maximum time per vehicle route
            False,  # Don't force start cumul to zero, i.e. vehicles can start after time 0 from depot
            "Time",
        )

        time_dimension = self.routing.GetDimensionOrDie("Time")

        # Add time window constraints for each location except depot.
        for location_idx, time_window in enumerate(self.data["time_windows"]):
            if location_idx == self.data["depot"]:
                continue
            index = self.manager.NodeToIndex(location_idx)
            time_dimension.CumulVar(index).SetRange(time_window[0], time_window[1])

        # Add time window constraints for each vehicle start node.
        depot_idx = self.data["depot"]
        for vehicle_id in range(self.data["num_vehicles"]):
            index = self.routing.Start(vehicle_id)
            time_dimension.CumulVar(index).SetRange(
                self.data["time_windows"][depot_idx][0],
                self.data["time_windows"][depot_idx][1],
            )
        # The solution finalizer is called each time a solution is found during search
        # and tries to optimize (min/max) variables values
        for i in range(self.data["num_vehicles"]):
            self.routing.AddVariableMinimizedByFinalizer(
                time_dimension.CumulVar(self.routing.Start(i))
            )
            self.routing.AddVariableMinimizedByFinalizer(
                time_dimension.CumulVar(self.routing.End(i))
            )

    def solve_model(self, settings: SolverSetting):
        """
        Solver model with solver settings.

        Parameters
        ----------
        settings : SolverSetting
            Solver settings according to SolverSetting model.
        """

        # Setting first solution heuristic.
        search_parameters = pywrapcp.DefaultRoutingSearchParameters()
        search_parameters.first_solution_strategy = (
            routing_enums_pb2.FirstSolutionStrategy.PARALLEL_CHEAPEST_INSERTION
        )
        search_parameters.local_search_metaheuristic = (
            routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
        )
        search_parameters.time_limit.seconds = settings["time_limit"]

        # Solve the problem.
        self.solution = self.routing.SolveWithParameters(search_parameters)

    def print_solution(self):
        """
        Print solution to console.
        """
        print(f"Solution status: {self.routing.status()}\n")
        if self.routing.status() == 1:
            print(
                f"Objective: {self.solution.ObjectiveValue()/self.time_precision_scaler}\n"
            )
            time_dimension = self.routing.GetDimensionOrDie("Time")
            cap_dimension = self.routing.GetDimensionOrDie("Capacity")
            total_time = 0
            total_vehicles = 0
            for vehicle_id in range(self.data["num_vehicles"]):
                index = self.routing.Start(vehicle_id)
                plan_output = f"Route for vehicle {vehicle_id}:\n"
                while not self.routing.IsEnd(index):
                    time_var = time_dimension.CumulVar(index)
                    cap_var = cap_dimension.CumulVar(index)
                    plan_output += f"{self.manager.IndexToNode(index)} -> "
                    index = self.solution.Value(self.routing.NextVar(index))
                time_var = time_dimension.CumulVar(index)
                plan_output += f"{self.manager.IndexToNode(index)}\n"
                plan_output += f"Time of the route: {self.solution.Min(time_var)/self.time_precision_scaler}min\n"
                plan_output += f"Load of vehicle: {self.solution.Min(cap_var)}\n"
                print(plan_output)
                total_time += self.solution.Min(time_var) / self.time_precision_scaler
                if self.solution.Min(time_var) > 0:
                    total_vehicles += 1
            total_travel_time = (
                total_time
                - sum(self.data["service_times"]) / self.time_precision_scaler
            )
            print(f"Total time of all routes: {total_time}min")
            print(f"Total travel time of all routes: {total_travel_time}min")
            print(f"Total vehicles used: {total_vehicles}")

    def optimize_stepwise(self, settings):
        """Optimize the model and yield intermediate solutions."""
        # Set up search parameters
        search_parameters = pywrapcp.DefaultRoutingSearchParameters()
        search_parameters.time_limit.seconds = settings['time_limit']
        # Optionally set search parameters for stepwise optimization

        # Perform optimization, yielding intermediate solutions if available
        self.solution = self.routing.SolveWithParameters(search_parameters)
        if self.solution:
            while not self.routing.IsEnd(self.solution.Value(self.routing.Start(0))):
                # Yield partial solutions here if your setup allows
                yield self.get_routes()  # Assume get_routes returns current route information

            yield self.get_routes()  # Final solution

    def get_routes(self):
        """Retrieve routes from the solution along with associated metadata like time and load."""
        if not self.solution:
            return [], []  # Return empty routes and metadata if no solution exists

        routes = []
        metadata = []  # Store metadata for each route, e.g., time and load
        time_dimension = self.routing.GetDimensionOrDie("Time")
        cap_dimension = self.routing.GetDimensionOrDie("Capacity")

        for vehicle_id in range(self.data['num_vehicles']):
            index = self.routing.Start(vehicle_id)
            route = []
            total_load = 0
            route_time = 0

            while not self.routing.IsEnd(index):
                node_index = self.manager.IndexToNode(index)
                route.append(node_index)

                # Retrieve cumulative time and load
                time_var = time_dimension.CumulVar(index)
                cap_var = cap_dimension.CumulVar(index)
                total_load = self.solution.Min(cap_var)
                route_time = self.solution.Min(time_var) / self.time_precision_scaler

                index = self.solution.Value(self.routing.NextVar(index))
            
            # Add depot as the final node
            route.append(self.manager.IndexToNode(index))

            # Append route and associated metadata
            routes.append(route)
            metadata.append({
                "load": total_load,
                "time": route_time
            })

        return routes, metadata


    def get_total_time(self):
        """Calculate the total time for all routes."""
        if not self.solution:
            return 0

        time_dimension = self.routing.GetDimensionOrDie("Time")
        total_time = 0
        for vehicle_id in range(self.data['num_vehicles']):
            index = self.routing.End(vehicle_id)
            total_time += self.solution.Min(time_dimension.CumulVar(index))

        return total_time / self.time_precision_scaler

    def get_total_travel_time(self):
        """Calculate total travel time by excluding service times."""
        if not self.solution:
            return 0

        time_dimension = self.routing.GetDimensionOrDie("Time")
        total_time = 0
        for vehicle_id in range(self.data['num_vehicles']):
            index = self.routing.End(vehicle_id)
            total_time += self.solution.Min(time_dimension.CumulVar(index))

        # Subtract the total service times
        total_travel_time = total_time - sum(self.data["service_times"]) / self.time_precision_scaler
        return total_travel_time

    def get_vehicle_load(self, vehicle_id):
        """Retrieve the load for a specific vehicle."""
        if not self.solution:
            return 0

        cap_dimension = self.routing.GetDimensionOrDie("Capacity")
        index = self.routing.End(vehicle_id)
        return self.solution.Min(cap_dimension.CumulVar(index))

    def get_num_vehicles(self):
        """Count the number of vehicles used in the solution."""
        if not self.solution:
            return 0

        num_vehicles_used = 0
        for vehicle_id in range(self.data['num_vehicles']):
            if not self.routing.IsEnd(self.routing.Start(vehicle_id)):
                num_vehicles_used += 1

        return num_vehicles_used