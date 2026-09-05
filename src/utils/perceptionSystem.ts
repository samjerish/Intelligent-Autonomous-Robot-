import * as THREE from 'three';
import type { GridPoint, MapData } from '../types';

export type DetectedObjectClass =
  | 'Moving obstacle / vehicle'
  | 'Pedestrian'
  | 'Static obstacle'
  | 'Road barricade'
  | 'Road boundary or non-drivable area';

export type CollisionRiskTier = 'CLEAR' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type EarlyDecisionAction =
  | 'CLEAR'
  | 'DIVERSION'
  | 'FOLLOW_SPACE'
  | 'BARRICADE_REROUTE';

export interface ObjectDimensions {
  width: number;
  length: number;
  height: number;
  radius: number; // Hull collision radius
}

export interface TrackedObject {
  id: string;
  classification: DetectedObjectClass;
  position: THREE.Vector3;
  size: ObjectDimensions;
  distance: number; // Euclidean distance from robot
  longitudinalDelta: number; // Distance along path ahead (positive = ahead)
  lateralOffset: number; // Offset from route centerline (negative = left, positive = right)
  movementDirection: THREE.Vector3; // Unit heading vector
  speed: number; // m/s
  velocity: THREE.Vector3; // 3D velocity vector
  predictedFuturePath: THREE.Vector3[]; // Future trajectory points over 3.5s
  collisionRisk: CollisionRiskTier;
  timeToCpa: number; // Seconds to closest point of approach
  cpaDistance: number; // Distance at CPA in meters
  safetyBuffer: number; // Minimum required physical clearance
  actionRequired: EarlyDecisionAction;
}

export interface PerceptionScanResult {
  trackedObjects: TrackedObject[];
  nearestObstacleDist: number;
  primaryRiskObject: TrackedObject | null;
  overallAction: EarlyDecisionAction;
  summary: {
    totalDetected: number;
    vehicles: number;
    pedestrians: number;
    staticObstacles: number;
    barricades: number;
    boundaries: number;
  };
}

/**
 * Predicts the future trajectory of an object over a forward time horizon.
 */
export function predictTrajectory(
  startPos: THREE.Vector3,
  velocity: THREE.Vector3,
  horizonSeconds: number = 3.5,
  stepSeconds: number = 0.5
): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const speed = velocity.length();

  if (speed < 0.05) {
    // Stationary: predicted path remains in place
    for (let t = stepSeconds; t <= horizonSeconds; t += stepSeconds) {
      points.push(startPos.clone());
    }
    return points;
  }

  for (let t = stepSeconds; t <= horizonSeconds; t += stepSeconds) {
    const futurePt = startPos.clone().add(velocity.clone().multiplyScalar(t));
    points.push(futurePt);
  }
  return points;
}

/**
 * Computes Closest Point of Approach (CPA) between robot and an obstacle.
 */
export function computeCPA(
  robotPos: THREE.Vector3,
  robotVel: THREE.Vector3,
  obsPos: THREE.Vector3,
  obsVel: THREE.Vector3,
  horizonSeconds: number = 4.0
): { timeToCpa: number; cpaDistance: number } {
  const relPos = new THREE.Vector3().subVectors(obsPos, robotPos);
  const relVel = new THREE.Vector3().subVectors(obsVel, robotVel);
  const relSpeedSq = relVel.lengthSq();

  if (relSpeedSq < 0.001) {
    return { timeToCpa: 0, cpaDistance: relPos.length() };
  }

  // t_cpa = - (relPos . relVel) / |relVel|^2
  let tCpa = -relPos.dot(relVel) / relSpeedSq;
  tCpa = THREE.MathUtils.clamp(tCpa, 0, horizonSeconds);

  const robotAtCpa = robotPos.clone().add(robotVel.clone().multiplyScalar(tCpa));
  const obsAtCpa = obsPos.clone().add(obsVel.clone().multiplyScalar(tCpa));
  const cpaDist = robotAtCpa.distanceTo(obsAtCpa);

  return { timeToCpa: tCpa, cpaDistance: cpaDist };
}

