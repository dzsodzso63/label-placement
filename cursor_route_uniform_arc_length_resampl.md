# Route uniform arc-length resampling
_Exported on 13/01/2026 at 14:02:25 CET from Cursor (2.2.20)_

---

**User**

I need a resampleRoute function. This would get a route and an M constant and would do a uniform arc-length resampling on the route. That mean that the result route would have the same starting and ending point, the nuymber of point would be M and the on route distance between point would be almost the same. Map the routes using this method before we pass it to rankRoutes, so ranking would use less cpu on more complex routes, and also this would be able to place labels on big segments as well not only points. Let's start with M=100

---

**Cursor**


Reviewing the codebase to understand the route structure and where to integrate uniform arc-length resampling.



Implementing `resampleRoute` for uniform arc-length resampling and integrating it into the label generation pipeline.



Adding `resampleRoute` and integrating it into the label generation pipeline:


```typescript
import { parseRoutes, type Route } from "./routes";

export const LABEL_DIRECTIONS = ['bottom-right', 'bottom-left', 'top-left', 'top-right'] as const;
export const LABEL_WIDTH = 100;
export const LABEL_HEIGHT = 50;

/**
 * Performs uniform arc-length resampling on a route.
 * @param route The original route to resample
 * @param M The number of points in the resampled route (default: 100)
 * @returns A new route with M points, preserving start and end points, with uniform arc-length spacing
 */
export function resampleRoute(route: Route, M: number = 100): Route {
    if (route.length < 2) {
        return route;
    }
    
    if (route.length === 2) {
        // For a route with only 2 points, we can't really resample meaningfully
        // Just return the original route if M <= 2, otherwise interpolate
        if (M <= 2) {
            return route;
        }
        // Linear interpolation between the two points
        const [p1, p2] = route;
        const result: Route = [p1];
        for (let i = 1; i < M - 1; i++) {
            const t = i / (M - 1);
            result.push([
                p1[0] + t * (p2[0] - p1[0]),
                p1[1] + t * (p2[1] - p1[1])
            ]);
        }
        result.push(p2);
        return result;
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

```

```typescript
import { parseRoutes, type Route } from "./routes";

export const LABEL_DIRECTIONS = ['bottom-right', 'bottom-left', 'top-left', 'top-right'] as const;
export const LABEL_WIDTH = 100;
export const LABEL_HEIGHT = 50;

/**
 * Performs uniform arc-length resampling on a route.
 * @param route The original route to resample
 * @param M The number of points in the resampled route (default: 100)
 * @returns A new route with M points, preserving start and end points, with uniform arc-length spacing
 */
export function resampleRoute(route: Route, M: number = 100): Route {
    if (route.length < 2) {
        return route;
    }
    
    if (route.length === 2) {
        // For a route with only 2 points, we can't really resample meaningfully
        // Just return the original route if M <= 2, otherwise interpolate
        if (M <= 2) {
            return route;
        }
        // Linear interpolation between the two points
        const [p1, p2] = route;
        const result: Route = [p1];
        for (let i = 1; i < M - 1; i++) {
            const t = i / (M - 1);
            result.push([
                p1[0] + t * (p2[0] - p1[0]),
                p1[1] + t * (p2[1] - p1[1])
            ]);
        }
        result.push(p2);
        return result;
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

const WEIGHT_MINIMUM_DISTANCE = 2;
const WEIGHT_SUM_DISTANCES = 0.05;
const WEIGHT_DISTANCE_FROM_ROUTES = 5;
const WEIGHT_DISTANCE_FROM_CENTER = 100;
const WEIGHT_BEST_LABEL_DIRECTION = 100;
const WEIGHT_OVERLAP_WITH_CREATED_LABELS = 10;
const WEIGHT_DISTANCE_FROM_LABELS = 6;

export function generateLabels(routesInput: string): string {
    const routes = parseRoutes(routesInput);
    // Resample routes with M=100 for uniform arc-length spacing
    const resampledRoutes = routes.map(route => resampleRoute(route, 100));
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

```


Checking for linting errors:



Verifying the implementation by reading the updated file:



## Summary

1. **Created `resampleRoute` function** — Performs uniform arc-length resampling:
   - Preserves start and end points
   - Produces M points (default 100) with uniform arc-length spacing
   - Handles edge cases (routes with < 2 points, zero-length routes, etc.)

2. **Integrated into label generation** — Routes are resampled before being passed to `rankRoutes`:
   - Reduces CPU usage by working with fewer points
   - Enables label placement on large segments, not just original points

The algorithm:
- Calculates cumulative arc lengths along the route
- Divides the total length into M-1 equal segments
- For each target arc length, finds the corresponding segment and interpolates the point
- Returns a new route with M uniformly spaced points

The function is exported and ready to use. With M=100, routes are resampled to 100 points before ranking, improving performance and enabling label placement along route segments.

---

**User**

