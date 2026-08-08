import React, { useEffect, useRef, useState, useMemo } from 'react';
import { DetailedRobot } from './DetailedRobot';
import type { MapData, GridPoint, Room } from '../types';
import { calculatePath, calculateLongPath } from '../utils/simulationEngine';
import { Play, RotateCcw, Activity, ShieldAlert, Crosshair, Maximize, Minimize, Bot, Power, Send, Construction, Pause } from 'lucide-react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  OrbitControls,
  Box,
  Line,
  Plane,
  OrthographicCamera,
  PerspectiveCamera,
  Html,
  Instances,
  Instance,
  Sphere,
  Cylinder,
} from '@react-three/drei';
import * as THREE from 'three';

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
};

export type RobotState = 'idle' | 'mission' | 'patrol' | 'charging' | 'emergency_response' | 'evading_obstacle' | 'returning_home' | 'off';


const CameraController = ({ isFollowing, robotPosRef, controlsRef, triggerReset, onResetDone, gridSize, isMapView }: any) => {
  const { camera } = useThree();
  useFrame(() => {
    if (triggerReset) {
      if (controlsRef.current) {
        controlsRef.current.target.set(0, 0.5, 0);
      }
      if (isMapView) {
        camera.position.set(0, 100, 0);
        if ((camera as THREE.OrthographicCamera).zoom !== undefined) {
          (camera as THREE.OrthographicCamera).zoom = 6;
        }
      } else {
        camera.position.set(0, gridSize.y * 0.55, gridSize.y * 0.85);
      }
      camera.updateProjectionMatrix();
      if (onResetDone) onResetDone();
    }
    
    if (isFollowing && robotPosRef.current) {
      // Use a fixed isometric offset for a smooth, readable follow view
      const offset = new THREE.Vector3(0, 15, 20);
      const targetCamPos = new THREE.Vector3().copy(robotPosRef.current).add(offset);
      
      // Smoothly move camera
      camera.position.lerp(targetCamPos, 0.1);
      
      // Force camera to look exactly at the robot to keep it centered
      camera.lookAt(robotPosRef.current);
      
      // Sync orbit controls target so it doesn't snap when unfollowing
      if (controlsRef.current) {
        controlsRef.current.target.copy(robotPosRef.current);
      }
    }
  });
  return null;
};

