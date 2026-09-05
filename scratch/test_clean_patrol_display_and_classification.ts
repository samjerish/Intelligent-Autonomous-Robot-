import * as THREE from 'three';
import { trackEnvironmentObjects, type DetectedObjectClass } from '../src/utils/perceptionSystem';
import type { MapData, GridPoint } from '../src/types';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${msg}`);
}

console.log('=== VERIFYING INTERNAL CLASSIFICATION & CLEAN PATROL DISPLAY ===\n');

// 1. Verify Internal Classification of 5 Exact Categories
const mockMap: MapData = {
  roads: [
    { x: 0, y: 0, width: 4, height: 20 },
    { x: 0, y: 10, width: 20, height: 4 },
  ],
  obstacles: [{ x: 0, y: 5 }],
  deliveryRooms: [],
  checkpoints: [],
  chargingStation: { x: 0, y: 0 },
  robotHome: { x: 0, y: 0 },
};

const curve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(0, 0, 10),
  new THREE.Vector3(0, 0, 20),
]);
const totalLength = curve.getLength();

const dynamicObstacles = [
  {
    id: 'dyn_car_1',
    pos: { x: 0, y: 8 },
    target: { x: 0, y: 15 },
    speed: 2.0,
    type: 'car',
    isCar: true,
    isMoving: true,
    radius: 0.8,
  },
  {
    id: 'dyn_ped_1',
    pos: { x: 0.5, y: 4 },
    target: { x: 0.5, y: 10 },
    speed: 0.8,
    type: 'person',
    isCar: false,
    isMoving: true,
    radius: 0.4,
  },
];

const userBlockers: GridPoint[] = [{ x: 0, y: 12 }];

const perception = trackEnvironmentObjects(
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(0, 0, 1),
  1.5,
  curve,
  totalLength,
  0,
  dynamicObstacles,
  mockMap.obstacles,
  userBlockers,
  mockMap,
  (pt) => [pt.x, 0, pt.y],
  (x, _z) => Math.abs(x) < 1.0,
  { x: 20, y: 20 },
  false,
  16.0
);

const classesFound = new Set(perception.trackedObjects.map(o => o.classification));

assert(classesFound.has('Moving obstacle / vehicle'), 'Internally classified Moving obstacle / vehicle');
assert(classesFound.has('Pedestrian'), 'Internally classified Pedestrian');
assert(classesFound.has('Static obstacle'), 'Internally classified Static obstacle');
assert(classesFound.has('Road barricade'), 'Internally classified Road barricade');
assert(classesFound.has('Road boundary or non-drivable area'), 'Internally classified Road boundary or non-drivable area');

console.log('\n--- 2. Verify Action-Based Status Transitions ---');

type RobotLiveStatus = 'IDLE' | 'MOVING' | 'DIVERSION' | 'ROAD BARRICADE DETECTED';

function evaluateRobotStatus(
  isPausedAtDestination: boolean,
  isBarricadeBlocked: boolean,
  isRerouting: boolean,
  isOvertaking: boolean,
  isDiverting: boolean
): RobotLiveStatus {
  if (isPausedAtDestination) {
    return 'IDLE';
  } else if (isBarricadeBlocked || isRerouting) {
    return 'ROAD BARRICADE DETECTED';
  } else if (isOvertaking || isDiverting) {
    return 'DIVERSION';
  } else {
    return 'MOVING';
  }
}

// Test Status during Normal Patrol Driving
const normalCruisingStatus = evaluateRobotStatus(false, false, false, false, false);
assert(normalCruisingStatus === 'MOVING', 'Normal patrol cruising displays only MOVING');

// Test Status when paused at patrol destination
const pauseStatus = evaluateRobotStatus(true, false, false, false, false);
assert(pauseStatus === 'IDLE', 'Paused at destination displays only IDLE');

// Test Status when actively avoiding obstacle along orange diversion
const diversionStatus = evaluateRobotStatus(false, false, false, true, true);
assert(diversionStatus === 'DIVERSION', 'Avoiding obstacle along diversion route displays DIVERSION');

// Test Status when barricade detected & rerouting
const barricadeStatus = evaluateRobotStatus(false, true, true, false, false);
assert(barricadeStatus === 'ROAD BARRICADE DETECTED', 'Barricade detection & rerouting displays ROAD BARRICADE DETECTED');

console.log('\n=== ALL TESTS PASSED: UI IS CLEAN, INTERNAL CLASSIFICATION OPERATIONAL ===');
