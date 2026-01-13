import { parseRoutes, type Route } from "./routes";

export const LABEL_DIRECTIONS = ['bottom-right', 'bottom-left', 'top-left', 'top-right'] as const;
export const LABEL_WIDTH = 100;
export const LABEL_HEIGHT = 50;
export const RESAMPLED_ROUTE_POINT_COUNT = 100;

const WEIGHT_MINIMUM_DISTANCE = 2;
const WEIGHT_SUM_DISTANCES = 0.05;
const WEIGHT_DISTANCE_FROM_ROUTES = 5;
const WEIGHT_DISTANCE_FROM_CENTER = 100;
const WEIGHT_BEST_LABEL_DIRECTION = 100;
const WEIGHT_OVERLAP_WITH_CREATED_LABELS = 10;
const WEIGHT_DISTANCE_FROM_LABELS = 6;

/**
 * Performs uniform arc-length resampling on a route.
 * @param route The original route to resample
 * @param M The number of points in the resampled route (default: RESAMPLED_ROUTE_POINT_COUNT)
 * @returns A new route with M points, preserving start and end points, with uniform arc-length spacing
 */
export function resampleRoute(route: Route, M: number = RESAMPLED_ROUTE_POINT_COUNT): Route {
    if (route.length < 2) {
        return route;
    }

    // Calculate cumulative arc lengths
    const cumulativeLengths: number[] = [0];
    let totalLength = 0;

    for (let i = 1; i < route.length; i++) {
        const [x1, y1] = route[i - 1];
        const [x2, y2] = route[i];
        const segmentLength = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        totalLength += segmentLength;
        cumulativeLengths.push(totalLength);
    }

    // If total length is 0 (all points are the same), return the original route
    if (totalLength === 0) {
        return route;
    }

    // Generate resampled points
    const resampled: Route = [];

    // Always include the first point
    resampled.push([route[0][0], route[0][1]]);

    // Generate M-2 intermediate points (M total points including start and end)
    for (let i = 1; i < M - 1; i++) {
        const targetLength = (i / (M - 1)) * totalLength;

        // Find the segment containing this target length
        let segmentIndex = 0;
        for (let j = 0; j < cumulativeLengths.length - 1; j++) {
            if (targetLength >= cumulativeLengths[j] && targetLength <= cumulativeLengths[j + 1]) {
                segmentIndex = j;
                break;
            }
        }

        // Interpolate within the segment
        const segmentStartLength = cumulativeLengths[segmentIndex];
        const segmentEndLength = cumulativeLengths[segmentIndex + 1];
        const segmentLength = segmentEndLength - segmentStartLength;

        let t = 0;
        if (segmentLength > 0) {
            t = (targetLength - segmentStartLength) / segmentLength;
        }

        const [x1, y1] = route[segmentIndex];
        const [x2, y2] = route[segmentIndex + 1];

        resampled.push([
            x1 + t * (x2 - x1),
            y1 + t * (y2 - y1)
        ]);
    }

    // Always include the last point
    const lastPoint = route[route.length - 1];
    resampled.push([lastPoint[0], lastPoint[1]]);

    return resampled;
}

export function generateLabels(routesInput: string): string {
    const routes = parseRoutes(routesInput);
    // Resample routes for uniform arc-length spacing
    const resampledRoutes = routes.map(route => resampleRoute(route, RESAMPLED_ROUTE_POINT_COUNT));
    const rankedRoutes = rankRoutes(resampledRoutes);
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
