import React, { useEffect, useRef, useState, useMemo } from 'react';
import type { MapData, GridPoint, Room } from '../types';
import { calculatePathAsync, calculateLongPathAsync } from '../utils/simulationEngine';
import { Play, RotateCcw, Activity, ShieldAlert, Crosshair, Maximize, Minimize, Bot, Power, Send, Construction, Pause, Users } from 'lucide-react';
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
  RoundedBox,
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

export type RobotState = 'idle' | 'mission' | 'patrol' | 'charging' | 'emergency_response' | 'crowd_response' | 'waiting_for_police' | 'evading_obstacle' | 'returning_home' | 'off';


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
          <Cylinder args={[0.15, 0.15, 0.6, 12]} position={[0, 0.3, 0]} castShadow>
            <meshStandardMaterial color="#10b981" />
          </Cylinder>
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

const RoadsRender = React.memo(({ roads, gridSize }: { roads: GridPoint[], gridSize: GridPoint }) => {
  if (!roads || roads.length === 0) return null;

  const lines = React.useMemo(() => {
    const l: { pos: GridPoint, rot: number }[] = [];
    const roadSet = new Set(roads.map(r => `${r.x},${r.y}`));
    
    roads.forEach(road => {
      let minX = road.x;
      let maxX = road.x;
      while (roadSet.has(`${minX - 1},${road.y}`)) minX--;
      while (roadSet.has(`${maxX + 1},${road.y}`)) maxX++;
      const width = maxX - minX + 1;
      const isCenterX = road.x === Math.floor((minX + maxX) / 2);
      
      let minY = road.y;
      let maxY = road.y;
      while (roadSet.has(`${road.x},${minY - 1}`)) minY--;
      while (roadSet.has(`${road.x},${maxY + 1}`)) maxY++;
      const height = maxY - minY + 1;
      const isCenterY = road.y === Math.floor((minY + maxY) / 2);
      
      if (width > height && width >= 4 && isCenterY) {
         l.push({ pos: road, rot: 0 }); 
      } else if (height > width && height >= 4 && isCenterX) {
         l.push({ pos: road, rot: Math.PI / 2 });
      } else if (width < 4 && height < 4) {
         if (isCenterY) l.push({ pos: road, rot: 0 });
         else if (isCenterX) l.push({ pos: road, rot: Math.PI / 2 });
      }
    });
    return l;
  }, [roads]);

  return (
    <group>
      <Instances limit={roads.length} receiveShadow>
        <boxGeometry args={[CELL_SIZE + 0.05, 0.05, CELL_SIZE + 0.05]} />
        <meshStandardMaterial color="#64748b" opacity={0.9} transparent />
        {roads.map((road, i) => {
          const [x, y, z] = getGridPosition(road, gridSize, 0.025);
          return <Instance key={i} position={[x, y, z]} />;
        })}
      </Instances>
      
      {/* Two-way center lines */}
      <Instances limit={lines.length > 0 ? lines.length : 1} receiveShadow>
        <boxGeometry args={[CELL_SIZE, 0.01, 0.08]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.8} />
        {lines.map((line, i) => {
          const [x, y, z] = getGridPosition(line.pos, gridSize, 0.055);
          return <Instance key={`line-${i}`} position={[x, y, z]} rotation={[0, line.rot, 0]} />;
        })}
      </Instances>
    </group>
  );
});

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

