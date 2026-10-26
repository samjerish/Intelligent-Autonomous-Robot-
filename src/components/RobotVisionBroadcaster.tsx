import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { GridPoint, FireHazardPoint } from '../types';

interface DetectedBox {
  id: string;
  type: 'fire' | 'smoke' | 'pedestrian' | 'car' | 'obstacle' | 'barricade' | 'building';
  label: string;
  confidence: number;
  distance: number;
  boxPercent: { x: number; y: number; w: number; h: number };
  color: string;
}

interface RobotVisionBroadcasterProps {
  robotPosRef: React.MutableRefObject<THREE.Vector3 | null>;
  robotRotRef: React.MutableRefObject<number>;
  robotGroupRef?: React.MutableRefObject<THREE.Group | null>;
  speed?: number;
  battery?: number;
  robotState?: string;
  fireHazards?: FireHazardPoint[];
  dynamicObstaclesRef?: React.MutableRefObject<any[]>;
  userBlockers?: GridPoint[];
  isNight?: boolean;
  gridSize?: GridPoint;
  getGridPositionFn: (pt: GridPoint, gridSize: GridPoint, height?: number, isMapView?: boolean) => [number, number, number];
}

export const RobotVisionBroadcaster: React.FC<RobotVisionBroadcasterProps> = ({
  robotPosRef,
  robotRotRef,
  robotGroupRef,
  speed = 0,
  battery = 100,
  robotState = 'IDLE',
  fireHazards = [],
  dynamicObstaclesRef,
  userBlockers = [],
  isNight = false,
  gridSize = { x: 120, y: 100, f: 1 },
  getGridPositionFn
}) => {
  const { gl, scene } = useThree();
  const [headlights, setHeadlights] = useState(false);
  const targetMeshRef = useRef<THREE.Object3D>(new THREE.Object3D());

  // FPV Camera setup - 480x360 4:3 high-resolution perspective camera mounted on robot sensor mast
  const fpvCamera = useMemo(() => {
    const cam = new THREE.PerspectiveCamera(75, 480 / 360, 0.08, 400);
    return cam;
  }, []);

  // Smoothed camera tracking vectors to eliminate micro-jitter during robot movement
  const smoothCamPos = useRef(new THREE.Vector3());
  const smoothCamLook = useRef(new THREE.Vector3());
  const isCamInitialized = useRef(false);

  // Offscreen WebGL render target & 2D canvas buffer (480x360)
  const renderTarget = useMemo(() => {
    return new THREE.WebGLRenderTarget(480, 360, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    });
  }, []);

  const readBuf = useMemo(() => new Uint8Array(480 * 360 * 4), []);
  const canvas = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 480;
    c.height = 360;
    return c;
  }, []);
  const ctx = useMemo(() => canvas.getContext('2d', { willReadFrequently: false }), [canvas]);

  const persistentImgData = useRef<ImageData | null>(null);
  const lastPoseTime = useRef(0);
  const lastSocketTime = useRef(0);
  const lastRequestTime = useRef(Date.now()); // active on start

  useEffect(() => {
    if (ctx && !persistentImgData.current) {
      persistentImgData.current = ctx.createImageData(480, 360);
    }
  }, [ctx]);

  // Headlight toggle remote event listener
  useEffect(() => {
    const handleToggleHeadlight = () => {
      setHeadlights(prev => !prev);
    };
    window.addEventListener('remote_toggle_headlight', handleToggleHeadlight);
    return () => window.removeEventListener('remote_toggle_headlight', handleToggleHeadlight);
  }, []);

  // Listen for vision requests from mobile devices
  useEffect(() => {
    const handleVisionRequested = () => {
      lastRequestTime.current = Date.now();
    };
    window.addEventListener('remote_robot_vision_requested', handleVisionRequested);
    return () => window.removeEventListener('remote_robot_vision_requested', handleVisionRequested);
  }, []);

  // Frame Capture & High-Frequency Stream in animation loop
  useFrame((_state, delta) => {
    const now = performance.now();
    if (!robotPosRef.current) return;
    const pos = robotPosRef.current;
    const rot = robotRotRef.current || 0;

    // True robot forward direction vector
    // In our 3D coordinate system, robot faces +Z when rot = 0
    const forwardX = Math.sin(rot);
    const forwardZ = Math.cos(rot);

    // Precise cardinal heading in degrees (0 = N, 90 = E, 180 = S, 270 = W)
    const deg = Math.round(((Math.atan2(forwardX, forwardZ) * 180 / Math.PI) % 360 + 360) % 360);

    // 1. High-Frequency Pose Stream (30-40 Hz, ~28ms) for zero-lag Digital Twin
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

    // Check if desktop PIP is open or mobile has recently requested stream
    const pipCanvas = document.getElementById('robot-pip-canvas') as HTMLCanvasElement | null;
    const hasMobileClient = now - lastRequestTime.current < 15000;

    // Camera mounted forward OUTSIDE the robot at eye-level:
    // 0.95m forward in front of the robot chassis, 1.25m height (forward perception sensor mast)
    const targetCamX = pos.x + forwardX * 0.95;
    const targetCamY = pos.y + 1.25;
    const targetCamZ = pos.z + forwardZ * 0.95;

    const targetLook = new THREE.Vector3(
      targetCamX + forwardX * 18,
      targetCamY - 0.28, // slight downward pitch looking onto road and horizon
      targetCamZ + forwardZ * 18
    );

    const targetPos = new THREE.Vector3(targetCamX, targetCamY, targetCamZ);

    if (!isCamInitialized.current) {
      smoothCamPos.current.copy(targetPos);
      smoothCamLook.current.copy(targetLook);
      isCamInitialized.current = true;
    } else {
      // Butter-smooth camera position and look lerp
      const lerpAlpha = 1 - Math.pow(0.0001, delta);
      smoothCamPos.current.lerp(targetPos, lerpAlpha);
      smoothCamLook.current.lerp(targetLook, lerpAlpha);
    }

    fpvCamera.position.copy(smoothCamPos.current);
    fpvCamera.lookAt(smoothCamLook.current);
    fpvCamera.updateMatrixWorld();

    // Position headlight target ahead
    if (targetMeshRef.current) {
      targetMeshRef.current.position.set(
        targetCamX + forwardX * 16,
        targetCamY - 0.8,
        targetCamZ + forwardZ * 16
      );
      targetMeshRef.current.updateMatrixWorld();
    }

    // Skip offscreen GPU render if neither PIP nor mobile is requesting vision
    if (!pipCanvas && !hasMobileClient) return;

    // Temporarily hide robot body mesh so camera NEVER sees inside or clips the robot
    const wasVisible = robotGroupRef?.current ? robotGroupRef.current.visible : true;
    if (robotGroupRef?.current) {
      robotGroupRef.current.visible = false;
    }

    // Render FPV scene into offscreen render target
    const currentRenderTarget = gl.getRenderTarget();
    gl.setRenderTarget(renderTarget);
    gl.render(scene, fpvCamera);
    gl.readRenderTargetPixels(renderTarget, 0, 0, 480, 360, readBuf);
    gl.setRenderTarget(currentRenderTarget);

    // Restore robot body visibility immediately after FPV capture
    if (robotGroupRef?.current) {
      robotGroupRef.current.visible = wasVisible;
    }

    // Fast vertical flip from WebGL buffer to 2D canvas using persistent buffer
    if (ctx) {
      if (!persistentImgData.current || persistentImgData.current.width !== 480) {
        persistentImgData.current = ctx.createImageData(480, 360);
      }
      const data = persistentImgData.current.data;
      const rowBytes = 480 * 4;
      for (let y = 0; y < 360; y++) {
        const srcRow = (359 - y) * rowBytes;
        const dstRow = y * rowBytes;
        data.set(readBuf.subarray(srcRow, srcRow + rowBytes), dstRow);
      }
      ctx.putImageData(persistentImgData.current, 0, 0);

      // A. Direct Hardware-Accelerated Blit to Desktop PIP Canvas (0ms Latency, 60 FPS)
      if (pipCanvas) {
        const pipCtx = pipCanvas.getContext('2d');
        if (pipCtx) {
          pipCtx.drawImage(canvas, 0, 0, pipCanvas.width, pipCanvas.height);
        }
      }

      // Analyze camera frustum detections (YOLOv8 vision simulation)
      const detectedBoxes: DetectedBox[] = [];
      let hazardAlert = false;
      let nearestObstacle = 999;
      const camForward = new THREE.Vector3(forwardX, 0, forwardZ).normalize();

      // 1. Fire hazards in field of view
      if (fireHazards && fireHazards.length > 0) {
        for (const f of fireHazards) {
          const [fx, fy, fz] = getGridPositionFn(f.position, gridSize, 0.5, false);
          const fVec = new THREE.Vector3(fx, fy + 0.6, fz);
          const dist = pos.distanceTo(fVec);
          if (dist < nearestObstacle) nearestObstacle = dist;

          if (dist <= 30) {
            const toTarget = new THREE.Vector3().subVectors(fVec, fpvCamera.position);
            // Verify hazard is in front of camera
            if (toTarget.dot(camForward) > 0.1) {
              const proj = fVec.clone().project(fpvCamera);
              if (proj.z > -1 && proj.z < 1 && Math.abs(proj.x) < 1.05 && Math.abs(proj.y) < 1.05) {
                hazardAlert = true;
                const px = ((proj.x + 1) / 2) * 100;
                const py = ((1 - proj.y) / 2) * 100;
                const sizeFactor = Math.max(10, Math.min(42, (1 / (dist + 0.5)) * 140));
                detectedBoxes.push({
                  id: `fire_${f.id}`,
                  type: 'fire',
                  label: `ACTIVE FIRE HAZARD`,
                  confidence: Math.round(94 + Math.random() * 5),
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
      }

      // 2. Dynamic obstacles (vehicles & pedestrians) in field of view
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

          if (dist <= 24) {
            const toTarget = new THREE.Vector3().subVectors(obsPosVec, fpvCamera.position);
            if (toTarget.dot(camForward) > 0.1) {
              const proj = obsPosVec.clone().project(fpvCamera);
              if (proj.z > -1 && proj.z < 1 && Math.abs(proj.x) < 1.05 && Math.abs(proj.y) < 1.05) {
                const isCar = obs.type === 'car';
                const px = ((proj.x + 1) / 2) * 100;
                const py = ((1 - proj.y) / 2) * 100;
                const sizeFactor = Math.max(8, Math.min(36, (1 / (dist + 0.5)) * 110));
                detectedBoxes.push({
                  id: `obs_${obs.id}`,
                  type: isCar ? 'car' : 'pedestrian',
                  label: isCar ? `CAMPUS VEHICLE` : `PEDESTRIAN`,
                  confidence: Math.round(90 + Math.random() * 9),
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
      }

      // 3. Road barricades in field of view
      if (userBlockers && userBlockers.length > 0) {
        for (const b of userBlockers) {
          const [bx, by, bz] = getGridPositionFn(b, gridSize, 0.4, false);
          const bVec = new THREE.Vector3(bx, by, bz);
          const dist = pos.distanceTo(bVec);
          if (dist < nearestObstacle) nearestObstacle = dist;

          if (dist <= 18) {
            const toTarget = new THREE.Vector3().subVectors(bVec, fpvCamera.position);
            if (toTarget.dot(camForward) > 0.1) {
              const proj = bVec.clone().project(fpvCamera);
              if (proj.z > -1 && proj.z < 1 && Math.abs(proj.x) < 1.05 && Math.abs(proj.y) < 1.05) {
                const px = ((proj.x + 1) / 2) * 100;
                const py = ((1 - proj.y) / 2) * 100;
                const sizeFactor = Math.max(8, Math.min(30, (1 / (dist + 0.5)) * 95));
                detectedBoxes.push({
                  id: `barricade_${b.x}_${b.y}`,
                  type: 'barricade',
                  label: `ROAD BARRICADE`,
                  confidence: 99,
                  distance: parseFloat(dist.toFixed(1)),
                  boxPercent: {
                    x: Math.max(2, px - sizeFactor / 2),
                    y: Math.max(5, py - sizeFactor / 2),
                    w: sizeFactor,
                    h: sizeFactor
                  },
                  color: '#a855f7'
                });
              }
            }
          }
        }
      }

      // B. Dispatch lightweight telemetry event for Desktop PIP (no React state re-render on SimulationView)
      window.dispatchEvent(new CustomEvent('robot_vision_telemetry', {
        detail: {
          heading: deg,
          speed: parseFloat(speed.toFixed(1)),
          battery: Math.round(battery),
          position: { x: Math.round(pos.x), y: Math.round(pos.z) },
          robotState,
          isNight,
          headlights,
          nearestObstacleDist: nearestObstacle === 999 ? 12.0 : parseFloat(nearestObstacle.toFixed(1)),
          detectedObjects: detectedBoxes,
          hazardAlert,
          hazardType: hazardAlert ? 'FIRE HAZARD DETECTED' : undefined
        }
      }));

      // C. Steady 20 FPS JPEG Stream for Mobile Devices over WebSocket (~50ms)
      if (hasMobileClient && now - lastSocketTime.current >= 50) {
        lastSocketTime.current = now;
        const imageBase64 = canvas.toDataURL('image/jpeg', 0.50);

        window.dispatchEvent(new CustomEvent('local_robot_vision_frame', {
          detail: {
            image: imageBase64,
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
            hazardAlert,
            hazardType: hazardAlert ? 'FIRE HAZARD DETECTED' : undefined
          }
        }));
      }
    }
  });

  return (
    <>
      <primitive object={targetMeshRef.current} />
      {/* Robot Forward Headlights */}
      {headlights && robotPosRef.current && (
        <spotLight
          position={[
            robotPosRef.current.x + Math.sin(robotRotRef.current || 0) * 0.45,
            robotPosRef.current.y + 1.2,
            robotPosRef.current.z + Math.cos(robotRotRef.current || 0) * 0.45
          ]}
          target={targetMeshRef.current}
          angle={Math.PI / 4.0}
          penumbra={0.35}
          intensity={isNight ? 10.0 : 3.5}
          distance={45}
          color="#e0f2fe"
          castShadow={false}
        />
      )}
    </>
  );
};
