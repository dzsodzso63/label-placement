import { parseRoutes } from "../utils/routes";

type Label = [number, number][];

interface RouteVisualizationProps {
    routes: string;
    labels: string;
    zoomLevel: number;
}

function getLabel(x: number, y: number, orient: string, width: number = 100, height: number = 50): Label {
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


function parseLabels(data: string, zoom: number): Label[] {
    const lines = data.split('\n').map(line => line.trim()).filter(Boolean);
    return lines.map(line => {
        const [x, y, orient] = line.split(' ');
        return getLabel(parseFloat(x), parseFloat(y), orient, 100 * zoom, 50 * zoom);
    });
}

export function RouteVisualization({ routes, labels, zoomLevel }: RouteVisualizationProps) {
    const parsedRoutes = parseRoutes(routes);
    const parsedLabels = parseLabels(labels, zoomLevel);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    parsedRoutes.forEach(route => {
        route.forEach(([x, y]) => {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        });
    });

    parsedLabels.forEach(label => {
        label.forEach(([x, y]) => {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        });
    });

    const margin = Math.max(0.05, (zoomLevel - 1) / 2);
    const width = maxX - minX;
    const height = maxY - minY;
    minX -= width * margin;
    maxX += width * margin;
    minY -= height * margin;
    maxY += height * margin;

    const svgWidth = 800;
    const svgHeight = 600;
    const scaleX = svgWidth / (maxX - minX);
    const scaleY = svgHeight / (maxY - minY);

    const transformPoint = (x: number, y: number): [number, number] => [
        (x - minX) * scaleX,
        ((y - minY) * scaleY)
    ];

    return (
        <svg width={svgWidth} height={svgHeight} xmlns="http://www.w3.org/2000/svg">
            <style>
                {`.route { stroke: blue; stroke-width: 2; fill: none; }
        .label { stroke: black; stroke-width: 1; fill: none; }`}
            </style>
            <text x="10" y="30" fontFamily="Arial" fontSize="16">Results at zoom level {zoomLevel}</text>
            {parsedRoutes.map((route, index) => {
                const points = route.map(([x, y]) => transformPoint(x, y))
                    .map(([x, y]) => `${x},${y}`).join(' ');
                return <polyline key={`route-${index}`} points={points} className="route" />;
            })}
            {parsedLabels.map((label, index) => {
                const points = label.map(([x, y]) => transformPoint(x, y))
                    .map(([x, y]) => `${x},${y}`).join(' ');
                return <polyline key={`label-${index}`} points={points} className="label" />;
            })}
        </svg>
    );
}

export default RouteVisualization;