const Butterflies = () => {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
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

const BuildingModel = ({ room, width, height, depth }: { room: Room, width: number, height: number, depth: number }) => {
  const type = room.type || "unknown";
  const nameLow = room.name.toLowerCase();
  const baseColor = room.color || "#e2e8f0";
  
  const parkTrees = React.useMemo(() => {
    const isEco = room.name.toLowerCase().includes('eco');
    const count = isEco ? 15 : 4;
    const arr = [];
    // Pseudo-random deterministic placement based on name to keep it fixed
    for (let i = 0; i < count; i++) {
      const seeded1 = Math.abs(Math.sin((room.name.length * 10 + i) * 12.345));
      const seeded2 = Math.abs(Math.cos(i * 45.678 + room.name.length));
      const tx = (seeded1 - 0.5) * width * 0.8;
      const tz = (seeded2 - 0.5) * depth * 0.8;
      arr.push({tx, tz});
    }
    return arr;
  }, [room.name, width, depth]);
  
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
        <Box args={[width, height * 1.8, depth]} position={[0, height * 0.4, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#e2e8f0" />
        </Box>
        {/* Greek style columns */}
        {[-width/2 + 0.5, 0, width/2 - 0.5].map((x, i) => (
          <Cylinder key={i} args={[0.2, 0.2, height * 1.8]} position={[x, height * 0.4, depth/2 + 0.1]} castShadow>
            <meshStandardMaterial color="#ffffff" />
          </Cylinder>
        ))}
        {/* Pediment */}
        <Cylinder args={[width/2, width/2, depth + 0.5, 3]} position={[0, height * 1.4, 0]} rotation={[width > depth ? 0 : Math.PI / 2, 0, Math.PI / 2]} castShadow>
           <meshStandardMaterial color="#94a3b8" />
        </Cylinder>
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
    return (
      <group>
        <Box args={[width, 0.2, depth]} position={[0, -height/2 + 0.1, 0]} receiveShadow>
          <meshStandardMaterial color="#22c55e" />
        </Box>
        {/* Many trees for Eco Park */}
        {parkTrees.map(({tx, tz}, i) => {
          return (
            <group key={i} position={[tx, -height/2 + 0.5, tz]}>
              <Cylinder args={[0.1, 0.1, 0.8]} position={[0, -0.1, 0]} castShadow>
                 <meshStandardMaterial color="#78350f" />
              </Cylinder>
              <Cylinder args={[0.4, 0.6, 1.2]} position={[0, 0.8, 0]} castShadow>
                 <meshStandardMaterial color="#15803d" />
              </Cylinder>
            </group>
          );
        })}
        {/* Butterflies */}
        <Butterflies />
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

/* ── Detailed Animated 3D Robot Body ── */
export const DetailedRobot = ({ isMoving, showFeatures = false, activeFeature = "" }: { isMoving: boolean; showFeatures?: boolean; activeFeature?: string }) => {
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

    if (bodyRef.current) bodyRef.current.position.y = isMoving ? Math.sin(t * 8) * 0.04 : 0;
    if (headRef.current) headRef.current.rotation.y = isMoving ? Math.sin(t * 2) * 0.3 : Math.sin(t * 0.8) * 0.25;
    if (leftArmRef.current) leftArmRef.current.rotation.x = isMoving ? Math.sin(t * 8) * 0.4 : 0;
    if (rightArmRef.current) rightArmRef.current.rotation.x = isMoving ? -Math.sin(t * 8) * 0.4 : 0;

    const ws = isMoving ? 8 : 0.5;
    if (leftWheelRef.current) leftWheelRef.current.rotation.x += delta * ws;
    if (rightWheelRef.current) rightWheelRef.current.rotation.x += delta * ws;
    if (frontWheelRef.current) frontWheelRef.current.rotation.x += delta * ws;
    if (backWheelRef.current) backWheelRef.current.rotation.x += delta * ws;

    if (antennaLightRef.current) {
      (antennaLightRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + 0.5 * Math.sin(t * 5);
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

const CrowdGroup = React.memo(({ 
  location, gridSize, isMapView, policeState, policePath, policePosIndex 
}: { 
  location: GridPoint | null, gridSize: GridPoint, isMapView: boolean,
  policeState: string, policePath: GridPoint[], policePosIndex: number 
}) => {
  const groupRef = useRef<THREE.Group>(null);
  
  // Create ~15 simple capsule meshes clustered
  const people = useMemo(() => {
    return Array.from({ length: 15 }).map((_, i) => {
      const offsetX = (Math.random() - 0.5) * 1.5;
      const offsetZ = (Math.random() - 0.5) * 1.5;
      return { x: offsetX, z: offsetZ };
    });
  }, [location?.x, location?.y]);

  useFrame((state, delta) => {
    if (!groupRef.current || !location) return;
    if (policeState === 'departing' && policePath.length > 0 && policePosIndex < policePath.length) {
      // Follow the police car but lag slightly behind
      const targetPoint = policePath[Math.max(0, policePosIndex - 1)]; 
      const [tx, ty, tz] = getGridPosition(targetPoint, gridSize, 0, isMapView);
      const targetPos = new THREE.Vector3(tx, ty, tz);
      groupRef.current.position.lerp(targetPos, delta * 3);
    } else if (policeState === 'idle' || policeState === 'en_route') {
      const [cx, cy, cz] = getGridPosition(location, gridSize, 0, isMapView);
      groupRef.current.position.lerp(new THREE.Vector3(cx, cy, cz), delta * 5);
    }
  });

  if (!location) return null;

  return (
    <group ref={groupRef}>
      {people.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]}>
           <mesh position={[0, 0.4, 0]}>
             <capsuleGeometry args={[0.15, 0.5, 4, 8]} />
             <meshStandardMaterial color="#f97316" roughness={0.7} />
           </mesh>
           <mesh position={[0, 0.85, 0]}>
             <sphereGeometry args={[0.2, 8, 8]} />
             <meshStandardMaterial color="#fcd34d" />
           </mesh>
        </group>
      ))}
    </group>
  );
});

const PoliceCar = React.memo(({
  path, currentIndex, isMapView, gridSize, policeState, onReachNode, onMissionComplete
}: {
  path: GridPoint[];
  currentIndex: number;
  isMapView: boolean;
  gridSize: GridPoint;
  policeState: string;
  onReachNode: (idx: number) => void;
  onMissionComplete: () => void;
}) => {
  const ref = useRef<THREE.Group>(null);
  const lightsRef = useRef<THREE.Group>(null);
  const isMovingRef = useRef(false);

  useFrame((state, delta) => {
    if (!ref.current) return;
    
    // Flashing lights
    if (lightsRef.current && (policeState === 'en_route' || policeState === 'departing' || policeState === 'arrived')) {
       const time = state.clock.getElapsedTime();
       const isRed = (time % 0.5) < 0.25;
       const redLight = lightsRef.current.children[0] as THREE.PointLight;
       const blueLight = lightsRef.current.children[1] as THREE.PointLight;
       redLight.intensity = isRed ? 2 : 0;
       blueLight.intensity = !isRed ? 2 : 0;
    }

    if (policeState === 'en_route' || policeState === 'departing') {
      if (currentIndex < path.length) {
        const targetPoint = path[currentIndex];
        const [tx, ty, tz] = getGridPosition(targetPoint, gridSize, 0.2, isMapView);
        const targetPos = new THREE.Vector3(tx, ty, tz);
        
        if (!isMovingRef.current) isMovingRef.current = true;
        
        ref.current.position.lerp(targetPos, delta * 15);
        
        const dir = targetPos.clone().sub(ref.current.position);
        if (dir.lengthSq() > 0.001) {
          const targetRot = Math.atan2(dir.x, dir.z);
          const currentRot = ref.current.rotation.y;
          let diff = targetRot - currentRot;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          ref.current.rotation.y += diff * delta * 10;
        }

        if (ref.current.position.distanceTo(targetPos) < 0.1) {
          if (currentIndex < path.length - 1) {
            onReachNode(currentIndex + 1);
          } else {
            isMovingRef.current = false;
            onMissionComplete();
          }
        }
      }
    }
  });

  if (policeState === 'idle' || path.length === 0) return null;

  return (
    <group ref={ref}>
      <mesh position={[0, 0.4, 0]}>
        <boxGeometry args={[0.7, 0.5, 1.4]} />
        <meshStandardMaterial color="#0033aa" />
      </mesh>
      <mesh position={[0, 0.7, -0.1]}>
        <boxGeometry args={[0.6, 0.3, 0.8]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <group ref={lightsRef} position={[0, 0.9, -0.1]}>
        <pointLight position={[-0.2, 0, 0]} color="red" distance={5} />
        <pointLight position={[0.2, 0, 0]} color="blue" distance={5} />
      </group>
    </group>
  );
});

const Robot = React.memo(({
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
  onObstacleDetected: (obsPos: GridPoint) => void;
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
      // --- Sensor Logic: Check for dynamic obstacles ahead ---
      if (dynamicObstaclesRef && dynamicObstaclesRef.current.length > 0) {
        // Look ahead 5 steps to calculate diversion asynchronously before hitting the obstacle
        const upcomingPath = path.slice(currentIndex, currentIndex + 5);
        let immediateBlock = false;
        for (const obs of dynamicObstaclesRef.current) {
          const obsTarget = obs.path[Math.min(obs.currentIndex, obs.path.length - 1)];
          for (const p of upcomingPath) {
            if ((p.x === obs.pos.x && p.y === obs.pos.y) || (p.x === obsTarget.x && p.y === obsTarget.y)) {
              onObstacleDetected(obs.pos);
              if (currentIndex + 1 < path.length && p.x === path[currentIndex + 1].x && p.y === path[currentIndex + 1].y) {
                 immediateBlock = true;
              }
            }
          }
        }
        if (immediateBlock) return; // Only pause if the very next node is blocked
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
      <DetailedRobot isMoving={isMoving} />
    </group>
  );
});

// 3D Line component for path visualization
const PathLine = React.memo(({ path, currentIndex, gridSize, isMapView, color = "#00ffff", opacity = 0.8 }: { path: GridPoint[], currentIndex: number, gridSize: GridPoint, isMapView: boolean, color?: string, opacity?: number }) => {
  const remainingPath = path.slice(currentIndex);
  if (remainingPath.length < 2) return null;
  const points = remainingPath.map(p => {
    const [x, y, z] = getGridPosition(p, gridSize, 0.1, isMapView);
    return new THREE.Vector3(x, y, z);
  });

  return (
    <Line points={points} color={color} lineWidth={4} opacity={opacity} transparent />
  );
});

const EnvironmentMap = React.memo(({ mapData, isTargeting, onMapClick, isNight }: { mapData: MapData, isTargeting?: boolean, onMapClick?: (p: THREE.Vector3) => void | Promise<void>, isNight?: boolean }) => {
  const { gridSize } = mapData;

  // 1. Scenic Mountain Ring (Clean, evenly spaced semi-circle)
  const mountains = React.useMemo(() => {
    const arr = [];
    const numMountains = 12; // Far fewer, distinct mountains
    const radius = 250;
    // Semi-circle behind the university (from angle -PI/4 to 5PI/4)
    for (let i = 0; i <= numMountains; i++) {
      const angle = -Math.PI / 4 + (i / numMountains) * (1.5 * Math.PI);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      // Fixed, clean proportions
      arr.push({ x, z, height: 60, radius: 40 });
    }
    return arr;
  }, []);

  // 2. Organized City Grid (Right side of the map)
  const cityBuildings = React.useMemo(() => {
    const arr = [];
    const startX = gridSize.x / 2 + 50;
    const startZ = -gridSize.y / 2 + 20;
    const rows = 4;
    const cols = 5;
    const spacing = 15;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = startX + c * spacing;
        const z = startZ + r * spacing;
        // Clean alternating heights
        const height = (r + c) % 2 === 0 ? 25 : 15;
        arr.push({ x, z, width: 8, depth: 8, height });
      }
    }
    return arr;
  }, [gridSize]);

  // 3. Orchard-Style Tree Placement (Left and Front side)
  const trees = React.useMemo(() => {
    const arr = [];
    // A clean 10x10 grid of trees on the left
    const startX = -gridSize.x / 2 - 40;
    const startZ = -40;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        arr.push({ x: startX - c * 8, z: startZ + r * 8 });
      }
    }
    
    // A clean row of trees lining the front road
    for (let i = 0; i < 15; i++) {
        arr.push({ x: -60 + i * 8, z: gridSize.y / 2 + 30 });
    }
    return arr;
  }, [gridSize]);

  return (
    <group>
      {/* Base Interaction Plane (Transparent, original grid) */}
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
        onPointerOver={() => { if (isTargeting) document.body.style.cursor = 'crosshair'; }}
        onPointerOut={() => { if (isTargeting) document.body.style.cursor = 'auto'; }}
      >
        <meshStandardMaterial color="#bbf7d0" opacity={0} transparent />
      </Plane>

      {/* INFINITE Horizon Plane (Clean Dark Green Base) */}
      <Plane args={[10000, 10000]} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
        <meshStandardMaterial color={isNight ? "#062113" : "#3b6b2b"} roughness={1.0} />
      </Plane>

      {/* Inner University Grass Platform */}
      <Plane args={[gridSize.x + 30, gridSize.y + 30]} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
        <meshStandardMaterial color={isNight ? "#143317" : "#5d8f43"} roughness={0.9} />
      </Plane>

      {/* Clean Straight Roads */}
      {/* Horizontal Highway (Front) */}
      <Plane args={[400, 10]} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, gridSize.y / 2 + 15]} receiveShadow>
         <meshStandardMaterial color={isNight ? "#1f2937" : "#6b7280"} roughness={0.8} />
      </Plane>
      {/* Vertical Highway (Right) leading to City */}
      <Plane args={[10, 400]} rotation={[-Math.PI / 2, 0, 0]} position={[gridSize.x / 2 + 25, -0.05, 0]} receiveShadow>
         <meshStandardMaterial color={isNight ? "#1f2937" : "#6b7280"} roughness={0.8} />
      </Plane>

      {/* Smooth River (Flowing from the Waterfall) */}
      <Plane args={[20, 250]} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, -180]} receiveShadow>
        <meshStandardMaterial color={isNight ? "#1e3a8a" : "#3b82f6"} roughness={0.1} metalness={0.8} />
      </Plane>

      {/* Distant Scenic Mountains */}
      <group>
        <Instances castShadow receiveShadow>
          <coneGeometry args={[1, 1, 4]} />
          <meshStandardMaterial color={isNight ? "#292524" : "#57534e"} roughness={1.0} />
          {mountains.map((m, i) => (
             <Instance key={`mountain-base-${i}`} position={[m.x, m.height/2 - 0.5, m.z]} scale={[m.radius, m.height, m.radius]} />
          ))}
        </Instances>
        <Instances>
          <coneGeometry args={[1, 1, 4]} />
          <meshStandardMaterial color={isNight ? "#e7e5e4" : "#ffffff"} roughness={0.8} />
          {mountains.map((m, i) => (
             <Instance key={`mountain-snow-${i}`} position={[m.x, m.height - (m.height * 0.2) - 0.5, m.z]} scale={[m.radius * 0.45, m.height * 0.45, m.radius * 0.45]} />
          ))}
        </Instances>
        
        {/* Dedicated Grand Waterfall Mountain (Back Center) */}
        <group position={[0, -0.5, -300]}>
            <mesh position={[0, 45, 0]} castShadow receiveShadow>
                <coneGeometry args={[50, 90, 4]} />
                <meshStandardMaterial color={isNight ? "#292524" : "#57534e"} roughness={1.0} />
            </mesh>
            <mesh position={[0, 72, 0]}>
                <coneGeometry args={[22, 36, 4]} />
                <meshStandardMaterial color={isNight ? "#e7e5e4" : "#ffffff"} roughness={0.8} />
            </mesh>
            {/* Simplified Waterfall structure (a clean box instead of an angled plane to avoid math complexity) */}
            <mesh position={[0, 40, 20]} castShadow>
                <boxGeometry args={[8, 80, 2]} />
                <meshStandardMaterial color={isNight ? "#60a5fa" : "#7dd3fc"} roughness={0.2} metalness={0.6} emissive={isNight ? "#1d4ed8" : "#38bdf8"} emissiveIntensity={0.5} />
            </mesh>
        </group>
      </group>

      {/* Clean Organized City */}
      <Instances castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={isNight ? "#374151" : "#e5e7eb"} roughness={0.6} />
        {cityBuildings.map((b, i) => (
           <Instance key={`city-${i}`} position={[b.x, b.height/2 - 0.5, b.z]} scale={[b.width, b.height, b.depth]} />
        ))}
      </Instances>

      {/* Orchard-Style Structured Trees */}
      <group>
        <Instances castShadow receiveShadow>
          <cylinderGeometry args={[0.2, 0.2, 0.8]} />
          <meshStandardMaterial color="#5c3619" />
          {trees.map((t, i) => (
             <Instance key={`tree-trunk-${i}`} position={[t.x, 0.4, t.z]} />
          ))}
        </Instances>
        <Instances castShadow receiveShadow>
          <coneGeometry args={[1.2, 3]} />
          <meshStandardMaterial color={isNight ? "#064e3b" : "#22c55e"} roughness={0.9} />
          {trees.map((t, i) => (
             <Instance key={`tree-leaves-${i}`} position={[t.x, 1.8, t.z]} />
          ))}
        </Instances>
      </group>
    </group>
  );
});

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
  const [isNight, setIsNight] = useState(false);

  const [isFollowing, setIsFollowing] = useState(false);
  const [triggerReset, setTriggerReset] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showReasoningLog, setShowReasoningLog] = useState(false);
  
  const [aiExplanations, setAiExplanations] = useState<string[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);

  const handleRoomClick = async (room: Room) => {
    setSelectedRoom(room);
    if (!mapData) return;
    if (robotState === 'idle' || robotState === 'patrol') {
      const target = room.door || room.start;
      addExplanation(`User selected ${room.name}. Navigating immediately.`);
      const currentLoc = path.length > 0 ? path[Math.min(currentPosIndex, path.length - 1)] : mapData.start;
      const newPath = await calculatePathAsync(currentLoc, target, [...(mapData.obstacles || []), ...userBlockers], mapData);
      
      if (newPath.length > 0) {
        setPath(newPath);
        setCurrentPosIndex(0);
        setRobotState('mission');
        setIsPlaying(true);
        setIsIdleMode(false);
      } else {
        addExplanation(`Cannot find path to ${room.name}.`);
      }
    }
  };
  const [isEmergencyTargeting, setIsEmergencyTargeting] = useState(false);
  const [isCrowdTargeting, setIsCrowdTargeting] = useState(false);
  const [crowdLocation, setCrowdLocation] = useState<GridPoint | null>(null);
  
  // Police State
  const [policeState, setPoliceState] = useState<'idle' | 'en_route' | 'arrived' | 'departing'>('idle');
  const [policePath, setPolicePath] = useState<GridPoint[]>([]);
  const [policePosIndex, setPolicePosIndex] = useState(0);
  const [isRobotWaitingForPolice, setIsRobotWaitingForPolice] = useState(false);
  const [isPoliceAlertActive, setIsPoliceAlertActive] = useState(false);
  const [isPlacingBlocker, setIsPlacingBlocker] = useState(false);
  const [isIdleMode, setIsIdleMode] = useState(false);
  const [savedMission, setSavedMission] = useState<{remainingPath: GridPoint[], state: any} | null>(null);
  const [userBlockers, setUserBlockers] = useState<GridPoint[]>([]);

  // Recalculate path dynamically if obstacles are added while moving, or auto-resume if barriers are cleared
  useEffect(() => {
    (async () => {
    const allObstacles = [...(mapData?.obstacles || []), ...userBlockers];
    
    // 1. Auto-Resume Logic (if waiting due to barriers)
    if (isIdleMode && savedMission && savedMission.remainingPath && mapData) {
      const currentLoc = path.length > 0 ? path[Math.min(currentPosIndex, path.length - 1)] : mapData.start;
      
      // Extract key waypoints from the remaining path to preserve stops (e.g. at an emergency site)
      const waypoints = savedMission.remainingPath.filter((p, i) => i > 0 && p.x === savedMission.remainingPath[i-1].x && p.y === savedMission.remainingPath[i-1].y && p.f === savedMission.remainingPath[i-1].f);
      if (savedMission.remainingPath.length > 0) waypoints.push(savedMission.remainingPath[savedMission.remainingPath.length - 1]);
      
      let canResume = true;
      let fullResumePath: GridPoint[] = [];
      let startLoc = currentLoc;
      
      for (const wp of waypoints) {
         const segment = await calculatePathAsync(startLoc, wp, allObstacles, mapData);
         if (segment.length === 0) { canResume = false; break; }
         fullResumePath = [...fullResumePath, ...segment.slice(fullResumePath.length > 0 ? 1 : 0), wp]; // Append segment and add the pause explicitly
         startLoc = wp;
      }
      
      if (canResume && fullResumePath.length > 0) {
        setPath(fullResumePath);
        setCurrentPosIndex(0);
        setRobotState(savedMission.state);
        setIsPlaying(true);
        setIsIdleMode(false);
        setSavedMission(null);
        addExplanation(`Path cleared! Automatically resuming mission to destination.`);
        return; // Skip blockage checks this frame
      }
    }

    // 2. Dynamic Rerouting & Auto-Parking Logic
    if (isPlaying && path.length > 0 && currentPosIndex < path.length && mapData) {
       const currentLoc = path[currentPosIndex];
       const targetLoc = path[path.length - 1];
       // Check if current path is strictly blocked
       const isBlocked = path.slice(currentPosIndex).some(p => 
          userBlockers.some(b => b.x === p.x && b.y === p.y && b.f === p.f)
       );
       
       if (isBlocked) {
         const newPath = await calculatePathAsync(currentLoc, targetLoc, allObstacles, mapData);
         if (newPath.length > 0) {
           setPath(newPath);
           setCurrentPosIndex(0);
           addExplanation("Road blocked! Rerouting to destination...");
         } else {
           // Completely blocked! Save mission and park at nearest accessible room
           let nearestRoom: Room | null = null;
           let nearestPath: GridPoint[] = [];
           let minDist = Infinity;
           
           if (mapData.rooms) {
              for (const r of mapData.rooms) {
                  const p = await calculatePathAsync(currentLoc, r.door || r.start, allObstacles, mapData);
                  if (p.length > 0 && p.length < minDist) {
                      minDist = p.length;
                      nearestRoom = r;
                      nearestPath = p;
                  }
              }
            }
           
           if (nearestRoom && nearestPath.length > 0) {
               setSavedMission({ remainingPath: path.slice(currentPosIndex), state: robotState });
               setPath(nearestPath);
               setCurrentPosIndex(0);
               setRobotState('idle');
               setIsIdleMode(true);
               addExplanation(`Road completely blocked! Parking safely at ${nearestRoom.name} and waiting for clear path.`);
           } else {
               setIsPlaying(false);
               setRobotState('idle');
               setIsIdleMode(true);
               addExplanation("Road completely blocked and no safe parking available! Halting.");
           }
         }
       }
    }
    })();
  }, [userBlockers]);
  
  const [dynamicObstacles, setDynamicObstacles] = useState<DynamicObstacle[]>([]);
  const dynamicObstaclesRef = useRef<DynamicObstacle[]>([]);
  const isRecalculating = useRef(false);

  const [battery, setBattery] = useState(100);
  const [robotState, setRobotState] = useState<RobotState>('off');
  const [isOn, setIsOn] = useState(false);
  const batteryRef = useRef(100);
  const robotStateRef = useRef<RobotState>('idle');
  const originalMissionRef = useRef<{path: GridPoint[], index: number, state?: RobotState} | null>(null);
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
  const justPoweredOnRef = useRef(false);
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

  const togglePower = async () => {
    if (isOn) {
      setIsOn(false);
      addExplanation("Powering OFF. Returning to Robot Home for standby and charging...");
      originalMissionRef.current = null;
      const homeRoom = mapData?.rooms?.find(r => r.name.toLowerCase().includes('generator')) || mapData?.rooms?.[0];
      if (homeRoom && mapData) {
        const currentLoc = path.length > 0 && currentPosIndex < path.length ? path[currentPosIndex] : mapData.start;
        const homePath = await calculatePathAsync(currentLoc, homeRoom.door || homeRoom.start, [...(mapData.obstacles || []), ...userBlockers], mapData);
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
      justPoweredOnRef.current = true;
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
      if (justPoweredOnRef.current) justPoweredOnRef.current = false;
      
      timeout = setTimeout(async () => {
        if (!mapData || !mapData.rooms) return;
        addExplanation('Initiating autonomous patrol mode.');
        const currentLoc = path.length > 0 ? path[currentPosIndex] : mapData.start;
        const randomRoom = mapData.rooms[Math.floor(Math.random() * mapData.rooms.length)];
        const patrolPath = await calculatePathAsync(currentLoc, randomRoom.door || randomRoom.start, [...(mapData.obstacles || []), ...userBlockers], mapData);
        if (patrolPath.length > 0) {
          setPath(patrolPath);
          setCurrentPosIndex(0);
          setRobotState('patrol');
          setIsPlaying(true);
        }
      }, 2500);
    }
    prevIsIdleMode.current = isIdleMode;
    return () => clearTimeout(timeout);
  }, [robotState, isPlaying, path, currentPosIndex, mapData, isOn, isIdleMode]);

  const initializeDynamicObstacles = async (robotPath?: GridPoint[]) => {
    if (!mapData || !mapData.roads || mapData.roads.length < 5) return;
    const roads = mapData.roads;
    const obs: DynamicObstacle[] = [];
    
    // Spawn 20 people and cars walking/driving around
    for (let i = 0; i < 20; i++) {
      const start = roads[Math.floor(Math.random() * roads.length)];
      const end = roads[Math.floor(Math.random() * roads.length)];
      const path = await calculatePathAsync(start, end, [...(mapData.obstacles || []), ...userBlockers], mapData, true);
      if (path.length > 0) {
        obs.push({
          id: `obs_${i}`,
          type: Math.random() > 0.5 ? 'car' : 'person',
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

  const resumeMissionTo = async (currentLoc: GridPoint, targetLoc: GridPoint) => {
    if (!mapData) return;
    const allObstacles = [...(mapData.obstacles || []), ...userBlockers];
    
    let nextPath = await calculatePathAsync(currentLoc, targetLoc, allObstacles, mapData);
    if (nextPath.length === 0) {
      nextPath = await calculateLongPathAsync(currentLoc, targetLoc, allObstacles, mapData);
      if (nextPath.length > 0) {
        addExplanation(`Taking a detour to reach target.`);
      }
    }
    
    if (nextPath.length > 0) {
      setPath(nextPath);
      setActivePathColor('#00ffff');
      setCurrentPosIndex(0);
      setRobotState(prev => {
        if (prev === 'evading_obstacle' && originalMissionRef.current?.state) {
          return originalMissionRef.current.state;
        }
        return prev === 'mission' ? 'mission' : 'patrol';
      });
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

  const resetSimulation = async () => {
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
      const fPath = await calculatePathAsync(currentLoc, target, [...(mapData.obstacles || []), ...userBlockers], mapData);
      const rPath = await calculatePathAsync(target, emergencyLoc, [...(mapData.obstacles || []), ...userBlockers], mapData);
      if (fPath.length > 0 && rPath.length > 0) {
        initialPath = [...fPath, fPath[fPath.length - 1], ...rPath.slice(1)];
      } else {
        initialPath = fPath;
      }
      setActivePathColor('#00ffff');
    } else {
      const fPath = await calculatePathAsync(currentLoc, target, [...(mapData.obstacles || []), ...userBlockers], mapData);
      let sPath = await calculateLongPathAsync(currentLoc, target, [...(mapData.obstacles || []), ...userBlockers], mapData);
      if (sPath.length === 0) sPath = await calculatePathAsync(currentLoc, target, [...(mapData.obstacles || []), ...userBlockers], mapData);
      
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
    
    setTimeout(async () => {
          const currentLoc = path[currentPosIndex] || mapData.start;
      const chargePath = await calculatePathAsync(currentLoc, generatorRoom.door || generatorRoom.start, [...(mapData.obstacles || []), ...userBlockers], mapData);
      setPath(chargePath);
      setCurrentPosIndex(0);
      setRobotState('returning_home');
      setIsOn(false);
      setIsPlaying(true);
      isRecalculating.current = false;
    }, 1500);
  };

  const handleChargeComplete = async () => {
    if (!mapData) return;
    
    if (robotStateRef.current === 'off' || !isOn) {
      addExplanation(`Charge complete! Battery at 100%. Remaining in Power OFF mode.`);
      return;
    }

    addExplanation(`Charge complete! Resuming operations.`);
    const orig = originalMissionRef.current;
    
    setTimeout(async () => {
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

  const handleEmergencyCall = async (targetPos: GridPoint) => {
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
    const emergencyPath = await calculatePathAsync(currentLoc, targetPos, [...(mapData.obstacles || []), ...userBlockers], mapData);
    
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

  const handleCrowdEmergency = async (targetPos: GridPoint) => {
    if (!isOn) {
      addExplanation("Crowd detected! Powering ON to respond to critical emergency.");
      setIsOn(true);
      justPoweredOnRef.current = true;
      turnOffAfterEmergencyRef.current = true;
    } else {
      turnOffAfterEmergencyRef.current = false;
    }
    
    if (!mapData) return;
    
    addExplanation(`CROWD CONTROL MODE: Diverting immediately to (${targetPos.x}, ${targetPos.y})!`);
    setIsPlaying(false);
    isRecalculating.current = true;
    
    if (!originalMissionRef.current && path.length > 0 && robotState !== 'idle') {
      originalMissionRef.current = { path: [...path], index: currentPosIndex };
    }
    
    const currentLoc = (path.length > 0 && currentPosIndex < path.length) ? path[currentPosIndex] : mapData.start;
    const emergencyPath = await calculatePathAsync(currentLoc, targetPos, [...(mapData.obstacles || []), ...userBlockers], mapData);
    
    if (emergencyPath.length > 0) {
      setPath(emergencyPath);
      setActivePathColor('#a855f7'); // Purple path for crowd control
      setCurrentPosIndex(0);
      setRobotState('crowd_response');
      setIsPlaying(true);
    } else {
      addExplanation(`Crowd control route calculation failed. Unable to reach target.`);
      setIsPlaying(true);
    }
    isRecalculating.current = false;
  };

  const handleEmergencyComplete = async () => {
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
    const handleRemoteApprove = async () => {
      if (!mapData) return;
      if (turnOffAfterEmergencyRef.current) {
         addExplanation("Emergency override complete. Returning to Robot Home to power off.");
         turnOffAfterEmergencyRef.current = false;
         setIsOn(false);
         originalMissionRef.current = null;
         const homeRoom = mapData?.rooms?.find(r => r.name.toLowerCase().includes('generator')) || mapData?.rooms?.[0];
         if (homeRoom) {
           const currentLoc = path[path.length - 1] || mapData.start;
           const homePath = await calculatePathAsync(currentLoc, homeRoom.door || homeRoom.start, [...(mapData.obstacles || []), ...userBlockers], mapData);
           setPath(homePath);
           setCurrentPosIndex(0);
           setRobotState('returning_home');
           setIsPlaying(true);
         }
      } else {
         addExplanation(`Emergency resolved. Returning to patrol mode.`);
         const currentLoc = path[path.length - 1] || mapData.start;
         const randomRoom = mapData.rooms[Math.floor(Math.random() * mapData.rooms.length)];
         const patrolPath = await calculatePathAsync(currentLoc, randomRoom.door || randomRoom.start, [...(mapData.obstacles || []), ...userBlockers], mapData);
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

  const handleObstacleDetected = async (obsPos: GridPoint) => {
    if (isRecalculating.current) return;
    isRecalculating.current = true;
    
    addExplanation(`CRITICAL: Dynamic Obstacle detected at (${obsPos.x}, ${obsPos.y}). Rerouting instantly...`);
    
    if (!mapData) {
       isRecalculating.current = false;
       return;
    }
    const currentLoc = path[currentPosIndex];
    const targetLoc = path[path.length - 1];
    
    // We treat all dynamic obstacles (and their immediate next step) as hard blockages for this local recalculation
    const allDynamicObs = dynamicObstaclesRef.current.flatMap(o => {
      const oTarget = o.path[Math.min(o.currentIndex, o.path.length - 1)];
      return [o.pos, oTarget];
    });
    const allObstacles = [...(mapData.obstacles || []), ...userBlockers, ...allDynamicObs, obsPos];
    
    let intermediateTarget = null;
    for (let i = currentPosIndex; i < path.length - 1; i++) {
      if (path[i].x === path[i+1].x && path[i].y === path[i+1].y && path[i].f === path[i+1].f) {
        intermediateTarget = path[i];
        break;
      }
    }
    
    let newPath: GridPoint[] = [];
    if (intermediateTarget) {
      const fPath = await calculatePathAsync(currentLoc, intermediateTarget, allObstacles, mapData);
      const rPath = await calculatePathAsync(intermediateTarget, targetLoc, allObstacles, mapData);
      if (fPath.length > 0 && rPath.length > 0) {
        newPath = [...fPath, ...rPath.slice(1)];
      }
    } else {
      newPath = await calculatePathAsync(currentLoc, targetLoc, allObstacles, mapData);
    }
    
    if (newPath.length === 0) {
      if (intermediateTarget) {
         const fPath = await calculateLongPathAsync(currentLoc, intermediateTarget, allObstacles, mapData);
         const rPath = await calculateLongPathAsync(intermediateTarget, targetLoc, allObstacles, mapData);
         if (fPath.length > 0 && rPath.length > 0) {
           newPath = [...fPath, ...rPath.slice(1)];
         }
      } else {
         newPath = await calculateLongPathAsync(currentLoc, targetLoc, allObstacles, mapData);
      }
    }
    
    if (newPath.length > 0) {
      setPath(newPath);
      setCurrentPosIndex(0);
      setIsPlaying(true);
      addExplanation(`Successfully found alternative route avoiding obstacle! Resuming mission.`);
      setTimeout(() => { isRecalculating.current = false; }, 200); // 200ms cooldown
    } else {
      const reverseSteps = Math.min(currentPosIndex, 4);
      if (reverseSteps > 0) {
        addExplanation(`Path completely blocked! Reversing ${reverseSteps} steps to evade obstacle...`);
        const reversePath = [];
        for (let i = currentPosIndex; i >= currentPosIndex - reverseSteps; i--) {
            reversePath.push(path[i]);
        }
        if (robotState !== 'evading_obstacle' && robotState !== 'charging' && robotState !== 'emergency_response') {
            originalMissionRef.current = { path: [...path], index: currentPosIndex, state: robotState };
        }
        setPath(reversePath);
        setCurrentPosIndex(0);
        setRobotState('evading_obstacle');
        setIsPlaying(true);
        isRecalculating.current = false;
      } else {
        addExplanation(`Blocked at starting position. Waiting for obstacle to clear...`);
        if (robotState !== 'evading_obstacle' && robotState !== 'charging' && robotState !== 'emergency_response') {
            originalMissionRef.current = { path: [...path], index: currentPosIndex, state: robotState };
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


  const startSimulation = async () => { 
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

  const handlePoliceReachNode = React.useCallback((idx: number) => {
    setPolicePosIndex(idx);
  }, []);

  const handlePoliceMissionComplete = React.useCallback(() => {
    if (policeState === 'en_route') {
      setPoliceState('arrived');
      addExplanation('Police arrived at the scene. Loading crowd...');
      setTimeout(async () => {
        if (!mapData || !crowdLocation) return;
        addExplanation('Crowd secured. Police departing to safety...');
        const startLoc = mapData.start; // return to map edge
        const returnPath = await calculatePathAsync(crowdLocation, startLoc, [...(mapData.obstacles || []), ...userBlockers], mapData);
        if (returnPath.length > 0) {
          setPolicePath(returnPath);
          setPolicePosIndex(0);
          setPoliceState('departing');
          
          setCrowdLocation(null);
          setIsPoliceAlertActive(false);
          setIsRobotWaitingForPolice(false);
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
          setPoliceState('idle');
          setCrowdLocation(null);
          setIsPoliceAlertActive(false);
          setIsRobotWaitingForPolice(false);
          const orig = originalMissionRef.current;
          if (orig && orig.path.length > 0) {
            const target = orig.path[orig.path.length - 1];
            const currentLoc = path[path.length - 1] || mapData!.start;
            resumeMissionTo(currentLoc, target);
          } else {
            setRobotState('idle');
          }
          originalMissionRef.current = null;
        }
      }, 3000);
    } else if (policeState === 'departing') {
      setPoliceState('idle');
      addExplanation('Police have safely left the area.');
    }
  }, [policeState, mapData, crowdLocation, path, userBlockers]);

  const handleCrowdResponseComplete = async () => {
    if (!mapData || !crowdLocation) return;
    addExplanation(`Arrived at crowd location. Securing area and awaiting police vehicle...`);
    setIsPlaying(false);
    setIsRobotWaitingForPolice(true);
    setRobotState('waiting_for_police');
    
    const startLoc = mapData.start; 
    const newPolicePath = await calculatePathAsync(startLoc, crowdLocation, [...(mapData.obstacles || []), ...userBlockers], mapData);
    if (newPolicePath.length > 0) {
      setPolicePath(newPolicePath);
      setPolicePosIndex(0);
      setPoliceState('en_route');
      setIsPoliceAlertActive(true);
    } else {
      addExplanation(`Police route calculation failed. Cannot reach crowd.`);
    }
  };

  const handleMissionComplete = () => {
    if (robotState === 'charging') {
      handleChargeComplete();
    } else if (robotState === 'emergency_response') {
      handleEmergencyComplete();
    } else if (robotState === 'crowd_response') {
      handleCrowdResponseComplete();
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
        
        setTimeout(async () => {
          const currentLoc = path.length > 0 ? path[path.length - 1] : mapData.start;
          const nextPath = await calculatePathAsync(currentLoc, nextTask.location, [...(mapData.obstacles || []), ...userBlockers], mapData);
          
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
        }, 2500);
      } else {
        setIsPlaying(false);
        setRobotState('idle');
        addExplanation('Mission complete. Returning to patrol mode.');
      }
    }
  };

  const handleMapClickRef = useRef<((p: THREE.Vector3) => Promise<void>) | ((p: THREE.Vector3) => void)>(async (p: THREE.Vector3) => {
      const gridP = getGridPointFromVector3(p, mapData!.gridSize);
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
    
    if (isCrowdTargeting) {
      setCrowdLocation(gridP);
      setIsCrowdTargeting(false);
      handleCrowdEmergency(gridP);
      return;
    }

    if (isEmergencyTargeting) {
      setIsEmergencyTargeting(false);
      document.body.style.cursor = 'auto';
      handleEmergencyCall(gridP);
    }
  });
  
  const handleReachNodeRef = useRef(handleReachNode);
  const handleMissionCompleteRef = useRef(handleMissionComplete);
  const handleObstacleDetectedRef = useRef(handleObstacleDetected);

  useEffect(() => {
    handleReachNodeRef.current = handleReachNode;
    handleMissionCompleteRef.current = handleMissionComplete;
    handleObstacleDetectedRef.current = handleObstacleDetected;
    handleMapClickRef.current = (p: THREE.Vector3) => {
      const gridP = getGridPointFromVector3(p, mapData!.gridSize);
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
      
      if (isCrowdTargeting) {
        setCrowdLocation(gridP);
        setIsCrowdTargeting(false);
        handleCrowdEmergency(gridP);
        return;
      }

      setIsEmergencyTargeting(false);
      document.body.style.cursor = 'auto';
      handleEmergencyCall(gridP);
    };
  });

  const stableHandleReachNode = React.useCallback((index: number) => handleReachNodeRef.current(index), []);
  const stableHandleMissionComplete = React.useCallback(() => handleMissionCompleteRef.current(), []);
  const stableHandleObstacleDetected = React.useCallback((p: GridPoint) => handleObstacleDetectedRef.current(p), []);
  const stableHandleMapClick = React.useCallback((p: THREE.Vector3) => handleMapClickRef.current(p), []);

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
    
    setTimeout(async () => {
          const currentLoc = path.length > 0 && currentPosIndex < path.length ? path[currentPosIndex] : mapData.start;
      
      if (robotStateRef.current === 'emergency_response') {
         const emergencyLoc = path.length > 0 ? path[path.length - 1] : mapData.start;
         const forwardPath = await calculatePathAsync(currentLoc, targetPos, [...(mapData.obstacles || []), ...userBlockers], mapData);
         const returnPath = await calculatePathAsync(targetPos, emergencyLoc, [...(mapData.obstacles || []), ...userBlockers], mapData);
         
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
         const shortPath = await calculatePathAsync(currentLoc, targetPos, [...(mapData.obstacles || []), ...userBlockers], mapData);
         
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
              onClick={() => setIsNight(!isNight)}
              className="px-3 py-1.5 rounded-md text-xs font-bold bg-purple-600 text-white shadow-lg hover:bg-purple-700 transition-colors"
            >
              {isNight ? 'Switch to Day' : 'Switch to Night'}
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
        <Canvas shadows gl={{ antialias: false, powerPreference: "high-performance" }} dpr={[1, 1.5]}>
          <color attach="background" args={[isNight ? '#0b0f19' : '#87ceeb']} />
          {/* Camera */}
          {isMapView ? (
            <OrthographicCamera makeDefault position={[0, 100, 0]} zoom={6} near={0.1} far={1000} />
          ) : (
            <PerspectiveCamera makeDefault position={[0, gridSize.y * 0.55, gridSize.y * 0.85]} fov={55} />
          )}
          {/* Lighting */}
          <ambientLight intensity={isNight ? 0.2 : 0.7} />
          
          {/* Sun / Moon Light */}
          <directionalLight
            position={isNight ? [-20, 30, -20] : [20, 30, 20]}
            intensity={isNight ? 0.3 : 1.8}
            color={isNight ? "#60a5fa" : "#ffffff"}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-near={0.5}
            shadow-camera-far={200}
            shadow-camera-left={-80}
            shadow-camera-right={80}
            shadow-camera-top={80}
            shadow-camera-bottom={-80}
          />
          
          {/* Sun / Moon Mesh */}
          <mesh position={isNight ? [-40, 60, -40] : [40, 60, 40]}>
            <sphereGeometry args={[4, 32, 32]} />
            <meshBasicMaterial color={isNight ? "#e2e8f0" : "#fef08a"} />
          </mesh>

          <pointLight position={[0, 8, 0]} intensity={isNight ? 0.2 : 0.6} color="#60a5fa" />
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
            maxDistance={gridSize.y * 1.5}
            minZoom={isMapView ? 3.5 : 0}
          />
          <CrowdGroup location={crowdLocation} gridSize={gridSize} isMapView={isMapView} policeState={policeState} policePath={policePath} policePosIndex={policePosIndex} />
          <PoliceCar path={policePath} currentIndex={policePosIndex} isMapView={isMapView} gridSize={gridSize} policeState={policeState} onReachNode={handlePoliceReachNode} onMissionComplete={handlePoliceMissionComplete} />
          <EnvironmentMap 
            mapData={mapData} 
            isNight={isNight}
            isTargeting={isEmergencyTargeting || isPlacingBlocker || isCrowdTargeting} 
            onMapClick={stableHandleMapClick} 
          />
          {rooms?.map((room: Room) => {
            const width = (room.end.x - room.start.x + 1) * 0.9;
            const depth = (room.end.y - room.start.y + 1) * 0.9;
            const height = 3;
            const x = (room.start.x + room.end.x) / 2 - gridSize.x / 2;
            const z = (room.start.y + room.end.y) / 2 - gridSize.y / 2;
            return (
              <group key={room.id} position={[x, height / 2, z]} onClick={(e) => { e.stopPropagation(); handleRoomClick(room); }}>
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
              onReachNode={stableHandleReachNode}
              onMissionComplete={stableHandleMissionComplete}
              onObstacleDetected={stableHandleObstacleDetected}
              robotPosRef={robotPosRef}
              robotRotRef={robotRotRef}
            />
          )}
        </Canvas>
      </div>

      {/* Police Alert Banner */}
      {isPoliceAlertActive && (
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-[200] animate-pulse">
          <div className="bg-blue-600 border-2 border-blue-400 text-white font-black tracking-widest px-8 py-3 rounded-full shadow-[0_0_20px_rgba(37,99,235,0.8)] flex items-center gap-3 text-lg">
            <span className="text-2xl animate-bounce">🚔</span>
            CALLING POLICE...
          </div>
        </div>
      )}

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
                onClick={async () => {
                  const nextIdle = !isIdleMode;
                  setIsIdleMode(nextIdle);
                  if (nextIdle) {
                    // Save current mission state before parking
                    if (path.length > 0) {
                      setSavedMission({ remainingPath: path.slice(currentPosIndex), state: robotState });
                    }
                    
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
                      const parkPath = await calculatePathAsync(currentLoc, nearestRoom.door || nearestRoom.start, allObstacles, mapData);
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
                    // Resume saved mission if any
                    if (savedMission && savedMission.remainingPath && mapData) {
                      const currentLoc = path.length > 0 ? path[Math.min(currentPosIndex, path.length - 1)] : mapData.start;
                      const allObstacles = [...(mapData.obstacles || []), ...userBlockers];
                      
                      const waypoints = savedMission.remainingPath.filter((p, i) => i > 0 && p.x === savedMission.remainingPath[i-1].x && p.y === savedMission.remainingPath[i-1].y && p.f === savedMission.remainingPath[i-1].f);
                      if (savedMission.remainingPath.length > 0) waypoints.push(savedMission.remainingPath[savedMission.remainingPath.length - 1]);
                      
                      let canResume = true;
                      let fullResumePath: GridPoint[] = [];
                      let startLoc = currentLoc;
                      
                      for (const wp of waypoints) {
                         const segment = await calculatePathAsync(startLoc, wp, allObstacles, mapData);
                         if (segment.length === 0) { canResume = false; break; }
                         fullResumePath = [...fullResumePath, ...segment.slice(fullResumePath.length > 0 ? 1 : 0), wp];
                         startLoc = wp;
                      }
                      
                      if (canResume && fullResumePath.length > 0) {
                        setPath(fullResumePath);
                        setCurrentPosIndex(0);
                        setRobotState(savedMission.state);
                        setIsPlaying(true);
                        addExplanation(`Idle mode deactivated. Resuming previous mission.`);
                      } else {
                        setRobotState('patrol');
                        addExplanation("Idle mode deactivated. Path blocked, falling back to patrol.");
                      }
                      setSavedMission(null);
                    } else {
                      setRobotState('patrol');
                      addExplanation("Idle mode deactivated. Resuming patrol.");
                    }
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
              <span className="text-[10px] text-gray-400 block mb-0.5 uppercase">BATTERY</span>
              <div className="flex items-center gap-1.5 mt-1">
                <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div className={`h-full ${battery > 60 ? 'bg-green-500' : battery > 30 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${battery}%` }} />
                </div>
                <span className="text-xs font-bold text-white">{battery}%</span>
              </div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-lg p-2 flex flex-col justify-center">
              <span className="text-[10px] text-gray-500 block mb-0.5">STATUS</span>
              <span className={`text-sm font-bold uppercase ${
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
              <span className="text-[10px] text-gray-500 block mb-0.5">DISTANCE</span>
              <span className="text-base font-bold text-white">{path.length > 0 ? path.length - currentPosIndex : '--'} <span className="text-[10px] font-normal text-gray-500">m</span></span>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-lg p-2">
              <span className="text-[10px] text-gray-500 block mb-0.5">ETA</span>
              <span className="text-base font-bold text-white">{path.length > 0 ? Math.ceil((path.length - currentPosIndex) * 0.5) : '--'} <span className="text-[10px] font-normal text-gray-500">min</span></span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setIsEmergencyTargeting(!isEmergencyTargeting);
                setIsCrowdTargeting(false);
                setIsPlacingBlocker(false);
              }}
              className={`px-3 py-2 border rounded-lg transition-colors flex items-center justify-center gap-2 font-bold text-xs ${isEmergencyTargeting ? 'bg-red-500 text-white border-red-500' : 'bg-red-500/10 text-red-500 border-red-500/30 hover:bg-red-500/20'}`}
              title="Target Emergency"
            >
              <ShieldAlert className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setIsCrowdTargeting(!isCrowdTargeting);
                setIsEmergencyTargeting(false);
                setIsPlacingBlocker(false);
              }}
              className={`px-3 py-2 border rounded-lg transition-colors flex items-center justify-center gap-2 font-bold text-xs ${isCrowdTargeting ? 'bg-orange-500 text-white border-orange-500' : 'bg-orange-500/10 text-orange-500 border-orange-500/30 hover:bg-orange-500/20'}`}
              title="Crowd"
            >
              <Users className="w-4 h-4" /> Crowd
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
                  onClick={() => handleRoomClick(room)}
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

export default SimulationView;
