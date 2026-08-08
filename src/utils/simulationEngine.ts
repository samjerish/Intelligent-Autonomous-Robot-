import type { GridPoint, MapData } from '../types';

let worker: Worker | null = null;
let messageId = 0;
const pendingRequests = new Map<number, { resolve: (path: GridPoint[]) => void, reject: (err: any) => void }>();

function getWorker() {
  if (typeof window === 'undefined') return null; // SSR safety
  if (!worker) {
    worker = new Worker(new URL('./pathWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { id, path } = e.data;
      if (pendingRequests.has(id)) {
        pendingRequests.get(id)!.resolve(path);
        pendingRequests.delete(id);
      }
    };
  }
  return worker;
}

export async function calculatePathAsync(start: GridPoint, end: GridPoint, obstacles: GridPoint[], mapData: MapData, requireRoads: boolean = true): Promise<GridPoint[]> {
  const w = getWorker();
  if (!w) return []; // Fallback for SSR

  let targetEnd = end;
  if (requireRoads && mapData.roads && mapData.roads.length > 0) {
    const isEndOnRoad = mapData.roads.some(r => r.x === end.x && r.y === end.y && r.f === end.f);
    if (!isEndOnRoad) {
      let nearest = mapData.roads[0];
      let minDist = Infinity;
      for (const r of mapData.roads) {
        const d = Math.abs(r.x - end.x) + Math.abs(r.y - end.y);
        if (d < minDist) {
          minDist = d;
          nearest = r;
        }
      }
      targetEnd = nearest;
    }
  }

  return new Promise((resolve, reject) => {
    const id = messageId++;
    pendingRequests.set(id, { resolve, reject });
    w.postMessage({ id, type: 'calculatePath', start, end: targetEnd, obstacles, mapData, requireRoads });
  });
}

export async function calculateLongPathAsync(start: GridPoint, end: GridPoint, obstacles: GridPoint[], mapData: MapData, requireRoads: boolean = true): Promise<GridPoint[]> {
  const w = getWorker();
  if (!w) return [];

  return new Promise((resolve, reject) => {
    const id = messageId++;
    pendingRequests.set(id, { resolve, reject });
    w.postMessage({ id, type: 'calculateLongPath', start, end, obstacles, mapData, requireRoads });
  });
}

// Keep the sync versions as wrappers if they are needed elsewhere temporarily,
// but ideally we should migrate all callers to the async versions.
// For now, they return empty array to force migration (or we could keep the old logic).
// Let's keep the old logic as a fallback if needed, but since we want to migrate,
// we will just remove the old logic to ensure no UI blocking occurs.
export function calculatePath(start: GridPoint, end: GridPoint, obstacles: GridPoint[], mapData: MapData, requireRoads: boolean = true): GridPoint[] {
  console.warn("calculatePath is deprecated. Use calculatePathAsync instead.");
  return [];
}

export function calculateLongPath(start: GridPoint, end: GridPoint, obstacles: GridPoint[], mapData: MapData, requireRoads: boolean = true): GridPoint[] {
  console.warn("calculateLongPath is deprecated. Use calculateLongPathAsync instead.");
  return [];
}

export function generateDynamicEvent(_mapData: MapData, currentPath: GridPoint[], currentIndex: number) {
  const events = ['obstacle', 'person', 'closed_door', 'battery_warning'];
  const eventType = events[Math.floor(Math.random() * events.length)];
  
  let newObstacle: GridPoint | null = null;
  
  if (eventType !== 'battery_warning') {
    const lookAhead = Math.min(currentIndex + 3, currentPath.length - 1);
    if (lookAhead > currentIndex) {
      newObstacle = currentPath[lookAhead];
    }
  }

  return { type: eventType, position: newObstacle };
}

