export type Route = [number, number][];

export function parseRoutes(data: string): Route[] {
    const lines = data.split('\n').map(line => line.trim()).filter(Boolean);
    return lines.map(line => {
        const coords = line.split(' ').map(Number);
        const routePoints: [number, number][] = [];
        for (let i = 0; i < coords.length; i += 2) {
            routePoints.push([coords[i], coords[i + 1]]);
        }
        return routePoints;
    });
}
