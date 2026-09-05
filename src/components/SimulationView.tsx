import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import type { MapData, GridPoint, Room } from '../types';
import { calculatePath, calculateLongPath } from '../utils/simulationEngine';
import { Play, RotateCcw, Activity, ShieldAlert, Crosshair, Maximize, Minimize, Bot, Power, Send, Construction, Pause, Users, Utensils, Cross } from 'lucide-react';
import { DeliveryModal } from './DeliveryModal';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  OrbitControls,
  Box,
  Plane,
  OrthographicCamera,
  PerspectiveCamera,
  Html,
  Instances,
  Instance,
  Sphere,
  Cylinder,
  RoundedBox,
} from '@react-three/drei';
import * as THREE from 'three';
import { Line2, LineMaterial, LineGeometry } from 'three-stdlib';

const CELL_SIZE = 1;

export type DynamicObstacle = {
  id: string;
  type: 'car' | 'person';
  pos: GridPoint;
  pos3D?: THREE.Vector3;
  targetPos: GridPoint;
  path: GridPoint[];
  currentIndex: number;
  speed: number;
  velocity?: THREE.Vector3;
  isMoving: boolean;
  isRoadWalker?: boolean;
};

export type RobotState = 'idle' | 'mission' | 'patrol' | 'charging' | 'emergency_response' | 'emergency_to_ctr' | 'ctr_to_emergency' | 'crowd_control' | 'waiting_for_police' | 'evading_obstacle' | 'returning_home' | 'off';

export type PoliceState = {
  active: boolean;
  path: GridPoint[];
  targetPos: GridPoint | null;
  phase: 'dispatching' | 'escorting' | 'idle';
};


const CameraController = ({ isFollowing, robotPosRef, robotRotRef, controlsRef, triggerReset, onResetDone, gridSize, isMapView }: any) => {
  const { camera } = useThree();
  // Smoothed look-target to prevent jitter when following
  const smoothTarget = useRef(new THREE.Vector3(0, 0.5, 0));
  // Heavy low-pass filtered heading to eliminate camera wobble on steering maneuvers
  const smoothHeading = useRef<number | null>(null);

  useFrame((_state, delta) => {
    if (triggerReset) {
      if (controlsRef.current) {
        controlsRef.current.target.set(0, 2, 0);
      }
      if (isMapView) {
        camera.position.set(0, 100, 0);
        if ((camera as THREE.OrthographicCamera).zoom !== undefined) {
          (camera as THREE.OrthographicCamera).zoom = 4;
        }
      } else {
        camera.position.set(0, gridSize.y * 0.9, gridSize.y * 1.35);
      }
      camera.updateProjectionMatrix();
      if (onResetDone) onResetDone();
    }

    if (isFollowing && robotPosRef.current && robotRotRef?.current !== undefined) {
      // 3rd Person Smooth Follow Camera with decoupled yaw damping
      const rawTheta = robotRotRef.current;
      if (smoothHeading.current === null) {
        smoothHeading.current = rawTheta;
      } else {
        let diff = rawTheta - smoothHeading.current;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        // Soft, majestic drone-like heading tracking (delta * 1.5)
        smoothHeading.current += diff * Math.min(1.0, delta * 1.5);
      }

      const behindDist = 4.8;
      const upDist = 2.8;
      
      const heading = smoothHeading.current ?? rawTheta;
      const offset = new THREE.Vector3(
        -Math.sin(heading) * behindDist,
        upDist,
        -Math.cos(heading) * behindDist
      );
      const desiredPos = new THREE.Vector3().copy(robotPosRef.current).add(offset);

      // Deep, vibration-free spring damping for camera position
      const lerpAlpha = 1 - Math.pow(0.001, delta);
      camera.position.lerp(desiredPos, lerpAlpha);

      // Smooth look-at target focused slightly above the robot's chassis
      const targetLook = new THREE.Vector3().copy(robotPosRef.current).add(new THREE.Vector3(0, 0.45, 0));
      smoothTarget.current.lerp(targetLook, lerpAlpha);
      camera.lookAt(smoothTarget.current);

      // Sync orbit controls target smoothly
      if (controlsRef.current) {
        controlsRef.current.target.lerp(targetLook, lerpAlpha);
        controlsRef.current.update();
      }
    }
  });
  return null;
};

const CAR_COLORS = [
  '#ef4444', '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', 
  '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#6366f1', 
  '#e2e8f0', '#e11d48'
];

const SHIRT_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#6366f1'];
const PANTS_COLORS = ['#1e293b', '#334155', '#475569', '#1e1b4b', '#0f172a', '#374151'];
const SKIN_TONES = ['#fcd34d', '#fed7aa', '#fbcfe8', '#e2e8f0', '#d97706'];

const MovingEntity = ({ 
  obstacle, 
  gridSize, 
  isMapView, 
  robotPosRef, 
  allObstaclesRef,
  mapData,
  userBlockers = []
}: { 
  obstacle: DynamicObstacle; 
  gridSize: GridPoint; 
  isMapView: boolean; 
  robotPosRef?: React.MutableRefObject<THREE.Vector3 | null>; 
  allObstaclesRef?: React.MutableRefObject<DynamicObstacle[]>;
  mapData?: MapData | null;
  userBlockers?: GridPoint[];
}) => {
  const ref = useRef<THREE.Group>(null);
  const carIndex = parseInt(obstacle.id.replace(/\D/g, '') || '0', 10);
  const carColor = CAR_COLORS[carIndex % CAR_COLORS.length];
  const isCar = obstacle.type === 'car';
  const isRoadWalker = obstacle.isRoadWalker ?? (!isCar && (carIndex % 3 !== 0));
  const shirtColor = SHIRT_COLORS[carIndex % SHIRT_COLORS.length];
  const pantsColor = PANTS_COLORS[carIndex % PANTS_COLORS.length];
  const skinColor = SKIN_TONES[carIndex % SKIN_TONES.length];
  
  // Lane offset: Road walkers and vehicles stay on right lane (+0.35m); sidewalk walkers use outer margin (+0.60m)
  const baseOffset = (isCar || isRoadWalker) ? 0.35 : 0.60;
  const yieldOffsetRef = useRef(baseOffset);
  const lastDirRef = useRef({ x: 0, z: 1 });
  const walkClockRef = useRef(Math.random() * 10);
  const smoothedSpeedFactorRef = useRef(1.0);
  const stuckTimerRef = useRef(0);
  const lastCheckPosRef = useRef<THREE.Vector3 | null>(null);
  const isExtendingPathRef = useRef(false);
  
  // Animation refs
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const wheel1Ref = useRef<THREE.Group>(null);
  const wheel2Ref = useRef<THREE.Group>(null);
  const wheel3Ref = useRef<THREE.Group>(null);
  const wheel4Ref = useRef<THREE.Group>(null);
  const taillightMatRef = useRef<THREE.MeshStandardMaterial>(null);
  
  useFrame((_state, delta) => {
    if (!ref.current || obstacle.path.length === 0 || !obstacle.isMoving) return;
    const currentPos = ref.current.position;
    
    walkClockRef.current += delta;
    const t = walkClockRef.current;

    // Continuously update obstacle's grid position & 3D world position for real-time tracking
    obstacle.pos = getGridPointFromVector3(currentPos, gridSize);
    obstacle.pos3D = currentPos.clone();

    // ── 1. Seamless Continuous Route Extension (No 180° flips, No stopping) ──
    const remainingNodes = obstacle.path.length - obstacle.currentIndex;
    if (remainingNodes <= 4 && mapData && mapData.roads && mapData.roads.length > 5 && !isExtendingPathRef.current) {
      isExtendingPathRef.current = true;
      const endNode = obstacle.path[obstacle.path.length - 1];
      let candidateTarget: GridPoint | null = null;
      for (let attempt = 0; attempt < 10; attempt++) {
        const r = mapData.roads[Math.floor(Math.random() * mapData.roads.length)];
        if (Math.hypot(r.x - endNode.x, r.y - endNode.y) >= 6) {
          candidateTarget = r;
          break;
        }
      }
      if (!candidateTarget) {
        candidateTarget = mapData.roads[Math.floor(Math.random() * mapData.roads.length)];
      }

      if (candidateTarget && (candidateTarget.x !== endNode.x || candidateTarget.y !== endNode.y)) {
        const allObs = [...(mapData.obstacles || []), ...(userBlockers || [])];
        const extension = calculatePath(endNode, candidateTarget, allObs, mapData, true);
        if (extension && extension.length > 1) {
          obstacle.path.push(...extension.slice(1));
          obstacle.targetPos = obstacle.path[obstacle.path.length - 1];
        }
      }
      isExtendingPathRef.current = false;
    }

    if (obstacle.currentIndex >= obstacle.path.length - 1) {
      obstacle.currentIndex = Math.max(0, obstacle.path.length - 2);
    }

    // ── 2. Lookahead Path Sampling (Smooth continuous trajectory & curvature) ──
    const lookaheadDist = isCar ? 1.4 : 0.9;
    let accumulatedDist = 0;
    const clampedIdx = Math.min(obstacle.currentIndex, obstacle.path.length - 1);
    const [currNodeX, currNodeY, currNodeZ] = getGridPosition(obstacle.path[clampedIdx], gridSize, 0.05, isMapView);
    let prevPt = new THREE.Vector3(currNodeX, currNodeY, currNodeZ);
    let headingVec = new THREE.Vector3(lastDirRef.current.x, 0, lastDirRef.current.z);
    let lookaheadPt = prevPt.clone();
    let pathCurvature = 0;

    for (let i = clampedIdx; i < obstacle.path.length - 1; i++) {
      const [nx, ny, nz] = getGridPosition(obstacle.path[i + 1], gridSize, 0.05, isMapView);
      const nextPt = new THREE.Vector3(nx, ny, nz);
      const segLen = prevPt.distanceTo(nextPt);
      if (accumulatedDist + segLen >= lookaheadDist) {
        const tSeg = Math.max(0, Math.min(1, (lookaheadDist - accumulatedDist) / Math.max(0.01, segLen)));
        lookaheadPt = prevPt.clone().lerp(nextPt, tSeg);
        headingVec = nextPt.clone().sub(prevPt).normalize();

        if (i + 2 < obstacle.path.length) {
          const [nnx, , nnz] = getGridPosition(obstacle.path[i + 2], gridSize, 0.05, isMapView);
          const futureHeading = new THREE.Vector3(nnx - nx, 0, nnz - nz).normalize();
          pathCurvature = Math.abs(headingVec.angleTo(futureHeading));
        }
        break;
      }
      accumulatedDist += segLen;
      prevPt = nextPt;
      lookaheadPt = nextPt.clone();
    }

    if (headingVec.lengthSq() > 0.01) {
      lastDirRef.current = { x: headingVec.x, z: headingVec.z };
    }
    const dirX = lastDirRef.current.x;
    const dirZ = lastDirRef.current.z;
    const latX = dirZ;
    const latZ = -dirX;

    let yieldTarget = baseOffset;
    let isYielding = false;
    let speedFactor = 1.0;
    const myRadius = isCar ? 0.42 : 0.28;

    // ── 3. Predictive Mutual Collision Avoidance with Robot ──
    if (robotPosRef && robotPosRef.current) {
      const distToRobot = currentPos.distanceTo(robotPosRef.current);
      const toRobot = new THREE.Vector3().subVectors(robotPosRef.current, currentPos);
      const fwdToRobot = toRobot.x * dirX + toRobot.z * dirZ;
      const latToRobot = Math.abs(toRobot.x * latX + toRobot.z * latZ);

      // Following behind robot
      if (fwdToRobot > 0.1 && fwdToRobot < 6.5 && latToRobot < 1.30) {
        isYielding = true;
        if (fwdToRobot < 3.2) {
          // Check if passing lane on the left (-0.75m) is clear to pass the robot smoothly
          let passingLaneClear = true;
          if (allObstaclesRef && allObstaclesRef.current) {
            for (const other of allObstaclesRef.current) {
              if (other.id === obstacle.id || !other.pos3D) continue;
              const d = currentPos.distanceTo(other.pos3D);
              if (d < 3.5 && (other.pos3D.x - currentPos.x) * latX + (other.pos3D.z - currentPos.z) * latZ < 0) {
                passingLaneClear = false;
                break;
              }
            }
          }

          if (passingLaneClear && fwdToRobot < 2.8) {
            // Smoothly steer into passing corridor and pass smoothly!
            yieldTarget = -0.75;
            speedFactor = Math.min(speedFactor, 0.85);
          } else {
            // Pace speed smoothly behind robot without stopping (minimum crawl 0.25)
            const followFactor = THREE.MathUtils.clamp((fwdToRobot - 1.8) / 2.2, 0.25, 0.95);
            speedFactor = Math.min(speedFactor, followFactor);
            yieldTarget = 0.45;
          }
        }
      } 
      // Oncoming or passing alongside robot
      else if (distToRobot < 4.5 && fwdToRobot <= 0.1) {
        if (latToRobot < 1.30) {
          yieldTarget = Math.max(yieldTarget, 0.55);
          speedFactor = Math.min(speedFactor, 0.88);
        }
      }

      // Hard physical exclusion: obstacle must NEVER touch or penetrate robot hull (generous safety buffer)
      const minRobotSep = myRadius + 0.40 + 0.35;
      if (distToRobot < minRobotSep && distToRobot > 0.001) {
        const pushDir = toRobot.clone().negate().normalize();
        const overlap = minRobotSep - distToRobot;
        currentPos.add(pushDir.multiplyScalar(overlap * delta * 2.0));
      }
    }

    // ── 4. Predictive Mutual Collision Avoidance with Other Obstacles ──
    if (allObstaclesRef && allObstaclesRef.current) {
      for (const other of allObstaclesRef.current) {
        if (other.id === obstacle.id || !other.pos3D) continue;
        const otherPos = other.pos3D;
        const otherIsCar = other.type === 'car';
        const otherRadius = otherIsCar ? 0.42 : 0.28;
        const minCenterSep = myRadius + otherRadius + 0.45;

        const distToOther = currentPos.distanceTo(otherPos);
        if (distToOther < 7.0) {
          const toOther = new THREE.Vector3().subVectors(otherPos, currentPos);
          const fwd = toOther.x * dirX + toOther.z * dirZ;
          const lat = Math.abs(toOther.x * latX + toOther.z * latZ);

          // Following another obstacle in the same lane
          if (fwd > 0.1 && fwd < 6.0 && lat < 1.25) {
            isYielding = true;
            if (fwd < 3.2) {
              const isOtherSlower = (other.speed || 1.5) < obstacle.speed;
              if (isOtherSlower && fwd < 2.6) {
                yieldTarget = -0.75; // Overtake via left passing corridor!
                speedFactor = Math.min(speedFactor, 0.90);
              } else {
                const pace = THREE.MathUtils.clamp((fwd - minCenterSep) / 2.5, 0.25, 0.95);
                speedFactor = Math.min(speedFactor, pace);
                yieldTarget = 0.50;
              }
            }
          }

          // Oncoming traffic approaching
          const otherVel = other.velocity;
          if (otherVel) {
            const closingSpeed = -(otherVel.x * dirX + otherVel.z * dirZ);
            if (closingSpeed > 0.25 && distToOther < 6.0 && lat < 1.35) {
              isYielding = true;
              yieldTarget = 0.60;
              const adapted = THREE.MathUtils.clamp((distToOther - minCenterSep) / 3.5, 0.55, 0.95);
              speedFactor = Math.min(speedFactor, adapted);
            }
          }

          // Intersection / Crossing traffic (Predictive CPA)
          if (otherVel && Math.abs(fwd) < 3.5 && lat > 0.8 && lat < 4.0) {
            const vSelf = new THREE.Vector3(dirX * obstacle.speed, 0, dirZ * obstacle.speed);
            const vRel = new THREE.Vector3().subVectors(otherVel, vSelf);
            const rRel = toOther.clone();
            const relSpeedSq = vRel.lengthSq();
            if (relSpeedSq > 0.1) {
              const tCpa = -rRel.dot(vRel) / relSpeedSq;
              if (tCpa > 0.2 && tCpa < 2.5) {
                const posSelfAtCpa = currentPos.clone().add(vSelf.clone().multiplyScalar(tCpa));
                const posOtherAtCpa = otherPos.clone().add(otherVel.clone().multiplyScalar(tCpa));
                const distAtCpa = posSelfAtCpa.distanceTo(posOtherAtCpa);
                if (distAtCpa < minCenterSep + 0.40) {
                  if (carIndex > parseInt(other.id.replace(/\D/g, '') || '0', 10)) {
                    isYielding = true;
                    const yieldDecel = THREE.MathUtils.clamp(tCpa / 2.5, 0.35, 0.85);
                    speedFactor = Math.min(speedFactor, yieldDecel);
                  }
                }
              }
            }
          }

          // Zero-overlap repulsive separation
          if (distToOther < minCenterSep && distToOther > 0.001) {
            const pushDir = toOther.clone().negate().normalize();
            const overlap = minCenterSep - distToOther;
            currentPos.add(pushDir.multiplyScalar(overlap * delta * 2.0));
          }
        }
      }
    }

    // ── 5. Smooth Speed Regulation & Dynamic Cornering ──
    yieldOffsetRef.current = THREE.MathUtils.lerp(yieldOffsetRef.current, yieldTarget, delta * 3.5);

    if (taillightMatRef.current) {
      taillightMatRef.current.emissiveIntensity = isYielding ? 2.2 : 1.0;
    }

    // Natural cornering deceleration
    if (pathCurvature > 0.25) {
      const cornerDamp = THREE.MathUtils.lerp(1.0, 0.60, Math.min(1.0, pathCurvature / 1.2));
      speedFactor *= cornerDamp;
    }

    // Guaranteed continuous motion: never drop to 0! Minimum crawling speed 0.22
    const clampedFactor = Math.max(0.22, Math.min(1.0, speedFactor));
    const lerpRate = clampedFactor < smoothedSpeedFactorRef.current ? 3.5 : 2.0;
    smoothedSpeedFactorRef.current = THREE.MathUtils.lerp(smoothedSpeedFactorRef.current, clampedFactor, delta * lerpRate);

    // Organic speed variation
    const organicSpeed = obstacle.speed * (1.0 + 0.08 * Math.sin(t * 0.7 + carIndex * 1.618));
    const currentSpeed = organicSpeed * smoothedSpeedFactorRef.current;

    // ── 6. Visual Animations (Wheels & Legs) ──
    if (!isCar) {
      const walkSpeed = currentSpeed * 3.2;
      const legAngle = Math.sin(t * walkSpeed) * 0.45;
      const armAngle = Math.sin(t * walkSpeed) * -0.4;
      if (leftLegRef.current) leftLegRef.current.rotation.x = legAngle;
      if (rightLegRef.current) rightLegRef.current.rotation.x = -legAngle;
      if (leftArmRef.current) leftArmRef.current.rotation.x = armAngle;
      if (rightArmRef.current) rightArmRef.current.rotation.x = -armAngle;
    } else {
      const wheelSpin = delta * currentSpeed * 3.5;
      if (wheel1Ref.current) wheel1Ref.current.rotation.x += wheelSpin;
      if (wheel2Ref.current) wheel2Ref.current.rotation.x += wheelSpin;
      if (wheel3Ref.current) wheel3Ref.current.rotation.x += wheelSpin;
      if (wheel4Ref.current) wheel4Ref.current.rotation.x += wheelSpin;
    }

    // ── 7. Lookahead Target Vector & Smooth Motion Update ──
    const targetVector = new THREE.Vector3(
      lookaheadPt.x + latX * yieldOffsetRef.current,
      lookaheadPt.y,
      lookaheadPt.z + latZ * yieldOffsetRef.current
    );

    // Advance waypoint progression along path
    if (obstacle.currentIndex < obstacle.path.length - 1) {
      const currNode = obstacle.path[obstacle.currentIndex];
      const [cnx, , cnz] = getGridPosition(currNode, gridSize, 0.05, isMapView);
      const toNode = new THREE.Vector3(cnx - currentPos.x, 0, cnz - currentPos.z);
      if (toNode.dot(headingVec) <= 0.25 || currentPos.distanceTo(new THREE.Vector3(cnx, currentPos.y, cnz)) < 0.65) {
        obstacle.currentIndex++;
        obstacle.pos = obstacle.path[obstacle.currentIndex];
      }
    }

    // Set real-time velocity vector for predictive dynamic obstacle modeling
    obstacle.velocity = new THREE.Vector3(dirX * currentSpeed, 0, dirZ * currentSpeed);
    const moveDist = currentSpeed * delta;
    if (moveDist > 0) {
      const moveDir = new THREE.Vector3().subVectors(targetVector, currentPos).normalize();
      if (moveDir.lengthSq() > 0.001) {
        currentPos.add(moveDir.multiplyScalar(moveDist));
      }
    }

    // ── 8. Rate-Limited Steering & Front Wheel Angle ──
    const toTarget = new THREE.Vector3().subVectors(targetVector, currentPos);
    if (toTarget.lengthSq() > 0.001) {
      const targetRotation = Math.atan2(toTarget.x, toTarget.z);
      let diff = targetRotation - ref.current.rotation.y;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      const maxTurnRate = isCar ? 2.0 : 3.2; // Realistic smooth steering without snapping
      const turnDelta = THREE.MathUtils.clamp(diff, -maxTurnRate * delta, maxTurnRate * delta);
      ref.current.rotation.y += turnDelta;

      // Physically turn front wheels on cars into the steering curve
      if (isCar) {
        const steerAngle = THREE.MathUtils.clamp(diff * 0.45, -0.42, 0.42);
        if (wheel1Ref.current) wheel1Ref.current.rotation.y = steerAngle;
        if (wheel2Ref.current) wheel2Ref.current.rotation.y = steerAngle;
      }
    }

    // ── 9. Anti-Stuck Dynamic Detour Watchdog ──
    if (!lastCheckPosRef.current) {
      lastCheckPosRef.current = currentPos.clone();
    } else {
      const stepMoved = currentPos.distanceTo(lastCheckPosRef.current);
      if (stepMoved < 0.10 * delta) {
        stuckTimerRef.current += delta;
        if (stuckTimerRef.current > 2.0 && mapData && mapData.roads && mapData.roads.length > 5) {
          const myGrid = getGridPointFromVector3(currentPos, gridSize);
          const detourTarget = mapData.roads[Math.floor(Math.random() * mapData.roads.length)];
          const allObs = [...(mapData.obstacles || []), ...(userBlockers || [])];
          const detourPath = calculatePath(myGrid, detourTarget, allObs, mapData, true);
          if (detourPath && detourPath.length >= 2) {
            obstacle.path = detourPath;
            obstacle.currentIndex = 0;
            obstacle.targetPos = detourPath[detourPath.length - 1];
          }
          stuckTimerRef.current = 0;
        }
      } else {
        stuckTimerRef.current = 0;
      }
      lastCheckPosRef.current.copy(currentPos);
    }
  });

  const startNode = obstacle.path[0] || { x: 0, y: 0, f: 0 };
  const baseStart = getGridPosition(startNode, gridSize, 0.05, isMapView);
  let startX = obstacle.pos3D ? obstacle.pos3D.x : baseStart[0];
  let startZ = obstacle.pos3D ? obstacle.pos3D.z : baseStart[2];
  if (!obstacle.pos3D) {
    if (obstacle.path.length >= 2) {
      const [n1x, , n1z] = getGridPosition(obstacle.path[1], gridSize, 0.05, isMapView);
      const initH = new THREE.Vector3(n1x - startX, 0, n1z - startZ).normalize();
      const initNorm = new THREE.Vector3(initH.z, 0, -initH.x);
      startX += initNorm.x * baseOffset;
      startZ += initNorm.z * baseOffset;
    } else {
      startX += baseOffset;
    }
  }
  const startPos: [number, number, number] = [startX, obstacle.pos3D ? obstacle.pos3D.y : baseStart[1], startZ];

  useEffect(() => {
    if (ref.current && obstacle.path.length >= 2) {
      const [p0x, , p0z] = getGridPosition(obstacle.path[0], gridSize, 0.05, isMapView);
      const [p1x, , p1z] = getGridPosition(obstacle.path[1], gridSize, 0.05, isMapView);
      const initYaw = Math.atan2(p1x - p0x, p1z - p0z);
      ref.current.rotation.y = initYaw;
      lastDirRef.current = { x: Math.sin(initYaw), z: Math.cos(initYaw) };
    }
  }, []);

  return (
    <group ref={ref} position={startPos}>
      {obstacle.type === 'car' ? (
        /* Sized to match robot stature (scale 1.45) */
        <group scale={1.45}>
          {/* Main Aerodynamic Chassis */}
          <RoundedBox args={[0.62, 0.32, 1.25]} radius={0.06} smoothness={4} position={[0, 0.22, 0]} castShadow receiveShadow>
            <meshStandardMaterial color={carColor} metalness={0.7} roughness={0.25} />
          </RoundedBox>

          {/* Cabin / Tinted Glass Canopy */}
          <RoundedBox args={[0.54, 0.26, 0.68]} radius={0.05} smoothness={4} position={[0, 0.48, -0.06]} castShadow>
            <meshStandardMaterial color="#0b0f19" metalness={0.9} roughness={0.1} />
          </RoundedBox>

          {/* Front Windshield Angle Accent */}
          <Box args={[0.48, 0.2, 0.02]} position={[0, 0.46, 0.28]} rotation={[0.3, 0, 0]}>
            <meshStandardMaterial color="#1e293b" metalness={0.9} roughness={0.1} transparent opacity={0.85} />
          </Box>

          {/* Front LED Headlights */}
          <Box args={[0.14, 0.06, 0.02]} position={[0.2, 0.24, 0.63]}>
            <meshStandardMaterial color="#fef08a" emissive="#fef08a" emissiveIntensity={2.0} />
          </Box>
          <Box args={[0.14, 0.06, 0.02]} position={[-0.2, 0.24, 0.63]}>
            <meshStandardMaterial color="#fef08a" emissive="#fef08a" emissiveIntensity={2.0} />
          </Box>
          {/* Front Grille */}
          <Box args={[0.22, 0.06, 0.02]} position={[0, 0.16, 0.63]}>
            <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.3} />
          </Box>

          {/* Rear LED Taillight Bar */}
          <Box args={[0.52, 0.06, 0.02]} position={[0, 0.26, -0.63]}>
            <meshStandardMaterial ref={taillightMatRef} color="#ef4444" emissive="#ef4444" emissiveIntensity={1.4} />
          </Box>

          {/* Wheels - Front Left & Right */}
          <group ref={wheel1Ref} position={[-0.32, 0.14, 0.38]}>
            <Cylinder args={[0.14, 0.14, 0.09, 16]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <meshStandardMaterial color="#0f172a" roughness={0.8} />
            </Cylinder>
            <Cylinder args={[0.07, 0.07, 0.1, 10]} rotation={[0, 0, Math.PI / 2]}>
              <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.2} />
            </Cylinder>
          </group>
          <group ref={wheel2Ref} position={[0.32, 0.14, 0.38]}>
            <Cylinder args={[0.14, 0.14, 0.09, 16]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <meshStandardMaterial color="#0f172a" roughness={0.8} />
            </Cylinder>
            <Cylinder args={[0.07, 0.07, 0.1, 10]} rotation={[0, 0, Math.PI / 2]}>
              <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.2} />
            </Cylinder>
          </group>

          {/* Wheels - Rear Left & Right */}
          <group ref={wheel3Ref} position={[-0.32, 0.14, -0.38]}>
            <Cylinder args={[0.14, 0.14, 0.09, 16]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <meshStandardMaterial color="#0f172a" roughness={0.8} />
            </Cylinder>
            <Cylinder args={[0.07, 0.07, 0.1, 10]} rotation={[0, 0, Math.PI / 2]}>
              <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.2} />
            </Cylinder>
          </group>
          <group ref={wheel4Ref} position={[0.32, 0.14, -0.38]}>
            <Cylinder args={[0.14, 0.14, 0.09, 16]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <meshStandardMaterial color="#0f172a" roughness={0.8} />
            </Cylinder>
            <Cylinder args={[0.07, 0.07, 0.1, 10]} rotation={[0, 0, Math.PI / 2]}>
              <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.2} />
            </Cylinder>
          </group>
        </group>
      ) : (
        /* Detailed Animated Pedestrian scaled to human proportions (scale 1.4) */
        <group scale={1.4}>
          {/* Pelvis / Hips */}
          <Box args={[0.3, 0.12, 0.2]} position={[0, 0.52, 0]} castShadow>
            <meshStandardMaterial color={pantsColor} roughness={0.6} />
          </Box>

          {/* Left Leg */}
          <group ref={leftLegRef} position={[-0.09, 0.48, 0]}>
            <Box args={[0.1, 0.46, 0.12]} position={[0, -0.23, 0]} castShadow>
              <meshStandardMaterial color={pantsColor} roughness={0.6} />
            </Box>
            {/* Left Shoe */}
            <Box args={[0.11, 0.07, 0.17]} position={[0, -0.46, 0.03]} castShadow>
              <meshStandardMaterial color="#0f172a" roughness={0.4} />
            </Box>
          </group>

          {/* Right Leg */}
          <group ref={rightLegRef} position={[0.09, 0.48, 0]}>
            <Box args={[0.1, 0.46, 0.12]} position={[0, -0.23, 0]} castShadow>
              <meshStandardMaterial color={pantsColor} roughness={0.6} />
            </Box>
            {/* Right Shoe */}
            <Box args={[0.11, 0.07, 0.17]} position={[0, -0.46, 0.03]} castShadow>
              <meshStandardMaterial color="#0f172a" roughness={0.4} />
            </Box>
          </group>

          {/* Torso (Shirt) */}
          <RoundedBox args={[0.36, 0.44, 0.22]} radius={0.04} smoothness={4} position={[0, 0.78, 0]} castShadow>
            <meshStandardMaterial color={shirtColor} roughness={0.5} />
          </RoundedBox>

          {/* Backpack on back */}
          <Box args={[0.26, 0.32, 0.12]} position={[0, 0.78, -0.15]} castShadow>
            <meshStandardMaterial color="#0f172a" roughness={0.7} />
          </Box>

          {/* Left Arm */}
          <group ref={leftArmRef} position={[-0.22, 0.94, 0]}>
            <Box args={[0.08, 0.42, 0.09]} position={[0, -0.21, 0]} castShadow>
              <meshStandardMaterial color={shirtColor} roughness={0.5} />
            </Box>
            <Sphere args={[0.05, 8, 8]} position={[0, -0.42, 0]}>
              <meshStandardMaterial color={skinColor} roughness={0.4} />
            </Sphere>
          </group>

          {/* Right Arm */}
          <group ref={rightArmRef} position={[0.22, 0.94, 0]}>
            <Box args={[0.08, 0.42, 0.09]} position={[0, -0.21, 0]} castShadow>
              <meshStandardMaterial color={shirtColor} roughness={0.5} />
            </Box>
            <Sphere args={[0.05, 8, 8]} position={[0, -0.42, 0]}>
              <meshStandardMaterial color={skinColor} roughness={0.4} />
            </Sphere>
          </group>

          {/* Neck */}
          <Cylinder args={[0.06, 0.06, 0.08, 8]} position={[0, 1.04, 0]}>
            <meshStandardMaterial color={skinColor} roughness={0.4} />
          </Cylinder>

          {/* Head */}
          <Sphere args={[0.13, 16, 16]} position={[0, 1.16, 0]} castShadow>
            <meshStandardMaterial color={skinColor} roughness={0.4} />
          </Sphere>

          {/* Hair / Cap */}
          <Sphere args={[0.135, 14, 14]} position={[0, 1.19, -0.02]} scale={[1.02, 0.8, 1.02]}>
            <meshStandardMaterial color="#1e293b" roughness={0.8} />
          </Sphere>
        </group>
      )}
    </group>
  );
};

