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

    showLoading();
    clearGraphAndOutput();

    try {
        let response = await fetch('/optimize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataset, time_precision_scaler, time_limit })
        });

        if (!response.ok) {
            console.error('Failed to execute optimization');
            return;
        }

        let solution = await response.json();
        displayResults(solution);
        visualizeRoutes(solution.routes);
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

    if (solution.status === 1) {  // Assuming 1 indicates success
        outputDiv.innerHTML += `<p><strong>Objective Value:</strong> ${solution.objective}</p>`;

        solution.routes.forEach((route, index) => {
            let routeDetails = `<p><strong>Route for vehicle ${index + 1}:</strong></p>`;
            routeDetails += `<p class="route-hover" data-index="${index}">${route.join(' -> ')}</p>`;  // Make it clickable

            // Get metadata for the current route (time and load)
            const metadata = solution.metadata[index];  // Get corresponding metadata for this route

            // Display time and load from metadata
            routeDetails += `<p>Time of the route: ${metadata.time !== undefined ? metadata.time + ' minutes' : 'N/A'}</p>`;
            routeDetails += `<p>Load of vehicle: ${metadata.load !== undefined ? metadata.load : 'N/A'}</p>`;

            outputDiv.innerHTML += routeDetails;
        });

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

window.onload = loadDatasets;
