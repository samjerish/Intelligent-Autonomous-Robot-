import React, { Suspense, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, Html } from '@react-three/drei';
import * as THREE from 'three';
import { DetailedRobot } from './DetailedRobot';
import { X, ShieldAlert, Package, Zap, Activity, Power, Radio, Smartphone, Target, Info, Volume2, VolumeX } from 'lucide-react';
import { AnimatedPASName } from '../App';

const AnimatedRobotGroup: React.FC<{ currentWordIndex: number; onClick: (e: any) => void; children: React.ReactNode }> = ({ currentWordIndex, onClick, children }) => {
  const groupRef = React.useRef<THREE.Group>(null);
  
  useFrame((state, delta) => {
    if (!groupRef.current) return;
    
    let targetScale = 1;
    let targetRotY = 0;
    // We will keep rotation X at 0 so the floor/table doesn't tilt!
    let targetRotX = 0; 
    let featureLocalPos = new THREE.Vector3(0, 0, 0);
    
    // "heavy-duty chassis" (13-14)
    if (currentWordIndex >= 13 && currentWordIndex <= 14) {
      targetScale = 2.2;
      featureLocalPos.set(0, 0.6 * 1.8, 0);
      targetRotY = Math.PI / 5;
    }
    // "360-degree LiDAR" (15-17)
    else if (currentWordIndex >= 15 && currentWordIndex <= 17) {
      targetScale = 3.5;
      featureLocalPos.set(0, 1.25 * 1.8, 0);
      targetRotY = Math.PI / 8;
    }
    // "medical kits" (27-28)
    else if (currentWordIndex >= 26 && currentWordIndex <= 28) {
      targetScale = 3.0;
      featureLocalPos.set(0, 0.65 * 1.8, -0.28 * 1.8);
      targetRotY = Math.PI; 
    }
    // "battery" / "generator" (34-45)
    else if (currentWordIndex >= 34 && currentWordIndex <= 45) {
      targetScale = 2.5;
      featureLocalPos.set(0, 0.4 * 1.8, -0.28 * 1.8);
      targetRotY = Math.PI; 
    } else {
      targetScale = 1;
      featureLocalPos.set(0, 0.8, 0); // Default so targetPosY becomes -0.8
    }

    // If speaking, orient relative to camera so it's always perfectly visible
    if (currentWordIndex >= 0) {
      const camAngle = Math.atan2(state.camera.position.x, state.camera.position.z);
      targetRotY += camAngle;
    } else {
      targetRotY = 0;
    }
    
    // Calculate the perfect world position to center the feature!
    const scaledPos = featureLocalPos.clone().multiplyScalar(targetScale);
    const euler = new THREE.Euler(targetRotX, targetRotY, 0, 'YXZ');
    scaledPos.applyEuler(euler);
    
    // To center it, we counter-act the offset. We also add +0.5 to Y when zoomed to clear captions.
    let targetPosY = -scaledPos.y + (currentWordIndex >= 0 ? 0.6 : 0);
    let targetPosZ = -scaledPos.z + (currentWordIndex >= 0 ? 1.0 : 0);
    let targetPosX = -scaledPos.x;
    
    groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), delta * 4);
    groupRef.current.position.lerp(new THREE.Vector3(targetPosX, targetPosY, targetPosZ), delta * 4);
    
    // Smoothly interpolate rotation
    groupRef.current.rotation.x += (targetRotX - groupRef.current.rotation.x) * delta * 4;
    
    // Handle Y rotation shortest path
    let diff = targetRotY - groupRef.current.rotation.y;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    groupRef.current.rotation.y += diff * delta * 4;
  });
  
  return <group ref={groupRef} position={[0, -0.8, 0]} onClick={onClick}>{children}</group>;
};

interface RobotShowcaseProps {
  onClose: () => void;
}

