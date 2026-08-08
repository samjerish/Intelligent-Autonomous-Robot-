import { calculatePath } from './src/utils/simulationEngine.ts';
import fs from 'fs';

// Read the mapData from backend (which is what we get)
// We can just fetch it from the running server
fetch('http://localhost:3000/api/map')
  .then(r => r.json())
  .then(mapData => {
    const start = { x: 61, y: 81, f: 0 };
    const end = { x: 36, y: 12, f: 0 };
    const path = calculatePath(start, end, mapData.obstacles || [], mapData);
    console.log("Path length:", path.length);
  });
