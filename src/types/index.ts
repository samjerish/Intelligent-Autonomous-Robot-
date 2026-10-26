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

export interface FireDetectionItem {
  type: 'fire' | 'smoke';
  label: string;
  confidence: number;
  bbox: [number, number, number, number];
  area?: number;
  verification_method?: string;
}

export interface FireLocationInfo {
  is_inside_building: boolean;
  building_id: string;
  building_name: string;
  zone: string;
  building_type: string;
  floor: string;
  door_coordinate?: GridPoint;
  nearest_distance_meters?: number;
  relative_direction?: string;
  coordinates: { x: number; y: number; floor?: number };
  display_location: string;
  speech_location?: string;
}

export interface FireIncident {
  id: string;
  status: 'ACTIVE_EMERGENCY' | 'ACKNOWLEDGED' | 'RESOLVED';
  detection_type: string;
  confidence: number;
  detections: FireDetectionItem[];
  timestamp: number;
  timestamp_formatted: string;
  last_seen_timestamp: number;
  location: FireLocationInfo;
  robot_position: { x: number; y: number; floor?: number };
  safe_observation_point: GridPoint;
  snapshot_filename?: string;
  snapshot_base64?: string;
  acknowledgement: {
    is_acknowledged: boolean;
    acknowledged_by?: string | null;
    acknowledged_at?: string | null;
  };
  notifications: {
    sms_status: 'pending' | 'sent' | 'delivered' | 'failed';
    voice_status: 'pending' | 'sent' | 'initiated' | 'failed';
    dispatch_details?: any;
  };
}

export interface FireHazardPoint {
  id: string;
  position: GridPoint;
  type: 'fire' | 'smoke' | 'fire_and_smoke';
  intensity: number;
  active: boolean;
}

export interface CrowdIncident {
  id: string;
  position: GridPoint;
  label: string;
  density: number;
  timestamp: number;
  status: 'DETECTED' | 'DISPERSING' | 'ESCORTING' | 'RESOLVED';
}

export interface InterruptedMission {
  missionText?: string;
  destination: GridPoint;
  destinationName?: string;
  remainingTasks?: MissionTask[];
  taskIndex: number;
  previousState: 'mission' | 'patrol' | 'returning_home' | 'idle';
  strategyId?: string;
}
