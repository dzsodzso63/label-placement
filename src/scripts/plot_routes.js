const fs = require('fs').promises;
const path = require('path');

async function parseRoutes(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        const lines = data.split('\n').map(line => line.trim()).filter(Boolean);

        return lines.map(line => {
            const coords = line.split(' ').map(Number);
            const routePoints = [];

            for (let i = 0; i < coords.length; i += 2) {
                routePoints.push([coords[i], coords[i + 1]]);
            }

            return routePoints;
        });
    } catch (error) {
        console.error('Error parsing routes:', error);
        throw error;
    }
}

async function parseLabels(filePath, zoom) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        const lines = data.split('\n').map(line => line.trim()).filter(Boolean);

        return lines.map(line => {
            const [x, y, orient] = line.split(' ');
            return getLabel(parseFloat(x), parseFloat(y), orient, 100 * zoom, 50 * zoom);
        });
    } catch (error) {
        console.error('Error parsing labels:', error);
        throw error;
    }
}

function getLabel(x, y, orient, width = 100, height = 50) {
    switch (orient) {
        case 'bottom-right':
            return [[x, y], [x + width, y], [x + width, y + height], [x, y + height], [x, y]];
        case 'bottom-left':
            return [[x, y], [x, y + height], [x - width, y + height], [x - width, y], [x, y]];
        case 'top-left':
            return [[x, y], [x - width, y], [x - width, y - height], [x, y - height], [x, y]];
        case 'top-right':
            return [[x, y], [x, y - height], [x + width, y - height], [x + width, y], [x, y]];
        default:
            throw new Error(`Invalid label orientation: ${orient}`);
    }
}

function createSVG(routes, labels, zoomLevel) {
    // Calculate bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    routes.forEach(route => {
        route.forEach(([x, y]) => {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        });
    });

    labels.forEach(label => {
        label.forEach(([x, y]) => {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        });
    });

    // Add margins
    const margin = Math.max(0.05, (zoomLevel - 1) / 2);
    const width = maxX - minX;
    const height = maxY - minY;
    minX -= width * margin;
    maxX += width * margin;
    minY -= height * margin;
    maxY += height * margin;

    // Create SVG content
    const svgWidth = 800;
    const svgHeight = 600;

    // Scale coordinates to fit SVG dimensions
    const scaleX = svgWidth / (maxX - minX);
    const scaleY = svgHeight / (maxY - minY);

    const transformPoint = (x, y) => [
        (x - minX) * scaleX,
        svgHeight - ((y - minY) * scaleY) // Invert Y axis
    ];

    let svg = `<svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">
    <style>
        .route { stroke: blue; stroke-width: 2; fill: none; }
        .label { stroke: black; stroke-width: 1; fill: none; }
    </style>
    <text x="10" y="30" font-family="Arial" font-size="16">Results at zoom level ${zoomLevel}</text>`;

    // Add routes
    routes.forEach(route => {
        const points = route.map(([x, y]) => transformPoint(x, y))
            .map(([x, y]) => `${x},${y}`).join(' ');
        svg += `<polyline points="${points}" class="route" />`;
    });

    // Add labels
    labels.forEach(label => {
        const points = label.map(([x, y]) => transformPoint(x, y))
            .map(([x, y]) => `${x},${y}`).join(' ');
        svg += `<polyline points="${points}" class="label" />`;
    });

    svg += '</svg>';
    return svg;
}

async function displayResults(routesPath, labelsPath, zoomLevels) {
    try {
        for (const zoomLevel of zoomLevels) {
            const routes = await parseRoutes(routesPath);
            const labels = await parseLabels(labelsPath, zoomLevel);

            const svg = createSVG(routes, labels, zoomLevel);
            const outputPath = path.join(
                path.dirname(routesPath),
                `output_zoom_${zoomLevel}.svg`
            );

            await fs.writeFile(outputPath, svg);
            console.log(`Created visualization for zoom level ${zoomLevel} at ${outputPath}`);
        }
    } catch (error) {
        console.error('Error displaying results:', error);
        throw error;
    }
}

// Command line argument parsing
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length !== 2) {
        console.error('Usage: node plot_routes.js routes.txt labels.txt');
        process.exit(1);
    }

    const [routesPath, labelsPath] = args;
    displayResults(routesPath, labelsPath, [1, 2, 4]).catch(error => {
        console.error('Error:', error);
        process.exit(1);
    });
}

module.exports = {
    parseRoutes,
    parseLabels,
    getLabel,
    createSVG,
    displayResults
};
