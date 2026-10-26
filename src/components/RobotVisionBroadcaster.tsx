import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { GridPoint, FireHazardPoint } from '../types';

export interface DetectedBox {
  id: string;
  type: 'fire' | 'smoke' | 'crowd' | 'emergency' | 'pedestrian' | 'car' | 'obstacle' | 'barricade' | 'building';
  category: 'fire_detection' | 'emergency_detection' | 'navigation';
  label: string;
  confidence: number;
  distance: number;
  boxPercent: { x: number; y: number; w: number; h: number };
  color: string;
}

interface RobotVisionBroadcasterProps {
  robotPosRef: React.MutableRefObject<THREE.Vector3 | null>;
  robotRotRef: React.MutableRefObject<number>;
  speed?: number;
  battery?: number;
  robotState?: string;
  fireHazards?: FireHazardPoint[];
  crowds?: GridPoint[];
  markedEmergencyPoint?: {
    position: GridPoint;
    label: string;
    type: string;
  } | null;
  dynamicObstaclesRef?: React.MutableRefObject<any[]>;
  userBlockers?: GridPoint[];
  isNight?: boolean;
  gridSize?: GridPoint;
  getGridPositionFn: (pt: GridPoint, gridSize: GridPoint, height?: number, isMapView?: boolean) => [number, number, number];
}

