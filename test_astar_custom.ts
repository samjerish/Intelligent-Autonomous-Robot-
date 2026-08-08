import { calculatePath } from './src/utils/simulationEngine.ts';

const gridSize = { x: 30, y: 25, f: 1 };
const rooms = [
  { id: 'intake', name: 'Patient Intake', start: { x: 1, y: 1, f: 0 }, end: { x: 11, y: 4, f: 0 }, color: '#fcd34d', door: { x: 7, y: 4, f: 0 } },
  { id: 'or_a', name: 'OR A', start: { x: 10, y: 7, f: 0 }, end: { x: 14, y: 15, f: 0 }, color: '#c084fc', door: { x: 14, y: 12, f: 0 } }
];
const obstacles = [];
rooms.forEach(room => {
  for (let x = room.start.x; x <= room.end.x; x++) {
    for (let y = room.start.y; y <= room.end.y; y++) {
      if ((x === room.start.x || x === room.end.x || y === room.start.y || y === room.end.y) && (x !== room.door.x || y !== room.door.y)) {
        obstacles.push({ x, y, f: room.start.f });
      }
    }
  }
});
const mapData = { gridSize, start: { x: 13, y: 12, f: 0 }, end: { x: 7, y: 4, f: 0 }, obstacles, stairs: [] };
const path = calculatePath(mapData.start, mapData.end, mapData.obstacles, mapData as any);
console.log("Path length:", path.length);
