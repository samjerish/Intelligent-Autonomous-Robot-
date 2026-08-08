import { calculatePath } from './src/utils/simulationEngine.ts';
import fs from 'fs';

const mapData = {
  gridSize: { x: 20, y: 15, f: 3 },
  start: { x: 10, y: 14, f: 0 },
  end: { x: 5, y: 3, f: 2 },
  stairs: [
    { x: 2, y: 13, f: 0 }, { x: 2, y: 13, f: 1 }, { x: 2, y: 13, f: 2 },
    { x: 17, y: 2, f: 0 }, { x: 17, y: 2, f: 1 }, { x: 17, y: 2, f: 2 }
  ],
  obstacles: [
    { x: 10, y: 7, f: 0 }, { x: 10, y: 13, f: 0 },
    { x: 10, y: 7, f: 1 }, { x: 10, y: 13, f: 1 },
    { x: 10, y: 7, f: 2 }, { x: 10, y: 13, f: 2 }
  ]
};

const path = calculatePath(mapData.start, mapData.end, mapData.obstacles, mapData as any);
console.log("Path length:", path.length);
if (path.length > 0) {
  console.log("Path valid:", path[0], "...", path[path.length - 1]);
}