export const RobotVisionBroadcaster: React.FC<RobotVisionBroadcasterProps> = ({
  robotPosRef,
  robotRotRef,
  speed = 0,
  battery = 100,
  robotState = 'IDLE',
  fireHazards = [],
  crowds = [],
  markedEmergencyPoint = null,
  dynamicObstaclesRef,
  userBlockers = [],
  isNight = false,
  gridSize = { x: 120, y: 100, f: 1 },
  getGridPositionFn
}) => {
  const { gl, scene } = useThree();
  const [headlights, setHeadlights] = useState(false);
  const lastCaptureTime = useRef(0);
  const targetMeshRef = useRef<THREE.Object3D>(new THREE.Object3D());

  // Headlight toggle remote event listener
  useEffect(() => {
    const handleToggleHeadlight = () => {
      setHeadlights(prev => !prev);
    };
    window.addEventListener('remote_toggle_headlight', handleToggleHeadlight);
    return () => window.removeEventListener('remote_toggle_headlight', handleToggleHeadlight);
  }, []);

  // FPV Camera setup - mounted on robot sensor mast
  const fpvCamera = useMemo(() => {
    const cam = new THREE.PerspectiveCamera(70, 320 / 240, 0.1, 350);
    return cam;
  }, []);

  // Offscreen WebGL render target & 2D canvas buffer (320x240 for high performance + low bandwidth)
  const renderTarget = useMemo(() => {
    return new THREE.WebGLRenderTarget(320, 240, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    });
  }, []);

  const readBuf = useMemo(() => new Uint8Array(320 * 240 * 4), []);
  const readBuf32 = useMemo(() => new Uint32Array(readBuf.buffer), [readBuf]);
  const canvas = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 240;
    (window as any).__ROBOT_VISION_CANVAS__ = c;
    return c;
  }, []);
  const ctx = useMemo(() => canvas.getContext('2d', { willReadFrequently: true }), [canvas]);

  const persistentImgData = useRef<ImageData | null>(null);
  const persistentImgData32 = useRef<Uint32Array | null>(null);
  const lastPoseTime = useRef(0);
  const lastRequestTime = useRef(Date.now()); // active on start

  useEffect(() => {
    if (ctx && !persistentImgData.current) {
      persistentImgData.current = ctx.createImageData(320, 240);
      persistentImgData32.current = new Uint32Array(persistentImgData.current.data.buffer);
    }
  }, [ctx]);

  // Listen for vision requests from mobile devices
  useEffect(() => {
    const handleVisionRequested = () => {
      lastRequestTime.current = Date.now();
    };
    window.addEventListener('remote_robot_vision_requested', handleVisionRequested);
    return () => window.removeEventListener('remote_robot_vision_requested', handleVisionRequested);
  }, []);

  // Frame Capture & High-Frequency Pose Stream in animation loop
  useFrame(() => {
    const now = performance.now();
    if (!robotPosRef.current) return;
    const pos = robotPosRef.current;
    const rot = robotRotRef.current || 0;
    const deg = Math.round(((-rot * 180 / Math.PI) % 360 + 360) % 360);

    // 1. High-Frequency Pose Stream (30-40 Hz, ~28ms) for zero-lag 60 FPS Digital Twin
    if (now - lastPoseTime.current >= 28) {
      lastPoseTime.current = now;
      window.dispatchEvent(new CustomEvent('local_robot_pose_stream', {
        detail: {
          x: Number(pos.x.toFixed(2)),
          y: Number(pos.y.toFixed(2)),
          z: Number(pos.z.toFixed(2)),
          rot: Number(rot.toFixed(3)),
          heading: deg,
          speed: Number(speed.toFixed(1)),
          battery: Math.round(battery),
          robotState,
          isNight,
          headlights,
          timestamp: Date.now()
        }
      }));
    }

    // 2. Video Frame Capture optimized to ~30 FPS (every 33ms) for ultra-smooth stream
    if (now - lastCaptureTime.current < 33) return;
    lastCaptureTime.current = now;

    // Camera mounted on front visor / sensor mast of robot (facing forward, +Z in local space)
    const forwardX = Math.sin(rot);
    const forwardZ = Math.cos(rot);
    const camX = pos.x + forwardX * 0.42;
    const camY = pos.y + 1.05;
    const camZ = pos.z + forwardZ * 0.42;

    fpvCamera.position.set(camX, camY, camZ);
    const lookTarget = new THREE.Vector3(
      camX + forwardX * 15,
      camY - 0.22, // slight downward pitch looking onto road ahead
      camZ + forwardZ * 15
    );
    fpvCamera.lookAt(lookTarget);
    fpvCamera.updateMatrixWorld();

    // Position headlight target ahead
    if (targetMeshRef.current) {
      targetMeshRef.current.position.set(camX + forwardX * 16, camY - 0.5, camZ + forwardZ * 16);
      targetMeshRef.current.updateMatrixWorld();
    }

    // Render FPV scene into offscreen render target
    // Hide robot body so dash cam provides a pure, clean environmental vision without robot parts
    const robotAvatar = scene.getObjectByName('robot_avatar_group');
    const prevVis = robotAvatar ? robotAvatar.visible : true;
    if (robotAvatar) robotAvatar.visible = false;

    const currentRenderTarget = gl.getRenderTarget();
    gl.setRenderTarget(renderTarget);
    gl.render(scene, fpvCamera);
    gl.readRenderTargetPixels(renderTarget, 0, 0, 320, 240, readBuf);
    gl.setRenderTarget(currentRenderTarget);

    // Restore robot visibility immediately for the main viewport
    if (robotAvatar) robotAvatar.visible = prevVis;

    // Fast flip vertically using 32-bit typed array (4x faster memory transfer)
    if (ctx && persistentImgData.current && persistentImgData32.current) {
      const data32 = persistentImgData32.current;
      for (let y = 0; y < 240; y++) {
        const srcRow = (239 - y) * 320;
        const dstRow = y * 320;
        data32.set(readBuf32.subarray(srcRow, srcRow + 320), dstRow);
      }
      ctx.putImageData(persistentImgData.current, 0, 0);

      // Analyze camera frustum detections (YOLOv8 vision simulation)
      const detectedBoxes: DetectedBox[] = [];
      let fireAlert = false;
      let emergencyAlert = false;
      let nearestObstacle = 999;

      // 1. FIRE DETECTION CHANNEL: Active flames & smoke hazards
      if (fireHazards && fireHazards.length > 0) {
        for (const f of fireHazards) {
          const [fx, fy, fz] = getGridPositionFn(f.position, gridSize, 0.5, false);
          const fVec = new THREE.Vector3(fx, fy + 0.6, fz);
          const dist = pos.distanceTo(fVec);
          if (dist < nearestObstacle) nearestObstacle = dist;

          if (dist <= 26) {
            // Project into camera screen coordinates
            const proj = fVec.clone().project(fpvCamera);
            if (proj.z > 0 && proj.z < 1 && Math.abs(proj.x) < 1.05 && Math.abs(proj.y) < 1.05) {
              fireAlert = true;
              const px = ((proj.x + 1) / 2) * 100;
              const py = ((1 - proj.y) / 2) * 100;
              const sizeFactor = Math.max(10, Math.min(38, (1 / (dist + 0.5)) * 140));
              detectedBoxes.push({
                id: `fire_${f.id}`,
                type: 'fire',
                category: 'fire_detection',
                label: `ACTIVE FLAME & SMOKE HAZARD`,
                confidence: Math.round(92 + Math.random() * 7),
                distance: parseFloat(dist.toFixed(1)),
                boxPercent: {
                  x: Math.max(2, px - sizeFactor / 2),
                  y: Math.max(5, py - sizeFactor / 1.6),
                  w: sizeFactor,
                  h: sizeFactor * 1.2
                },
                color: '#ef4444'
              });
            }
          }
        }
      }

      // 2. EMERGENCY & CROWD DETECTION CHANNEL: Dense human gatherings
      if (crowds && crowds.length > 0) {
        for (let i = 0; i < crowds.length; i++) {
          const c = crowds[i];
          const [cx, cy, cz] = getGridPositionFn(c, gridSize, 0.4, false);
          const cVec = new THREE.Vector3(cx, cy + 0.5, cz);
          const dist = pos.distanceTo(cVec);
          if (dist < nearestObstacle) nearestObstacle = dist;

          if (dist <= 30) {
            const proj = cVec.clone().project(fpvCamera);
            if (proj.z > 0 && proj.z < 1 && Math.abs(proj.x) < 1.05 && Math.abs(proj.y) < 1.05) {
              emergencyAlert = true;
              const px = ((proj.x + 1) / 2) * 100;
              const py = ((1 - proj.y) / 2) * 100;
              const sizeFactor = Math.max(14, Math.min(45, (1 / (dist + 0.5)) * 160));
              detectedBoxes.push({
                id: `crowd_${i}`,
                type: 'crowd',
                category: 'emergency_detection',
                label: `HIGH-DENSITY CROWD (CLUSTER ${i + 1})`,
                confidence: Math.round(91 + Math.random() * 8),
                distance: parseFloat(dist.toFixed(1)),
                boxPercent: {
                  x: Math.max(2, px - sizeFactor / 2),
                  y: Math.max(5, py - sizeFactor / 1.5),
                  w: sizeFactor,
                  h: sizeFactor * 1.1
                },
                color: '#a855f7' // Purple for crowd
              });
            }
          }
        }
      }

      // 3. EMERGENCY & CROWD DETECTION CHANNEL: Marked SOS / Medical / Incident Target
      if (markedEmergencyPoint && markedEmergencyPoint.position) {
        const [mx, my, mz] = getGridPositionFn(markedEmergencyPoint.position, gridSize, 0.4, false);
        const mVec = new THREE.Vector3(mx, my + 0.5, mz);
        const dist = pos.distanceTo(mVec);
        if (dist <= 35) {
          const proj = mVec.clone().project(fpvCamera);
          if (proj.z > 0 && proj.z < 1 && Math.abs(proj.x) < 1.05 && Math.abs(proj.y) < 1.05) {
            emergencyAlert = true;
            const px = ((proj.x + 1) / 2) * 100;
            const py = ((1 - proj.y) / 2) * 100;
            const sizeFactor = Math.max(12, Math.min(36, (1 / (dist + 0.5)) * 130));
            detectedBoxes.push({
              id: `marked_sos_${markedEmergencyPoint.position.x}_${markedEmergencyPoint.position.y}`,
              type: 'emergency',
              category: 'emergency_detection',
              label: `🚨 SOS TARGET: ${markedEmergencyPoint.label || 'EMERGENCY SCENE'}`,
              confidence: 99,
              distance: parseFloat(dist.toFixed(1)),
              boxPercent: {
                x: Math.max(2, px - sizeFactor / 2),
                y: Math.max(5, py - sizeFactor / 1.5),
                w: sizeFactor,
                h: sizeFactor
              },
              color: '#ec4899' // Pink/Magenta for SOS Emergency
            });
          }
        }
      }

      // 4. NAVIGATION & OBSTACLE CHANNEL: Vehicles & pedestrians
      if (dynamicObstaclesRef && dynamicObstaclesRef.current) {
        for (const obs of dynamicObstaclesRef.current) {
          let obsPosVec: THREE.Vector3 | null = null;
          if (obs.currentPosVector) {
            obsPosVec = obs.currentPosVector.clone();
          } else if (obs.pos) {
            const [ox, oy, oz] = getGridPositionFn(obs.pos, gridSize, 0.4, false);
            obsPosVec = new THREE.Vector3(ox, oy, oz);
          }
          if (!obsPosVec) continue;

          const dist = pos.distanceTo(obsPosVec);
          if (dist < nearestObstacle) nearestObstacle = dist;

          if (dist <= 18) {
            const proj = obsPosVec.clone().project(fpvCamera);
            if (proj.z > 0 && proj.z < 1 && Math.abs(proj.x) < 1.05 && Math.abs(proj.y) < 1.05) {
              const isCar = obs.type === 'car';
              const px = ((proj.x + 1) / 2) * 100;
              const py = ((1 - proj.y) / 2) * 100;
              const sizeFactor = Math.max(8, Math.min(32, (1 / (dist + 0.5)) * 110));
              detectedBoxes.push({
                id: `obs_${obs.id}`,
                type: isCar ? 'car' : 'pedestrian',
                category: 'navigation',
                label: isCar ? `CAMPUS VEHICLE` : `PEDESTRIAN`,
                confidence: Math.round(88 + Math.random() * 11),
                distance: parseFloat(dist.toFixed(1)),
                boxPercent: {
                  x: Math.max(2, px - sizeFactor / 2),
                  y: Math.max(5, py - sizeFactor / 1.8),
                  w: sizeFactor,
                  h: isCar ? sizeFactor * 0.8 : sizeFactor * 1.4
                },
                color: isCar ? '#f59e0b' : '#06b6d4'
              });
            }
          }
        }
      }

      // 5. NAVIGATION & OBSTACLE CHANNEL: Road barricades
      if (userBlockers && userBlockers.length > 0) {
        for (const b of userBlockers) {
          const [bx, by, bz] = getGridPositionFn(b, gridSize, 0.4, false);
          const bVec = new THREE.Vector3(bx, by, bz);
          const dist = pos.distanceTo(bVec);
          if (dist < nearestObstacle) nearestObstacle = dist;

          if (dist <= 14) {
            const proj = bVec.clone().project(fpvCamera);
            if (proj.z > 0 && proj.z < 1 && Math.abs(proj.x) < 1.05 && Math.abs(proj.y) < 1.05) {
              const px = ((proj.x + 1) / 2) * 100;
              const py = ((1 - proj.y) / 2) * 100;
              const sizeFactor = Math.max(8, Math.min(28, (1 / (dist + 0.5)) * 95));
              detectedBoxes.push({
                id: `barricade_${b.x}_${b.y}`,
                type: 'barricade',
                category: 'navigation',
                label: `ROAD BARRICADE`,
                confidence: 99,
                distance: parseFloat(dist.toFixed(1)),
                boxPercent: {
                  x: Math.max(2, px - sizeFactor / 2),
                  y: Math.max(5, py - sizeFactor / 2),
                  w: sizeFactor,
                  h: sizeFactor
                },
                color: '#6366f1'
              });
            }
          }
        }
      }

      // Heading calculation in degrees (0-359 N=0, E=90, S=180, W=270)
      const deg = Math.round(((-rot * 180 / Math.PI) % 360 + 360) % 360);

      // Generate compact base64 JPEG for socket transmission (0.48 provides sharp vision at low payload)
      const imageBase64 = canvas.toDataURL('image/jpeg', 0.48);

      // Separate detections for distinct telemetry
      const fireBoxes = detectedBoxes.filter(b => b.category === 'fire_detection');
      const emergencyBoxes = detectedBoxes.filter(b => b.category === 'emergency_detection');

      // Dispatch local event with direct canvas reference for zero-lag local rendering
      window.dispatchEvent(new CustomEvent('local_robot_vision_frame', {
        detail: {
          image: imageBase64,
          canvas: canvas,
          timestamp: Date.now(),
          heading: deg,
          speed: parseFloat(speed.toFixed(1)),
          battery: Math.round(battery),
          position: { x: Math.round(pos.x), y: Math.round(pos.z) },
          robotState,
          isNight,
          headlights,
          nearestObstacleDist: nearestObstacle === 999 ? 12.0 : parseFloat(nearestObstacle.toFixed(1)),
          detectedObjects: detectedBoxes,
          fireDetections: fireBoxes,
          emergencyDetections: emergencyBoxes,
          fireAlert,
          emergencyAlert,
          hazardAlert: fireAlert || emergencyAlert,
          hazardType: fireAlert 
            ? 'FIRE HAZARD DETECTED' 
            : (emergencyAlert ? 'EMERGENCY / CROWD DETECTED' : undefined)
        }
      }));

    }
  });

  return (
    <>
      <primitive object={targetMeshRef.current} />
      {/* Robot Forward Headlights */}
      {headlights && robotPosRef.current && (
        <spotLight
          position={[
            robotPosRef.current.x + Math.sin(robotRotRef.current || 0) * 0.42,
            robotPosRef.current.y + 0.85,
            robotPosRef.current.z + Math.cos(robotRotRef.current || 0) * 0.42
          ]}
          target={targetMeshRef.current}
          angle={Math.PI / 4.2}
          penumbra={0.35}
          intensity={isNight ? 9.5 : 3.0}
          distance={45}
          color="#e0f2fe"
          castShadow={false}
        />
      )}
    </>
  );
};