/**
 * Evaluates collision risk tier based on CPA distance and required safety buffer.
 */
export function evaluateRiskTier(
  cpaDist: number,
  safetyBuffer: number,
  timeToCpa: number
): CollisionRiskTier {
  if (timeToCpa > 3.5 || cpaDist > safetyBuffer + 3.0) {
    return 'CLEAR';
  }
  if (cpaDist > safetyBuffer + 1.5) {
    return 'LOW';
  }
  if (cpaDist > safetyBuffer + 0.6) {
    return 'MEDIUM';
  }
  if (cpaDist > safetyBuffer) {
    return 'HIGH';
  }
  return 'CRITICAL';
}

/**
 * Real-time object detection and tracking scan across the full drivable road area.
 */
export function trackEnvironmentObjects(
  robotPos: THREE.Vector3,
  robotHeading: THREE.Vector3,
  robotSpeed: number,
  routeCurve: THREE.CatmullRomCurve3 | null,
  totalRouteLength: number,
  currentRouteDist: number,
  dynamicObstacles: any[],
  staticObstacles: GridPoint[],
  userBlockers: GridPoint[],
  mapData: MapData | null,
  getGridPosFn: (pt: GridPoint, gridSize: GridPoint, yOffset: number, isMapView: boolean) => [number, number, number],
  isPointOnDrivableRoadFn: (x: number, z: number, mapData: MapData | null, margin: number) => boolean,
  gridSize: GridPoint,
  isMapView: boolean,
  sensorRadius: number = 16.0
): PerceptionScanResult {
  const tracked: TrackedObject[] = [];
  let nearestDist = 999;
  const robotVel = robotHeading.clone().multiplyScalar(robotSpeed);

  // 1. Scan Dynamic Obstacles (Vehicles and Pedestrians)
  if (dynamicObstacles && dynamicObstacles.length > 0) {
    for (const d of dynamicObstacles) {
      let obsPos: THREE.Vector3;
      if (d.pos3D) {
        obsPos = d.pos3D.clone();
      } else if (d.pos) {
        const [x, y, z] = getGridPosFn(d.pos, gridSize, 0.05, isMapView);
        obsPos = new THREE.Vector3(x, y, z);
      } else {
        continue;
      }

      const dist = robotPos.distanceTo(obsPos);
      if (dist > sensorRadius) continue;
      if (dist < nearestDist) nearestDist = dist;

      const isCar = d.type === 'car';
      const classification: DetectedObjectClass = isCar ? 'Moving obstacle / vehicle' : 'Pedestrian';
      const dimensions: ObjectDimensions = isCar
        ? { width: 0.85, length: 1.70, height: 0.75, radius: 0.45 }
        : { width: 0.45, length: 0.45, height: 1.20, radius: 0.32 };

      const vel = d.velocity ? d.velocity.clone() : new THREE.Vector3(0, 0, 0);
      const speed = vel.length();
      const heading = speed > 0.05 ? vel.clone().normalize() : new THREE.Vector3(0, 0, 1);

      // Trajectory projection
      const predictedPath = predictTrajectory(obsPos, vel, 3.5, 0.5);
      const { timeToCpa, cpaDistance } = computeCPA(robotPos, robotVel, obsPos, vel, 4.0);

      // Route projection
      let longitudinalDelta = 0;
      let lateralOffset = 0;
      if (routeCurve && totalRouteLength > 0) {
        const lookStart = Math.max(0, currentRouteDist - 2.0);
        const lookEnd = Math.min(totalRouteLength, currentRouteDist + 16.0);
        let bestDistSq = 9999;
        let sObs = currentRouteDist;
        let ptOnCurve = robotPos;
        let tangentAtPt = robotHeading;

        for (let testS = lookStart; testS <= lookEnd; testS += 0.35) {
          const u = testS / totalRouteLength;
          const curvePt = routeCurve.getPointAt(u);
          const dSq = curvePt.distanceToSquared(obsPos);
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            sObs = testS;
            ptOnCurve = curvePt;
            tangentAtPt = routeCurve.getTangentAt(u);
          }
        }

        longitudinalDelta = sObs - currentRouteDist;
        const normAtPt = new THREE.Vector3(tangentAtPt.z, 0, -tangentAtPt.x).normalize();
        const toObs = new THREE.Vector3().subVectors(obsPos, ptOnCurve);
        lateralOffset = toObs.dot(normAtPt);
      }

      // Safety buffer: pedestrian requires extra buffer (>1.25m), car (>1.20m)
      const safetyBuffer = isCar ? 1.20 : 1.25;
      const collisionRisk = evaluateRiskTier(cpaDistance, safetyBuffer, timeToCpa);

      let action: EarlyDecisionAction = 'CLEAR';
      if (longitudinalDelta > 0.2 && longitudinalDelta < 10.0 && Math.abs(lateralOffset) < 0.95) {
        if (speed < 0.20 || !d.isMoving) {
          action = 'DIVERSION';
        } else {
          action = 'FOLLOW_SPACE';
        }
      }

      tracked.push({
        id: d.id || `dyn_${tracked.length}`,
        classification,
        position: obsPos,
        size: dimensions,
        distance: dist,
        longitudinalDelta,
        lateralOffset,
        movementDirection: heading,
        speed,
        velocity: vel,
        predictedFuturePath: predictedPath,
        collisionRisk,
        timeToCpa,
        cpaDistance,
        safetyBuffer,
        actionRequired: action,
      });
    }
  }

  // 2. Scan Road Barricades (userBlockers)
  if (userBlockers && userBlockers.length > 0) {
    for (let idx = 0; idx < userBlockers.length; idx++) {
      const b = userBlockers[idx];
      const [bx, by, bz] = getGridPosFn(b, gridSize, 0.05, isMapView);
      const bPos = new THREE.Vector3(bx, by, bz);
      const dist = robotPos.distanceTo(bPos);
      if (dist > sensorRadius) continue;
      if (dist < nearestDist) nearestDist = dist;

      let longitudinalDelta = 0;
      let lateralOffset = 0;
      if (routeCurve && totalRouteLength > 0) {
        const lookStart = Math.max(0, currentRouteDist - 1.0);
        const lookEnd = Math.min(totalRouteLength, currentRouteDist + 14.0);
        let bestDistSq = 9999;
        let sObs = currentRouteDist;
        let ptOnCurve = robotPos;
        let tangentAtPt = robotHeading;

        for (let testS = lookStart; testS <= lookEnd; testS += 0.30) {
          const u = testS / totalRouteLength;
          const curvePt = routeCurve.getPointAt(u);
          const dSq = curvePt.distanceToSquared(bPos);
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            sObs = testS;
            ptOnCurve = curvePt;
            tangentAtPt = routeCurve.getTangentAt(u);
          }
        }

        longitudinalDelta = sObs - currentRouteDist;
        const normAtPt = new THREE.Vector3(tangentAtPt.z, 0, -tangentAtPt.x).normalize();
        const toObs = new THREE.Vector3().subVectors(bPos, ptOnCurve);
        lateralOffset = toObs.dot(normAtPt);
      }

      const dimensions: ObjectDimensions = { width: 0.90, length: 0.90, height: 0.85, radius: 0.50 };
      const safetyBuffer = 1.05;
      const { timeToCpa, cpaDistance } = computeCPA(robotPos, robotVel, bPos, new THREE.Vector3(0, 0, 0), 4.0);
      const collisionRisk = evaluateRiskTier(cpaDistance, safetyBuffer, timeToCpa);

      let action: EarlyDecisionAction = 'CLEAR';
      if (longitudinalDelta > 0.1 && longitudinalDelta < 8.5 && Math.abs(lateralOffset) < 1.35) {
        action = 'BARRICADE_REROUTE';
      }

      tracked.push({
        id: `barricade_${b.x}_${b.y}_${idx}`,
        classification: 'Road barricade',
        position: bPos,
        size: dimensions,
        distance: dist,
        longitudinalDelta,
        lateralOffset,
        movementDirection: new THREE.Vector3(0, 0, 0),
        speed: 0,
        velocity: new THREE.Vector3(0, 0, 0),
        predictedFuturePath: [bPos.clone(), bPos.clone(), bPos.clone()],
        collisionRisk,
        timeToCpa,
        cpaDistance,
        safetyBuffer,
        actionRequired: action,
      });
    }
  }

  // 3. Scan Static Obstacles (general map obstacles)
  if (staticObstacles && staticObstacles.length > 0) {
    for (let idx = 0; idx < staticObstacles.length; idx++) {
      const sPt = staticObstacles[idx];
      const [sx, sy, sz] = getGridPosFn(sPt, gridSize, 0.05, isMapView);
      const sPos = new THREE.Vector3(sx, sy, sz);
      const dist = robotPos.distanceTo(sPos);
      if (dist > sensorRadius) continue;
      if (dist < nearestDist) nearestDist = dist;

      let longitudinalDelta = 0;
      let lateralOffset = 0;
      if (routeCurve && totalRouteLength > 0) {
        const lookStart = Math.max(0, currentRouteDist - 1.0);
        const lookEnd = Math.min(totalRouteLength, currentRouteDist + 14.0);
        let bestDistSq = 9999;
        let sObs = currentRouteDist;
        let ptOnCurve = robotPos;
        let tangentAtPt = robotHeading;

        for (let testS = lookStart; testS <= lookEnd; testS += 0.35) {
          const u = testS / totalRouteLength;
          const curvePt = routeCurve.getPointAt(u);
          const dSq = curvePt.distanceToSquared(sPos);
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            sObs = testS;
            ptOnCurve = curvePt;
            tangentAtPt = routeCurve.getTangentAt(u);
          }
        }

        longitudinalDelta = sObs - currentRouteDist;
        const normAtPt = new THREE.Vector3(tangentAtPt.z, 0, -tangentAtPt.x).normalize();
        const toObs = new THREE.Vector3().subVectors(sPos, ptOnCurve);
        lateralOffset = toObs.dot(normAtPt);
      }

      const dimensions: ObjectDimensions = { width: 0.80, length: 0.80, height: 0.80, radius: 0.45 };
      const safetyBuffer = 1.0;
      const { timeToCpa, cpaDistance } = computeCPA(robotPos, robotVel, sPos, new THREE.Vector3(0, 0, 0), 4.0);
      const collisionRisk = evaluateRiskTier(cpaDistance, safetyBuffer, timeToCpa);

      let action: EarlyDecisionAction = 'CLEAR';
      if (longitudinalDelta > 0.1 && longitudinalDelta < 8.0 && Math.abs(lateralOffset) < 1.10) {
        action = 'DIVERSION';
      }

      tracked.push({
        id: `static_${sPt.x}_${sPt.y}_${idx}`,
        classification: 'Static obstacle',
        position: sPos,
        size: dimensions,
        distance: dist,
        longitudinalDelta,
        lateralOffset,
        movementDirection: new THREE.Vector3(0, 0, 0),
        speed: 0,
        velocity: new THREE.Vector3(0, 0, 0),
        predictedFuturePath: [sPos.clone(), sPos.clone(), sPos.clone()],
        collisionRisk,
        timeToCpa,
        cpaDistance,
        safetyBuffer,
        actionRequired: action,
      });
    }
  }

  // 4. Scan Road Boundary / Non-Drivable Area Points
  if (routeCurve && totalRouteLength > 0 && mapData) {
    const lookS = Math.min(totalRouteLength, currentRouteDist + 1.2);
    const u = lookS / totalRouteLength;
    const centerPt = routeCurve.getPointAt(u);
    const tangent = routeCurve.getTangentAt(u).normalize();
    const normal = new THREE.Vector3(tangent.z, 0, -tangent.x);

    // Test left and right road borders at 1.4m and 1.8m
    const leftBorder = centerPt.clone().add(normal.clone().multiplyScalar(-1.45));
    const rightBorder = centerPt.clone().add(normal.clone().multiplyScalar(1.45));

    if (!isPointOnDrivableRoadFn(leftBorder.x, leftBorder.z, mapData, 0.20)) {
      const dist = robotPos.distanceTo(leftBorder);
      tracked.push({
        id: 'boundary_left',
        classification: 'Road boundary or non-drivable area',
        position: leftBorder,
        size: { width: 0.3, length: 1.0, height: 0.2, radius: 0.25 },
        distance: dist,
        longitudinalDelta: 1.2,
        lateralOffset: -1.45,
        movementDirection: tangent.clone(),
        speed: 0,
        velocity: new THREE.Vector3(0, 0, 0),
        predictedFuturePath: [leftBorder.clone(), leftBorder.clone()],
        collisionRisk: dist < 0.75 ? 'HIGH' : 'LOW',
        timeToCpa: 0,
        cpaDistance: dist,
        safetyBuffer: 0.25,
        actionRequired: 'CLEAR',
      });
    }

    if (!isPointOnDrivableRoadFn(rightBorder.x, rightBorder.z, mapData, 0.20)) {
      const dist = robotPos.distanceTo(rightBorder);
      tracked.push({
        id: 'boundary_right',
        classification: 'Road boundary or non-drivable area',
        position: rightBorder,
        size: { width: 0.3, length: 1.0, height: 0.2, radius: 0.25 },
        distance: dist,
        longitudinalDelta: 1.2,
        lateralOffset: 1.45,
        movementDirection: tangent.clone(),
        speed: 0,
        velocity: new THREE.Vector3(0, 0, 0),
        predictedFuturePath: [rightBorder.clone(), rightBorder.clone()],
        collisionRisk: dist < 0.75 ? 'HIGH' : 'LOW',
        timeToCpa: 0,
        cpaDistance: dist,
        safetyBuffer: 0.25,
        actionRequired: 'CLEAR',
      });
    }
  }

  // Sort tracked objects by closest distance
  tracked.sort((a, b) => a.distance - b.distance);

  // Determine overall action and primary risk object
  let overallAction: EarlyDecisionAction = 'CLEAR';
  let primaryRisk: TrackedObject | null = null;

  for (const obj of tracked) {
    if (obj.actionRequired === 'BARRICADE_REROUTE') {
      overallAction = 'BARRICADE_REROUTE';
      primaryRisk = obj;
      break;
    } else if (obj.actionRequired === 'DIVERSION') {
      if (!primaryRisk) {
        overallAction = 'DIVERSION';
        primaryRisk = obj;
      }
    } else if (obj.actionRequired === 'FOLLOW_SPACE') {
      if (!primaryRisk && overallAction === 'CLEAR') {
        overallAction = 'FOLLOW_SPACE';
        primaryRisk = obj;
      }
    }
  }

  const summary = {
    totalDetected: tracked.length,
    vehicles: tracked.filter(o => o.classification === 'Moving obstacle / vehicle').length,
    pedestrians: tracked.filter(o => o.classification === 'Pedestrian').length,
    staticObstacles: tracked.filter(o => o.classification === 'Static obstacle').length,
    barricades: tracked.filter(o => o.classification === 'Road barricade').length,
    boundaries: tracked.filter(o => o.classification === 'Road boundary or non-drivable area').length,
  };

  return {
    trackedObjects: tracked,
    nearestObstacleDist: nearestDist === 999 ? 0 : nearestDist,
    primaryRiskObject: primaryRisk,
    overallAction,
    summary,
  };
}
