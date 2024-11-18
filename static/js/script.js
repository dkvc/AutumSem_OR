let chartInstance = null;
let pieChartInstance = null;

// Load datasets from the server
async function loadDatasets() {
    let response = await fetch('/load_datasets');
    if (!response.ok) {
        console.error('Failed to load datasets');
        return;
    }
    let datasets = await response.json();
    let datasetSelect = document.getElementById('dataset');
    datasets.forEach(dataset => {
        let option = document.createElement('option');
        option.value = dataset;
        option.text = dataset;
        datasetSelect.add(option);
    });
}

// Fetch dataset-specific information (vehicle capacity, etc.)
async function loadDataInfo() {
    let dataset = document.getElementById('dataset').value;
    let response = await fetch('/get_data_info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset })
    });

    if (!response.ok) {
        console.error('Failed to load dataset information');
        return;
    }

    let dataInfo = await response.json();
    document.getElementById('output').innerText = `Vehicles: ${dataInfo.num_vehicles}, Capacity: ${dataInfo.vehicle_capacity}`;
}

async function executeOptimization() {
    let dataset = document.getElementById('dataset').value;
    let time_precision_scaler = document.getElementById('time_precision_scaler').value;
    let time_limit = document.getElementById('time_limit').value;
    let method = document.getElementById("method").value;

    showLoading();
    clearGraphAndOutput();

    // Hide the analysis button until the optimization is complete
    document.getElementById('statsButton').style.display = 'none';

    try {
        let response = await fetch('/optimize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataset, time_precision_scaler, time_limit, method })
        });

        if (!response.ok) {
            console.error('Failed to execute optimization');
            return;
        }

        let solution = await response.json();
        displayResults(solution);
        visualizeRoutes(solution.routes);

        // Show the analysis button after the optimization is complete
        document.getElementById('statsButton').style.display = 'block';
    } catch (error) {
        console.error("Error during optimization execution:", error);
    } finally {
        hideLoading();
    }
}

// Global highlight functions
function highlightRoute(routeIndex) {
    routeGroups.forEach((group, i) => {
        group.selectAll("path").attr("opacity", i === routeIndex ? 1 : 0.1);
    });
}

function resetHighlight() {
    routeGroups.forEach(group => {
        group.selectAll("path").attr("opacity", 1);
    });
}

function displayResults(solution) {
    const outputDiv = document.getElementById('output');
    outputDiv.innerHTML = '';  // Clear previous content

    outputDiv.innerHTML += `<h3>Optimization Results</h3>`;
    outputDiv.innerHTML += `<p><strong>Solution Status:</strong> ${solution.status}</p>`;

    // Initialize routeTimes and vehicleLoads
    const routeTimes = [];
    const vehicleLoads = [];

    if (solution.status === 1) {
        outputDiv.innerHTML += `<p><strong>Objective Value:</strong> ${solution.objective}</p>`;

        solution.routes.forEach((route, index) => {
            let routeDetails = `<p><strong>Route for vehicle ${index + 1}:</strong></p>`;
            routeDetails += `<p class="route-hover" data-index="${index}">${route.join(' -> ')}</p>`;

            // Get metadata for the current route (time and load)
            const metadata = solution.metadata[index];

            // Display time and load from metadata
            routeDetails += `<p>Time of the route: ${metadata.time !== undefined ? metadata.time + ' minutes' : 'N/A'}</p>`;
            routeDetails += `<p>Load of vehicle: ${metadata.load !== undefined ? metadata.load : 'N/A'}</p>`;

            // Push values to routeTimes and vehicleLoads
            if (metadata.time !== undefined) routeTimes.push(metadata.time);
            if (metadata.load !== undefined) vehicleLoads.push(metadata.load);

            outputDiv.innerHTML += routeDetails;
        });

        // Now that we have routeTimes and vehicleLoads, trigger graph generation
        generateStatisticalGraphs(routeTimes, vehicleLoads);

        outputDiv.innerHTML += `<p><strong>Total Time of All Routes:</strong> ${solution.total_time !== undefined ? solution.total_time + ' minutes' : 'N/A'}</p>`;
        outputDiv.innerHTML += `<p><strong>Total Travel Time of All Routes:</strong> ${solution.total_travel_time !== undefined ? solution.total_travel_time + ' minutes' : 'N/A'}</p>`;
        outputDiv.innerHTML += `<p><strong>Total Vehicles Used:</strong> ${solution.num_vehicles !== undefined ? solution.num_vehicles : 'N/A'}</p>`;
    } else {
        outputDiv.innerHTML += `<p>No valid solution found.</p>`;
    }

    // Add hover effect to output route items
    const routeHoverElements = document.querySelectorAll('.route-hover');
    routeHoverElements.forEach(item => {
        item.addEventListener('mouseover', function() {
            const routeIndex = this.getAttribute('data-index');
            highlightRoute(parseInt(routeIndex));
        });
        item.addEventListener('mouseout', resetHighlight);
    });
}


