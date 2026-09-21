import type { GridPoint, MapData } from '../types';

export function calculatePath(start: GridPoint, end: GridPoint, obstacles: GridPoint[], mapData: MapData, requireRoads: boolean = true): GridPoint[] {
  // 3D A* pathfinding implementation strictly adhering to road network
  const { gridSize, stairs } = mapData;

  const getStairAt = (x: number, y: number, f: number) => {
    return stairs?.find(s => s.x === x && s.y === y && s.f === f);
  };

  const roadSet = new Set(mapData.roads?.map(r => `${r.x},${r.y},${r.f}`) || []);
  const obstacleSet = new Set(obstacles?.map(o => `${o.x},${o.y},${o.f}`) || []);

  // Ensure start and end locations are not blocked by obstacle set
  obstacleSet.delete(`${start.x},${start.y},${start.f}`);
  obstacleSet.delete(`${end.x},${end.y},${end.f}`);

  const isObstacle = (x: number, y: number, f: number) => {
    return obstacleSet.has(`${x},${y},${f}`);
  };

  const getObstaclePenalty = (x: number, y: number, f: number) => {
    let penalty = 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        if (obstacleSet.has(`${x + dx},${y + dy},${f}`)) {
          penalty += 20; // 20 penalty for adjacent cells
        } else if (obstacleSet.has(`${x + dx * 2},${y + dy * 2},${f}`)) {
          penalty += 5; // 5 penalty for 2-cells away
        }
      }
    }
    return penalty;
  };

  const openList = [{ pos: start, g: 0, h: manhattanDistance(start, end), parent: null as any }];
  const closedList = new Set<string>();

  while (openList.length > 0) {
    openList.sort((a, b) => (a.g + a.h) - (b.g + b.h));
    const current = openList.shift()!;
    const key = `${current.pos.x},${current.pos.y},${current.pos.f}`;

    if (current.pos.x === end.x && current.pos.y === end.y && current.pos.f === end.f) {
      const path: GridPoint[] = [];
      let curr = current;
      while (curr) {
        path.push(curr.pos);
        curr = curr.parent;
      }
      return path.reverse();
    }

    closedList.add(key);

    const neighbors = [
      { x: current.pos.x, y: current.pos.y - 1, f: current.pos.f },
      { x: current.pos.x, y: current.pos.y + 1, f: current.pos.f },
      { x: current.pos.x - 1, y: current.pos.y, f: current.pos.f },
      { x: current.pos.x + 1, y: current.pos.y, f: current.pos.f }
    ];

    // If standing on stairs, can go up or down a floor
    if (getStairAt(current.pos.x, current.pos.y, current.pos.f)) {
      if (current.pos.f < (gridSize.f || 1) - 1 && getStairAt(current.pos.x, current.pos.y, current.pos.f + 1)) {
        neighbors.push({ x: current.pos.x, y: current.pos.y, f: current.pos.f + 1 });
      }
      if (current.pos.f > 0 && getStairAt(current.pos.x, current.pos.y, current.pos.f - 1)) {
        neighbors.push({ x: current.pos.x, y: current.pos.y, f: current.pos.f - 1 });
      }
    }

    // Elevators allow going to ANY floor
    const getElevatorAt = (x: number, y: number, f: number) => {
      return mapData.elevators?.find(e => e.x === x && e.y === y && e.f === f);
    };

    if (getElevatorAt(current.pos.x, current.pos.y, current.pos.f)) {
      for (let f = 0; f < (gridSize.f || 1); f++) {
        if (f !== current.pos.f && getElevatorAt(current.pos.x, current.pos.y, f)) {
          neighbors.push({ x: current.pos.x, y: current.pos.y, f });
        }
      }
    }

    for (const neighbor of neighbors) {
      const isNeighborRoad = roadSet.size === 0 || roadSet.has(`${neighbor.x},${neighbor.y},${neighbor.f}`) ||
        (neighbor.x === end.x && neighbor.y === end.y && neighbor.f === end.f) ||
        (neighbor.x === start.x && neighbor.y === start.y && neighbor.f === start.f);

      if (requireRoads && !isNeighborRoad) continue;

      if (
        neighbor.x >= 0 && neighbor.x < gridSize.x &&
        neighbor.y >= 0 && neighbor.y < gridSize.y &&
        neighbor.f >= 0 && neighbor.f < (gridSize.f || 1) &&
        !isObstacle(neighbor.x, neighbor.y, neighbor.f) &&
        !closedList.has(`${neighbor.x},${neighbor.y},${neighbor.f}`)
      ) {
        let gCost = neighbor.f !== current.pos.f ? 5 : 1;
        if (!isNeighborRoad) {
          gCost += 500;
        }

        if (neighbor.x !== end.x || neighbor.y !== end.y || neighbor.f !== end.f) {
          gCost += getObstaclePenalty(neighbor.x, neighbor.y, neighbor.f);
        }

        const g = current.g + gCost;
        const h = manhattanDistance(neighbor, end);
        const existingNode = openList.find(n => n.pos.x === neighbor.x && n.pos.y === neighbor.y && n.pos.f === neighbor.f);

        if (!existingNode || g < existingNode.g) {
          if (existingNode) {
            existingNode.g = g;
            existingNode.parent = current;
          } else {
            openList.push({ pos: neighbor, g, h, parent: current });
          }
        }
      }
    }
  }

  return []; // No path found
}

