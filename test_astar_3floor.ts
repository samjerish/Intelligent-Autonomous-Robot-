import { calculatePath } from './src/utils/simulationEngine.ts';

const gridSize = { x: 20, y: 15, f: 3 };

const rooms = [
  // Floor 0
  { id: 'er', name: 'ER', start: { x: 2, y: 2, f: 0 }, end: { x: 8, y: 6, f: 0 }, color: '#ef4444', door: { x: 5, y: 6, f: 0 } },
  { id: 'reception', name: 'Reception', start: { x: 11, y: 2, f: 0 }, end: { x: 18, y: 6, f: 0 }, color: '#eab308', door: { x: 14, y: 6, f: 0 } },
  // Floor 1
  { id: 'icu', name: 'ICU', start: { x: 2, y: 2, f: 1 }, end: { x: 8, y: 6, f: 1 }, color: '#3b82f6', door: { x: 5, y: 6, f: 1 } },
  { id: 'lab', name: 'Lab', start: { x: 11, y: 2, f: 1 }, end: { x: 18, y: 6, f: 1 }, color: '#8b5cf6', door: { x: 14, y: 6, f: 1 } },
  // Floor 2
  { id: 'surgery', name: 'Surgery', start: { x: 2, y: 2, f: 2 }, end: { x: 8, y: 6, f: 2 }, color: '#10b981', door: { x: 5, y: 6, f: 2 } },
  { id: 'ward', name: 'Ward A', start: { x: 11, y: 2, f: 2 }, end: { x: 18, y: 6, f: 2 }, color: '#f97316', door: { x: 14, y: 6, f: 2 } }
];

const stairs = [
  { x: 2, y: 13, f: 0 }, { x: 2, y: 13, f: 1 }, { x: 2, y: 13, f: 2 },
  { x: 17, y: 13, f: 0 }, { x: 17, y: 13, f: 1 }, { x: 17, y: 13, f: 2 }
];

const obstacles = [
  // Columns
  { x: 5, y: 10, f: 0 }, { x: 14, y: 10, f: 0 },
  { x: 5, y: 10, f: 1 }, { x: 14, y: 10, f: 1 },
  { x: 5, y: 10, f: 2 }, { x: 14, y: 10, f: 2 }
];

rooms.forEach(room => {
  for (let x = room.start.x; x <= room.end.x; x++) {
    for (let y = room.start.y; y <= room.end.y; y++) {
      if ((x === room.start.x || x === room.end.x || y === room.start.y || y === room.end.y) && (x !== room.door.x || y !== room.door.y)) {
        obstacles.push({ x, y, f: room.start.f });
      }
    }
  }
});

let start = { x: 14, y: 6, f: 0 }; // Reception Door
let end = { x: 14, y: 6, f: 2 }; // Ward A Door

const mapData = { gridSize, start, end, obstacles, stairs, rooms, columns: [] };

console.log("Stairs check:");
console.log(stairs.filter(s => s.f === 0));

const path = calculatePath(start, end, obstacles, mapData as any);
console.log("Path length:", path.length);
if (path.length === 0) {
    console.log("Trying path from (14, 6, 0) to (2, 13, 0)");
    console.log(calculatePath(start, { x: 2, y: 13, f: 0 }, obstacles, mapData as any).length);
}