const MovingEntity = ({ obstacle, gridSize, isMapView, robotPosRef, allObstaclesRef }: { obstacle: DynamicObstacle, gridSize: GridPoint, isMapView: boolean, robotPosRef?: React.MutableRefObject<THREE.Vector3 | null>, allObstaclesRef?: React.MutableRefObject<DynamicObstacle[]> }) => {
  const ref = useRef<THREE.Group>(null);
  
  useFrame((_state, delta) => {
    if (!ref.current || obstacle.path.length === 0 || !obstacle.isMoving) return;
    const currentPos = ref.current.position;
    
    // Anti-overlap: Yield to robot
    if (robotPosRef && robotPosRef.current) {
      if (currentPos.distanceTo(robotPosRef.current) < 2.5) {
        return; // Stop moving, wait for robot to pass
      }
    }
    
    const targetNode = obstacle.path[Math.min(obstacle.currentIndex, obstacle.path.length - 1)];
    
    // Anti-overlap: Yield to other obstacles
    if (allObstaclesRef && allObstaclesRef.current) {
       const isBlockedByAnother = allObstaclesRef.current.some(other => 
           other.id !== obstacle.id && 
           other.pos.x === targetNode.x && 
           other.pos.y === targetNode.y && 
           other.pos.f === targetNode.f
       );
       // Basic tie-breaker: obstacle with lower ID yields
       if (isBlockedByAnother && obstacle.id > allObstaclesRef.current.find(o => o.pos.x === targetNode.x && o.pos.y === targetNode.y)?.id!) {
           return;
       }
    }

    const [tx, ty, tz] = getGridPosition(targetNode, gridSize, obstacle.type === 'car' ? 0.2 : 0.5, isMapView);
    const targetVector = new THREE.Vector3(tx, ty, tz);
    
    const dist = currentPos.distanceTo(targetVector);
    if (dist < 0.05) {
      if (obstacle.currentIndex < obstacle.path.length - 1) {
        obstacle.currentIndex++;
      } else {
        obstacle.path.reverse();
        obstacle.currentIndex = 0;
      }
      obstacle.pos = obstacle.path[obstacle.currentIndex];
    } else {
      const moveDist = obstacle.speed * delta;
      if (moveDist >= dist) {
        currentPos.copy(targetVector);
        obstacle.pos = targetNode;
      } else {
        const direction = new THREE.Vector3().subVectors(targetVector, currentPos).normalize();
        currentPos.add(direction.multiplyScalar(moveDist));
      }
      const rotDirection = new THREE.Vector3().subVectors(targetVector, currentPos);
      if (rotDirection.lengthSq() > 0.001) {
        const targetRotation = Math.atan2(rotDirection.x, rotDirection.z);
        let diff = targetRotation - ref.current.rotation.y;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        ref.current.rotation.y += diff * delta * 10;
      }
    }
  });

  const startPos = getGridPosition(obstacle.path[0] || {x:0, y:0, f:0}, gridSize, obstacle.type === 'car' ? 0.2 : 0.5, isMapView);

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

const BuildingModel = ({ room, width, height, depth }: { room: Room, width: number, height: number, depth: number }) => {
  const type = room.type || "unknown";
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
        {/* Security Booth - small compact building */}
        <Box args={[width, height * 1.1, depth]} position={[0, height * 0.05, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.4} />
        </Box>
        {/* Glass window strip */}
        <Box args={[width * 0.85, height * 0.4, 0.08]} position={[0, height * 0.15, depth/2 + 0.04]}>
          <meshStandardMaterial color="#38bdf8" transparent opacity={0.7} metalness={0.9} roughness={0.1} />
        </Box>
        {/* Overhang / shade visor */}
        <Box args={[width * 1.15, 0.1, depth * 0.7]} position={[0, height * 0.6, depth * 0.1]} castShadow>
          <meshStandardMaterial color="#0f172a" />
        </Box>
        {/* Warning light on top */}
        <Sphere args={[0.15, 8, 8]} position={[0, height * 0.75, 0]}>
          <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={2} />
        </Sphere>
        {/* Security sign */}
        <Html position={[0, height * 0.35, depth/2 + 0.1]} center transform>
          <div className="text-[8px] font-black text-yellow-400 tracking-widest bg-black/90 px-1 py-0.5 rounded border border-yellow-500/50 whitespace-nowrap">
            🛡 SECURITY
          </div>
        </Html>
      </group>
    );
  } else if (type === 'utility') {
    return (
      <group>
        <Box args={[width, height * 0.7, depth]} position={[0, -height * 0.15, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.4} />
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
          <meshStandardMaterial color="#bae6fd" metalness={0.9} roughness={0.1} opacity={0.8} transparent emissive="#0ea5e9" emissiveIntensity={0.2} />
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
        {/* Skyscraper base */}
        <Box args={[width * 0.9, height * 0.5, depth * 0.9]} position={[0, -height/2 + 0.25, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#0f172a" />
        </Box>
        {/* Core structural building */}
        <Box args={[width * 0.7, height * 6, depth * 0.7]} position={[0, height * 2.5, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#334155" />
        </Box>
        {/* Glass exterior */}
        <Box args={[width * 0.75, height * 5.8, depth * 0.75]} position={[0, height * 2.5, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#38bdf8" transparent opacity={0.6} metalness={0.9} roughness={0.1} />
        </Box>
        {/* Roof */}
        <Box args={[width * 0.8, 0.2, depth * 0.8]} position={[0, height * 5.5, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#0f172a" />
        </Box>
        <Cylinder args={[0.1, 0.1, 2]} position={[0, height * 6, 0]}>
          <meshStandardMaterial color="#ef4444" />
        </Cylinder>
      </group>
    );
  } else if (type === 'auditorium') {
    return (
      <group>
        <Box args={[width, height * 0.5, depth]} position={[0, -height * 0.25, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#cbd5e1" />
        </Box>
        {/* True Dome Roof */}
        <Sphere args={[Math.min(width, depth)/2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} position={[0, 0, 0]} castShadow>
          <meshStandardMaterial color="#94a3b8" metalness={0.5} roughness={0.2} side={THREE.DoubleSide} />
        </Sphere>
      </group>
    );
  } else if (type === 'sports') {
    const name = room.name.toLowerCase();
    
    if (name.includes('swimming')) {
      return (
        <group>
          {/* Pool base */}
          <Box args={[width, 0.5, depth]} position={[0, -height/2 + 0.25, 0]} receiveShadow>
            <meshStandardMaterial color="#e2e8f0" />
          </Box>
          {/* Water */}
          <Box args={[width * 0.9, 0.4, depth * 0.9]} position={[0, -height/2 + 0.3, 0]}>
            <meshStandardMaterial color="#38bdf8" transparent opacity={0.6} roughness={0.1} />
          </Box>
        </group>
      );
    } else if (name.includes('gymnasium') || name.includes('tennis')) {
      return (
        <group>
          {/* Main Gym Building */}
          <Box args={[width, height * 1.5, depth]} position={[0, height * 0.25, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.5} /> 
          </Box>
          {/* Glass Front */}
          <Box args={[width * 0.9, height * 1.2, 0.1]} position={[0, height * 0.1, depth/2 + 0.05]}>
            <meshStandardMaterial color="#38bdf8" transparent opacity={0.5} metalness={0.9} roughness={0.1} />
          </Box>
          {/* Roof decoration */}
          <Box args={[width * 1.05, 0.2, depth * 1.05]} position={[0, height * 1.05, 0]} castShadow>
             <meshStandardMaterial color="#0f172a" />
          </Box>
          
          {/* Giant Dumbbell Decoration on Roof */}
          <group position={[0, height * 1.5, 0]}>
             <Cylinder args={[0.2, 0.2, 2.5, 16]} rotation={[0, 0, Math.PI/2]}><meshStandardMaterial color="#94a3b8" metalness={0.8} /></Cylinder>
             <Cylinder args={[0.6, 0.6, 0.4, 16]} position={[-1, 0, 0]} rotation={[0, 0, Math.PI/2]}><meshStandardMaterial color="#1e293b" /></Cylinder>
             <Cylinder args={[0.6, 0.6, 0.4, 16]} position={[1, 0, 0]} rotation={[0, 0, Math.PI/2]}><meshStandardMaterial color="#1e293b" /></Cylinder>
             <Cylinder args={[0.4, 0.4, 0.3, 16]} position={[-1.4, 0, 0]} rotation={[0, 0, Math.PI/2]}><meshStandardMaterial color="#1e293b" /></Cylinder>
             <Cylinder args={[0.4, 0.4, 0.3, 16]} position={[1.4, 0, 0]} rotation={[0, 0, Math.PI/2]}><meshStandardMaterial color="#1e293b" /></Cylinder>
          </group>

          {/* Glowing GYM Sign */}
          <Html position={[0, height * 0.8, depth/2 + 0.2]} center transform>
             <div className="text-xl font-black text-red-500 tracking-[0.3em] drop-shadow-[0_0_10px_rgba(239,68,68,0.8)] border-2 border-red-500/50 px-4 py-1 rounded bg-black/80">
                GYM
             </div>
          </Html>
        </group>
      );
    } else if (name.includes('cricket')) {
      return (
        <group>
          {/* Pitch */}
          <Box args={[width, 0.2, depth]} position={[0, -height/2 + 0.1, 0]} receiveShadow>
            <meshStandardMaterial color="#22c55e" /> 
          </Box>
          <Box args={[width * 0.8, 0.22, depth * 0.3]} position={[0, -height/2 + 0.11, 0]}>
             <meshStandardMaterial color="#d4d4d8" />
          </Box>
          {/* Nets */}
          <Box args={[width * 0.8, 2, depth * 0.3]} position={[0, -height/2 + 1, 0]}>
             <meshStandardMaterial color="#000000" wireframe transparent opacity={0.3} />
          </Box>
          {/* Stumps */}
          <group position={[width * 0.3, -height/2 + 0.3, 0]}>
            <Cylinder args={[0.02, 0.02, 0.4]} position={[0, 0, -0.1]}><meshStandardMaterial color="#facc15" /></Cylinder>
            <Cylinder args={[0.02, 0.02, 0.4]} position={[0, 0, 0]}><meshStandardMaterial color="#facc15" /></Cylinder>
            <Cylinder args={[0.02, 0.02, 0.4]} position={[0, 0, 0.1]}><meshStandardMaterial color="#facc15" /></Cylinder>
          </group>
        </group>
      );
    } else if (name.includes('hockey')) {
      return (
        <group>
          {/* Field */}
          <Box args={[width, 0.2, depth]} position={[0, -height/2 + 0.1, 0]} receiveShadow>
            <meshStandardMaterial color="#3b82f6" />
          </Box>
          {/* Goals */}
          <Box args={[0.2, 0.8, 1.5]} position={[-width/2 + 0.5, -height/2 + 0.5, 0]}>
             <meshStandardMaterial color="#ffffff" wireframe />
          </Box>
          <Box args={[0.2, 0.8, 1.5]} position={[width/2 - 0.5, -height/2 + 0.5, 0]}>
             <meshStandardMaterial color="#ffffff" wireframe />
          </Box>
        </group>
      );
    } else if (name.includes('indoor')) {
      return (
        <group>
          {/* Closed stadium */}
          <Box args={[width, height, depth]} position={[0, 0, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#f1f5f9" /> 
          </Box>
          {/* Curved Roof */}
          <Cylinder args={[depth/2, depth/2, width, 16, 1, false, 0, Math.PI]} position={[0, height/2, 0]} rotation={[0, 0, -Math.PI/2]} castShadow>
             <meshStandardMaterial color="#cbd5e1" metalness={0.4} />
          </Cylinder>
        </group>
      );
    } else {
      return (
        <group>
          <Box args={[width, 0.2, depth]} position={[0, -height/2 + 0.1, 0]} receiveShadow>
            <meshStandardMaterial color="#4ade80" />
          </Box>
          <group position={[-width/4 + 1, -height/2 + 0.2, 0]}>
            <Box args={[0.1, 1.2, 0.1]} position={[-1, 0.5, 0]}><meshStandardMaterial color="#94a3b8" /></Box>
            <Box args={[0.1, 1.2, 0.1]} position={[1, 0.5, 0]}><meshStandardMaterial color="#94a3b8" /></Box>
            <Box args={[2.2, 0.1, 0.1]} position={[0, 1.1, 0]}><meshStandardMaterial color="#94a3b8" /></Box>
            <Box args={[0.05, 0.8, 0.05]} position={[-0.5, 0.6, 0]}><meshStandardMaterial color="#000000" /></Box>
            <Box args={[0.05, 0.8, 0.05]} position={[0.5, 0.6, 0]}><meshStandardMaterial color="#000000" /></Box>
            <Box args={[0.6, 0.05, 0.3]} position={[-0.5, 0.2, 0]}><meshStandardMaterial color="#ef4444" /></Box>
            <Box args={[0.6, 0.05, 0.3]} position={[0.5, 0.2, 0]}><meshStandardMaterial color="#3b82f6" /></Box>
          </group>
          <Box args={[2, 0.1, 2]} position={[width/4, -height/2 + 0.15, -depth/4]}>
            <meshStandardMaterial color="#fcd34d" />
          </Box>
          <Box args={[2.2, 0.2, 2.2]} position={[width/4, -height/2 + 0.1, -depth/4]}>
            <meshStandardMaterial color="#f59e0b" />
          </Box>
          <group position={[width/4, -height/2 + 0.2, depth/4]}>
             <Box args={[0.8, 1.5, 0.8]} position={[0, 0.75, -1]}><meshStandardMaterial color="#3b82f6" /></Box>
             <Box args={[0.6, 2, 0.1]} position={[0, 0.5, 0]} rotation={[-Math.PI/4, 0, 0]}><meshStandardMaterial color="#ef4444" /></Box>
          </group>
          <group position={[-width/4, -height/2 + 0.2, depth/3]}>
            <Cylinder args={[0.1, 0.1, 1]} position={[0, 0.5, 0]}><meshStandardMaterial color="#78350f" /></Cylinder>
            <Sphere args={[0.8, 8, 8]} position={[0, 1.2, 0]}><meshStandardMaterial color="#16a34a" /></Sphere>
          </group>
          <group position={[width/3, -height/2 + 0.2, depth/3]}>
            <Cylinder args={[0.1, 0.1, 1.2]} position={[0, 0.6, 0]}><meshStandardMaterial color="#78350f" /></Cylinder>
            <Sphere args={[0.9, 8, 8]} position={[0, 1.4, 0]}><meshStandardMaterial color="#16a34a" /></Sphere>
          </group>
        </group>
      );
    }
  } else if (type === 'park') {
    return (
      <group>
        <Box args={[width, 0.2, depth]} position={[0, -height/2 + 0.1, 0]} receiveShadow>
          <meshStandardMaterial color="#22c55e" />
        </Box>
        {/* More trees */}
        {[
          [-width/3, -depth/3], [width/3, depth/3], [-width/4, depth/4], [width/4, -depth/4],
          [0, -depth/3], [width/3, 0], [-width/2.5, 0]
        ].map((pos, i) => (
          <group key={i} position={[pos[0], -height/2 + 0.5, pos[1]]}>
            <Cylinder args={[0.1, 0.1, 0.8]} position={[0, -0.1, 0]} castShadow>
               <meshStandardMaterial color="#78350f" />
            </Cylinder>
            <Cylinder args={[0.4 + (i%3)*0.1, 0.6 + (i%3)*0.1, 0.8 + (i%3)*0.2]} position={[0, 0.6, 0]} castShadow>
               <meshStandardMaterial color={["#15803d", "#166534", "#22c55e"][i % 3]} />
            </Cylinder>
          </group>
        ))}
        {/* Butterflies */}
        {Array.from({ length: 12 }).map((_, i) => (
          <Box key={`b-${i}`} args={[0.1, 0.1, 0.1]} position={[
            ((i * 1.3) % width) - width/2,
            -height/2 + 1 + (i % 3) * 0.5,
            ((i * 1.7) % depth) - depth/2
          ]}>
             <meshStandardMaterial color={["#fbbf24", "#38bdf8", "#f472b6"][i % 3]} emissive={["#fbbf24", "#38bdf8", "#f472b6"][i % 3]} emissiveIntensity={0.5} />
          </Box>
        ))}
      </group>
    );
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
           <meshStandardMaterial color="#bae6fd" metalness={0.8} roughness={0.2} emissive="#bae6fd" emissiveIntensity={0.2} />
        </Box>
      </group>
    );
  }
};

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
             ASPIRE GATEWAY
          </div>
       </Html>
    </group>
  );
};


const Robot = ({
  path, currentIndex, isPlaying, gridSize, isMapView, speed, dynamicObstaclesRef,
  onReachNode, onMissionComplete, onObstacleDetected, robotPosRef, robotRotRef
}: {
  path: GridPoint[];
  currentIndex: number;
  isPlaying: boolean;
  gridSize: GridPoint;
  isMapView: boolean;
  speed: number;
  dynamicObstaclesRef: React.MutableRefObject<DynamicObstacle[]>;
  onReachNode: (idx: number) => void;
  onMissionComplete: () => void;
  onObstacleDetected: (blockedPoints: GridPoint[]) => void;
  robotPosRef: React.MutableRefObject<THREE.Vector3 | null>;
  robotRotRef: React.MutableRefObject<number>;
}) => {
  const ref = useRef<THREE.Group>(null);
  const isMovingRef = useRef(false);
  const [isMoving, setIsMoving] = useState(false);

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
      // Don't return early here, we still want to check for obstacles behind us
    }
    
    const dist = currentPos.distanceTo(targetVector);

    if (pauseTimeRef.current > 0) return; // Wait if still paused

    if (isPlaying) {
      if (dynamicObstaclesRef && dynamicObstaclesRef.current.length > 0) {
        const upcomingPath = path.slice(currentIndex, currentIndex + 4);
        for (const obs of dynamicObstaclesRef.current) {
          const obsUpcoming = obs.path.slice(obs.currentIndex, obs.currentIndex + 5);
          for (const p of upcomingPath) {
            const collision = (p.x === obs.pos.x && p.y === obs.pos.y) || obsUpcoming.some(op => op.x === p.x && op.y === p.y);
            if (collision) {
              onObstacleDetected([obs.pos, ...obsUpcoming]);
              return; // Pause movement this frame
            }
          }
        }
      }

      if (dist < 0.05) {
        if (isMovingRef.current) { isMovingRef.current = false; setIsMoving(false); }
        if (currentIndex < path.length - 1) {
          const curr = path[currentIndex];
          const next = path[currentIndex + 1];
          if (curr.x === next.x && curr.y === next.y) {
             pauseTimeRef.current = 2.5; // Pause for 2.5 seconds
          }
          onReachNode(currentIndex + 1);
        }
        else if (currentIndex === path.length - 1) onMissionComplete();
      } else {
        if (!isMovingRef.current) { isMovingRef.current = true; setIsMoving(true); }
        const moveDist = speed * delta;
        if (moveDist >= dist) {
          currentPos.copy(targetVector);
        } else {
          const direction = new THREE.Vector3().subVectors(targetVector, currentPos).normalize();
          currentPos.add(direction.multiplyScalar(moveDist));
        }
        const rotDirection = new THREE.Vector3().subVectors(targetVector, currentPos);
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
    <group ref={ref} position={startPos}>
      {/* Contact shadow */}
      <mesh position={[0, -0.21, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[0.4, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.25} depthWrite={false} />
      </mesh>
      <DetailedRobot isMoving={isMoving} />
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

const EnvironmentMap = ({ mapData, isTargeting, onMapClick }: { mapData: MapData, isTargeting?: boolean, onMapClick?: (p: THREE.Vector3) => void }) => {
  const { gridSize } = mapData;
  return (
    <Plane 
      args={[gridSize.x, gridSize.y]} 
      rotation={[-Math.PI / 2, 0, 0]} 
      position={[0, 0, 0]} 
      receiveShadow
      onClick={(e) => {
        if (isTargeting && onMapClick) {
          e.stopPropagation();
          onMapClick(e.point);
        }
      }}
      onPointerOver={() => {
        if (isTargeting) document.body.style.cursor = 'crosshair';
      }}
      onPointerOut={() => {
        if (isTargeting) document.body.style.cursor = 'auto';
      }}
    >
      <meshStandardMaterial color="#bbf7d0" />
    </Plane>
  );
};

interface SimulationViewProps {
  mapData: MapData | null;
  onEvent: (event: any) => void;
  onDispatchMission?: (missionText: string) => void;
  selectedStrategyId?: string;
}


export const SimulationView: React.FC<SimulationViewProps> = ({ mapData, onDispatchMission, selectedStrategyId }) => {
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
  const [triggerReset, setTriggerReset] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showReasoningLog, setShowReasoningLog] = useState(false);
  
  const [aiExplanations, setAiExplanations] = useState<string[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [isEmergencyTargeting, setIsEmergencyTargeting] = useState(false);
  const [isPlacingBlocker, setIsPlacingBlocker] = useState(false);
  const [isIdleMode, setIsIdleMode] = useState(false);
  const [userBlockers, setUserBlockers] = useState<GridPoint[]>([]);

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
               setIsPlaying(false);
               setRobotState('idle');
               addExplanation("Road completely blocked and cannot reach base! Halting.");
           }
         }
       }
    }
  }, [userBlockers]);
  
  const [dynamicObstacles, setDynamicObstacles] = useState<DynamicObstacle[]>([]);
  const dynamicObstaclesRef = useRef<DynamicObstacle[]>([]);
  const isRecalculating = useRef(false);

  const [battery, setBattery] = useState(100);
  const [robotState, setRobotState] = useState<RobotState>('off');
  const [isOn, setIsOn] = useState(false);
  const batteryRef = useRef(100);
  const robotStateRef = useRef<RobotState>('idle');
  const originalMissionRef = useRef<{path: GridPoint[], index: number} | null>(null);
  const robotPosRef = useRef<THREE.Vector3 | null>(null);
  const robotRotRef = useRef<number>(0);
  const controlsRef = useRef<any>(null);
  const turnOffAfterEmergencyRef = useRef(false);
  const currentTaskIndexRef = useRef(0);
  const emergencyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    switch(robotState) {
      case 'patrol':
        setActivePathColor('#3b82f6'); // blue
        break;
      case 'mission':
        setActivePathColor('#22c55e'); // green
        break;
      case 'emergency_response':
        setActivePathColor('#ef4444'); // red
        break;
      case 'charging':
      case 'returning_home':
        setActivePathColor('#eab308'); // yellow
        break;
      case 'evading_obstacle':
        setActivePathColor('#f97316'); // orange
        break;
      default:
        setActivePathColor('#00ffff'); // cyan
    }
  }, [robotState]);

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
      setRobotState('patrol'); // Initialize directly into patrol mode
      setBattery(100);
      addExplanation("Powering ON. System initialized. Beginning patrol.");
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
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, mapData]);

  const prevIsIdleMode = useRef(isIdleMode);

  // Auto-Patrol Logic
  useEffect(() => {
    let timeout: any;
    if (!isIdleMode && (robotState === 'idle' || robotState === 'patrol') && !isPlaying && isOn) {
      const waitTime = (prevIsIdleMode.current && !isIdleMode) ? 0 : 2500;
      timeout = setTimeout(() => {
        if (!mapData || !mapData.rooms) return;
        addExplanation(waitTime === 0 ? 'Idle mode disabled. Resuming patrol immediately.' : 'Idle detected. Initiating autonomous patrol mode.');
        const currentLoc = path.length > 0 ? path[currentPosIndex] : mapData.start;
        const randomRoom = mapData.rooms[Math.floor(Math.random() * mapData.rooms.length)];
        const patrolPath = calculatePath(currentLoc, randomRoom.door || randomRoom.start, [...(mapData.obstacles || []), ...userBlockers], mapData);
        if (patrolPath.length > 0) {
          setPath(patrolPath);
          setCurrentPosIndex(0);
          setRobotState('patrol');
          setIsPlaying(true);
        }
      }, waitTime);
    }
    prevIsIdleMode.current = isIdleMode;
    return () => clearTimeout(timeout);
  }, [robotState, isPlaying, path, currentPosIndex, mapData, isOn, isIdleMode]);

  const initializeDynamicObstacles = (robotPath?: GridPoint[]) => {
    if (!mapData || !mapData.roads || mapData.roads.length < 5) return;
    const roads = mapData.roads;
    const obs: DynamicObstacle[] = [];
    
    // Spawn 15 people and 7 cars walking/driving around
    for (let i = 0; i < 22; i++) {
      const start = roads[Math.floor(Math.random() * roads.length)];
      const end = roads[Math.floor(Math.random() * roads.length)];
      const path = calculatePath(start, end, [...(mapData.obstacles || []), ...userBlockers], mapData, true);
      if (path.length > 0) {
        obs.push({
          id: `obs_${i}`,
          type: i < 7 ? 'car' : 'person',
          pos: path[0],
          targetPos: end,
          path,
          currentIndex: 0,
          speed: i < 7 ? 6 : (2 + Math.random() * 2),
          isMoving: true
        });
      }
    }

    // Add a sudden crosser if we have a valid robot path
    if (robotPath && robotPath.length > 8) {
      const crossPoint = robotPath[6]; // Place the person slightly ahead of robot
      if (crossPoint) {
        obs.push({
          id: 'sudden_crosser',
          type: 'person',
          pos: crossPoint,
          targetPos: crossPoint,
          // They will basically just stand/pace directly on the robot's upcoming path
          path: [crossPoint, crossPoint],
          currentIndex: 0,
          speed: 0.5,
          isMoving: true
        });
      }
    }
    
    setDynamicObstacles(obs);
    dynamicObstaclesRef.current = obs;
  };

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
            dispatchLocalMission(targetRoom.door || targetRoom.start, userMsg);
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
      const fPath = calculatePath(currentLoc, target, [...(mapData.obstacles || []), ...userBlockers], mapData);
      const rPath = calculatePath(target, emergencyLoc, [...(mapData.obstacles || []), ...userBlockers], mapData);
      if (fPath.length > 0 && rPath.length > 0) {
        initialPath = [...fPath, fPath[fPath.length - 1], ...rPath.slice(1)];
      } else {
        initialPath = fPath;
      }
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
      addExplanation(`Planned route to destination. Estimated distance: ${initialPath.length}m.`);
      
      // dynamic obstacles no longer factored in as they get out of the way
      const isBlocked = false;
      if (isBlocked && dynamicObstaclesRef.current.length > 0) {
         addExplanation("WARNING: Detected dynamic obstacles intersecting optimal path. Using AI dynamic rerouting.");
      }
      
      if (isEmergencySideTask) {
         setRobotState('emergency_response');
         if (emergencyTimeoutRef.current) {
           clearTimeout(emergencyTimeoutRef.current);
           emergencyTimeoutRef.current = null;
         }
         setIsPlaying(true);
         window.dispatchEvent(new CustomEvent('local_emergency_request', { detail: null }));
      } else {
         setRobotState('mission');
         setIsPlaying(true);
      }
    } else {
      setPath([]);
      setRobotState(prev => prev === 'emergency_response' ? prev : 'idle');
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

  const handleEmergencyCall = (targetPos: GridPoint) => {
    if (!isOn) {
      addExplanation("Emergency override! Powering ON to respond to critical emergency.");
      setIsOn(true);
      turnOffAfterEmergencyRef.current = true;
    } else {
      turnOffAfterEmergencyRef.current = false;
    }
    
    if (!mapData) return;
    if (robotState === 'emergency_response' || robotState === 'charging' || robotState === 'returning_home') return;
    
    addExplanation(`EMERGENCY CALL: Diverting immediately to (${targetPos.x}, ${targetPos.y})!`);
    setIsPlaying(false);
    isRecalculating.current = true;
    
    if (robotState === 'mission' || robotState === 'patrol') {
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

  const handleObstacleDetected = (blockedPoints: GridPoint[]) => {
    if (isRecalculating.current) return;
    isRecalculating.current = true;
    
    addExplanation(`CRITICAL: Dynamic Obstacle detected at (${blockedPoints[0].x}, ${blockedPoints[0].y}). Rerouting instantly...`);
    
    if (!mapData) {
       isRecalculating.current = false;
       return;
    }
    const currentLoc = path[currentPosIndex];
    const targetLoc = path[path.length - 1];
    
    // We treat the specific position of the dynamic obstacle as a hard blockage for this local recalculation
    const allObstacles = [...(mapData.obstacles || []), ...userBlockers, ...blockedPoints];
    
    let intermediateTarget = null;
    for (let i = currentPosIndex; i < path.length - 1; i++) {
      if (path[i].x === path[i+1].x && path[i].y === path[i+1].y && path[i].f === path[i+1].f) {
        intermediateTarget = path[i];
        break;
      }
    }
    
    let newPath: GridPoint[] = [];
    if (intermediateTarget) {
      const fPath = calculatePath(currentLoc, intermediateTarget, allObstacles, mapData);
      const rPath = calculatePath(intermediateTarget, targetLoc, allObstacles, mapData);
      if (fPath.length > 0 && rPath.length > 0) {
        newPath = [...fPath, ...rPath.slice(1)];
      }
    } else {
      newPath = calculatePath(currentLoc, targetLoc, allObstacles, mapData);
    }
    
    if (newPath.length === 0) {
      if (intermediateTarget) {
         const fPath = calculateLongPath(currentLoc, intermediateTarget, allObstacles, mapData);
         const rPath = calculateLongPath(intermediateTarget, targetLoc, allObstacles, mapData);
         if (fPath.length > 0 && rPath.length > 0) {
           newPath = [...fPath, ...rPath.slice(1)];
         }
      } else {
         newPath = calculateLongPath(currentLoc, targetLoc, allObstacles, mapData);
      }
    }
    
    if (newPath.length > 0) {
      setPath(newPath);
      setCurrentPosIndex(0);
      setIsPlaying(true);
      addExplanation(`Successfully found alternative route avoiding obstacle! Resuming mission.`);
      setTimeout(() => {
        isRecalculating.current = false;
      }, 1500);
    } else {
      let pullOverTile: GridPoint | null = null;
      const neighbors = [
          { x: currentLoc.x, y: currentLoc.y - 1, f: currentLoc.f },
          { x: currentLoc.x, y: currentLoc.y + 1, f: currentLoc.f },
          { x: currentLoc.x - 1, y: currentLoc.y, f: currentLoc.f },
          { x: currentLoc.x + 1, y: currentLoc.y, f: currentLoc.f }
      ];
      
      const isRoad = (nx: number, ny: number, nf: number) => 
         mapData.roads && mapData.roads.some(r => r.x === nx && r.y === ny && r.f === nf);
         
      const isValid = (nx: number, ny: number, nf: number) => 
         nx >= 0 && nx < (mapData.gridSize?.x || 100) && 
         ny >= 0 && ny < (mapData.gridSize?.y || 100) && 
         nf >= 0 && nf < (mapData.gridSize?.f || 1) &&
         !allObstacles.some(o => o.x === nx && o.y === ny && o.f === nf);

      for (const n of neighbors) {
         if (isValid(n.x, n.y, n.f) && !isRoad(n.x, n.y, n.f)) {
            pullOverTile = n; break;
         }
      }
      
      if (!pullOverTile) {
         for (const n of neighbors) {
            if (isValid(n.x, n.y, n.f)) {
               pullOverTile = n; break;
            }
         }
      }

      if (pullOverTile) {
        addExplanation(`Path blocked! Yielding to traffic by stepping aside...`);
        if (robotState !== 'evading_obstacle' && robotState !== 'charging' && robotState !== 'emergency_response') {
            originalMissionRef.current = { path: [...path], index: currentPosIndex };
        }
        setPath([currentLoc, pullOverTile]);
        setCurrentPosIndex(0);
        setRobotState('evading_obstacle');
        setIsPlaying(true);
        isRecalculating.current = false;
      } else {
        addExplanation(`Completely boxed in. Waiting for traffic to clear...`);
        if (robotState !== 'evading_obstacle' && robotState !== 'charging' && robotState !== 'emergency_response') {
            originalMissionRef.current = { path: [...path], index: currentPosIndex };
        }
        setRobotState('evading_obstacle');
        setIsPlaying(false);
        setTimeout(() => {
          isRecalculating.current = false;
          setIsPlaying(true); // retry loop
        }, 3000);
      }
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
      handleEmergencyComplete();
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
            setRobotState(prev => prev === 'mission' ? 'mission' : 'patrol');
            setIsPlaying(true);
            addExplanation(`Resuming mission to ${nextTask.locationName}.`);
          } else {
            addExplanation(`Route calculation to ${nextTask.locationName} failed.`);
            setRobotState('idle');
          }
          isRecalculating.current = false;
        }, 800);
      } else {
        setIsPlaying(false);
        setRobotState('idle');
        addExplanation('Mission complete. Waiting 2.5s before returning to patrol mode.');
      }
    }
  };

  const dispatchLocalMission = (targetPos: GridPoint, missionText: string) => {
    if (!isOn) {
      addExplanation("Cannot dispatch mission: Robot is powered OFF.");
      return;
    }
    if (robotState === 'charging') {
      addExplanation("Cannot dispatch mission: Robot is currently charging and must reach 100%.");
      return;
    }
    if (!mapData) return;
    currentTaskIndexRef.current = mapData.tasks ? mapData.tasks.length : 0;
    setIsPlaying(false);
    isRecalculating.current = true;
    addExplanation(`New command: ${missionText}. Calculating route...`);
    
    setTimeout(() => {
      const currentLoc = path.length > 0 && currentPosIndex < path.length ? path[currentPosIndex] : mapData.start;
      
      if (robotStateRef.current === 'emergency_response') {
         const emergencyLoc = path.length > 0 ? path[path.length - 1] : mapData.start;
         const forwardPath = calculatePath(currentLoc, targetPos, [...(mapData.obstacles || []), ...userBlockers], mapData);
         const returnPath = calculatePath(targetPos, emergencyLoc, [...(mapData.obstacles || []), ...userBlockers], mapData);
         
         if (forwardPath.length > 0 && returnPath.length > 0) {
           const roundTripPath = [...forwardPath, forwardPath[forwardPath.length - 1], ...returnPath.slice(1)];
           setPath(roundTripPath);
           setCurrentPosIndex(0);
           setIsPlaying(true);
           if (emergencyTimeoutRef.current) {
             clearTimeout(emergencyTimeoutRef.current);
             emergencyTimeoutRef.current = null;
           }
           window.dispatchEvent(new CustomEvent('local_emergency_request', { detail: null }));
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
        <Canvas shadows gl={{ antialias: true }} dpr={[1, 1.2]}>
          {/* Camera */}
          {isMapView ? (
            <OrthographicCamera makeDefault position={[0, 100, 0]} zoom={6} near={0.1} far={1000} />
          ) : (
            <PerspectiveCamera makeDefault position={[0, gridSize.y * 0.55, gridSize.y * 0.85]} fov={55} />
          )}
          {/* Lighting */}
          <ambientLight intensity={0.7} />
          <directionalLight
            position={[20, 30, 20]}
            intensity={1.8}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-near={0.5}
            shadow-camera-far={200}
            shadow-camera-left={-80}
            shadow-camera-right={80}
            shadow-camera-top={80}
            shadow-camera-bottom={-80}
          />
          <pointLight position={[0, 8, 0]} intensity={0.6} color="#60a5fa" />
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
            dampingFactor={0.05}
            target={[0, 0.5, 0]}
            maxPolarAngle={Math.PI / 2 - 0.05}
          />
          
          <EnvironmentMap 
            mapData={mapData} 
            isTargeting={isEmergencyTargeting || isPlacingBlocker} 
            onMapClick={(p) => {
              const gridP = getGridPointFromVector3(p, gridSize);
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
          {rooms?.map((room: Room) => {
            const width = (room.end.x - room.start.x + 1) * 0.75;
            const depth = (room.end.y - room.start.y + 1) * 0.75;
            const height = 3;
            const x = (room.start.x + room.end.x) / 2 - gridSize.x / 2;
            const z = (room.start.y + room.end.y) / 2 - gridSize.y / 2;
            return (
              <group key={room.id} position={[x, height / 2, z]} onClick={(e) => { e.stopPropagation(); setSelectedRoom(room); }}>
                <BuildingModel room={room} width={width} height={height} depth={depth} />
                <Html position={[0, height / 2 + 1.5, 0]} center style={{ pointerEvents: 'none' }}>
                  <div className="text-[10px] font-bold text-white bg-black/80 px-2 py-1 rounded shadow-lg whitespace-nowrap">
                    {room.name}
                  </div>
                </Html>
              </group>
            );
          })}
          <RoadsRender roads={mapData.roads || []} gridSize={gridSize} />
          <BlockersRender blockers={userBlockers} gridSize={gridSize} roads={mapData.roads || []} />

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
              key={idx} 
              obstacle={obs} 
              gridSize={gridSize} 
              isMapView={isMapView} 
              robotPosRef={robotPosRef}
              allObstaclesRef={dynamicObstaclesRef}
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
              onReachNode={handleReachNode}
              onMissionComplete={handleMissionComplete}
              onObstacleDetected={handleObstacleDetected}
              robotPosRef={robotPosRef}
              robotRotRef={robotRotRef}
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
      <div className="absolute right-4 top-4 bottom-4 w-[360px] bg-black/70 backdrop-blur-xl border border-white/10 rounded-2xl hidden md:flex flex-col z-[100] overflow-hidden shadow-2xl text-gray-200 pointer-events-auto">
        <div className="p-4 border-b border-white/10 bg-black/40 flex-none flex justify-between items-center">
          <h3 className="font-bold text-sm flex items-center gap-2 text-white">
            <Activity className="w-4 h-4 text-brand" />
            Control Center
          </h3>
          <button 
            onClick={() => setIsCTROpen(!isCTROpen)}
            className="p-1.5 rounded-md bg-white/5 hover:bg-brand/20 border border-white/10 text-brand-light transition-colors"
            title="Open Console"
          >
            <Bot className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Mission Telemetry</h4>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const nextIdle = !isIdleMode;
                  setIsIdleMode(nextIdle);
                  if (nextIdle) {
                    // Find nearest room to park safely out of traffic
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
                className={`px-3 py-1 rounded text-[10px] font-bold flex items-center gap-1 transition-colors ${isIdleMode ? 'bg-gray-500 text-white' : 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/40'}`}
                title="Toggle Idle Mode"
              >
                <Pause className="w-3 h-3" /> IDLE
              </button>
              <button 
                onClick={togglePower}
                className={`px-3 py-1 rounded text-[10px] font-bold transition-colors ${isOn ? 'bg-red-500/20 text-red-400 hover:bg-red-500/40' : 'bg-green-500/20 text-green-400 hover:bg-green-500/40'}`}
              >
                {isOn ? 'POWER OFF' : 'POWER ON'}
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2 mb-4 transition-all duration-500">
            <div className="bg-white/5 border border-white/10 rounded-lg p-2">
              <span className="text-[9px] text-gray-400 block mb-0.5">BATTERY</span>
              <div className="flex items-center gap-1.5 mt-1">
                <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div className={`h-full ${battery > 60 ? 'bg-green-500' : battery > 30 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${battery}%` }} />
                </div>
                <span className="text-[10px] font-bold text-white">{battery}%</span>
              </div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-lg p-2 flex flex-col justify-center">
              <span className="text-[9px] text-gray-500 block mb-0.5">STATUS</span>
              <span className={`text-xs font-bold uppercase ${
                robotState === 'charging' ? 'text-yellow-400' : 
                robotState === 'patrol' ? 'text-blue-400' : 
                robotState === 'mission' ? 'text-green-400' : 
                robotState === 'emergency_response' ? 'text-red-500 animate-pulse' : 
                'text-gray-300'
              }`}>
                {robotState.replace('_', ' ')}
              </span>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-lg p-2">
              <span className="text-[9px] text-gray-500 block mb-0.5">DISTANCE</span>
              <span className="text-sm font-bold text-white">{path.length > 0 ? path.length - currentPosIndex : '--'} <span className="text-[10px] font-normal text-gray-500">m</span></span>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-lg p-2">
              <span className="text-[9px] text-gray-500 block mb-0.5">ETA</span>
              <span className="text-sm font-bold text-white">{path.length > 0 ? Math.ceil((path.length - currentPosIndex) * 0.5) : '--'} <span className="text-[10px] font-normal text-gray-500">min</span></span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => startSimulation()}
              disabled={isPlaying || (path.length > 0 && currentPosIndex >= path.length - 1)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg font-medium hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm text-xs"
            >
              <Play className="w-3.5 h-3.5" /> {isPlaying ? 'Simulating...' : 'Execute'}
            </button>
            <button
              onClick={() => setIsEmergencyTargeting(!isEmergencyTargeting)}
              className={`px-3 py-2 border rounded-lg transition-colors flex items-center justify-center gap-2 font-bold text-xs ${isEmergencyTargeting ? 'bg-red-500 text-white border-red-500' : 'bg-red-500/10 text-red-500 border-red-500/30 hover:bg-red-500/20'}`}
              title="Target Emergency"
            >
              <ShieldAlert className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setIsPlacingBlocker(!isPlacingBlocker);
                if (!isPlacingBlocker) setIsEmergencyTargeting(false);
              }}
              className={`px-3 py-2 border rounded-lg transition-colors flex items-center justify-center gap-2 font-bold text-xs ${isPlacingBlocker ? 'bg-orange-500 text-white border-orange-500' : 'bg-orange-500/10 text-orange-500 border-orange-500/30 hover:bg-orange-500/20'}`}
              title="Toggle Road Blocker"
            >
              <Construction className="w-4 h-4" />
            </button>
            <button
              onClick={resetSimulation}
              className="p-2.5 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors"
              title="Reset Robot"
            >
              <RotateCcw className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>

        <div className={`p-4 border-b border-white/10 bg-black/20 transition-all duration-500 ${!isOn ? 'opacity-30 pointer-events-none grayscale' : ''}`}>
          <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Room Inspector</h4>
          {selectedRoom && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 mb-4">
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 mb-3">
                <h5 className="font-bold text-white text-sm mb-1">{selectedRoom.name}</h5>
                <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-black/40 text-gray-300 border border-white/10">Floor {selectedRoom.start.f}</span>
                
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="text-[10px] text-gray-400">Occupancy: <span className="text-white font-bold">{(selectedRoom.name.length + selectedRoom.start.x) % 12 || 2}</span></div>
                  <div className="text-[10px] text-gray-400">Status: <span className="text-green-400 font-bold">Clear</span></div>
                </div>
              </div>
              
              <div className="space-y-1.5">
                <button onClick={() => dispatchQuickMission('Navigate')} className="w-full flex items-center gap-2 px-3 py-1.5 bg-brand/10 text-brand hover:bg-brand hover:text-white rounded-lg text-xs font-medium transition-colors border border-brand/20 shadow-sm">
                  <Play className="w-3 h-3" /> Navigate to Room
                </button>
                <button onClick={() => dispatchQuickMission('Deliver Documents')} className="w-full flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white rounded-lg text-xs font-medium transition-colors border border-blue-500/20 shadow-sm">
                  <Crosshair className="w-3 h-3" /> Dispatch Documents
                </button>
                <button onClick={() => handleEmergencyCall(selectedRoom.door || selectedRoom.start)} className="w-full flex items-center gap-2 px-3 py-1.5 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-lg text-xs font-medium transition-colors border border-red-500/20 shadow-sm">
                  <ShieldAlert className="w-3 h-3" /> Trigger Emergency Call
                </button>
                <button onClick={() => dispatchQuickMission('Clean Room')} className="w-full flex items-center gap-2 px-3 py-1.5 bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white rounded-lg text-xs font-medium transition-colors border border-green-500/20 shadow-sm">
                  <Crosshair className="w-3 h-3" /> Send Cleaner
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <div className="text-[10px] text-gray-400 mb-1">Building Directory</div>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
              {rooms?.map(room => (
                <button 
                  key={room.id}
                  onClick={() => setSelectedRoom(room)}
                  className={`w-full text-left px-3 py-2 rounded border transition-colors text-xs flex justify-between items-center ${selectedRoom?.id === room.id ? 'bg-brand/20 border-brand text-white' : 'bg-white/5 hover:bg-white/10 border-white/5 text-gray-300'}`}
                >
                  <span className="truncate mr-2">{room.name}</span>
                  <span className="text-[9px] text-gray-500 flex-shrink-0">Fl {room.start.f}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
};