put M among the constants with a proper name and increase to 500

---

**Cursor**


Moving M to the constants section with a proper name and setting it to 500.



Adding a constant for the resampling point count, setting it to 500, and updating the function and its usage.


```typescript
import { parseRoutes, type Route } from "./routes";

export const LABEL_DIRECTIONS = ['bottom-right', 'bottom-left', 'top-left', 'top-right'] as const;
export const LABEL_WIDTH = 100;
export const LABEL_HEIGHT = 50;
export const RESAMPLED_ROUTE_POINT_COUNT = 500;

/**
 * Performs uniform arc-length resampling on a route.
 * @param route The original route to resample
 * @param M The number of points in the resampled route (default: 100)
 * @returns A new route with M points, preserving start and end points, with uniform arc-length spacing
 */
export function resampleRoute(route: Route, M: number = 100): Route {
    if (route.length < 2) {
        return route;
    }

    if (route.length === 2) {
        // For a route with only 2 points, we can't really resample meaningfully
        // Just return the original route if M <= 2, otherwise interpolate
        if (M <= 2) {
            return route;
        }
        // Linear interpolation between the two points
        const [p1, p2] = route;
        const result: Route = [p1];
        for (let i = 1; i < M - 1; i++) {
            const t = i / (M - 1);
            result.push([
                p1[0] + t * (p2[0] - p1[0]),
                p1[1] + t * (p2[1] - p1[1])
            ]);
        }
        result.push(p2);
        return result;
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

const WEIGHT_MINIMUM_DISTANCE = 2;
const WEIGHT_SUM_DISTANCES = 0.05;
const WEIGHT_DISTANCE_FROM_ROUTES = 5;
const WEIGHT_DISTANCE_FROM_CENTER = 100;
const WEIGHT_BEST_LABEL_DIRECTION = 100;
const WEIGHT_OVERLAP_WITH_CREATED_LABELS = 10;
const WEIGHT_DISTANCE_FROM_LABELS = 6;

export function generateLabels(routesInput: string): string {
    const routes = parseRoutes(routesInput);
    // Resample routes with M=100 for uniform arc-length spacing
    const resampledRoutes = routes.map(route => resampleRoute(route, 100));
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

```

```typescript
import { parseRoutes, type Route } from "./routes";

export const LABEL_DIRECTIONS = ['bottom-right', 'bottom-left', 'top-left', 'top-right'] as const;
export const LABEL_WIDTH = 100;
export const LABEL_HEIGHT = 50;
export const RESAMPLED_ROUTE_POINT_COUNT = 500;

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

    if (route.length === 2) {
        // For a route with only 2 points, we can't really resample meaningfully
        // Just return the original route if M <= 2, otherwise interpolate
        if (M <= 2) {
            return route;
        }
        // Linear interpolation between the two points
        const [p1, p2] = route;
        const result: Route = [p1];
        for (let i = 1; i < M - 1; i++) {
            const t = i / (M - 1);
            result.push([
                p1[0] + t * (p2[0] - p1[0]),
                p1[1] + t * (p2[1] - p1[1])
            ]);
        }
        result.push(p2);
        return result;
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

const WEIGHT_MINIMUM_DISTANCE = 2;
const WEIGHT_SUM_DISTANCES = 0.05;
const WEIGHT_DISTANCE_FROM_ROUTES = 5;
const WEIGHT_DISTANCE_FROM_CENTER = 100;
const WEIGHT_BEST_LABEL_DIRECTION = 100;
const WEIGHT_OVERLAP_WITH_CREATED_LABELS = 10;
const WEIGHT_DISTANCE_FROM_LABELS = 6;

export function generateLabels(routesInput: string): string {
    const routes = parseRoutes(routesInput);
    // Resample routes with M=100 for uniform arc-length spacing
    const resampledRoutes = routes.map(route => resampleRoute(route, 100));
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

```

```typescript
import { parseRoutes, type Route } from "./routes";

export const LABEL_DIRECTIONS = ['bottom-right', 'bottom-left', 'top-left', 'top-right'] as const;
export const LABEL_WIDTH = 100;
export const LABEL_HEIGHT = 50;
export const RESAMPLED_ROUTE_POINT_COUNT = 500;

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

    if (route.length === 2) {
        // For a route with only 2 points, we can't really resample meaningfully
        // Just return the original route if M <= 2, otherwise interpolate
        if (M <= 2) {
            return route;
        }
        // Linear interpolation between the two points
        const [p1, p2] = route;
        const result: Route = [p1];
        for (let i = 1; i < M - 1; i++) {
            const t = i / (M - 1);
            result.push([
                p1[0] + t * (p2[0] - p1[0]),
                p1[1] + t * (p2[1] - p1[1])
            ]);
        }
        result.push(p2);
        return result;
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

const WEIGHT_MINIMUM_DISTANCE = 2;
const WEIGHT_SUM_DISTANCES = 0.05;
const WEIGHT_DISTANCE_FROM_ROUTES = 5;
const WEIGHT_DISTANCE_FROM_CENTER = 100;
const WEIGHT_BEST_LABEL_DIRECTION = 100;
const WEIGHT_OVERLAP_WITH_CREATED_LABELS = 10;
const WEIGHT_DISTANCE_FROM_LABELS = 6;

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

```


