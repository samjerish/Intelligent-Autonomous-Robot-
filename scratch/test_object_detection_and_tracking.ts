import * as THREE from 'three';
import {
  trackEnvironmentObjects,
  predictTrajectory,
  computeCPA,
  evaluateRiskTier,
  DetectedObjectClass,
  TrackedObject,
  EarlyDecisionAction
} from '../src/utils/perceptionSystem';
import type { MapData, GridPoint } from '../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

console.log('=== REAL-TIME OBJECT-DETECTION & TRACKING SYSTEM VERIFICATION ===\n');

// Mock Map Data with road corridor
const mockMapData: MapData = {
  roads: [
    { start: { x: 5, y: 5 }, end: { x: 5, y: 25 }, width: 3 },
    { start: { x: 5, y: 25 }, end: { x: 25, y: 25 }, width: 3 },
  ],
  start: { x: 5, y: 5 },
  destinations: [{ x: 25, y: 25 }],
  obstacles: [{ x: 5, y: 15 }], // Static map obstacle
  rooms: []
};

const gridSize: GridPoint = { x: 30, y: 30 };

function mockGetGridPos(pt: GridPoint): [number, number, number] {
  return [pt.x, 0.05, pt.y];
}

function mockIsPointOnDrivableRoad(x: number, z: number): boolean {
  // Road corridor between x=3.5 and 6.5 along z=5..25
  return x >= 3.5 && x <= 6.5 && z >= 4.0 && z <= 26.0;
}

// Nominal straight route curve along z axis
const routePts = [
  new THREE.Vector3(5, 0, 5),
  new THREE.Vector3(5, 0, 10),
  new THREE.Vector3(5, 0, 15),
  new THREE.Vector3(5, 0, 20),
  new THREE.Vector3(5, 0, 25),
];
const routeCurve = new THREE.CatmullRomCurve3(routePts);
const totalRouteLength = routeCurve.getLength();

// --- TEST 1: Trajectory Prediction & Future Path Horizon ---
console.log('--- TEST 1: Trajectory Prediction & Future Horizon ---');
{
  const startPos = new THREE.Vector3(5, 0, 10);
  const velocity = new THREE.Vector3(0, 0, 1.2); // moving at 1.2 m/s along +Z
  const horizon = 3.5;
  const step = 0.5;
  const path = predictTrajectory(startPos, velocity, horizon, step);

  assert(path.length === 7, `Predicted path contains 7 steps over 3.5s horizon (got ${path.length})`);
  assert(Math.abs(path[path.length - 1].z - (10 + 1.2 * 3.5)) < 0.01, `Final predicted position at 3.5s is correct (${path[path.length - 1].z})`);
  assert(path[0].z > startPos.z, 'Trajectory moves forward in time');
}

// --- TEST 2: Closest Point of Approach (CPA) & Safety Buffer ---
console.log('\n--- TEST 2: Closest Point of Approach (CPA) & Safety Buffer ---');
{
  const robotPos = new THREE.Vector3(5, 0, 5);
  const robotVel = new THREE.Vector3(0, 0, 1.0);
  const obsPos = new THREE.Vector3(5.5, 0, 12);
  const obsVel = new THREE.Vector3(0, 0, 0.2);

  const { timeToCpa, cpaDistance } = computeCPA(robotPos, robotVel, obsPos, obsVel, 10.0);
  assert(timeToCpa > 0, `Time to CPA is positive (${timeToCpa.toFixed(2)}s)`);
  assert(cpaDistance >= 0.49 && cpaDistance <= 0.55, `CPA separation accounts for lateral offset (${cpaDistance.toFixed(2)}m)`);

  const safetyBuffer = 1.25;
  const risk = evaluateRiskTier(cpaDistance, safetyBuffer, timeToCpa);
  assert(risk === 'CRITICAL' || risk === 'HIGH', `High/Critical risk detected when approaching within safety buffer (${risk})`);
}

// --- TEST 3: Classification of All 5 Required Categories ---
console.log('\n--- TEST 3: Classification of All 5 Required Categories ---');
{
  const robotPos = new THREE.Vector3(5, 0, 6);
  const robotHeading = new THREE.Vector3(0, 0, 1);
  const currentRouteDist = 1.0;

  const dynamicObstacles = [
    { id: 'car_1', type: 'car', pos3D: new THREE.Vector3(5.35, 0, 14), velocity: new THREE.Vector3(0, 0, 0.8), isMoving: true },
    { id: 'ped_1', type: 'person', pos3D: new THREE.Vector3(4.8, 0, 10), velocity: new THREE.Vector3(0.1, 0, 0), isMoving: true }
  ];

  const staticObstacles: GridPoint[] = [{ x: 5, y: 18 }];
  const userBlockers: GridPoint[] = [{ x: 5, y: 22 }];

  const scan = trackEnvironmentObjects(
    robotPos,
    robotHeading,
    1.0,
    routeCurve,
    totalRouteLength,
    currentRouteDist,
    dynamicObstacles,
    staticObstacles,
    userBlockers,
    mockMapData,
    mockGetGridPos,
    mockIsPointOnDrivableRoad,
    gridSize,
    false,
    20.0
  );

  const classesFound = new Set(scan.trackedObjects.map(o => o.classification));

  assert(classesFound.has('Moving obstacle / vehicle'), 'Detected and classified "Moving obstacle / vehicle"');
  assert(classesFound.has('Pedestrian'), 'Detected and classified "Pedestrian"');
  assert(classesFound.has('Static obstacle'), 'Detected and classified "Static obstacle"');
  assert(classesFound.has('Road barricade'), 'Detected and classified "Road barricade"');
  assert(classesFound.has('Road boundary or non-drivable area'), 'Detected and classified "Road boundary or non-drivable area"');

  console.log('Classified categories found:', Array.from(classesFound));
}

