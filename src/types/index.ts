export interface Strategy {
  id: string;
  name: string;
  time: string;
  energy: string;
  risk: string;
  confidence: string;
  score: number;
  description: string;
  color: string;
}

export interface GridPoint {
  x: number;
  y: number;
  f: number; // Floor (0, 1, 2)
}

export interface Room {
  id: string;
  name: string;
  start: GridPoint;
  end: GridPoint; // Rectangular room spanning from start to end (inclusive)
  color: string;
  type?: string;
  door: GridPoint; // Entry point
  icon?: string; // Furniture/Icon identifier
  occupancy?: number;
  status?: string;
}

export interface DynamicEntity {
  id: string;
  type: 'professor' | 'student' | 'staff' | 'cleaner' | 'visitor' | 'security';
  path: GridPoint[];
  currentPos: GridPoint;
}

export interface AIExplanation {
  pointIndex: number;
  message: string;
}

export interface MissionTask {
  id: string;
  type: 'pickup' | 'delivery' | 'cleaning' | 'patrol' | 'go_to' | 'return';
  location: GridPoint;
  locationName: string;
}

export interface MapData {
  gridSize: GridPoint; // {x, y, f} representing width, depth, floors
  start: GridPoint;
  end: GridPoint;
  tasks?: MissionTask[];
  obstacles: GridPoint[];
  stairs: GridPoint[]; // Locations where the robot can move f + 1 or f - 1
  elevators: GridPoint[]; // Locations where the robot can move across any f
  rooms: Room[];
  columns: GridPoint[];
  roads?: GridPoint[];
  entities?: DynamicEntity[];
}

export interface MissionResult {
  mission: string;
  strategies: Strategy[];
  mapData: MapData;
}

export interface MissionHistoryItem {
  id: string;
  timestamp: number;
  mission: string;
  result: MissionResult;
  selectedStrategyId: string | null;
}
