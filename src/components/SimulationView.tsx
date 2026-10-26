import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import type { MapData, GridPoint, Room, FireHazardPoint, FireIncident } from '../types';
import { calculatePath, calculateLongPath, calculateEvadePath } from '../utils/simulationEngine';
import { 
  Play, 
  RotateCcw, 
  Activity, 
  ShieldAlert, 
  Crosshair, 
  Maximize, 
  Minimize, 
  Bot, 
  Power, 
  Send, 
  Construction, 
  Pause, 
  Users, 
  Utensils, 
  Cross, 
  Sliders, 
  Car, 
  Trash2, 
  Plus, 
  Flame, 
  AlertTriangle,
  Compass,
  Sun,
  Moon,
  Eye,
  EyeOff,
  Layers,
  Search,
  Terminal,
  Navigation,
  Gauge
} from 'lucide-react';
import { DeliveryModal } from './DeliveryModal';
import { FireSimulationNode } from './FireSimulationNode';
import { 
  BuildingModel, 
  CampusRoadsAndGround, 
  Building3DLabel 
} from './CampusArchitecture';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  OrbitControls,
  Box,
  Line,
  OrthographicCamera,
  PerspectiveCamera,
  Html,
  Sphere,
  Cylinder,
  RoundedBox,
  Cone,
} from '@react-three/drei';
import * as THREE from 'three';
import { RobotVisionBroadcaster } from './RobotVisionBroadcaster';
import { RobotVisionPIP } from './RobotVisionPIP';

const CELL_SIZE = 1;

export type DynamicObstacle = {
  id: string;
  type: 'car' | 'person';
  pos: GridPoint;
  targetPos: GridPoint;
  path: GridPoint[];
  currentIndex: number;
  speed: number;
  isMoving: boolean;
  currentPosVector?: THREE.Vector3;
};

export type RobotState = 'idle' | 'mission' | 'patrol' | 'charging' | 'emergency_response' | 'emergency_to_ctr' | 'ctr_to_emergency' | 'crowd_control' | 'waiting_for_police' | 'evading_obstacle' | 'returning_home' | 'off' | 'reversing' | 'waiting_for_clearance' | 'extinguishing';

export type PoliceState = {

  active: boolean;
  path: GridPoint[];
  targetPos: GridPoint | null;
  phase: 'dispatching' | 'escorting' | 'idle';
};


