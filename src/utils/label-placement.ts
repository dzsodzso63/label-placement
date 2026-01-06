import { parseRoutes, type Route } from "./routes";

export const LABEL_DIRECTIONS = ['bottom-right', 'bottom-left', 'top-left', 'top-right'] as const;
export const LABEL_WIDTH = 100;
export const LABEL_HEIGHT = 50;

const WEIGHT_MINIMUM_DISTANCE = 2;
const WEIGHT_SUM_DISTANCES = 0.05;
const WEIGHT_DISTANCE_FROM_ROUTES = 5;
const WEIGHT_DISTANCE_FROM_CENTER = 100;
const WEIGHT_BEST_LABEL_DIRECTION = 100;
const WEIGHT_OVERLAP_WITH_CREATED_LABELS = 10;
const WEIGHT_DISTANCE_FROM_LABELS = 6;

export function generateLabels(routesInput: string): string {
    const routes = parseRoutes(routesInput);
    const rankedRoutes = rankRoutes(routes);
    console.log(rankedRoutes);
    const labels = rankedRoutes.map(route => {
        return {
            x: route.labelPoint.x,
            y: route.labelPoint.y,
            orient: route.labelPoint.bestLabelDirection,
        };
    });
    return labels.map(label => `${label.x} ${label.y} ${label.orient}`).join('\n');
}

function rankRoutes(routes: Route[]) {
    const labels: { xTopLeft: number, yTopLeft: number, xBottomRight: number, yBottomRight: number }[] = [];
    return routes.map((route, index) => {
        const routeBoundingBox = {
            xMin: Math.min(...route.map(point => point[0])),
            xMax: Math.max(...route.map(point => point[0])),
            yMin: Math.min(...route.map(point => point[1])),
            yMax: Math.max(...route.map(point => point[1])),
        };
        const routePoints = route.map((point: [number, number]) => {
            const x = point[0];
            const y = point[1];
            const shortestDistances = routes.map((otherRoute, otherIndex) => {
                if (otherIndex === index) {
                    return Infinity;
                }
                return Math.min(...otherRoute.map((otherPoint) => {
                    return Math.sqrt((x - otherPoint[0]) ** 2 + (y - otherPoint[1]) ** 2);
                }));
            }).filter(distance => distance !== Infinity);
            const minDistance = Math.min(...shortestDistances);
            const sumDistances = shortestDistances.reduce((acc, distance) => acc + distance, 0);
            // distanceScore is weighting the minimum distance and the sum of the distances. minimum distance is more important.
            const distanceScore = sumDistances * WEIGHT_SUM_DISTANCES + minDistance * WEIGHT_MINIMUM_DISTANCE;
            const distanceFromCenter = Math.sqrt((x - (routeBoundingBox.xMin + routeBoundingBox.xMax) / 2) ** 2 + (y - (routeBoundingBox.yMin + routeBoundingBox.yMax) / 2) ** 2);
            const labelDirectionScores = LABEL_DIRECTIONS.map(direction => {
                const xTopLeft = direction.endsWith('right') ? x : x - LABEL_WIDTH;
                const yTopLeft = direction.startsWith('bottom') ? y : y - LABEL_HEIGHT;
                const xBottomRight = direction.endsWith('right') ? x + LABEL_WIDTH : x;
                const yBottomRight = direction.startsWith('bottom') ? y + LABEL_HEIGHT : y;
                const numPointInside = routes.reduce((acc, route) => acc + route.filter(point => point[0] >= xTopLeft && point[0] <= xBottomRight && point[1] >= yTopLeft && point[1] <= yBottomRight).length, 0);
                const overlapPercentWithCreatedLabels = labels.reduce((acc, label) => {
                    const overlapWidth = Math.min(xBottomRight, label.xBottomRight) - Math.max(xTopLeft, label.xTopLeft);
                    const overlapHeight = Math.min(yBottomRight, label.yBottomRight) - Math.max(yTopLeft, label.yTopLeft);
                    return acc + (overlapWidth > 0 && overlapHeight > 0 ? overlapWidth * overlapHeight : 0);
                }, 0);
                return {
                    direction,
                    overlapPercentWithCreatedLabels,
                    score: 100 / (numPointInside + 1) + (1000 / (overlapPercentWithCreatedLabels * WEIGHT_OVERLAP_WITH_CREATED_LABELS + 1)),
                };
            });
            const bestLabelDirection = labelDirectionScores.sort((a, b) => b.score - a.score)[0].direction;
            const bestLabelDirectionScore = labelDirectionScores.find(direction => direction.direction === bestLabelDirection)?.score ?? 0;
            const distanceFromClosestLabel = Math.log(1 + Math.min(distanceFromCenter, ...labels.map(label =>
                Math.sqrt(
                    Math.min((x - label.xTopLeft) ** 2, (x - label.xBottomRight) ** 2)
                    + Math.min((y - label.yTopLeft) ** 2, (y - label.yBottomRight) ** 2)
                )
            )));
            const score = distanceScore * WEIGHT_DISTANCE_FROM_ROUTES
                + (100 / distanceFromCenter * WEIGHT_DISTANCE_FROM_CENTER)
                + bestLabelDirectionScore * WEIGHT_BEST_LABEL_DIRECTION
                + (distanceFromClosestLabel * WEIGHT_DISTANCE_FROM_LABELS);
            return {
                x,
                y,
                shortestDistances,
                minDistance,
                sumDistances,
                distanceScore,
                score,
                labelDirectionScores,
                distanceFromCenter,
                distanceFromClosestLabel,
                bestLabelDirection,
            };
        });
        // highest score is the best label point
        const labelPoint = routePoints.sort((a, b) => b.score - a.score)[0];
        labels.push({
            xTopLeft: labelPoint.bestLabelDirection.startsWith('right') ? labelPoint.x : labelPoint.x - LABEL_WIDTH,
            yTopLeft: labelPoint.bestLabelDirection.startsWith('bottom') ? labelPoint.y : labelPoint.y - LABEL_HEIGHT,
            xBottomRight: labelPoint.bestLabelDirection.endsWith('right') ? labelPoint.x + LABEL_WIDTH : labelPoint.x,
            yBottomRight: labelPoint.bestLabelDirection.startsWith('bottom') ? labelPoint.y + LABEL_HEIGHT : labelPoint.y,
        });
        return {
            routePoints,
            labelPoint,
        };
    });
}
