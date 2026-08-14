import type { GridPoint, MapData } from '../types';

function manhattanDistance(a: GridPoint, b: GridPoint) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.f - b.f) * 10;
}

function isAllowedDirection(curr: GridPoint, next: GridPoint): boolean {
  // Enforce two-way lane rules on main arteries
  
  // Moving East (+x)
  if (next.x > curr.x) {
    if (curr.y === 20 || curr.y === 21 || curr.y === 50 || curr.y === 51 || curr.y === 80 || curr.y === 81) return false;
  }
  // Moving West (-x)
  if (next.x < curr.x) {
    if (curr.y === 22 || curr.y === 23 || curr.y === 52 || curr.y === 53 || curr.y === 82 || curr.y === 83) return false;
  }
  // Moving South (+y)
  if (next.y > curr.y) {
    if (curr.x === 25 || curr.x === 26 || curr.x === 63 || curr.x === 64 || curr.x === 90 || curr.x === 91) return false;
  }
  // Moving North (-y)
  if (next.y < curr.y) {
    if (curr.x === 27 || curr.x === 28 || curr.x === 65 || curr.x === 66 || curr.x === 92 || curr.x === 93) return false;
  }
  return true;
}

export function calculatePath(start: GridPoint, end: GridPoint, obstacles: GridPoint[], mapData: MapData, requireRoads: boolean = true): GridPoint[] {
  const { gridSize, stairs } = mapData;

  const getStairAt = (x: number, y: number, f: number) => {
    return stairs?.find(s => s.x === x && s.y === y && s.f === f);
  };

  const obstacleSet = new Set(obstacles?.map(o => `${o.x},${o.y},${o.f}`));
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

    if (getStairAt(current.pos.x, current.pos.y, current.pos.f)) {
      if (current.pos.f < (gridSize.f || 1) - 1 && getStairAt(current.pos.x, current.pos.y, current.pos.f + 1)) {
        neighbors.push({ x: current.pos.x, y: current.pos.y, f: current.pos.f + 1 });
      }
      if (current.pos.f > 0 && getStairAt(current.pos.x, current.pos.y, current.pos.f - 1)) {
        neighbors.push({ x: current.pos.x, y: current.pos.y, f: current.pos.f - 1 });
      }
    }

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
        isAllowedDirection(current.pos, neighbor)
      ) {
        let floorCost = neighbor.f !== current.pos.f ? 5 : 1;
        if (!isRoad) {
           floorCost += 500; // massive penalty for leaving the road, ensuring it only happens to bypass blocks
        }
        
        let proximityCost = 0;
        if (neighbor.x !== end.x || neighbor.y !== end.y || neighbor.f !== end.f) {
           proximityCost = getObstaclePenalty(neighbor.x, neighbor.y, neighbor.f);
        }

        const g = current.g + floorCost + proximityCost;
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

  return [];
}

export function calculateLongPath(start: GridPoint, end: GridPoint, obstacles: GridPoint[], mapData: MapData, requireRoads: boolean = true): GridPoint[] {
  if (!mapData.rooms || mapData.rooms.length === 0) {
    return calculatePath(start, end, obstacles, mapData, requireRoads);
  }

  let detourPoint: GridPoint | null = null;
  let maxDetourDist = 0;

  for (const room of mapData.rooms) {
    const pt = room.door || room.start;
    const distToStart = manhattanDistance(start, pt);
    const distToEnd = manhattanDistance(pt, end);
    const detourScore = distToStart + distToEnd;
    
    if (distToStart > 5 && distToEnd > 5 && detourScore > maxDetourDist) {
      maxDetourDist = detourScore;
      detourPoint = pt;
    }
  }

  if (!detourPoint) {
    return calculatePath(start, end, obstacles, mapData);
  }

  const part1 = calculatePath(start, detourPoint, obstacles, mapData);
  const part2 = calculatePath(detourPoint, end, obstacles, mapData);

  if (part1.length > 0 && part2.length > 0) {
    return [...part1, ...part2.slice(1)];
  }

  return calculatePath(start, end, obstacles, mapData);
}

self.onmessage = (e) => {
  const { id, type, start, end, obstacles, mapData, requireRoads } = e.data;
  
  if (type === 'calculatePath') {
    const path = calculatePath(start, end, obstacles, mapData, requireRoads);
    self.postMessage({ id, path });
  } else if (type === 'calculateLongPath') {
    const path = calculateLongPath(start, end, obstacles, mapData, requireRoads);
    self.postMessage({ id, path });
  }
};