function visualizeRoutes(routes) {
    console.log("Routes received in visualizeRoutes:", routes);
    const svgContainer = d3.select("#graph-canvas");
    svgContainer.selectAll("*").remove();

    const width = svgContainer.node().getBoundingClientRect().width;
    const height = svgContainer.node().getBoundingClientRect().height;
    const mainGroup = svgContainer.append("g");
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

    // Define grid layout with a fixed number of rows and columns
    const gridSpacing = 100;  // Spacing between nodes
    const numColumns = Math.floor(width / gridSpacing);
    const numRows = Math.ceil(Object.keys(routes).length / numColumns);

    // Create a map of node positions
    const nodeCoords = {};
    let row = 0;
    let col = 0;
    Object.keys(routes.flat()).forEach((node, index) => {
        nodeCoords[node] = { x: col * gridSpacing, y: row * gridSpacing };
        col++;
        if (col >= numColumns) {
            col = 0;
            row++;
        }
    });

    // Continue with the graph visualization logic as before
    routeGroups = routes.map((route, i) => {
        const group = mainGroup.append("g").attr("class", `route-group vehicle-${i}`);
        group.selectAll("path")
            .data(route.slice(1))
            .enter()
            .append("path")
            .attr("d", (d, j) => {
                const startX = nodeCoords[route[j]].x;
                const startY = nodeCoords[route[j]].y;
                const endX = nodeCoords[d].x;
                const endY = nodeCoords[d].y;
                const midX = (startX + endX) / 2 + (i % 2 === 0 ? 10 : -10);
                const midY = (startY + endY) / 2 + (i % 2 === 0 ? -10 : 10);
                return `M ${startX},${startY} Q ${midX},${midY} ${endX},${endY}`;
            })
            .attr("stroke", colorScale(i))
            .attr("stroke-width", 2)
            .attr("fill", "none")
            .attr("opacity", 1);

        return group;
    });

    mainGroup.selectAll("circle.node")
        .data(Object.keys(nodeCoords))
        .enter()
        .append("circle")
        .attr("class", "node")
        .attr("cx", d => nodeCoords[d].x)
        .attr("cy", d => nodeCoords[d].y)
        .attr("r", 6)
        .attr("fill", "#ffffff")
        .attr("stroke", "#333333")
        .attr("stroke-width", 1);

    mainGroup.selectAll("text.label")
        .data(Object.keys(nodeCoords))
        .enter()
        .append("text")
        .attr("class", "label")
        .attr("x", d => nodeCoords[d].x + 8)
        .attr("y", d => nodeCoords[d].y + 4)
        .text(d => d)
        .style("font-size", "10px")
        .style("fill", "#ffffff");

    // Add zoom behavior to the SVG
    const zoom = d3.zoom()
        .scaleExtent([0.5, 5])  // Min and Max zoom levels
        .on("zoom", function(event) {
            mainGroup.attr("transform", event.transform);
        });

    // Apply the zoom behavior to the SVG container
    svgContainer.call(zoom);
}

function showLoading() {
    document.getElementById('loading-indicator').style.display = 'block';
}

function hideLoading() {
    document.getElementById('loading-indicator').style.display = 'none';
}

function clearGraphAndOutput() {
    d3.select("#graph-canvas").selectAll("*").remove();
    document.getElementById('output').innerHTML = '';
}