const CameraController = ({ isFollowing, isFPV, robotPosRef, robotRotRef, controlsRef, triggerReset, onResetDone, gridSize, isMapView }: any) => {
  const { camera } = useThree();
  // Smoothed look-target to prevent jitter when following or FPV
  const smoothTarget = useRef(new THREE.Vector3(0, 0.5, 0));
  const smoothPos = useRef(new THREE.Vector3());
  const isCamInit = useRef(false);

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

    if (!robotPosRef.current || robotRotRef?.current === undefined) return;
    const pos = robotPosRef.current;
    const theta = robotRotRef.current;
    const forwardX = Math.sin(theta);
    const forwardZ = Math.cos(theta);

    if (isFPV) {
      // 1st Person True Robot Eyes (FPV) View - mounted outside front of robot at eye-level
      const eyeX = pos.x + forwardX * 0.95;
      const eyeY = pos.y + 1.25;
      const eyeZ = pos.z + forwardZ * 0.95;
      const desiredPos = new THREE.Vector3(eyeX, eyeY, eyeZ);

      const lerpAlpha = 1 - Math.pow(0.0001, delta);
      if (!isCamInit.current) {
        smoothPos.current.copy(desiredPos);
        isCamInit.current = true;
      } else {
        smoothPos.current.lerp(desiredPos, lerpAlpha);
      }
      camera.position.copy(smoothPos.current);

      const targetLook = new THREE.Vector3(
        eyeX + forwardX * 18,
        eyeY - 0.28, // look ahead onto the road and pathway
        eyeZ + forwardZ * 18
      );
      smoothTarget.current.lerp(targetLook, lerpAlpha);
      camera.lookAt(smoothTarget.current);

      if (controlsRef.current) {
        controlsRef.current.target.copy(smoothTarget.current);
        controlsRef.current.update();
      }
    } else if (isFollowing) {
      // 3rd Person Follow Camera
      const behindDist = 4.5;
      const upDist = 2.5;
      
      const offset = new THREE.Vector3(
        -forwardX * behindDist,
        upDist,
        -forwardZ * behindDist
      );
      const desiredPos = new THREE.Vector3().copy(pos).add(offset);

      // Very smooth, cinematic position lerp
      const lerpAlpha = 1 - Math.pow(0.001, delta);
      camera.position.lerp(desiredPos, lerpAlpha);

      // Smooth the look-at target to look slightly ahead/above the robot
      const targetLook = new THREE.Vector3().copy(pos).add(new THREE.Vector3(0, 0.5, 0));
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

// ─────────────────────────────────────────────────────────────
// BULLETPROOF WALL & PERIMETER CONTAINMENT SYSTEM
// Guarantees neither robot nor obstacles can EVER exceed or clip through walls
// ─────────────────────────────────────────────────────────────
const containWithinWalls = (
  pos: THREE.Vector3,
  radius: number,
  mapData?: MapData | null
) => {
  if (!mapData) return;
  const { gridSize, rooms } = mapData;
  const margin = 12;
  const compSizeX = gridSize.x + margin * 2;
  const compSizeY = gridSize.y + margin * 2;
  // Compound walls have thickness 0.6 at halfX / halfY.
  // We clamp strictly inside the compound walls with a solid safety margin:
  const halfX = compSizeX / 2 - 0.7 - radius;
  const halfY = compSizeY / 2 - 0.7 - radius;

  // 1. Strict Campus Perimeter Wall Containment:
  pos.x = Math.max(-halfX, Math.min(halfX, pos.x));
  pos.z = Math.max(-halfY, Math.min(halfY, pos.z));

  // 2. Building Walls Collision & Penetration Clamping:
  if (rooms && rooms.length > 0) {
    for (const room of rooms) {
      // Open green zones (parks, sports fields) do not have vertical physical masonry walls
      const rType = room.type || '';
      const rName = room.name?.toLowerCase() || '';
      if (rType === 'park' || rName.includes('cricket') || rName.includes('hockey') || rName.includes('sports ground')) {
        continue;
      }

      const [minBX, , minBZ] = getGridPosition({ x: room.start.x, y: room.start.y, f: 0 }, gridSize, 0);
      const [maxBX, , maxBZ] = getGridPosition({ x: room.end.x, y: room.end.y, f: 0 }, gridSize, 0);

      const left = Math.min(minBX, maxBX) - 0.5 - radius;
      const right = Math.max(minBX, maxBX) + 0.5 + radius;
      const front = Math.min(minBZ, maxBZ) - 0.5 - radius;
      const back = Math.max(minBZ, maxBZ) + 0.5 + radius;

      // Check if pos penetrates inside this building's solid wall buffer
      if (pos.x > left && pos.x < right && pos.z > front && pos.z < back) {
        // If entity is navigating to/through the legitimate door, allow door access
        if (room.door) {
          const [doorX, , doorZ] = getGridPosition(room.door, gridSize, 0);
          const distToDoor = Math.hypot(pos.x - doorX, pos.z - doorZ);
          if (distToDoor < 1.35) {
            continue;
          }
        }

        // Solid wall penetration detected: project out to nearest wall face
        const dLeft = pos.x - left;
        const dRight = right - pos.x;
        const dFront = pos.z - front;
        const dBack = back - pos.z;
        const minD = Math.min(dLeft, dRight, dFront, dBack);

        if (minD === dLeft) pos.x = left;
        else if (minD === dRight) pos.x = right;
        else if (minD === dFront) pos.z = front;
        else pos.z = back;
      }
    }
  }
};

const MovingEntity = ({ 
  obstacle, 
  gridSize, 
  isMapView, 
  robotPosRef, 
  allObstaclesRef,
  robotStateRef: _robotStateRef,
  mapData,
  userBlockers
}: { 
  obstacle: DynamicObstacle;
  gridSize: GridPoint;
  isMapView: boolean;
  robotPosRef?: React.MutableRefObject<THREE.Vector3 | null>;
  allObstaclesRef?: React.MutableRefObject<DynamicObstacle[]>;
  robotStateRef?: React.MutableRefObject<RobotState>;
  mapData?: MapData | null;
  userBlockers?: GridPoint[];
}) => {
  const ref = useRef<THREE.Group>(null);
  const diversionOffsetRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const targetDiversionOffset = useRef<THREE.Vector3>(new THREE.Vector3());
  const lastPosRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const stuckTimerRef = useRef<number>(0);
  const lastRerouteTimeRef = useRef<number>(0);

  // Deterministic sidewalk side for pedestrians (+0.95m or -0.95m)
  const isPedestrian = obstacle.type === 'person';
  const naturalSidewalkSide = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < obstacle.id.length; i++) {
      hash = ((hash << 5) - hash) + obstacle.id.charCodeAt(i);
      hash |= 0;
    }
    return hash % 2 === 0 ? 1 : -1;
  }, [obstacle.id]);
  
  useFrame((_state, delta) => {
    if (!ref.current || obstacle.path.length === 0 || !obstacle.isMoving) return;
    const currentPos = ref.current.position;
    obstacle.currentPosVector = currentPos.clone();
    obstacle.pos = getGridPointFromVector3(currentPos, gridSize);

    // 1. Anti-stuck watchdog: ensure obstacles are never idle in any state
    if (lastPosRef.current.distanceTo(currentPos) < 0.015) {
      stuckTimerRef.current += delta;
    } else {
      stuckTimerRef.current = 0;
      lastPosRef.current.copy(currentPos);
    }

    if (stuckTimerRef.current > 1.2 && mapData?.roads && mapData.roads.length > 0) {
      stuckTimerRef.current = 0;
      if (obstacle.currentIndex < obstacle.path.length - 1) {
        obstacle.currentIndex++;
      } else {
        const curGrid = obstacle.pos;
        let newTarget = mapData.roads[Math.floor(Math.random() * mapData.roads.length)];
        for (let attempt = 0; attempt < 8; attempt++) {
          if (Math.abs(newTarget.x - curGrid.x) + Math.abs(newTarget.y - curGrid.y) >= 6) break;
          newTarget = mapData.roads[Math.floor(Math.random() * mapData.roads.length)];
        }
        const newPath = calculatePath(
          curGrid,
          newTarget,
          [...(mapData.obstacles || []), ...(userBlockers || [])],
          mapData,
          true
        );
        if (newPath && newPath.length > 1) {
          obstacle.path = newPath;
          obstacle.targetPos = newTarget;
          obstacle.currentIndex = 0;
        }
      }
    }
    
    const targetNode = obstacle.path[Math.min(obstacle.currentIndex, obstacle.path.length - 1)];
    const [tx, ty, tz] = getGridPosition(targetNode, gridSize, obstacle.type === 'car' ? 0.2 : 0.5, isMapView);
    const targetVector = new THREE.Vector3(tx, ty, tz);

    // Direction along the road waypoint
    const moveDir = new THREE.Vector3().subVectors(targetVector, currentPos);
    moveDir.y = 0;
    if (moveDir.lengthSq() > 0.0001) {
      moveDir.normalize();
    } else {
      moveDir.set(0, 0, 1);
    }

    // Normal direction perpendicular to travel (+right, -left)
    const normalDir = new THREE.Vector3(-moveDir.z, 0, moveDir.x);

    // 2. Base Lane / Sidewalk Discipline:
    // Pedestrians walk on sidewalks (+0.95m / -0.95m)
    // Cars drive on the right lane (+0.55m)
    let lateralOffset = isPedestrian ? (0.95 * naturalSidewalkSide) : 0.55;
    let speedMultiplier = 1.0;

    // 3. Intelligent Diversion around Oncoming Robot:
    if (robotPosRef && robotPosRef.current) {
      const robotPos = robotPosRef.current;
      const toRobot = new THREE.Vector3().subVectors(robotPos, currentPos);
      toRobot.y = 0;
      const distToRobot = toRobot.length();

      // Physical repulsion cushion: guarantees obstacle NEVER enters robot personal zone (min 2.4m center-to-center)
      const MIN_GAP_TO_ROBOT = 2.4;
      if (distToRobot < MIN_GAP_TO_ROBOT && distToRobot > 0.001) {
        const pushAway = new THREE.Vector3().subVectors(currentPos, robotPos).normalize();
        pushAway.y = 0;
        const pushStrength = Math.min(6.0, (MIN_GAP_TO_ROBOT - distToRobot) * 6.0 + 2.0);
        currentPos.add(pushAway.multiplyScalar(delta * pushStrength));
      }

      // Detect oncoming encounter within 7.5m horizon
      if (distToRobot < 7.5 && distToRobot > 0.05) {
        const toRobotNorm = toRobot.clone().normalize();
        const dot = moveDir.dot(toRobotNorm);

        // dot > 0.05 means moving towards robot corridor
        if (dot > 0.05) {
          const crossY = (moveDir.x * toRobotNorm.z) - (moveDir.z * toRobotNorm.x);
          const steerSide = crossY > 0.02 ? -1 : 1;
          
          // Steer generously wide around robot (1.55m - 1.65m lateral offset)
          lateralOffset = (isPedestrian ? 1.65 : 1.55) * steerSide;
          
          // Slow down when in close proximity so safe lateral gap is established before passing
          if (distToRobot < 3.5) {
            speedMultiplier = Math.max(0.25, (distToRobot - 1.2) / 2.3);
          } else {
            speedMultiplier = 0.75;
          }

          // Attempt topological road network detour if near intersection
          const now = performance.now();
          if (now - lastRerouteTimeRef.current > 3000 && mapData?.roads && mapData.roads.length > 0) {
            lastRerouteTimeRef.current = now;
            const curGrid = obstacle.pos;
            const robotGrid = getGridPointFromVector3(robotPos, gridSize);

            const detourPath = calculatePath(
              curGrid,
              obstacle.targetPos,
              [...(mapData.obstacles || []), ...(userBlockers || []), robotGrid],
              mapData,
              true
            );
            if (detourPath && detourPath.length > 2 && (detourPath[1].x !== robotGrid.x || detourPath[1].y !== robotGrid.y)) {
              obstacle.path = detourPath;
              obstacle.currentIndex = 0;
            }
          }
        }
      }
    }

    // 4. Multi-Obstacle Repulsion (Prevents cars & pedestrians clustering or merging):
    if (allObstaclesRef && allObstaclesRef.current) {
      for (const other of allObstaclesRef.current) {
        if (other.id === obstacle.id || !other.currentPosVector) continue;
        const toOther = new THREE.Vector3().subVectors(other.currentPosVector, currentPos);
        toOther.y = 0;
        const distToOther = toOther.length();
        const MIN_GAP_TO_OTHER = 2.2;
        if (distToOther < MIN_GAP_TO_OTHER && distToOther > 0.001) {
          const pushAway = new THREE.Vector3().subVectors(currentPos, other.currentPosVector).normalize();
          pushAway.y = 0;
          const pushStrength = Math.min(5.0, (MIN_GAP_TO_OTHER - distToOther) * 5.0 + 1.5);
          currentPos.add(pushAway.multiplyScalar(delta * pushStrength));
        }
      }
    }

    // Proactively verify lateral offset does not point into solid building walls
    if (mapData?.rooms) {
      const probePos = currentPos.clone().add(normalDir.clone().multiplyScalar(lateralOffset));
      for (const room of mapData.rooms) {
        const rType = room.type || '';
        const rName = room.name?.toLowerCase() || '';
        if (rType === 'park' || rName.includes('cricket') || rName.includes('hockey') || rName.includes('sports ground')) continue;
        const [minBX, , minBZ] = getGridPosition({ x: room.start.x, y: room.start.y, f: 0 }, gridSize, 0);
        const [maxBX, , maxBZ] = getGridPosition({ x: room.end.x, y: room.end.y, f: 0 }, gridSize, 0);
        const l = Math.min(minBX, maxBX) - 0.5 - 0.5;
        const r = Math.max(minBX, maxBX) + 0.5 + 0.5;
        const f = Math.min(minBZ, maxBZ) - 0.5 - 0.5;
        const b = Math.max(minBZ, maxBZ) + 0.5 + 0.5;
        if (probePos.x > l && probePos.x < r && probePos.z > f && probePos.z < b) {
          lateralOffset = -lateralOffset;
          break;
        }
      }
    }

    // 5. Apply Smooth Diversion Offset
    targetDiversionOffset.current.copy(normalDir).multiplyScalar(lateralOffset);
    diversionOffsetRef.current.lerp(targetDiversionOffset.current, delta * 4.0);

    const effectiveTarget = targetVector.clone().add(diversionOffsetRef.current);
    const toTarget = new THREE.Vector3().subVectors(targetVector, currentPos);
    toTarget.y = 0;
    const alongTrack = toTarget.dot(moveDir);
    const distToTarget = currentPos.distanceTo(targetVector);
    const distToEffective = currentPos.distanceTo(effectiveTarget);

    // 6. Robust Along-Track Waypoint Advancement:
    if (distToTarget < 0.35 || alongTrack <= 0.3 || distToEffective < 0.35) {
      if (obstacle.currentIndex < obstacle.path.length - 1) {
        obstacle.currentIndex++;
      } else {
        // Continuous roaming: never reverse back and forth or freeze; pick next campus destination!
        if (mapData?.roads && mapData.roads.length > 0) {
          const curGrid = obstacle.pos;
          let newTarget = mapData.roads[Math.floor(Math.random() * mapData.roads.length)];
          for (let attempt = 0; attempt < 10; attempt++) {
            if (Math.abs(newTarget.x - curGrid.x) + Math.abs(newTarget.y - curGrid.y) >= 8) break;
            newTarget = mapData.roads[Math.floor(Math.random() * mapData.roads.length)];
          }
          const newPath = calculatePath(
            curGrid,
            newTarget,
            [...(mapData.obstacles || []), ...(userBlockers || [])],
            mapData,
            true
          );
          if (newPath && newPath.length > 1) {
            obstacle.path = newPath;
            obstacle.targetPos = newTarget;
            obstacle.currentIndex = 0;
          } else {
            const neighbors = mapData.roads.filter(r => 
              Math.abs(r.x - curGrid.x) + Math.abs(r.y - curGrid.y) === 1
            );
            if (neighbors.length > 0) {
              obstacle.path = [curGrid, neighbors[Math.floor(Math.random() * neighbors.length)]];
              obstacle.currentIndex = 0;
            }
          }
        }
      }
      obstacle.pos = obstacle.path[Math.min(obstacle.currentIndex, obstacle.path.length - 1)];
    } else {
      const moveDist = obstacle.speed * speedMultiplier * delta;
      const direction = new THREE.Vector3().subVectors(effectiveTarget, currentPos).normalize();
      currentPos.add(direction.multiplyScalar(moveDist));

      const rotDirection = new THREE.Vector3().subVectors(effectiveTarget, currentPos);
      rotDirection.y = 0;
      if (rotDirection.lengthSq() > 0.001) {
        const targetRotation = Math.atan2(rotDirection.x, rotDirection.z);
        let diff = targetRotation - ref.current.rotation.y;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        ref.current.rotation.y += diff * delta * 8;
      }
    }

    // 7. Strict Wall Containment Enforcement:
    // Guarantees this obstacle NEVER exceeds the compound walls or clips into building walls
    containWithinWalls(currentPos, isPedestrian ? 0.45 : 0.65, mapData);
    obstacle.currentPosVector.copy(currentPos);
    obstacle.pos = getGridPointFromVector3(currentPos, gridSize);
  });

  const rawStart = getGridPosition(obstacle.path[0] || {x:0, y:0, f:0}, gridSize, obstacle.type === 'car' ? 0.2 : 0.5, isMapView);
  const startVec = new THREE.Vector3(rawStart[0], rawStart[1], rawStart[2]);
  containWithinWalls(startVec, isPedestrian ? 0.45 : 0.65, mapData);
  const startPos: [number, number, number] = [startVec.x, startVec.y, startVec.z];

  return (
    <group ref={ref} position={startPos} scale={1.8}>
      {obstacle.type === 'car' ? (
        <group>
          <Box args={[0.7, 0.4, 1.2]} position={[0, 0.2, 0]} castShadow>
            <meshStandardMaterial color="#ef4444" metalness={0.6} roughness={0.3} />
          </Box>
          {/* Simple wheels */}
          <Cylinder args={[0.15, 0.15, 0.9, 12]} position={[0, 0, 0.35]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <meshStandardMaterial color="#1e293b" />
          </Cylinder>
          <Cylinder args={[0.15, 0.15, 0.9, 12]} position={[0, 0, -0.35]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <meshStandardMaterial color="#1e293b" />
          </Cylinder>
        </group>
      ) : (
        <group>
          <Box args={[0.3, 0.6, 0.3]} position={[0, 0.3, 0]} castShadow>
            <meshStandardMaterial color="#10b981" />
          </Box>
          <Sphere args={[0.15, 12, 12]} position={[0, 0.75, 0]} castShadow>
            <meshStandardMaterial color="#fcd34d" />
          </Sphere>
        </group>
      )}
    </group>
  );
};


// Roadway & asphalt infrastructure rendered by CampusRoadsAndGround

const TrafficBarricade = ({
  position,
  rotationY,
  length = 1,
  onContextMenu,
  isPlacingBlocker,
}: {
  position: [number, number, number];
  rotationY: number;
  length?: number;
  onContextMenu?: () => void;
  isPlacingBlocker?: boolean;
}) => {
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
    <group
      position={position}
      rotation={[0, rotationY, 0]}
      scale={1.15}
      onClick={(e) => {
        // Prevent click from propagating to map underneath
        e.stopPropagation();
      }}
      onContextMenu={(e) => {
        e.nativeEvent?.preventDefault();
        e.stopPropagation();
        if (onContextMenu) onContextMenu();
      }}
      onPointerOver={(e) => {
        if (isPlacingBlocker) {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }
      }}
      onPointerOut={() => {
        if (isPlacingBlocker) {
          document.body.style.cursor = 'crosshair';
        }
      }}
    >
      {/* Invisible hit box for comfortable raycasting and right-click detection */}
      <Box
        args={[baseW, 1.2, 0.8]}
        position={[0, 0.5, 0]}
        onClick={(e) => { e.stopPropagation(); }}
        onContextMenu={(e) => {
          e.nativeEvent?.preventDefault();
          e.stopPropagation();
          if (onContextMenu) onContextMenu();
        }}
      >
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </Box>

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

const BlockersRender = ({
  blockers,
  gridSize,
  roads,
  onRemoveBlockerGroup,
  isPlacingBlocker,
}: {
  blockers: GridPoint[];
  gridSize: GridPoint;
  roads: GridPoint[];
  onRemoveBlockerGroup?: (group: GridPoint[]) => void;
  isPlacingBlocker?: boolean;
}) => {
  if (!blockers || blockers.length === 0) return null;
  
  const renderedSet = new Set<string>();
  const barrierGroups: { center: GridPoint; length: number; rotationY: number; group: GridPoint[] }[] = [];

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
      rotationY,
      group,
    });
  }

  return (
    <group>
      {barrierGroups.map((bg, i) => {
        const [x, y, z] = getGridPosition(bg.center as any, gridSize, 0);
        return (
          <TrafficBarricade
            key={i}
            position={[x, y, z]}
            rotationY={bg.rotationY}
            length={bg.length}
            isPlacingBlocker={isPlacingBlocker}
            onContextMenu={() => {
              if (onRemoveBlockerGroup) {
                onRemoveBlockerGroup(bg.group);
              }
            }}
          />
        );
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



const PoliceVehicle = ({ policeState, policeStateRef, gridSize, isMapView, onReachDestination, mapData }: any) => {
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
    containWithinWalls(currentPos, 0.65, mapData);
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

// High-fidelity procedural campus architecture & infrastructure imported from ./CampusArchitecture

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
       {/* Title Text */}
       <Html position={[0, 4, 0]} center style={{ pointerEvents: 'none' }}>
          <div className="text-[12px] font-black text-cyan-400 bg-black/80 px-3 py-1 rounded shadow-lg whitespace-nowrap border border-cyan-500/50 uppercase tracking-[0.3em]">
             GATEWAY
          </div>
       </Html>
    </group>
  );
};

/* ── Detailed Animated 3D Robot Body ── */
export const DetailedRobot = ({ 
  isMoving, 
  showFeatures = false, 
  activeFeature = "", 
  isEmergency = false,
  isExtinguishing = false 
}: { 
  isMoving: boolean; 
  showFeatures?: boolean; 
  activeFeature?: string; 
  isEmergency?: boolean;
  isExtinguishing?: boolean;
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

    if (bodyRef.current) bodyRef.current.position.y = 0.05;
    if (headRef.current) headRef.current.rotation.y = 0;
    if (leftArmRef.current) {
      leftArmRef.current.rotation.x = isExtinguishing ? -Math.PI / 3 : 0;
    }
    if (rightArmRef.current) {
      rightArmRef.current.rotation.x = isExtinguishing ? -Math.PI / 3 : 0;
    }

    const ws = isMoving ? 8 : 0.5;
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
      } else {
        mat.color.set('#f97316');
        mat.emissive.set('#f97316');
        mat.emissiveIntensity = 0.5 + 0.5 * Math.sin(t * 5);
      }
    }
    
    if (headRef.current) {
      if (isMoving) {
        headRef.current.rotation.y = Math.sin(t * 2.5) * 0.4;
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
        {/* Fire Extinguisher Canister Mount (Side) */}
        <group position={[-0.4, 0.5, -0.1]}>
          <Cylinder args={[0.08, 0.08, 0.38, 12]} position={[0, 0, 0]} castShadow>
            <meshStandardMaterial color="#dc2626" metalness={0.4} roughness={0.3} />
          </Cylinder>
          <Sphere args={[0.08, 10, 10]} position={[0, 0.19, 0]} castShadow>
            <meshStandardMaterial color="#dc2626" metalness={0.4} roughness={0.3} />
          </Sphere>
          <Cylinder args={[0.02, 0.02, 0.07, 8]} position={[0, 0.28, 0]}>
            <meshStandardMaterial color="#cbd5e1" metalness={0.9} roughness={0.1} />
          </Cylinder>
          <Box args={[0.035, 0.035, 0.02]} position={[0.07, 0.26, 0]}>
            <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.8} />
          </Box>
        </group>

        {/* Dynamic Foam & Chemical Spray When Extinguishing */}
        {isExtinguishing && (
          <group position={[0, 0.35, 0.5]}>
            {/* Outer expanding foam spray cone */}
            <Cone args={[0.65, 2.0, 14, 1, true]} position={[0, -0.15, 1.0]} rotation={[Math.PI / 2.3, 0, 0]}>
              <meshStandardMaterial 
                color="#e0f2fe" 
                emissive="#38bdf8" 
                emissiveIntensity={0.9} 
                transparent 
                opacity={0.65} 
                roughness={0.1} 
              />
            </Cone>
            {/* Inner pressurized foam core */}
            <Cylinder args={[0.08, 0.28, 1.8, 8]} position={[0, -0.12, 0.9]} rotation={[Math.PI / 2.3, 0, 0]}>
              <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={1.5} transparent opacity={0.85} />
            </Cylinder>
            {/* Ground foam suppression blanket */}
            <Cylinder args={[0.95, 0.95, 0.04, 16]} position={[0, -0.5, 1.6]}>
              <meshStandardMaterial color="#f0f9ff" emissive="#bae6fd" emissiveIntensity={0.6} transparent opacity={0.75} />
            </Cylinder>
            {/* Flash cooling blue point light */}
            <pointLight position={[0, 0, 1.1]} intensity={5.0} distance={6} color="#38bdf8" />
            
            {/* 3D Floating Tag Above Robot */}
            <Html position={[0, 1.8, 0]} center>
              <div className="bg-amber-950/90 border border-amber-400 text-amber-300 text-[11px] font-black px-3.5 py-1.5 rounded-xl shadow-[0_0_30px_rgba(245,158,11,0.8)] backdrop-blur-md flex items-center gap-2 whitespace-nowrap animate-bounce font-mono">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping"></span>
                <span>🚒 EXTINGUISHING FOAM DISPENSER ACTIVE</span>
              </div>
            </Html>
          </group>
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
      </group>
    </group>
  );
};

const Robot = ({
  path, currentIndex, isPlaying, gridSize, isMapView, speed, dynamicObstaclesRef, userBlockers,
  onReachNode, onMissionComplete, onObstacleDetected: _onObstacleDetected, robotPosRef, robotRotRef, isEmergency = false,
  robotState, robotGroupRef, isFPV
}: {
  path: GridPoint[];
  currentIndex: number;
  isPlaying: boolean;
  gridSize: GridPoint;
  isMapView: boolean;
  speed: number;
  dynamicObstaclesRef: React.MutableRefObject<DynamicObstacle[]>;
  userBlockers?: GridPoint[];
  onReachNode: (idx: number) => void;
  onMissionComplete: () => void;
  onObstacleDetected: (obsPos: GridPoint) => void;
  robotPosRef: React.MutableRefObject<THREE.Vector3 | null>;
  robotRotRef: React.MutableRefObject<number>;
  robotGroupRef?: React.MutableRefObject<THREE.Group | null>;
  isFPV?: boolean;
  isEmergency?: boolean;
  robotState?: RobotState;
}) => {
  const ref = useRef<THREE.Group>(null);
  const isMovingRef = useRef(false);
  const [isMoving, setIsMoving] = useState(false);
  const hasCompletedRef = useRef(false);

  const robotDiversionRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const targetRobotDiversion = useRef<THREE.Vector3>(new THREE.Vector3());

  useEffect(() => {
    if (robotGroupRef) {
      robotGroupRef.current = ref.current;
    }
  }, [robotGroupRef]);

  useEffect(() => {
    hasCompletedRef.current = false;
  }, [path]);

  const pauseTimeRef = useRef(0);

  const targetVector = useMemo(() => {
    if (path.length === 0) return new THREE.Vector3(0, 0, 0);
    const pos = path[Math.min(currentIndex, path.length - 1)];
    const [x, y, z] = getGridPosition(pos, gridSize, 0.22, isMapView);
    return new THREE.Vector3(x, y, z);
  }, [path, currentIndex, gridSize, isMapView]);

  useFrame((_state, delta) => {
    if (!ref.current) return;
    const currentPos = ref.current.position;
    robotPosRef.current = currentPos.clone();
    robotRotRef.current = ref.current.rotation.y;
    
    if (pauseTimeRef.current > 0) {
      pauseTimeRef.current -= delta;
      if (isMovingRef.current) { isMovingRef.current = false; setIsMoving(false); }
    }
    
    if (pauseTimeRef.current > 0) return;

    if (isPlaying) {
      const forwardDir = new THREE.Vector3().subVectors(targetVector, currentPos);
      forwardDir.y = 0;
      if (forwardDir.lengthSq() > 0.0001) forwardDir.normalize();
      else forwardDir.set(0, 0, 1);
      const normalDir = new THREE.Vector3(-forwardDir.z, 0, forwardDir.x);

      let isDynamicEncounter = false;
      let robotSteerSide = 1; // +1 right lane, -1 left lane
      let speedFactor = 1.0;

      // 1. Dynamic Traffic Awareness & Active Lateral Bypass:
      // The robot NEVER freezes or reverses when meeting dynamic traffic!
      // It maintains a strict safety buffer (min 2.4m center-to-center) and steers into the clear shoulder.
      const MIN_SAFETY_GAP = 2.4; // Guarantees visible 0.9m - 1.0m air gap between robot shell and obstacle
      if (dynamicObstaclesRef && dynamicObstaclesRef.current.length > 0) {
        for (const obs of dynamicObstaclesRef.current) {
          if (!obs.currentPosVector) continue;
          const toObs = new THREE.Vector3().subVectors(obs.currentPosVector, currentPos);
          toObs.y = 0;
          const distToObs = toObs.length();

          // Physical safety cushion: smoothly repulses robot so personal buffer is never breached
          if (distToObs < MIN_SAFETY_GAP && distToObs > 0.001) {
            const repulse = toObs.clone().normalize().negate();
            const pushStrength = Math.min(6.0, (MIN_SAFETY_GAP - distToObs) * 6.0 + 2.0);
            currentPos.add(repulse.multiplyScalar(delta * pushStrength));
          }

          // Oncoming obstacle detection within 7.0m horizon
          if (distToObs < 7.0 && distToObs > 0.05) {
            const toObsNorm = toObs.clone().normalize();
            const dot = forwardDir.dot(toObsNorm);
            if (dot > 0.05) {
              isDynamicEncounter = true;

              // Steer cleanly away from obstacle side
              const crossY = (forwardDir.x * toObsNorm.z) - (forwardDir.z * toObsNorm.x);
              robotSteerSide = crossY > 0.02 ? -1 : 1;

              // When approaching obstacle in forward corridor (< 3.2m), yield/slow down forward drive
              // so the lateral evasion bypass creates the safe clearance before passing
              if (distToObs < 3.2) {
                const forwardSlowdown = Math.max(0.18, (distToObs - 1.2) / 2.0);
                speedFactor = Math.min(speedFactor, forwardSlowdown);
              } else {
                speedFactor = Math.min(speedFactor, 0.75);
              }
            }
          }
        }
      }

      // 2. Static Barricade / User Blocker Buffer:
      if (userBlockers && userBlockers.length > 0) {
        for (const b of userBlockers) {
          const [bx, , bz] = getGridPosition(b, gridSize, 0.22, isMapView);
          const bVec = new THREE.Vector3(bx, currentPos.y, bz);
          const toB = new THREE.Vector3().subVectors(bVec, currentPos);
          toB.y = 0;
          const distToB = toB.length();
          const MIN_BLOCKER_GAP = 2.2;
          if (distToB < MIN_BLOCKER_GAP && distToB > 0.001) {
            const repulse = toB.clone().normalize().negate();
            const pushStrength = Math.min(5.0, (MIN_BLOCKER_GAP - distToB) * 5.0 + 1.5);
            currentPos.add(repulse.multiplyScalar(delta * pushStrength));
          }
        }
      }

      if (isDynamicEncounter) {
        targetRobotDiversion.current.copy(normalDir).multiplyScalar(1.55 * robotSteerSide);
      } else {
        targetRobotDiversion.current.set(0, 0, 0);
      }
      robotDiversionRef.current.lerp(targetRobotDiversion.current, delta * 3.5);

      const effectiveTarget = targetVector.clone().add(robotDiversionRef.current);
      const toTarget = new THREE.Vector3().subVectors(targetVector, currentPos);
      toTarget.y = 0;
      const alongTrack = toTarget.dot(forwardDir);
      const distToTarget = currentPos.distanceTo(targetVector);
      const distToEffective = currentPos.distanceTo(effectiveTarget);

      // Robust along-track waypoint advancement
      if (distToTarget < 0.35 || alongTrack <= 0.3 || distToEffective < 0.35) {
        if (isMovingRef.current) { isMovingRef.current = false; setIsMoving(false); }
        if (currentIndex < path.length - 1) {
          const curr = path[currentIndex];
          const next = path[currentIndex + 1];
          if (curr.x === next.x && curr.y === next.y) {
             pauseTimeRef.current = 2.5; // Pause for deliberate waypoint stop
          }
          onReachNode(currentIndex + 1);
        }
        else if (currentIndex === path.length - 1) {
          if (!hasCompletedRef.current) {
            hasCompletedRef.current = true;
            onMissionComplete();
          }
        }
      } else {
        if (!isMovingRef.current) { isMovingRef.current = true; setIsMoving(true); }
        const moveDist = speed * speedFactor * delta;
        const direction = new THREE.Vector3().subVectors(effectiveTarget, currentPos).normalize();
        currentPos.add(direction.multiplyScalar(moveDist));

        const rotDirection = new THREE.Vector3().subVectors(effectiveTarget, currentPos);
        rotDirection.y = 0;
        if (rotDirection.lengthSq() > 0.01) {
          const targetRotation = Math.atan2(rotDirection.x, rotDirection.z);
          let diff = targetRotation - ref.current.rotation.y;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          ref.current.rotation.y += diff * delta * 10;
        }
      }
    } else {
      if (isMovingRef.current) { isMovingRef.current = false; setIsMoving(false); }
      currentPos.lerp(targetVector, 0.2);
    }
  });

  const startPos = getGridPosition(path[0] || { x: 0, y: 0, f: 0 }, gridSize, 0.22, isMapView);
  return (
    <group ref={ref} position={startPos} visible={!isFPV}>
      <DetailedRobot 
        isMoving={isMoving} 
        isEmergency={isEmergency} 
        isExtinguishing={robotState === 'extinguishing'} 
      />
    </group>
  );
};

const PathLine = ({ path, currentIndex, gridSize, isMapView, color = "#00ffff", opacity = 0.8 }: { path: GridPoint[], currentIndex: number, gridSize: GridPoint, isMapView: boolean, color?: string, opacity?: number }) => {
  const remainingPath = path.slice(currentIndex);
  if (remainingPath.length < 2) return null;
  const points = remainingPath.map(p => {
    const [x, y, z] = getGridPosition(p, gridSize, 0.1, isMapView);
    return new THREE.Vector3(x, y, z);
  });

  return (
    <Line points={points} color={color} lineWidth={4} opacity={opacity} transparent />
  );
};






// Campus environment map and ground systems imported from ./CampusArchitecture

interface SimulationViewProps {
  mapData: MapData | null;
  onEvent: (event: any) => void;
  onDispatchMission?: (missionText: string) => void;
  selectedStrategyId?: string;
  isOn?: boolean;
  onPowerChange?: (isOn: boolean) => void;
  fireHazards?: FireHazardPoint[];
  onFireHazardsChange?: (hazards: FireHazardPoint[]) => void;
  activeFireIncident?: FireIncident | null;
  isPlacingFire?: boolean;
  onTogglePlaceFire?: () => void;
  onFireDetected?: (hazard: FireHazardPoint, robotPos: GridPoint) => void;
  onAcknowledgeIncident?: (incidentId: string) => void;
  onResolveIncident?: (incidentId: string) => void;
  onSimulateAtBuilding?: (bldgName: string, coords: GridPoint) => void;
  incidentHistory?: FireIncident[];
}


export const SimulationView: React.FC<SimulationViewProps> = ({ 
  mapData, 
  onDispatchMission, 
  selectedStrategyId: _selectedStrategyId,
  isOn: isOnProp,
  onPowerChange,
  fireHazards: fireHazardsProp,
  onFireHazardsChange,
  activeFireIncident,
  isPlacingFire: isPlacingFireProp,
  onTogglePlaceFire,
  onFireDetected,
  onAcknowledgeIncident,
  onResolveIncident,
  onSimulateAtBuilding: _onSimulateAtBuilding,
  incidentHistory = []
}) => {
  const [internalFireHazards, setInternalFireHazards] = useState<FireHazardPoint[]>([]);
  const fireHazards = fireHazardsProp !== undefined ? fireHazardsProp : internalFireHazards;
  const setFireHazards = onFireHazardsChange || setInternalFireHazards;

  const [internalIsPlacingFire, setInternalIsPlacingFire] = useState(false);
  const isPlacingFire = isPlacingFireProp !== undefined ? isPlacingFireProp : internalIsPlacingFire;

  const activeFireTargetRef = useRef<GridPoint | null>(null);

  const [path, setPath] = useState<GridPoint[]>([]);
  const [activePathColor, setActivePathColor] = useState<string>('#00ffff');
  const [speedLimit, setSpeedLimit] = useState(50);
  const [isCTROpen, setIsCTROpen] = useState(false);
  const [ctrMessages, setCtrMessages] = useState<{sender: 'user'|'robot', text: string}[]>([{sender: 'robot', text: 'Hello! I am your autonomous service robot. How can I assist you today?'}]);
  const [ctrInput, setCtrInput] = useState('');
  
  const [currentPosIndex, setCurrentPosIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMapView, setIsMapView] = useState(false);

  const [isFollowing, setIsFollowing] = useState(false);
  const [isFPV, setIsFPV] = useState(false);
  const [triggerReset, setTriggerReset] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showReasoningLog, setShowReasoningLog] = useState(false);
  const [isCCMinimized, setIsCCMinimized] = useState(false);

  // Atmospheric lighting & UI view state
  const [isNight, setIsNight] = useState(false);
  const [showBuildingLabels, setShowBuildingLabels] = useState(true);
  const [buildingSearchTerm, setBuildingSearchTerm] = useState('');
  
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

  // Recalculate path dynamically if obstacles are added while moving
  useEffect(() => {
    if (isPlaying && path.length > 0 && currentPosIndex < path.length && mapData) {
       const currentLoc = path[currentPosIndex];
       const targetLoc = path[path.length - 1];
       const allObstacles = [...(mapData.obstacles || []), ...userBlockers];
       // Check if current path is blocked
       const isBlocked = path.slice(currentPosIndex).some(p => 
          userBlockers.some(b => b.x === p.x && b.y === p.y && b.f === p.f)
       );
       if (isBlocked) {
         const newPath = calculatePath(currentLoc, targetLoc, allObstacles, mapData);
         if (newPath.length > 0) {
           setPath(newPath);
           setCurrentPosIndex(0);
           addExplanation("Road blocked! Rerouting to destination...");
         } else {
           const homeRoom = mapData.rooms?.find(r => r.name.toLowerCase().includes('generator')) || mapData.rooms?.[0];
           let homePath: GridPoint[] = [];
           if (homeRoom) {
               homePath = calculatePath(currentLoc, homeRoom.door || homeRoom.start, allObstacles, mapData);
           }
           if (homePath.length > 0) {
               setPath(homePath);
               setCurrentPosIndex(0);
               setRobotState('returning_home');
               addExplanation("Road to destination is completely blocked! Returning to base.");
           } else {
               const evadePath = calculateEvadePath(currentLoc, allObstacles, mapData);
               if (evadePath.length > 0) {
                 setPath(evadePath);
                 setCurrentPosIndex(0);
                 setRobotState('evading_obstacle');
                 addExplanation("Road completely blocked! Moving to give space for obstacles...");
               } else {
                 setIsPlaying(false);
                 setRobotState('idle');
                 addExplanation("Road completely blocked and cannot evade! Halting.");
               }
           }
         }
       }

    }
  }, [userBlockers]);
  
  const [dynamicObstacles, setDynamicObstacles] = useState<DynamicObstacle[]>([]);
  const dynamicObstaclesRef = useRef<DynamicObstacle[]>([]);
  const [dynamicObstacleCount, setDynamicObstacleCount] = useState<number>(9);
  const dynamicObstacleCountRef = useRef<number>(9);
  useEffect(() => { dynamicObstacleCountRef.current = dynamicObstacleCount; }, [dynamicObstacleCount]);
  const isRecalculating = useRef(false);

  const [battery, setBattery] = useState(100);
  const [robotState, setRobotState] = useState<RobotState>('patrol');
  const [isOn, setIsOn] = useState(isOnProp !== undefined ? isOnProp : true);

  useEffect(() => {
    if (isOnProp !== undefined && isOnProp !== isOn) {
      setIsOn(isOnProp);
    }
  }, [isOnProp]);
  const [activeCCTab, setActiveCCTab] = useState<'dashboard' | 'tools' | 'locations'>('dashboard');
  const [modalType, setModalType] = useState<'food' | 'medical' | null>(null);
  const [showRobotVisionPIP, setShowRobotVisionPIP] = useState(false);

  const handleDeliverySubmit = (missionText: string) => {
    if (onDispatchMission) onDispatchMission(missionText);
    setModalType(null);
  };
  const batteryRef = useRef(100);
  const robotStateRef = useRef<RobotState>('patrol');
  const originalMissionRef = useRef<{path: GridPoint[], index: number} | null>(null);
  const emergencyLocationRef = useRef<GridPoint | null>(null);
  const robotPosRef = useRef<THREE.Vector3 | null>(null);
  const robotRotRef = useRef<number>(0);
  const robotGroupRef = useRef<THREE.Group | null>(null);
  const controlsRef = useRef<any>(null);
  const turnOffAfterEmergencyRef = useRef(false);
  const currentTaskIndexRef = useRef(0);
  const emergencyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearanceCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    switch(robotState) {
      case 'patrol':
        setActivePathColor('#3b82f6'); // blue
        break;
      case 'mission':
        setActivePathColor('#22c55e'); // green
        break;
      case 'emergency_response':
      case 'emergency_to_ctr':
      case 'ctr_to_emergency':
        setActivePathColor('#ef4444'); // red
        break;
      case 'charging':
      case 'returning_home':
        setActivePathColor('#eab308'); // yellow
        break;
      case 'evading_obstacle':
      case 'reversing':
        setActivePathColor('#f97316'); // orange
        break;
      case 'waiting_for_clearance':
        setActivePathColor('#a855f7'); // purple
        break;
      default:
        setActivePathColor('#00ffff'); // cyan
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
    const handleRemoteCamera = () => {
      setIsFollowing(prev => {
        const next = !prev;
        addExplanation(next ? "Mobile Operator toggled follow camera." : "Mobile Operator switched to free view.");
        return next;
      });
    };
    const handleRemoteVoice = () => {
      addExplanation("Mobile Operator triggered audio ping.");
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const audioCtx = new AudioContextClass();
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.frequency.setValueAtTime(880, audioCtx.currentTime);
          gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
          osc.start();
          osc.stop(audioCtx.currentTime + 0.3);
        }
      } catch (e) {}
    };
    window.addEventListener('remote_toggle_power', handleRemoteToggle);
    window.addEventListener('remote_speed_update', handleRemoteSpeed);
    window.addEventListener('remote_toggle_camera', handleRemoteCamera);
    window.addEventListener('remote_toggle_voice', handleRemoteVoice);
    return () => {
      window.removeEventListener('remote_toggle_power', handleRemoteToggle);
      window.removeEventListener('remote_speed_update', handleRemoteSpeed);
      window.removeEventListener('remote_toggle_camera', handleRemoteCamera);
      window.removeEventListener('remote_toggle_voice', handleRemoteVoice);
    };
  }, []);

  const togglePowerBroadcast = (turnOn: boolean) => {
    if (turnOn === isOn) return;
    fetch('/api/action', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ action: 'toggle_power', payload: { turnOn } })
    }).catch(() => {});
  };

  const togglePower = () => {
    if (isOn) {
      setIsOn(false);
      onPowerChange?.(false);
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
      onPowerChange?.(true);
      setBattery(100);
      addExplanation("Powering ON. System initialized. Beginning patrol immediately.");
      if (mapData && mapData.rooms && mapData.rooms.length > 0) {
        const currentLoc = path.length > 0 && currentPosIndex < path.length ? path[currentPosIndex] : mapData.start;
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
      } else {
        setRobotState('patrol');
      }
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
      resetSimulation();
      // Do not auto-execute here. Wait for remote_execute_mission.
    }
  }, [mapData]);

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
    }, isPlaying ? 100 : 500);
    return () => clearInterval(interval);
  }, [isPlaying, mapData]);

  const prevIsIdleMode = useRef(isIdleMode);

  // Auto-Patrol Logic
  useEffect(() => {
    let timeout: any;
    if (!isIdleMode && (robotState === 'idle' || robotState === 'patrol') && !isPlaying && isOn) {
      timeout = setTimeout(() => {
        if (!mapData || !mapData.rooms) return;
        addExplanation('Autonomous patrol active. Patrolling campus network.');
        const currentLoc = path.length > 0 ? path[currentPosIndex] : mapData.start;
        const randomRoom = mapData.rooms[Math.floor(Math.random() * mapData.rooms.length)];
        const patrolPath = calculatePath(currentLoc, randomRoom.door || randomRoom.start, [...(mapData.obstacles || []), ...userBlockers], mapData);
        if (patrolPath.length > 0) {
          setPath(patrolPath);
          setCurrentPosIndex(0);
          setRobotState('patrol');
          setIsPlaying(true);
        }
      }, 100);
    }
    prevIsIdleMode.current = isIdleMode;
    return () => clearTimeout(timeout);
  }, [robotState, isPlaying, path, currentPosIndex, mapData, isOn, isIdleMode]);

  const initializeDynamicObstacles = (_robotPath?: GridPoint[], targetCount?: number) => {
    if (!mapData || !mapData.roads || mapData.roads.length < 5) return;
    const roads = mapData.roads;
    const count = targetCount !== undefined ? targetCount : dynamicObstacleCountRef.current;

    if (count <= 0) {
      setDynamicObstacles([]);
      dynamicObstaclesRef.current = [];
      return;
    }

    const obs: DynamicObstacle[] = [];
    const carCount = count < 3 ? (count > 0 ? 1 : 0) : Math.min(8, Math.max(1, Math.round(count * 0.3)));
    
    const robotCur = robotPosRef.current ? getGridPointFromVector3(robotPosRef.current, mapData.gridSize) : mapData.start;

    for (let i = 0; i < count; i++) {
      const isCar = i < carCount;
      // Pick start and end nodes with reasonable separation to prevent bunching
      let start = roads[Math.floor(Math.random() * roads.length)];
      for (let a = 0; a < 6; a++) {
        if (robotCur && Math.abs(start.x - robotCur.x) + Math.abs(start.y - robotCur.y) < 6) {
          start = roads[Math.floor(Math.random() * roads.length)];
        } else break;
      }

      let end = roads[Math.floor(Math.random() * roads.length)];
      for (let attempt = 0; attempt < 8; attempt++) {
        if (Math.abs(start.x - end.x) + Math.abs(start.y - end.y) >= 8) break;
        end = roads[Math.floor(Math.random() * roads.length)];
      }

      const path = calculatePath(start, end, [...(mapData.obstacles || []), ...userBlockers], mapData, true);
      if (path.length > 1) {
        obs.push({
          id: `obs_${i}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          type: isCar ? 'car' : 'person',
          pos: path[0],
          targetPos: end,
          path,
          currentIndex: 0,
          speed: isCar ? 4.8 : (1.8 + Math.random() * 0.6),
          isMoving: true
        });
      }
    }
    
    setDynamicObstacles(obs);
    dynamicObstaclesRef.current = obs;
  };

  // Populate dynamic obstacles as soon as campus layout is loaded
  useEffect(() => {
    if (mapData && mapData.roads && mapData.roads.length > 0) {
      initializeDynamicObstacles();
    }
  }, [mapData]);

  // Adjust dynamic obstacles count
  const handleUpdateObstacleCount = (newCount: number) => {
    const clamped = Math.max(0, Math.min(30, newCount));
    setDynamicObstacleCount(clamped);
    initializeDynamicObstacles(path, clamped);
    window.dispatchEvent(new CustomEvent('local_set_obstacle_count', { detail: { count: clamped } }));
    addExplanation(`Obstacles adjusted to ${clamped} dynamic entities.`);
  };

  // Listen for remote obstacle count updates (e.g. from mobile)
  useEffect(() => {
    const handleRemoteObstacle = (e: any) => {
      const count = e.detail?.count;
      if (typeof count === 'number' && count !== dynamicObstacleCountRef.current) {
        setDynamicObstacleCount(count);
        initializeDynamicObstacles(path, count);
        addExplanation(`Mobile operator set obstacle density to ${count}.`);
      }
    };
    window.addEventListener('remote_set_obstacle_count', handleRemoteObstacle);
    return () => window.removeEventListener('remote_set_obstacle_count', handleRemoteObstacle);
  }, [path, mapData, userBlockers]);

  // Manual drive handling for Mobile D-Pad
  const handleManualDrive = (direction: string, manualSpeed: number = 50) => {
    if (!mapData) return;
    if (!isOnRef.current) {
      addExplanation("Cannot drive robot: Power is OFF. Power ON the robot first.");
      return;
    }
    const currentLoc = (robotPosRef.current 
      ? getGridPointFromVector3(robotPosRef.current, mapData.gridSize || { x: 120, y: 100, f: 1 })
      : ((path.length > 0 && currentPosIndex < path.length) ? path[currentPosIndex] : (mapData.start || { x: 61, y: 81, f: 0 })));

    let dx = 0;
    let dy = 0;
    if (direction === 'forward') dy = -1;
    else if (direction === 'backward') dy = 1;
    else if (direction === 'left') dx = -1;
    else if (direction === 'right') dx = 1;

    // Try multi-step distances (3, 2, 1) to find the best valid reachable node
    let drivePath: GridPoint[] = [];
    const allObstacles = [...(mapData?.obstacles || []), ...userBlockers];

    for (const stepSize of [3, 2, 1]) {
      const targetGrid: GridPoint = {
        x: Math.max(0, Math.min((mapData?.gridSize?.x || 120) - 1, currentLoc.x + dx * stepSize)),
        y: Math.max(0, Math.min((mapData?.gridSize?.y || 100) - 1, currentLoc.y + dy * stepSize)),
        f: currentLoc.f
      };
      const p = calculatePath(currentLoc, targetGrid, allObstacles, mapData, false);
      if (p && p.length > 1) {
        drivePath = p;
        break;
      }
    }

    if (drivePath.length > 0) {
      setPath(drivePath);
      setCurrentPosIndex(0);
      setRobotState('mission');
      setIsPlaying(true);
      // manualSpeed is 10..100, where 50 is normal 1x speed
      setSpeedLimit(Math.max(10, Math.min(100, manualSpeed)));
    }
  };

  const handleManualStop = () => {
    setIsPlaying(false);
    setRobotState('idle');
  };

  // Listen for remote manual driving commands from Mobile controller
  useEffect(() => {
    const handleRemoteMove = (e: any) => {
      const { direction, speed: mSpeed } = e.detail;
      handleManualDrive(direction, mSpeed);
    };
    const handleRemoteStop = () => {
      handleManualStop();
    };
    window.addEventListener('remote_manual_move', handleRemoteMove);
    window.addEventListener('remote_manual_stop', handleRemoteStop);
    return () => {
      window.removeEventListener('remote_manual_move', handleRemoteMove);
      window.removeEventListener('remote_manual_stop', handleRemoteStop);
    };
  }, [path, currentPosIndex, mapData, userBlockers]);

  const handleAddRandomRoadblock = () => {
    if (!mapData || !mapData.roads || mapData.roads.length === 0) return;
    const roads = mapData.roads;
    const randomRoad = roads[Math.floor(Math.random() * roads.length)];
    const blockGroup = getRoadBlockGroup(randomRoad, roads);
    setUserBlockers(prev => {
      const newBlockers = [...prev];
      for (const b of blockGroup) {
        if (!newBlockers.some(existing => existing.x === b.x && existing.y === b.y)) {
          newBlockers.push(b);
        }
      }
      return newBlockers;
    });
    addExplanation(`Placed random roadblock at (${randomRoad.x}, ${randomRoad.y})`);
  };

  const handleClearAllRoadblocks = () => {
    setUserBlockers([]);
    addExplanation("All user road blockers have been cleared.");
  };

  const addExplanation = (msg: string) => {
    setAiExplanations(prev => [msg, ...prev].slice(0, 5));
  };

  const getRoadBlockGroup = useCallback((gridP: GridPoint, roads: GridPoint[]): GridPoint[] => {
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
    return toBlock;
  }, []);

  const handleRemoveBlockerGroup = useCallback((groupToRemove: GridPoint[]) => {
    setUserBlockers(prev => {
      const next = prev.filter(b => !groupToRemove.some(cs => cs.x === b.x && cs.y === b.y && cs.f === b.f));
      if (next.length !== prev.length) {
        addExplanation("Road blocker removed. Route opened.");
      }
      return next;
    });
  }, []);

  const handleRemoveBlockerAt = useCallback((gridP: GridPoint) => {
    setUserBlockers(prev => {
      const roads = mapData?.roads || [];
      // 1. Direct match
      let target = prev.find(b => b.x === gridP.x && b.y === gridP.y && b.f === gridP.f);
      // 2. Near match within 2.5 tiles
      if (!target) {
        let minDist = 2.5;
        for (const b of prev) {
          const d = Math.hypot(b.x - gridP.x, b.y - gridP.y);
          if (d < minDist) {
            minDist = d;
            target = b;
          }
        }
      }
      if (!target) return prev;

      const toRemove = getRoadBlockGroup(target, roads);
      const next = prev.filter(b => !toRemove.some(cs => cs.x === b.x && cs.y === b.y && cs.f === b.f));
      if (next.length !== prev.length) {
        addExplanation("Road blocker removed. Route opened.");
      }
      return next;
    });
  }, [mapData, getRoadBlockGroup]);

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
      
      // Return Home / RTL
      if (lowerMsg === 'return home' || lowerMsg === 'home' || lowerMsg === 'rtl' || lowerMsg === 'return to base') {
        const homeRoom = mapData?.rooms?.find(r => r.name.toLowerCase().includes('generator')) || mapData?.rooms?.[0];
        if (homeRoom && mapData) {
          const currentLoc = (robotPosRef.current ? getGridPointFromVector3(robotPosRef.current, mapData.gridSize) : null) || (path.length > 0 && currentPosIndex < path.length ? path[currentPosIndex] : mapData.start);
          const homePath = calculatePath(currentLoc, homeRoom.door || homeRoom.start, [...(mapData.obstacles || []), ...userBlockers], mapData);
          if (homePath.length > 0) {
            setPath(homePath);
            setCurrentPosIndex(0);
            setRobotState('returning_home');
            setIsPlaying(true);
            reply = `Return-to-Base protocol engaged. Navigating to ${homeRoom.name}.`;
            addExplanation(`Remote command: Navigating to ${homeRoom.name} base station.`);
          } else {
            reply = `Base station coordinates currently blocked. Check obstacles.`;
          }
        } else {
          reply = `Base station not located on map.`;
        }
      }
      // Reset Robot
      else if (lowerMsg === 'reset robot' || lowerMsg === 'reset') {
        resetSimulation();
        reply = `Robot simulation reset to default standby coordinates.`;
        addExplanation(`Remote command: Simulation reset executed.`);
      }
      // Delivery Missions (from Mobile Dashboard or console)
      else if (lowerMsg.startsWith('deliver ') || lowerMsg.includes('delivery') || lowerMsg.includes('food') || lowerMsg.includes('medicine') || lowerMsg.includes('medical')) {
        if (onDispatchMission) {
          onDispatchMission(userMsg);
          reply = `Dispatching mission: "${userMsg}". AI path computation in progress.`;
          addExplanation(`Mission dispatched: "${userMsg}"`);
        } else {
          reply = `Acknowledged delivery mission: "${userMsg}".`;
        }
      } else if (lowerMsg.startsWith('go to ') || lowerMsg.startsWith('come to ')) {
        if (robotState === 'emergency_response') {
          const roomName = lowerMsg.replace(/^(go to |come to )/, '').trim();
          const targetRoom = mapData?.rooms?.find(r => r.name.toLowerCase().includes(roomName));
          if (targetRoom) {
            reply = `Emergency side-task accepted. Proceeding to ${targetRoom.name} and will return here shortly.`;
            dispatchLocalMission(targetRoom.door || targetRoom.start, userMsg, true);
          } else {
            reply = `I could not find a location matching "${roomName}".`;
          }
        } else if (onDispatchMission) {
          onDispatchMission(userMsg);
          reply = `Navigating to designated location: "${userMsg}".`;
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
        else if (robotState === 'returning_home') reply = "I am currently returning to the base station.";
        else reply = "I am currently idle and awaiting instructions.";
      } else {
        if (onDispatchMission) {
          onDispatchMission(userMsg);
          reply = `Processing mission: "${userMsg}". AI path computation in progress.`;
        } else {
          reply = "Execute command in the control center to navigate to your chosen destination.";
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
       currentTaskIndexRef.current = 0;
       setActivePathColor('#3b82f6'); // blue for patrol

       // Start in patrol mode only (not mission mode)
       if (mapData && mapData.rooms && mapData.rooms.length > 0) {
         const randomRoom = mapData.rooms[Math.floor(Math.random() * mapData.rooms.length)];
         const patrolPath = calculatePath(currentLoc, randomRoom.door || randomRoom.start, [...(mapData.obstacles || []), ...userBlockers], mapData);
         if (patrolPath.length > 0) {
           setPath(patrolPath);
           setCurrentPosIndex(0);
           setRobotState('patrol');
           setIsPlaying(true);
           addExplanation(`Autonomous patrol initialized. Patrolling towards ${randomRoom.name}.`);
           initializeDynamicObstacles(patrolPath);
           return;
         }
       }
       setPath([]);
       setRobotState('patrol');
       setIsPlaying(true);
       initializeDynamicObstacles();
       return;
    }
    
    currentTaskIndexRef.current = 0;
    const target = mapData.tasks?.[0]?.location || mapData.end;
    let initialPath: GridPoint[] = [];
    
    const emergencyLoc = path.length > 0 ? path[path.length - 1] : mapData.start;
    emergencyLocationRef.current = emergencyLoc;
    const fPath = calculatePath(currentLoc, target, [...(mapData.obstacles || []), ...userBlockers], mapData);
    initialPath = fPath;
    setActivePathColor('#00ffff');
    
    if (initialPath.length > 0) {
      setPath(initialPath);
      setRobotState('emergency_to_ctr');
      if (emergencyTimeoutRef.current) {
        clearTimeout(emergencyTimeoutRef.current);
        emergencyTimeoutRef.current = null;
      }
      setIsPlaying(true);
    } else {
      setPath([]);
      setRobotState('patrol');
    }
    initializeDynamicObstacles(initialPath);
  };

  const handleLowBattery = () => {
    if (!mapData || !mapData.rooms) return;
    isRecalculating.current = true;
    setIsPlaying(false);
    addExplanation(`BATTERY CRITICAL: Diverting to Generator Room for charging...`);
    
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

  const dispatchRobotToExtinguish = (fireCoord: GridPoint) => {
    if (!mapData) return;
    if (!isOn) {
      setIsOn(true);
      if (onPowerChange) onPowerChange(true);
    }
    const robotP = robotPosRef.current ? getGridPointFromVector3(robotPosRef.current, mapData.gridSize) : mapData.start;

    // Candidates directly adjacent to fire (standoff ~1.5 to 2.5 units)
    const offsets = [
      { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
      { dx: 2, dy: 0 }, { dx: -2, dy: 0 }, { dx: 0, dy: 2 }, { dx: 0, dy: -2 },
      { dx: 1, dy: 1 }, { dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 },
      { dx: 0, dy: 0 }
    ];

    let targetPoint: GridPoint = { x: fireCoord.x, y: fireCoord.y, f: fireCoord.f || 0 };
    let bestPath: GridPoint[] = [];

    for (const off of offsets) {
      const candidate: GridPoint = { x: fireCoord.x + off.dx, y: fireCoord.y + off.dy, f: fireCoord.f || 0 };
      if (candidate.x >= 0 && candidate.x < mapData.gridSize.x && candidate.y >= 0 && candidate.y < mapData.gridSize.y) {
        const p = calculatePath(robotP, candidate, [...(mapData.obstacles || []), ...userBlockers], mapData);
        if (p.length > 0) {
          bestPath = p;
          targetPoint = candidate;
          break;
        }
      }
    }

    if (bestPath.length === 0) {
      bestPath = calculatePath(robotP, targetPoint, [...(mapData.obstacles || []), ...userBlockers], mapData);
    }

    if (bestPath.length > 0) {
      setIsPlaying(false);
      isRecalculating.current = true;
      currentTaskIndexRef.current = 9999;
      activeFireTargetRef.current = fireCoord;

      setTimeout(() => {
        setPath(bestPath);
        setCurrentPosIndex(0);
        setActivePathColor('#ef4444');
        setRobotState('emergency_response');
        setIsPlaying(true);
        isRecalculating.current = false;
        addExplanation(`🚨 CRITICAL FIRE EMERGENCY: Dispatched to (${fireCoord.x}, ${fireCoord.y}). Emergency siren and Fire Extinguisher Unit active.`);
      }, 200);
    } else {
      addExplanation(`⚠️ Road to fire at (${fireCoord.x}, ${fireCoord.y}) is blocked. Cannot establish clear path.`);
    }
  };

  const handleDeployFireAt = (gridP: GridPoint) => {
    const newHazard: FireHazardPoint = {
      id: `fire_${Date.now()}`,
      position: gridP,
      type: 'fire_and_smoke',
      intensity: 3,
      active: true
    };
    const updated = [...fireHazards, newHazard];
    setFireHazards(updated);
    addExplanation(`🔥 Fire Hazard deployed at (${gridP.x}, ${gridP.y}). Continuous AI vision scan active.`);
    if (onTogglePlaceFire) onTogglePlaceFire();
    else setInternalIsPlacingFire(false);

    if (onFireDetected && robotPosRef.current && mapData) {
      const robotP = getGridPointFromVector3(robotPosRef.current, mapData.gridSize);
      onFireDetected(newHazard, robotP);
    }

    // Immediately dispatch robot to the fire location to call extinguisher
    dispatchRobotToExtinguish(gridP);
  };

  const handleRemoveFireHazard = (id: string) => {
    setFireHazards(fireHazards.filter(h => h.id !== id));
    addExplanation("Fire hazard extinguished and cleared.");
  };

  // Continuous autonomous patrol vision scanning for fire and smoke hazards
  useEffect(() => {
    if (fireHazards.length === 0) return;
    if (!robotPosRef.current || !mapData) return;

    const interval = setInterval(() => {
      if (!robotPosRef.current || !mapData) return;
      const robotP = getGridPointFromVector3(robotPosRef.current, mapData.gridSize);

      for (const hazard of fireHazards) {
        if (!hazard.active) continue;
        const dx = robotP.x - hazard.position.x;
        const dy = robotP.y - hazard.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Within robot camera perception cone (~18 meters)
        if (dist <= 18) {
          if (!activeFireIncident || activeFireIncident.status === 'RESOLVED') {
            addExplanation(`🚨 CRITICAL: Fire hazard detected by robot camera at (${hazard.position.x}, ${hazard.position.y})! Initiating emergency alert.`);

            if (onFireDetected) {
              onFireDetected(hazard, robotP);
            }
            dispatchRobotToExtinguish(hazard.position);
            break;
          }
        }
      }
    }, 600);

    return () => clearInterval(interval);
  }, [fireHazards, activeFireIncident, mapData, userBlockers, onFireDetected]);


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

  const waitForObstacleToClear = () => {
    if (clearanceCheckRef.current) {
      clearInterval(clearanceCheckRef.current);
      clearanceCheckRef.current = null;
    }

    let checkCount = 0;
    const maxChecks = 15; // Check every 800ms for up to ~12s

    clearanceCheckRef.current = setInterval(() => {
      checkCount++;
      if (!mapData) {
        if (clearanceCheckRef.current) clearInterval(clearanceCheckRef.current);
        return;
      }

      const orig = originalMissionRef.current;
      const targetLoc = (orig && orig.path.length > 0)
        ? orig.path[orig.path.length - 1]
        : (path.length > 0 ? path[path.length - 1] : mapData.start);

      const currentLoc = (path.length > 0 && currentPosIndex < path.length)
        ? path[currentPosIndex]
        : (robotPosRef.current ? getGridPointFromVector3(robotPosRef.current, mapData.gridSize) : mapData.start);

      // Check current live dynamic obstacle positions
      const dynamicPositions = dynamicObstaclesRef.current.map(o => o.pos);
      const currentObstacles = [...(mapData.obstacles || []), ...userBlockers, ...dynamicPositions];

      // Try forward path to target
      const forwardPath = calculatePath(currentLoc, targetLoc, currentObstacles, mapData, true);

      if (forwardPath.length > 0) {
        if (clearanceCheckRef.current) {
          clearInterval(clearanceCheckRef.current);
          clearanceCheckRef.current = null;
        }
        addExplanation('Obstacle has moved! Road is now clear. Resuming mission forward.');
        setPath(forwardPath);
        setCurrentPosIndex(0);
        setRobotState(orig ? 'mission' : 'patrol');
        setIsPlaying(true);
        originalMissionRef.current = null;
        isRecalculating.current = false;
        return;
      }

      if (checkCount >= maxChecks) {
        if (clearanceCheckRef.current) {
          clearInterval(clearanceCheckRef.current);
          clearanceCheckRef.current = null;
        }
        // Try detour if route remains obstructed
        const detourPath = calculateLongPath(currentLoc, targetLoc, currentObstacles, mapData);
        if (detourPath.length > 0) {
          addExplanation('Obstacle still present. Taking wide perimeter detour to destination.');
          setPath(detourPath);
          setCurrentPosIndex(0);
          setRobotState(orig ? 'mission' : 'patrol');
          setIsPlaying(true);
          originalMissionRef.current = null;
        } else {
          addExplanation('Obstacle holding position. Continuing to monitor corridor safely...');
          // Keep checking
          setTimeout(() => waitForObstacleToClear(), 1500);
        }
        isRecalculating.current = false;
      }
    }, 800);
  };

  const handleObstacleDetected = (obsPos: GridPoint) => {
    if (isRecalculating.current) return;
    if (robotState === 'reversing' || robotState === 'waiting_for_clearance') return;
    isRecalculating.current = true;
    
    if (!mapData) {
       isRecalculating.current = false;
       return;
    }
    const currentLoc = (path.length > 0 && currentPosIndex < path.length)
      ? path[currentPosIndex]
      : (robotPosRef.current ? getGridPointFromVector3(robotPosRef.current, mapData.gridSize) : mapData.start);
    
    const orig = originalMissionRef.current;
    const targetLoc = (orig && orig.path.length > 0)
      ? orig.path[orig.path.length - 1]
      : (path.length > 0 ? path[path.length - 1] : mapData.start);
    
    // Save original mission if we are not already in temporary detour state
    if (robotState !== 'evading_obstacle' && robotState !== 'charging' && robotState !== 'emergency_response') {
      originalMissionRef.current = { path: [...path], index: currentPosIndex };
    }
    
    // Gather all active dynamic obstacles
    const dynamicPositions = dynamicObstaclesRef.current.map(o => o.pos);
    const allObstacles = [...(mapData.obstacles || []), ...userBlockers, obsPos, ...dynamicPositions];
    
    let intermediateTarget = null;
    for (let i = currentPosIndex; i < path.length - 1; i++) {
      if (path[i].x === path[i+1].x && path[i].y === path[i+1].y && path[i].f === path[i+1].f) {
        intermediateTarget = path[i];
        break;
      }
    }
    
    let newPath: GridPoint[] = [];
    if (intermediateTarget) {
      const fPath = calculatePath(currentLoc, intermediateTarget, allObstacles, mapData, true);
      const rPath = calculatePath(intermediateTarget, targetLoc, allObstacles, mapData, true);
      if (fPath.length > 0 && rPath.length > 0) {
        newPath = [...fPath, fPath[fPath.length - 1], ...rPath.slice(1)];
      }
    } else {
      newPath = calculatePath(currentLoc, targetLoc, allObstacles, mapData, true);
    }
    
    if (newPath.length === 0) {
      if (intermediateTarget) {
         const fPath = calculateLongPath(currentLoc, intermediateTarget, allObstacles, mapData);
         const rPath = calculateLongPath(intermediateTarget, targetLoc, allObstacles, mapData);
         if (fPath.length > 0 && rPath.length > 0) {
           newPath = [...fPath, fPath[fPath.length - 1], ...rPath.slice(1)];
         }
      } else {
         newPath = calculateLongPath(currentLoc, targetLoc, allObstacles, mapData);
      }
    }
    
    // 1. Intelligent bypass around obstacles if road network allows
    if (newPath.length > 0) {
      setPath(newPath);
      setCurrentPosIndex(0);
      setIsPlaying(true);
      addExplanation(`Dynamic obstacle detected! Smart lane bypass calculated. Navigating around obstacle...`);
      isRecalculating.current = false;
      return;
    }
    
    // 2. Dynamic obstacle encounter:
    // The robot engages its active lateral lane bypass and continues moving forward without stopping or reversing
    const isDynamic = dynamicObstaclesRef.current.some(o => 
      Math.abs(o.pos.x - obsPos.x) <= 2 && Math.abs(o.pos.y - obsPos.y) <= 2
    );
    if (isDynamic) {
      addExplanation(`Dynamic traffic approaching. Continuing forward with active lateral evasion bypass.`);
      setIsPlaying(true);
      isRecalculating.current = false;
      return;
    }

    // 3. Static roadblock: Re-route forward around the blockage (never reverse or return back)
    const forwardDetour = calculateLongPath(currentLoc, targetLoc, allObstacles, mapData);
    if (forwardDetour.length > 0) {
      addExplanation(`Static blockage on route. Forward detour calculated. Navigating forward around obstacle...`);
      setPath(forwardDetour);
      setCurrentPosIndex(0);
      setIsPlaying(true);
      isRecalculating.current = false;
      return;
    }
    
    // 4. Fallback forward route
    setIsPlaying(true);
    isRecalculating.current = false;
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
      addExplanation('Executing mission. Moving to target.');
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
      if (activeFireTargetRef.current || fireHazards.length > 0) {
        const fireLoc = activeFireTargetRef.current || (fireHazards[0]?.position);
        setIsPlaying(false);
        setRobotState('extinguishing');
        addExplanation(`🚒 ARRIVED AT FIRE SCENE! Calling Fire Extinguisher Unit & deploying extinguishing foam...`);

        // Emergency service notification / call
        try {
          fetch('/api/fire/simulate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              target_coords: fireLoc,
              robot_coords: path[path.length - 1] || fireLoc,
              hazard_type: 'fire_and_smoke',
              confidence: 0.98
            })
          }).catch(() => {});
        } catch (e) {}

        // Extinguish fire with high-pressure foam for 3.5 seconds
        setTimeout(() => {
          if (fireLoc) {
            setFireHazards(fireHazards.filter(h => Math.abs(h.position.x - fireLoc.x) > 3 || Math.abs(h.position.y - fireLoc.y) > 3));
          } else {
            setFireHazards([]);
          }

          if (activeFireIncident && onResolveIncident) {
            onResolveIncident(activeFireIncident.id);
          } else if (activeFireIncident) {
            fetch('/api/fire/resolve', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ incident_id: activeFireIncident.id })
            }).catch(() => {});
          }

          activeFireTargetRef.current = null;
          addExplanation(`✅ Fire hazard extinguished and secured! Extinguisher foam deployed successfully.`);

          setTimeout(() => {
            setRobotState('patrol');
            addExplanation(`PATROL CLEAR: Robot Patrol Unit #1 resuming autonomous campus route.`);
            if (mapData && mapData.tasks && mapData.tasks.length > 0) {
              currentTaskIndexRef.current = 0;
              const firstTask = mapData.tasks[0];
              const curLoc = path.length > 0 ? path[path.length - 1] : mapData.start;
              const resumePath = calculatePath(curLoc, firstTask.location, [...(mapData.obstacles || []), ...userBlockers], mapData);
              if (resumePath.length > 0) {
                setPath(resumePath);
                setCurrentPosIndex(0);
                setActivePathColor('#00ffff');
                setIsPlaying(true);
              }
            }
          }, 1200);
        }, 3500);
        return;
      }
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
    } else if (robotState === 'reversing') {
      setIsPlaying(false);
      setRobotState('waiting_for_clearance');
      addExplanation('Backed up safely. Waiting for obstacle to clear the road...');
      waitForObstacleToClear();
    } else if (robotState === 'waiting_for_clearance') {
      // Already awaiting clearance
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
    } else if (robotState === 'patrol') {
      if (isIdleMode) {
        setIsPlaying(false);
        setRobotState('idle');
        addExplanation('Idle mode active. Standing by at patrol waypoint.');
      } else {
        // Continuous patrol: never enter idle mode unless idle option is explicitly toggled on!
        if (mapData && mapData.rooms && mapData.rooms.length > 0) {
          const currentLoc = path.length > 0 ? path[path.length - 1] : mapData.start;
          let randomRoom = mapData.rooms[Math.floor(Math.random() * mapData.rooms.length)];
          for (let attempt = 0; attempt < 8; attempt++) {
            const door = randomRoom.door || randomRoom.start;
            if (Math.abs(door.x - currentLoc.x) + Math.abs(door.y - currentLoc.y) >= 8) break;
            randomRoom = mapData.rooms[Math.floor(Math.random() * mapData.rooms.length)];
          }
          const nextPatrolPath = calculatePath(currentLoc, randomRoom.door || randomRoom.start, [...(mapData.obstacles || []), ...userBlockers], mapData);
          if (nextPatrolPath.length > 0) {
            setPath(nextPatrolPath);
            setCurrentPosIndex(0);
            setRobotState('patrol');
            setIsPlaying(true);
            addExplanation(`Patrol waypoint reached. Patrolling towards ${randomRoom.name}.`);
            return;
          }
        }
        setRobotState('patrol');
        setIsPlaying(true);
      }
    } else {
      if (mapData && mapData.tasks && currentTaskIndexRef.current < mapData.tasks.length - 1) {
        const prevTask = mapData.tasks[currentTaskIndexRef.current];
        currentTaskIndexRef.current += 1;
        const nextTask = mapData.tasks[currentTaskIndexRef.current];
        
        addExplanation(`Reached ${prevTask.locationName}. Task complete. Next: ${nextTask.locationName}. Calculating route...`);
        
        setIsPlaying(false);
        isRecalculating.current = true;
        
        setTimeout(() => {
          const currentLoc = path.length > 0 ? path[path.length - 1] : mapData.start;
          const nextPath = calculatePath(currentLoc, nextTask.location, [...(mapData.obstacles || []), ...userBlockers], mapData);
          
          if (nextPath.length > 0) {
            setPath(nextPath);
            setCurrentPosIndex(0);
            setRobotState('mission');
            setIsPlaying(true);
            addExplanation(`Resuming mission to ${nextTask.locationName}.`);
          } else {
            addExplanation(`Route calculation to ${nextTask.locationName} failed.`);
            setRobotState('patrol');
          }
          isRecalculating.current = false;
        }, 800);
      } else {
        if (isIdleMode) {
          setIsPlaying(false);
          setRobotState('idle');
          addExplanation('Mission complete. Idle mode active, standing by.');
        } else {
          setRobotState('patrol');
          addExplanation('Mission complete. Resuming autonomous patrol.');
          if (mapData && mapData.rooms && mapData.rooms.length > 0) {
            const currentLoc = path.length > 0 ? path[path.length - 1] : mapData.start;
            const randomRoom = mapData.rooms[Math.floor(Math.random() * mapData.rooms.length)];
            const patrolPath = calculatePath(currentLoc, randomRoom.door || randomRoom.start, [...(mapData.obstacles || []), ...userBlockers], mapData);
            if (patrolPath.length > 0) {
              setPath(patrolPath);
              setCurrentPosIndex(0);
              setIsPlaying(true);
            }
          }
        }
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
        {/* Top Command Ribbon — Aerospace-grade Glassmorphic HUD */}
        <div className="absolute top-4 left-4 z-20 hidden md:flex flex-col gap-2">
          <div className="flex items-center gap-1.5 p-1.5 bg-slate-950/85 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl select-none">
            {/* View Mode Segmented Switch */}
            <div className="flex items-center bg-white/5 p-0.5 rounded-xl border border-white/10">
              <button
                onClick={() => setIsMapView(false)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  !isMapView
                    ? 'bg-cyan-500 text-slate-950 shadow-[0_0_12px_rgba(6,182,212,0.5)]'
                    : 'text-gray-400 hover:text-white'
                }`}
                title="3D Perspective View"
              >
                <Compass className="w-3.5 h-3.5" />
                <span>3D View</span>
              </button>
              <button
                onClick={() => setIsMapView(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  isMapView
                    ? 'bg-cyan-500 text-slate-950 shadow-[0_0_12px_rgba(6,182,212,0.5)]'
                    : 'text-gray-400 hover:text-white'
                }`}
                title="2D Top-Down Tactical Map"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>2D Map</span>
              </button>
            </div>

            <div className="h-5 w-px bg-white/10 mx-0.5" />

            {/* Follow Robot Mode */}
            <button
              onClick={() => {
                setIsFollowing(!isFollowing);
                if (!isFollowing) setIsFPV(false);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                isFollowing
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_14px_rgba(16,185,129,0.3)]'
                  : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/10 hover:text-white'
              }`}
              title="Lock 3rd-Person Follow Camera to Robot Navigation"
            >
              <Navigation className={`w-3.5 h-3.5 ${isFollowing ? 'text-emerald-400 animate-pulse' : 'text-gray-400'}`} />
              <span>Follow Unit</span>
              {isFollowing && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping ml-0.5" />}
            </button>

            {/* Robot Eyes (1st Person FPV) Mode */}
            <button
              onClick={() => {
                setIsFPV(!isFPV);
                if (!isFPV) setIsFollowing(false);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                isFPV
                  ? 'bg-cyan-500/25 text-cyan-300 border-cyan-500/50 shadow-[0_0_14px_rgba(6,182,212,0.4)]'
                  : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/10 hover:text-white'
              }`}
              title="Switch Main View to 1st Person Robot Eyes (FPV)"
            >
              <Eye className={`w-3.5 h-3.5 ${isFPV ? 'text-cyan-400 animate-pulse' : 'text-gray-400'}`} />
              <span>Robot Eyes</span>
              {isFPV && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping ml-0.5" />}
            </button>

            {/* Recentre Camera */}
            <button
              onClick={() => setTriggerReset(true)}
              className="p-2 rounded-xl text-gray-300 hover:text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
              title="Recentre Camera View"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            {/* Day / Night Vision Toggle */}
            <button
              onClick={() => setIsNight(!isNight)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                isNight
                  ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 shadow-[0_0_12px_rgba(99,102,241,0.25)]'
                  : 'bg-amber-500/15 text-amber-300 border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
              }`}
              title={isNight ? 'Switch to Daylight Campus' : 'Switch to Nocturnal Night-Vision'}
            >
              {isNight ? <Moon className="w-3.5 h-3.5 text-indigo-300" /> : <Sun className="w-3.5 h-3.5 text-amber-300" />}
              <span className="text-[11px]">{isNight ? 'Night' : 'Day'}</span>
            </button>

            {/* Robot Vision FPV PIP Button */}
            <button
              onClick={() => setShowRobotVisionPIP(!showRobotVisionPIP)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                showRobotVisionPIP
                  ? 'bg-cyan-500/25 text-cyan-300 border-cyan-500/50 shadow-[0_0_14px_rgba(6,182,212,0.3)]'
                  : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/10 hover:text-white'
              }`}
              title="Toggle Robot Vision Front-Facing Camera"
            >
              <Eye className={`w-3.5 h-3.5 ${showRobotVisionPIP ? 'text-cyan-400 animate-pulse' : 'text-gray-400'}`} />
              <span className="text-[11px]">Vision PIP</span>
              {showRobotVisionPIP && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping ml-0.5" />}
            </button>

            {/* 3D Campus Labels Toggle */}
            <button
              onClick={() => setShowBuildingLabels(!showBuildingLabels)}
              className={`p-2 rounded-xl text-xs font-bold transition-all border ${
                showBuildingLabels
                  ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                  : 'bg-white/5 text-gray-400 border-white/10 hover:text-white'
              }`}
              title={showBuildingLabels ? 'Hide 3D Building Labels' : 'Show 3D Building Labels'}
            >
              {showBuildingLabels ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>

            <div className="h-5 w-px bg-white/10 mx-0.5" />

            {/* Obstacle Stepper Pill */}
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl text-xs font-mono bg-white/5 text-gray-300 border border-white/10">
              <Car className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-[11px] text-gray-400 font-sans">Obstacles:</span>
              <span className="text-cyan-300 font-bold font-mono">{dynamicObstacleCount}</span>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => handleUpdateObstacleCount(dynamicObstacleCount - 1)}
                  className="w-4 h-4 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded text-white text-xs font-bold transition-colors cursor-pointer"
                  title="Decrease Obstacles"
                >
                  -
                </button>
                <button
                  onClick={() => handleUpdateObstacleCount(dynamicObstacleCount + 1)}
                  className="w-4 h-4 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded text-white text-xs font-bold transition-colors cursor-pointer"
                  title="Increase Obstacles"
                >
                  +
                </button>
              </div>
            </div>

            {/* Live Robot Telemetry Pill */}
            <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-xl text-[11px] font-mono bg-white/5 border border-white/10 text-gray-400">
              <span className="text-gray-500">POS:</span>
              <span className="text-cyan-300 font-bold">
                {robotPosRef.current ? `${Math.round(robotPosRef.current.x)}, ${Math.round(robotPosRef.current.z)}` : '0, 0'}
              </span>
              <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider ${
                robotState === 'emergency_response' || robotState === 'extinguishing'
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-emerald-500/20 text-emerald-400'
              }`}>
                {robotState.replace('_', ' ')}
              </span>
            </div>

            <div className="h-5 w-px bg-white/10 mx-0.5" />

            {/* CTR Terminal Trigger */}
            <button
              onClick={() => setIsCTROpen(!isCTROpen)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all border ${
                isCTROpen
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/60 shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                  : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/10 hover:text-white'
              }`}
              title="Autonomous Robot Terminal Console"
            >
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
              <span>CTR Console</span>
            </button>

            {/* AI Reasoning Log Dropdown Trigger */}
            <div className="relative">
              <button
                onClick={() => setShowReasoningLog(!showReasoningLog)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                  showReasoningLog
                    ? 'bg-cyan-600/30 text-cyan-300 border-cyan-500/50 shadow-[0_0_12px_rgba(8,145,178,0.3)]'
                    : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/10 hover:text-white'
                }`}
                title="AI Reasoning Log"
              >
                <ShieldAlert className={`w-3.5 h-3.5 ${showReasoningLog ? 'text-cyan-300' : 'text-cyan-400'}`} />
                <span>Reasoning</span>
                {aiExplanations.length > 0 && (
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                )}
              </button>

              {/* Reasoning Log Popover */}
              {showReasoningLog && (
                <div className="absolute top-full left-0 mt-2 w-72 bg-slate-950/95 backdrop-blur-xl border border-white/15 rounded-2xl shadow-2xl p-3.5 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-cyan-400" />
                      AI Decision Matrix
                    </span>
                    <span className="text-[9px] font-mono text-gray-400">{aiExplanations.length} records</span>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                    {aiExplanations.map((exp, i) => (
                      <div
                        key={i}
                        className={`text-[11px] leading-relaxed p-2.5 rounded-xl border transition-all ${
                          i === 0
                            ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-100 shadow-[0_0_10px_rgba(6,182,212,0.1)]'
                            : 'bg-white/5 border-white/5 text-gray-400'
                        }`}
                      >
                        {exp}
                      </div>
                    ))}
                    {aiExplanations.length === 0 && (
                      <div className="text-xs text-gray-500 text-center italic py-4">No AI events recorded yet.</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Fullscreen Button */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 rounded-xl text-gray-300 hover:text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
        {isPlacingBlocker && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 bg-orange-950/90 border border-orange-500/60 text-orange-200 px-4 py-2 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-2.5 text-xs font-medium pointer-events-none select-none">
            <Construction className="w-4 h-4 text-orange-400 shrink-0" />
            <span><strong className="text-white">Left-Click:</strong> Place Blocker &nbsp;•&nbsp; <strong className="text-white">Right-Click:</strong> Remove Blocker</span>
          </div>
        )}
        {isPlacingFire && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 bg-red-950/90 border border-red-500/60 text-red-200 px-4 py-2 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-2.5 text-xs font-medium pointer-events-none select-none animate-pulse">
            <Flame className="w-4 h-4 text-orange-400 shrink-0" />
            <span><strong className="text-white">Left-Click Map:</strong> Deploy Simulated Fire Hazard to Test AI Vision Detection</span>
          </div>
        )}
        <Canvas shadows gl={{ antialias: true }} dpr={[1, 2]} onContextMenu={(e) => e.preventDefault()}>
          {/* Sky background from real time */}
          <color attach="background" args={['#000000']} />
          {/* Camera — adjusted for a clean, isometric-like default view */}
          {isMapView ? (
            <OrthographicCamera makeDefault position={[0, 100, 0]} zoom={4} near={0.1} far={2000} />
          ) : (
            <PerspectiveCamera makeDefault position={[gridSize.x * 0.7, gridSize.y * 0.7, gridSize.y * 0.9]} fov={50} near={0.5} far={2000} />
          )}
          {/* Lighting — adapts to day/night with vibrant visibility */}
          <ambientLight intensity={isNight ? 0.45 : 0.9} color={isNight ? '#c7d2fe' : '#ffffff'} />
          <directionalLight
            position={isNight ? [-30, 40, -30] : [40, 60, 40]}
            intensity={isNight ? 0.6 : 2.2}
            color={isNight ? '#a5b4fc' : '#ffffff'}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-near={0.5}
            shadow-camera-far={200}
            shadow-camera-left={-80}
            shadow-camera-right={80}
            shadow-camera-top={80}
            shadow-camera-bottom={-80}
          />
          {/* Fill lights */}
          <directionalLight position={[-40, 30, -40]} intensity={0.6} color="#38bdf8" />
          {isNight && <pointLight position={[-20, 25, -15]} intensity={1.2} color="#bfdbfe" />}
          {!isNight && <pointLight position={[0, 15, 0]} intensity={0.8} color="#60a5fa" />}
          <CameraController 
            isFollowing={isFollowing} 
            isFPV={isFPV}
            robotPosRef={robotPosRef} 
            robotRotRef={robotRotRef} 
            controlsRef={controlsRef} 
            triggerReset={triggerReset}
            onResetDone={() => setTriggerReset(false)}
            gridSize={gridSize}
            isMapView={isMapView}
          />
          <RobotVisionBroadcaster
            robotPosRef={robotPosRef}
            robotRotRef={robotRotRef}
            robotGroupRef={robotGroupRef}
            speed={isPlaying ? (speedLimit / 50) * 2.5 : 0}
            battery={battery}
            robotState={robotState}
            fireHazards={fireHazards}
            dynamicObstaclesRef={dynamicObstaclesRef}
            userBlockers={userBlockers}
            isNight={isNight}
            gridSize={gridSize}
            getGridPositionFn={getGridPosition}
          />
          <OrbitControls
            ref={controlsRef}
            enabled={!isFollowing && !isFPV}
            enableDamping
            enablePan={false}
            dampingFactor={0.05}
            target={[0, 0, 0]}
            maxPolarAngle={Math.PI / 2.1}
            minDistance={8}
            maxDistance={gridSize.y * 1.5}
          />
          
          {/* Master Procedural Campus Ground, Asphalt Roadways, Sidewalks & Streetlights */}
          <CampusRoadsAndGround 
            gridSize={gridSize}
            roads={mapData.roads || []}
            isNight={isNight}
            isTargeting={isEmergencyTargeting || isPlacingBlocker || isPlacingCrowd || isPlacingFire} 
            onMapClick={(p) => {
              const gridP = getGridPointFromVector3(p, gridSize);
              if (isPlacingFire) {
                handleDeployFireAt(gridP);
                return;
              }
              if (isPlacingCrowd) {
                setCrowds(prev => [...prev, gridP]);
                handleCrowdEmergency(gridP);
                setIsPlacingCrowd(false);
                return;
              }
              if (isPlacingBlocker) {
                // LEFT CLICK: Always place road blocker (never toggle off)
                setUserBlockers(prev => {
                  const roads = mapData?.roads || [];
                  const toBlock = getRoadBlockGroup(gridP, roads);
                  const newBlockers = [...prev];
                  let added = false;
                  toBlock.forEach(cs => {
                    if (!newBlockers.some(b => b.x === cs.x && b.y === cs.y && b.f === cs.f)) {
                      newBlockers.push(cs);
                      added = true;
                    }
                  });
                  if (added) {
                    addExplanation("Road blocker deployed on route.");
                  }
                  return newBlockers;
                });
                return;
              }
              setIsEmergencyTargeting(false);
              document.body.style.cursor = 'auto';
              handleEmergencyCall(gridP);
            }} 
            onMapRightClick={(p) => {
              const gridP = getGridPointFromVector3(p, gridSize);
              if (isPlacingBlocker) {
                // RIGHT CLICK: Remove road blocker at clicked point
                handleRemoveBlockerAt(gridP);
              }
            }}
          />

          {/* High-Fidelity Procedural Campus Architecture */}
          {rooms?.map((room: Room) => {
            const width = (room.end.x - room.start.x + 1) * 0.75;
            const depth = (room.end.y - room.start.y + 1) * 0.75;
            const type = room.type || '';
            const nameLow = room.name.toLowerCase();

            // Accurate architectural scaling tailored to faculty typology
            let height = 5.2;
            if (type === 'admin') height = 7.5;
            else if (type === 'library') height = 6.2;
            else if (type === 'auditorium') height = 6.8;
            else if (type === 'hostel') height = 6.5;
            else if (nameLow.includes('computer') || nameLow.includes('innovation')) height = 5.8;
            else if (type === 'sports') height = nameLow.includes('stadium') ? 6.5 : 0.4;
            else if (type === 'park') height = 0.4;
            else if (type === 'food') height = 3.8;
            else if (type === 'medical') height = 4.8;
            else if (type === 'security') height = 2.8;
            else if (type === 'utility') height = 4.2;

            const x = (room.start.x + room.end.x) / 2 - gridSize.x / 2;
            const z = (room.start.y + room.end.y) / 2 - gridSize.y / 2;
            const isSelected = selectedRoom?.id === room.id;

            return (
              <group 
                key={room.id} 
                position={[x, 0, z]} 
                onClick={(e) => { e.stopPropagation(); setSelectedRoom(room); }}
              >
                <BuildingModel room={room} width={width} height={height} depth={depth} />
                {showBuildingLabels && (
                  <Building3DLabel 
                    room={room} 
                    height={height} 
                    isSelected={isSelected} 
                    onClick={() => setSelectedRoom(room)} 
                  />
                )}
              </group>
            );
          })}
          <BlockersRender
            blockers={userBlockers}
            gridSize={gridSize}
            roads={mapData.roads || []}
            onRemoveBlockerGroup={handleRemoveBlockerGroup}
            isPlacingBlocker={isPlacingBlocker}
          />
          <CrowdsRender crowds={crowds} gridSize={gridSize} />
          {/* 3D Animated Simulated Fire Hazards */}
          {fireHazards.map((hazard) => (
            <FireSimulationNode
              key={hazard.id}
              position={hazard.position}
              gridSize={gridSize}
              intensity={hazard.intensity}
              onRemove={() => handleRemoveFireHazard(hazard.id)}
            />
          ))}
          <PoliceVehicle policeState={policeState} policeStateRef={policeStateRef} gridSize={gridSize} isMapView={isMapView} onReachDestination={handlePoliceReachDestination} />

          {/* Starting Gate */}
          {mapData.start && (
             <SciFiGate position={getGridPosition({ x: 62, y: 86, f: 0 }, gridSize, 0)} scale={3} />
          )}

          {/* Active Path */}
          {path.length > 0 && (
            <PathLine path={path} currentIndex={currentPosIndex} gridSize={gridSize} isMapView={isMapView} color={activePathColor} opacity={0.9} />
          )}
          
          {dynamicObstacles.map((obs, idx) => (
            <MovingEntity 
              key={obs.id || idx} 
              obstacle={obs} 
              gridSize={gridSize} 
              isMapView={isMapView} 
              robotPosRef={robotPosRef}
              allObstaclesRef={dynamicObstaclesRef}
              robotStateRef={robotStateRef}
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
              speed={(robotState === 'emergency_response' ? 25 : (robotState === 'reversing' ? 6 : 10)) * (speedLimit / 50)} 
              dynamicObstaclesRef={dynamicObstaclesRef}
              userBlockers={userBlockers}
              onReachNode={handleReachNode}
              onMissionComplete={handleMissionComplete}
              onObstacleDetected={handleObstacleDetected}
              robotPosRef={robotPosRef}
              robotRotRef={robotRotRef}
              robotGroupRef={robotGroupRef}
              isFPV={isFPV}
              isEmergency={robotState === 'emergency_response' || robotState === 'emergency_to_ctr' || robotState === 'ctr_to_emergency' || Boolean(activeFireIncident && activeFireIncident.status === 'ACTIVE_EMERGENCY')}
              robotState={robotState}
            />
          )}
        </Canvas>

        {/* Desktop Robot Vision Picture-in-Picture (PIP) Window */}
        {showRobotVisionPIP && (
          <RobotVisionPIP
            onClose={() => setShowRobotVisionPIP(false)}
            isFPV={isFPV}
            onToggleFPV={() => {
              setIsFPV(!isFPV);
              if (!isFPV) setIsFollowing(false);
            }}
            isNight={isNight}
          />
        )}
      </div>

      {/* Ground Control Station (GCS) / CTR Terminal Overlay */}
      {isCTROpen && (
        <div className="absolute top-16 left-4 w-96 bg-slate-950/92 backdrop-blur-2xl border border-cyan-500/30 rounded-2xl hidden md:flex flex-col z-[100] overflow-hidden shadow-[0_0_35px_rgba(6,182,212,0.2)] h-[460px] animate-in fade-in duration-200">
          {/* Terminal Title Bar */}
          <div className="px-3.5 py-2.5 border-b border-white/10 bg-slate-900/80 flex justify-between items-center select-none">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <div>
                <h3 className="font-mono font-bold text-xs text-white tracking-wider flex items-center gap-1.5">
                  CTR TERMINAL <span className="text-[10px] text-cyan-400 font-normal">// ROS2 GCS</span>
                </h3>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                ONLINE
              </span>
              <button 
                onClick={() => setIsCTROpen(false)} 
                className="w-5 h-5 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors text-xs font-bold"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Quick Command Presets */}
          <div className="px-3 py-1.5 border-b border-white/5 bg-black/40 flex items-center gap-1.5 overflow-x-auto custom-scrollbar select-none text-[10px] font-mono">
            <span className="text-gray-500 text-[9px]">CMD:</span>
            {[
              { label: '/patrol', cmd: 'patrol' },
              { label: '/home', cmd: 'home' },
              { label: '/status', cmd: 'status' },
              { label: '/reset', cmd: 'reset' },
              { label: '/clear', cmd: 'clear' },
            ].map(c => (
              <button
                key={c.label}
                onClick={() => executeCommand(c.cmd)}
                className="px-2 py-0.5 rounded bg-white/5 hover:bg-cyan-500/20 text-gray-400 hover:text-cyan-300 border border-white/10 hover:border-cyan-500/40 transition-colors whitespace-nowrap"
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Message Output Feed */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 font-mono text-xs custom-scrollbar">
            {ctrMessages.map((m, i) => (
              <div key={i} className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}>
                <span className="text-[9px] text-gray-500 mb-0.5 px-1 font-mono">
                  {m.sender === 'user' ? 'OPERATOR' : 'ROBOT_UNIT_01'}
                </span>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                  m.sender === 'user' 
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/30' 
                    : 'bg-white/5 text-gray-200 border border-white/10'
                }`}>
                  {m.text}
                </div>
              </div>
            ))}
          </div>

          {/* Command Input Field */}
          <div className="p-2.5 border-t border-white/10 bg-slate-900/60">
            <div className="flex items-center gap-1.5 bg-black/50 border border-white/15 focus-within:border-cyan-500/60 rounded-xl px-3 py-1.5 transition-colors">
              <span className="text-cyan-400 font-mono text-xs font-bold">unit01:~$</span>
              <input 
                type="text" 
                value={ctrInput}
                onChange={e => setCtrInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCTRSubmit(e as any); } }}
                placeholder="Type command (/home, patrol, clear)..."
                className="flex-1 bg-transparent text-xs text-white focus:outline-none font-mono placeholder:text-gray-600"
              />
              <button 
                onClick={handleCTRSubmit as any}
                className="p-1 rounded-lg text-cyan-400 hover:text-white hover:bg-cyan-500/20 transition-colors"
                title="Send Command"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Control Center (Mission Operations Dashboard) ── */}
      <div className={`absolute right-4 top-4 bottom-4 bg-slate-950/85 backdrop-blur-2xl border border-white/10 rounded-2xl hidden md:flex flex-col z-[100] shadow-2xl text-gray-200 pointer-events-auto transition-all duration-300 ${isCCMinimized ? 'w-14 overflow-hidden' : 'w-[370px] overflow-hidden'}`}>
        {/* Header Bar */}
        <div className="p-3.5 border-b border-white/10 bg-black/40 flex-none flex justify-between items-center">
          {!isCCMinimized && (
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-xs uppercase tracking-wider text-white">Campus Mission Control</h3>
                <span className="text-[10px] text-gray-400 font-mono">Autonomous Unit Operations</span>
              </div>
            </div>
          )}
          <div className={`flex items-center gap-1.5 ${isCCMinimized ? 'w-full justify-center' : ''}`}>
            {!isCCMinimized && (
              <button 
                onClick={() => setIsCTROpen(!isCTROpen)}
                className={`p-1.5 rounded-lg border transition-all ${isCTROpen ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'}`}
                title="Toggle CTR Console"
              >
                <Terminal className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setIsCCMinimized(!isCCMinimized)}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-gray-400 hover:text-white transition-colors"
              title={isCCMinimized ? 'Expand Control Center' : 'Minimize Control Center'}
            >
              {isCCMinimized ? <Maximize className="w-4 h-4" /> : <Minimize className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Body — hidden when minimized */}
        {!isCCMinimized && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Segmented Tabs */}
          <div className="flex border-b border-white/10 bg-black/50 p-1 gap-1 shrink-0">
            <button 
              onClick={() => setActiveCCTab('dashboard')} 
              className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                activeCCTab === 'dashboard' 
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.2)]' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Telemetry</span>
            </button>
            <button 
              onClick={() => setActiveCCTab('tools')} 
              className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                activeCCTab === 'tools' 
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.2)]' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Hazards</span>
            </button>
            <button 
              onClick={() => setActiveCCTab('locations')} 
              className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                activeCCTab === 'locations' 
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.2)]' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>Directory</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar relative">
            {/* ── DASHBOARD TAB ── */}
            {activeCCTab === 'dashboard' && (
              <div className="p-4 space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                    Live Robot Telemetry
                  </h4>
                  <div className="flex gap-1.5">
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
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all border ${
                        isIdleMode 
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.3)]' 
                          : 'bg-white/5 text-gray-400 border-white/10 hover:text-white'
                      }`}
                      title="Toggle Idle / Park Mode"
                    >
                      <Pause className="w-3 h-3" />
                      <span>{isIdleMode ? 'RESUME' : 'IDLE'}</span>
                    </button>
                    <button 
                      onClick={togglePower}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border flex items-center gap-1 ${
                        isOn 
                          ? 'bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/25' 
                          : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                      }`}
                    >
                      <Power className="w-3 h-3" />
                      <span>{isOn ? 'HALT' : 'POWER'}</span>
                    </button>
                  </div>
                </div>
                
                {/* Telemetry Stat Cards Grid */}
                <div className="grid grid-cols-2 gap-2.5">
                  {/* Battery Cell */}
                  <div className="bg-white/5 border border-white/10 rounded-xl p-3 shadow-inner">
                    <div className="flex items-center justify-between text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                      <span>BATTERY</span>
                      <span className={battery > 50 ? 'text-emerald-400' : battery > 20 ? 'text-amber-400' : 'text-red-400 font-bold animate-pulse'}>
                        {battery}%
                      </span>
                    </div>
                    <div className="h-2 bg-black/60 rounded-full overflow-hidden p-0.5 border border-white/5">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          battery > 50 ? 'bg-gradient-to-r from-emerald-500 to-cyan-400' : battery > 20 ? 'bg-amber-400' : 'bg-red-500'
                        }`} 
                        style={{ width: `${battery}%` }} 
                      />
                    </div>
                  </div>

                  {/* Operational Status */}
                  <div className="bg-white/5 border border-white/10 rounded-xl p-3 shadow-inner flex flex-col justify-between">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1">UNIT STATE</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${
                        robotState === 'emergency_response' || robotState === 'extinguishing'
                          ? 'bg-red-400 animate-ping'
                          : robotState === 'patrol'
                          ? 'bg-cyan-400 animate-pulse'
                          : 'bg-emerald-400'
                      }`} />
                      <span className={`text-xs font-black uppercase tracking-wider truncate ${
                        robotState === 'charging' ? 'text-yellow-400' : 
                        robotState === 'patrol' ? 'text-cyan-400' : 
                        robotState === 'mission' ? 'text-emerald-400' : 
                        robotState === 'emergency_response' || robotState === 'extinguishing' ? 'text-red-400 font-bold' : 
                        'text-gray-300'
                      }`}>
                        {robotState.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  {/* Waypoint Distance */}
                  <div className="bg-white/5 border border-white/10 rounded-xl p-3 shadow-inner">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1">REMAINING DIST</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-base font-black text-white font-mono">
                        {path.length > 0 ? Math.max(0, path.length - currentPosIndex) : 0}
                      </span>
                      <span className="text-[10px] font-bold text-gray-500">meters</span>
                    </div>
                  </div>

                  {/* Estimated Arrival */}
                  <div className="bg-white/5 border border-white/10 rounded-xl p-3 shadow-inner">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1">ESTIMATED ETA</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-base font-black text-white font-mono">
                        {path.length > 0 ? Math.ceil((path.length - currentPosIndex) * 0.4) : 0}
                      </span>
                      <span className="text-[10px] font-bold text-gray-500">seconds</span>
                    </div>
                  </div>
                </div>

                {/* Primary Mission Dispatch Actions */}
                <div className="flex gap-2.5 pt-1">
                  <button
                    onClick={() => startSimulation()}
                    disabled={isPlaying || (path.length > 0 && currentPosIndex >= path.length - 1)}
                    className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_25px_rgba(6,182,212,0.5)] active:scale-[0.98]"
                  >
                    <Play className="w-4 h-4 fill-slate-950" />
                    <span>{isPlaying ? 'EXECUTING ROUTE...' : 'EXECUTE MISSION'}</span>
                  </button>
                  <button
                    onClick={resetSimulation}
                    className="p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors group"
                    title="Reset Robot Coordinates"
                  >
                    <RotateCcw className="w-4 h-4 text-gray-400 group-hover:text-white group-hover:-rotate-90 transition-all duration-300" />
                  </button>
                </div>
              </div>
            )}

            {/* ── TOOLS & HAZARDS TAB ── */}
            {activeCCTab === 'tools' && (
              <div className="p-4 space-y-4 animate-in fade-in duration-300">
                {/* AI FIRE EMERGENCY & SURVEILLANCE CONTROL PANEL */}
                <div className="bg-[#0b1329]/95 border border-cyan-500/30 rounded-2xl p-4 space-y-3.5 shadow-[0_0_25px_rgba(6,182,212,0.15)] relative overflow-hidden backdrop-blur-md">
                  {/* Ambient Cybernetic Glow */}
                  <div className={`absolute -top-12 -right-12 w-36 h-36 rounded-full blur-3xl pointer-events-none transition-all duration-700 ${
                    activeFireIncident && activeFireIncident.status !== 'RESOLVED'
                      ? 'bg-red-500/25'
                      : robotState === 'extinguishing'
                      ? 'bg-amber-500/20'
                      : 'bg-cyan-500/10'
                  }`} />

                  {/* Header Row */}
                  <div className="flex items-start justify-between gap-2 relative z-10">
                    <div className="flex items-center gap-2.5">
                      <div className={`p-2 rounded-xl border transition-all ${
                        activeFireIncident && activeFireIncident.status !== 'RESOLVED'
                          ? 'bg-red-500/20 text-red-400 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.5)]'
                          : robotState === 'extinguishing'
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.4)]'
                          : 'bg-cyan-500/15 text-cyan-400 border-cyan-500/40'
                      }`}>
                        <Flame className={`w-4 h-4 ${activeFireIncident && activeFireIncident.status !== 'RESOLVED' ? 'animate-bounce' : ''}`} />
                      </div>
                      <div>
                        <h3 className="font-black uppercase tracking-wider text-xs text-white">AI FIRE SURVEILLANCE</h3>
                        <p className="text-[10px] text-gray-400 font-mono tracking-tight">YOLOv8 Real-Time OpenCV Vision</p>
                      </div>
                    </div>

                    {/* Status Pill Badge */}
                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-mono font-black tracking-wider uppercase border shrink-0 transition-all ${
                      activeFireIncident && activeFireIncident.status !== 'RESOLVED'
                        ? 'bg-red-500/20 text-red-400 border-red-500/60 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.4)]'
                        : robotState === 'extinguishing'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 animate-pulse shadow-[0_0_15px_rgba(245,158,11,0.4)]'
                        : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
                    }`}>
                      {activeFireIncident && activeFireIncident.status !== 'RESOLVED'
                        ? 'EMERGENCY ALERT'
                        : robotState === 'extinguishing'
                        ? 'DISPENSING FOAM'
                        : 'SURVEILLANCE OK'}
                    </span>
                  </div>

                  {/* Primary Action Button: Map Pin Fire */}
                  <div className="relative z-10">
                    <button
                      onClick={() => {
                        if (onTogglePlaceFire) onTogglePlaceFire();
                        else setInternalIsPlacingFire(!internalIsPlacingFire);
                      }}
                      className={`w-full py-2.5 px-3 border rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 active:scale-[0.98] ${
                        isPlacingFire
                          ? 'bg-orange-500/25 border-orange-500 text-orange-300 shadow-[0_0_20px_rgba(249,115,22,0.4)] animate-pulse'
                          : 'bg-white/5 border-white/10 hover:border-cyan-500/50 text-gray-300 hover:text-white'
                      }`}
                    >
                      <Crosshair className="w-4 h-4 text-cyan-400" />
                      <span>{isPlacingFire ? 'Click 3D Map to Deploy Fire...' : 'Map Pin Fire'}</span>
                    </button>
                  </div>

                  {/* Active Emergency Incident Banner */}
                  {activeFireIncident && activeFireIncident.status !== 'RESOLVED' && (
                    <div className="p-3 rounded-xl bg-red-950/70 border border-red-500/50 text-xs space-y-2 animate-in fade-in duration-300 shadow-[0_0_20px_rgba(239,68,68,0.2)]">
                      <div className="flex items-center justify-between text-red-300 font-bold">
                        <span className="flex items-center gap-1.5 truncate">
                          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 animate-bounce" />
                          <span className="truncate">{activeFireIncident.location.building_name}</span>
                        </span>
                        <span className="text-[9px] px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full border border-red-500/40 font-mono uppercase">
                          {activeFireIncident.status}
                        </span>
                      </div>
                      <div className="text-gray-400 font-mono text-[10px] flex justify-between">
                        <span>Twilio Call: <b className="text-cyan-400 font-bold">{activeFireIncident.notifications?.voice_status || 'initiated'}</b></span>
                        <span>SMS Dispatch: <b className="text-cyan-400 font-bold">{activeFireIncident.notifications?.sms_status || 'sent'}</b></span>
                      </div>
                      <div className="flex items-center justify-between text-[9px] font-mono text-gray-400 pt-0.5">
                        <span>Incident History: <b className="text-white">{incidentHistory.length} logged</b></span>
                        {activeFireIncident.acknowledgement?.is_acknowledged && (
                          <span className="text-cyan-400 font-bold">ACKNOWLEDGED</span>
                        )}
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => dispatchRobotToExtinguish(activeFireIncident.location.coordinates as GridPoint)}
                          className="flex-1 py-1.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-1 shadow-[0_0_15px_rgba(239,68,68,0.5)] active:scale-[0.98]"
                        >
                          <Flame className="w-3 h-3" />
                          Dispatch to Extinguish
                        </button>
                        {!activeFireIncident.acknowledgement?.is_acknowledged && onAcknowledgeIncident && (
                          <button
                            onClick={() => onAcknowledgeIncident(activeFireIncident.id)}
                            className="px-2.5 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 rounded-lg text-[10px] font-bold uppercase transition-all"
                          >
                            Ack
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (onResolveIncident) onResolveIncident(activeFireIncident.id);
                            else {
                              fetch('/api/fire/resolve', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ incident_id: activeFireIncident.id })
                              }).catch(() => {});
                              setFireHazards([]);
                            }
                          }}
                          className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white rounded-lg text-[10px] font-bold uppercase transition-all"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* DYNAMIC OBSTACLE DENSITY CONTROLLER */}
                <div className="bg-white/5 border border-cyan-500/30 rounded-2xl p-4 space-y-3 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400">
                        <Sliders className="w-4 h-4" />
                      </div>
                      <span className="font-bold uppercase tracking-wider text-xs text-white">Obstacle Density</span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                      {dynamicObstacleCount} Entities
                    </span>
                  </div>

                  {/* Range Slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-gray-400 font-mono">
                      <span>Clear (0)</span>
                      <span>Moderate (10)</span>
                      <span>Congested (30)</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={30}
                      step={1}
                      value={dynamicObstacleCount}
                      onChange={(e) => handleUpdateObstacleCount(Number(e.target.value))}
                      className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-white/10 rounded-lg appearance-none"
                    />
                  </div>

                  {/* Quick Preset Buttons */}
                  <div className="grid grid-cols-4 gap-1.5 pt-1">
                    {[
                      { label: '0 None', val: 0 },
                      { label: '5 Light', val: 5 },
                      { label: '10 Norm', val: 10 },
                      { label: '20 Heavy', val: 20 },
                    ].map(p => (
                      <button
                        key={p.val}
                        onClick={() => handleUpdateObstacleCount(p.val)}
                        className={`py-1 rounded-lg text-[10px] font-bold font-mono transition-all ${
                          dynamicObstacleCount === p.val 
                            ? 'bg-cyan-500 text-black shadow-[0_0_10px_rgba(6,182,212,0.4)]' 
                            : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  {/* Entity Composition Breakdown */}
                  <div className="flex items-center justify-between text-[11px] font-mono text-gray-400 border-t border-white/10 pt-2">
                    <span className="flex items-center gap-1.5">
                      <Car className="w-3.5 h-3.5 text-blue-400" />
                      <span>{dynamicObstacles.filter(o => o.type === 'car').length} Autonomous Cars</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-purple-400" />
                      <span>{dynamicObstacles.filter(o => o.type === 'person').length} Pedestrians</span>
                    </span>
                  </div>
                </div>

                {/* ROADBLOCK & OBSTRUCTION CONTROLS */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Roadblock Tools</h4>
                    {userBlockers.length > 0 && (
                      <span className="text-[10px] font-mono text-orange-400 font-bold">
                        {userBlockers.length} Active Blocker{userBlockers.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-2.5">
                    <button
                      onClick={() => {
                        setIsPlacingBlocker(!isPlacingBlocker);
                        if (!isPlacingBlocker) { setIsEmergencyTargeting(false); setIsPlacingCrowd(false); }
                      }}
                      className={`w-full p-3.5 border rounded-xl transition-all flex items-center gap-3.5 text-left ${
                        isPlacingBlocker 
                          ? 'bg-orange-500/20 text-orange-400 border-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.3)]' 
                          : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <div className={`p-2 rounded-lg ${isPlacingBlocker ? 'bg-orange-500 text-white' : 'bg-white/10'}`}>
                        <Construction className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <div className="font-bold uppercase tracking-wider text-xs">
                          {isPlacingBlocker ? 'Click on Road to Place' : 'Place Road Blocker'}
                        </div>
                        <div className="text-[10px] opacity-70 mt-0.5 font-mono">
                          {isPlacingBlocker ? 'Left-click: Add • Right-click: Remove' : 'Manually block a road segment'}
                        </div>
                      </div>
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={handleAddRandomRoadblock}
                        className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-orange-500/50 rounded-xl text-xs font-bold text-gray-300 hover:text-orange-400 transition-all flex items-center justify-center gap-1.5"
                        title="Spawn Random Roadblock"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Random Block</span>
                      </button>

                      <button
                        onClick={handleClearAllRoadblocks}
                        disabled={userBlockers.length === 0}
                        className="p-2.5 bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/40 rounded-xl text-xs font-bold text-gray-400 hover:text-red-400 disabled:opacity-30 disabled:pointer-events-none transition-all flex items-center justify-center gap-1.5"
                        title="Clear All Roadblocks"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Clear All</span>
                      </button>
                    </div>

                    <button
                      onClick={() => {
                        setIsPlacingCrowd(!isPlacingCrowd);
                        if (!isPlacingCrowd) { setIsEmergencyTargeting(false); setIsPlacingBlocker(false); }
                      }}
                      className={`w-full p-3.5 border rounded-xl transition-all flex items-center gap-3.5 text-left ${
                        isPlacingCrowd 
                          ? 'bg-purple-500/20 text-purple-400 border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.3)]' 
                          : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <div className={`p-2 rounded-lg ${isPlacingCrowd ? 'bg-purple-500 text-white' : 'bg-white/10'}`}>
                        <Users className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold uppercase tracking-wider text-xs">Place Crowd</div>
                        <div className="text-[10px] opacity-70 mt-0.5 font-mono">Trigger crowd dispersal protocol</div>
                      </div>
                    </button>

                    <button
                      onClick={() => setIsEmergencyTargeting(!isEmergencyTargeting)}
                      className={`w-full p-3.5 border rounded-xl transition-all flex items-center gap-3.5 text-left ${
                        isEmergencyTargeting 
                          ? 'bg-red-500/20 text-red-400 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)]' 
                          : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <div className={`p-2 rounded-lg ${isEmergencyTargeting ? 'bg-red-500 text-white' : 'bg-white/10'}`}>
                        <ShieldAlert className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold uppercase tracking-wider text-xs">Target Emergency</div>
                        <div className="text-[10px] opacity-70 mt-0.5 font-mono">Dispatch robot to emergency location</div>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── CAMPUS DIRECTORY TAB ── */}
            {activeCCTab === 'locations' && (
              <div className={`flex flex-col h-full animate-in fade-in duration-300 ${!isOn ? 'opacity-30 pointer-events-none grayscale' : ''}`}>
                {selectedRoom ? (
                  <div className="p-4 flex-1 overflow-y-auto space-y-4">
                    <button 
                      onClick={() => setSelectedRoom(null)} 
                      className="text-[10px] font-bold text-gray-400 hover:text-white uppercase tracking-widest flex items-center gap-1 transition-colors"
                    >
                      <span>←</span> BACK TO DIRECTORY
                    </button>
                    
                    {/* Selected Building Details Hero Card */}
                    <div className="bg-gradient-to-br from-cyan-950/40 via-slate-900/60 to-black border border-cyan-500/30 rounded-2xl p-4 shadow-xl backdrop-blur-md">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h5 className="font-black text-white text-lg tracking-wide truncate">{selectedRoom.name}</h5>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shrink-0">
                          {selectedRoom.type || 'FACULTY'}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-black/40 text-gray-300 border border-white/10">
                          Floor {selectedRoom.start.f}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-black/40 text-emerald-400 border border-emerald-500/30">
                          Clear Access
                        </span>
                      </div>
                      <div className="mt-3 pt-3 border-t border-white/10 flex justify-between text-xs text-gray-400 font-mono">
                         <span>Coordinates: <b className="text-white">({selectedRoom.door?.x ?? selectedRoom.start.x}, {selectedRoom.door?.y ?? selectedRoom.start.y})</b></span>
                         <span>Est. Occupancy: <b className="text-cyan-300">{(selectedRoom.name.length + selectedRoom.start.x) % 12 || 4}</b></span>
                      </div>
                    </div>
                    
                    {/* Quick Dispatch Grid */}
                    <div>
                      <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">Operational Dispatch</h4>
                      <div className="grid grid-cols-2 gap-2.5">
                        <button 
                          onClick={() => dispatchQuickMission('Navigate')} 
                          className="flex flex-col items-center justify-center gap-1.5 p-3.5 bg-cyan-500/10 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 rounded-xl transition-all shadow-sm hover:shadow-[0_0_15px_rgba(6,182,212,0.3)] group active:scale-[0.98]"
                        >
                          <Play className="w-5 h-5 group-hover:scale-110 transition-transform" /> 
                          <span className="text-[10px] font-bold uppercase tracking-wider text-center">Navigate</span>
                        </button>
                        <button 
                          onClick={() => dispatchQuickMission('Deliver Documents')} 
                          className="flex flex-col items-center justify-center gap-1.5 p-3.5 bg-blue-500/10 hover:bg-blue-500/25 text-blue-300 border border-blue-500/30 rounded-xl transition-all shadow-sm hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] group active:scale-[0.98]"
                        >
                          <Crosshair className="w-5 h-5 group-hover:scale-110 transition-transform" /> 
                          <span className="text-[10px] font-bold uppercase tracking-wider text-center">Docs</span>
                        </button>
                        <button 
                          onClick={() => setModalType('food')} 
                          className="flex flex-col items-center justify-center gap-1.5 p-3.5 bg-amber-500/10 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-xl transition-all shadow-sm hover:shadow-[0_0_15px_rgba(245,158,11,0.3)] group active:scale-[0.98]"
                        >
                          <Utensils className="w-5 h-5 group-hover:scale-110 transition-transform" /> 
                          <span className="text-[10px] font-bold uppercase tracking-wider text-center">Food</span>
                        </button>
                        <button 
                          onClick={() => dispatchQuickMission('Clean Room')} 
                          className="flex flex-col items-center justify-center gap-1.5 p-3.5 bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 rounded-xl transition-all shadow-sm hover:shadow-[0_0_15px_rgba(16,185,129,0.3)] group active:scale-[0.98]"
                        >
                          <Bot className="w-5 h-5 group-hover:scale-110 transition-transform" /> 
                          <span className="text-[10px] font-bold uppercase tracking-wider text-center">Clean</span>
                        </button>
                        <button 
                          onClick={() => setModalType('medical')} 
                          className="flex flex-col items-center justify-center gap-1.5 p-3.5 bg-rose-500/10 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 rounded-xl transition-all shadow-sm hover:shadow-[0_0_15px_rgba(244,63,94,0.3)] group active:scale-[0.98]"
                        >
                          <Cross className="w-5 h-5 group-hover:scale-110 transition-transform" /> 
                          <span className="text-[10px] font-bold uppercase tracking-wider text-center">Medical</span>
                        </button>
                        <button 
                          onClick={() => handleEmergencyCall(selectedRoom.door || selectedRoom.start)} 
                          className="flex flex-col items-center justify-center gap-1.5 p-3.5 bg-red-500/15 hover:bg-red-500/30 text-red-400 border border-red-500/40 rounded-xl transition-all shadow-sm hover:shadow-[0_0_15px_rgba(239,68,68,0.4)] group active:scale-[0.98]"
                        >
                          <ShieldAlert className="w-5 h-5 group-hover:scale-110 transition-transform" /> 
                          <span className="text-[10px] font-bold uppercase tracking-wider text-center">SOS Priority</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 flex-1 flex flex-col min-h-0 space-y-3">
                    {/* Search Field */}
                    <div className="relative shrink-0">
                      <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={buildingSearchTerm}
                        onChange={(e) => setBuildingSearchTerm(e.target.value)}
                        placeholder="Search faculties, halls & zones..."
                        className="w-full bg-black/40 border border-white/10 focus:border-cyan-500/60 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder:text-gray-500 focus:outline-none transition-colors"
                      />
                      {buildingSearchTerm && (
                        <button
                          onClick={() => setBuildingSearchTerm('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Filtered Building List */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-2">
                      {(rooms || [])
                        .filter(r => !buildingSearchTerm || r.name.toLowerCase().includes(buildingSearchTerm.toLowerCase()) || (r.type && r.type.toLowerCase().includes(buildingSearchTerm.toLowerCase())))
                        .map(room => (
                          <button 
                            key={room.id}
                            onClick={() => setSelectedRoom(room)}
                            className="w-full text-left p-3 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 hover:border-cyan-500/30 text-gray-300 hover:text-white transition-all text-xs flex justify-between items-center group shadow-sm"
                          >
                            <div className="truncate mr-2">
                              <span className="font-semibold block truncate text-white">{room.name}</span>
                              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-mono">
                                {room.type || 'FACULTY'}
                              </span>
                            </div>
                            <span className="text-[10px] text-cyan-400/80 group-hover:text-cyan-300 flex-shrink-0 font-mono font-bold px-2 py-0.5 rounded bg-black/40 border border-white/10">
                              FL {room.start.f}
                            </span>
                          </button>
                        ))}
                      {(rooms || []).filter(r => !buildingSearchTerm || r.name.toLowerCase().includes(buildingSearchTerm.toLowerCase())).length === 0 && (
                        <div className="text-center py-6 text-xs text-gray-500 italic">
                          No matching buildings found.
                        </div>
                      )}
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
