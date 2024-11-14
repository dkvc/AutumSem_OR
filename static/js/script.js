// Load datasets from the server
async function loadDatasets() {
    let response = await fetch('/load_datasets');
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
    let dataInfo = await response.json();
    document.getElementById('output').innerText = `Vehicles: ${dataInfo.num_vehicles}, Capacity: ${dataInfo.vehicle_capacity}`;
}

async function executeOptimization() {
    let dataset = document.getElementById('dataset').value;
    let time_precision_scaler = document.getElementById('time_precision_scaler').value;
    let time_limit = document.getElementById('time_limit').value;

    // Show loading indicator and clear previous graph content
    showLoading();
    clearGraphAndOutput();

    try {
        let response = await fetch('/optimize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataset, time_precision_scaler, time_limit })
        });

        let solution = await response.json();
        console.log("Received solution:", solution);

        // Update graph and output with new solution data
        visualizeRoutes(solution.routes);
        displayResults(solution);
    } catch (error) {
        console.error("Error during optimization execution:", error);
    } finally {
        // Hide loading indicator after updating content
        hideLoading();
    }
}


function displayResults(solution) {
    const outputDiv = document.getElementById('output');
    outputDiv.innerHTML = ''; // Clear previous content

    // Display summary information
    outputDiv.innerHTML += `<h3>Optimization Results</h3>`;
    outputDiv.innerHTML += `<p><strong>Number of Vehicles Used:</strong> ${solution.num_vehicles}</p>`;
    outputDiv.innerHTML += `<p><strong>Total Time:</strong> ${solution.total_time} minutes</p>`;

    // Display each route with hover events for highlighting
    outputDiv.innerHTML += `<h4>Routes:</h4>`;
    solution.routes.forEach((route, index) => {
        const routeID = `route-${index}`;
        outputDiv.innerHTML += `
            <div class="route-summary" 
                 id="${routeID}" 
                 onmouseover="highlightRoute(${index})" 
                 onmouseout="resetHighlight()">
                <p><strong>Vehicle ${index + 1}:</strong> ${route.join(' -> ')}</p>
            </div>
        `;
    });
}

function visualizeRoutes(routes) {
    const svgContainer = d3.select("#graph-canvas");
    svgContainer.selectAll("*").remove();  // Clear previous routes

    const width = svgContainer.node().getBoundingClientRect().width;
    const height = svgContainer.node().getBoundingClientRect().height;

    const mainGroup = svgContainer.append("g");
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

    // Dummy coordinates for visualization purposes
    const nodeCoords = routes.flat().reduce((coords, node, index) => {
        coords[node] = { x: Math.random() * width, y: Math.random() * height };
        return coords;
    }, {});

    // Draw each route as a group and store each for easy manipulation
    const routeGroups = routes.map((route, i) => {
        const group = mainGroup.append("g").attr("class", `route-group vehicle-${i}`);
        
        group.selectAll("path")
            .data(route.slice(1))  // Exclude the starting depot for lines
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
            .attr("opacity", 1);  // Initially, all routes are fully visible

        return group;
    });

    // Draw nodes as circles with labels
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

    // Functions to highlight and reset route opacity based on sidebar interaction
    window.highlightRoute = function(routeIndex) {
        routeGroups.forEach((group, i) => {
            group.selectAll("path").attr("opacity", i === routeIndex ? 1 : 0.1);
        });
    };

    window.resetHighlight = function() {
        routeGroups.forEach(group => {
            group.selectAll("path").attr("opacity", 1);
        });
    };
}

function showLoading() {
    document.getElementById('loading-indicator').style.display = 'block';
}

function hideLoading() {
    document.getElementById('loading-indicator').style.display = 'none';
}

function clearGraphAndOutput() {
    // Clear the graph canvas (remove all elements inside the SVG)
    d3.select("#graph-canvas").selectAll("*").remove();

    // Clear output text
    document.getElementById('output').innerHTML = '';
}


// Load datasets when the page loads
window.onload = loadDatasets;