export const RobotShowcase: React.FC<RobotShowcaseProps> = ({ onClose }) => {
  const [showSpecs, setShowSpecs] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [caption, setCaption] = useState("");
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);

  let activeFeature = "";
  if (currentWordIndex >= 13 && currentWordIndex <= 14) activeFeature = "chassis";
  else if (currentWordIndex >= 15 && currentWordIndex <= 17) activeFeature = "lidar";
  else if (currentWordIndex >= 26 && currentWordIndex <= 28) activeFeature = "medical";
  else if (currentWordIndex >= 34 && currentWordIndex <= 45) activeFeature = "battery";

  const speechText = "Hello! I am the IR-2026 Autonomous Security Robot. My main features include a heavy-duty chassis, 360-degree LiDAR for avoiding obstacles, and autonomous patrol capabilities. I can deliver medical kits in emergencies, and when my battery is low, I automatically return to the generator room to recharge.";

  React.useEffect(() => {
    if (isSpeaking) {
      const utterance = new SpeechSynthesisUtterance(speechText);
      utterance.pitch = 1.0;
      utterance.rate = 1.0;
      utterance.voice = window.speechSynthesis.getVoices().find(v => v.name.includes('Google') || v.name.includes('English')) || null;
      
      utterance.onstart = () => {
        setCaption(speechText);
        setCurrentWordIndex(-1);
      };
      
      utterance.onboundary = (event) => {
        if (event.name === 'word') {
          const textBefore = speechText.substring(0, event.charIndex);
          const wordCount = textBefore.trim().length > 0 ? textBefore.trim().split(/\s+/).length : 0;
          setCurrentWordIndex(wordCount);
        }
      };
      
      utterance.onend = () => { 
        setIsSpeaking(false); 
        setCaption(""); 
        setCurrentWordIndex(-1);
      };
      
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } else {
      window.speechSynthesis.cancel();
      setCaption("");
      setCurrentWordIndex(-1);
    }
    return () => {
      window.speechSynthesis.cancel();
    };
  }, [isSpeaking]);

  return (
    <div className="absolute inset-0 z-[200] bg-black/90 flex flex-col overflow-hidden animate-in fade-in duration-500 font-sans">
      
      {/* 3D Background Canvas */}
      <div className="absolute inset-0 cursor-pointer">
        <Canvas camera={{ position: [0, 1.5, 5.5], fov: 45 }} shadows>
          <color attach="background" args={['#050505']} />
          <ambientLight intensity={0.5} />
          <spotLight position={[5, 10, 5]} intensity={2.5} castShadow penumbra={1} angle={0.3} />
          <spotLight position={[-5, 5, -5]} intensity={1.5} color="#0ea5e9" />
          <Environment preset="city" />
          
          <Suspense fallback={null}>
            <AnimatedRobotGroup currentWordIndex={currentWordIndex} onClick={(e) => { e.stopPropagation(); setShowSpecs(!showSpecs); }}>
              <DetailedRobot isMoving={false} showFeatures={showSpecs} activeFeature={activeFeature} />
              <ContactShadows position={[0, 0, 0]} opacity={0.7} scale={12} blur={2.5} far={4} />
              
              {/* Round Table / Pedestal */}
              <mesh position={[0, -0.05, 0]} receiveShadow>
                <cylinderGeometry args={[3, 3.2, 0.1, 64]} />
                <meshStandardMaterial color="#0f172a" metalness={0.6} roughness={0.2} />
              </mesh>
              

              
              {/* Robot Label */}
              <Html position={[0, -0.2, 2.8]} center>
                <div className="bg-black/80 backdrop-blur-md border-t-2 border-cyan-500 text-white px-6 py-2 rounded-b-xl text-2xl font-black tracking-[0.3em] shadow-[0_0_15px_rgba(34,211,238,0.5)] pointer-events-auto cursor-default">
                  <AnimatedPASName />
                </div>
              </Html>
            </AnimatedRobotGroup>
          </Suspense>

          <OrbitControls 
            autoRotate={currentWordIndex < 0}
            autoRotateSpeed={0.8}
            enablePan={false}
            minDistance={3}
            maxDistance={10}
            maxPolarAngle={Math.PI / 2 + 0.1}
          />
        </Canvas>
      </div>

      {/* Floating UI Overlay */}
      <div className="absolute inset-0 pointer-events-none flex flex-col justify-between">
        
        {/* Header */}
        <div className="flex-none p-6 flex justify-between items-start pointer-events-auto bg-gradient-to-b from-black/80 to-transparent pb-12">
          <div>
            <h2 className="text-3xl font-black text-white flex items-center gap-3 tracking-tight drop-shadow-lg">
              <Zap className="w-8 h-8 text-cyan-400" />
              <AnimatedPASName /> <span className="ml-2">Autonomous Service Robot</span>
            </h2>
            <p className="text-sm text-cyan-100/70 mt-1 font-mono uppercase tracking-widest drop-shadow-md">Hardware Specification & System Overview</p>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => setIsSpeaking(!isSpeaking)}
              className={`p-3 rounded-xl transition-all border backdrop-blur-md flex items-center gap-2 font-bold ${isSpeaking ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.3)]' : 'bg-white/10 hover:bg-white/20 border-white/10 text-gray-300'}`}
            >
              {isSpeaking ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              <span className="hidden sm:inline">{isSpeaking ? 'Stop Speech' : 'Listen to Specs'}</span>
            </button>
            <button 
              onClick={onClose}
              className="p-3 bg-white/10 hover:bg-red-500 hover:text-white text-gray-300 rounded-xl transition-all border border-white/10 backdrop-blur-md"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Floating Side Panels */}
        <div className="flex-1 flex justify-between px-8 pb-12 overflow-hidden">
          
          {/* Left Column */}
          <div className="w-[420px] h-full pointer-events-auto overflow-y-auto pr-2 custom-scrollbar">
            <div className="flex flex-col gap-4 min-h-full justify-center pb-4">
              
              <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <h3 className="font-bold text-white text-lg mb-3 flex items-center gap-2">
                <Target className="w-5 h-5 text-blue-400" /> Problem Statement & Purpose
              </h3>
              <p className="text-sm text-gray-300 leading-relaxed">
                <strong className="text-white">Why it's used:</strong> To provide 24/7 autonomous support, ensuring fast response times, minimizing human error, and creating a safer environment on large university campuses.
              </p>
              <p className="text-sm text-gray-300 leading-relaxed mt-2">
                <strong className="text-white">What problem it solves:</strong> It addresses the critical need for rapid, autonomous emergency response, secure item delivery, and constant surveillance without relying heavily on limited human staff, reducing response times by up to 70%.
              </p>
            </div>

            <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <h3 className="font-bold text-cyan-400 text-base mb-2 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5" /> Medical & Emergency Kit
              </h3>
              <p className="text-sm text-gray-300 leading-relaxed">
                Carries vital first-aid supplies and emergency tools. The robot can rush to an incident location autonomously to provide immediate assistance before human paramedics arrive.
              </p>
            </div>

            <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <h3 className="font-bold text-green-400 text-base mb-2 flex items-center gap-2">
                <Package className="w-5 h-5" /> Secure Storage Bay
              </h3>
              <p className="text-sm text-gray-300 leading-relaxed">
                A secure, temperature-controlled compartment on the front of the chassis, used to securely transport hot food, cold drinks, or confidential documents across the building.
              </p>
            </div>

            <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <h3 className="font-bold text-orange-400 text-base mb-2 flex items-center gap-2">
                <Zap className="w-5 h-5" /> Advanced Sensor Array
              </h3>
              <p className="text-sm text-gray-300 leading-relaxed">
                Equipped with 360-degree LiDAR and high-resolution cameras to dynamically map its environment, effortlessly navigating complex corridors and avoiding moving obstacles.
              </p>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="w-[420px] h-full pointer-events-auto overflow-y-auto pl-2 custom-scrollbar">
            <div className="flex flex-col gap-4 min-h-full justify-center pb-4">
              
              <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
              <h3 className="font-bold text-white text-lg mb-4 border-b border-white/10 pb-3 flex items-center gap-2">
                <Activity className="w-5 h-5 text-purple-400" /> Operational Modes
              </h3>
              
              <div className="space-y-5">
                <div>
                  <h4 className="text-cyan-400 text-sm font-bold flex items-center gap-2 mb-1"><Activity className="w-4 h-4" /> Patrol Mode</h4>
                  <p className="text-xs text-gray-300">Autonomously navigates the campus layout during idle times to ensure constant surveillance and a secure environment.</p>
                </div>
                
                <div>
                  <h4 className="text-red-400 text-sm font-bold flex items-center gap-2 mb-1"><ShieldAlert className="w-4 h-4" /> Emergency Mode</h4>
                  <p className="text-xs text-gray-300">Overrides standard speed limits and reroutes dynamically to reach critical emergency zones in the shortest possible time.</p>
                </div>
                
                <div>
                  <h4 className="text-blue-400 text-sm font-bold flex items-center gap-2 mb-1"><Power className="w-4 h-4" /> Standby / Sleep</h4>
                  <p className="text-xs text-gray-300">When powered off, the robot autonomously returns to the Generator Room to recharge its battery and conserve energy.</p>
                </div>
                
                <div>
                  <h4 className="text-orange-400 text-sm font-bold flex items-center gap-2 mb-1"><Radio className="w-4 h-4" /> Auto-Wake</h4>
                  <p className="text-xs text-gray-300">Capable of intercepting emergency signals even while charging, immediately waking up to process the dispatch.</p>
                </div>
              </div>
            </div>

            <div className="bg-black/60 backdrop-blur-xl border border-pink-500/20 rounded-2xl p-6 shadow-[0_0_30px_rgba(236,72,153,0.1)] relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-pink-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <h3 className="font-bold text-pink-400 text-base mb-2 flex items-center gap-2">
                <Smartphone className="w-5 h-5" /> Mobile Control App
              </h3>
              <p className="text-sm text-gray-300 leading-relaxed mb-3">
                Full command over the robot via a responsive mobile web application. Provides staff with on-the-go capabilities to manage the robot seamlessly.
              </p>
              <ul className="text-xs text-gray-400 space-y-1.5 list-disc list-inside">
                <li>Scan the QR code to connect instantly.</li>
                <li>Zero-delay real-time syncing via WebSockets.</li>
                <li>Dispatch missions or trigger remote emergencies.</li>
                <li>Live power and status management.</li>
              </ul>
            </div>
            
              <div className="mt-auto text-center pointer-events-none pt-4">
                <span className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-2 rounded-full text-xs font-bold text-gray-300 border border-white/10 shadow-lg">
                  <Info className="w-4 h-4 text-cyan-400" /> Click the robot model to visualize hardware specs
                </span>
              </div>

            </div>
          </div>
        </div>

        {/* Captions Overlay */}
        {caption && (
          <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 w-full max-w-5xl pointer-events-none z-50 px-4 text-center">
             <div className="flex justify-center flex-wrap gap-x-6 gap-y-2 items-center">
               {currentWordIndex >= 0 ? (
                 speechText.split(/\s+/).slice(Math.floor(currentWordIndex / 3) * 3, Math.floor(currentWordIndex / 3) * 3 + 3).map((word, index) => {
                   const absoluteIndex = Math.floor(currentWordIndex / 3) * 3 + index;
                   const isCurrent = absoluteIndex === currentWordIndex;
                   return (
                     <span 
                       key={absoluteIndex} 
                       className={`text-3xl md:text-4xl font-black uppercase tracking-widest transition-all duration-150 ${isCurrent ? 'text-cyan-300 scale-110 drop-shadow-[0_0_20px_rgba(34,211,238,1)] z-10' : 'text-gray-400/70 scale-95 drop-shadow-[0_3px_3px_rgba(0,0,0,1)]'}`}
                     >
                       {word}
                     </span>
                   );
                 })
               ) : (
                 <span className="text-gray-400 text-lg uppercase tracking-widest animate-pulse drop-shadow-md">
                   Initializing Speech Subsystem...
                 </span>
               )}
             </div>
          </div>
        )}

      </div>
      
      {/* Adding custom scrollbar styling globally for this component scope if needed, or rely on tailwind. We will just use inline styles or it falls back to default */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3);
        }
      `}</style>
    </div>
  );
};
