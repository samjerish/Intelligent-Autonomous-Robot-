import { calculatePath } from './src/utils/simulationEngine.ts';

const mapData = {"gridSize":{"x":20,"y":15},"start":{"x":2,"y":2},"end":{"x":18,"y":12},"obstacles":[{"x":5,"y":5},{"x":5,"y":6},{"x":5,"y":7},{"x":10,"y":10},{"x":11,"y":10},{"x":12,"y":10},{"x":15,"y":3},{"x":15,"y":4}]};
const path = calculatePath(mapData.start, mapData.end, mapData.obstacles, mapData as any);
console.log(path.length);