const getGridPosition = (gridPoint: GridPoint, gridSize: GridPoint, height = 0.5, _isMapView = false): [number, number, number] => {
  const offsetX = (gridSize.x * CELL_SIZE) / 2;
  const offsetZ = (gridSize.y * CELL_SIZE) / 2;
  return [
    (gridPoint.x * CELL_SIZE) - offsetX + (CELL_SIZE / 2),
    height,
    (gridPoint.y * CELL_SIZE) - offsetZ + (CELL_SIZE / 2)
  ];
};

const getGridPointFromVector3 = (point: THREE.Vector3, gridSize: GridPoint): GridPoint => {
  const offsetX = (gridSize.x * CELL_SIZE) / 2;
  const offsetZ = (gridSize.y * CELL_SIZE) / 2;
  const gridX = Math.floor((point.x + offsetX) / CELL_SIZE);
  const gridZ = Math.floor((point.z + offsetZ) / CELL_SIZE);
  const clampedX = Math.max(0, Math.min(gridSize.x - 1, gridX));
  const clampedZ = Math.max(0, Math.min(gridSize.y - 1, gridZ));
  return { x: clampedX, y: clampedZ, f: 0 };
};

const getNearestRoadPoint = (pt: GridPoint, mapData: MapData): GridPoint => {
  if (!mapData || !mapData.roads || mapData.roads.length === 0) return pt;
  const targetF = pt.f || 0;
  const isAlreadyRoad = mapData.roads.some(r => r.x === pt.x && r.y === pt.y && r.f === targetF);
  if (isAlreadyRoad) return pt;

  let bestDistSq = Infinity;
  let bestPt = pt;
  for (const r of mapData.roads) {
    if (r.f !== targetF) continue;
    const dSq = (r.x - pt.x) * (r.x - pt.x) + (r.y - pt.y) * (r.y - pt.y);
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestPt = r;
    }
  }
  return bestPt;
};

// Cached lookup set for mapData road network to allow O(1) drivable road validation
const roadSetCache = new WeakMap<MapData, Set<string>>();
const getRoadSet = (mapData: MapData): Set<string> => {
  let set = roadSetCache.get(mapData);
  if (!set) {
    set = new Set<string>();
    if (mapData.roads) {
      for (const r of mapData.roads) {
        set.add(`${r.x},${r.y}`);
      }
    }
    roadSetCache.set(mapData, set);
  }
  return set;
};

// Strict check: Determines if a 3D world coordinate is strictly on the drivable road surface,
// never touching grass, curb, sidewalk, or building room boundaries.
export const isPointOnDrivableRoad = (
  worldX: number,
  worldZ: number,
  mapData: MapData | null | undefined,
  margin = 0.22
): boolean => {
  if (!mapData || !mapData.roads || mapData.roads.length === 0) return true;
  const { gridSize } = mapData;
  const offsetX = (gridSize.x * CELL_SIZE) / 2;
  const offsetZ = (gridSize.y * CELL_SIZE) / 2;
  const roadSet = getRoadSet(mapData);

  // Probes around the test point to guarantee full clearance from non-drivable edges (grass, curbs, sidewalks)
  const probes: [number, number][] = [
    [0, 0],
    [margin, 0],
    [-margin, 0],
    [0, margin],
    [0, -margin],
    [margin * 0.707, margin * 0.707],
    [-margin * 0.707, margin * 0.707],
    [margin * 0.707, -margin * 0.707],
    [-margin * 0.707, -margin * 0.707],
  ];

  for (let i = 0; i < probes.length; i++) {
    const px = worldX + probes[i][0];
    const pz = worldZ + probes[i][1];
    const gx = Math.floor((px + offsetX) / CELL_SIZE);
    const gy = Math.floor((pz + offsetZ) / CELL_SIZE);
    if (gx < 0 || gx >= gridSize.x || gy < 0 || gy >= gridSize.y) {
      return false; // Beyond campus boundaries
    }
    if (!roadSet.has(`${gx},${gy}`)) {
      return false; // Non-drivable area (grass, curb, or sidewalk)
    }
  }

  // Ensure not intersecting or touching any building room footprint
  if (mapData.rooms) {
    for (let i = 0; i < mapData.rooms.length; i++) {
      const room = mapData.rooms[i];
      const rMinX = (room.start.x * CELL_SIZE) - offsetX;
      const rMaxX = ((room.end.x + 1) * CELL_SIZE) - offsetX;
      const rMinZ = (room.start.y * CELL_SIZE) - offsetZ;
      const rMaxZ = ((room.end.y + 1) * CELL_SIZE) - offsetZ;
      if (worldX >= rMinX - margin && worldX <= rMaxX + margin &&
          worldZ >= rMinZ - margin && worldZ <= rMaxZ + margin) {
        return false; // Building wall/interior
      }
    }
  }

  return true;
};

const RoadsRender = ({ roads, gridSize }: { roads: GridPoint[], gridSize: GridPoint }) => {
  if (!roads || roads.length === 0) return null;
  return (
    <Instances limit={roads.length} receiveShadow>
      <boxGeometry args={[CELL_SIZE, 0.05, CELL_SIZE]} />
      <meshStandardMaterial color="#64748b" opacity={0.9} transparent />
      {roads.map((road, i) => {
        const [x, y, z] = getGridPosition(road, gridSize, 0.025);
        return <Instance key={i} position={[x, y, z]} />;
      })}
    </Instances>
  );
};

const TrafficBarricade = ({ position, rotationY, length = 1 }: { position: [number, number, number], rotationY: number, length?: number }) => {
  const lightRef1 = useRef<THREE.Mesh>(null);
  const lightRef2 = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    // Fast blinking
    const intensity = Math.sin(time * 10) > 0 ? 1.5 : 0.1;
    if (lightRef1.current) {
      (lightRef1.current.material as THREE.MeshStandardMaterial).emissiveIntensity = intensity;
    }
    if (lightRef2.current) {
      (lightRef2.current.material as THREE.MeshStandardMaterial).emissiveIntensity = intensity;
    }
  });

  const baseW = 1.0 * length;
  const midW = 0.9 * length;
  const topW = 0.8 * length;

  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={1.15}>
      {/* Base */}
      <Box args={[baseW, 0.2, 0.4]} position={[0, 0.1, 0]} castShadow receiveShadow>
         <meshStandardMaterial color="#ea580c" roughness={0.8} />
      </Box>
      {/* Middle */}
      <Box args={[midW, 0.3, 0.25]} position={[0, 0.35, 0]} castShadow receiveShadow>
         <meshStandardMaterial color="#ea580c" roughness={0.8} />
      </Box>
      {/* Top */}
      <Box args={[topW, 0.2, 0.15]} position={[0, 0.6, 0]} castShadow receiveShadow>
         <meshStandardMaterial color="#ea580c" roughness={0.8} />
      </Box>
      
      {/* Reflective Stripes */}
      <Box args={[0.15, 0.3, 0.26]} position={[-midW/2 + 0.2, 0.35, 0]}>
         <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.2} roughness={0.2} />
      </Box>
      <Box args={[0.15, 0.3, 0.26]} position={[midW/2 - 0.2, 0.35, 0]}>
         <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.2} roughness={0.2} />
      </Box>
      <Box args={[0.15, 0.2, 0.16]} position={[-topW/2 + 0.15, 0.6, 0]}>
         <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.2} roughness={0.2} />
      </Box>
      <Box args={[0.15, 0.2, 0.16]} position={[topW/2 - 0.15, 0.6, 0]}>
         <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.2} roughness={0.2} />
      </Box>
      
      {/* Flashing Lights on top */}
      <Sphere ref={lightRef1} args={[0.06, 12, 12]} position={[-topW/2 + 0.1, 0.75, 0]}>
         <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={1.5} />
      </Sphere>
      <Sphere ref={lightRef2} args={[0.06, 12, 12]} position={[topW/2 - 0.1, 0.75, 0]}>
         <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={1.5} />
      </Sphere>
    </group>
  );
};

const BlockersRender = ({ blockers, gridSize, roads }: { blockers: GridPoint[], gridSize: GridPoint, roads: GridPoint[] }) => {
  if (!blockers || blockers.length === 0) return null;
  
  const renderedSet = new Set<string>();
  const barrierGroups = [];

  for (const b of blockers) {
    const key = `${b.x},${b.y}`;
    if (renderedSet.has(key)) continue;

    let rotationY = 0;
    const hasRoadEW = roads.some(r => r.y === b.y && (r.x === b.x + 1 || r.x === b.x - 1));
    const hasRoadNS = roads.some(r => r.x === b.x && (r.y === b.y + 1 || r.y === b.y - 1));
    
    let group = [b];
    renderedSet.add(key);

    if (hasRoadEW && !hasRoadNS) {
       rotationY = Math.PI / 2; // Road goes E-W, so block N-S
       let dy = 1;
       while (blockers.some(r => r.x === b.x && r.y === b.y + dy)) {
         group.push(blockers.find(r => r.x === b.x && r.y === b.y + dy)!);
         renderedSet.add(`${b.x},${b.y + dy}`);
         dy++;
       }
       dy = -1;
       while (blockers.some(r => r.x === b.x && r.y === b.y + dy)) {
         group.push(blockers.find(r => r.x === b.x && r.y === b.y + dy)!);
         renderedSet.add(`${b.x},${b.y + dy}`);
         dy--;
       }
    } else if (hasRoadNS && !hasRoadEW) {
       rotationY = 0; // Road goes N-S, so block E-W
       let dx = 1;
       while (blockers.some(r => r.y === b.y && r.x === b.x + dx)) {
         group.push(blockers.find(r => r.y === b.y && r.x === b.x + dx)!);
         renderedSet.add(`${b.x + dx},${b.y}`);
         dx++;
       }
       dx = -1;
       while (blockers.some(r => r.y === b.y && r.x === b.x + dx)) {
         group.push(blockers.find(r => r.y === b.y && r.x === b.x + dx)!);
         renderedSet.add(`${b.x + dx},${b.y}`);
         dx--;
       }
    }

    const avgX = group.reduce((sum, g) => sum + g.x, 0) / group.length;
    const avgY = group.reduce((sum, g) => sum + g.y, 0) / group.length;
    
    barrierGroups.push({
      center: { x: avgX, y: avgY, f: b.f },
      length: group.length,
      rotationY
    });
  }

  return (
    <group>
      {barrierGroups.map((bg, i) => {
        const [x, y, z] = getGridPosition(bg.center as any, gridSize, 0);
        return <TrafficBarricade key={i} position={[x, y, z]} rotationY={bg.rotationY} length={bg.length} />;
      })}
    </group>
  );
};

const CrowdsRender = React.memo(({ crowds, gridSize }: { crowds: GridPoint[], gridSize: GridPoint }) => {
  if (!crowds || crowds.length === 0) return null;
  return (
    <group>
      {crowds.map((c, i) => {
        const [cx, , cz] = getGridPosition({ x: c.x, y: c.y, f: 0 } as any, gridSize, 0);
        return (
          <group key={`crowd-${i}`} position={[cx, 0, cz]}>
            {Array.from({ length: 15 }).map((_, j) => {
              const ox = (Math.random() - 0.5) * 2;
              const oz = (Math.random() - 0.5) * 2;
              return (
                <group key={`person-${j}`} position={[ox, 0, oz]}>
                  <Box args={[0.3, 1, 0.3]} castShadow position={[0, 0.5, 0]}>
                    <meshStandardMaterial color={['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1'][j % 7]} roughness={0.8} />
                  </Box>
                  <Sphere args={[0.2]} position={[0, 1.1, 0]} castShadow>
                    <meshStandardMaterial color="#fcd34d" />
                  </Sphere>
                </group>
              );
            })}
          </group>
        );
      })}
    </group>
  );
});

const Butterflies = () => {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (groupRef.current) {
      // Stopped movement for Butterflies
      // const t = clock.getElapsedTime();
      // groupRef.current.children.forEach((child, i) => {
      //   child.position.y = Math.sin(t * 3 + i * 2) * 0.5 + 1.5;
      //   child.position.x = Math.cos(t * 1.5 + i) * 3;
      //   child.position.z = Math.sin(t * 1.8 + i * 1.5) * 3;
      // });
    }
  });
  
  return (
    <group ref={groupRef}>
      {[...Array(15)].map((_, i) => (
        <Box key={i} args={[0.05, 0.05, 0.05]}>
          <meshBasicMaterial color={i % 2 === 0 ? "#fcd34d" : "#60a5fa"} />
        </Box>
      ))}
    </group>
  );
};

const PoliceVehicle = ({ policeState, policeStateRef, gridSize, isMapView, onReachDestination }: any) => {
  const ref = useRef<THREE.Group>(null);
  const internalIndex = useRef(0);

  useEffect(() => {
    internalIndex.current = 0;
  }, [policeState.path]);

  useFrame((_state, delta) => {
    const state = policeStateRef.current;
    if (!ref.current || state.path.length === 0 || !state.active) return;

    const currentPos = ref.current.position;
    const targetNode = state.path[Math.min(internalIndex.current, state.path.length - 1)];
    const [tx, ty, tz] = getGridPosition(targetNode, gridSize, 0.2, isMapView);
    const targetVector = new THREE.Vector3(tx, ty, tz);
    
    const dist = currentPos.distanceTo(targetVector);
    if (dist < 0.1) {
      if (internalIndex.current < state.path.length - 1) {
        internalIndex.current++;
      } else {
        if (state.active) {
           onReachDestination(state.phase);
        }
      }
    } else {
      const speed = isMapView ? 12 : 6;
      currentPos.lerp(targetVector, delta * speed);
      
      const dir = targetVector.clone().sub(currentPos).normalize();
      if (dir.lengthSq() > 0.001) {
        const targetRot = Math.atan2(dir.x, dir.z);
        ref.current.rotation.y += (targetRot - ref.current.rotation.y) * 0.1;
      }
    }
  });

  if (!policeState.active) return null;

  return (
    <group ref={ref}>
      <Box args={[0.8, 0.6, 1.8]} position={[0, 0.3, 0]} castShadow>
        <meshStandardMaterial color="#1e3a8a" />
      </Box>
      <Box args={[0.8, 0.3, 0.8]} position={[0, 0.75, -0.2]} castShadow>
        <meshStandardMaterial color="#ffffff" />
      </Box>
      <pointLight position={[-0.3, 1, -0.2]} color="#ef4444" intensity={2} distance={5} />
      <pointLight position={[0.3, 1, -0.2]} color="#3b82f6" intensity={2} distance={5} />
      {policeState.phase === 'escorting' && (
        <group position={[0, 0, 1.5]}>
           {Array.from({ length: 15 }).map((_, j) => {
              const ox = (Math.random() - 0.5) * 1.5;
              const oz = (Math.random() - 0.5) * 1.5 + 1;
              return (
                <group key={`follow-${j}`} position={[ox, 0, oz]}>
                  <Box args={[0.3, 1, 0.3]} castShadow position={[0, 0.5, 0]}>
                    <meshStandardMaterial color={['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1'][j % 7]} roughness={0.8} />
                  </Box>
                  <Sphere args={[0.2]} position={[0, 1.1, 0]} castShadow>
                    <meshStandardMaterial color="#fcd34d" />
                  </Sphere>
                </group>
              );
            })}
        </group>
      )}
    </group>
  );
};

const ParkModel = ({ width, depth, height, isEco }: { width: number; depth: number; height: number; isEco: boolean }) => {
  const treeCount = isEco ? 15 : 4;
  const trees = useMemo(() => {
    return Array.from({ length: treeCount }).map((_, i) => {
      const seed1 = ((i * 9301 + 49297) % 233280) / 233280;
      const seed2 = (((i + 7) * 9301 + 49297) % 233280) / 233280;
      const tx = (seed1 - 0.5) * width * 0.8;
      const tz = (seed2 - 0.5) * depth * 0.8;
      return { tx, tz, id: i };
    });
  }, [width, depth, treeCount]);

  return (
    <group>
      <Box args={[width, 0.2, depth]} position={[0, -height / 2 + 0.1, 0]} receiveShadow>
        <meshStandardMaterial color="#22c55e" />
      </Box>
      {trees.map((t) => (
        <group key={t.id} position={[t.tx, -height / 2 + 0.5, t.tz]}>
          <Cylinder args={[0.1, 0.1, 0.8]} position={[0, -0.1, 0]}>
            <meshStandardMaterial color="#78350f" />
          </Cylinder>
          <Cylinder args={[0.4, 0.6, 1.2]} position={[0, 0.8, 0]}>
            <meshStandardMaterial color="#15803d" />
          </Cylinder>
        </group>
      ))}
      <Butterflies />
    </group>
  );
};