function generateStatisticalGraphs(routeTimes, vehicleLoads) {
    const canvas = document.getElementById('statsCanvas');
    const ctx = canvas.getContext('2d');

    // If there's already a chart, destroy it
    if (chartInstance) {
        chartInstance.destroy();
    }

    // Prepare the data for the Bar chart (Route Times and Vehicle Loads)
    const data = {
        labels: routeTimes.map((_, index) => `Route ${index + 1}`),  // Use route index for labels
        datasets: [
            {
                label: 'Route Times (min)',
                data: routeTimes, // Route times from the optimization result
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1
            },
            {
                label: 'Vehicle Loads',
                data: vehicleLoads, // Vehicle loads from the optimization result
                backgroundColor: 'rgba(153, 102, 255, 0.2)',
                borderColor: 'rgba(153, 102, 255, 1)',
                borderWidth: 1
            }
        ]
    };

    // Create the Bar chart using Chart.js
    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: data,
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });

    // Create Pie chart for vehicle loads
    const pieChartCanvas = document.getElementById('pieChartCanvas');
    const pieCtx = pieChartCanvas.getContext('2d');

    if (pieChartInstance) {
        pieChartInstance.destroy();  // Destroy the previous pie chart if exists
    }

    // Prepare data for Pie chart (Vehicle Loads)
    const pieData = {
        labels: routeTimes.map((_, index) => `Route ${index + 1}`),  // Labels based on routes
        datasets: [
            {
                label: 'Vehicle Loads',
                data: vehicleLoads,  // Vehicle loads from the optimization result
                backgroundColor: ['rgba(153, 102, 255, 0.7)', 'rgba(75, 192, 192, 0.7)', 'rgba(255, 159, 64, 0.7)', 'rgba(54, 162, 235, 0.7)', 'rgba(255, 99, 132, 0.7)'],
                borderColor: ['rgba(153, 102, 255, 1)', 'rgba(75, 192, 192, 1)', 'rgba(255, 159, 64, 1)', 'rgba(54, 162, 235, 1)', 'rgba(255, 99, 132, 1)'],
                borderWidth: 1
            }
        ]
    };

    // Create the Pie chart using Chart.js
    pieChartInstance = new Chart(pieCtx, {
        type: 'pie',
        data: pieData,
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top'
                },
                tooltip: {
                    callbacks: {
                        label: function(tooltipItem) {
                            return `Load: ${tooltipItem.raw}`; // Display load value in the tooltip
                        }
                    }
                }
            }
        }
    });
}

let routeTimes = [];
let vehicleLoads = [];

window.onload = function() {
    // Ensure routeTimes and vehicleLoads are initialized
    routeTimes = routeTimes || [];
    vehicleLoads = vehicleLoads || [];
    loadDatasets();

    const methodSelect = document.getElementById('method');
    const timePrecisionScaler = document.getElementById('time_precision_scaler');
    const timeLimit = document.getElementById('time_limit');

    const timePLabel = document.getElementById('time_precision_scaler_label');
    const timeLLabel = document.getElementById('time_limit_label');

    function toggleTimeFields() {
        if (methodSelect.value === 'or-tools') {
            timePrecisionScaler.style.display = 'inline';
            timeLimit.style.display = 'inline';
            
            timePLabel.style.display = 'inline';
            timeLLabel.style.display = 'inline';
        } else {
            timePrecisionScaler.style.display = 'none';
            timeLimit.style.display = 'none';

            timePLabel.style.display = 'none';
            timeLLabel.style.display = 'none';
        }

        clearGraphAndOutput();
        document.getElementById('statsButton').style.display = 'none';
    }

    methodSelect.addEventListener('change', toggleTimeFields);
    toggleTimeFields();

    document.getElementById('statsButton').addEventListener('click', function() {
        document.getElementById('statsModal').style.display = 'block';
        generateStatisticalGraphs(routeTimes, vehicleLoads);
    });

    document.getElementById('closeStats').addEventListener('click', function() {
        document.getElementById('statsModal').style.display = 'none';
    });
};
