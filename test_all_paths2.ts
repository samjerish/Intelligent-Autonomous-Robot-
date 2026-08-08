import { calculatePath } from './src/utils/simulationEngine.ts';
import fs from 'fs';

const gridSize = { x: 30, y: 25, f: 1 };
const rooms = [
  // Top Row
  { id: 'intake', name: 'Patient Intake', start: { x: 1, y: 1, f: 0 }, end: { x: 11, y: 3, f: 0 }, color: '#fcd34d', door: { x: 7, y: 3, f: 0 } },
  { id: 'elevators', name: 'Elevators', start: { x: 13, y: 1, f: 0 }, end: { x: 15, y: 3, f: 0 }, color: '#d1d5db', door: { x: 14, y: 3, f: 0 } },
  { id: 'storage', name: 'Storage', start: { x: 17, y: 1, f: 0 }, end: { x: 20, y: 4, f: 0 }, color: '#5eead4', door: { x: 17, y: 4, f: 0 } },
  { id: 'receiving', name: 'Receiving', start: { x: 22, y: 1, f: 0 }, end: { x: 25, y: 4, f: 0 }, color: '#f8fafc', door: { x: 22, y: 3, f: 0 } },
  { id: 'loading', name: 'Loading Dock', start: { x: 27, y: 1, f: 0 }, end: { x: 29, y: 4, f: 0 }, color: '#f8fafc', door: { x: 27, y: 3, f: 0 } },

  // Middle Row
  { id: 'reception', name: 'Reception', start: { x: 1, y: 5, f: 0 }, end: { x: 8, y: 7, f: 0 }, color: '#fcd34d', door: { x: 8, y: 6, f: 0 } },
  { id: 'stairs', name: 'Stairs', start: { x: 1, y: 9, f: 0 }, end: { x: 2, y: 11, f: 0 }, color: '#d1d5db', door: { x: 2, y: 10, f: 0 } },
  { id: 'diagnostics', name: 'Diagnostics', start: { x: 4, y: 9, f: 0 }, end: { x: 9, y: 15, f: 0 }, color: '#5eead4', door: { x: 7, y: 15, f: 0 } },
  
  { id: 'or_a', name: 'OR A', start: { x: 11, y: 6, f: 0 }, end: { x: 14, y: 15, f: 0 }, color: '#c084fc', door: { x: 14, y: 12, f: 0 } },
  { id: 'er', name: 'ER & Trauma', start: { x: 16, y: 6, f: 0 }, end: { x: 21, y: 15, f: 0 }, color: '#c084fc', door: { x: 16, y: 12, f: 0 } },
  { id: 'ambulance', name: 'Ambulance Bay', start: { x: 23, y: 6, f: 0 }, end: { x: 29, y: 15, f: 0 }, color: '#f8fafc', door: { x: 23, y: 12, f: 0 } },

  // Bottom Row
  { id: 'recovery', name: 'Recovery', start: { x: 1, y: 17, f: 0 }, end: { x: 9, y: 23, f: 0 }, color: '#5eead4', door: { x: 5, y: 17, f: 0 } },
  { id: 'icu', name: 'ICU', start: { x: 11, y: 17, f: 0 }, end: { x: 14, y: 19, f: 0 }, color: '#c084fc', door: { x: 12, y: 17, f: 0 } },
  { id: 'stepdown', name: 'Step Down', start: { x: 11, y: 21, f: 0 }, end: { x: 14, y: 23, f: 0 }, color: '#c084fc', door: { x: 11, y: 22, f: 0 } },
  { id: 'cafe', name: 'Cafe', start: { x: 16, y: 17, f: 0 }, end: { x: 25, y: 23, f: 0 }, color: '#fcd34d', door: { x: 16, y: 21, f: 0 } }
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

const mapData = { gridSize, start: { x: 15, y: 12, f: 0 }, end: { x: 7, y: 3, f: 0 }, obstacles, stairs: [] };

const ends = [
  { name: 'Default Intake', end: { x: 7, y: 3, f: 0 } },
  { name: 'ICU', end: { x: 12, y: 17, f: 0 } },
  { name: 'ER', end: { x: 16, y: 12, f: 0 } },
  { name: 'OR A', end: { x: 14, y: 12, f: 0 } },
  { name: 'Recovery', end: { x: 5, y: 17, f: 0 } },
  { name: 'Cafe', end: { x: 16, y: 21, f: 0 } },
  { name: 'Storage', end: { x: 17, y: 4, f: 0 } },
  { name: 'Diagnostics', end: { x: 7, y: 15, f: 0 } },
  { name: 'Ambulance', end: { x: 23, y: 12, f: 0 } },
  { name: 'Loading', end: { x: 27, y: 3, f: 0 } }
];

for (const target of ends) {
  const path = calculatePath(mapData.start, target.end, mapData.obstacles, mapData as any);
  console.log(`Path to ${target.name}: ${path.length}`);
}