const BuildingModel = React.memo(({ room, width, height, depth }: { room: Room, width: number, height: number, depth: number }) => {
  const type = room.type || "unknown";
  const nameLow = room.name.toLowerCase();
  const baseColor = room.color || "#e2e8f0";
  
  if (type === 'medical') {
    return (
      <group>
        <Box args={[width, height, depth]} castShadow receiveShadow>
          <meshStandardMaterial color="#f8fafc" />
        </Box>
        <Box args={[width + 0.2, 0.2, depth + 0.2]} position={[0, height / 2 + 0.1, 0]} castShadow>
          <meshStandardMaterial color="#cbd5e1" />
        </Box>
        <Cylinder args={[Math.min(width, depth) * 0.3, Math.min(width, depth) * 0.3, 0.1, 32]} position={[0, height / 2 + 0.25, 0]}>
          <meshStandardMaterial color="#334155" />
        </Cylinder>
        <group position={[0, height / 2 + 0.8, 0]}>
          <Box args={[1.2, 0.3, 0.1]}>
            <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.5} />
          </Box>
          <Box args={[0.3, 1.2, 0.1]}>
            <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.5} />
          </Box>
        </group>
      </group>
    );
  } else if (type === 'security') {
    return (
      <group>
        {/* Main Body (Gray/White Prefab Walls) */}
        <Box args={[width, height, depth]} position={[0, 0, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#e2e8f0" roughness={0.9} />
        </Box>
        
        {/* Blue Overhanging Roof */}
        <Box args={[width * 1.2, height * 0.1, depth * 1.2]} position={[0, height * 0.55, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#3b82f6" roughness={0.8} />
        </Box>

        {/* Front Door - Frame */}
        <Box args={[width * 0.3, height * 0.7, depth * 1.02]} position={[width * 0.2, -height * 0.15, 0]}>
          <meshStandardMaterial color="#2563eb" />
        </Box>
        {/* Front Door - Glass/Inner */}
        <Box args={[width * 0.25, height * 0.65, depth * 1.03]} position={[width * 0.2, -height * 0.15, 0]}>
          <meshStandardMaterial color={baseColor} roughness={0.8} />
        </Box>

        {/* Front Window - Frame */}
        <Box args={[width * 0.4, height * 0.4, depth * 1.02]} position={[-width * 0.2, 0, 0]}>
          <meshStandardMaterial color="#2563eb" />
        </Box>
        {/* Front Window - Glass */}
        <Box args={[width * 0.35, height * 0.35, depth * 1.03]} position={[-width * 0.2, 0, 0]}>
          <meshStandardMaterial color="#38bdf8" transparent opacity={0.6} metalness={0.9} roughness={0.1} />
        </Box>

        {/* Side Window (Right) - Frame */}
        <Box args={[width * 1.02, height * 0.4, depth * 0.6]} position={[0, 0, depth * 0.2]}>
          <meshStandardMaterial color="#2563eb" />
        </Box>
        {/* Side Window (Right) - Glass */}
        <Box args={[width * 1.03, height * 0.35, depth * 0.55]} position={[0, 0, depth * 0.2]}>
          <meshStandardMaterial color="#38bdf8" transparent opacity={0.6} metalness={0.9} roughness={0.1} />
        </Box>

        {/* Boom barrier base */}
        <Cylinder args={[0.05, 0.05, 0.5]} position={[width * 0.6, -height * 0.25, depth * 0.6]} castShadow>
          <meshStandardMaterial color="#ef4444" />
        </Cylinder>
        {/* Boom barrier arm */}
        <Box args={[width * 1.5, 0.05, 0.05]} position={[width * 1.35, -height * 0.05, depth * 0.6]} castShadow>
          <meshStandardMaterial color="#facc15" />
        </Box>
      </group>
    );
  } else if (type === 'utility') {
    return (
      <group>
        <Box args={[width, height * 0.7, depth]} position={[0, -height * 0.15, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#475569" roughness={0.8} />
        </Box>
        <Cylinder args={[Math.min(width, depth) * 0.2, Math.min(width, depth) * 0.25, height * 0.8, 16]} position={[-width * 0.25, height * 0.1, 0]} castShadow>
           <meshStandardMaterial color="#64748b" />
        </Cylinder>
        <Cylinder args={[Math.min(width, depth) * 0.2, Math.min(width, depth) * 0.25, height * 0.8, 16]} position={[width * 0.25, height * 0.1, 0]} castShadow>
           <meshStandardMaterial color="#64748b" />
        </Cylinder>
        <Box args={[width * 0.4, height * 0.4, depth * 1.05]} position={[0, -height * 0.15, 0]}>
           <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={1} />
        </Box>
      </group>
    );
  } else if (type === 'admin') {
    return (
      <group>
        <Box args={[width, height * 1.5, depth]} position={[0, height * 0.25, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#bae6fd" roughness={0.7} opacity={0.8} transparent emissive="#0ea5e9" emissiveIntensity={0.05} />
        </Box>
        <Box args={[width * 1.05, height * 1.55, depth * 0.8]} position={[0, height * 0.25, 0]} castShadow>
           <meshStandardMaterial color="#1e293b" />
        </Box>
        <Cylinder args={[0.05, 0.05, height * 0.8]} position={[0, height + 0.4, 0]}>
           <meshStandardMaterial color="#ef4444" emissive="#ef4444" />
        </Cylinder>
      </group>
    );
  } else if (type === 'library') {
    return (
      <group>
        {/* Modern Solid Base */}
        <Box args={[width * 0.9, height * 0.8, depth * 0.9]} position={[0, -height * 0.1, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#cbd5e1" roughness={0.8} />
        </Box>
        {/* Glass upper section */}
        <Box args={[width * 1.05, height * 1.2, depth * 1.05]} position={[0, height * 0.9, 0]} castShadow>
          <meshStandardMaterial color="#0ea5e9" transparent opacity={0.3} metalness={0.6} roughness={0.2} />
        </Box>
        {/* Inner solid core for depth */}
        <Box args={[width * 0.8, height * 1.15, depth * 0.8]} position={[0, height * 0.9, 0]}>
          <meshStandardMaterial color="#475569" roughness={0.9} />
        </Box>
        {/* Modern slanted roof feature */}
        <Box args={[width * 1.1, height * 0.2, depth * 1.1]} position={[0, height * 1.6, 0]} rotation={[0.08, 0, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#1e293b" roughness={0.8} />
        </Box>
      </group>
    );
  } else if (type === 'auditorium') {
    return (
      <group>
        <Box args={[width, height * 0.5, depth]} position={[0, -height * 0.25, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#cbd5e1" />
        </Box>
        {/* Full Dome Roof */}
        <Sphere args={[Math.min(width, depth)/2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} position={[0, 0, 0]} castShadow>
          <meshStandardMaterial color="#94a3b8" metalness={0.5} roughness={0.2} />
        </Sphere>
      </group>
    );
  } else if (type === 'sports') {
    if (nameLow.includes('pool')) {
      return (
        <group>
          {/* Deck */}
          <Box args={[width, 0.2, depth]} position={[0, -height/2 + 0.1, 0]} receiveShadow>
            <meshStandardMaterial color="#cbd5e1" />
          </Box>
          {/* Water */}
          <Box args={[width * 0.8, 0.15, depth * 0.8]} position={[0, -height/2 + 0.15, 0]} receiveShadow>
            <meshStandardMaterial color="#0ea5e9" opacity={0.7} transparent metalness={0.8} roughness={0.1} />
          </Box>
        </group>
      );
    } else if (nameLow.includes('tennis')) {
      return (
        <group>
          {/* Court */}
          <Box args={[width, 0.1, depth]} position={[0, -height/2 + 0.05, 0]} receiveShadow>
            <meshStandardMaterial color="#166534" />
          </Box>
          {/* Net */}
          <Box args={[width * 0.8, 0.4, 0.05]} position={[0, -height/2 + 0.25, 0]} castShadow>
            <meshStandardMaterial color="#f8fafc" opacity={0.8} transparent />
          </Box>
        </group>
      );
    } else if (nameLow.includes('cricket')) {
      return (
        <group>
          {/* Grass */}
          <Box args={[width, 0.1, depth]} position={[0, -height/2 + 0.05, 0]} receiveShadow>
            <meshStandardMaterial color="#22c55e" />
          </Box>
          {/* Pitch */}
          <Box args={[width * 0.2, 0.15, depth * 0.8]} position={[0, -height/2 + 0.08, 0]} receiveShadow>
            <meshStandardMaterial color="#d4a373" />
          </Box>
          {/* Nets */}
          <Box args={[width * 0.3, 1.5, depth * 0.9]} position={[0, -height/2 + 0.8, 0]}>
             <meshStandardMaterial color="#94a3b8" wireframe />
          </Box>
          {/* Stumps */}
          {[-0.1, 0, 0.1].map((ox, i) => (
             <Cylinder key={'s1'+i} args={[0.02, 0.02, 0.4]} position={[ox, -height/2 + 0.2, depth * 0.35]}>
               <meshStandardMaterial color="#ffffff" />
             </Cylinder>
          ))}
          {[-0.1, 0, 0.1].map((ox, i) => (
             <Cylinder key={'s2'+i} args={[0.02, 0.02, 0.4]} position={[ox, -height/2 + 0.2, -depth * 0.35]}>
               <meshStandardMaterial color="#ffffff" />
             </Cylinder>
          ))}
        </group>
      );
    } else if (nameLow.includes('hockey')) {
      return (
        <group>
          {/* Turf */}
          <Box args={[width, 0.1, depth]} position={[0, -height/2 + 0.05, 0]} receiveShadow>
            <meshStandardMaterial color="#15803d" />
          </Box>
          {/* Goals */}
          <Box args={[width * 0.2, 0.8, 0.2]} position={[0, -height/2 + 0.45, depth/2 - 0.5]}>
             <meshStandardMaterial color="#ffffff" wireframe />
          </Box>
          <Box args={[width * 0.2, 0.8, 0.2]} position={[0, -height/2 + 0.45, -depth/2 + 0.5]}>
             <meshStandardMaterial color="#ffffff" wireframe />
          </Box>
        </group>
      );
    } else if (nameLow.includes('indoor')) {
      return (
        <group>
          {/* Closed Stadium */}
          <Box args={[width, height * 1.2, depth]} position={[0, height * 0.1, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#cbd5e1" metalness={0.5} />
          </Box>
          {/* Curved Roof */}
          <Cylinder args={[Math.min(width, depth)/2, Math.min(width, depth)/2, Math.max(width, depth), 32, 1, false, 0, Math.PI]} position={[0, height * 0.7, 0]} rotation={[width > depth ? 0 : Math.PI / 2, 0, Math.PI / 2]} castShadow>
             <meshStandardMaterial color="#94a3b8" />
          </Cylinder>
        </group>
      );
    } else {
      // Sports Ground or default park-like sports area
      return (
        <group>
          <Box args={[width, 0.1, depth]} position={[0, -height/2 + 0.05, 0]} receiveShadow>
            <meshStandardMaterial color="#22c55e" />
          </Box>
          {/* Running Track (Ovalish) */}
          <Cylinder args={[Math.min(width, depth)*0.4, Math.min(width, depth)*0.4, 0.15, 32]} position={[0, -height/2 + 0.08, 0]}>
             <meshStandardMaterial color="#b91c1c" />
          </Cylinder>
          {/* Inner Grass */}
          <Cylinder args={[Math.min(width, depth)*0.3, Math.min(width, depth)*0.3, 0.2, 32]} position={[0, -height/2 + 0.1, 0]}>
             <meshStandardMaterial color="#22c55e" />
          </Cylinder>
        </group>
      );
    }
  } else if (type === 'park') {
    return <ParkModel width={width} depth={depth} height={height} isEco={nameLow.includes('eco')} />;
  } else if (type === 'food') {
    return (
      <group>
        <Box args={[width, height * 0.6, depth]} position={[0, -height * 0.2, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#fef3c7" />
        </Box>
        {/* Awnings */}
        <Box args={[width * 1.05, 0.2, depth * 1.05]} position={[0, height * 0.1, 0]} castShadow>
          <meshStandardMaterial color="#f97316" />
        </Box>
      </group>
    );
  } else if (type === 'hostel') {
    return (
      <group>
        <Box args={[width, height * 1.2, depth]} position={[0, height * 0.1, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#e2e8f0" />
        </Box>
        {/* Balconies */}
        <Box args={[width * 1.05, height * 0.2, depth * 1.05]} position={[0, height * 0.2, 0]} castShadow>
          <meshStandardMaterial color="#94a3b8" />
        </Box>
        <Box args={[width * 1.05, height * 0.2, depth * 1.05]} position={[0, height * 0.6, 0]} castShadow>
          <meshStandardMaterial color="#94a3b8" />
        </Box>
      </group>
    );
  } else {
    // Default Classroom / Generic
    return (
      <group>
        <Box args={[width, height, depth]} castShadow receiveShadow>
          <meshStandardMaterial color={baseColor} />
        </Box>
        <Box args={[width * 1.1, 0.2, depth * 1.1]} position={[0, height / 2 + 0.1, 0]} castShadow>
          <meshStandardMaterial color="#334155" />
        </Box>
        <Box args={[width * 1.02, height * 0.4, depth * 0.8]} position={[0, height * 0.1, 0]}>
           <meshStandardMaterial color="#bae6fd" roughness={0.8} emissive="#bae6fd" emissiveIntensity={0.05} />
        </Box>
      </group>
    );
  }
});

const SciFiGate = ({ position, scale = 1, rotation = [0, 0, 0] }: { position: [number, number, number], scale?: number, rotation?: [number, number, number] }) => {
  return (
    <group position={position} scale={scale} rotation={rotation}>
       {/* Left Pillar */}
       <Box args={[0.8, 3, 0.8]} position={[-2, 1.5, 0]} castShadow receiveShadow>
         <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.2} />
       </Box>
       {/* Right Pillar */}
       <Box args={[0.8, 3, 0.8]} position={[2, 1.5, 0]} castShadow receiveShadow>
         <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.2} />
       </Box>
       {/* Top Beam */}
       <Box args={[4.8, 0.6, 0.8]} position={[0, 3.2, 0]} castShadow receiveShadow>
         <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.2} />
       </Box>
       {/* Neon inner glow */}
       <Box args={[0.1, 3, 0.1]} position={[-1.6, 1.5, 0]}>
         <meshStandardMaterial color="#0ea5e9" emissive="#0ea5e9" emissiveIntensity={2} />
       </Box>
       <Box args={[0.1, 3, 0.1]} position={[1.6, 1.5, 0]}>
         <meshStandardMaterial color="#0ea5e9" emissive="#0ea5e9" emissiveIntensity={2} />
       </Box>
       <Box args={[3.2, 0.1, 0.1]} position={[0, 2.9, 0]}>
         <meshStandardMaterial color="#0ea5e9" emissive="#0ea5e9" emissiveIntensity={2} />
       </Box>
    </group>
  );
};

/* ── Detailed Animated 3D Robot Body ── */
export const DetailedRobot = ({ 
  isMoving, showFeatures = false, activeFeature = "", isEmergency = false, 
  isSlowCaution = false, isWaiting = false, isCourteousStandoff = false, standoffLabel = "",
  isFollowingObstacle = false, isOvertaking = false, followingDistanceLabel = "",
  isReversing = false, isYieldWaiting = false,
  isBarricadeBlocked = false, barricadeLabel = ""
}: { 
  isMoving: boolean; showFeatures?: boolean; activeFeature?: string; isEmergency?: boolean; 
  isSlowCaution?: boolean; isWaiting?: boolean; isCourteousStandoff?: boolean; standoffLabel?: string;
  isFollowingObstacle?: boolean; isOvertaking?: boolean; followingDistanceLabel?: string;
  isReversing?: boolean; isYieldWaiting?: boolean;
  isBarricadeBlocked?: boolean; barricadeLabel?: string;
}) => {
  const bodyRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftWheelRef = useRef<THREE.Mesh>(null);
  const rightWheelRef = useRef<THREE.Mesh>(null);
  const frontWheelRef = useRef<THREE.Mesh>(null);
  const backWheelRef = useRef<THREE.Mesh>(null);
  const antennaLightRef = useRef<THREE.Mesh>(null);
  const batteryMatRef = useRef<THREE.MeshStandardMaterial>(null);
  
  const clock = useRef(0);

  useFrame((_state, delta) => {
    clock.current += delta;
    const t = clock.current;

    if (bodyRef.current) bodyRef.current.position.y = 0;
    if (leftArmRef.current) leftArmRef.current.rotation.x = 0;
    if (rightArmRef.current) rightArmRef.current.rotation.x = 0;

    const ws = isReversing ? -4.5 : (isMoving ? (isSlowCaution ? 2.5 : 8) : 0);
    if (leftWheelRef.current) leftWheelRef.current.rotation.x += delta * ws;
    if (rightWheelRef.current) rightWheelRef.current.rotation.x += delta * ws;
    if (frontWheelRef.current) frontWheelRef.current.rotation.x += delta * ws;
    if (backWheelRef.current) backWheelRef.current.rotation.x += delta * ws;

    if (antennaLightRef.current) {
      const mat = antennaLightRef.current.material as THREE.MeshStandardMaterial;
      if (isEmergency) {
        mat.color.set('#ef4444');
        mat.emissive.set('#ef4444');
        mat.emissiveIntensity = 1.0 + 1.0 * Math.sin(t * 15);
      } else if (isSlowCaution) {
        mat.color.set('#f59e0b');
        mat.emissive.set('#f59e0b');
        mat.emissiveIntensity = 1.2 + 1.2 * Math.sin(t * 10);
      } else {
        mat.color.set('#f97316');
        mat.emissive.set('#f97316');
        mat.emissiveIntensity = 0.5 + 0.5 * Math.sin(t * 5);
      }
    }
    
    if (headRef.current) {
      if (isSlowCaution) {
        headRef.current.rotation.y = Math.sin(t * 5.0) * 0.45; // alert scanning
      } else if (isMoving) {
        headRef.current.rotation.y = Math.sin(t * 2.5) * 0.3;
      } else {
        headRef.current.rotation.y = THREE.MathUtils.lerp(headRef.current.rotation.y, 0, 0.1);
      }
    }
    
    if (batteryMatRef.current) {
      if (activeFeature === 'battery') {
        batteryMatRef.current.emissiveIntensity = 1.5 + 1.5 * Math.sin(t * 15);
      } else {
        batteryMatRef.current.emissiveIntensity = 0;
      }
    }
  });

  return (
    <group scale={1.8}>
      <group ref={bodyRef}>
        {/* Torso */}
        <RoundedBox args={[0.7, 0.55, 0.5]} radius={0.06} smoothness={4} position={[0, 0.6, 0]} castShadow>
          <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.25} />
        </RoundedBox>
        {/* Medical Kit (Back) */}
        <RoundedBox args={[0.4, 0.3, 0.15]} radius={0.02} smoothness={4} position={[0, 0.65, -0.28]} castShadow>
          <meshStandardMaterial color="#ef4444" metalness={0.2} roughness={0.6} />
        </RoundedBox>
        <Box args={[0.12, 0.04, 0.01]} position={[0, 0.65, -0.36]}>
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.5} />
        </Box>
        <Box args={[0.04, 0.12, 0.01]} position={[0, 0.65, -0.36]}>
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.5} />
        </Box>
        {showFeatures && (
          <Html position={[0, 0.75, -0.4]} center>
            <div className={`backdrop-blur-md border px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg whitespace-nowrap pointer-events-none transition-all duration-300 ${activeFeature === 'medical' ? 'bg-black/90 border-red-400 text-red-400 scale-110 shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'bg-black/60 border-red-500/50 text-red-100'}`}>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div>
                Emergency Medical Kit
              </div>
            </div>
          </Html>
        )}
        
        {/* Battery Box (Below Medical Kit) */}
        <RoundedBox args={[0.35, 0.15, 0.15]} radius={0.02} smoothness={4} position={[0, 0.4, -0.28]} castShadow>
          <meshStandardMaterial 
            ref={batteryMatRef}
            color={activeFeature === 'battery' ? "#22c55e" : "#14532d"} 
            emissive={activeFeature === 'battery' ? "#22c55e" : "#000000"} 
            emissiveIntensity={activeFeature === 'battery' ? 2 : 0} 
            metalness={0.5} roughness={0.4} 
          />
        </RoundedBox>
        {/* Battery Label */}
        {showFeatures && (
          <Html position={[0, 0.4, -0.4]} center>
            <div className={`backdrop-blur-md border px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg whitespace-nowrap pointer-events-none transition-all duration-300 ${activeFeature === 'battery' ? 'bg-black/90 border-green-400 text-green-400 scale-110 shadow-[0_0_15px_rgba(34,197,94,0.5)]' : 'bg-black/60 border-green-500/50 text-green-100'}`}>
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${activeFeature === 'battery' ? 'bg-green-400 animate-pulse' : 'bg-green-500'}`}></div>
                High-Capacity Battery
              </div>
            </div>
          </Html>
        )}
        {/* Chest glow stripe */}
        <Box args={[0.55, 0.08, 0.02]} position={[0, 0.65, 0.26]}>
          <meshStandardMaterial color="#0ea5e9" emissive="#0ea5e9" emissiveIntensity={0.8} metalness={0.3} roughness={0.2} />
        </Box>
        {/* Chest grill lines */}
        {[-0.1, 0, 0.1].map((ox, i) => (
          <Box key={i} args={[0.04, 0.14, 0.02]} position={[ox, 0.55, 0.261]}>
            <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.4} />
          </Box>
        ))}
        {/* Shoulder pads */}
        <RoundedBox args={[0.16, 0.16, 0.16]} radius={0.04} smoothness={4} position={[-0.46, 0.76, 0]} castShadow>
          <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.2} />
        </RoundedBox>
        <RoundedBox args={[0.16, 0.16, 0.16]} radius={0.04} smoothness={4} position={[0.46, 0.76, 0]} castShadow>
          <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.2} />
        </RoundedBox>

        {/* Left Arm */}
        <group ref={leftArmRef} position={[-0.46, 0.68, 0]}>
          <Cylinder args={[0.07, 0.06, 0.28, 8]} position={[0, -0.14, 0]} castShadow>
            <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.3} />
          </Cylinder>
          <Sphere args={[0.07, 8, 8]} position={[0, -0.28, 0]} castShadow>
            <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.3} />
          </Sphere>
          <Cylinder args={[0.05, 0.04, 0.22, 8]} position={[0, -0.44, 0]} castShadow>
            <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.3} />
          </Cylinder>
          <Box args={[0.1, 0.09, 0.08]} position={[0, -0.6, 0]} castShadow>
            <meshStandardMaterial color="#0ea5e9" metalness={0.5} roughness={0.2} />
          </Box>
        </group>

        {/* Right Arm */}
        <group ref={rightArmRef} position={[0.46, 0.68, 0]}>
          <Cylinder args={[0.07, 0.06, 0.28, 8]} position={[0, -0.14, 0]} castShadow>
            <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.3} />
          </Cylinder>
          <Sphere args={[0.07, 8, 8]} position={[0, -0.28, 0]} castShadow>
            <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.3} />
          </Sphere>
          <Cylinder args={[0.05, 0.04, 0.22, 8]} position={[0, -0.44, 0]} castShadow>
            <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.3} />
          </Cylinder>
          <Box args={[0.1, 0.09, 0.08]} position={[0, -0.6, 0]} castShadow>
            <meshStandardMaterial color="#0ea5e9" metalness={0.5} roughness={0.2} />
          </Box>
        </group>

        {/* Head */}
        <group ref={headRef} position={[0, 1.02, 0]}>
          <pointLight position={[0, 0, 0.5]} intensity={1.5} distance={6} color="#e0f2fe" castShadow />
          <RoundedBox args={[0.5, 0.42, 0.44]} radius={0.08} smoothness={4} position={[0, 0, 0]} castShadow>
            <meshStandardMaterial color="#0f172a" metalness={0.75} roughness={0.2} />
          </RoundedBox>
          {/* Visor */}
          <Box args={[0.38, 0.18, 0.02]} position={[0, 0.02, 0.23]}>
            <meshStandardMaterial color="#0c1445" metalness={0.2} roughness={0.05} transparent opacity={0.85} />
          </Box>
          {/* Mouth bar */}
          <Box args={[0.22, 0.03, 0.02]} position={[0, -0.1, 0.235]}>
            <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={0.5} />
          </Box>
          {/* Ear vents */}
          <Box args={[0.03, 0.12, 0.2]} position={[-0.265, 0, 0]}>
            <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.3} />
          </Box>
          <Box args={[0.03, 0.12, 0.2]} position={[0.265, 0, 0]}>
            <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.3} />
          </Box>
          {/* Antenna */}
          <Cylinder args={[0.015, 0.015, 0.22, 6]} position={[0, 0.31, 0]} castShadow>
            <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.2} />
          </Cylinder>
          <Sphere ref={antennaLightRef} args={[0.045, 10, 10]} position={[0, 0.435, 0]} castShadow>
            <meshStandardMaterial color="#f97316" emissive="#f97316" emissiveIntensity={0.8} roughness={0} />
          </Sphere>
          
          {showFeatures && (
            <>
              <Html position={[0, 0.6, 0]} center>
                <div className="bg-black/60 backdrop-blur-md border border-orange-500/50 text-orange-100 px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg whitespace-nowrap pointer-events-none">
                  LiDAR & Environmental Sensors
                </div>
              </Html>
              <Html position={[0.4, 0.1, 0.3]} center>
                <div className="bg-black/60 backdrop-blur-md border border-cyan-500/50 text-cyan-100 px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg whitespace-nowrap pointer-events-none">
                  Smart Interactive Display
                </div>
              </Html>
            </>
          )}
        </group>

        {/* Hip / Pelvis */}
        <RoundedBox args={[0.6, 0.18, 0.45]} radius={0.05} smoothness={4} position={[0, 0.26, 0]} castShadow>
          <meshStandardMaterial color="#0f172a" metalness={0.7} roughness={0.25} />
        </RoundedBox>
        {/* Storage / Grocery Box (Front) */}
        <RoundedBox args={[0.45, 0.25, 0.2]} radius={0.03} smoothness={4} position={[0, 0.25, 0.28]} castShadow>
          <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.5} />
        </RoundedBox>
        <Box args={[0.4, 0.02, 0.22]} position={[0, 0.38, 0.28]}>
          <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.1} />
        </Box>
        {showFeatures && (
          <Html position={[0, 0.25, 0.5]} center>
            <div className="bg-black/60 backdrop-blur-md border border-green-500/50 text-green-100 px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg whitespace-nowrap pointer-events-none mt-4">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                Secure Storage (Food & Deliveries)
              </div>
            </div>
          </Html>
        )}
        {/* Base plate */}
        <RoundedBox args={[0.75, 0.12, 0.6]} radius={0.04} smoothness={4} position={[0, 0.06, 0]} castShadow>
          <meshStandardMaterial color="#1e293b" metalness={0.6} roughness={0.3} />
        </RoundedBox>

        {/* Wheels */}
        <Cylinder ref={leftWheelRef} args={[0.22, 0.22, 0.12, 18]} position={[-0.42, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <meshStandardMaterial color="#0f172a" metalness={0.4} roughness={0.7} />
        </Cylinder>
        <Cylinder args={[0.1, 0.1, 0.14, 10]} position={[-0.44, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.2} />
        </Cylinder>
        <Cylinder ref={rightWheelRef} args={[0.22, 0.22, 0.12, 18]} position={[0.42, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <meshStandardMaterial color="#0f172a" metalness={0.4} roughness={0.7} />
        </Cylinder>
        <Cylinder args={[0.1, 0.1, 0.14, 10]} position={[0.44, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.2} />
        </Cylinder>
        <Cylinder ref={frontWheelRef} args={[0.14, 0.14, 0.1, 14]} position={[0, -0.08, 0.32]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <meshStandardMaterial color="#1e293b" metalness={0.4} roughness={0.7} />
        </Cylinder>
        <Cylinder ref={backWheelRef} args={[0.14, 0.14, 0.1, 14]} position={[0, -0.08, -0.32]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <meshStandardMaterial color="#1e293b" metalness={0.4} roughness={0.7} />
        </Cylinder>
        {/* Undercarriage glow */}
        <Box args={[0.6, 0.02, 0.5]} position={[0, -0.2, 0]}>
          <meshStandardMaterial color="#0ea5e9" emissive="#0ea5e9" emissiveIntensity={0.4} transparent opacity={0.7} />
        </Box>

        {/* Forward LiDAR Radar Sensor Arc */}
        <group position={[0, -0.15, 0.35]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.25, isSlowCaution ? 2.6 : 1.4, 32, 1, -Math.PI / 3, (2 * Math.PI) / 3]} />
          <meshBasicMaterial 
            color={isSlowCaution ? '#f59e0b' : '#00ffff'} 
            transparent 
            opacity={isSlowCaution ? 0.45 + 0.18 * Math.sin(clock.current * 10) : (isMoving ? 0.14 : 0.05)} 
            side={THREE.DoubleSide} 
          />
        </group>
        {isSlowCaution && (
          <group position={[0, -0.14, 0.35]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.3, 1.45, 32, 1, -Math.PI / 3, (2 * Math.PI) / 3]} />
            <meshBasicMaterial 
              color="#ef4444" 
              transparent 
              opacity={0.6 + 0.3 * Math.sin(clock.current * 12)} 
              side={THREE.DoubleSide} 
            />
          </group>
        )}

        {/* Real-time Road Barricade Encounter & Safe Standoff Badge */}
        {isBarricadeBlocked && (
          <Html position={[0, 1.60, 0]} center style={{ pointerEvents: 'none' }}>
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-orange-600/95 border border-orange-200 text-white font-mono font-black text-[10.5px] tracking-wider uppercase shadow-[0_0_22px_rgba(234,88,12,0.95)] whitespace-nowrap">
              <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping"></span>
              <span>🚧 {barricadeLabel || 'ROAD BARRICADE • SAFE VIEWING STANDOFF'}</span>
            </div>
          </Html>
        )}

        {/* Real-time Reversing & Making Way Badge */}
        {isReversing && (
          <Html position={[0, 1.55, 0]} center style={{ pointerEvents: 'none' }}>
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-orange-500/95 border border-orange-200 text-slate-950 font-mono font-black text-[10.5px] tracking-wider uppercase shadow-[0_0_22px_rgba(249,115,22,0.95)] whitespace-nowrap">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-950 animate-ping"></span>
              <span>⏪ {standoffLabel || 'REVERSING • CREATING SAFE TURNING ROOM'}</span>
            </div>
          </Html>
        )}

        {/* Real-time Yield Waiting Badge */}
        {isYieldWaiting && !isReversing && (
          <Html position={[0, 1.50, 0]} center style={{ pointerEvents: 'none' }}>
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/95 border border-amber-200 text-slate-950 font-mono font-black text-[10.5px] tracking-wider uppercase shadow-[0_0_18px_rgba(245,158,11,0.9)] whitespace-nowrap">
              <span className="w-2 h-2 rounded-full bg-slate-950 animate-pulse"></span>
              <span>⏳ YIELDING TO OBSTACLE • MAKING WAY</span>
            </div>
          </Html>
        )}

        {/* Real-time Courteous Standoff Badge */}
        {isCourteousStandoff && !isReversing && !isYieldWaiting && (
          <Html position={[0, 1.50, 0]} center style={{ pointerEvents: 'none' }}>
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/95 border border-amber-200 text-slate-950 font-mono font-black text-[10.5px] tracking-wider uppercase shadow-[0_0_18px_rgba(245,158,11,0.9)] whitespace-nowrap">
              <span className="w-2 h-2 rounded-full bg-slate-950 animate-pulse"></span>
              <span>🚶 {standoffLabel || 'COURTEOUS STANDOFF • WAITING PATIENTLY'}</span>
            </div>
          </Html>
        )}

        {/* Real-time Courteous Following Badge */}
        {isFollowingObstacle && !isCourteousStandoff && !isOvertaking && (
          <Html position={[0, 1.50, 0]} center style={{ pointerEvents: 'none' }}>
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-600/95 border border-blue-200 text-white font-mono font-black text-[10.5px] tracking-wider uppercase shadow-[0_0_18px_rgba(37,99,235,0.9)] whitespace-nowrap">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
              <span>🛡️ COURTEOUS FOLLOWING • SAFE DISTANCE ({followingDistanceLabel || '3.2m'})</span>
            </div>
          </Html>
        )}

        {/* Real-time Safe Orange Diversion Badge */}
        {isOvertaking && (
          <Html position={[0, 1.50, 0]} center style={{ pointerEvents: 'none' }}>
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-orange-500 border border-orange-200 text-white font-mono font-black text-[10.5px] tracking-wider uppercase shadow-[0_0_20px_rgba(249,115,22,0.95)] whitespace-nowrap">
              <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
              <span>⚡ SAFE ORANGE DIVERSION • COMFORTABLE CLEARANCE</span>
            </div>
          </Html>
        )}

        {/* Real-time Yielding/Slow Caution fallback Badge */}
        {!isCourteousStandoff && !isFollowingObstacle && !isOvertaking && (isSlowCaution || isWaiting) && (
          <Html position={[0, 1.45, 0]} center style={{ pointerEvents: 'none' }}>
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${isWaiting ? 'bg-amber-500/95 border-amber-200 shadow-[0_0_16px_rgba(245,158,11,0.9)]' : 'bg-sky-500/95 border-sky-200 shadow-[0_0_16px_rgba(56,189,248,0.9)]'} text-black font-mono font-black text-[10px] tracking-wider uppercase border whitespace-nowrap`}>
              <span className={`w-2 h-2 rounded-full bg-black ${isWaiting ? 'animate-pulse' : 'animate-ping'}`}></span>
              <span>{isWaiting ? '⏳ YIELDING TO TRAFFIC' : '⚡ CAUTION • REDUCED SPEED'}</span>
            </div>
          </Html>
        )}
      </group>
    </group>
  );
};

const Robot = ({
  path, currentIndex, isPlaying, gridSize, isMapView, speed, dynamicObstaclesRef,
  staticObstacles = [], drivableRouteRef, drivableRouteColorsRef, diversionRouteRef, upcomingLoopPoints3D = [],
  onReachNode, onMissionComplete, onObstacleDetected: _onObstacleDetected, onBarricadeBlocked, robotPosRef, robotRotRef, isEmergency = false,
  addExplanation,
  mapData,
}: {
  path: GridPoint[];
  currentIndex: number;
  isPlaying: boolean;
  gridSize: GridPoint;
  isMapView: boolean;
  speed: number;
  dynamicObstaclesRef: React.MutableRefObject<DynamicObstacle[]>;
  staticObstacles?: GridPoint[];
  drivableRouteRef?: React.MutableRefObject<number[]>;
  drivableRouteColorsRef?: React.MutableRefObject<number[]>;
  diversionRouteRef?: React.MutableRefObject<number[]>;
  upcomingLoopPoints3D?: THREE.Vector3[];
  onReachNode: (idx: number) => void;
  onMissionComplete: () => void;
  onObstacleDetected: (obsPos: GridPoint) => void;
  onBarricadeBlocked?: (robotPos: THREE.Vector3, barricadePos: THREE.Vector3) => void;
  robotPosRef: React.MutableRefObject<THREE.Vector3 | null>;
  robotRotRef: React.MutableRefObject<number>;
  isEmergency?: boolean;
  addExplanation?: (msg: string) => void;
  mapData?: MapData | null;
}) => {
  const ref = useRef<THREE.Group>(null);
  const isMovingRef = useRef(false);
  const [isMoving, setIsMoving] = useState(false);
  const [isSlowCaution, setIsSlowCaution] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [isCourteousStandoff, setIsCourteousStandoff] = useState(false);
  const [standoffReason, setStandoffReason] = useState<string>('');
  const [isFollowingObstacle, setIsFollowingObstacle] = useState(false);
  const [isOvertaking, setIsOvertaking] = useState(false);
  const [followingDistanceLabel, setFollowingDistanceLabel] = useState('');
  const [isBarricadeBlocked, setIsBarricadeBlocked] = useState(false);
  const [barricadeStatusLabel, setBarricadeStatusLabel] = useState('');
  
  interface BarricadeInspection {
    blockerId: string;
    inspectionTimer: number;
    stage: 'approaching' | 'viewing' | 'rerouting';
    loggedApproach: boolean;
    loggedViewing: boolean;
    loggedReroute: boolean;
  }
  const barricadeInspectionRef = useRef<BarricadeInspection | null>(null);
  
  // Reversing and Yielding State (make way for obstacle first, then proceed to destination)
  const isReversingRef = useRef(false);
  const [isReversing, setIsReversing] = useState(false);
  const isYieldWaitingRef = useRef(false);
  const [isYieldWaiting, setIsYieldWaiting] = useState(false);
  const reverseTargetSRef = useRef(0);
  const yieldWaitTimerRef = useRef(0);
  const conflictingObsIdRef = useRef<string | null>(null);
  const lastReverseEndTimeRef = useRef(0);

  const isCourteousStandoffRef = useRef(false);
  const courteousClearTimerRef = useRef(0);
  const lastOvertakeLogTime = useRef(0);
  const hasCompletedRef = useRef(false);
  const actualSpeedRef = useRef(0);
  const pauseTimeRef = useRef(0);
  const distanceTraveledRef = useRef(0);
  // Robot travels on assigned side of the road (right lane: +0.35m from road centerline)
  const smoothedLateralOffsetRef = useRef(0.35);

  interface ActiveDiversionState {
    obstacleId: string;
    sStart: number;
    sObstacle: number;
    peakAmplitude: number; // Delta from assigned lane center
    clearanceMeters: number;
    diversionEndS: number;
    targetPassingOffset: number;
    createdAt: number;
  }
  const activeDiversionRef = useRef<ActiveDiversionState | null>(null);

  // 1. Build centripetal 3D spline curve and cumulative waypoint distances
  const { curve, totalLength, waypointDistances } = useMemo(() => {
    if (!path || path.length === 0) {
      return { curve: null, totalLength: 0, waypointDistances: [] };
    }

    const unique3DPoints: THREE.Vector3[] = [];
    const wpDists: number[] = [0];

    for (let i = 0; i < path.length; i++) {
      const pt = path[i];
      const [x, y, z] = getGridPosition(pt, gridSize, 0.22, isMapView);
      const vec = new THREE.Vector3(x, y, z);
      if (unique3DPoints.length === 0 || unique3DPoints[unique3DPoints.length - 1].distanceTo(vec) > 0.08) {
        if (unique3DPoints.length > 0) {
          const segDist = unique3DPoints[unique3DPoints.length - 1].distanceTo(vec);
          wpDists.push(wpDists[wpDists.length - 1] + segDist);
        }
        unique3DPoints.push(vec);
      }
    }

    if (unique3DPoints.length < 2) {
      return { curve: null, totalLength: 0, waypointDistances: [] };
    }

    // Anchor first point to exact current robot road centerline to eliminate startup jumps
    if (ref.current && unique3DPoints.length >= 2) {
      const cur = ref.current.position;
      const segDir = unique3DPoints[1].clone().sub(unique3DPoints[0]).normalize();
      const segNormal = new THREE.Vector3(segDir.z, 0, -segDir.x);
      // Project robot's current position to road centerline by subtracting the assigned lane offset (+0.35m)
      const centerlineCur = cur.clone().sub(segNormal.clone().multiplyScalar(0.35));
      if (cur.distanceTo(unique3DPoints[0]) < 3.5) {
        unique3DPoints[0].set(centerlineCur.x, unique3DPoints[0].y, centerlineCur.z);
      }
    }

    const catmull = new THREE.CatmullRomCurve3(unique3DPoints, false, 'centripetal');
    const len = catmull.getLength();
    return { curve: catmull, totalLength: len, waypointDistances: wpDists };
  }, [path, gridSize, isMapView]);

  // Reset progress when new path is assigned
  useEffect(() => {
    hasCompletedRef.current = false;
    distanceTraveledRef.current = 0;
    courteousClearTimerRef.current = 0;
    isReversingRef.current = false;
    setIsReversing(false);
    isYieldWaitingRef.current = false;
    setIsYieldWaiting(false);
    conflictingObsIdRef.current = null;
    activeDiversionRef.current = null;
    barricadeInspectionRef.current = null;
    setIsBarricadeBlocked(false);
    setBarricadeStatusLabel('');
  }, [path]);

  useFrame((_state, delta) => {
    if (!ref.current) return;
    const safeDelta = Math.min(0.04, delta);
    const currentPos = ref.current.position;
    robotPosRef.current = currentPos.clone();
    robotRotRef.current = ref.current.rotation.y;

    if (pauseTimeRef.current > 0) {
      pauseTimeRef.current -= delta;
      if (isMovingRef.current) { isMovingRef.current = false; setIsMoving(false); }

      // Keep continuous blue patrol line visible during checkpoint pause (strictly on drivable road surface)
      if (drivableRouteRef && curve) {
        const s = distanceTraveledRef.current;
        const ASSIGNED_LANE_OFFSET = 0.35;
        const bluePts: number[] = [];
        const sampleStep = 0.20;
        for (let testS = s; testS <= totalLength; testS += sampleStep) {
          const u = testS / totalLength;
          const basePt = curve.getPointAt(u);
          const tangent = curve.getTangentAt(u).normalize();
          const normal = new THREE.Vector3(tangent.z, 0, -tangent.x);

          let testPt = basePt.clone().add(normal.clone().multiplyScalar(ASSIGNED_LANE_OFFSET));
          if (!isPointOnDrivableRoad(testPt.x, testPt.z, mapData, 0.18)) {
            for (let off = ASSIGNED_LANE_OFFSET * 0.75; Math.abs(off) > 0.04; off *= 0.6) {
              const alt = basePt.clone().add(normal.clone().multiplyScalar(off));
              if (isPointOnDrivableRoad(alt.x, alt.z, mapData, 0.18)) {
                testPt = alt;
                break;
              }
            }
            if (!isPointOnDrivableRoad(testPt.x, testPt.z, mapData, 0.15)) {
              testPt = basePt.clone();
            }
          }
          bluePts.push(testPt.x, 0.18, testPt.z);
        }
        if (upcomingLoopPoints3D && upcomingLoopPoints3D.length > 0) {
          for (let i = 0; i < upcomingLoopPoints3D.length; i++) {
            const pt3d = upcomingLoopPoints3D[i];
            if (isPointOnDrivableRoad(pt3d.x, pt3d.z, mapData, 0.18)) {
              bluePts.push(pt3d.x, 0.18, pt3d.z);
            }
          }
        }
        if (bluePts.length >= 6) {
          drivableRouteRef.current = bluePts;
        }
      }
      return;
    }

    if (!curve || totalLength <= 0.01) {
      if (path.length > 0) {
        const [sx, sy, sz] = getGridPosition(path[0], gridSize, 0.22, isMapView);
        currentPos.lerp(new THREE.Vector3(sx, sy, sz), 0.1);
      }
      if (drivableRouteRef) {
        const flatRoute: number[] = [currentPos.x, 0.18, currentPos.z];
        const flatColors: number[] = [0.22, 0.74, 0.97];
        if (upcomingLoopPoints3D && upcomingLoopPoints3D.length > 0) {
          for (let i = 0; i < upcomingLoopPoints3D.length; i++) {
            flatRoute.push(upcomingLoopPoints3D[i].x, 0.18, upcomingLoopPoints3D[i].z);
            flatColors.push(0.22, 0.74, 0.97);
          }
        }
        if (flatRoute.length >= 6) {
          drivableRouteRef.current = flatRoute;
          if (drivableRouteColorsRef) {
            drivableRouteColorsRef.current = flatColors;
          }
        }
      }
      return;
    }

    if (isPlaying) {
      const s = distanceTraveledRef.current;
      const uCurrent = Math.min(1.0, Math.max(0.0, s / totalLength));

      // Current nominal curve position & tangent
      const nominalPos = curve.getPointAt(uCurrent);
      const nominalTangent = curve.getTangentAt(uCurrent).normalize();

      const cruiseSpeed = speed;
      const ASSIGNED_LANE_OFFSET = 0.35; // Center of robot's assigned driving lane (right side of road)

      // Analytical raised-cosine function to compute exact lateral offset relative to assigned lane (+0.35m)
      // When no diversion is needed: returns ASSIGNED_LANE_OFFSET (+0.35m)
      // When diverting: smooth raised-cosine arch out to targetPassingOffset, passes obstacle, and merges seamlessly back to ASSIGNED_LANE_OFFSET (+0.35m)
      const getDrivableOffsetAt = (evalS: number): number => {
        if (!activeDiversionRef.current) {
          return ASSIGNED_LANE_OFFSET;
        }

        const div = activeDiversionRef.current;
        const sStart = div.sStart;
        const sObs = div.sObstacle;
        const sEnd = div.diversionEndS;
        const A = div.peakAmplitude;

        let diversionDelta = 0;
        if (evalS <= sStart) {
          diversionDelta = 0;
        } else if (evalS <= sObs) {
          const span = Math.max(0.01, sObs - sStart);
          const p = (evalS - sStart) / span;
          diversionDelta = A * Math.sin((Math.PI / 2) * p) ** 2;
        } else if (evalS < sEnd) {
          const span = Math.max(0.01, sEnd - sObs);
          const q = (evalS - sObs) / span;
          diversionDelta = A * Math.cos((Math.PI / 2) * q) ** 2;
        } else {
          diversionDelta = 0;
        }

        // Smooth dampening near destination endpoint (< 2.0m from end)
        const distFromEnd = totalLength - evalS;
        if (distFromEnd < 2.0) {
          diversionDelta *= Math.max(0.0, distFromEnd / 2.0);
        }

        // Offset is assigned lane center PLUS the smooth diversion delta
        const finalOffset = ASSIGNED_LANE_OFFSET + diversionDelta;

        // Strictly clamp within asphalt road boundaries (±1.15m)
        return Math.max(-1.15, Math.min(1.15, finalOffset));
      };

      // ── Step 1: Scan All Obstacles (Dynamic & Static) ──
      interface ScannedObs {
        id: string;
        isDynamic: boolean;
        type: 'car' | 'person' | 'static';
        pos3D: THREE.Vector3;
        radius: number; // Hull collision radius
        vel3D: THREE.Vector3;
        heading: THREE.Vector3;
        distToRobot: number;
        sObstacle: number;
        longitudinalDelta: number; // sObstacle - s
        lateralDist: number;
        sideDot: number;
        isMoving: boolean;
        speed: number;
        relForwardVel: number;
        relLateralVel: number;
        isCrossingTraffic: boolean;
        minCpaDist: number;
        timeAtCpa: number;
      }

      const scannedObstacles: ScannedObs[] = [];
      let closestObsDist = 999;

      // A. Dynamic Obstacles (Vehicles and Pedestrians)
      if (dynamicObstaclesRef && dynamicObstaclesRef.current && dynamicObstaclesRef.current.length > 0) {
        for (const obs of dynamicObstaclesRef.current) {
          const obsPos3D = obs.pos3D || (() => {
            const [ox, , oz] = getGridPosition(obs.pos, gridSize, 0.05, isMapView);
            return new THREE.Vector3(ox, currentPos.y, oz);
          })();
          const distToRobot = currentPos.distanceTo(obsPos3D);

          if (distToRobot < 15.0) {
            if (distToRobot < closestObsDist) closestObsDist = distToRobot;

            const obsVel = obs.velocity || new THREE.Vector3(0, 0, 0);
            const obsSpeed = obsVel.length();
            const isMoving = obsSpeed > 0.08 || (obs.type === 'person' && obs.isMoving);
            const obsRadius = obs.type === 'car' ? 0.45 : 0.32;

            // Predictive trajectory and CPA projection across horizon (t = 0.15s to 4.5s)
            // Projects robot's actual position along active lane + diversion offset
            let minCpaDist = 999;
            let timeAtCpa = 1.0;
            let sAtCpa = s + 1.0;
            for (let tFuture = 0.15; tFuture <= 4.5; tFuture += 0.15) {
              const futureObsPos = obsPos3D.clone().add(obsVel.clone().multiplyScalar(tFuture));
              const projectedS = Math.min(totalLength, s + cruiseSpeed * tFuture);
              const uProj = Math.min(1.0, Math.max(0.0, projectedS / totalLength));
              const projBase = curve.getPointAt(uProj);
              const projTangent = curve.getTangentAt(uProj).normalize();
              const projNormal = new THREE.Vector3(projTangent.z, 0, -projTangent.x);
              const projOffset = getDrivableOffsetAt(projectedS);
              const projectedRobotPos = projBase.add(projNormal.multiplyScalar(projOffset));
              const cpaDist = projectedRobotPos.distanceTo(futureObsPos);
              if (cpaDist < minCpaDist) {
                minCpaDist = cpaDist;
                timeAtCpa = tFuture;
                sAtCpa = projectedS;
              }
            }

            // Estimate projection onto spline
            const lookStart = Math.max(0, s - 1.5);
            const lookEnd = Math.min(totalLength, s + 16.0);
            let bestDistSq = 9999;
            let sObstacle = sAtCpa;
            let curvePtAtObs = nominalPos;
            let tangentAtObs = nominalTangent;

            for (let testS = lookStart; testS <= lookEnd; testS += 0.25) {
              const testU = testS / totalLength;
              const testPt = curve.getPointAt(testU);
              const dSq = testPt.distanceToSquared(obsPos3D);
              if (dSq < bestDistSq) {
                bestDistSq = dSq;
                sObstacle = testS;
                curvePtAtObs = testPt;
                tangentAtObs = curve.getTangentAt(testU);
              }
            }

            const lateralDist = Math.sqrt(bestDistSq);
            const normAtObs = new THREE.Vector3(tangentAtObs.z, 0, -tangentAtObs.x).normalize();
            const toObs = new THREE.Vector3().subVectors(obsPos3D, curvePtAtObs);
            const sideDot = toObs.dot(normAtObs);
            const longitudinalDelta = sObstacle - s;

            const relForwardVel = obsVel.dot(tangentAtObs);
            const relLateralVel = obsVel.dot(normAtObs);
            const isCrossingTraffic = Math.abs(relLateralVel) > 0.10 && minCpaDist < 2.4 && timeAtCpa <= 4.0;
            const obsHeading = obsSpeed > 0.05 ? obsVel.clone().normalize() : tangentAtObs.clone().normalize();

            scannedObstacles.push({
              id: obs.id,
              isDynamic: true,
              type: obs.type,
              pos3D: obsPos3D,
              radius: obsRadius,
              vel3D: obsVel.clone(),
              heading: obsHeading,
              distToRobot,
              sObstacle,
              longitudinalDelta,
              lateralDist,
              sideDot,
              isMoving,
              speed: obsSpeed,
              relForwardVel,
              relLateralVel,
              isCrossingTraffic,
              minCpaDist,
              timeAtCpa,
            });
          }
        }
      }

      // B. Static Obstacles (Blockers, Barriers, and Map Obstacles)
      if (staticObstacles && staticObstacles.length > 0) {
        for (let idx = 0; idx < staticObstacles.length; idx++) {
          const blocker = staticObstacles[idx];
          const [bx, , bz] = getGridPosition(blocker, gridSize, 0.05, isMapView);
          const bPos = new THREE.Vector3(bx, currentPos.y, bz);
          const distToRobot = currentPos.distanceTo(bPos);

          if (distToRobot < 15.0) {
            if (distToRobot < closestObsDist) closestObsDist = distToRobot;

            let bestDistSq = 9999;
            let sObstacle = s + 1.0;
            let curvePtAtObs = nominalPos;
            let tangentAtObs = nominalTangent;

            const lookStart = Math.max(0, s - 1.5);
            const lookEnd = Math.min(totalLength, s + 16.0);
            for (let testS = lookStart; testS <= lookEnd; testS += 0.25) {
              const testU = testS / totalLength;
              const testPt = curve.getPointAt(testU);
              const dSq = testPt.distanceToSquared(bPos);
              if (dSq < bestDistSq) {
                bestDistSq = dSq;
                sObstacle = testS;
                curvePtAtObs = testPt;
                tangentAtObs = curve.getTangentAt(testU);
              }
            }

            const lateralDist = Math.sqrt(bestDistSq);
            const normAtObs = new THREE.Vector3(tangentAtObs.z, 0, -tangentAtObs.x).normalize();
            const toObs = new THREE.Vector3().subVectors(bPos, curvePtAtObs);
            const sideDot = toObs.dot(normAtObs);
            const longitudinalDelta = sObstacle - s;
            const obsHeading = tangentAtObs.clone().normalize();

            scannedObstacles.push({
              id: `static-${blocker.x}-${blocker.y}-${idx}`,
              isDynamic: false,
              type: 'static',
              pos3D: bPos,
              radius: 0.50, // Physical static obstacle radius
              vel3D: new THREE.Vector3(0, 0, 0),
              heading: obsHeading,
              distToRobot,
              sObstacle,
              longitudinalDelta,
              lateralDist,
              sideDot,
              isMoving: false,
              speed: 0,
              relForwardVel: 0,
              relLateralVel: 0,
              isCrossingTraffic: false,
              minCpaDist: lateralDist,
              timeAtCpa: 0,
            });
          }
        }
      }

      // ── Step 2: Active Free Space Assessment & Pre-Turn Safe Path Calculation ──
      // ASSIGNED_LANE_OFFSET is defined above (+0.35m)

      // Safe real-world barricade detection horizon: 8.5m ahead in the road corridor
      // Beyond 8.5m, the robot approaches naturally at normal cruise speed
      const BARRICADE_DETECT_HORIZON = 8.5;
      const BARRICADE_SAFE_STOP_GAP = 2.8;

      // Detect static road barricades blocking the robot's driving corridor ahead (up to 8.5m)
      const staticBarricadesAhead = scannedObstacles.filter(
        o => o.type === 'static' && o.longitudinalDelta >= 0.20 && o.longitudinalDelta <= BARRICADE_DETECT_HORIZON && o.lateralDist <= 1.35
      );
      staticBarricadesAhead.sort((a, b) => a.longitudinalDelta - b.longitudinalDelta);
      const primaryBarricade = staticBarricadesAhead[0] || null;

      // Detect dynamic obstacles directly in front of the robot in its assigned lane (ahead up to 14.0m)
      // Assigned lane is centered around +0.35m; an obstacle directly blocks it if |o.sideDot - ASSIGNED_LANE_OFFSET| <= 0.85m
      const obstructingAhead = scannedObstacles.filter(
        o => o.type !== 'static' && o.longitudinalDelta >= 0.1 && o.longitudinalDelta <= 14.0 && Math.abs(o.sideDot - ASSIGNED_LANE_OFFSET) <= 0.85
      );
      obstructingAhead.sort((a, b) => a.longitudinalDelta - b.longitudinalDelta);
      const primaryDirectObstacle = obstructingAhead[0] || null;

      // Wider detection for general awareness and safe distance tracking (dynamic obstacles)
      const corridorObstacles = scannedObstacles.filter(
        o => o.type !== 'static' && o.longitudinalDelta >= 0.2 && o.longitudinalDelta <= 14.0 && (o.lateralDist < 1.45 || o.minCpaDist < 2.0)
      );
      corridorObstacles.sort((a, b) => a.longitudinalDelta - b.longitudinalDelta);
      const primaryAheadObs = primaryBarricade || primaryDirectObstacle || corridorObstacles[0] || null;

      let shouldCourteousStandOff = false;
      let currentStandoffLabel = '';
      let targetSpeed = cruiseSpeed;
      let isOvertakeFeasible = false;

      interface CandidateDiversionPlan {
        sStart: number;
        sObstacle: number;
        diversionEndS: number;
        peakAmplitude: number;
        targetPassingOffset: number;
        requiredSeparation: number;
      }

      // "When an obstacle is detected ahead, start planning and showing the yellow diversion route well before the robot reaches it."
      // "The robot must begin its gradual turn early, with enough distance to safely move around the obstacle—never make a last-second dodge."
      // "The yellow line must form a complete, smooth route: leave the blue route early, curve safely around the front of the obstacle with wide clearance, and gently merge back onto the blue route after passing."
      const calculateSafeDiversionPlan = (
        obs: ScannedObs
      ): CandidateDiversionPlan | null => {
        // Static road barricades block the entire roadway: never attempt to drive around or overtake a barricade
        if (obs.type === 'static') {
          return null;
        }

        const obsRadius = obs.type === 'car' ? 0.42 : 0.28;
        const robotRadius = 0.38;
        const wideAirBuffer = 0.45; // Generous wide clearance between hulls (45cm open air)
        const requiredSeparation = obsRadius + robotRadius + wideAirBuffer; // ~1.25m to 1.28m

        // Candidate passing lane offsets on BOTH sides of the road
        // Normal lane is ASSIGNED_LANE_OFFSET (+0.35m on right side of road)
        // Standard passing is on the left corridor (-0.60m to -1.15m)
        // Alternative passing is on the right shoulder/corridor (+0.75m to +1.15m)
        const leftCandidateOffsets = [-0.60, -0.75, -0.90, -1.05, -1.15];
        const rightCandidateOffsets = [0.75, 0.90, 1.05, 1.15];

        // If obstacle is to the right or center (sideDot >= 0.1), prioritize left corridor (standard traffic rule), then right.
        // If obstacle is already to the left (sideDot < 0.1), prioritize right corridor, then left.
        const candidateOffsets = obs.sideDot >= 0.1
          ? [...leftCandidateOffsets, ...rightCandidateOffsets]
          : [...rightCandidateOffsets, ...leftCandidateOffsets];

        const sStart = Math.max(0, s);
        const sObs = obs.sObstacle;
        const leadInSpan = Math.max(0.1, sObs - sStart);

        // Never make a last-second dodge: require at least 1.4m of lead-in distance before the obstacle
        if (leadInSpan < 1.4) {
          return null; // Too close for a safe, gradual, smooth curve; must slow down and wait at safe distance
        }

        // Complete, smooth route: generous early lead-in and gentle, gradual merge-back
        const trailSpan = Math.max(3.8, Math.min(6.2, leadInSpan * 0.85));
        const sEnd = Math.min(totalLength, sObs + trailSpan);

        for (const passingOffset of candidateOffsets) {
          // Check lateral separation from target obstacle at apex
          const lateralSepAtApex = Math.abs(passingOffset - obs.sideDot);
          if (lateralSepAtApex < requiredSeparation) {
            continue; // Insufficient wide clearance from obstacle
          }

          const peakDelta = passingOffset - ASSIGNED_LANE_OFFSET;
          let isPlanSafe = true;

          // Simulate and verify complete path from sStart to sEnd before turning
          for (let testS = sStart; testS <= sEnd; testS += 0.15) {
            const u = Math.min(1.0, Math.max(0.0, testS / totalLength));
            const basePt = curve.getPointAt(u);
            const tangent = curve.getTangentAt(u).normalize();
            const normal = new THREE.Vector3(tangent.z, 0, -tangent.x);

            let diversionDelta = 0;
            if (testS <= sStart) {
              diversionDelta = 0;
            } else if (testS <= sObs) {
              const span = Math.max(0.01, sObs - sStart);
              const p = (testS - sStart) / span;
              diversionDelta = peakDelta * Math.sin((Math.PI / 2) * p) ** 2;
            } else {
              const span = Math.max(0.01, sEnd - sObs);
              const q = (testS - sObs) / span;
              diversionDelta = peakDelta * Math.cos((Math.PI / 2) * q) ** 2;
            }

            const totalOffset = ASSIGNED_LANE_OFFSET + diversionDelta;
            const candPt = basePt.clone().add(normal.clone().multiplyScalar(totalOffset));

            // 1. Must be strictly on drivable asphalt road surface (never grass, curb, sidewalk, building)
            if (!isPointOnDrivableRoad(candPt.x, candPt.z, mapData, 0.12)) {
              isPlanSafe = false;
              break;
            }

            // 2. Wide clearance around target obstacle near apex
            if (Math.abs(testS - sObs) < 0.9) {
              const distToTargetObs = candPt.distanceTo(obs.pos3D);
              if (distToTargetObs < obsRadius + robotRadius + 0.38) {
                isPlanSafe = false;
                break;
              }
            }

            // 3. Collision-free against all other obstacles, avoiding pedestrians and traffic (never force anyone to react)
            for (const other of scannedObstacles) {
              if (other.id === obs.id) continue;
              const otherRadius = other.type === 'car' ? 0.42 : (other.type === 'static' ? 0.45 : 0.30);
              const extraBuffer = other.type === 'person' ? 0.50 : 0.35;
              const distToOther = candPt.distanceTo(other.pos3D);
              if (distToOther < robotRadius + otherRadius + extraBuffer) {
                isPlanSafe = false;
                break;
              }

              // Oncoming vehicle conflict check in passing corridor (never cut off oncoming traffic)
              if (other.relForwardVel < -0.10 &&
                  other.longitudinalDelta > -1.0 && other.longitudinalDelta < 12.0 &&
                  Math.abs(other.sideDot - passingOffset) < 0.95) {
                isPlanSafe = false;
                break;
              }

              // Pedestrian in or near passing corridor
              if (other.type === 'person' &&
                  other.longitudinalDelta > -1.0 && other.longitudinalDelta < (sEnd - sStart) + 2.0 &&
                  Math.abs(other.sideDot - passingOffset) < 0.90) {
                isPlanSafe = false;
                break;
              }
            }

            if (!isPlanSafe) break;
          }

          if (isPlanSafe) {
            return {
              sStart,
              sObstacle: sObs,
              diversionEndS: sEnd,
              peakAmplitude: peakDelta,
              targetPassingOffset: passingOffset,
              requiredSeparation,
            };
          }
        }

        return null;
      };

      if (primaryBarricade) {
        const barricade = primaryBarricade;

        // Static road barricades block the entire roadway: never allow driving around or overtaking
        shouldCourteousStandOff = true;
        isOvertakeFeasible = false;
        setIsOvertaking(false);

        if (barricade.longitudinalDelta > BARRICADE_SAFE_STOP_GAP && barricade.distToRobot > (BARRICADE_SAFE_STOP_GAP + 0.05)) {
          // Approach naturally and decelerate smoothly between 8.5m detection horizon and 2.8m safe gap
          const normDist = THREE.MathUtils.clamp(
            (barricade.longitudinalDelta - BARRICADE_SAFE_STOP_GAP) / (BARRICADE_DETECT_HORIZON - BARRICADE_SAFE_STOP_GAP),
            0.0,
            1.0
          );
          // Progressive sine-squared deceleration curve: smooth, natural braking
          const approachSpeed = Math.max(0.18, cruiseSpeed * Math.sin((Math.PI / 2) * normDist) ** 2);
          targetSpeed = Math.min(targetSpeed, approachSpeed);

          currentStandoffLabel = `ROAD BARRICADE AHEAD (${barricade.longitudinalDelta.toFixed(1)}m) • SLOWING DOWN`;
          setBarricadeStatusLabel(`ROAD BARRICADE AHEAD (${barricade.longitudinalDelta.toFixed(1)}m) • SLOWING DOWN`);
          setIsBarricadeBlocked(true);

          if (!barricadeInspectionRef.current || barricadeInspectionRef.current.blockerId !== barricade.id) {
            barricadeInspectionRef.current = {
              blockerId: barricade.id,
              inspectionTimer: 0,
              stage: 'approaching',
              loggedApproach: false,
              loggedViewing: false,
              loggedReroute: false,
            };
          }
          if (barricadeInspectionRef.current && !barricadeInspectionRef.current.loggedApproach) {
            barricadeInspectionRef.current.loggedApproach = true;
            if (addExplanation) {
              addExplanation(`🚧 Road barricade detected blocking route ahead (${barricade.longitudinalDelta.toFixed(1)}m). Decelerating smoothly to safe standoff distance...`);
            }
          }
        } else {
          // Stopped at safe viewing distance (2.8m)! Zero speed, safe buffer maintained, no collision or close pass
          targetSpeed = 0;
          setIsBarricadeBlocked(true);

          if (!barricadeInspectionRef.current || barricadeInspectionRef.current.blockerId !== barricade.id) {
            barricadeInspectionRef.current = {
              blockerId: barricade.id,
              inspectionTimer: 0,
              stage: 'viewing',
              loggedApproach: true,
              loggedViewing: false,
              loggedReroute: false,
            };
          }

          if (barricadeInspectionRef.current) {
            barricadeInspectionRef.current.stage = 'viewing';
            if (!barricadeInspectionRef.current.loggedViewing) {
              barricadeInspectionRef.current.loggedViewing = true;
              if (addExplanation) {
                addExplanation('🛑 Stopped at safe viewing distance (2.8m). Road barricade confirmed: Route unavailable.');
              }
            }

            barricadeInspectionRef.current.inspectionTimer += safeDelta;
            const inspectTime = barricadeInspectionRef.current.inspectionTimer;

            if (inspectTime < 0.65) {
              currentStandoffLabel = 'ROAD BARRICADE DETECTED • SAFE VIEWING GAP (2.8m)';
              setBarricadeStatusLabel('ROAD BARRICADE DETECTED • SAFE VIEWING GAP (2.8m)');
            } else if (inspectTime < 1.45) {
              currentStandoffLabel = 'ROUTE UNAVAILABLE • EVALUATING ROAD NETWORK';
              setBarricadeStatusLabel('ROUTE UNAVAILABLE • EVALUATING ROAD NETWORK');
            } else {
              currentStandoffLabel = 'RE-ROUTING TO DESTINATION VIA OPEN ROADS';
              setBarricadeStatusLabel('RE-ROUTING TO DESTINATION VIA OPEN ROADS');
              if (!barricadeInspectionRef.current.loggedReroute) {
                barricadeInspectionRef.current.loggedReroute = true;
                barricadeInspectionRef.current.stage = 'rerouting';
                if (addExplanation) {
                  addExplanation('🧠 Route unavailable: Calculating new valid road-only route to destination...');
                }
                if (onBarricadeBlocked) {
                  onBarricadeBlocked(currentPos, barricade.pos3D);
                }
              }
            }
          }
        }
      } else {
        if (isBarricadeBlocked && (!barricadeInspectionRef.current || barricadeInspectionRef.current.stage !== 'rerouting')) {
          setIsBarricadeBlocked(false);
          setBarricadeStatusLabel('');
        }
        if (primaryDirectObstacle) {
          const obs = primaryDirectObstacle;

          // "The diversion must not look like casual overtaking. Use the yellow path only when the normal blue route is genuinely blocked."
          const isGenuinelyBlocked =
            obs.type === 'static' ||
            !obs.isMoving ||
            obs.speed < 0.35 ||
            (obs.relForwardVel < 0.20 && obs.longitudinalDelta < 13.0);

          if (!isGenuinelyBlocked) {
            // Normal vehicle or pedestrian traveling in the driving lane ahead:
            // "If overtaking is unsafe, the robot should reduce speed, keep a safe following distance, and give the obstacle enough space to move ahead."
            // "The robot must never rush past, force an obstacle to move, collide, or come too close."
            setIsFollowingObstacle(true);
            setIsOvertaking(false);
            shouldCourteousStandOff = false;

            const leadSpeed = Math.max(0.2, obs.speed || (obs.relForwardVel + actualSpeedRef.current));
            const desiredFollowGap = 3.6; // 3.6m safe following distance

            if (obs.longitudinalDelta < desiredFollowGap) {
              // Too close: reduce speed smoothly to give the lead obstacle space to move ahead
              const slowDownFactor = THREE.MathUtils.clamp(obs.longitudinalDelta / desiredFollowGap, 0.35, 0.85);
              targetSpeed = Math.min(targetSpeed, leadSpeed * slowDownFactor);
              setFollowingDistanceLabel(`GIVING LEAD SPACE (${obs.longitudinalDelta.toFixed(1)}m) • PACING BEHIND`);
            } else if (obs.longitudinalDelta < desiredFollowGap + 2.5) {
              // In safe following envelope: pace smoothly behind the lead vehicle
              const paceFactor = THREE.MathUtils.clamp((obs.longitudinalDelta - desiredFollowGap) / 2.0, 0.70, 1.0);
              targetSpeed = Math.min(targetSpeed, leadSpeed * paceFactor);
              setFollowingDistanceLabel(`SAFE FOLLOWING DISTANCE (${obs.longitudinalDelta.toFixed(1)}m) • PACING`);
            } else {
              setFollowingDistanceLabel('');
            }
          } else {
            // Blue route is genuinely blocked by a stopped/stalled obstacle or roadblock
            const isAlreadyDivertingForThisObs = activeDiversionRef.current && activeDiversionRef.current.obstacleId === obs.id;

            if (isAlreadyDivertingForThisObs) {
              isOvertakeFeasible = true;
              setIsOvertaking(true);
              setIsFollowingObstacle(false);
              shouldCourteousStandOff = false;
              // "the robot may slowly and smoothly overtake using a planned yellow diversion route... never rush past"
              targetSpeed = Math.min(cruiseSpeed * 0.50, 1.65);
              setFollowingDistanceLabel('SLOW & SMOOTH OVERTAKE • WIDE CLEARANCE');
            } else {
              // "When an obstacle is detected ahead, start planning and showing the yellow diversion route well before the robot reaches it."
              // "The robot must begin its gradual turn early, with enough distance to safely move around the obstacle—never make a last-second dodge."
              const safePlan = calculateSafeDiversionPlan(obs);

              if (safePlan) {
                // Safe gap exists on the road: slowly and smoothly overtake using planned yellow diversion route
                activeDiversionRef.current = {
                  obstacleId: obs.id,
                  sStart: safePlan.sStart,
                  sObstacle: safePlan.sObstacle,
                  peakAmplitude: safePlan.peakAmplitude,
                  clearanceMeters: safePlan.requiredSeparation,
                  diversionEndS: safePlan.diversionEndS,
                  targetPassingOffset: safePlan.targetPassingOffset,
                  createdAt: Date.now(),
                };
                if (isReversingRef.current) {
                  isReversingRef.current = false;
                  setIsReversing(false);
                }
                isOvertakeFeasible = true;
                setIsOvertaking(true);
                setIsFollowingObstacle(false);
                shouldCourteousStandOff = false;
                // Slow, smooth overtaking speed (never rush past, controlled pace ~1.6m/s)
                targetSpeed = Math.min(cruiseSpeed * 0.50, 1.65);
                setFollowingDistanceLabel('SLOW & SMOOTH OVERTAKE • WIDE CLEARANCE');
                if (addExplanation) {
                  addExplanation(`⚡ Road blocked ahead (${obs.longitudinalDelta.toFixed(1)}m). Executing slow, smooth orange diversion with wide clearance.`);
                }
              } else {
                // "If overtaking is unsafe, the robot should reduce speed, keep a safe following distance, and give the obstacle enough space to move ahead."
                shouldCourteousStandOff = true;
                setIsOvertaking(false);
                const safeStandoffDist = 3.2; // 3.2m safe buffer from obstacle

                if (obs.longitudinalDelta > safeStandoffDist + 0.2) {
                  // Smoothly reduce speed as the robot approaches the blocked obstacle
                  const approachSpeed = THREE.MathUtils.clamp(
                    (obs.longitudinalDelta - safeStandoffDist) * 0.35,
                    0.15,
                    cruiseSpeed * 0.40
                  );
                  targetSpeed = Math.min(targetSpeed, approachSpeed);
                  currentStandoffLabel = 'OBSTACLE AHEAD • REDUCING SPEED';
                } else {
                  // Safely holding position at 3.2m standoff distance waiting for safe passing space
                  targetSpeed = 0;
                  currentStandoffLabel = 'WAITING FOR SAFE PASSING SPACE • SAFE STANDOFF (3.2m)';
                }
              }
            }
          }
        }
      }

      // Update or retire active diversion:
      // "Keep this yellow line visible for the entire diversion. Remove it only after the robot has fully rejoined the blue route."
      if (activeDiversionRef.current) {
        const div = activeDiversionRef.current;
        const hasPassedObstacle = s >= div.sObstacle + 0.3;
        const hasRejoinedBlue = s >= div.diversionEndS - 0.25;

        if (hasPassedObstacle && hasRejoinedBlue) {
          activeDiversionRef.current = null;
          if (diversionRouteRef) {
            diversionRouteRef.current = [];
          }
        }
      }

      // Check if robot is actively executing a safe yellow diversion
      const isOvertakingActive = isOvertakeFeasible || activeDiversionRef.current !== null;

      // ── Step 3: Motion & Emergency Fallback State Machine ──
      const now = Date.now();
      const reverseCooldownElapsed = now - lastReverseEndTimeRef.current > 3500;

      // Emergency Fallback: Reverse ONLY if physical clearance is critically breached (< 0.50m)
      const robotRadius = 0.45;
      const robotHeading = new THREE.Vector3(
        Math.sin(ref.current.rotation.y),
        0,
        Math.cos(ref.current.rotation.y)
      );
      const robotLateral = new THREE.Vector3(
        robotHeading.z,
        0,
        -robotHeading.x
      );

      let criticalDeadlockObs: ScannedObs | null = null;
      let forwardCorridorSpeedCap = cruiseSpeed;

      for (const obs of scannedObstacles) {
        // Exclude the obstacle currently being diverted around so its forward position doesn't freeze the robot!
        if (activeDiversionRef.current && activeDiversionRef.current.obstacleId === obs.id) {
          continue;
        }

        const obsRadius = obs.type === 'car' ? 0.42 : (obs.type === 'static' ? 0.45 : 0.28);
        const distCenter = currentPos.distanceTo(obs.pos3D);
        const edgeDist = Math.max(0, distCenter - (robotRadius + obsRadius));

        const toObs = new THREE.Vector3().subVectors(obs.pos3D, currentPos);
        const fwdDist = toObs.dot(robotHeading);
        const latDist = Math.abs(toObs.dot(robotLateral));

        // Forward corridor speed envelope for OTHER obstacles:
        // If an obstacle is ahead in the robot's driving corridor (fwdDist > 0.05m, latDist < 0.90m):
        if (fwdDist > 0.05 && fwdDist < 4.5 && latDist < 0.90) {
          // If edge clearance drops below 1.40m, smoothly cap targetSpeed:
          if (edgeDist < 1.40) {
            const speedCap = THREE.MathUtils.clamp((edgeDist - 0.50) * 1.2, 0, cruiseSpeed);
            if (speedCap < forwardCorridorSpeedCap) {
              forwardCorridorSpeedCap = speedCap;
            }
          }
        }

        // Emergency reverse trigger: if clearance is critically breached (< 0.40m) in forward corridor
        if (fwdDist > -0.15 && fwdDist < 1.4 && latDist < 0.85 && edgeDist < 0.40) {
          criticalDeadlockObs = obs;
        }
      }

      if (!isReversingRef.current && !isYieldWaitingRef.current && criticalDeadlockObs && reverseCooldownElapsed) {
        isReversingRef.current = true;
        setIsReversing(true);
        conflictingObsIdRef.current = criticalDeadlockObs.id;
        reverseTargetSRef.current = Math.max(0.2, s - 1.8);
        if (addExplanation) {
          addExplanation('🛡️ Proximity buffer: Gently reversing to establish safe turning clearance.');
        }
      }

      if (isReversingRef.current) {
        targetSpeed = -0.55;
        shouldCourteousStandOff = true;
        if (!currentStandoffLabel) {
          currentStandoffLabel = 'REVERSING • CREATING SAFE TURNING ROOM';
        }

        // While reversing, continuously check if enough turning room has been created to immediately execute diversion:
        if (primaryDirectObstacle) {
          const recheckPlan = calculateSafeDiversionPlan(primaryDirectObstacle);
          if (recheckPlan && primaryDirectObstacle.longitudinalDelta >= 1.6) {
            // Turning room created! Immediately transition into the safe yellow diversion:
            isReversingRef.current = false;
            setIsReversing(false);
            activeDiversionRef.current = {
              obstacleId: primaryDirectObstacle.id,
              sStart: recheckPlan.sStart,
              sObstacle: recheckPlan.sObstacle,
              peakAmplitude: recheckPlan.peakAmplitude,
              clearanceMeters: recheckPlan.requiredSeparation,
              diversionEndS: recheckPlan.diversionEndS,
              targetPassingOffset: recheckPlan.targetPassingOffset,
              createdAt: Date.now(),
            };
            isOvertakeFeasible = true;
            shouldCourteousStandOff = false;
            targetSpeed = Math.min(cruiseSpeed * 0.50, 1.65);
            if (addExplanation) {
              addExplanation('⚡ Turning clearance achieved: Executing safe orange diversion bypass.');
            }
          }
        }

        const backedUpFarEnough = s <= reverseTargetSRef.current + 0.05 || s <= 0.05;
        if (backedUpFarEnough && isReversingRef.current) {
          isReversingRef.current = false;
          setIsReversing(false);
          lastReverseEndTimeRef.current = Date.now();
          // Immediately check if diversion can be started now:
          if (primaryDirectObstacle) {
            const finalPlan = calculateSafeDiversionPlan(primaryDirectObstacle);
            if (finalPlan) {
              activeDiversionRef.current = {
                obstacleId: primaryDirectObstacle.id,
                sStart: finalPlan.sStart,
                sObstacle: finalPlan.sObstacle,
                peakAmplitude: finalPlan.peakAmplitude,
                clearanceMeters: finalPlan.requiredSeparation,
                diversionEndS: finalPlan.diversionEndS,
                targetPassingOffset: finalPlan.targetPassingOffset,
                createdAt: Date.now(),
              };
              isOvertakeFeasible = true;
              shouldCourteousStandOff = false;
              targetSpeed = Math.min(cruiseSpeed * 0.50, 1.65);
            } else {
              targetSpeed = 0;
            }
          }
        }
      } else if (isYieldWaitingRef.current) {
        targetSpeed = 0;
        yieldWaitTimerRef.current += delta;
        shouldCourteousStandOff = true;
        currentStandoffLabel = 'YIELDING • PREPARING TO PROCEED';

        if (yieldWaitTimerRef.current > 0.8) {
          isYieldWaitingRef.current = false;
          setIsYieldWaiting(false);
          lastReverseEndTimeRef.current = Date.now();
          conflictingObsIdRef.current = null;
          targetSpeed = cruiseSpeed;
        }
      } else {
        if (isOvertakingActive) {
          // Slowly and smoothly overtake using a planned orange diversion route, maintaining wide clearance throughout
          targetSpeed = Math.min(cruiseSpeed * 0.50, 1.65);
          const logTime = Date.now();
          if (logTime - lastOvertakeLogTime.current > 4000 && addExplanation) {
            lastOvertakeLogTime.current = logTime;
            addExplanation('⚡ Safe Diversion: Slowly and smoothly overtaking obstruction along orange route with wide clearance.');
          }
        } else if (!shouldCourteousStandOff) {
          // Normal patrol along the blue route
          const distToEnd = totalLength - s;
          if (distToEnd < 2.0) {
            targetSpeed = THREE.MathUtils.lerp(0.35, cruiseSpeed, Math.max(0.1, distToEnd / 2.0));
          } else {
            targetSpeed = cruiseSpeed;
          }
        }

        // Apply strict forward corridor safety speed envelope for OTHER obstacles
        if (!isReversingRef.current && forwardCorridorSpeedCap < targetSpeed) {
          targetSpeed = forwardCorridorSpeedCap;
          if (forwardCorridorSpeedCap <= 0.05) {
            shouldCourteousStandOff = true;
            if (!currentStandoffLabel) {
              currentStandoffLabel = 'SAFETY CLEARANCE • BUFFER MAINTAINED';
            }
          }
        }
      }

      // ── Physical Lateral & Orientation Control (Lookahead Steering) ──
      // Evaluated before longitudinal dynamics so vehicle anticipates turns and dampens speed gently
      const lookaheadDist = activeDiversionRef.current ? 1.25 : 0.85;
      const lookaheadS = Math.min(totalLength, Math.max(0, distanceTraveledRef.current + lookaheadDist));
      const lookaheadU = lookaheadS / totalLength;
      const lookaheadBasePos = curve.getPointAt(lookaheadU);
      const lookaheadTangent = curve.getTangentAt(lookaheadU).normalize();
      const lookaheadNormal = new THREE.Vector3(lookaheadTangent.z, 0, -lookaheadTangent.x);

      let lookaheadOffset = getDrivableOffsetAt(lookaheadS);
      let lookaheadTarget = lookaheadBasePos.clone().add(
        lookaheadNormal.clone().multiplyScalar(lookaheadOffset)
      );
      if (!isPointOnDrivableRoad(lookaheadTarget.x, lookaheadTarget.z, mapData, 0.18)) {
        for (let scale = 0.85; scale >= 0.2; scale -= 0.15) {
          const testPos = lookaheadBasePos.clone().add(
            lookaheadNormal.clone().multiplyScalar(lookaheadOffset * scale)
          );
          if (isPointOnDrivableRoad(testPos.x, testPos.z, mapData, 0.18)) {
            lookaheadTarget = testPos;
            break;
          }
        }
      }

      const forwardVector = new THREE.Vector3().subVectors(lookaheadTarget, currentPos);
      let yawDiff = 0;
      if (forwardVector.lengthSq() > 0.001) {
        const targetYaw = Math.atan2(forwardVector.x, forwardVector.z);
        let diff = targetYaw - ref.current.rotation.y;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        yawDiff = diff;
        // Physically realistic, gradual steering (rate capped at 1.65 rad/s ~ 94 deg/s)
        const maxTurnRate = 1.65;
        const turnDelta = THREE.MathUtils.clamp(diff, -maxTurnRate * safeDelta, maxTurnRate * safeDelta);
        ref.current.rotation.y += turnDelta;
      }

      // Smooth cornering speed dampening: when steering into sharp curves or diversions,
      // gently reduce targetSpeed beforehand instead of abrupt deceleration
      if (Math.abs(yawDiff) > 0.22 && targetSpeed > 0) {
        const curveSeverity = Math.min(1.0, (Math.abs(yawDiff) - 0.22) / 0.80);
        const cornerDamping = THREE.MathUtils.lerp(1.0, 0.45, curveSeverity);
        targetSpeed *= cornerDamping;
      }

      // When stopped or moving very slowly with a large heading discrepancy (such as after rerouting from a barricade),
      // hold forward speed at 0 while the vehicle smoothly rotates its heading in place to align with the new road direction.
      // This prevents sliding backwards, jumping, or making abrupt turns.
      if (Math.abs(yawDiff) > 0.45 && actualSpeedRef.current < 0.25) {
        targetSpeed = 0;
      }

      // ── Physical Longitudinal Dynamics (Gentle Acceleration & Controlled Braking) ──
      // "It must never jump, teleport, snap to a new position, or suddenly change direction."
      // "Every movement must be continuous and physically believable, using smooth steering, gradual turning, gentle acceleration, and controlled braking."
      if (targetSpeed > actualSpeedRef.current) {
        const maxAccel = 1.6; // m/s^2 gentle, realistic acceleration
        actualSpeedRef.current = Math.min(targetSpeed, actualSpeedRef.current + maxAccel * safeDelta);
      } else if (targetSpeed < actualSpeedRef.current) {
        const maxBrake = 2.4; // m/s^2 controlled, smooth braking without jerky stops
        actualSpeedRef.current = Math.max(targetSpeed, actualSpeedRef.current - maxBrake * safeDelta);
      }

      // ── Continuous Distance Integration ──
      if (Math.abs(actualSpeedRef.current) > 0.01) {
        if (!isMovingRef.current) { isMovingRef.current = true; setIsMoving(true); }
        distanceTraveledRef.current = Math.max(0, Math.min(totalLength, distanceTraveledRef.current + actualSpeedRef.current * safeDelta));
      } else {
        if (isMovingRef.current) { isMovingRef.current = false; setIsMoving(false); }
      }

      // ── Exact Road Surface Trajectory Tracking ──
      const currentU = Math.min(1.0, Math.max(0.0, distanceTraveledRef.current / totalLength));
      const baseSplinePos = curve.getPointAt(currentU);
      const baseSplineTangent = curve.getTangentAt(currentU).normalize();
      const baseSplineNormal = new THREE.Vector3(baseSplineTangent.z, 0, -baseSplineTangent.x);

      let exactOffset = getDrivableOffsetAt(distanceTraveledRef.current);
      let targetWithCurvedDiversion = baseSplinePos.clone().add(
        baseSplineNormal.clone().multiplyScalar(exactOffset)
      );

      // Verify and guarantee robot chassis stays strictly on drivable road surface
      if (!isPointOnDrivableRoad(targetWithCurvedDiversion.x, targetWithCurvedDiversion.z, mapData, 0.18)) {
        for (let scale = 0.85; scale >= 0.2; scale -= 0.15) {
          const testPos = baseSplinePos.clone().add(
            baseSplineNormal.clone().multiplyScalar(exactOffset * scale)
          );
          if (isPointOnDrivableRoad(testPos.x, testPos.z, mapData, 0.18)) {
            targetWithCurvedDiversion = testPos;
            exactOffset *= scale;
            break;
          }
        }
      }

      smoothedLateralOffsetRef.current = exactOffset;

      // ── Kinematic Position Continuity: Zero Snapping / Zero Teleportation ──
      // Physical vehicle position displacement per frame is bounded by current vehicle velocity.
      const stepDist = currentPos.distanceTo(targetWithCurvedDiversion);
      const maxDisplacementPerFrame = (Math.abs(actualSpeedRef.current) + 0.25) * safeDelta + 0.015;
      if (stepDist > maxDisplacementPerFrame) {
        // Smoothly close any residual gap over consecutive frames at physical vehicle speed
        const moveDir = new THREE.Vector3().subVectors(targetWithCurvedDiversion, currentPos).normalize();
        currentPos.add(moveDir.multiplyScalar(maxDisplacementPerFrame));
      } else {
        currentPos.copy(targetWithCurvedDiversion);
      }
      currentPos.y = 0.22;

      // ── Soft Continuous Hull Repulsion Buffer (No Teleporting Repulsion) ──
      for (const obs of scannedObstacles) {
        const obsRadius = obs.type === 'car' ? 0.42 : (obs.type === 'static' ? 0.45 : 0.28);
        const minDist = robotRadius + obsRadius + 0.15; // Hard physical boundary (~0.95m center-to-center)
        const distCenter = currentPos.distanceTo(obs.pos3D);
        if (distCenter < minDist && distCenter > 0.001) {
          const pushDir = new THREE.Vector3().subVectors(currentPos, obs.pos3D).normalize();
          const overlap = minDist - distCenter;
          const pushDist = Math.min(overlap, overlap * safeDelta * 2.5 + 0.01);
          currentPos.add(pushDir.multiplyScalar(pushDist));
        }
      }

      // --- Update Navigation Route Lines ---
      // (1) Continuous Blue Route Line: Always displays the full normal patrol route ahead on the robot's assigned side of the road (+0.35m)
      // Must NEVER go onto sidewalks, grass, buildings, or any non-drivable area
      if (drivableRouteRef) {
        const bluePts: number[] = [];
        const sampleStep = 0.20;
        for (let testS = s; testS <= totalLength; testS += sampleStep) {
          const u = testS / totalLength;
          const basePt = curve.getPointAt(u);
          const tangent = curve.getTangentAt(u).normalize();
          const normal = new THREE.Vector3(tangent.z, 0, -tangent.x);

          let validOffset = ASSIGNED_LANE_OFFSET;
          let testPt = basePt.clone().add(normal.clone().multiplyScalar(validOffset));

          // Ensure marking NEVER goes onto sidewalks, grass, buildings, or any non-drivable area
          if (!isPointOnDrivableRoad(testPt.x, testPt.z, mapData, 0.18)) {
            let found = false;
            for (let off = ASSIGNED_LANE_OFFSET * 0.75; Math.abs(off) > 0.04; off *= 0.6) {
              const alt = basePt.clone().add(normal.clone().multiplyScalar(off));
              if (isPointOnDrivableRoad(alt.x, alt.z, mapData, 0.18)) {
                testPt = alt;
                found = true;
                break;
              }
            }
            if (!found && isPointOnDrivableRoad(basePt.x, basePt.z, mapData, 0.15)) {
              testPt = basePt.clone();
            }
          }
          bluePts.push(testPt.x, 0.18, testPt.z);
        }
        if (upcomingLoopPoints3D && upcomingLoopPoints3D.length > 0) {
          for (let i = 0; i < upcomingLoopPoints3D.length; i++) {
            const pt3d = upcomingLoopPoints3D[i];
            if (isPointOnDrivableRoad(pt3d.x, pt3d.z, mapData, 0.18)) {
              if (i === 0 && bluePts.length >= 3) {
                const lastX = bluePts[bluePts.length - 3];
                const lastZ = bluePts[bluePts.length - 1];
                if (Math.hypot(pt3d.x - lastX, pt3d.z - lastZ) < 0.25) continue;
              }
              bluePts.push(pt3d.x, 0.18, pt3d.z);
            }
          }
        }
        if (bluePts.length >= 6) {
          drivableRouteRef.current = bluePts;
        }
      }

      // (2) Temporary Orange Diversion Line:
      // Show radiant orange diversion route from robot's position, around obstacle, and merging back to blue route.
      // Must NEVER go onto sidewalks, grass, buildings, or any non-drivable area
      if (diversionRouteRef) {
        if (activeDiversionRef.current) {
          const activeDiv = activeDiversionRef.current;
          const orangePts: number[] = [];
          // Starts at robot's current 3D position (elevated to 0.20m above road surface)
          orangePts.push(currentPos.x, 0.20, currentPos.z);
          const step = 0.15;
          for (let testS = s + step; testS <= activeDiv.diversionEndS; testS += step) {
            const u = Math.min(1.0, testS / totalLength);
            const basePt = curve.getPointAt(u);
            const tangent = curve.getTangentAt(u).normalize();
            const normal = new THREE.Vector3(tangent.z, 0, -tangent.x);
            const off = getDrivableOffsetAt(testS);
            let divPt = basePt.clone().add(normal.clone().multiplyScalar(off));

            // Strictly clamp points to ensure orange line remains 100% on drivable road
            if (!isPointOnDrivableRoad(divPt.x, divPt.z, mapData, 0.18)) {
              for (let scale = 0.9; scale >= 0.3; scale -= 0.1) {
                const alt = basePt.clone().add(normal.clone().multiplyScalar(off * scale));
                if (isPointOnDrivableRoad(alt.x, alt.z, mapData, 0.18)) {
                  divPt = alt;
                  break;
                }
              }
            }
            orangePts.push(divPt.x, 0.20, divPt.z);
          }
          // Seamlessly reconnects back onto the blue route at the assigned lane center
          const endU = Math.min(1.0, activeDiv.diversionEndS / totalLength);
          const endBase = curve.getPointAt(endU);
          const endTangent = curve.getTangentAt(endU).normalize();
          const endNormal = new THREE.Vector3(endTangent.z, 0, -endTangent.x);
          let endPt = endBase.clone().add(endNormal.clone().multiplyScalar(ASSIGNED_LANE_OFFSET));
          if (!isPointOnDrivableRoad(endPt.x, endPt.z, mapData, 0.18)) {
            endPt = endBase.clone();
          }
          orangePts.push(endPt.x, 0.20, endPt.z);

          if (orangePts.length >= 6) {
            diversionRouteRef.current = orangePts;
          } else {
            diversionRouteRef.current = [];
          }
        } else {
          diversionRouteRef.current = [];
        }
      }

      // State updates for UI badges
      setIsCourteousStandoff(shouldCourteousStandOff);
      setStandoffReason(currentStandoffLabel);
      isCourteousStandoffRef.current = shouldCourteousStandOff;

      const isFollowing = shouldCourteousStandOff && primaryAheadObs !== null;
      setIsFollowingObstacle(isFollowing);
      if (primaryAheadObs) {
        setFollowingDistanceLabel(`${Math.max(0.1, primaryAheadObs.longitudinalDelta).toFixed(1)}m`);
      }

      setIsOvertaking(isOvertakingActive);
      setIsSlowCaution(isOvertakingActive || targetSpeed < cruiseSpeed * 0.85);
      setIsWaiting(shouldCourteousStandOff || (targetSpeed === 0 && Math.abs(actualSpeedRef.current) < 0.1));

      // Waypoint & Mission Completion Tracking
      if (waypointDistances.length > 0) {
        for (let i = currentIndex; i < waypointDistances.length; i++) {
          if (distanceTraveledRef.current >= waypointDistances[i] - 0.2) {
            onReachNode(i);
          }
        }
      }

      if (distanceTraveledRef.current >= totalLength - 0.15) {
        if (!hasCompletedRef.current) {
          hasCompletedRef.current = true;
          onMissionComplete();
        }
      }
    } else {
      if (isMovingRef.current) { isMovingRef.current = false; setIsMoving(false); }
      actualSpeedRef.current = 0;
      // Stably hold physical position without moving, lerping, or snapping
      // Always display clear navigation line showing full planned route ahead even when paused or idle
      if (drivableRouteRef && curve) {
        const s = distanceTraveledRef.current;
        const ASSIGNED_LANE_OFFSET = 0.35;
        const idleDiversions: { sObstacle: number; peakAmplitude: number }[] = [];
        const allObs: { pos: THREE.Vector3; id: string }[] = [];
        if (staticObstacles && staticObstacles.length > 0) {
          for (let idx = 0; idx < staticObstacles.length; idx++) {
            const [bx, , bz] = getGridPosition(staticObstacles[idx], gridSize, 0.05, isMapView);
            allObs.push({ pos: new THREE.Vector3(bx, currentPos.y, bz), id: `s-${idx}` });
          }
        }
        if (dynamicObstaclesRef && dynamicObstaclesRef.current) {
          for (const d of dynamicObstaclesRef.current) {
            if (d.type !== 'person' && (!d.isMoving || (d.velocity && d.velocity.length() < 0.08))) {
              const pos3d = d.pos3D || (() => {
                const [ox, , oz] = getGridPosition(d.pos, gridSize, 0.05, isMapView);
                return new THREE.Vector3(ox, currentPos.y, oz);
              })();
              allObs.push({ pos: pos3d, id: d.id });
            }
          }
        }

        for (const obs of allObs) {
          let bestDistSq = 9999;
          let sObstacle = s;
          let tangentAtObs = curve.getTangentAt(0);
          let ptAtObs = curve.getPointAt(0);
          for (let testS = 0; testS <= totalLength; testS += 0.35) {
            const u = testS / totalLength;
            const pt = curve.getPointAt(u);
            const dSq = pt.distanceToSquared(obs.pos);
            if (dSq < bestDistSq) {
              bestDistSq = dSq;
              sObstacle = testS;
              ptAtObs = pt;
              tangentAtObs = curve.getTangentAt(u);
            }
          }
          if (bestDistSq < 0.85 * 0.85 && sObstacle > s - 1.0 && sObstacle < s + 8.0) {
            const normAtObs = new THREE.Vector3(tangentAtObs.z, 0, -tangentAtObs.x).normalize();
            const toObs = new THREE.Vector3().subVectors(obs.pos, ptAtObs);
            const sideDot = toObs.dot(normAtObs);
            // Obstacle blocks assigned right lane
            if (sideDot > -0.15) {
              const obsRadius = 0.55;
              const robotRadius = 0.40;
              const minSafetySeparation = obsRadius + robotRadius + 0.45;
              const targetPassingOffset = Math.max(-1.15, Math.min(-0.70, sideDot - minSafetySeparation));
              if (targetPassingOffset >= -1.25) {
                idleDiversions.push({
                  sObstacle,
                  peakAmplitude: targetPassingOffset - ASSIGNED_LANE_OFFSET
                });
              }
            }
          }
        }

        // Build continuous blue line along assigned lane
        const bluePts: number[] = [];
        const sampleStep = 0.20;
        for (let testS = s; testS <= totalLength; testS += sampleStep) {
          const u = testS / totalLength;
          const basePt = curve.getPointAt(u);
          const tangent = curve.getTangentAt(u).normalize();
          const normal = new THREE.Vector3(tangent.z, 0, -tangent.x);
          const bluePt = basePt.clone().add(normal.clone().multiplyScalar(ASSIGNED_LANE_OFFSET));
          bluePts.push(bluePt.x, 0.18, bluePt.z);
        }
        if (upcomingLoopPoints3D && upcomingLoopPoints3D.length > 0) {
          for (let i = 0; i < upcomingLoopPoints3D.length; i++) {
            bluePts.push(upcomingLoopPoints3D[i].x, 0.18, upcomingLoopPoints3D[i].z);
          }
        }
        if (bluePts.length >= 6) {
          drivableRouteRef.current = bluePts;
        }

        // Build temporary orange diversion line if active or idle diversion exists
        if (diversionRouteRef) {
          if (activeDiversionRef.current || idleDiversions.length > 0) {
            const div = activeDiversionRef.current || idleDiversions[0];
            const orangePts: number[] = [];
            const halfSpan = Math.max(3.2, Math.min(5.5, div.sObstacle - s));
            const divStartS = Math.max(0, s);
            const divEndS = Math.min(totalLength, div.sObstacle + halfSpan);
            orangePts.push(currentPos.x, 0.20, currentPos.z);
            for (let testS = s + 0.15; testS <= divEndS; testS += 0.15) {
              const u = Math.min(1.0, testS / totalLength);
              const basePt = curve.getPointAt(u);
              const tangent = curve.getTangentAt(u).normalize();
              const normal = new THREE.Vector3(tangent.z, 0, -tangent.x);
              let deltaOff = 0;
              if (testS <= divStartS) {
                deltaOff = 0;
              } else if (testS <= div.sObstacle) {
                const p = (testS - divStartS) / Math.max(0.01, div.sObstacle - divStartS);
                deltaOff = div.peakAmplitude * Math.sin((Math.PI / 2) * p) ** 2;
              } else if (testS < divEndS) {
                const q = (testS - div.sObstacle) / Math.max(0.01, divEndS - div.sObstacle);
                deltaOff = div.peakAmplitude * Math.cos((Math.PI / 2) * q) ** 2;
              }
              const off = Math.max(-1.15, Math.min(1.15, ASSIGNED_LANE_OFFSET + deltaOff));
              const divPt = basePt.clone().add(normal.clone().multiplyScalar(off));
              orangePts.push(divPt.x, 0.20, divPt.z);
            }
            // Seamlessly reconnects back onto the blue route at the assigned lane center
            const endU = Math.min(1.0, divEndS / totalLength);
            const endBase = curve.getPointAt(endU);
            const endTangent = curve.getTangentAt(endU).normalize();
            const endNormal = new THREE.Vector3(endTangent.z, 0, -endTangent.x);
            const endPt = endBase.clone().add(endNormal.clone().multiplyScalar(ASSIGNED_LANE_OFFSET));
            orangePts.push(endPt.x, 0.20, endPt.z);

            diversionRouteRef.current = orangePts;
          } else {
            diversionRouteRef.current = [];
          }
        }
      }
    }
  });

  const startPos = getGridPosition(path[0] || { x: 0, y: 0, f: 0 }, gridSize, 0.22, isMapView);
  return (
    <group ref={ref} position={startPos}>
      <DetailedRobot 
        isMoving={isMoving} 
        isEmergency={isEmergency} 
        isSlowCaution={isSlowCaution} 
        isWaiting={isWaiting} 
        isCourteousStandoff={isCourteousStandoff}
        standoffLabel={standoffReason}
        isFollowingObstacle={isFollowingObstacle}
        isOvertaking={isOvertaking}
        followingDistanceLabel={followingDistanceLabel}
        isReversing={isReversing}
        isYieldWaiting={isYieldWaiting}
        isBarricadeBlocked={isBarricadeBlocked}
        barricadeLabel={barricadeStatusLabel}
      />
    </group>
  );
};

const DrivablePathLine = ({ 
  drivableRouteRef,
  diversionRouteRef,
  drivableRouteColorsRef: _colorsRef,
  path,
  gridSize,
  isMapView,
  color = "#00d2ff", 
  lineWidth = 8.0, 
  opacity = 1.0 
}: { 
  drivableRouteRef: React.MutableRefObject<number[]>;
  diversionRouteRef?: React.MutableRefObject<number[]>;
  drivableRouteColorsRef?: React.MutableRefObject<number[]>;
  path: GridPoint[];
  gridSize: GridPoint;
  isMapView: boolean;
  color?: string; 
  lineWidth?: number; 
  opacity?: number; 
}) => {
  const { size } = useThree();

  // (1) Blue Normal Patrol Route Line (Continuous along assigned side of the road)
  // Drawn above road surface, thick, high-contrast, never occluded by robot, obstacles, shadows, or camera angle
  const blueLineGeom = useMemo(() => new LineGeometry(), []);
  const blueLineMat = useMemo(() => new LineMaterial({
    color: new THREE.Color(color).getHex(),
    linewidth: lineWidth,
    resolution: new THREE.Vector2(size.width, size.height),
    transparent: true,
    opacity: opacity,
    depthTest: false,
    depthWrite: false,
  }), [lineWidth, opacity, size.width, size.height, color]);

  const blueGlowMat = useMemo(() => new LineMaterial({
    color: new THREE.Color('#0284c7').getHex(),
    linewidth: lineWidth * 2.2,
    resolution: new THREE.Vector2(size.width, size.height),
    transparent: true,
    opacity: 0.55,
    depthTest: false,
    depthWrite: false,
  }), [lineWidth, size.width, size.height]);

  const blueLineObj = useMemo(() => {
    const obj = new Line2(blueLineGeom, blueLineMat);
    obj.renderOrder = 101;
    return obj;
  }, [blueLineGeom, blueLineMat]);
  const blueGlowObj = useMemo(() => {
    const obj = new Line2(blueLineGeom, blueGlowMat);
    obj.renderOrder = 100;
    return obj;
  }, [blueLineGeom, blueGlowMat]);

  // (2) Radiant Orange Temporary Diversion Line (Appears ONLY for active safe diversion)
  // Drawn above blue route line, thick, high-contrast, and never hidden
  const orangeLineGeom = useMemo(() => new LineGeometry(), []);
  const orangeLineMat = useMemo(() => new LineMaterial({
    color: new THREE.Color('#f97316').getHex(),
    linewidth: lineWidth * 1.25,
    resolution: new THREE.Vector2(size.width, size.height),
    transparent: true,
    opacity: 1.0,
    depthTest: false,
    depthWrite: false,
  }), [lineWidth, size.width, size.height]);

  const orangeGlowMat = useMemo(() => new LineMaterial({
    color: new THREE.Color('#ea580c').getHex(),
    linewidth: lineWidth * 2.6,
    resolution: new THREE.Vector2(size.width, size.height),
    transparent: true,
    opacity: 0.70,
    depthTest: false,
    depthWrite: false,
  }), [lineWidth, size.width, size.height]);

  const orangeLineObj = useMemo(() => {
    const obj = new Line2(orangeLineGeom, orangeLineMat);
    obj.renderOrder = 103;
    return obj;
  }, [orangeLineGeom, orangeLineMat]);
  const orangeGlowObj = useMemo(() => {
    const obj = new Line2(orangeLineGeom, orangeGlowMat);
    obj.renderOrder = 102;
    return obj;
  }, [orangeLineGeom, orangeGlowMat]);

  // Initial fallback points along assigned lane from path before dynamic simulation frames begin
  const fallbackPoints = useMemo(() => {
    if (path.length < 2) return [];
    const pts: number[] = [];
    for (let i = 0; i < path.length; i++) {
      const [x, , z] = getGridPosition(path[i], gridSize, 0.18, isMapView);
      let nx = 0;
      let nz = 0;
      if (i > 0) {
        const dx = path[i].x - path[i-1].x;
        const dy = path[i].y - path[i-1].y;
        const len = Math.hypot(dx, dy);
        if (len > 0.01) {
          nx = dy / len;
          nz = -dx / len;
        }
      }
      pts.push(x + nx * 0.35, 0.18, z + nz * 0.35);
    }
    return pts;
  }, [path, gridSize, isMapView]);

  useFrame(() => {
    blueLineMat.resolution.set(size.width, size.height);
    blueGlowMat.resolution.set(size.width, size.height);
    orangeLineMat.resolution.set(size.width, size.height);
    orangeGlowMat.resolution.set(size.width, size.height);

    // Update Continuous Blue Normal Patrol Route Line
    const bluePts = (drivableRouteRef.current && drivableRouteRef.current.length >= 6) 
      ? drivableRouteRef.current 
      : fallbackPoints;

    if (bluePts && bluePts.length >= 6) {
      blueLineGeom.setPositions(bluePts);
      blueLineObj.computeLineDistances();
      blueGlowObj.computeLineDistances();
      blueLineObj.visible = true;
      blueGlowObj.visible = true;
    } else {
      blueLineObj.visible = false;
      blueGlowObj.visible = false;
    }

    // Update Temporary Orange Diversion Line (Only visible during active diversion)
    const orangePts = diversionRouteRef && diversionRouteRef.current;
    if (orangePts && orangePts.length >= 6) {
      orangeLineGeom.setPositions(orangePts);
      orangeLineObj.computeLineDistances();
      orangeGlowObj.computeLineDistances();
      orangeLineObj.visible = true;
      orangeGlowObj.visible = true;
    } else {
      orangeLineObj.visible = false;
      orangeGlowObj.visible = false;
    }
  });

  return (
    <group>
      <primitive object={blueGlowObj} />
      <primitive object={blueLineObj} />
      <primitive object={orangeGlowObj} />
      <primitive object={orangeLineObj} />
    </group>
  );
};






const EnvironmentMap = React.memo(({ mapData, isNight, isTargeting, onMapClick }: { mapData: MapData, isNight: boolean, isTargeting?: boolean, onMapClick?: (p: THREE.Vector3) => void }) => {
  const { gridSize } = mapData;
  const margin = 10; // Space between grid edge and compound wall
  const compSizeX = gridSize.x + margin * 2;
  const compSizeY = gridSize.y + margin * 2;
  const wallThickness = 1.5;
  const wallHeight = 6;
  const halfX = compSizeX / 2;
  const halfY = compSizeY / 2;
  const wallColor = isNight ? '#0f172a' : '#e2e8f0';

  return (
    <group>
      {/* Campus grass ground — clickable for targeting */}
      <Plane
        args={[compSizeX, compSizeY]}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
        onClick={(e) => {
          if (isTargeting && onMapClick) { e.stopPropagation(); onMapClick(e.point); }
        }}
        onPointerOver={() => { if (isTargeting) document.body.style.cursor = 'crosshair'; }}
        onPointerOut={() => { if (isTargeting) document.body.style.cursor = 'auto'; }}
      >
        <meshStandardMaterial color={isNight ? '#14532d' : '#4ade80'} roughness={0.9} />
      </Plane>

      {/* Compound Boundary Walls */}
      {/* Back Wall */}
      <Box args={[compSizeX + wallThickness*2, wallHeight, wallThickness]} position={[0, wallHeight/2, halfY + wallThickness/2]} castShadow receiveShadow>
        <meshStandardMaterial color={wallColor} />
      </Box>
      {/* Front Wall */}
      <Box args={[compSizeX + wallThickness*2, wallHeight, wallThickness]} position={[0, wallHeight/2, -halfY - wallThickness/2]} castShadow receiveShadow>
        <meshStandardMaterial color={wallColor} />
      </Box>
      {/* Right Wall */}
      <Box args={[wallThickness, wallHeight, compSizeY]} position={[halfX + wallThickness/2, wallHeight/2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={wallColor} />
      </Box>
      {/* Left Wall */}
      <Box args={[wallThickness, wallHeight, compSizeY]} position={[-halfX - wallThickness/2, wallHeight/2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={wallColor} />
      </Box>
    </group>
  );
});

interface SimulationViewProps {
  mapData: MapData | null;
  onEvent: (event: any) => void;
  onDispatchMission?: (missionText: string) => void;
  selectedStrategyId?: string;
}

const PATROL_CHECKPOINTS = [
  'Administrative Building',
  'Library',
  'Auditorium',
  'Sports Ground',
  'Security Room'
];

const RoomsRender = React.memo(({
  rooms,
  gridSize,
  onSelectRoom,
}: {
  rooms?: Room[];
  gridSize: GridPoint;
  onSelectRoom: (room: Room) => void;
}) => {
  if (!rooms) return null;
  return (
    <>
      {rooms.map((room: Room) => {
        const width = (room.end.x - room.start.x + 1) * 0.75;
        const depth = (room.end.y - room.start.y + 1) * 0.75;
        const height = 3;
        const x = (room.start.x + room.end.x) / 2 - gridSize.x / 2;
        const z = (room.start.y + room.end.y) / 2 - gridSize.y / 2;
        return (
          <group
            key={room.id}
            position={[x, height / 2, z]}
            onClick={(e) => {
              e.stopPropagation();
              onSelectRoom(room);
            }}
          >
            <BuildingModel room={room} width={width} height={height} depth={depth} />
          </group>
        );
      })}
    </>
  );
});

export const SimulationView: React.FC<SimulationViewProps> = ({ mapData, onDispatchMission, selectedStrategyId }) => {
  const [path, setPath] = useState<GridPoint[]>([]);
  const [activePathColor, setActivePathColor] = useState<string>('#38bdf8');
  const [speedLimit, setSpeedLimit] = useState(50);
  const [isCTROpen, setIsCTROpen] = useState(false);
  const [ctrMessages, setCtrMessages] = useState<{sender: 'user'|'robot', text: string}[]>([{sender: 'robot', text: 'Hello! I am your autonomous service robot. How can I assist you today?'}]);
  const [ctrInput, setCtrInput] = useState('');
  
  const [currentPosIndex, setCurrentPosIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMapView, setIsMapView] = useState(false);

  const [isFollowing, setIsFollowing] = useState(false);
  const [triggerReset, setTriggerReset] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showReasoningLog, setShowReasoningLog] = useState(false);
  const [isCCMinimized, setIsCCMinimized] = useState(false);

  // Day mode permanently enabled
  const isNight = false;
  
  const [aiExplanations, setAiExplanations] = useState<string[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [isEmergencyTargeting, setIsEmergencyTargeting] = useState(false);
  const [isPlacingBlocker, setIsPlacingBlocker] = useState(false);
  const [isPlacingCrowd, setIsPlacingCrowd] = useState(false);
  const [isIdleMode, setIsIdleMode] = useState(false);
  const [userBlockers, setUserBlockers] = useState<GridPoint[]>([]);
  const [crowds, setCrowds] = useState<GridPoint[]>([]);

  const [policeState, setPoliceState] = useState<PoliceState>({ active: false, path: [], targetPos: null, phase: 'idle' });
  const policeStateRef = useRef<PoliceState>(policeState);
  useEffect(() => { policeStateRef.current = policeState; }, [policeState]);

  // Update path dynamically when idle if obstacles block initial route
  useEffect(() => {
    if (!isPlaying && path.length > 0 && mapData) {
       const currentLoc = path[0];
       const targetLoc = path[path.length - 1];
       const allObstacles = [...(mapData.obstacles || []), ...userBlockers];
       const isBlocked = path.some(p => 
          userBlockers.some(b => b.x === p.x && b.y === p.y && b.f === p.f)
       );
       if (isBlocked) {
         const newPath = calculatePath(currentLoc, targetLoc, allObstacles, mapData, true);
         if (newPath.length > 0) {
           setPath(newPath);
           setCurrentPosIndex(0);
         }
       }
    }
  }, [userBlockers, isPlaying]);
  
  const [dynamicObstacles, setDynamicObstacles] = useState<DynamicObstacle[]>([]);
  const dynamicObstaclesRef = useRef<DynamicObstacle[]>([]);
  useEffect(() => { dynamicObstaclesRef.current = dynamicObstacles; }, [dynamicObstacles]);

  // Real-time dynamic drivable route polyline coordinates (flat [x, y, z, ...])
  const drivableRouteRef = useRef<number[]>([]);
  const drivableRouteColorsRef = useRef<number[]>([]);
  const diversionRouteRef = useRef<number[]>([]);
  const isRecalculating = useRef(false);

  const [battery, setBattery] = useState(100);
  const [robotState, setRobotState] = useState<RobotState>('patrol');
  const [isOn, setIsOn] = useState(true);
  const patrolIndexRef = useRef(0);
  const [patrolCountdown, setPatrolCountdown] = useState<number | null>(null);
  const [currentPatrolTarget, setCurrentPatrolTarget] = useState<string>(PATROL_CHECKPOINTS[0]);
  const patrolTimerRef = useRef<any>(null);

  const [activeCCTab, setActiveCCTab] = useState<'dashboard' | 'tools' | 'locations'>('dashboard');
  const [modalType, setModalType] = useState<'food' | 'medical' | null>(null);

  const handleDeliverySubmit = (missionText: string) => {
    if (onDispatchMission) onDispatchMission(missionText);
    setModalType(null);
  };
  const batteryRef = useRef(100);
  const robotStateRef = useRef<RobotState>('idle');
  const originalMissionRef = useRef<{path: GridPoint[], index: number} | null>(null);
  const emergencyLocationRef = useRef<GridPoint | null>(null);
  const robotPosRef = useRef<THREE.Vector3 | null>(null);
  const robotRotRef = useRef<number>(0);
  const controlsRef = useRef<any>(null);
  const turnOffAfterEmergencyRef = useRef(false);
  const currentTaskIndexRef = useRef(0);
  const emergencyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dispatch smooth continuous patrol leg to an assigned checkpoint with zero teleportation
  const dispatchPatrolCheckpoint = (checkpointIndex: number) => {
    if (!mapData || !mapData.rooms || mapData.rooms.length === 0) return;
    const safeIdx = checkpointIndex % PATROL_CHECKPOINTS.length;
    patrolIndexRef.current = safeIdx;
    const targetName = PATROL_CHECKPOINTS[safeIdx];
    setCurrentPatrolTarget(targetName);

    const lower = targetName.toLowerCase();
    const targetRoom = 
      mapData.rooms.find(r => r.name.toLowerCase() === lower) ||
      mapData.rooms.find(r => r.name.toLowerCase().includes(lower)) ||
      mapData.rooms[0];

    if (!targetRoom) return;

    // Use current physical robot location (or start) snapped to the nearest road network
    const rawLoc = (robotPosRef.current && mapData) 
      ? getGridPointFromVector3(robotPosRef.current, mapData.gridSize) 
      : (path.length > 0 ? path[path.length - 1] : mapData.start);
    const currentLoc = getNearestRoadPoint(rawLoc, mapData);

    const rawTarget = targetRoom.door || targetRoom.start;
    const targetLoc = getNearestRoadPoint(rawTarget, mapData);

    const allObstacles = [...(mapData.obstacles || []), ...userBlockers];
    let patrolPath = calculatePath(currentLoc, targetLoc, allObstacles, mapData, true);
    if (patrolPath.length < 2) {
      // If user blocker blocked route, calculate road path around static obstacles
      patrolPath = calculatePath(currentLoc, targetLoc, mapData.obstacles || [], mapData, true);
    }

    if (patrolPath.length > 0) {
      setPath(patrolPath);
      setCurrentPosIndex(0);
      setRobotState('patrol');
      setIsPlaying(true);
      addExplanation('🚀 Continuous autonomous road patrol engaged. Navigating along drivable corridor.');

      // Place moving obstacles directly on the road in the robot's driving path on this checkpoint leg
      if (patrolPath.length >= 6) {
        const M = patrolPath.length;
        const i1 = Math.max(2, Math.floor(M * 0.30));
        const p1 = patrolPath.slice(i1);

        const i2 = Math.max(i1 + 3, Math.floor(M * 0.60));
        const p2 = patrolPath.slice(i2);

        setDynamicObstacles(prev => {
          return prev.map(o => {
            if (o.id === 'obs_road_0') {
              // If already active on the map, maintain continuous motion without snapping or teleporting
              if (o.pos && (o.path.length - o.currentIndex > 2)) {
                const targetPt = p1[p1.length - 1];
                const smoothConnector = calculatePath(o.pos, targetPt, allObstacles, mapData, true);
                if (smoothConnector && smoothConnector.length >= 2) {
                  return {
                    ...o,
                    path: smoothConnector,
                    currentIndex: 0,
                    targetPos: targetPt,
                    isMoving: true,
                  };
                }
                return o;
              }
              if (p1.length >= 2) {
                return {
                  ...o,
                  path: p1,
                  currentIndex: 0,
                  pos: p1[0],
                  targetPos: p1[p1.length - 1],
                  speed: 2.5,
                  isMoving: true,
                  isRoadWalker: true,
                };
              }
            }
            if (o.id === 'obs_road_1') {
              if (o.pos && (o.path.length - o.currentIndex > 2)) {
                const targetPt = p2[p2.length - 1];
                const smoothConnector = calculatePath(o.pos, targetPt, allObstacles, mapData, true);
                if (smoothConnector && smoothConnector.length >= 2) {
                  return {
                    ...o,
                    path: smoothConnector,
                    currentIndex: 0,
                    targetPos: targetPt,
                    isMoving: true,
                  };
                }
                return o;
              }
              if (p2.length >= 2) {
                return {
                  ...o,
                  path: p2,
                  currentIndex: 0,
                  pos: p2[0],
                  targetPos: p2[p2.length - 1],
                  speed: 1.35,
                  isMoving: true,
                  isRoadWalker: true,
                };
              }
            }
            return o;
          });
        });
      }
    }
  };

  // Precompute continuous multi-destination road route for the full remaining patrol loop
  const upcomingPatrolPoints3D = useMemo(() => {
    if (!mapData || !mapData.rooms || mapData.rooms.length === 0) return [];
    const N = PATROL_CHECKPOINTS.length;
    const safeIdx = patrolIndexRef.current % N;
    const allObstacles = [...(mapData.obstacles || []), ...userBlockers];

    const getRoom = (name: string) => {
      const lower = name.toLowerCase();
      return mapData.rooms.find(r => r.name.toLowerCase() === lower) ||
             mapData.rooms.find(r => r.name.toLowerCase().includes(lower)) ||
             mapData.rooms[0];
    };

    const flat3DPts: THREE.Vector3[] = [];

    // Chain subsequent destinations in the repeating patrol loop ahead of active checkpoint
    for (let step = 1; step < N; step++) {
      const fromIdx = (safeIdx + step) % N;
      const toIdx = (safeIdx + step + 1) % N;
      const r1 = getRoom(PATROL_CHECKPOINTS[fromIdx]);
      const r2 = getRoom(PATROL_CHECKPOINTS[toIdx]);
      if (!r1 || !r2) continue;

      const d1 = getNearestRoadPoint(r1.door || r1.start, mapData);
      const d2 = getNearestRoadPoint(r2.door || r2.start, mapData);

      let leg = calculatePath(d1, d2, allObstacles, mapData, true);
      if (leg.length < 2) {
        leg = calculatePath(d1, d2, mapData.obstacles || [], mapData, true);
      }

      // Convert grid waypoints along the road to smooth 3D points on assigned lane (+0.35m)
      const startIndex = flat3DPts.length > 0 ? 1 : 0;
      for (let i = startIndex; i < leg.length; i++) {
        const [x, , z] = getGridPosition(leg[i], mapData.gridSize, 0.18, isMapView);
        let nx = 0;
        let nz = 0;
        if (i > 0) {
          const dx = leg[i].x - leg[i-1].x;
          const dy = leg[i].y - leg[i-1].y;
          const len = Math.hypot(dx, dy);
          if (len > 0.01) {
            nx = dy / len;
            nz = -dx / len;
          }
        }
        let ptX = x + nx * 0.35;
        let ptZ = z + nz * 0.35;
        if (!isPointOnDrivableRoad(ptX, ptZ, mapData, 0.18)) {
          ptX = x;
          ptZ = z;
        }
        flat3DPts.push(new THREE.Vector3(ptX, 0.18, ptZ));
      }
    }

    return flat3DPts;
  }, [mapData, userBlockers, isMapView, currentPatrolTarget]);

  useEffect(() => {
    switch(robotState) {
      case 'emergency_response':
      case 'emergency_to_ctr':
      case 'ctr_to_emergency':
        setActivePathColor('#ef4444'); // red for high-priority emergency siren
        break;
      default:
        setActivePathColor('#38bdf8'); // Always display clear vibrant blue navigation line
    }
  }, [robotState]);

  const isEmergencyMode = robotState === 'emergency_response' || robotState === 'emergency_to_ctr' || robotState === 'ctr_to_emergency';

  useEffect(() => {
    if (isEmergencyMode) {
      let intervalId: ReturnType<typeof setInterval>;
      let audioCtx: AudioContext | null = null;
      let oscillator: OscillatorNode | null = null;
      
      try {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        oscillator.type = 'square';
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        const freq1 = 750;
        const freq2 = 600;
        let isHigh = true;
        
        intervalId = setInterval(() => {
          if (oscillator && audioCtx) {
            oscillator.frequency.setValueAtTime(isHigh ? freq2 : freq1, audioCtx.currentTime);
            isHigh = !isHigh;
          }
        }, 500);
        
        gainNode.gain.setValueAtTime(0.015, audioCtx.currentTime); // very low volume
        oscillator.start();
      } catch (e) {
        console.error("Audio playback failed", e);
      }
      
      return () => {
        if (intervalId) clearInterval(intervalId);
        if (oscillator) {
          try { oscillator.stop(); } catch (e) {}
        }
        if (audioCtx && audioCtx.state !== 'closed') {
          try { audioCtx.close(); } catch (e) {}
        }
      };
    }
  }, [isEmergencyMode]);


  const isOnRef = useRef(isOn);
  useEffect(() => { isOnRef.current = isOn; }, [isOn]);
  
  const togglePowerRef = useRef<any>(null);

  useEffect(() => { batteryRef.current = battery; }, [battery]);
  useEffect(() => { robotStateRef.current = robotState; }, [robotState]);

  useEffect(() => {
    const handleRemoteToggle = (e: any) => {
      const { turnOn } = e.detail;
      if (turnOn !== isOnRef.current) {
        if (togglePowerRef.current) togglePowerRef.current();
      }
    };
    const handleRemoteSpeed = (e: any) => {
      setSpeedLimit(e.detail.speed);
    };
    window.addEventListener('remote_toggle_power', handleRemoteToggle);
    window.addEventListener('remote_speed_update', handleRemoteSpeed);
    return () => {
      window.removeEventListener('remote_toggle_power', handleRemoteToggle);
      window.removeEventListener('remote_speed_update', handleRemoteSpeed);
    };
  }, []);

  const togglePowerBroadcast = (turnOn: boolean) => {
    if (turnOn === isOn) return;
    fetch(`http://${window.location.hostname}:3000/api/action`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ action: 'toggle_power', payload: { turnOn } })
    });
  };

  const togglePower = () => {
    if (isOn) {
      if (patrolTimerRef.current) {
        clearInterval(patrolTimerRef.current);
        patrolTimerRef.current = null;
      }
      setPatrolCountdown(null);
      setIsOn(false);
      addExplanation("Powering OFF. Returning to Robot Home for standby and charging...");
      originalMissionRef.current = null;
      const homeRoom = mapData?.rooms?.find(r => r.name.toLowerCase().includes('generator')) || mapData?.rooms?.[0];
      if (homeRoom && mapData) {
        const currentLoc = path.length > 0 && currentPosIndex < path.length ? path[currentPosIndex] : mapData.start;
        const homePath = calculatePath(currentLoc, homeRoom.door || homeRoom.start, [...(mapData.obstacles || []), ...userBlockers], mapData);
        if (homePath.length > 0) {
           setPath(homePath);
           setCurrentPosIndex(0);
           setRobotState('returning_home');
           setIsPlaying(true);
        } else {
           setRobotState('off');
           setIsPlaying(false);
        }
      }
    } else {
      setIsOn(true);
      setBattery(100);
      addExplanation("Powering ON. System initialized. Beginning continuous autonomous patrol.");
      dispatchPatrolCheckpoint(patrolIndexRef.current);
    }
  };

  useEffect(() => {
    togglePowerRef.current = togglePower;
  });

  const startSimulationRef = useRef<any>(null);
  
  useEffect(() => {
    const handleReq = () => {
      const loc = (path.length > 0 && currentPosIndex < path.length) ? path[currentPosIndex] : (mapData?.start || {x:61,y:81,f:0});
      window.dispatchEvent(new CustomEvent('robot_position_response', { detail: loc }));
    };
    window.addEventListener('request_robot_position', handleReq);
    return () => window.removeEventListener('request_robot_position', handleReq);
  }, [path, currentPosIndex, mapData]);

  useEffect(() => {
    const handleRemoteExecute = () => {
      if (startSimulationRef.current) startSimulationRef.current();
    };
    window.addEventListener('remote_execute_mission', handleRemoteExecute);
    return () => window.removeEventListener('remote_execute_mission', handleRemoteExecute);
  }, []);

  useEffect(() => {
    const handleRemoteAbort = () => {
       setIsPlaying(false);
       setRobotState('idle');
       setPath([]);
       originalMissionRef.current = null;
       addExplanation("EMERGENCY ABORT / ESTOP RECEIVED. Robot halted.");
    };
    window.addEventListener('remote_abort_mission', handleRemoteAbort);
    return () => window.removeEventListener('remote_abort_mission', handleRemoteAbort);
  }, []);

  useEffect(() => {
    if (mapData) {
      if (dynamicObstaclesRef.current.length === 0) {
        initializeDynamicObstacles();
      }
      if (isOn && path.length === 0) {
        dispatchPatrolCheckpoint(0);
      }
    }
  }, [mapData, isOn]);

  useEffect(() => {
    return () => {
      if (patrolTimerRef.current) {
        clearInterval(patrolTimerRef.current);
      }
    };
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);

  // Battery Drain / Charging Loop
  useEffect(() => {
    let interval: any;
    if (isPlaying && robotState !== 'charging' && robotState !== 'returning_home') {
      interval = setInterval(() => {
        setBattery(b => {
          const newB = Math.max(0, b - 1);
          if (newB <= 30 && robotStateRef.current !== 'charging' && robotStateRef.current !== 'returning_home' && !isRecalculating.current) {
            handleLowBattery();
          }
          return newB;
        });
      }, 2000); // 1% drain per 2000ms for slower battery drain
    } else if ((robotState === 'charging' || robotState === 'off') && !isPlaying) {
      interval = setInterval(() => {
        setBattery(b => {
          const newB = Math.min(100, b + 1);
          if (newB === 100) {
            handleChargeComplete();
          }
          return newB;
        });
      }, 1000); // 1% per second charge
    }
    return () => clearInterval(interval);
  }, [isPlaying, robotState]);

  // Telemetry Sync Loop
  useEffect(() => {
    const interval = setInterval(() => {
      const gSize = mapData?.gridSize || {x:120, y:100, f:1};
      let pos = { x: 0, y: 0 };
      if (robotPosRef.current) {
         const gridP = getGridPointFromVector3(robotPosRef.current, gSize);
         pos = { x: gridP.x, y: gridP.y };
      }
      window.dispatchEvent(new CustomEvent('local_telemetry_update', {
        detail: {
          battery: batteryRef.current,
          state: robotStateRef.current === 'off' || !isOnRef.current ? 'OFFLINE' : robotStateRef.current.replace('_', ' ').toUpperCase(),
          position: pos,
          temperature: 35 + (Math.random() * (isPlaying ? 10 : 2)),
          cpu: isPlaying ? 30 + Math.random() * 40 : 5 + Math.random() * 5,
          network: 85 + Math.random() * 15,
          speed: isPlaying ? 2.5 : 0
        }
      }));
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, mapData]);

  const prevIsIdleMode = useRef(isIdleMode);

  // Autonomous Repeating Patrol Loop Heartbeat
  useEffect(() => {
    let timeout: any;
    if (!isIdleMode && (robotState === 'idle' || robotState === 'patrol') && !isPlaying && isOn && patrolCountdown === null && path.length === 0) {
      timeout = setTimeout(() => {
        if (!mapData || !mapData.rooms) return;
        dispatchPatrolCheckpoint(patrolIndexRef.current);
      }, 500);
    }
    prevIsIdleMode.current = isIdleMode;
    return () => clearTimeout(timeout);
  }, [robotState, isPlaying, path, isOn, isIdleMode, patrolCountdown, mapData]);

  const initializeDynamicObstacles = (routePath?: GridPoint[]) => {
    if (!mapData || !mapData.roads || mapData.roads.length < 5) return;
    const roads = mapData.roads;
    const obs: DynamicObstacle[] = [];
    const allObstacles = [...(mapData.obstacles || []), ...userBlockers];

    // Determine the active road path for the robot
    let activeRoadPath: GridPoint[] = [];
    if (routePath && routePath.length >= 6) {
      activeRoadPath = routePath;
    } else if (path && path.length >= 6) {
      activeRoadPath = path;
    } else if (mapData.rooms && mapData.rooms.length > 0) {
      const rawLoc = robotPosRef.current ? getGridPointFromVector3(robotPosRef.current, mapData.gridSize) : mapData.start;
      const startLoc = getNearestRoadPoint(rawLoc, mapData);
      const targetRoom = mapData.rooms[0];
      const targetLoc = getNearestRoadPoint(targetRoom.door || targetRoom.start, mapData);
      activeRoadPath = calculatePath(startLoc, targetLoc, allObstacles, mapData, true);
    }

    // "Place moving obstacles directly on the road, within the robot’s driving path."
    if (activeRoadPath.length >= 6) {
      const M = activeRoadPath.length;
      // 1. Moving vehicle / car directly in driving path ahead
      const i1 = Math.max(2, Math.floor(M * 0.30));
      const path1 = activeRoadPath.slice(i1);
      if (path1.length >= 2) {
        obs.push({
          id: 'obs_road_0',
          type: 'car',
          pos: path1[0],
          targetPos: path1[path1.length - 1],
          path: path1,
          currentIndex: 0,
          speed: 2.6,
          isMoving: true,
          isRoadWalker: true,
        });
      }

      // 2. Moving pedestrian walking directly on the road in the driving path
      const i2 = Math.max(i1 + 3, Math.floor(M * 0.60));
      const path2 = activeRoadPath.slice(i2);
      if (path2.length >= 2) {
        obs.push({
          id: 'obs_road_1',
          type: 'person',
          pos: path2[0],
          targetPos: path2[path2.length - 1],
          path: path2,
          currentIndex: 0,
          speed: 1.35,
          isMoving: true,
          isRoadWalker: true,
        });
      }
    }

    // Populate remaining campus traffic entities for lively, realistic campus environment
    const TOTAL_TRAFFIC = 16;
    const startIndex = obs.length;
    const CAR_COUNT = 8;

    for (let i = startIndex; i < TOTAL_TRAFFIC; i++) {
      const isCar = i < CAR_COUNT;
      let p: GridPoint[] = [];
      for (let attempt = 0; attempt < 25; attempt++) {
        const start = roads[Math.floor(Math.random() * roads.length)];
        const end = roads[Math.floor(Math.random() * roads.length)];
        if (start.x === end.x && start.y === end.y) continue;

        // Ensure new spawn point is spaced at least 3.5m away from existing entities
        const [sx, , sz] = getGridPosition(start, mapData.gridSize, 0.05, isMapView);
        const tooClose = obs.some(o => {
          if (!o.path || o.path.length === 0) return false;
          const [ox, , oz] = getGridPosition(o.path[0], mapData.gridSize, 0.05, isMapView);
          return Math.hypot(sx - ox, sz - oz) < 3.5;
        });
        if (tooClose) continue;

        p = calculatePath(start, end, allObstacles, mapData, true);
        if (p.length >= 3) break;
      }

      if (p.length >= 2) {
        obs.push({
          id: `obs_${i}`,
          type: isCar ? 'car' : 'person',
          pos: p[0],
          targetPos: p[p.length - 1],
          path: p,
          currentIndex: 0,
          speed: isCar ? (2.5 + Math.random() * 0.8) : (1.25 + Math.random() * 0.4),
          isMoving: true,
          isRoadWalker: !isCar && (i % 3 !== 0),
        });
      }
    }

    setDynamicObstacles(obs);
    dynamicObstaclesRef.current = obs;
  };

  // Auto-initialize dynamic traffic when map is ready
  useEffect(() => {
    if (mapData && mapData.roads && mapData.roads.length > 5) {
      if (dynamicObstaclesRef.current.length === 0) {
        initializeDynamicObstacles();
      }
    }
  }, [mapData]);

  const addExplanation = (msg: string) => {
    setAiExplanations(prev => [msg, ...prev].slice(0, 5));
  };

  const resumeMissionTo = (currentLoc: GridPoint, targetLoc: GridPoint) => {
    if (!mapData) return;
    const allObstacles = [...(mapData.obstacles || []), ...userBlockers];
    
    let nextPath = calculatePath(currentLoc, targetLoc, allObstacles, mapData);
    if (nextPath.length === 0) {
      nextPath = calculateLongPath(currentLoc, targetLoc, allObstacles, mapData);
      if (nextPath.length > 0) {
        addExplanation(`Taking a detour to reach target.`);
      }
    }
    
    if (nextPath.length > 0) {
      setPath(nextPath);
      setActivePathColor('#00ffff');
      setCurrentPosIndex(0);
      setRobotState(prev => prev === 'mission' ? 'mission' : 'patrol');
      setIsPlaying(true);
    } else {
      setRobotState('idle');
      addExplanation(`Target unreachable. Standing by.`);
    }
  };


  const executeCommand = (cmd: string) => {
    const lowerMsg = cmd.toLowerCase();
    const isEmergency = lowerMsg.startsWith('emergency at ') || lowerMsg.startsWith('emergency in ');
    if (!isOn && !isEmergency) {
       setCtrMessages(prev => [...prev, {sender: 'user', text: cmd}, {sender: 'robot', text: 'Error: Robot is currently powered OFF. Only emergency overrides accepted.'}]);
       return;
    }
    
    const userMsg = cmd.trim();
    if (userMsg === 'clear') {
       setCtrMessages([{sender: 'robot', text: 'Console cleared.'}]);
       return;
    }
    setCtrMessages(prev => [...prev, {sender: 'user', text: userMsg}]);
    
    setTimeout(() => {
      let reply = "I am currently processing your request.";
      const lowerMsg = userMsg.toLowerCase();
      
      if (lowerMsg.startsWith('go to ') || lowerMsg.startsWith('come to ')) {
        if (robotState === 'emergency_response') {
          const roomName = lowerMsg.replace(/^(go to |come to )/, '').trim();
          const targetRoom = mapData?.rooms?.find(r => r.name.toLowerCase().includes(roomName));
          if (targetRoom) {
            reply = `Emergency side-task accepted. Proceeding to ${targetRoom.name} and will return here shortly.`;
            dispatchLocalMission(targetRoom.door || targetRoom.start, userMsg, true);
          } else {
            reply = `I could not find a location matching "${roomName}".`;
          }
        } else {
          reply = "Please use the 'User Command' panel to dispatch me to specific locations.";
        }
      } else if (lowerMsg.includes('where are you') || lowerMsg.includes('location') || lowerMsg.includes('where')) {
        const currentLoc = path.length > 0 && currentPosIndex < path.length ? path[currentPosIndex] : mapData?.start;
        if (currentLoc && mapData?.rooms) {
          let closest = mapData.rooms[0];
          let minD = Infinity;
          mapData.rooms.forEach(r => {
             const d = Math.abs(r.door.x - currentLoc.x) + Math.abs(r.door.y - currentLoc.y);
             if (d < minD) { minD = d; closest = r; }
          });
          reply = `I am currently located near the ${closest.name}.`;
        } else {
          reply = `I am at my starting coordinates.`;
        }
      } else if (lowerMsg.startsWith('emergency at ') || lowerMsg.startsWith('emergency in ')) {
        const roomName = lowerMsg.replace(/^(emergency at |emergency in )/, '').trim();
        const targetRoom = mapData?.rooms?.find(r => r.name.toLowerCase().includes(roomName));
        if (robotState === 'charging') {
          reply = `I am currently charging. Cannot respond to emergency.`;
        } else if (robotState === 'mission' || robotState === 'emergency_response') {
          reply = `I must complete my current task first before accepting new emergencies.`;
        } else if (targetRoom) {
          reply = `EMERGENCY ACCEPTED. Dispatched to ${targetRoom.name} immediately.`;
          handleEmergencyCall(targetRoom.door || targetRoom.start);
        } else {
          reply = `I could not find a building matching "${roomName}".`;
        }
      } else if (lowerMsg.includes('battery') || lowerMsg.includes('charge')) {
        reply = `My current battery level is at ${battery}%.`;
      } else if (lowerMsg.includes('what are you doing') || lowerMsg.includes('status') || lowerMsg.includes('state') || lowerMsg.includes('mission')) {
        if (robotState === 'patrol') reply = "I am currently on a routine patrol across the campus.";
        else if (robotState === 'mission') reply = "I am currently executing a designated mission task.";
        else if (robotState === 'emergency_response') reply = "I am responding to an emergency at a high priority!";
        else if (robotState === 'charging') reply = "I am currently recharging my battery at the Generator Room.";
        else reply = "I am currently idle and awaiting instructions.";
      } else if (lowerMsg.includes('medicine') || lowerMsg.includes('medical') || lowerMsg.includes('food') || lowerMsg.includes('deliver') || lowerMsg.includes('picked up')) {
        if (mapData?.tasks && mapData.tasks.length > 0) {
           reply = `Yes, I am currently handling a mission involving: ${mapData.tasks.map(t => t.locationName).join(', ')}.`;
        } else {
           reply = `I do not have any active delivery missions right now. I am in ${robotState} mode.`;
        }
      } else {
        if (robotState !== 'emergency_response') {
           reply = "excute command in the home screen to go to your decieded destination";
        } else {
           reply = `Processing mission: "${userMsg}"`;
           if (onDispatchMission) onDispatchMission(userMsg);
        }
      }
      
      setCtrMessages(prev => [...prev, {sender: 'robot', text: reply}]);
    }, 600);
  };

  const handleCTRSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ctrInput.trim()) return;
    executeCommand(ctrInput);
    setCtrInput('');
  };

  useEffect(() => {
    const handleRemoteConsole = (e: any) => {
       executeCommand(e.detail);
    };
    window.addEventListener('remote_console_command', handleRemoteConsole);
    return () => window.removeEventListener('remote_console_command', handleRemoteConsole);
  }, [robotState, isOn, path, currentPosIndex, mapData, battery, onDispatchMission]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('local_ctr_messages_update', { detail: ctrMessages }));
  }, [ctrMessages]);

  const resetSimulation = () => {
    if (!mapData) return;
    if (patrolTimerRef.current) {
      clearInterval(patrolTimerRef.current);
      patrolTimerRef.current = null;
    }
    setPatrolCountdown(null);

    // Preserve current location if robot is active
    const currentLoc = (path.length > 0 && currentPosIndex < path.length) ? path[currentPosIndex] : mapData.start;
    
    setCurrentPosIndex(0); 
    isRecalculating.current = false;
    
    // Only reset battery if it's the very first load or robot is off
    if (path.length === 0 || robotStateRef.current === 'off') {
      setBattery(100); 
    }
    
    // Check if we are doing a side-task during emergency response
    const isEmergencySideTask = robotStateRef.current === 'emergency_response' && mapData.tasks && mapData.tasks.length > 0;
    
    if (!isEmergencySideTask) {
       originalMissionRef.current = null;
    }
    
    currentTaskIndexRef.current = 0;
    
    const target = mapData.tasks?.[0]?.location || mapData.end;
    let initialPath: GridPoint[] = [];
    
    if (isEmergencySideTask) {
      const emergencyLoc = path.length > 0 ? path[path.length - 1] : mapData.start;
      emergencyLocationRef.current = emergencyLoc;
      const fPath = calculatePath(currentLoc, target, [...(mapData.obstacles || []), ...userBlockers], mapData);
      initialPath = fPath;
      setActivePathColor('#00ffff');
    } else {
      const fPath = calculatePath(currentLoc, target, [...(mapData.obstacles || []), ...userBlockers], mapData);
      let sPath = calculateLongPath(currentLoc, target, [...(mapData.obstacles || []), ...userBlockers], mapData);
      if (sPath.length === 0) sPath = calculatePath(currentLoc, target, [...(mapData.obstacles || []), ...userBlockers], mapData);
      
      if (selectedStrategyId === 'fastest') {
        initialPath = fPath;
        setActivePathColor('#ef4444');
      } else if (selectedStrategyId === 'standard') {
        initialPath = sPath;
        setActivePathColor('#3b82f6');
      } else {
        initialPath = fPath;
        setActivePathColor('#00ffff');
      }
    }
    
    if (initialPath.length > 0 && mapData.tasks && mapData.tasks.length > 0) {
      setPath(initialPath);
      addExplanation(`Planned route along drivable roads. Estimated distance: ${initialPath.length}m.`);
      
      const isBlocked = false;
      if (isBlocked && dynamicObstaclesRef.current.length > 0) {
         addExplanation("WARNING: Detected dynamic obstacles intersecting optimal path. Using AI dynamic rerouting.");
      }
      
      if (isEmergencySideTask) {
         setRobotState('emergency_to_ctr');
         if (emergencyTimeoutRef.current) {
           clearTimeout(emergencyTimeoutRef.current);
           emergencyTimeoutRef.current = null;
         }
         setIsPlaying(true);
      } else {
         setRobotState('mission');
         setIsPlaying(true);
      }
    } else {
      if (isOn) {
        dispatchPatrolCheckpoint(patrolIndexRef.current);
      } else {
        setPath([]);
        setRobotState(prev => prev === 'emergency_response' ? prev : 'idle');
      }
    }
    if (dynamicObstaclesRef.current.length === 0) {
      initializeDynamicObstacles(initialPath);
    }
  };

  const handleLowBattery = () => {
    if (!mapData || !mapData.rooms) return;
    isRecalculating.current = true;
    setIsPlaying(false);
    addExplanation('BATTERY CRITICAL: Diverting to charging station...');
    
    originalMissionRef.current = { path: [...path], index: currentPosIndex };
    const generatorRoom = mapData.rooms.find(r => r.name.toLowerCase().includes('generator')) || mapData.rooms[0];
    
    setTimeout(() => {
      const currentLoc = path[currentPosIndex] || mapData.start;
      const chargePath = calculatePath(currentLoc, generatorRoom.door || generatorRoom.start, [...(mapData.obstacles || []), ...userBlockers], mapData);
      setPath(chargePath);
      setCurrentPosIndex(0);
      setRobotState('returning_home');
      setIsOn(false);
      setIsPlaying(true);
      isRecalculating.current = false;
    }, 1500);
  };

  const handleChargeComplete = () => {
    if (!mapData) return;
    
    if (robotStateRef.current === 'off' || !isOn) {
      addExplanation(`Charge complete! Battery at 100%. Remaining in Power OFF mode.`);
      return;
    }

    addExplanation(`Charge complete! Resuming operations.`);
    const orig = originalMissionRef.current;
    
    setTimeout(() => {
      const currentLoc = path[path.length - 1] || mapData.start;
      if (orig && orig.path.length > 0) {
        const finalTarget = orig.path[orig.path.length - 1];
        resumeMissionTo(currentLoc, finalTarget);
      } else {
        setRobotState('idle');
      }
      originalMissionRef.current = null;
    }, 1500);
  };

  const handlePoliceReachDestination = useCallback((phase: string) => {
    if (phase === 'dispatching') {
       addExplanation('Police arrived! Escorting crowd out of the campus. Resuming robot operations...');
       
       setCrowds(prev => prev.filter(c => c.x !== policeStateRef.current.targetPos?.x || c.y !== policeStateRef.current.targetPos?.y));
       
       if (mapData && policeStateRef.current.targetPos) {
         let returnPath = calculatePath(policeStateRef.current.targetPos, mapData.start, [...(mapData.obstacles || []), ...userBlockers], mapData);
         if (returnPath.length === 0) returnPath = [policeStateRef.current.targetPos, mapData.start]; // Fallback to direct teleport/slide if blocked
         setPoliceState(prev => ({
           ...prev,
           path: returnPath,
           phase: 'escorting'
         }));
       }
       
       handleEmergencyComplete();
       
    } else if (phase === 'escorting') {
       setPoliceState({ active: false, path: [], targetPos: null, phase: 'idle' });
       addExplanation('Crowd successfully escorted out of the campus.');
    }
  }, [mapData, userBlockers]);

  const handleCrowdEmergency = (targetPos: GridPoint) => {
    if (!isOn) {
      addExplanation("Crowd detected while OFF! Emergency wake-up sequence initiated.");
      setIsOn(true);
      turnOffAfterEmergencyRef.current = true;
    } else {
      turnOffAfterEmergencyRef.current = false;
    }
    
    if (!mapData) return;
    addExplanation(`CROWD EMERGENCY: Diverting immediately to (${targetPos.x}, ${targetPos.y})! All other tasks suspended.`);
    setIsPlaying(false);
    isRecalculating.current = true;
    
    if (robotState === 'mission' || robotState === 'patrol' || robotState === 'emergency_response') {
      originalMissionRef.current = { path: [...path], index: currentPosIndex };
    }
    
    const currentLoc = path.length > 0 && currentPosIndex < path.length ? path[currentPosIndex] : mapData.start;
    const emergencyPath = calculatePath(currentLoc, targetPos, [...(mapData.obstacles || []), ...userBlockers], mapData);
    
    if (emergencyPath.length > 0) {
      setPath(emergencyPath);
      setActivePathColor('#ef4444');
      setCurrentPosIndex(0);
      setRobotState('crowd_control');
      setIsPlaying(true);
    } else {
      addExplanation(`Emergency route calculation failed. Unable to reach crowd.`);
      setIsPlaying(true);
    }
  };

  const handleEmergencyCall = (targetPos: GridPoint) => {
    if (!isOn) {
      addExplanation("Emergency override! Powering ON to respond to critical emergency.");
      setIsOn(true);
      turnOffAfterEmergencyRef.current = true;
    } else {
      turnOffAfterEmergencyRef.current = false;
    }
    
    if (!mapData) return;
    if (robotState === 'emergency_response' || robotState === 'charging' || robotState === 'emergency_to_ctr' || robotState === 'ctr_to_emergency') return;
    
    addExplanation(`EMERGENCY CALL: Diverting immediately to (${targetPos.x}, ${targetPos.y})!`);
    setIsPlaying(false);
    isRecalculating.current = true;
    
    if (robotState === 'patrol' || robotState === 'mission' || robotState === 'returning_home') {
      originalMissionRef.current = { path: [...path], index: currentPosIndex };
    }
    
    const currentLoc = path[currentPosIndex] || mapData.start;
    const emergencyPath = calculatePath(currentLoc, targetPos, [...(mapData.obstacles || []), ...userBlockers], mapData);
    
    if (emergencyPath.length > 0) {
      setPath(emergencyPath);
      setActivePathColor('#00ffff');
      setCurrentPosIndex(0);
      setRobotState('emergency_response');
      setIsPlaying(true);
    } else {
      addExplanation(`Emergency route calculation failed. Unable to reach target.`);
      setIsPlaying(true);
    }
    isRecalculating.current = false;
  };

  const handleEmergencyComplete = () => {
    if (!mapData) return;
    addExplanation(`Arrived at emergency location. Providing assistance for 5 seconds...`);
    setIsPlaying(false);
    
    if (emergencyTimeoutRef.current) {
      clearTimeout(emergencyTimeoutRef.current);
    }
    
    emergencyTimeoutRef.current = setTimeout(() => {
      // Dispatch local request to trigger the global confirmation modal for completion
      window.dispatchEvent(new CustomEvent('local_emergency_request', { detail: {x: 0, y: 0} }));
      emergencyTimeoutRef.current = null;
    }, 5000);
  };

  useEffect(() => {
    const handleRemoteApprove = () => {
      if (!mapData) return;
      if (turnOffAfterEmergencyRef.current) {
         addExplanation("Emergency override complete. Returning to Robot Home to power off.");
         turnOffAfterEmergencyRef.current = false;
         setIsOn(false);
         originalMissionRef.current = null;
         const homeRoom = mapData?.rooms?.find(r => r.name.toLowerCase().includes('generator')) || mapData?.rooms?.[0];
         if (homeRoom) {
           const currentLoc = path[path.length - 1] || mapData.start;
           const homePath = calculatePath(currentLoc, homeRoom.door || homeRoom.start, [...(mapData.obstacles || []), ...userBlockers], mapData);
           setPath(homePath);
           setCurrentPosIndex(0);
           setRobotState('returning_home');
           setIsPlaying(true);
         }
      } else {
         addExplanation(`Emergency resolved. Returning to patrol mode.`);
         const currentLoc = path[path.length - 1] || mapData.start;
         const randomRoom = mapData.rooms[Math.floor(Math.random() * mapData.rooms.length)];
         const patrolPath = calculatePath(currentLoc, randomRoom.door || randomRoom.start, [...(mapData.obstacles || []), ...userBlockers], mapData);
         if (patrolPath.length > 0) {
           setPath(patrolPath);
           setCurrentPosIndex(0);
           setRobotState('patrol');
           setIsPlaying(true);
         } else {
           setRobotState('idle'); 
         }
      }
      originalMissionRef.current = null;
    };

    const handleRemoteDeny = () => {
      addExplanation("Holding position at emergency location.");
    };

    window.addEventListener('remote_emergency_approve', handleRemoteApprove);
    window.addEventListener('remote_emergency_deny', handleRemoteDeny);

    return () => {
      window.removeEventListener('remote_emergency_approve', handleRemoteApprove);
      window.removeEventListener('remote_emergency_deny', handleRemoteDeny);
    };
  }, [mapData, isOn, robotState, path, currentPosIndex]);

  const handleObstacleDetected = (obsPos: GridPoint) => {
    if (isRecalculating.current) return;
    isRecalculating.current = true;
    
    if (!mapData) {
       isRecalculating.current = false;
       return;
    }
    const currentLoc = (robotPosRef.current && mapData)
      ? getGridPointFromVector3(robotPosRef.current, mapData.gridSize)
      : (path[currentPosIndex] || mapData.start);
    const targetLoc = path.length > 0 ? path[path.length - 1] : (mapData.rooms?.[0]?.door || mapData.start);
    
    if (currentLoc.x === targetLoc.x && currentLoc.y === targetLoc.y) {
       isRecalculating.current = false;
       return;
    }

    addExplanation(`🧠 AI DIVERSION: Obstacle spotted at (${obsPos.x}, ${obsPos.y}). Deciding quick diversion route...`);

    // Treat obstacle position as impassable for diversion search
    const allObstacles = [...(mapData.obstacles || []), ...userBlockers, obsPos];
    
    let intermediateTarget = null;
    for (let i = currentPosIndex; i < path.length - 1; i++) {
      if (path[i].x === path[i+1].x && path[i].y === path[i+1].y && path[i].f === path[i+1].f) {
        intermediateTarget = path[i];
        break;
      }
    }
    
    const isCity = !!(mapData.roads && mapData.roads.length > 0);

    let newPath: GridPoint[] = [];
    if (intermediateTarget && (intermediateTarget.x !== targetLoc.x || intermediateTarget.y !== targetLoc.y)) {
      const fPath = calculatePath(currentLoc, intermediateTarget, allObstacles, mapData, isCity);
      const rPath = calculatePath(intermediateTarget, targetLoc, allObstacles, mapData, isCity);
      if (fPath.length > 0 && rPath.length > 0) {
        newPath = [...fPath, fPath[fPath.length - 1], ...rPath.slice(1)];
      }
    } else {
      newPath = calculatePath(currentLoc, targetLoc, allObstacles, mapData, isCity);
    }
    
    if (newPath.length === 0 && isCity) {
      if (intermediateTarget && (intermediateTarget.x !== targetLoc.x || intermediateTarget.y !== targetLoc.y)) {
         const fPath = calculateLongPath(currentLoc, intermediateTarget, allObstacles, mapData);
         const rPath = calculateLongPath(intermediateTarget, targetLoc, allObstacles, mapData);
         if (fPath.length > 0 && rPath.length > 0) {
           newPath = [...fPath, fPath[fPath.length - 1], ...rPath.slice(1)];
         }
      } else {
         newPath = calculateLongPath(currentLoc, targetLoc, allObstacles, mapData);
      }
    }
    
    if (newPath.length > 0) {
      setPath(newPath);
      // Point immediately to next node (index 1) so robot steers into diversion without hesitation
      setCurrentPosIndex(newPath.length > 1 ? 1 : 0);
      setActivePathColor('#38bdf8');
      setIsPlaying(true);
      addExplanation(`⚡ Safe orange diversion active (${newPath.length}m). Navigating along open road.`);
      setTimeout(() => {
        isRecalculating.current = false;
      }, 1500);
    } else {
      // If road is a straight segment without alternative intersection, agile lateral bypass handles clearance smoothly
      setTimeout(() => {
        isRecalculating.current = false;
      }, 1500);
    }
  };

  const handleBarricadeBlocked = (robotWorldPos: THREE.Vector3, _barricadeWorldPos: THREE.Vector3) => {
    if (!mapData) return;

    // 1. Current physical robot location snapped onto the drivable road network
    const rawLoc = getGridPointFromVector3(robotWorldPos, mapData.gridSize);
    const currentLoc = getNearestRoadPoint(rawLoc, mapData);

    // 2. Identify active target destination (MUST remain the exact same destination)
    let targetLoc: GridPoint;
    if (path.length > 0) {
      targetLoc = getNearestRoadPoint(path[path.length - 1], mapData);
    } else if (robotState === 'patrol') {
      const lower = currentPatrolTarget.toLowerCase();
      const targetRoom = 
        mapData.rooms?.find(r => r.name.toLowerCase() === lower) ||
        mapData.rooms?.find(r => r.name.toLowerCase().includes(lower)) ||
        mapData.rooms?.[0];
      const rawTarget = targetRoom ? (targetRoom.door || targetRoom.start) : mapData.start;
      targetLoc = getNearestRoadPoint(rawTarget, mapData);
    } else if (emergencyLocationRef.current) {
      targetLoc = getNearestRoadPoint(emergencyLocationRef.current, mapData);
    } else {
      targetLoc = mapData.start;
    }

    // 3. Obstacle set including all user road barricades
    const allObstacles = [...(mapData.obstacles || []), ...userBlockers];

    // 4. Calculate valid alternative road-only route to the SAME destination using 3D A* with requireRoads: true
    let altPath = calculatePath(currentLoc, targetLoc, allObstacles, mapData, true);

    // 5. If targetLoc itself was directly blocked by a barricade clicked on it, test adjacent road cells to the same destination
    if (altPath.length < 2) {
      const candidateTargets = [
        { x: targetLoc.x + 1, y: targetLoc.y, f: targetLoc.f },
        { x: targetLoc.x - 1, y: targetLoc.y, f: targetLoc.f },
        { x: targetLoc.x, y: targetLoc.y + 1, f: targetLoc.f },
        { x: targetLoc.x, y: targetLoc.y - 1, f: targetLoc.f },
      ].filter(p => isPointOnDrivableRoad(p.x, p.y, mapData, 0.1) && !allObstacles.some(o => o.x === p.x && o.y === p.y && o.f === p.f));
      for (const cand of candidateTargets) {
        altPath = calculatePath(currentLoc, cand, allObstacles, mapData, true);
        if (altPath.length >= 2) break;
      }
    }

    if (altPath.length >= 2) {
      // Clear any temporary diversion line
      if (diversionRouteRef) {
        diversionRouteRef.current = [];
      }
      setPath(altPath);
      setCurrentPosIndex(0);
      setIsPlaying(true);
      addExplanation(`✨ Alternate road route active (${altPath.length} nodes). Navigating to destination via open roads.`);
    } else {
      addExplanation(`⚠️ Road closed in all directions by barricades. Robot holding safe viewing standoff.`);
    }
  };


  const startSimulation = () => { 
    if (mapData && path.length > 0) {
      setRobotState(prev => {
         if (prev === 'emergency_response') return prev;
         return (prev === 'idle') ? 'patrol' : prev; // default to patrol instead of mission
      });
      
      // Hide the popup if we are starting a movement during an emergency
      setRobotState(prev => {
         if (prev === 'emergency_response') {
           window.dispatchEvent(new CustomEvent('local_emergency_request', { detail: null }));
         }
         return prev;
      });
      
      setIsPlaying(true);
      addExplanation('Executing mission. Moving along planned road route.');
    }
  };

  useEffect(() => {
    startSimulationRef.current = startSimulation;
  });

  const handleReachNode = (newIndex: number) => {
    setCurrentPosIndex(newIndex);
  };

  const handleMissionComplete = () => {
    if (robotState === 'charging') {
      handleChargeComplete();
    } else if (robotState === 'emergency_response') {
      handleEmergencyComplete();
    } else if (robotState === 'emergency_to_ctr') {
       if (emergencyLocationRef.current && mapData) {
          addExplanation(`Mission target reached. Waiting 2.5 seconds before returning to emergency location...`);
          setIsPlaying(false);
          const currentLoc = path[path.length - 1] || mapData.start;
          const cToEPath = calculatePath(currentLoc, emergencyLocationRef.current, [...(mapData.obstacles || []), ...userBlockers], mapData);
          
          setTimeout(() => {
            if (cToEPath.length > 0) {
               setPath(cToEPath);
               setCurrentPosIndex(0);
               setRobotState('ctr_to_emergency');
               setIsPlaying(true);
            } else {
               handleEmergencyComplete();
            }
          }, 2500);
       } else {
          handleEmergencyComplete();
       }
    } else if (robotState === 'ctr_to_emergency') {
       handleEmergencyComplete();
    } else if (robotState === 'crowd_control') {
      setIsPlaying(false);
      setRobotState('waiting_for_police');
      addExplanation('Robot reached crowd. Maintaining perimeter and dispatching police...');
      
      const currentLoc = path[path.length - 1] || mapData?.start;
      if (currentLoc && mapData) {
        const pPath = calculatePath(mapData.start, currentLoc, [...(mapData.obstacles || []), ...userBlockers], mapData);
        setPoliceState({
          active: true,
          path: pPath,
          targetPos: currentLoc,
          phase: 'dispatching'
        });
      }
    } else if (robotState === 'returning_home') {
      setIsPlaying(false);
      setRobotState('off');
      addExplanation('Robot safely arrived at Robot Home. Power OFF and charging.');
    } else if (robotState === 'evading_obstacle') {
      addExplanation('Evaded obstacle. Retrying route to target...');
      const orig = originalMissionRef.current;
      if (orig && orig.path.length > 0) {
        const target = orig.path[orig.path.length - 1];
        const currentLoc = path[path.length - 1] || mapData!.start;
        resumeMissionTo(currentLoc, target);
      } else {
        setRobotState('idle');
      }
      originalMissionRef.current = null;
    } else {
      if (mapData && mapData.tasks && currentTaskIndexRef.current < mapData.tasks.length - 1) {
        currentTaskIndexRef.current += 1;
        const nextTask = mapData.tasks[currentTaskIndexRef.current];
        
        setIsPlaying(false);
        addExplanation('📍 Waypoint reached. Pausing exactly 5.0 seconds for inspection before proceeding.');

        if (patrolTimerRef.current) {
          clearInterval(patrolTimerRef.current);
          patrolTimerRef.current = null;
        }

        setPatrolCountdown(5.0);
        const pauseStartTime = Date.now();
        const PAUSE_DURATION_MS = 5000;

        patrolTimerRef.current = setInterval(() => {
          const elapsedMs = Date.now() - pauseStartTime;
          const remainingSec = Math.max(0, (PAUSE_DURATION_MS - elapsedMs) / 1000);
          setPatrolCountdown(remainingSec);

          if (elapsedMs >= PAUSE_DURATION_MS) {
            clearInterval(patrolTimerRef.current);
            patrolTimerRef.current = null;
            setPatrolCountdown(null);

            const rawLoc = (robotPosRef.current && mapData)
              ? getGridPointFromVector3(robotPosRef.current, mapData.gridSize)
              : (path.length > 0 ? path[path.length - 1] : mapData.start);
            const currentLoc = getNearestRoadPoint(rawLoc, mapData);
            const targetLoc = getNearestRoadPoint(nextTask.location, mapData);
            const nextPath = calculatePath(currentLoc, targetLoc, [...(mapData.obstacles || []), ...userBlockers], mapData, true);
            if (nextPath.length > 0) {
              setPath(nextPath);
              setCurrentPosIndex(0);
              setRobotState(prev => prev === 'mission' ? 'mission' : 'patrol');
              setIsPlaying(true);
              addExplanation('🚀 Resuming navigation along designated route.');
            } else {
              addExplanation('Route calculation failed: path obstructed.');
              setRobotState('idle');
            }
          }
        }, 100);
      } else {
        // Continuous Repeating Patrol Loop: Pause exactly 5.0 seconds at destination, then smoothly advance
        setIsPlaying(false);
        addExplanation('📍 Waypoint arrived. Mandatory 5.0-second inspection pause initiated.');

        if (patrolTimerRef.current) {
          clearInterval(patrolTimerRef.current);
          patrolTimerRef.current = null;
        }

        setPatrolCountdown(5.0);
        const pauseStartTime = Date.now();
        const PAUSE_DURATION_MS = 5000; // Exactly 5.0 seconds

        patrolTimerRef.current = setInterval(() => {
          const elapsedMs = Date.now() - pauseStartTime;
          const remainingSec = Math.max(0, (PAUSE_DURATION_MS - elapsedMs) / 1000);
          setPatrolCountdown(remainingSec);

          if (elapsedMs >= PAUSE_DURATION_MS) {
            clearInterval(patrolTimerRef.current);
            patrolTimerRef.current = null;
            setPatrolCountdown(null);

            if (isIdleMode) {
              setRobotState('idle');
              addExplanation('Idle mode active. Holding position.');
            } else {
              // Advance smoothly to next checkpoint in repeating loop
              const nextIdx = (patrolIndexRef.current + 1) % PATROL_CHECKPOINTS.length;
              addExplanation('⏱️ 5.0s pause complete. Smoothly continuing autonomous patrol along route.');
              dispatchPatrolCheckpoint(nextIdx);
            }
          }
        }, 100);
      }
    }
  };

  const dispatchLocalMission = (targetPos: GridPoint, missionText: string, isEmergencyOverride: boolean = false) => {
    if (!isOn) {
      addExplanation("Cannot dispatch mission: Robot is powered OFF.");
      return;
    }
    if (robotState === 'charging' && battery < 100) {
      addExplanation("Cannot dispatch mission: Robot is currently charging and must reach 100%.");
      return;
    }
    if (!isEmergencyOverride && (robotState === 'mission' || robotState === 'emergency_response' || robotState === 'emergency_to_ctr' || robotState === 'ctr_to_emergency')) {
      addExplanation("Cannot dispatch: Robot must complete its current active task first.");
      return;
    }
    if (!mapData) return;
    currentTaskIndexRef.current = mapData.tasks ? mapData.tasks.length : 0;
    setIsPlaying(false);
    isRecalculating.current = true;
    addExplanation(`New command: ${missionText}. Calculating route...`);
    
    setTimeout(() => {
      const currentLoc = path.length > 0 && currentPosIndex < path.length ? path[currentPosIndex] : mapData.start;
      
      if (robotStateRef.current === 'emergency_response' || robotStateRef.current === 'emergency_to_ctr' || robotStateRef.current === 'ctr_to_emergency') {
         if (robotStateRef.current === 'emergency_response') {
           emergencyLocationRef.current = currentLoc;
         }
         const forwardPath = calculatePath(currentLoc, targetPos, [...(mapData.obstacles || []), ...userBlockers], mapData);
         
         if (forwardPath.length > 0) {
           setPath(forwardPath);
           setCurrentPosIndex(0);
           setRobotState('emergency_to_ctr');
           setIsPlaying(true);
           if (emergencyTimeoutRef.current) {
             clearTimeout(emergencyTimeoutRef.current);
             emergencyTimeoutRef.current = null;
           }
           window.dispatchEvent(new CustomEvent('local_emergency_request', { detail: null }));
         } else {
           addExplanation(`Unable to calculate route to target.`);
         }
      } else {
         const shortPath = calculatePath(currentLoc, targetPos, [...(mapData.obstacles || []), ...userBlockers], mapData);
         
         if (shortPath.length > 0) {
           setPath(shortPath);
           setCurrentPosIndex(0);
           setRobotState('mission');
           setIsPlaying(true);
         } else {
           addExplanation(`Unable to calculate route to target.`);
         }
      }
      isRecalculating.current = false;
    }, 500);
  };

  const dispatchQuickMission = (type: string) => {
    if (!selectedRoom) return;
    dispatchLocalMission(selectedRoom.door || selectedRoom.start, `${type} to ${selectedRoom.name}`);
  };

  if (!mapData) return null;
  const { gridSize, rooms } = mapData;

  return (
    <div 
      ref={containerRef} 
      className={`flex bg-[#050505] overflow-hidden transition-all duration-300 ${
        isFullscreen 
          ? 'fixed inset-0 z-[100] w-screen h-screen rounded-none' 
          : 'w-full h-full relative rounded-2xl'
      }`}
    >
      {/* Mobile Control Panel (visible only on mobile) */}
      <div className="absolute inset-0 z-[110] flex flex-col justify-end md:hidden text-white pointer-events-none">
        {/* Power Controls */}
        <div className="flex gap-4 mb-8 shrink-0 px-4 pointer-events-auto">
          <button 
            onClick={() => togglePowerBroadcast(true)}
            className={`flex-1 p-4 rounded-xl font-bold flex flex-col items-center justify-center gap-2 border transition-all shadow-xl backdrop-blur-md ${isOn ? 'bg-green-500/30 text-green-400 border-green-500/50 shadow-[0_0_20px_rgba(34,197,94,0.4)]' : 'bg-black/60 text-gray-400 border-white/20 hover:bg-white/10'}`}
          >
            <Power className="w-8 h-8" /> POWER ON
          </button>
          <button 
            onClick={() => togglePowerBroadcast(false)}
            className={`flex-1 p-4 rounded-xl font-bold flex flex-col items-center justify-center gap-2 border transition-all shadow-xl backdrop-blur-md ${!isOn ? 'bg-red-500/30 text-red-400 border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 'bg-black/60 text-gray-400 border-white/20 hover:bg-white/10'}`}
          >
            <Power className="w-8 h-8" /> POWER OFF
          </button>
        </div>
      </div>

      <div className="absolute md:relative inset-0 opacity-0 md:opacity-100 pointer-events-none md:pointer-events-auto z-0 flex-1 w-full h-full">
        {/* Top Left Options */}
        <div className="absolute top-4 left-4 z-10 hidden md:flex flex-col gap-2">
          {/* Main Options Row */}
          <div className="flex gap-2">
            <button
              onClick={() => setIsMapView(!isMapView)}
              className="px-3 py-1.5 rounded-md text-xs font-bold bg-brand text-white shadow-lg hover:bg-blue-600 transition-colors"
            >
              Toggle View ({isMapView ? '2D' : '3D'})
            </button>

            <button
              onClick={() => setIsFollowing(!isFollowing)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold shadow-lg transition-colors ${isFollowing ? 'bg-green-600 text-white' : 'bg-surface text-text border border-border'}`}
            >
              Follow Robot
            </button>
            <button
              onClick={() => setTriggerReset(true)}
              className="px-3 py-1.5 rounded-md text-xs font-bold bg-surface text-text border border-border shadow-lg transition-colors hover:bg-gray-700 hover:text-white"
            >
              Recentre View
            </button>
            <button
              onClick={() => setIsCTROpen(!isCTROpen)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold shadow-lg transition-colors ${isCTROpen ? 'bg-brand text-white' : 'bg-surface text-text border border-border hover:bg-gray-700 hover:text-white'}`}
            >
              CTR (Connect to Robot)
            </button>

            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 rounded-md bg-white/10 text-white shadow-lg backdrop-blur-md hover:bg-white/20 transition-colors border border-white/10 flex items-center justify-center"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          </div>
          
          {/* Reasoning Log Option */}
          <div className="relative self-start">
            <button
              onClick={() => setShowReasoningLog(!showReasoningLog)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold shadow-lg transition-colors flex items-center gap-1.5 ${showReasoningLog ? 'bg-cyan-600 text-white' : 'bg-surface text-text border border-border hover:bg-gray-700'}`}
            >
              <ShieldAlert className={`w-3.5 h-3.5 ${showReasoningLog ? 'text-white' : 'text-cyan-500'}`} /> 
              Reasoning Log
            </button>
            
            {/* Reasoning Log Panel overlay */}
            {showReasoningLog && (
              <div className="absolute top-full left-0 mt-2 w-64 bg-surface/95 backdrop-blur-md border border-border rounded-lg shadow-xl p-3 z-50">
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {aiExplanations.map((exp, i) => (
                    <div key={i} className={`text-[10px] leading-relaxed p-2.5 rounded-md border ${i === 0 ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-100' : 'bg-white/5 border-white/10 text-gray-400'}`}>
                      {exp}
                    </div>
                  ))}
                  {aiExplanations.length === 0 && (
                    <div className="text-[10px] text-gray-500 text-center italic py-2">No AI activity recorded.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <Canvas shadows gl={{ antialias: true }} dpr={[1, 2]}>
          {/* Sky background from real time */}
          <color attach="background" args={['#000000']} />
          {/* Camera — adjusted for a clean, isometric-like default view */}
          {isMapView ? (
            <OrthographicCamera makeDefault position={[0, 100, 0]} zoom={4} near={0.1} far={2000} />
          ) : (
            <PerspectiveCamera makeDefault position={[gridSize.x * 0.7, gridSize.y * 0.7, gridSize.y * 0.9]} fov={50} near={0.5} far={2000} />
          )}
          {/* Lighting — adapts to day/night from real local time */}
          <ambientLight intensity={isNight ? 0.12 : 0.7} color={isNight ? '#c7d2fe' : '#ffffff'} />
          <directionalLight
            position={isNight ? [-30, 40, -30] : [30, 50, 30]}
            intensity={isNight ? 0.25 : 2.0}
            color={isNight ? '#9ca3c8' : '#fff5d0'}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-near={0.5}
            shadow-camera-far={200}
            shadow-camera-left={-80}
            shadow-camera-right={80}
            shadow-camera-top={80}
            shadow-camera-bottom={-80}
          />
          {/* Moon glow at night */}
          {isNight && <pointLight position={[-20, 25, -15]} intensity={0.6} color="#bfdbfe" />}
          {/* Day fill light */}
          {!isNight && <pointLight position={[0, 8, 0]} intensity={0.6} color="#60a5fa" />}
          <CameraController 
            isFollowing={isFollowing} 
            robotPosRef={robotPosRef} 
            robotRotRef={robotRotRef} 
            controlsRef={controlsRef} 
            triggerReset={triggerReset}
            onResetDone={() => setTriggerReset(false)}
            gridSize={gridSize}
            isMapView={isMapView}
          />
          <OrbitControls
            ref={controlsRef}
            enabled={!isFollowing}
            enableDamping
            enablePan={false}
            dampingFactor={0.08}
            target={[0, 0, 0]}
            maxPolarAngle={Math.PI / 2.1}
            minDistance={10}
            maxDistance={gridSize.y * 1.5}
          />
          
          <EnvironmentMap 
            mapData={mapData}
            isNight={isNight}
            isTargeting={isEmergencyTargeting || isPlacingBlocker || isPlacingCrowd} 
            onMapClick={(p) => {
              const gridP = getGridPointFromVector3(p, gridSize);
              if (isPlacingCrowd) {
                setCrowds(prev => [...prev, gridP]);
                handleCrowdEmergency(gridP);
                setIsPlacingCrowd(false);
                return;
              }
              if (isPlacingBlocker) {
                setUserBlockers(prev => {
                  const roads = mapData?.roads || [];
                  const exists = prev.find(b => b.x === gridP.x && b.y === gridP.y && b.f === gridP.f);
                  
                  let toBlock: GridPoint[] = [gridP];
                  if (roads.some(r => r.x === gridP.x && r.y === gridP.y)) {
                    const hasEW = roads.some(r => r.y === gridP.y && (r.x === gridP.x + 1 || r.x === gridP.x - 1));
                    const hasNS = roads.some(r => r.x === gridP.x && (r.y === gridP.y + 1 || r.y === gridP.y - 1));
                    
                    if (hasEW && !hasNS) {
                      let dy = 1;
                      while (roads.some(r => r.x === gridP.x && r.y === gridP.y + dy)) {
                        toBlock.push({ ...gridP, y: gridP.y + dy });
                        dy++;
                      }
                      dy = -1;
                      while (roads.some(r => r.x === gridP.x && r.y === gridP.y + dy)) {
                        toBlock.push({ ...gridP, y: gridP.y + dy });
                        dy--;
                      }
                    } else if (hasNS && !hasEW) {
                      let dx = 1;
                      while (roads.some(r => r.y === gridP.y && r.x === gridP.x + dx)) {
                        toBlock.push({ ...gridP, x: gridP.x + dx });
                        dx++;
                      }
                      dx = -1;
                      while (roads.some(r => r.y === gridP.y && r.x === gridP.x + dx)) {
                        toBlock.push({ ...gridP, x: gridP.x + dx });
                        dx--;
                      }
                    }
                  }

                  if (exists) {
                    return prev.filter(b => !toBlock.some(cs => cs.x === b.x && cs.y === b.y && cs.f === b.f));
                  } else {
                    const newBlockers = [...prev];
                    toBlock.forEach(cs => {
                       if (!newBlockers.some(b => b.x === cs.x && b.y === cs.y && b.f === cs.f)) {
                          newBlockers.push(cs);
                       }
                    });
                    return newBlockers;
                  }
                });
                return;
              }
              setIsEmergencyTargeting(false);
              document.body.style.cursor = 'auto';
              handleEmergencyCall(gridP);
            }} 
          />
          <RoomsRender rooms={rooms} gridSize={gridSize} onSelectRoom={setSelectedRoom} />
          <RoadsRender roads={mapData.roads || []} gridSize={gridSize} />
          <BlockersRender blockers={userBlockers} gridSize={gridSize} roads={mapData.roads || []} />
          <CrowdsRender crowds={crowds} gridSize={gridSize} />
          <PoliceVehicle policeState={policeState} policeStateRef={policeStateRef} gridSize={gridSize} isMapView={isMapView} onReachDestination={handlePoliceReachDestination} />

          {/* Starting Gate */}
          {mapData.start && (
             <SciFiGate position={getGridPosition({ x: 62, y: 86, f: 0 }, gridSize, 0)} scale={3} />
          )}

          {/* Continuous Clear Drivable Blue Route Line & Temporary Orange Diversion Line */}
          <DrivablePathLine 
            drivableRouteRef={drivableRouteRef} 
            diversionRouteRef={diversionRouteRef}
            drivableRouteColorsRef={drivableRouteColorsRef}
            path={path} 
            gridSize={gridSize} 
            isMapView={isMapView} 
            color={activePathColor} 
            lineWidth={8.0} 
            opacity={1.0} 
          />
          
          {dynamicObstacles.map((obs, idx) => (
            <MovingEntity 
              key={obs.id || idx} 
              obstacle={obs} 
              gridSize={gridSize} 
              isMapView={isMapView} 
              robotPosRef={robotPosRef}
              allObstaclesRef={dynamicObstaclesRef}
              mapData={mapData}
              userBlockers={userBlockers}
            />
          ))}

          {mapData && mapData.start && (
            <Robot 
              path={path.length > 0 ? path : [robotPosRef.current ? getGridPointFromVector3(robotPosRef.current, gridSize) : mapData.start]} 
              currentIndex={path.length > 0 ? currentPosIndex : 0} 
              isPlaying={isPlaying} 
              gridSize={gridSize} 
              isMapView={isMapView} 
              speed={(robotState === 'emergency_response' ? 25 : 10) * (speedLimit / 50)} 
              dynamicObstaclesRef={dynamicObstaclesRef}
              staticObstacles={userBlockers}
              drivableRouteRef={drivableRouteRef}
              diversionRouteRef={diversionRouteRef}
              drivableRouteColorsRef={drivableRouteColorsRef}
              upcomingLoopPoints3D={robotState === 'patrol' ? upcomingPatrolPoints3D : []}
              onReachNode={handleReachNode}
              onMissionComplete={handleMissionComplete}
              onObstacleDetected={handleObstacleDetected}
              onBarricadeBlocked={handleBarricadeBlocked}
              robotPosRef={robotPosRef}
              robotRotRef={robotRotRef}
              isEmergency={robotState === 'emergency_response' || robotState === 'emergency_to_ctr' || robotState === 'ctr_to_emergency'}
              addExplanation={addExplanation}
              mapData={mapData}
            />
          )}
        </Canvas>
      </div>

      {/* CTR Overlay */}
      {isCTROpen && (
        <div className="absolute top-16 left-4 w-80 bg-black/80 backdrop-blur-xl border border-white/20 rounded-2xl hidden md:flex flex-col z-[100] overflow-hidden shadow-2xl h-[400px]">
          <div className="p-3 border-b border-white/10 bg-brand/20 flex justify-between items-center">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <Bot className="w-4 h-4 text-brand" />
              Connect to Robot (CTR)
            </h3>
            <button onClick={() => setIsCTROpen(false)} className="text-gray-400 hover:text-white">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {ctrMessages.map((m, i) => (
              <div key={i} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-xl p-3 text-sm ${
                  m.sender === 'user' 
                    ? 'bg-brand/20 text-brand-light border border-brand/30' 
                    : 'bg-white/5 text-gray-200 border border-white/10'
                }`}>
                  {m.text}
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-white/10">
            <div className="flex gap-2">
              <input 
                type="text" 
                value={ctrInput}
                onChange={e => setCtrInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCTRSubmit(e as any); } }}
                placeholder="Type a command..."
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50"
              />
              <button 
                onClick={handleCTRSubmit as any}
                className="bg-brand/20 text-brand border border-brand/30 rounded-lg px-4 py-2 hover:bg-brand/30 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ── Control Panel (Floating Overlay) ── */}
      <div className={`absolute right-4 top-4 bottom-4 bg-black/70 backdrop-blur-xl border border-white/10 rounded-2xl hidden md:flex flex-col z-[100] shadow-2xl text-gray-200 pointer-events-auto transition-all duration-300 ${isCCMinimized ? 'w-14 overflow-hidden' : 'w-[360px] overflow-hidden'}`}>
        <div className="p-4 border-b border-white/10 bg-black/40 flex-none flex justify-between items-center">
          {!isCCMinimized && (
            <h3 className="font-bold text-sm flex items-center gap-2 text-white">
              <Activity className="w-4 h-4 text-brand" />
              Control Center
            </h3>
          )}
          <div className={`flex gap-2 ${isCCMinimized ? 'w-full justify-center' : ''}`}>
            {!isCCMinimized && (
              <button 
                onClick={() => setIsCTROpen(!isCTROpen)}
                className="p-1.5 rounded-md bg-white/5 hover:bg-brand/20 border border-white/10 text-brand-light transition-colors"
                title="Open Console"
              >
                <Bot className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setIsCCMinimized(!isCCMinimized)}
              className="p-1.5 rounded-md bg-white/5 hover:bg-white/20 border border-white/10 text-gray-300 transition-colors"
              title={isCCMinimized ? 'Expand Control Center' : 'Minimize Control Center'}
            >
              {isCCMinimized ? <Maximize className="w-4 h-4" /> : <Minimize className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Body — hidden when minimized */}
        {!isCCMinimized && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-white/10 bg-black/60 shrink-0">
            <button onClick={() => setActiveCCTab('dashboard')} className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-colors ${activeCCTab === 'dashboard' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-white/5' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}>Dashboard</button>
            <button onClick={() => setActiveCCTab('tools')} className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-colors ${activeCCTab === 'tools' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-white/5' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}>Tools</button>
            <button onClick={() => setActiveCCTab('locations')} className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-colors ${activeCCTab === 'locations' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-white/5' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}>Locations</button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar relative">
            {/* DASHBOARD TAB */}
            {activeCCTab === 'dashboard' && (
              <div className="p-4 space-y-6 animate-in fade-in duration-300">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Mission Telemetry</h4>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const nextIdle = !isIdleMode;
                        setIsIdleMode(nextIdle);
                        if (nextIdle) {
                          if (mapData && mapData.rooms && mapData.rooms.length > 0) {
                            let nearestRoom = mapData.rooms[0];
                            let minDist = Infinity;
                            const currentLoc = path.length > 0 && currentPosIndex < path.length ? path[currentPosIndex] : mapData.start;
                            mapData.rooms.forEach(r => {
                                const dist = Math.abs(r.door.x - currentLoc.x) + Math.abs(r.door.y - currentLoc.y);
                                if (dist < minDist) { minDist = dist; nearestRoom = r; }
                            });
                            const allObstacles = [...(mapData.obstacles || []), ...userBlockers];
                            const parkPath = calculatePath(currentLoc, nearestRoom.door || nearestRoom.start, allObstacles, mapData);
                            if (parkPath.length > 0) {
                               setPath(parkPath);
                               setCurrentPosIndex(0);
                               setIsPlaying(true);
                               setRobotState('idle'); 
                               addExplanation(`Idle mode activated. Parking safely at ${nearestRoom.name}.`);
                            } else {
                               setIsPlaying(false);
                               setRobotState('idle');
                               addExplanation("Idle mode activated. Halting immediately.");
                            }
                          }
                        } else {
                          setRobotState('patrol');
                          addExplanation("Idle mode deactivated. Resuming patrol.");
                        }
                      }}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-colors border ${isIdleMode ? 'bg-gray-500/20 text-white border-gray-500/50' : 'bg-transparent text-gray-500 border-white/10 hover:bg-white/5'}`}
                      title="Toggle Idle Mode"
                    >
                      <Pause className="w-3.5 h-3.5" /> IDLE
                    </button>
                    <button 
                      onClick={togglePower}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors border ${isOn ? 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20' : 'bg-green-500/10 text-green-400 border-green-500/30 hover:bg-green-500/20'}`}
                    >
                      {isOn ? 'POWER OFF' : 'POWER ON'}
                    </button>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3 transition-all duration-500">
                  <div className="bg-white/5 border border-white/10 rounded-xl p-3 shadow-inner">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1">BATTERY</span>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div className={`h-full ${battery > 60 ? 'bg-green-500' : battery > 30 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${battery}%` }} />
                      </div>
                      <span className="text-xs font-black text-white">{battery}%</span>
                    </div>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-3 shadow-inner flex flex-col justify-center">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1">STATUS</span>
                    <span className={`text-sm font-black uppercase tracking-wider truncate ${
                      patrolCountdown !== null ? 'text-emerald-400 animate-pulse' :
                      robotState === 'charging' ? 'text-yellow-400' : 
                      robotState === 'patrol' ? 'text-blue-400' : 
                      robotState === 'mission' ? 'text-green-400' : 
                      robotState === 'emergency_response' ? 'text-red-500 animate-pulse' : 
                      'text-gray-300'
                    }`}>
                      {patrolCountdown !== null ? `PAUSE (${patrolCountdown.toFixed(1)}s)` : robotState.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-3 shadow-inner">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1">DISTANCE</span>
                    <span className="text-lg font-black text-white">{path.length > 0 ? path.length - currentPosIndex : '--'} <span className="text-[10px] font-bold text-gray-500">m</span></span>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-3 shadow-inner">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1">ETA</span>
                    <span className="text-lg font-black text-white">{path.length > 0 ? Math.ceil((path.length - currentPosIndex) * 0.5) : '--'} <span className="text-[10px] font-bold text-gray-500">min</span></span>
                  </div>

                  {/* Autonomous Navigation System Status Card */}
                  <div className="col-span-2 bg-gradient-to-r from-sky-950/40 via-sky-900/20 to-blue-950/40 border border-sky-500/30 rounded-xl p-3 shadow-inner flex items-center justify-between">
                    <div>
                      <span className="text-[9px] font-bold text-sky-400 uppercase tracking-widest block">
                        AUTONOMOUS NAVIGATION
                      </span>
                      <span className="text-sm font-black text-white tracking-wide">
                        PATROL GUIDANCE ACTIVE
                      </span>
                    </div>
                    {patrolCountdown !== null ? (
                      <span className="px-3 py-1 bg-sky-500/20 text-sky-300 border border-sky-500/40 rounded-lg text-xs font-mono font-black animate-pulse shadow-[0_0_12px_rgba(56,189,248,0.4)]">
                        PAUSING: {patrolCountdown.toFixed(1)}s
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-sky-500/20 text-sky-300 border border-sky-500/30 rounded-lg text-xs font-mono font-bold">
                        CRUISING
                      </span>
                    )}
                  </div>

                  {/* Real-world Navigation Path Legend Card */}
                  <div className="col-span-2 bg-slate-900/70 border border-white/10 rounded-xl p-2.5 shadow-inner flex flex-col gap-1.5">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                      Active Trajectory Legend
                    </span>
                    <div className="flex items-center justify-between gap-2 text-[10px] font-mono font-bold">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-1.5 rounded-full bg-[#38bdf8] shadow-[0_0_8px_#38bdf8]"></span>
                        <span className="text-sky-300">Normal Route</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-1.5 rounded-full bg-[#f97316] shadow-[0_0_8px_#f97316]"></span>
                        <span className="text-orange-400">Temporary Diversion</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => startSimulation()}
                    disabled={isPlaying || (path.length > 0 && currentPosIndex >= path.length - 1)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-cyan-600/20 text-cyan-400 border border-cyan-500/50 rounded-xl font-bold hover:bg-cyan-600 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_15px_rgba(8,145,178,0.2)] hover:shadow-[0_0_20px_rgba(8,145,178,0.5)] text-sm uppercase tracking-widest"
                  >
                    <Play className="w-4 h-4" /> {isPlaying ? 'Simulating...' : 'Execute'}
                  </button>
                  <button
                    onClick={resetSimulation}
                    className="p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors group"
                    title="Reset Robot"
                  >
                    <RotateCcw className="w-5 h-5 text-gray-400 group-hover:text-white group-hover:-rotate-90 transition-all duration-300" />
                  </button>
                </div>
              </div>
            )}

            {/* TOOLS TAB */}
            {activeCCTab === 'tools' && (
              <div className="p-4 space-y-4 animate-in fade-in duration-300">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Environment Tools</h4>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => setIsEmergencyTargeting(!isEmergencyTargeting)}
                    className={`w-full p-4 border rounded-xl transition-all flex items-center gap-4 text-left ${isEmergencyTargeting ? 'bg-red-500/20 text-red-400 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)]' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white'}`}
                  >
                    <div className={`p-2 rounded-lg ${isEmergencyTargeting ? 'bg-red-500 text-white' : 'bg-white/10'}`}>
                      <ShieldAlert className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold uppercase tracking-wider text-sm">Target Emergency</div>
                      <div className="text-[10px] opacity-70 mt-0.5 font-mono">Click on map to spawn an emergency</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setIsPlacingBlocker(!isPlacingBlocker);
                      if (!isPlacingBlocker) { setIsEmergencyTargeting(false); setIsPlacingCrowd(false); }
                    }}
                    className={`w-full p-4 border rounded-xl transition-all flex items-center gap-4 text-left ${isPlacingBlocker ? 'bg-orange-500/20 text-orange-400 border-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.3)]' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white'}`}
                  >
                    <div className={`p-2 rounded-lg ${isPlacingBlocker ? 'bg-orange-500 text-white' : 'bg-white/10'}`}>
                      <Construction className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold uppercase tracking-wider text-sm">Place Road Blocker</div>
                      <div className="text-[10px] opacity-70 mt-0.5 font-mono">Simulate a blocked route</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setIsPlacingCrowd(!isPlacingCrowd);
                      if (!isPlacingCrowd) { setIsEmergencyTargeting(false); setIsPlacingBlocker(false); }
                    }}
                    className={`w-full p-4 border rounded-xl transition-all flex items-center gap-4 text-left ${isPlacingCrowd ? 'bg-purple-500/20 text-purple-400 border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.3)]' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white'}`}
                  >
                    <div className={`p-2 rounded-lg ${isPlacingCrowd ? 'bg-purple-500 text-white' : 'bg-white/10'}`}>
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold uppercase tracking-wider text-sm">Place Crowd</div>
                      <div className="text-[10px] opacity-70 mt-0.5 font-mono">Trigger crowd control mode</div>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* LOCATIONS TAB */}
            {activeCCTab === 'locations' && (
              <div className={`flex flex-col h-full animate-in fade-in duration-300 ${!isOn ? 'opacity-30 pointer-events-none grayscale' : ''}`}>
                {selectedRoom ? (
                  <div className="p-4 flex-1 overflow-y-auto">
                    <button onClick={() => setSelectedRoom(null)} className="text-[10px] font-bold text-gray-400 hover:text-white uppercase tracking-widest flex items-center gap-1 mb-4 transition-colors">
                      <span>←</span> BACK TO DIRECTORY
                    </button>
                    
                    <div className="bg-gradient-to-br from-white/10 to-white/5 border border-white/10 rounded-2xl p-5 mb-5 shadow-xl backdrop-blur-md">
                      <h5 className="font-black text-white text-xl mb-2 tracking-wide truncate">{selectedRoom.name}</h5>
                      <div className="flex gap-2">
                        <span className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-black/40 text-cyan-300 border border-cyan-500/30">Floor {selectedRoom.start.f}</span>
                        <span className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-black/40 text-green-400 border border-green-500/30">Clear</span>
                      </div>
                      <div className="mt-4 pt-4 border-t border-white/10">
                         <div className="text-xs text-gray-400 font-mono">Est. Occupancy: <span className="text-white font-bold">{(selectedRoom.name.length + selectedRoom.start.x) % 12 || 2}</span></div>
                      </div>
                    </div>
                    
                    <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Quick Dispatch</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <button onClick={() => dispatchQuickMission('Navigate')} className="flex flex-col items-center justify-center gap-2 p-4 bg-brand/10 text-brand hover:bg-brand hover:text-white rounded-xl transition-all border border-brand/20 shadow-sm hover:shadow-[0_0_15px_rgba(34,211,238,0.4)] group">
                        <Play className="w-6 h-6 group-hover:scale-110 transition-transform" /> 
                        <span className="text-[10px] font-bold uppercase tracking-wider text-center">Navigate</span>
                      </button>
                      <button onClick={() => dispatchQuickMission('Deliver Documents')} className="flex flex-col items-center justify-center gap-2 p-4 bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white rounded-xl transition-all border border-blue-500/20 shadow-sm hover:shadow-[0_0_15px_rgba(59,130,246,0.4)] group">
                        <Crosshair className="w-6 h-6 group-hover:scale-110 transition-transform" /> 
                        <span className="text-[10px] font-bold uppercase tracking-wider text-center">Docs</span>
                      </button>
                      <button onClick={() => setModalType('food')} className="flex flex-col items-center justify-center gap-2 p-4 bg-orange-500/10 text-orange-400 hover:bg-orange-500 hover:text-white rounded-xl transition-all border border-orange-500/20 shadow-sm hover:shadow-[0_0_15px_rgba(249,115,22,0.4)] group">
                        <Utensils className="w-6 h-6 group-hover:scale-110 transition-transform" /> 
                        <span className="text-[10px] font-bold uppercase tracking-wider text-center">Food</span>
                      </button>
                      <button onClick={() => dispatchQuickMission('Clean Room')} className="flex flex-col items-center justify-center gap-2 p-4 bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white rounded-xl transition-all border border-green-500/20 shadow-sm hover:shadow-[0_0_15px_rgba(34,197,94,0.4)] group">
                        <Bot className="w-6 h-6 group-hover:scale-110 transition-transform" /> 
                        <span className="text-[10px] font-bold uppercase tracking-wider text-center">Clean</span>
                      </button>
                      <button onClick={() => setModalType('medical')} className="flex flex-col items-center justify-center gap-2 p-4 bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white rounded-xl transition-all border border-rose-500/20 shadow-sm hover:shadow-[0_0_15px_rgba(244,63,94,0.4)] group">
                        <Cross className="w-6 h-6 group-hover:scale-110 transition-transform" /> 
                        <span className="text-[10px] font-bold uppercase tracking-wider text-center">Medical</span>
                      </button>
                      <button onClick={() => handleEmergencyCall(selectedRoom.door || selectedRoom.start)} className="flex flex-col items-center justify-center gap-2 p-4 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all border border-red-500/30 shadow-sm hover:shadow-[0_0_15px_rgba(239,68,68,0.5)] group">
                        <ShieldAlert className="w-6 h-6 group-hover:scale-110 transition-transform" /> 
                        <span className="text-[10px] font-bold uppercase tracking-wider text-center">SOS</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 flex-1 flex flex-col min-h-0">
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 shrink-0">Building Directory</h4>
                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2">
                      {rooms?.map(room => (
                        <button 
                          key={room.id}
                          onClick={() => setSelectedRoom(room)}
                          className="w-full text-left px-4 py-3 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all text-xs flex justify-between items-center group shadow-sm"
                        >
                          <span className="truncate mr-2 font-medium">{room.name}</span>
                          <span className="text-[10px] text-gray-500 flex-shrink-0 group-hover:text-cyan-400 transition-colors font-bold uppercase tracking-widest">Fl {room.start.f}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        )}
      </div>

      {(robotState === 'crowd_control' || robotState === 'waiting_for_police' || policeState.phase === 'escorting') && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-red-600 text-white px-6 py-3 rounded-full font-bold flex items-center gap-3 shadow-[0_0_20px_rgba(220,38,38,0.8)] border border-red-400 z-[9999] animate-pulse">
          <span className="text-xl">🚔</span> {
            policeState.phase === 'escorting' ? 'Police escorting crowd...' :
            robotState === 'waiting_for_police' ? 'Waiting for Police to arrive...' : 
            'Calling Police...'
          }
        </div>
      )}

      {modalType && (
        <DeliveryModal
          type={modalType}
          initialDestination={selectedRoom ? selectedRoom.name : ''}
          onClose={() => setModalType(null)}
          onSubmit={handleDeliverySubmit}
        />
      )}
    </div>
  );
};

export default SimulationView;