// --- TEST 4: Early Decision Making - Road Barricade Detection & Reroute ---
console.log('\n--- TEST 4: Early Decision Making - Road Barricade Detection ---');
{
  const robotPos = new THREE.Vector3(5, 0, 6);
  const robotHeading = new THREE.Vector3(0, 0, 1);
  const userBlockers: GridPoint[] = [{ x: 5, y: 11 }]; // 5m ahead on route

  const scan = trackEnvironmentObjects(
    robotPos,
    robotHeading,
    1.0,
    routeCurve,
    totalRouteLength,
    1.0,
    [],
    [],
    userBlockers,
    mockMapData,
    mockGetGridPos,
    mockIsPointOnDrivableRoad,
    gridSize,
    false,
    16.0
  );

  const barricade = scan.trackedObjects.find(o => o.classification === 'Road barricade');
  assert(barricade !== undefined, 'Road barricade tracked');
  assert(barricade!.actionRequired === 'BARRICADE_REROUTE', `Barricade triggers BARRICADE_REROUTE action (got ${barricade?.actionRequired})`);
  assert(scan.overallAction === 'BARRICADE_REROUTE', `Overall action is BARRICADE_REROUTE (got ${scan.overallAction})`);
}

// --- TEST 5: Early Decision Making - Diversion vs Following Distance ---
console.log('\n--- TEST 5: Early Decision Making - Diversion vs Following Space ---');
{
  const robotPos = new THREE.Vector3(5, 0, 6);
  const robotHeading = new THREE.Vector3(0, 0, 1);

  // Slow/stationary obstacle blocking lane -> should trigger DIVERSION
  const stationaryObs = [
    { id: 'parked_car', type: 'car', pos3D: new THREE.Vector3(5.0, 0, 11), velocity: new THREE.Vector3(0, 0, 0), isMoving: false }
  ];

  const scanDiversion = trackEnvironmentObjects(
    robotPos,
    robotHeading,
    1.0,
    routeCurve,
    totalRouteLength,
    1.0,
    stationaryObs,
    [],
    [],
    mockMapData,
    mockGetGridPos,
    mockIsPointOnDrivableRoad,
    gridSize,
    false,
    16.0
  );

  assert(scanDiversion.overallAction === 'DIVERSION', `Stationary lane obstacle triggers DIVERSION (got ${scanDiversion.overallAction})`);

  // Moving vehicle cruising ahead -> should trigger FOLLOW_SPACE
  const cruisingObs = [
    { id: 'lead_car', type: 'car', pos3D: new THREE.Vector3(5.0, 0, 11), velocity: new THREE.Vector3(0, 0, 0.7), isMoving: true }
  ];

  const scanFollowing = trackEnvironmentObjects(
    robotPos,
    robotHeading,
    1.0,
    routeCurve,
    totalRouteLength,
    1.0,
    cruisingObs,
    [],
    [],
    mockMapData,
    mockGetGridPos,
    mockIsPointOnDrivableRoad,
    gridSize,
    false,
    16.0
  );

  assert(scanFollowing.overallAction === 'FOLLOW_SPACE', `Moving vehicle ahead triggers FOLLOW_SPACE (got ${scanFollowing.overallAction})`);
}

// --- TEST 6: Clear Route Detection ---
console.log('\n--- TEST 6: Clear Route Detection ---');
{
  const robotPos = new THREE.Vector3(5, 0, 6);
  const robotHeading = new THREE.Vector3(0, 0, 1);

  const scanClear = trackEnvironmentObjects(
    robotPos,
    robotHeading,
    1.0,
    routeCurve,
    totalRouteLength,
    1.0,
    [],
    [],
    [],
    mockMapData,
    mockGetGridPos,
    mockIsPointOnDrivableRoad,
    gridSize,
    false,
    16.0
  );

  assert(scanClear.overallAction === 'CLEAR', `Empty road corridor triggers CLEAR action (got ${scanClear.overallAction})`);
}

console.log('\n=== ALL OBJECT-DETECTION & TRACKING TESTS PASSED PERFECTLY ===');