// 3D Manhattan Distance
function manhattanDistance(a: GridPoint, b: GridPoint) {
  // Heavy weight on floor difference to discourage unnecessary floor changes
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.f - b.f) * 10;
}

export function generateDynamicEvent(_mapData: MapData, currentPath: GridPoint[], currentIndex: number) {
  const events = ['obstacle', 'person', 'closed_door', 'battery_warning'];
  const eventType = events[Math.floor(Math.random() * events.length)];
  
  let newObstacle: GridPoint | null = null;
  
  if (eventType !== 'battery_warning') {
    // Place obstacle on the path ahead
    const lookAhead = Math.min(currentIndex + 3, currentPath.length - 1);
    if (lookAhead > currentIndex) {
      newObstacle = currentPath[lookAhead];
    }
  }

  return { type: eventType, position: newObstacle };
}

export function calculateLongPath(start: GridPoint, end: GridPoint, obstacles: GridPoint[], mapData: MapData, requireRoads: boolean = true): GridPoint[] {
  if (!mapData.rooms || mapData.rooms.length === 0) {
    return calculatePath(start, end, obstacles, mapData, requireRoads);
  }

  // Find a room that acts as a detour.
  // We want a room that is somewhat far from both start and end to ensure it's a "long" route.
  let detourPoint: GridPoint | null = null;
  let maxDetourDist = 0;

  for (const room of mapData.rooms) {
    const pt = room.door || room.start;
    const distToStart = manhattanDistance(start, pt);
    const distToEnd = manhattanDistance(pt, end);
    // Score based on how out of the way it is. We want high total distance.
    const detourScore = distToStart + distToEnd;
    
    // Avoid picking start or end exactly
    if (distToStart > 5 && distToEnd > 5 && detourScore > maxDetourDist) {
      maxDetourDist = detourScore;
      detourPoint = pt;
    }
  }

  if (!detourPoint) {
    // If no good detour found, fallback to shortest
    return calculatePath(start, end, obstacles, mapData, requireRoads);
  }

  if (detourPoint) {
    const p1 = calculatePath(start, detourPoint, obstacles, mapData, requireRoads);
    const p2 = calculatePath(detourPoint, end, obstacles, mapData, requireRoads);
    if (p1.length > 0 && p2.length > 0) {
      return [...p1, p1[p1.length - 1], ...p2.slice(1)];
    }
  }

  // Fallback to normal path
  return calculatePath(start, end, obstacles, mapData, requireRoads);
}

export function calculateEvadePath(start: GridPoint, obstacles: GridPoint[], mapData: MapData): GridPoint[] {
  const { gridSize } = mapData;
  const obstacleSet = new Set(obstacles?.map(o => `${o.x},${o.y},${o.f}`));
  const isObstacle = (x: number, y: number, f: number) => obstacleSet.has(`${x},${y},${f}`);
  const roadSet = new Set(mapData.roads?.map(r => `${r.x},${r.y},${r.f}`) || []);
  const isRoad = (x: number, y: number, f: number) => roadSet.size === 0 || roadSet.has(`${x},${y},${f}`);

  const queue = [{ pos: start, path: [start] }];
  const visited = new Set<string>();
  visited.add(`${start.x},${start.y},${start.f}`);

  let bestPath: GridPoint[] = [];
  let bestDist = -1;

  while (queue.length > 0) {
    const { pos, path } = queue.shift()!;
    
    if (path.length > 1) {
       let minObstacleDist = 999;
       for (const obs of obstacles) {
         if (obs.f === pos.f) {
           const d = Math.abs(obs.x - pos.x) + Math.abs(obs.y - pos.y);
           if (d < minObstacleDist) minObstacleDist = d;
         }
       }
       
       if (minObstacleDist > bestDist) {
          bestDist = minObstacleDist;
          bestPath = path;
       }
       if (minObstacleDist >= 2) {
         return path; // Found a safe enough spot
       }
    }
    
    if (path.length > 4) continue; // max 4 steps

    const neighbors = [
      { x: pos.x, y: pos.y - 1, f: pos.f },
      { x: pos.x, y: pos.y + 1, f: pos.f },
      { x: pos.x - 1, y: pos.y, f: pos.f },
      { x: pos.x + 1, y: pos.y, f: pos.f }
    ];

    for (const n of neighbors) {
      if (
        n.x >= 0 && n.x < gridSize.x &&
        n.y >= 0 && n.y < gridSize.y &&
        isRoad(n.x, n.y, n.f) &&
        !isObstacle(n.x, n.y, n.f) &&
        !visited.has(`${n.x},${n.y},${n.f}`)
      ) {
        visited.add(`${n.x},${n.y},${n.f}`);
        queue.push({ pos: n, path: [...path, n] });
      }
    }
  }
  
  return bestPath;
}

