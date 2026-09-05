import * as THREE from 'three';
import { assessPreMovementEnvironment } from '../src/utils/perceptionSystem';
import type { MapData, GridPoint } from '../src/types';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${msg}`);
}

console.log('=== VERIFYING PRE-MOVEMENT ENVIRONMENTAL AWARENESS ===\n');

const mockMap: MapData = {
  roads: [
    { x: 0, y: 0, width: 4, height: 20 },
    { x: 0, y: 10, width: 20, height: 4 },
  ],
  obstacles: [],
  deliveryRooms: [],
  checkpoints: [],
  chargingStation: { x: 0, y: 0 },
  robotHome: { x: 0, y: 0 },
  gridSize: { x: 20, y: 20 },
};

const candidatePath: GridPoint[] = [
  { x: 2, y: 1 },
  { x: 2, y: 2 },
  { x: 2, y: 3 },
  { x: 2, y: 4 },
  { x: 2, y: 5 },
  { x: 2, y: 6 },
];

const startPos = new THREE.Vector3(2, 0.22, 1);

// --- TEST 1: Clear Departure Road Corridor ---
console.log('--- TEST 1: Clear Departure Road Corridor ---');
const clearScan = assessPreMovementEnvironment(
  startPos,
  candidatePath,
  mockMap,
  [],
  [],
  [],
  (pt) => [pt.x, 0.22, pt.y],
  (_x, _z) => true,
  mockMap.gridSize,
  false
);

assert(clearScan.isSafeToDepart === true, 'Clear path is safe to depart');
assert(clearScan.hasImmediateBarricade === false, 'No immediate barricade detected');
assert(clearScan.recommendedAction === 'PROCEED', 'Recommended action is PROCEED');
assert(clearScan.drivableClearance >= 5.0, `Safe clearance verified (${clearScan.drivableClearance}m)`);

// --- TEST 2: Road Barricade in Immediate Departure Path ---
console.log('\n--- TEST 2: Road Barricade in Immediate Departure Path ---');
const barricadeBlockers: GridPoint[] = [{ x: 2, y: 3 }]; // 2 nodes ahead
const barricadeScan = assessPreMovementEnvironment(
  startPos,
  candidatePath,
  mockMap,
  [],
  [],
  barricadeBlockers,
  (pt) => [pt.x, 0.22, pt.y],
  (_x, _z) => true,
  mockMap.gridSize,
  false
);

assert(barricadeScan.isSafeToDepart === false, 'Blocked departure corridor is NOT safe to depart directly');
assert(barricadeScan.hasImmediateBarricade === true, 'Barricade identified before moving');
assert(barricadeScan.recommendedAction === 'REROUTE_BARRICADE', 'Recommended action triggers REROUTE_BARRICADE before movement');
assert(barricadeScan.immediateObstacleType === 'barricade', 'Obstacle classified as barricade');

// --- TEST 3: Dynamic Obstacle (Vehicle / Pedestrian) Near Departure Point ---
console.log('\n--- TEST 3: Dynamic Obstacle (Vehicle / Pedestrian) Near Departure Point ---');
const dynamicObstacles = [
  {
    id: 'dyn_car_near',
    type: 'car',
    pos: { x: 2, y: 2.5 },
    speed: 1.5,
    isMoving: true,
  },
];

const dynamicScan = assessPreMovementEnvironment(
  startPos,
  candidatePath,
  mockMap,
  dynamicObstacles,
  [],
  [],
  (pt) => [pt.x, 0.22, pt.y],
  (_x, _z) => true,
  mockMap.gridSize,
  false
);

assert(dynamicScan.hasImmediateObstacle === true, 'Immediate vehicle detected in departure vicinity');
assert(dynamicScan.immediateObstacleType === 'vehicle', 'Classified as vehicle');
assert(dynamicScan.recommendedAction === 'ADAPT_LANE', 'Recommended action is ADAPT_LANE');

// --- TEST 4: Road Boundary Awareness ---
console.log('\n--- TEST 4: Road Boundary Proximity Awareness ---');
const boundaryScan = assessPreMovementEnvironment(
  new THREE.Vector3(1.9, 0.22, 1),
  candidatePath,
  mockMap,
  [],
  [],
  [],
  (pt) => [pt.x, 0.22, pt.y],
  (x, _z) => Math.abs(x) < 1.0, // Returns false outside center road margin
  mockMap.gridSize,
  false
);

assert(boundaryScan.openSpaceSummary.includes('road boundary'), 'Boundary proximity detected and accounted for');

console.log('\n=== ALL PRE-MOVEMENT ENVIRONMENTAL AWARENESS TESTS PASSED ===');
