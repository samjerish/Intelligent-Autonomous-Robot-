import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { GridPoint } from '../types';
import { Flame, ShieldAlert, Crosshair } from 'lucide-react';

const CELL_SIZE = 1;

interface EmergencyLocationMarkerProps {
  position: GridPoint;
  gridSize: GridPoint;
  label?: string;
  type?: 'fire' | 'sos' | 'medical' | 'target' | 'hazard';
  isMapView?: boolean;
  robotPosRef?: React.MutableRefObject<THREE.Vector3 | null>;
  onClear?: () => void;
}

export const EmergencyLocationMarker: React.FC<EmergencyLocationMarkerProps> = ({
  position,
  gridSize,
  label = 'Emergency Point',
  type = 'fire',
  isMapView = false,
  robotPosRef,
  onClear
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const beaconBeamRef = useRef<THREE.Mesh>(null);
  const diamondRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const [distanceText, setDistanceText] = React.useState<string>('--');

  // Compute 3D world coordinate from grid position
  const worldPos = useMemo(() => {
    const offsetX = (gridSize.x * CELL_SIZE) / 2;
    const offsetZ = (gridSize.y * CELL_SIZE) / 2;
    return [
      (position.x * CELL_SIZE) - offsetX + (CELL_SIZE / 2),
      isMapView ? 0.3 : 0.05,
      (position.y * CELL_SIZE) - offsetZ + (CELL_SIZE / 2)
    ] as [number, number, number];
  }, [position, gridSize, isMapView]);

  const targetColor = useMemo(() => {
    switch (type) {
      case 'fire':
      case 'hazard':
        return '#ef4444'; // Red
      case 'sos':
      case 'target':
        return '#f97316'; // Vivid Amber-Orange
      case 'medical':
        return '#ec4899'; // Pink/Rose
      default:
        return '#ef4444';
    }
  }, [type]);

  const targetEmissive = useMemo(() => {
    switch (type) {
      case 'fire':
      case 'hazard':
        return '#dc2626';
      case 'sos':
      case 'target':
        return '#ea580c';
      case 'medical':
        return '#db2777';
      default:
        return '#dc2626';
    }
  }, [type]);

  useFrame((_state) => {
    const t = _state.clock.getElapsedTime();

    // 1. Concentric pulsing ground ripples
    if (ring1Ref.current) {
      const scale1 = 1.0 + ((t * 1.5) % 2.5);
      const op1 = Math.max(0, 1 - (scale1 - 1.0) / 2.5);
      ring1Ref.current.scale.set(scale1, scale1, 1);
      if ((ring1Ref.current.material as THREE.MeshBasicMaterial).opacity !== undefined) {
        (ring1Ref.current.material as THREE.MeshBasicMaterial).opacity = op1 * 0.75;
      }
    }

    if (ring2Ref.current) {
      const scale2 = 1.0 + (((t * 1.5) + 1.25) % 2.5);
      const op2 = Math.max(0, 1 - (scale2 - 1.0) / 2.5);
      ring2Ref.current.scale.set(scale2, scale2, 1);
      if ((ring2Ref.current.material as THREE.MeshBasicMaterial).opacity !== undefined) {
        (ring2Ref.current.material as THREE.MeshBasicMaterial).opacity = op2 * 0.75;
      }
    }

    // 2. Vertical beacon beam pulsing opacity
    if (beaconBeamRef.current && (beaconBeamRef.current.material as THREE.MeshStandardMaterial)) {
      const mat = beaconBeamRef.current.material as THREE.MeshStandardMaterial;
      mat.opacity = 0.35 + 0.25 * Math.sin(t * 8);
    }

    // 3. Floating rotating diamond / icon
    if (diamondRef.current) {
      diamondRef.current.rotation.y = t * 2.5;
      diamondRef.current.position.y = 3.2 + 0.35 * Math.sin(t * 4);
    }

    // 4. Strobe light flicker
    if (lightRef.current) {
      lightRef.current.intensity = 3.5 + 2.5 * Math.sin(t * 12);
    }

    // 5. Update real-time distance from robot every ~10 frames
    if (robotPosRef?.current && Math.floor(t * 10) % 4 === 0) {
      const robotVec = robotPosRef.current;
      const targetVec = new THREE.Vector3(worldPos[0], 0, worldPos[2]);
      const dist = robotVec.distanceTo(targetVec);
      setDistanceText(`${dist.toFixed(1)}m`);
    }
  });

  return (
    <group ref={groupRef} position={worldPos}>
      {/* Dynamic Strobe Point Light */}
      <pointLight
        ref={lightRef}
        color={targetColor}
        distance={18}
        decay={2}
        intensity={4}
        position={[0, 2.5, 0]}
      />

      {/* Ground Tactical Target Pad */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.3, 1.4, 32]} />
        <meshBasicMaterial color={targetColor} transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>

      {/* Target Inner Solid Core */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <circleGeometry args={[0.3, 24]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
      </mesh>

      {/* Concentric Pulsing Ring 1 */}
      <mesh ref={ring1Ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
        <ringGeometry args={[1.5, 1.7, 32]} />
        <meshBasicMaterial color={targetColor} transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>

      {/* Concentric Pulsing Ring 2 */}
      <mesh ref={ring2Ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.026, 0]}>
        <ringGeometry args={[1.5, 1.7, 32]} />
        <meshBasicMaterial color={targetColor} transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>

      {/* Tactical Crosshair Ticks on Ground */}
      {[-1.5, 1.5].map((offset, idx) => (
        <React.Fragment key={idx}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[offset, 0.03, 0]}>
            <planeGeometry args={[0.6, 0.08]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.85} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, offset]}>
            <planeGeometry args={[0.08, 0.6]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.85} />
          </mesh>
        </React.Fragment>
      ))}

      {/* Vertical Light Beacon Column (Disabled in 2D map view for clean top-down view) */}
      {!isMapView && (
        <mesh ref={beaconBeamRef} position={[0, 6, 0]}>
          <cylinderGeometry args={[0.25, 0.8, 12, 16, 1, true]} />
          <meshStandardMaterial
            color={targetColor}
            emissive={targetEmissive}
            emissiveIntensity={2.5}
            transparent
            opacity={0.4}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Floating 3D Holographic Diamond Pin */}
      {!isMapView && (
        <mesh ref={diamondRef} position={[0, 3.2, 0]}>
          <octahedronGeometry args={[0.55, 0]} />
          <meshStandardMaterial
            color={targetColor}
            emissive={targetEmissive}
            emissiveIntensity={3}
            metalness={0.9}
            roughness={0.1}
          />
        </mesh>
      )}

      {/* 3D Floating Cybernetic Tactical HUD Badge */}
      <Html
        position={[0, isMapView ? 2.5 : 4.5, 0]}
        center
        distanceFactor={isMapView ? 35 : 28}
        style={{ pointerEvents: 'auto', userSelect: 'none' }}
      >
        <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
          <div className="flex items-center gap-2 bg-black/90 border-2 border-red-500 text-white px-3 py-1.5 rounded-xl shadow-[0_0_25px_rgba(239,68,68,0.8)] backdrop-blur-md whitespace-nowrap">
            <div className="p-1 rounded-lg bg-red-600/40 text-red-400 border border-red-500/50">
              {type === 'fire' || type === 'hazard' ? (
                <Flame className="w-4 h-4 text-red-400 animate-bounce" />
              ) : type === 'sos' ? (
                <ShieldAlert className="w-4 h-4 text-orange-400 animate-pulse" />
              ) : (
                <Crosshair className="w-4 h-4 text-red-400 animate-spin" />
              )}
            </div>
            <div className="flex flex-col text-left">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping shrink-0" />
                <span className="text-[10px] font-black tracking-widest uppercase text-red-400 font-mono">
                  EMERGENCY LOCATION POINT
                </span>
              </div>
              <div className="text-xs font-black text-white tracking-wide truncate max-w-[200px]">
                {label}
              </div>
              <div className="flex items-center gap-2 text-[9px] font-mono text-gray-300 pt-0.5">
                <span className="text-cyan-300 font-bold">COORDS: ({position.x}, {position.y})</span>
                {distanceText !== '--' && (
                  <span className="bg-red-500/20 px-1 rounded text-red-300 font-bold border border-red-500/40">
                    {distanceText}
                  </span>
                )}
              </div>
            </div>
            {onClear && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                }}
                className="ml-1 p-1 hover:bg-white/10 text-gray-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                title="Clear Marked Emergency Point"
              >
                ✕
              </button>
            )}
          </div>
          {/* Downward pointer triangle */}
          <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-red-500 -mt-[1px]" />
        </div>
      </Html>
    </group>
  );
};