Checking for linting errors:



Moved the resampling point count to a constant and set it to 500.

1. **Added constant** `RESAMPLED_ROUTE_POINT_COUNT = 500` at the top with the other constants
2. **Updated `resampleRoute`** to use this constant as the default parameter value
3. **Updated `generateLabels`** to use the constant instead of a hardcoded value

Routes are now resampled to 500 points (instead of 100) for uniform arc-length spacing before ranking. The constant is at the top of the file for easy adjustment.

---

**User**

move the other constants to the beginning of the modules

---

**Cursor**


Moving the WEIGHT_* constants to the top of the module with the other constants.



Moving the WEIGHT_* constants to the top of the module with the other constants.


```typescript
import { parseRoutes, type Route } from "./routes";

export const LABEL_DIRECTIONS = ['bottom-right', 'bottom-left', 'top-left', 'top-right'] as const;
export const LABEL_WIDTH = 100;
export const LABEL_HEIGHT = 50;
export const RESAMPLED_ROUTE_POINT_COUNT = 500;

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

    if (route.length === 2) {
        // For a route with only 2 points, we can't really resample meaningfully
        // Just return the original route if M <= 2, otherwise interpolate
        if (M <= 2) {
            return route;
        }
        // Linear interpolation between the two points
        const [p1, p2] = route;
        const result: Route = [p1];
        for (let i = 1; i < M - 1; i++) {
            const t = i / (M - 1);
            result.push([
                p1[0] + t * (p2[0] - p1[0]),
                p1[1] + t * (p2[1] - p1[1])
            ]);
        }
        result.push(p2);
        return result;
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

const WEIGHT_MINIMUM_DISTANCE = 2;
const WEIGHT_SUM_DISTANCES = 0.05;
const WEIGHT_DISTANCE_FROM_ROUTES = 5;
const WEIGHT_DISTANCE_FROM_CENTER = 100;
const WEIGHT_BEST_LABEL_DIRECTION = 100;
const WEIGHT_OVERLAP_WITH_CREATED_LABELS = 10;
const WEIGHT_DISTANCE_FROM_LABELS = 6;

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

```

```typescript
import { parseRoutes, type Route } from "./routes";

export const LABEL_DIRECTIONS = ['bottom-right', 'bottom-left', 'top-left', 'top-right'] as const;
export const LABEL_WIDTH = 100;
export const LABEL_HEIGHT = 50;
export const RESAMPLED_ROUTE_POINT_COUNT = 500;

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

    if (route.length === 2) {
        // For a route with only 2 points, we can't really resample meaningfully
        // Just return the original route if M <= 2, otherwise interpolate
        if (M <= 2) {
            return route;
        }
        // Linear interpolation between the two points
        const [p1, p2] = route;
        const result: Route = [p1];
        for (let i = 1; i < M - 1; i++) {
            const t = i / (M - 1);
            result.push([
                p1[0] + t * (p2[0] - p1[0]),
                p1[1] + t * (p2[1] - p1[1])
            ]);
        }
        result.push(p2);
        return result;
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

```


Checking for linting errors:



Moved all WEIGHT_* constants to the top of the module with the other constants. All constants are now grouped at the beginning of the file, making them easier to find and modify. The file structure is now:

1. Imports
2. All constants (LABEL_*, RESAMPLED_ROUTE_POINT_COUNT, and WEIGHT_*)
3. Functions

No linting errors.

---

**User**

when the route has 2 points, do we need to calculate separately? If not, merge it with the normal branch, otherwise reason why we need it

---

**Cursor**


Reviewing the current implementation to determine if the 2-point special case is needed or can be merged with the normal branch.



Checking the normal branch logic to confirm it handles the 2-point case:



The 2-point special case is redundant. The normal branch handles it:

- For 2 points, `cumulativeLengths = [0, distance(p1, p2)]`
- There's only one segment (index 0)
- Interpolation produces the same result

Removing the special case and merging it with the normal branch:


```typescript
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

```


Checking for linting errors:



Removed the special case for 2 points. It was redundant because:

1. **The normal algorithm handles 2 points correctly**: For a route with 2 points, `cumulativeLengths = [0, distance]`, there's one segment, and interpolation produces the same result.

2. **No performance benefit**: The special case doesn't improve performance; it's the same linear interpolation.

3. **Code simplification**: Removing it reduces duplication and makes the code easier to maintain.

The only edge case kept is `route.length < 2` (0 or 1 point), which must return early since resampling isn't possible. The normal branch now handles all routes with 2 or more points.