/**
 * Calculates a safe reversing path for the robot when blocked by an obstacle that isn't moving.
 * 1. Prefers reversing along the robot's recent travel path (history nodes), which are guaranteed valid roads.
 * 2. If historical path nodes aren't available, finds an unblocked road neighbor in the direction away from the obstacle.
 * Returns an array of GridPoints starting with currentLoc and moving 1-2 steps backward.
 */
export function calculateReversePath(
  currentLoc: GridPoint,
  obsPos: GridPoint,
  currentPath: GridPoint[],
  currentPosIndex: number,
  obstacles: GridPoint[],
  mapData: MapData,
  steps: number = 2
): GridPoint[] {
  const obstacleSet = new Set(obstacles?.map(o => `${o.x},${o.y},${o.f}`) || []);
  const roadSet = new Set(mapData.roads?.map(r => `${r.x},${r.y},${r.f}`) || []);
  const isRoad = (x: number, y: number, f: number) => roadSet.size === 0 || roadSet.has(`${x},${y},${f}`);
  const isBlocked = (x: number, y: number, f: number) => obstacleSet.has(`${x},${y},${f}`);

  // Strategy 1: Reverse along recent path history if available
  if (currentPath && currentPosIndex > 0) {
    const reverseSteps: GridPoint[] = [currentLoc];
    for (let s = 1; s <= steps; s++) {
      const prevIdx = currentPosIndex - s;
      if (prevIdx >= 0) {
        const prevNode = currentPath[prevIdx];
        if (!isBlocked(prevNode.x, prevNode.y, prevNode.f) && isRoad(prevNode.x, prevNode.y, prevNode.f)) {
          if (prevNode.x !== reverseSteps[reverseSteps.length - 1].x || prevNode.y !== reverseSteps[reverseSteps.length - 1].y) {
            reverseSteps.push(prevNode);
          }
        } else {
          break;
        }
      }
    }
    if (reverseSteps.length > 1) {
      return reverseSteps;
    }
  }

  // Strategy 2: Find road neighbors that increase distance from the obstacle
  const neighbors = [
    { x: currentLoc.x, y: currentLoc.y - 1, f: currentLoc.f },
    { x: currentLoc.x, y: currentLoc.y + 1, f: currentLoc.f },
    { x: currentLoc.x - 1, y: currentLoc.y, f: currentLoc.f },
    { x: currentLoc.x + 1, y: currentLoc.y, f: currentLoc.f }
  ];

  const currentDist = Math.abs(currentLoc.x - obsPos.x) + Math.abs(currentLoc.y - obsPos.y);

  const candidateSteps = neighbors
    .filter(n =>
      n.x >= 0 && n.x < mapData.gridSize.x &&
      n.y >= 0 && n.y < mapData.gridSize.y &&
      isRoad(n.x, n.y, n.f) &&
      !isBlocked(n.x, n.y, n.f)
    )
    .map(n => ({
      pos: n,
      dist: Math.abs(n.x - obsPos.x) + Math.abs(n.y - obsPos.y)
    }))
    .sort((a, b) => b.dist - a.dist);

  if (candidateSteps.length > 0 && candidateSteps[0].dist >= currentDist) {
    const step1 = candidateSteps[0].pos;
    const reversePath: GridPoint[] = [currentLoc, step1];

    if (steps > 1) {
      const neighbors2 = [
        { x: step1.x, y: step1.y - 1, f: step1.f },
        { x: step1.x, y: step1.y + 1, f: step1.f },
        { x: step1.x - 1, y: step1.y, f: step1.f },
        { x: step1.x + 1, y: step1.y, f: step1.f }
      ];
      const step1Dist = candidateSteps[0].dist;
      const candidateSteps2 = neighbors2
        .filter(n =>
          n.x >= 0 && n.x < mapData.gridSize.x &&
          n.y >= 0 && n.y < mapData.gridSize.y &&
          (n.x !== currentLoc.x || n.y !== currentLoc.y) &&
          isRoad(n.x, n.y, n.f) &&
          !isBlocked(n.x, n.y, n.f)
        )
        .map(n => ({
          pos: n,
          dist: Math.abs(n.x - obsPos.x) + Math.abs(n.y - obsPos.y)
        }))
        .sort((a, b) => b.dist - a.dist);

      if (candidateSteps2.length > 0 && candidateSteps2[0].dist >= step1Dist) {
        reversePath.push(candidateSteps2[0].pos);
      }
    }

    return reversePath;
  }

  // Fallback: Road-constrained evasion
  return calculateEvadePath(currentLoc, obstacles, mapData);
}

