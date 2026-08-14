import type { GridPoint, MapData } from '../types';

export function getObstaclePenalty(x: number, y: number, f: number, obstacles: GridPoint[]) {
  const obstacleSet = new Set(obstacles?.map(o => `${o.x},${o.y},${o.f}`));
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
}export function calculatePath(start: GridPoint, end: GridPoint, obstacles: GridPoint[], mapData: MapData, requireRoads: boolean = false): GridPoint[] {
  // 3D A* pathfinding implementation
  const { gridSize, stairs } = mapData;

  const getStairAt = (x: number, y: number, f: number) => {
    return stairs?.find(s => s.x === x && s.y === y && s.f === f);
  };

  const obstacleSet = new Set(obstacles?.map(o => `${o.x},${o.y},${o.f}`));
  const isObstacle = (x: number, y: number, f: number) => {
    return obstacleSet.has(`${x},${y},${f}`);
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
      const isRoad = !requireRoads || !mapData.roads || mapData.roads.some(r => r.x === neighbor.x && r.y === neighbor.y && r.f === neighbor.f) || (neighbor.x === end.x && neighbor.y === end.y && neighbor.f === end.f);
      
      if (
        neighbor.x >= 0 && neighbor.x < gridSize.x &&
        neighbor.y >= 0 && neighbor.y < gridSize.y &&
        neighbor.f >= 0 && neighbor.f < (gridSize.f || 1) &&
        !isObstacle(neighbor.x, neighbor.y, neighbor.f) &&
        !closedList.has(`${neighbor.x},${neighbor.y},${neighbor.f}`) &&
        isRoad
      ) {
        // Changing floors has a higher cost to simulate stair climbing
        let gCost = neighbor.f !== current.pos.f ? 5 : 1;
        
        // Add penalty for proximity to obstacles to maintain a minimum gap
        if (requireRoads && isRoad(neighbor.x, neighbor.y, neighbor.f)) {
          gCost -= 1; 
        }

        gCost += getObstaclePenalty(neighbor.x, neighbor.y, neighbor.f, obstacles);

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

export function calculateLongPath(start: GridPoint, end: GridPoint, obstacles: GridPoint[], mapData: MapData, requireRoads: boolean = false): GridPoint[] {
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
    return calculatePath(start, end, obstacles, mapData);
  }

  // Calculate path to detour, then from detour to end
  const part1 = calculatePath(start, detourPoint, obstacles, mapData);
  const part2 = calculatePath(detourPoint, end, obstacles, mapData);

  if (part1.length > 0 && part2.length > 0) {
    // Combine paths, avoiding duplicate at the connection point
    return [...part1, ...part2.slice(1)];
  }

  // Fallback if detour pathing fails
  return calculatePath(start, end, obstacles, mapData);
}
