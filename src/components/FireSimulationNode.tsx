import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { GridPoint } from '../types';

const CELL_SIZE = 1;

interface FireSimulationNodeProps {
  position: GridPoint;
  gridSize: GridPoint;
  intensity?: number;
  onRemove?: () => void;
}

export const FireSimulationNode: React.FC<FireSimulationNodeProps> = ({
  position,
  gridSize,
  intensity = 3,
  onRemove
}) => {
  const fireGroupRef = useRef<THREE.Group>(null);
  const flameMeshRef = useRef<THREE.Mesh>(null);
  const flameMeshInnerRef = useRef<THREE.Mesh>(null);
  const smokeParticlesRef = useRef<THREE.InstancedMesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  
  const smokeCount = 18;
  const smokeData = useMemo(() => {
    return Array.from({ length: smokeCount }, () => ({
      x: (Math.random() - 0.5) * 0.8,
      y: Math.random() * 3.5 + 0.5,
      z: (Math.random() - 0.5) * 0.8,
      speed: 0.8 + Math.random() * 0.8,
      scale: 0.3 + Math.random() * 0.4,
      rotation: Math.random() * Math.PI
    }));
  }, [smokeCount]);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Compute 3D world coordinate from grid position
  const worldPos = useMemo(() => {
    const offsetX = (gridSize.x * CELL_SIZE) / 2;
    const offsetZ = (gridSize.y * CELL_SIZE) / 2;
    return [
      (position.x * CELL_SIZE) - offsetX + (CELL_SIZE / 2),
      0,
      (position.y * CELL_SIZE) - offsetZ + (CELL_SIZE / 2)
    ] as [number, number, number];
  }, [position, gridSize]);

  useFrame((_state, delta) => {
    const t = _state.clock.getElapsedTime();

    // 1. Flame flickering & breathing animation
    const intMult = Math.max(0.5, intensity / 3.0);
    if (flameMeshRef.current) {
      const scaleY = (1.0 + 0.35 * Math.sin(t * 14) + 0.15 * Math.cos(t * 22)) * intMult;
      const scaleXZ = (1.0 + 0.2 * Math.cos(t * 12)) * intMult;
      flameMeshRef.current.scale.set(scaleXZ, scaleY, scaleXZ);
      flameMeshRef.current.rotation.y = t * 1.5;
    }

    if (flameMeshInnerRef.current) {
      const scaleY2 = (1.0 + 0.25 * Math.cos(t * 16)) * intMult;
      const scaleXZ2 = (1.0 + 0.15 * Math.sin(t * 18)) * intMult;
      flameMeshInnerRef.current.scale.set(scaleXZ2, scaleY2, scaleXZ2);
      flameMeshInnerRef.current.rotation.y = -t * 2.0;
    }

    // 2. Dynamic fire point light flicker
    if (lightRef.current) {
      lightRef.current.intensity = (2.5 + 1.5 * Math.sin(t * 20) + 0.8 * Math.cos(t * 31)) * intMult;
    }

    // 3. Smoke particle plume rising and expanding
    if (smokeParticlesRef.current) {
      smokeData.forEach((p, i) => {
        p.y += delta * p.speed;
        p.scale += delta * 0.15;
        // Reset particle when it reaches ceiling
        if (p.y > 4.5) {
          p.y = 0.6;
          p.scale = 0.25 + Math.random() * 0.2;
          p.x = (Math.random() - 0.5) * 0.5;
          p.z = (Math.random() - 0.5) * 0.5;
        }

        dummy.position.set(p.x, p.y, p.z);
        dummy.scale.setScalar(p.scale);
        dummy.rotation.set(0, p.rotation + t * 0.2, 0);
        dummy.updateMatrix();
        smokeParticlesRef.current!.setMatrixAt(i, dummy.matrix);
      });
      smokeParticlesRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group ref={fireGroupRef} position={worldPos}>
      {/* Dynamic fire light */}
      <pointLight
        ref={lightRef}
        color="#ff5500"
        distance={12}
        decay={2}
        intensity={3.5}
        position={[0, 1.2, 0]}
      />

      {/* Base Burn Scorch Mark on ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[1.2, 16]} />
        <meshBasicMaterial color="#1a0d00" transparent opacity={0.8} />
      </mesh>

      {/* Outer Flame Cone */}
      <mesh ref={flameMeshRef} position={[0, 0.8, 0]}>
        <coneGeometry args={[0.7, 1.6, 8]} />
        <meshStandardMaterial
          color="#ff3700"
          emissive="#ff2200"
          emissiveIntensity={2.5}
          roughness={0.1}
          transparent
          opacity={0.85}
        />
      </mesh>

      {/* Inner Hot Yellow Flame Core */}
      <mesh ref={flameMeshInnerRef} position={[0, 0.65, 0]}>
        <coneGeometry args={[0.42, 1.3, 8]} />
        <meshStandardMaterial
          color="#ffdd00"
          emissive="#ffcc00"
          emissiveIntensity={3.5}
          roughness={0.1}
          transparent
          opacity={0.95}
        />
      </mesh>

      {/* Animated Smoke Plume (Instanced Spheres) */}
      <instancedMesh
        ref={smokeParticlesRef}
        args={[undefined as any, undefined as any, smokeCount]}
      >
        <sphereGeometry args={[0.35, 6, 6]} />
        <meshStandardMaterial
          color="#333333"
          roughness={0.9}
          transparent
          opacity={0.4}
        />
      </instancedMesh>

      {/* 3D Label & Remove Pin */}
      <Html position={[0, 2.5, 0]} center style={{ pointerEvents: 'auto' }}>
        <div className="flex items-center gap-1.5 bg-red-950/90 border border-red-500 text-red-200 px-2.5 py-1 rounded-full text-[10px] font-bold shadow-[0_0_15px_rgba(239,68,68,0.7)] whitespace-nowrap backdrop-blur-md select-none">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
          <span>SIMULATED FIRE HAZARD</span>
          {onRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="ml-1 text-red-400 hover:text-white px-1 hover:bg-red-800/50 rounded cursor-pointer"
              title="Extinguish test fire"
            >
              ✕
            </button>
          )}
        </div>
      </Html>
    </group>
  );
};
