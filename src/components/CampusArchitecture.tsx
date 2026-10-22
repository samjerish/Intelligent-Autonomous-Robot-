import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Box, Cylinder, Sphere, Cone, Plane, Ring, Html, Instances, Instance } from '@react-three/drei';
import type { Room, GridPoint } from '../types';
import { 
  Landmark, 
  BookOpen, 
  Cpu, 
  FlaskConical, 
  Stethoscope, 
  Music, 
  Home, 
  Coffee, 
  Trophy, 
  Zap, 
  Shield, 
  TreePine 
} from 'lucide-react';

const CELL_SIZE = 1;

// Helper to calculate world coordinates from grid point
export const getGridPosition = (gridPoint: GridPoint, gridSize: GridPoint, height = 0.5, _isMapView = false): [number, number, number] => {
  const offsetX = (gridSize.x * CELL_SIZE) / 2;
  const offsetZ = (gridSize.y * CELL_SIZE) / 2;
  const x = gridPoint.x * CELL_SIZE - offsetX + CELL_SIZE / 2;
  const z = gridPoint.y * CELL_SIZE - offsetZ + CELL_SIZE / 2;
  const y = height + (gridPoint.f || 0) * 4;
  return [x, y, z];
};

/* ─────────────────────────────────────────────────────────────
   1. ADMINISTRATIVE COMPLEX & SENATE HALL
   Grand multi-tiered civic architecture:
   - Elevated granite foundation podium with grand steps
   - Imposing two-story colonnade with square fluted pillars
   - Central glazed curtain-wall atrium with university crest medallion
   - Executive lateral wings with tinted ribbon windows & brise-soleil
   - Rooftop monument clock tower, decorative coping, and flagpole
───────────────────────────────────────────────────────────── */
export const AdministrativeBuildingModel = React.memo(({ width, height, depth }: { width: number; height: number; depth: number }) => {
  const pillarCount = Math.max(4, Math.floor(width / 2.2));
  const pillars = useMemo(() => {
    return Array.from({ length: pillarCount }).map((_, i) => {
      const x = -width * 0.38 + (i / (pillarCount - 1)) * (width * 0.76);
      return x;
    });
  }, [pillarCount, width]);

  return (
    <group position={[0, 0, 0]}>
      {/* Elevated Foundation Podium (Granite plinth) */}
      <Box args={[width * 1.05, 0.4, depth * 1.05]} position={[0, 0.2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#334155" roughness={0.8} />
      </Box>
      {/* Front Grand Entrance Steps */}
      <Box args={[width * 0.5, 0.15, depth * 0.3]} position={[0, 0.075, depth * 0.58]} receiveShadow>
        <meshStandardMaterial color="#475569" roughness={0.7} />
      </Box>
      <Box args={[width * 0.44, 0.3, depth * 0.2]} position={[0, 0.15, depth * 0.54]} receiveShadow>
        <meshStandardMaterial color="#64748b" roughness={0.7} />
      </Box>

      {/* Main Building Base Mass (Limestone facade) */}
      <Box args={[width, height * 0.85, depth]} position={[0, height * 0.425 + 0.4, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#f1f5f9" roughness={0.65} metalness={0.05} />
      </Box>

      {/* Central Grand Glass Atrium (Translucent architectural glass) */}
      <Box args={[width * 0.45, height * 0.9, depth * 1.04]} position={[0, height * 0.45 + 0.4, 0]} castShadow>
        <meshStandardMaterial 
          color="#0284c7" 
          transparent 
          opacity={0.55} 
          roughness={0.15} 
          metalness={0.8} 
          emissive="#0369a1" 
          emissiveIntensity={0.15} 
        />
      </Box>

      {/* Colonnade: Grand Executive Pillars in front of atrium */}
      {pillars.map((px, idx) => (
        <group key={`col-${idx}`} position={[px, height * 0.45 + 0.4, depth * 0.52]}>
          <Box args={[0.3, height * 0.85, 0.3]} castShadow>
            <meshStandardMaterial color="#e2e8f0" roughness={0.4} metalness={0.1} />
          </Box>
          {/* Pillar Capital & Base */}
          <Box args={[0.42, 0.12, 0.42]} position={[0, height * 0.42, 0]}>
            <meshStandardMaterial color="#cbd5e1" roughness={0.5} />
          </Box>
          <Box args={[0.42, 0.12, 0.42]} position={[0, -height * 0.42, 0]}>
            <meshStandardMaterial color="#cbd5e1" roughness={0.5} />
          </Box>
        </group>
      ))}

      {/* Entablature Portico Beam above pillars */}
      <Box args={[width * 0.88, 0.35, depth * 0.35]} position={[0, height * 0.9 + 0.4, depth * 0.45]} castShadow>
        <meshStandardMaterial color="#e2e8f0" roughness={0.5} />
      </Box>

      {/* Horizontal Tinted Window Ribbons on Lateral Wings */}
      {[-1, 1].map((side) => (
        <group key={`wing-${side}`} position={[side * width * 0.32, height * 0.45 + 0.4, 0]}>
          {/* 3 Story Window Strips */}
          {[0.2, 0.5, 0.8].map((floorRatio, fIdx) => (
            <Box 
              key={`win-${fIdx}`} 
              args={[width * 0.28, height * 0.14, depth * 1.02]} 
              position={[0, (floorRatio - 0.5) * height * 0.75, 0]}
            >
              <meshStandardMaterial color="#0f172a" roughness={0.2} metalness={0.7} />
            </Box>
          ))}
          {/* Architectural Sun Louvers (brise-soleil) */}
          <Box args={[width * 0.3, 0.08, depth * 1.06]} position={[0, height * 0.15, 0]}>
            <meshStandardMaterial color="#94a3b8" />
          </Box>
        </group>
      ))}

      {/* Roof Parapet Rim with Decorative Coping */}
      <Box args={[width * 1.03, 0.3, depth * 1.03]} position={[0, height * 0.85 + 0.55, 0]} castShadow>
        <meshStandardMaterial color="#334155" roughness={0.8} />
      </Box>

      {/* Central Rooftop Clock Tower / Monument Pavillion */}
      <group position={[0, height * 0.85 + 0.4 + 1.2, 0]}>
        <Box args={[width * 0.22, 1.8, depth * 0.25]} castShadow>
          <meshStandardMaterial color="#e2e8f0" roughness={0.5} />
        </Box>
        {/* Clock Face Front */}
        <Cylinder args={[0.5, 0.5, 0.05, 24]} position={[0, 0.3, depth * 0.13]} rotation={[Math.PI / 2, 0, 0]}>
          <meshStandardMaterial color="#0284c7" emissive="#0284c7" emissiveIntensity={0.6} />
        </Cylinder>
        {/* Clock Hands / Gold Center */}
        <Cylinder args={[0.08, 0.08, 0.08, 12]} position={[0, 0.3, depth * 0.14]} rotation={[Math.PI / 2, 0, 0]}>
          <meshStandardMaterial color="#fbbf24" metalness={0.9} roughness={0.2} />
        </Cylinder>
        {/* Tower Pyramid Roof */}
        <Cone args={[width * 0.18, 1.1, 4]} position={[0, 1.4, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <meshStandardMaterial color="#0284c7" metalness={0.7} roughness={0.3} />
        </Cone>
        {/* Flagpole */}
        <Cylinder args={[0.03, 0.03, 1.4, 8]} position={[0, 2.4, 0]}>
          <meshStandardMaterial color="#e2e8f0" metalness={0.9} roughness={0.1} />
        </Cylinder>
        {/* Gold Finial */}
        <Sphere args={[0.08, 12, 12]} position={[0, 3.1, 0]}>
          <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.8} />
        </Sphere>
      </group>

      {/* Rooftop HVAC Plant Housing (recessed behind parapet) */}
      <Box args={[width * 0.2, 0.6, depth * 0.2]} position={[-width * 0.3, height * 0.85 + 0.65, -depth * 0.2]} castShadow>
        <meshStandardMaterial color="#64748b" roughness={0.9} />
      </Box>
    </group>
  );
});

/* ─────────────────────────────────────────────────────────────
   2. CENTRAL UNIVERSITY LIBRARY & LEARNING COMMONS
   Contemporary academic architecture:
   - Modern sculptural volume with cantilevered reading box
   - Vertical architectural louvers (evoking book spines)
   - Double-height glass curtain wall atrium with warm interior glow
   - Stepped rooftop skylight lantern & solar vents
───────────────────────────────────────────────────────────── */
export const CentralLibraryModel = React.memo(({ width, height, depth }: { width: number; height: number; depth: number }) => {
  const louverCount = 10;
  const louvers = useMemo(() => {
    return Array.from({ length: louverCount }).map((_, i) => {
      return -width * 0.42 + (i / (louverCount - 1)) * (width * 0.84);
    });
  }, [width]);

  return (
    <group position={[0, 0, 0]}>
      {/* Concrete Foundation Plinth */}
      <Box args={[width * 1.04, 0.3, depth * 1.04]} position={[0, 0.15, 0]} receiveShadow>
        <meshStandardMaterial color="#475569" roughness={0.8} />
      </Box>

      {/* Ground Floor Entrance & Circulation Hub */}
      <Box args={[width * 0.92, height * 0.35, depth * 0.92]} position={[0, height * 0.175 + 0.3, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#f8fafc" roughness={0.7} />
      </Box>

      {/* Recessed Ground Floor Glass Facade */}
      <Box args={[width * 0.8, height * 0.28, depth * 0.96]} position={[0, height * 0.15 + 0.3, depth * 0.05]} castShadow>
        <meshStandardMaterial color="#0284c7" transparent opacity={0.65} metalness={0.7} roughness={0.2} />
      </Box>

      {/* Dramatic Cantilevered 2nd & 3rd Floor Reading Wing */}
      <Box args={[width * 1.05, height * 0.6, depth * 1.08]} position={[0, height * 0.62 + 0.3, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#1e293b" roughness={0.7} metalness={0.2} />
      </Box>

      {/* Panoramic Glass Study Gallery on Cantilever */}
      <Box args={[width * 0.96, height * 0.42, depth * 1.1]} position={[0, height * 0.62 + 0.3, 0]} castShadow>
        <meshStandardMaterial 
          color="#38bdf8" 
          transparent 
          opacity={0.4} 
          roughness={0.15} 
          metalness={0.85} 
          emissive="#0284c7" 
          emissiveIntensity={0.1} 
        />
      </Box>

      {/* Vertical Architectural Sun Fins / Book-Spine Louvers */}
      {louvers.map((lx, idx) => (
        <Box 
          key={`louver-${idx}`} 
          args={[0.08, height * 0.46, 0.35]} 
          position={[lx, height * 0.62 + 0.3, depth * 0.56]} 
          castShadow
        >
          <meshStandardMaterial color="#d97706" roughness={0.6} metalness={0.3} />
        </Box>
      ))}

      {/* Modern Angled Roof Feature */}
      <Box 
        args={[width * 1.08, 0.3, depth * 1.12]} 
        position={[0, height * 0.95 + 0.3, 0]} 
        rotation={[0.04, 0, 0]} 
        castShadow
      >
        <meshStandardMaterial color="#0f172a" roughness={0.8} />
      </Box>

      {/* Stepped Glass Rooftop Skylight Lantern */}
      <group position={[0, height * 0.98 + 0.5, 0]}>
        <Box args={[width * 0.4, 0.5, depth * 0.4]} castShadow>
          <meshStandardMaterial color="#38bdf8" transparent opacity={0.75} roughness={0.1} metalness={0.9} emissive="#0284c7" emissiveIntensity={0.3} />
        </Box>
        <Box args={[width * 0.42, 0.1, depth * 0.42]} position={[0, 0.3, 0]}>
          <meshStandardMaterial color="#334155" roughness={0.8} />
        </Box>
      </group>
    </group>
  );
});

/* ─────────────────────────────────────────────────────────────
   3. UNIVERSITY AUDITORIUM & CONVOCATION HALL
   Civic performing arts center:
   - Sweeping sculptural curved acoustic shell (titanium composite)
   - Double-height panoramic glass foyer with entrance columns
   - Backstage fly tower & grand marquee entrance canopy
───────────────────────────────────────────────────────────── */
export const AuditoriumModel = React.memo(({ width, height, depth }: { width: number; height: number; depth: number }) => {
  return (
    <group position={[0, 0, 0]}>
      {/* Foundation & Outdoor Gathering Plaza */}
      <Box args={[width * 1.08, 0.3, depth * 1.08]} position={[0, 0.15, 0]} receiveShadow>
        <meshStandardMaterial color="#334155" roughness={0.8} />
      </Box>

      {/* Main Auditorium Hall Lower Box */}
      <Box args={[width * 0.94, height * 0.5, depth * 0.94]} position={[0, height * 0.25 + 0.3, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#cbd5e1" roughness={0.7} />
      </Box>

      {/* Sculptural Aerodynamic Curved Acoustic Shell Roof */}
      <Sphere 
        args={[Math.min(width, depth) * 0.58, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2]} 
        position={[0, height * 0.4 + 0.3, -depth * 0.05]} 
        scale={[1.1, 0.7, 1.15]}
        castShadow
      >
        <meshStandardMaterial 
          color="#64748b" 
          metalness={0.7} 
          roughness={0.25} 
        />
      </Sphere>

      {/* Double-Height Curved Glass Foyer & Entrance Lobby */}
      <Cylinder 
        args={[Math.min(width, depth) * 0.38, Math.min(width, depth) * 0.38, height * 0.45, 32, 1, false, 0, Math.PI]} 
        position={[0, height * 0.225 + 0.3, depth * 0.28]} 
        rotation={[0, Math.PI, 0]} 
        castShadow
      >
        <meshStandardMaterial 
          color="#0ea5e9" 
          transparent 
          opacity={0.45} 
          roughness={0.1} 
          metalness={0.9} 
          emissive="#0284c7" 
          emissiveIntensity={0.2} 
        />
      </Cylinder>

      {/* Grand Foyer Entrance Canopy / Marquee */}
      <Box args={[width * 0.5, 0.18, depth * 0.28]} position={[0, height * 0.25 + 0.3, depth * 0.48]} castShadow>
        <meshStandardMaterial color="#0f172a" roughness={0.7} metalness={0.4} />
      </Box>

      {/* Entrance Columns */}
      {[-width * 0.2, width * 0.2].map((cx, i) => (
        <Cylinder key={`aud-col-${i}`} args={[0.15, 0.15, height * 0.25, 16]} position={[cx, height * 0.125 + 0.3, depth * 0.58]} castShadow>
          <meshStandardMaterial color="#e2e8f0" metalness={0.5} roughness={0.3} />
        </Cylinder>
      ))}

      {/* Stage Fly Tower at the rear */}
      <Box args={[width * 0.45, height * 0.75, depth * 0.3]} position={[0, height * 0.375 + 0.3, -depth * 0.34]} castShadow>
        <meshStandardMaterial color="#475569" roughness={0.8} />
      </Box>
    </group>
  );
});

/* ─────────────────────────────────────────────────────────────
   4. COMPUTER SCIENCE & INNOVATION LAB
   Modern high-tech research facility:
   - Stepped dark obsidian glass facade with glowing cyan LED accents
   - Rooftop solar photovoltaic (PV) array with aluminum mounting
   - Satellite communications dish & IoT weather sensor mast
───────────────────────────────────────────────────────────── */
export const TechInnovationHubModel = React.memo(({ width, height, depth }: { width: number; height: number; depth: number }) => {
  return (
    <group position={[0, 0, 0]}>
      {/* Charcoal Foundation */}
      <Box args={[width * 1.04, 0.3, depth * 1.04]} position={[0, 0.15, 0]} receiveShadow>
        <meshStandardMaterial color="#0f172a" roughness={0.9} />
      </Box>

      {/* Main Structural Mass (Deep Charcoal & White architectural panels) */}
      <Box args={[width, height * 0.8, depth]} position={[0, height * 0.4 + 0.3, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#1e293b" roughness={0.5} metalness={0.3} />
      </Box>

      {/* Reflective Dark Obsidian Glass Curtain Wall */}
      <Box args={[width * 0.95, height * 0.72, depth * 1.03]} position={[0, height * 0.4 + 0.3, 0]} castShadow>
        <meshStandardMaterial 
          color="#0284c7" 
          transparent 
          opacity={0.7} 
          metalness={0.9} 
          roughness={0.1} 
        />
      </Box>

      {/* Cybernetic Glowing Cyan LED Accent Lines */}
      {[-0.2, 0.1, 0.4].map((yOffset, i) => (
        <Box key={`led-${i}`} args={[width * 1.02, 0.06, depth * 1.04]} position={[0, height * (0.4 + yOffset) + 0.3, 0]}>
          <meshStandardMaterial color="#06b6d4" emissive="#06b6d4" emissiveIntensity={2.5} />
        </Box>
      ))}

      {/* Stepped Cantilever Feature Block */}
      <Box args={[width * 0.4, height * 0.35, depth * 0.3]} position={[width * 0.28, height * 0.6 + 0.3, depth * 0.38]} castShadow>
        <meshStandardMaterial color="#f8fafc" roughness={0.6} />
      </Box>

      {/* Roof Parapet Rim */}
      <Box args={[width * 1.03, 0.25, depth * 1.03]} position={[0, height * 0.8 + 0.42, 0]} castShadow>
        <meshStandardMaterial color="#0f172a" roughness={0.8} />
      </Box>

      {/* Rooftop Solar Photovoltaic (PV) Array */}
      <group position={[-width * 0.2, height * 0.8 + 0.55, 0]}>
        {[-0.25, 0.25].map((oz, sIdx) => (
          <group key={`pv-row-${sIdx}`} position={[0, 0, oz * depth]}>
            {/* Tilted Solar Panels */}
            <Box 
              args={[width * 0.45, 0.06, depth * 0.22]} 
              rotation={[-0.25, 0, 0]} 
              position={[0, 0.15, 0]} 
              castShadow
            >
              <meshStandardMaterial color="#1e3a8a" metalness={0.9} roughness={0.1} emissive="#1d4ed8" emissiveIntensity={0.2} />
            </Box>
            {/* Mounting Struts */}
            <Cylinder args={[0.02, 0.02, 0.3]} position={[-width * 0.18, 0.15, 0.08]} rotation={[-0.25, 0, 0]}>
              <meshStandardMaterial color="#94a3b8" metalness={0.8} />
            </Cylinder>
            <Cylinder args={[0.02, 0.02, 0.3]} position={[width * 0.18, 0.15, 0.08]} rotation={[-0.25, 0, 0]}>
              <meshStandardMaterial color="#94a3b8" metalness={0.8} />
            </Cylinder>
          </group>
        ))}
      </group>

      {/* Rooftop Satellite Dish & Sensor Mast */}
      <group position={[width * 0.3, height * 0.8 + 0.45, -depth * 0.25]}>
        <Cylinder args={[0.04, 0.04, 1.8, 8]} position={[0, 0.9, 0]}>
          <meshStandardMaterial color="#e2e8f0" metalness={0.9} />
        </Cylinder>
        {/* Parabolic Dish */}
        <Sphere args={[0.4, 16, 16, 0, Math.PI * 2, 0, Math.PI / 3]} position={[0, 1.2, 0]} rotation={[-0.6, 0.4, 0]}>
          <meshStandardMaterial color="#cbd5e1" metalness={0.8} roughness={0.3} />
        </Sphere>
        {/* Blinking Red Beacon */}
        <Sphere args={[0.08, 12, 12]} position={[0, 1.8, 0]}>
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={2.0} />
        </Sphere>
      </group>
    </group>
  );
});

/* ─────────────────────────────────────────────────────────────
   5. RESEARCH SCIENCES (Chemistry, Physics, Microbiology)
   Modular research labs:
   - Clean architectural concrete with faculty-coded accent spandrels
   - Rooftop fume hood exhaust manifolds, stainless steel ductwork
   - Glazed entrance vestibule with covered architectural canopy
───────────────────────────────────────────────────────────── */
export const ScienceLabModel = React.memo(({ 
  width, 
  height, 
  depth, 
  accentColor = "#3b82f6" 
}: { 
  width: number; 
  height: number; 
  depth: number; 
  accentColor?: string;
}) => {
  return (
    <group position={[0, 0, 0]}>
      {/* Foundation */}
      <Box args={[width * 1.03, 0.3, depth * 1.03]} position={[0, 0.15, 0]} receiveShadow>
        <meshStandardMaterial color="#334155" roughness={0.8} />
      </Box>

      {/* Main Structural Mass (White cleanroom composite) */}
      <Box args={[width, height * 0.85, depth]} position={[0, height * 0.425 + 0.3, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#f8fafc" roughness={0.6} />
      </Box>

      {/* Faculty Accent Spandrel Glass Bands */}
      {[-0.22, 0.1, 0.38].map((yOff, fIdx) => (
        <group key={`band-${fIdx}`} position={[0, height * (0.425 + yOff) + 0.3, 0]}>
          {/* Glass window strip */}
          <Box args={[width * 0.92, height * 0.16, depth * 1.02]}>
            <meshStandardMaterial color="#0f172a" roughness={0.2} metalness={0.8} />
          </Box>
          {/* Faculty Colored Trim */}
          <Box args={[width * 0.94, 0.08, depth * 1.03]} position={[0, -height * 0.08, 0]}>
            <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={0.6} />
          </Box>
        </group>
      ))}

      {/* Entrance Glass Vestibule */}
      <Box args={[width * 0.35, height * 0.3, depth * 0.2]} position={[0, height * 0.15 + 0.3, depth * 0.52]} castShadow>
        <meshStandardMaterial color="#38bdf8" transparent opacity={0.6} roughness={0.1} metalness={0.8} />
      </Box>
      <Box args={[width * 0.4, 0.12, depth * 0.25]} position={[0, height * 0.3 + 0.3, depth * 0.52]}>
        <meshStandardMaterial color="#334155" roughness={0.7} />
      </Box>

      {/* Rooftop Parapet */}
      <Box args={[width * 1.02, 0.25, depth * 1.02]} position={[0, height * 0.85 + 0.42, 0]} castShadow>
        <meshStandardMaterial color="#475569" roughness={0.8} />
      </Box>

      {/* Rooftop Scientific Fume Hood Exhaust Stacks */}
      {[-width * 0.25, 0, width * 0.25].map((sx, idx) => (
        <group key={`fume-${idx}`} position={[sx, height * 0.85 + 0.3, -depth * 0.2]}>
          <Cylinder args={[0.16, 0.2, 1.2, 16]} position={[0, 0.6, 0]} castShadow>
            <meshStandardMaterial color="#cbd5e1" metalness={0.8} roughness={0.2} />
          </Cylinder>
          <Cylinder args={[0.26, 0.16, 0.3, 16]} position={[0, 1.3, 0]}>
            <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.3} />
          </Cylinder>
        </group>
      ))}
    </group>
  );
});

/* ─────────────────────────────────────────────────────────────
   6. UNIVERSITY MEDICAL & EMERGENCY TRAUMA CENTER
   Modern healthcare facility:
   - Clinical white facade with emergency crimson accents
   - Covered emergency ambulance bay with clearance canopy
   - Illuminated rooftop HELIPAD with concentric rings & emergency cross
───────────────────────────────────────────────────────────── */
export const MedicalCenterModel = React.memo(({ width, height, depth }: { width: number; height: number; depth: number }) => {
  return (
    <group position={[0, 0, 0]}>
      {/* Foundation */}
      <Box args={[width * 1.04, 0.3, depth * 1.04]} position={[0, 0.15, 0]} receiveShadow>
        <meshStandardMaterial color="#334155" roughness={0.8} />
      </Box>

      {/* Main Clinical Hospital Block */}
      <Box args={[width, height * 0.85, depth]} position={[0, height * 0.425 + 0.3, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#f8fafc" roughness={0.4} />
      </Box>

      {/* Emergency Crimson Banding */}
      <Box args={[width * 1.02, 0.25, depth * 1.02]} position={[0, height * 0.5 + 0.3, 0]}>
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.5} />
      </Box>

      {/* Tinted Ribbon Windows */}
      <Box args={[width * 0.9, height * 0.15, depth * 1.03]} position={[0, height * 0.68 + 0.3, 0]}>
        <meshStandardMaterial color="#0284c7" transparent opacity={0.6} roughness={0.1} metalness={0.8} />
      </Box>

      {/* Dedicated Emergency Ambulance Bay Canopy (Front Drive-Through) */}
      <group position={[width * 0.25, 0, depth * 0.55]}>
        <Box args={[width * 0.4, 0.15, depth * 0.35]} position={[0, height * 0.45, 0]} castShadow>
          <meshStandardMaterial color="#dc2626" emissive="#dc2626" emissiveIntensity={0.4} />
        </Box>
        {/* Canopy Support Columns */}
        <Cylinder args={[0.08, 0.08, height * 0.45, 12]} position={[-width * 0.16, height * 0.225, depth * 0.14]} castShadow>
          <meshStandardMaterial color="#cbd5e1" metalness={0.6} />
        </Cylinder>
        <Cylinder args={[0.08, 0.08, height * 0.45, 12]} position={[width * 0.16, height * 0.225, depth * 0.14]} castShadow>
          <meshStandardMaterial color="#cbd5e1" metalness={0.6} />
        </Cylinder>
      </group>

      {/* Roof Parapet Rim */}
      <Box args={[width * 1.02, 0.25, depth * 1.02]} position={[0, height * 0.85 + 0.42, 0]} castShadow>
        <meshStandardMaterial color="#475569" roughness={0.8} />
      </Box>

      {/* Authentic Illuminated Rooftop HELIPAD */}
      <group position={[-width * 0.15, height * 0.85 + 0.32, 0]}>
        {/* Helipad Octagonal Base Pad */}
        <Cylinder args={[Math.min(width, depth) * 0.42, Math.min(width, depth) * 0.42, 0.08, 16]} position={[0, 0.04, 0]} receiveShadow>
          <meshStandardMaterial color="#1e293b" roughness={0.8} />
        </Cylinder>
        {/* Outer White Circle */}
        <Ring args={[Math.min(width, depth) * 0.36, Math.min(width, depth) * 0.39, 32]} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.09, 0]}>
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.8} />
        </Ring>
        {/* Inner Yellow Hazard Ring */}
        <Ring args={[Math.min(width, depth) * 0.28, Math.min(width, depth) * 0.3, 32]} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.095, 0]}>
          <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={0.8} />
        </Ring>
        {/* Helipad Bold Red 'H' Cross */}
        <group position={[0, 0.1, 0]}>
          <Box args={[0.2, 0.02, 1.2]} position={[-0.4, 0, 0]}>
            <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={1.2} />
          </Box>
          <Box args={[0.2, 0.02, 1.2]} position={[0.4, 0, 0]}>
            <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={1.2} />
          </Box>
          <Box args={[0.8, 0.02, 0.22]} position={[0, 0, 0]}>
            <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={1.2} />
          </Box>
        </group>
        {/* Perimeter Green Navigation Lights */}
        {[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((ang, pIdx) => {
          const px = Math.cos(ang) * (Math.min(width, depth) * 0.4);
          const pz = Math.sin(ang) * (Math.min(width, depth) * 0.4);
          return (
            <Sphere key={`hl-${pIdx}`} args={[0.06, 8, 8]} position={[px, 0.12, pz]}>
              <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={2.5} />
            </Sphere>
          );
        })}
      </group>
    </group>
  );
});

/* ─────────────────────────────────────────────────────────────
   7. STUDENT RESIDENTIAL HALLS & HOSTELS (Boys, Girls, Staff)
   Contemporary campus living blocks:
   - Orderly rhythmic facade with student room balcony modules & dark metal railings
   - Ground floor student reception foyer with glass entry
   - Rooftop water utility storage towers & elevator overrun pavilion
───────────────────────────────────────────────────────────── */
export const HostelModel = React.memo(({ width, height, depth }: { width: number; height: number; depth: number }) => {
  return (
    <group position={[0, 0, 0]}>
      {/* Foundation */}
      <Box args={[width * 1.03, 0.3, depth * 1.03]} position={[0, 0.15, 0]} receiveShadow>
        <meshStandardMaterial color="#334155" roughness={0.8} />
      </Box>

      {/* Main Residential Mass */}
      <Box args={[width, height * 0.9, depth]} position={[0, height * 0.45 + 0.3, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#e2e8f0" roughness={0.8} metalness={0.05} />
      </Box>

      {/* Ground Floor Common Room / Lobby Glass */}
      <Box args={[width * 0.4, height * 0.22, depth * 1.03]} position={[0, height * 0.11 + 0.3, 0]} castShadow>
        <meshStandardMaterial color="#0284c7" transparent opacity={0.5} roughness={0.2} metalness={0.8} />
      </Box>

      {/* Rhythmic Balcony Projection Bands (Floors 2, 3, 4) */}
      {[0.35, 0.6, 0.82].map((floorRatio, idx) => (
        <group key={`balcony-${idx}`} position={[0, height * floorRatio + 0.3, 0]}>
          {/* Front Continuous Balcony Slab */}
          <Box args={[width * 0.94, 0.12, depth * 0.2]} position={[0, -0.2, depth * 0.52]} castShadow>
            <meshStandardMaterial color="#94a3b8" roughness={0.7} />
          </Box>
          {/* Dark Powder-Coated Metal Railing */}
          <Box args={[width * 0.92, 0.25, 0.05]} position={[0, 0, depth * 0.6]}>
            <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.3} />
          </Box>
          {/* Window insets */}
          <Box args={[width * 0.88, height * 0.15, depth * 1.01]} position={[0, 0.15, 0]}>
            <meshStandardMaterial color="#0f172a" roughness={0.2} metalness={0.7} />
          </Box>
        </group>
      ))}

      {/* Roof Parapet Rim */}
      <Box args={[width * 1.02, 0.3, depth * 1.02]} position={[0, height * 0.9 + 0.45, 0]} castShadow>
        <meshStandardMaterial color="#334155" roughness={0.9} />
      </Box>

      {/* Rooftop Utility Towers (Water Tanks & Elevator Machine Room) */}
      <group position={[width * 0.25, height * 0.9 + 0.3, -depth * 0.2]}>
        <Box args={[width * 0.25, 0.8, depth * 0.25]} position={[0, 0.4, 0]} castShadow>
          <meshStandardMaterial color="#64748b" roughness={0.8} />
        </Box>
        {/* Dual Stainless Steel Water Tanks */}
        <Cylinder args={[0.3, 0.3, 0.7, 16]} position={[-0.4, 1.05, 0]} castShadow>
          <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.2} />
        </Cylinder>
        <Cylinder args={[0.3, 0.3, 0.7, 16]} position={[0.4, 1.05, 0]} castShadow>
          <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.2} />
        </Cylinder>
      </group>
    </group>
  );
});

/* ─────────────────────────────────────────────────────────────
   8. CAMPUS FOOD COURT & STUDENT COMMONS
   Welcoming glass pavilion:
   - Floor-to-ceiling glass dining hall with warm interior glow
   - Timber pergola outdoor terrace with dining tables & café umbrellas
───────────────────────────────────────────────────────────── */
export const FoodCourtModel = React.memo(({ width, height, depth }: { width: number; height: number; depth: number }) => {
  return (
    <group position={[0, 0, 0]}>
      {/* Foundation / Patio Slab */}
      <Box args={[width * 1.08, 0.25, depth * 1.08]} position={[0, 0.125, 0]} receiveShadow>
        <meshStandardMaterial color="#d4a373" roughness={0.8} />
      </Box>

      {/* Main Glass Dining Hall */}
      <Box args={[width * 0.75, height * 0.75, depth * 0.8]} position={[-width * 0.1, height * 0.375 + 0.25, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#fef3c7" roughness={0.6} />
      </Box>

      {/* Floor-to-ceiling glass panoramic wall */}
      <Box args={[width * 0.72, height * 0.6, depth * 0.82]} position={[-width * 0.1, height * 0.35 + 0.25, 0]} castShadow>
        <meshStandardMaterial color="#38bdf8" transparent opacity={0.4} roughness={0.1} metalness={0.85} emissive="#fbbf24" emissiveIntensity={0.15} />
      </Box>

      {/* Contemporary Architectural Overhanging Roof */}
      <Box args={[width * 0.85, 0.2, depth * 0.9]} position={[-width * 0.1, height * 0.75 + 0.35, 0]} castShadow>
        <meshStandardMaterial color="#ea580c" roughness={0.6} />
      </Box>

      {/* Timber Pergola Outdoor Dining Terrace */}
      <group position={[width * 0.32, 0.25, 0]}>
        {/* Pergola Columns */}
        {[[-width * 0.1, -depth * 0.35], [-width * 0.1, depth * 0.35], [width * 0.1, -depth * 0.35], [width * 0.1, depth * 0.35]].map(([px, pz], i) => (
          <Box key={`pergola-col-${i}`} args={[0.08, height * 0.6, 0.08]} position={[px, height * 0.3, pz]} castShadow>
            <meshStandardMaterial color="#78350f" roughness={0.8} />
          </Box>
        ))}
        {/* Overhead Timber Slats */}
        {[-0.3, -0.15, 0, 0.15, 0.3].map((oz, sIdx) => (
          <Box key={`slat-${sIdx}`} args={[width * 0.26, 0.05, 0.08]} position={[0, height * 0.6, oz * depth]} castShadow>
            <meshStandardMaterial color="#92400e" roughness={0.7} />
          </Box>
        ))}
        {/* Outdoor Cafe Umbrellas & Tables */}
        {[-depth * 0.2, depth * 0.2].map((tz, tIdx) => (
          <group key={`table-${tIdx}`} position={[0, 0, tz]}>
            <Cylinder args={[0.25, 0.25, 0.3, 12]} position={[0, 0.15, 0]}>
              <meshStandardMaterial color="#e2e8f0" />
            </Cylinder>
            <Cone args={[0.65, 0.3, 8]} position={[0, 0.8, 0]} castShadow>
              <meshStandardMaterial color="#f97316" roughness={0.5} />
            </Cone>
            <Cylinder args={[0.03, 0.03, 0.8, 8]} position={[0, 0.4, 0]}>
              <meshStandardMaterial color="#475569" />
            </Cylinder>
          </group>
        ))}
      </group>
    </group>
  );
});

/* ─────────────────────────────────────────────────────────────
   9. INDOOR STADIUM & SPORTS COMPLEX
   Large-span athletic arena:
   - Arched space-frame barrel-vault roof with longitudinal skylight strip
   - Arena ticketing / entrance turnstile plaza
   - Exterior high-mast stadium floodlight towers with LED lamp rigs
───────────────────────────────────────────────────────────── */
export const IndoorStadiumModel = React.memo(({ width, height, depth }: { width: number; height: number; depth: number }) => {
  return (
    <group position={[0, 0, 0]}>
      {/* Foundation Plaza */}
      <Box args={[width * 1.06, 0.3, depth * 1.06]} position={[0, 0.15, 0]} receiveShadow>
        <meshStandardMaterial color="#334155" roughness={0.8} />
      </Box>

      {/* Main Arena Walls */}
      <Box args={[width, height * 0.65, depth]} position={[0, height * 0.325 + 0.3, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#e2e8f0" roughness={0.6} metalness={0.1} />
      </Box>

      {/* Structural Barrel-Vault Arched Roof */}
      <Cylinder 
        args={[Math.min(width, depth) * 0.52, Math.min(width, depth) * 0.52, Math.max(width, depth) * 0.98, 32, 1, false, 0, Math.PI]} 
        position={[0, height * 0.65 + 0.3, 0]} 
        rotation={[width > depth ? 0 : Math.PI / 2, 0, Math.PI / 2]} 
        castShadow
      >
        <meshStandardMaterial color="#64748b" metalness={0.65} roughness={0.3} />
      </Cylinder>

      {/* Longitudinal Skylight Strip across the arch */}
      <Box 
        args={[width > depth ? width * 0.85 : 0.8, 0.2, width > depth ? 0.8 : depth * 0.85]} 
        position={[0, height * 0.65 + Math.min(width, depth) * 0.5 + 0.35, 0]}
      >
        <meshStandardMaterial color="#38bdf8" transparent opacity={0.8} emissive="#0284c7" emissiveIntensity={0.5} />
      </Box>

      {/* Grand Entrance Glazing */}
      <Box args={[width * 0.45, height * 0.4, depth * 1.02]} position={[0, height * 0.2 + 0.3, 0]} castShadow>
        <meshStandardMaterial color="#0284c7" transparent opacity={0.6} roughness={0.1} metalness={0.8} />
      </Box>

      {/* High-Mast Stadium Floodlight Towers (4 corners) */}
      {[[-width * 0.46, -depth * 0.46], [width * 0.46, -depth * 0.46], [-width * 0.46, depth * 0.46], [width * 0.46, depth * 0.46]].map(([lx, lz], i) => (
        <group key={`stadium-light-${i}`} position={[lx, 0.3, lz]}>
          {/* Steel Mast */}
          <Cylinder args={[0.06, 0.1, height * 1.3, 8]} position={[0, height * 0.65, 0]} castShadow>
            <meshStandardMaterial color="#94a3b8" metalness={0.8} />
          </Cylinder>
          {/* LED Floodlight Bank Rig */}
          <Box args={[0.5, 0.25, 0.15]} position={[0, height * 1.3, 0]} rotation={[0.4, 0, 0]}>
            <meshStandardMaterial color="#f8fafc" emissive="#ffffff" emissiveIntensity={2.0} />
          </Box>
        </group>
      ))}
    </group>
  );
});

/* ─────────────────────────────────────────────────────────────
   10. OUTDOOR ATHLETIC FIELDS (Cricket Nets, Hockey, Sports Ground)
   High-detail outdoor sports:
   - Cricket: manicured turf, brown clay pitch, 3D protective chain-link cage, stumps
   - Hockey: emerald turf, crisp white regulation lines, goal cages
   - Sports ground: running track with terracotta lanes, lush infield, high-mast floodlights
───────────────────────────────────────────────────────────── */
export const OutdoorSportsModel = React.memo(({ 
  width, 
  depth, 
  name 
}: { 
  width: number; 
  depth: number; 
  name: string;
}) => {
  const nameLow = name.toLowerCase();

  if (nameLow.includes('cricket')) {
    return (
      <group position={[0, 0, 0]}>
        {/* Outfield Grass */}
        <Box args={[width, 0.15, depth]} position={[0, 0.075, 0]} receiveShadow>
          <meshStandardMaterial color="#166534" roughness={0.85} />
        </Box>
        {/* Regulation Brown Clay Pitch Strip */}
        <Box args={[width * 0.24, 0.18, depth * 0.85]} position={[0, 0.09, 0]} receiveShadow>
          <meshStandardMaterial color="#b45309" roughness={0.9} />
        </Box>
        {/* White Crease Lines */}
        <Box args={[width * 0.22, 0.19, 0.04]} position={[0, 0.096, depth * 0.35]}>
          <meshStandardMaterial color="#ffffff" />
        </Box>
        <Box args={[width * 0.22, 0.19, 0.04]} position={[0, 0.096, -depth * 0.35]}>
          <meshStandardMaterial color="#ffffff" />
        </Box>
        {/* Protective Practice Netting Cage (3D framed) */}
        <Box args={[width * 0.32, 2.2, depth * 0.9]} position={[0, 1.15, 0]}>
          <meshStandardMaterial color="#64748b" wireframe transparent opacity={0.6} />
        </Box>
        {/* Metal Framing Posts */}
        {[[-width * 0.15, -depth * 0.43], [width * 0.15, -depth * 0.43], [-width * 0.15, depth * 0.43], [width * 0.15, depth * 0.43]].map(([px, pz], i) => (
          <Cylinder key={`cricket-post-${i}`} args={[0.04, 0.04, 2.2, 8]} position={[px, 1.15, pz]}>
            <meshStandardMaterial color="#475569" metalness={0.7} />
          </Cylinder>
        ))}
        {/* Realistic Wicket Stumps */}
        {[-0.08, 0, 0.08].map((ox, i) => (
          <React.Fragment key={`stump-pair-${i}`}>
            <Cylinder args={[0.02, 0.02, 0.5, 8]} position={[ox, 0.34, depth * 0.36]}>
              <meshStandardMaterial color="#fef3c7" />
            </Cylinder>
            <Cylinder args={[0.02, 0.02, 0.5, 8]} position={[ox, 0.34, -depth * 0.36]}>
              <meshStandardMaterial color="#fef3c7" />
            </Cylinder>
          </React.Fragment>
        ))}
      </group>
    );
  } else if (nameLow.includes('hockey')) {
    return (
      <group position={[0, 0, 0]}>
        {/* High-grade Synthetic Turf */}
        <Box args={[width, 0.15, depth]} position={[0, 0.075, 0]} receiveShadow>
          <meshStandardMaterial color="#15803d" roughness={0.8} />
        </Box>
        {/* White Perimeter Boundary Line */}
        <Box args={[width * 0.92, 0.16, depth * 0.92]} position={[0, 0.08, 0]}>
          <meshStandardMaterial color="#166534" />
        </Box>
        {/* Center Line & Circle */}
        <Box args={[width * 0.9, 0.17, 0.06]} position={[0, 0.085, 0]}>
          <meshStandardMaterial color="#ffffff" />
        </Box>
        <Ring args={[width * 0.12, width * 0.14, 24]} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.17, 0]}>
          <meshStandardMaterial color="#ffffff" />
        </Ring>
        {/* Goal Cages with Netting */}
        {[-depth * 0.44, depth * 0.44].map((gz, gIdx) => (
          <group key={`goal-${gIdx}`} position={[0, 0, gz]}>
            <Box args={[width * 0.25, 0.8, 0.25]} position={[0, 0.48, 0]}>
              <meshStandardMaterial color="#ffffff" wireframe />
            </Box>
            <Box args={[width * 0.25, 0.05, 0.25]} position={[0, 0.08, 0]}>
              <meshStandardMaterial color="#dc2626" />
            </Box>
          </group>
        ))}
      </group>
    );
  } else {
    // Sports Ground (Full Athletic Running Track & Infield)
    return (
      <group position={[0, 0, 0]}>
        {/* Base Pad */}
        <Box args={[width, 0.12, depth]} position={[0, 0.06, 0]} receiveShadow>
          <meshStandardMaterial color="#334155" roughness={0.9} />
        </Box>
        {/* Terracotta Oval Athletic Running Track */}
        <Cylinder args={[Math.min(width, depth) * 0.46, Math.min(width, depth) * 0.46, 0.16, 32]} position={[0, 0.08, 0]} scale={[width / depth > 1.4 ? 1.5 : 1, 1, 1]} receiveShadow>
          <meshStandardMaterial color="#b91c1c" roughness={0.8} />
        </Cylinder>
        {/* White Lane Striping Ring */}
        <Ring args={[Math.min(width, depth) * 0.4, Math.min(width, depth) * 0.41, 32]} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.17, 0]}>
          <meshStandardMaterial color="#ffffff" />
        </Ring>
        <Ring args={[Math.min(width, depth) * 0.35, Math.min(width, depth) * 0.36, 32]} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.17, 0]}>
          <meshStandardMaterial color="#ffffff" />
        </Ring>
        {/* Inner Green Grass Infield */}
        <Cylinder args={[Math.min(width, depth) * 0.3, Math.min(width, depth) * 0.3, 0.18, 32]} position={[0, 0.09, 0]} scale={[width / depth > 1.4 ? 1.5 : 1, 1, 1]} receiveShadow>
          <meshStandardMaterial color="#22c55e" roughness={0.85} />
        </Cylinder>
      </group>
    );
  }
});

/* ─────────────────────────────────────────────────────────────
   11. DATA CENTER & CENTRAL UTILITY (Generator Room)
   High-security industrial infrastructure:
   - Intake ventilation louvers, high-voltage transformers
   - Backup diesel generator exhaust stacks with warning hazard marks
───────────────────────────────────────────────────────────── */
export const UtilitySubstationModel = React.memo(({ width, height, depth }: { width: number; height: number; depth: number }) => {
  return (
    <group position={[0, 0, 0]}>
      {/* Heavy-Duty Foundation Pad */}
      <Box args={[width * 1.04, 0.35, depth * 1.04]} position={[0, 0.175, 0]} receiveShadow>
        <meshStandardMaterial color="#1e293b" roughness={0.9} />
      </Box>

      {/* Main Reinforced Concrete Facility */}
      <Box args={[width, height * 0.75, depth]} position={[0, height * 0.375 + 0.35, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#475569" roughness={0.8} metalness={0.2} />
      </Box>

      {/* Industrial Air Intake Ventilation Louvers */}
      <Box args={[width * 0.6, height * 0.3, depth * 1.02]} position={[0, height * 0.4 + 0.35, 0]}>
        <meshStandardMaterial color="#0f172a" roughness={0.5} metalness={0.7} />
      </Box>

      {/* Dual Heavy-Duty Backup Generator Exhaust Cylinders */}
      {[-width * 0.25, width * 0.25].map((gx, idx) => (
        <group key={`gen-${idx}`} position={[gx, height * 0.75 + 0.35, 0]}>
          <Cylinder args={[0.25, 0.3, 1.2, 16]} position={[0, 0.6, 0]} castShadow>
            <meshStandardMaterial color="#64748b" metalness={0.8} roughness={0.2} />
          </Cylinder>
          {/* Yellow/Black Warning Rim */}
          <Box args={[0.6, 0.1, 0.6]} position={[0, 0.1, 0]}>
            <meshStandardMaterial color="#eab308" emissive="#ca8a04" emissiveIntensity={0.5} />
          </Box>
        </group>
      ))}

      {/* Exterior High-Voltage Transformer Substation Units */}
      <group position={[0, 0.35, depth * 0.42]}>
        <Box args={[width * 0.45, height * 0.4, depth * 0.2]} position={[0, height * 0.2, 0]} castShadow>
          <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.3} />
        </Box>
        {/* Warning Hazard Strobe */}
        <Sphere args={[0.08, 12, 12]} position={[0, height * 0.4 + 0.1, 0]}>
          <meshStandardMaterial color="#eab308" emissive="#facc15" emissiveIntensity={2.0} />
        </Sphere>
      </group>
    </group>
  );
});

/* ─────────────────────────────────────────────────────────────
   12. CAMPUS SECURITY COMMAND GATEWAY
   Checkpost & main entry architecture:
   - 360-degree observation glass booth
   - Dual boom barrier arms with safety hazard stripes
   - Overhead surveillance camera mast & digital campus sign
───────────────────────────────────────────────────────────── */
export const SecurityGatehouseModel = React.memo(({ width, height, depth }: { width: number; height: number; depth: number }) => {
  return (
    <group position={[0, 0, 0]}>
      {/* Foundation */}
      <Box args={[width * 1.05, 0.25, depth * 1.05]} position={[0, 0.125, 0]} receiveShadow>
        <meshStandardMaterial color="#1e293b" roughness={0.8} />
      </Box>

      {/* Prefab Security Booth Body */}
      <Box args={[width * 0.7, height * 0.8, depth * 0.7]} position={[0, height * 0.4 + 0.25, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#f8fafc" roughness={0.6} />
      </Box>

      {/* 360-Degree Observation Glass Ribbon */}
      <Box args={[width * 0.72, height * 0.35, depth * 0.72]} position={[0, height * 0.45 + 0.25, 0]} castShadow>
        <meshStandardMaterial color="#38bdf8" transparent opacity={0.65} metalness={0.85} roughness={0.15} />
      </Box>

      {/* Overhanging Cobalt Architectural Roof */}
      <Box args={[width * 0.9, 0.18, depth * 0.9]} position={[0, height * 0.8 + 0.34, 0]} castShadow>
        <meshStandardMaterial color="#0284c7" roughness={0.6} />
      </Box>

      {/* Surveillance Camera Mast on Roof */}
      <group position={[0, height * 0.8 + 0.43, 0]}>
        <Cylinder args={[0.04, 0.04, 1.2, 8]} position={[0, 0.6, 0]}>
          <meshStandardMaterial color="#94a3b8" metalness={0.8} />
        </Cylinder>
        <Box args={[0.2, 0.1, 0.35]} position={[0, 1.15, 0.1]} rotation={[0.3, 0, 0]}>
          <meshStandardMaterial color="#0f172a" />
        </Box>
        <Sphere args={[0.04, 8, 8]} position={[0, 1.12, 0.27]}>
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={2.5} />
        </Sphere>
      </group>

      {/* Boom Barrier Gate Arm with Striping */}
      <group position={[width * 0.48, 0.25, 0]}>
        {/* Base Pillar */}
        <Cylinder args={[0.08, 0.08, 0.6, 12]} position={[0, 0.3, 0]} castShadow>
          <meshStandardMaterial color="#dc2626" />
        </Cylinder>
        {/* Barrier Arm */}
        <Box args={[width * 0.9, 0.06, 0.06]} position={[width * 0.45, 0.55, 0]} castShadow>
          <meshStandardMaterial color="#facc15" emissive="#eab308" emissiveIntensity={0.5} />
        </Box>
      </group>
    </group>
  );
});

/* ─────────────────────────────────────────────────────────────
   13. BOTANICAL GARDEN & ECO PARK LANDSCAPE
   Lush natural campus landscaping:
   - Landscaped stone retaining border curbs
   - Multi-species 3D trees (conifers, shade trees, flowering canopies)
   - Gravel walking paths & park benches
───────────────────────────────────────────────────────────── */
export const ParkLandscapeModel = React.memo(({ 
  width, 
  depth, 
  name 
}: { 
  width: number; 
  depth: number; 
  name: string;
}) => {
  const isEco = name.toLowerCase().includes('eco');
  const treeCount = isEco ? 14 : 7;

  const trees = useMemo(() => {
    return Array.from({ length: treeCount }).map((_, i) => {
      const angle = i * 2.39996;
      const r = Math.sqrt((i + 1) / (treeCount + 1)) * 0.4;
      const tx = Math.cos(angle) * r * width;
      const tz = Math.sin(angle) * r * depth;
      const scale = 0.8 + (i % 3) * 0.25;
      const type = i % 3; // 0 = Pine conifer, 1 = Broadleaf shade tree, 2 = Flowering cherry
      return { id: i, tx, tz, scale, type };
    });
  }, [width, depth, treeCount]);

  return (
    <group position={[0, 0, 0]}>
      {/* Stone Retaining Border Curb */}
      <Box args={[width * 1.02, 0.2, depth * 1.02]} position={[0, 0.1, 0]} receiveShadow>
        <meshStandardMaterial color="#64748b" roughness={0.9} />
      </Box>

      {/* Lush Green Park Lawn */}
      <Box args={[width, 0.22, depth]} position={[0, 0.11, 0]} receiveShadow>
        <meshStandardMaterial color="#15803d" roughness={0.85} />
      </Box>

      {/* Decorative Winding Gravel Path */}
      <Box args={[width * 0.18, 0.23, depth * 0.9]} position={[0, 0.115, 0]} rotation={[0, 0.15, 0]} receiveShadow>
        <meshStandardMaterial color="#cbd5e1" roughness={0.95} />
      </Box>

      {/* Detailed Multi-Species 3D Trees */}
      {trees.map((t) => (
        <group key={t.id} position={[t.tx, 0.2, t.tz]} scale={t.scale}>
          {/* Trunk */}
          <Cylinder args={[0.08, 0.12, 1.2, 8]} position={[0, 0.6, 0]} castShadow>
            <meshStandardMaterial color="#78350f" roughness={0.9} />
          </Cylinder>

          {t.type === 0 ? (
            /* Pine Conifer (Stacked Cones) */
            <group position={[0, 1.2, 0]}>
              <Cone args={[0.65, 1.0, 8]} position={[0, 0.4, 0]} castShadow>
                <meshStandardMaterial color="#14532d" roughness={0.8} />
              </Cone>
              <Cone args={[0.5, 0.8, 8]} position={[0, 0.9, 0]} castShadow>
                <meshStandardMaterial color="#166534" roughness={0.8} />
              </Cone>
            </group>
          ) : t.type === 1 ? (
            /* Broadleaf Lush Shade Tree (Clustered Spheres) */
            <group position={[0, 1.3, 0]}>
              <Sphere args={[0.7, 12, 12]} position={[0, 0.4, 0]} scale={[1, 0.9, 1]} castShadow>
                <meshStandardMaterial color="#22c55e" roughness={0.7} />
              </Sphere>
              <Sphere args={[0.45, 10, 10]} position={[0.3, 0.7, 0.2]} castShadow>
                <meshStandardMaterial color="#16a34a" roughness={0.7} />
              </Sphere>
            </group>
          ) : (
            /* Flowering Blossom Tree */
            <group position={[0, 1.3, 0]}>
              <Sphere args={[0.65, 12, 12]} position={[0, 0.4, 0]} scale={[1.1, 0.85, 1.1]} castShadow>
                <meshStandardMaterial color="#f472b6" roughness={0.7} />
              </Sphere>
            </group>
          )}
        </group>
      ))}

      {/* Modern Park Benches along gravel path */}
      {[-depth * 0.25, depth * 0.25].map((bz, bIdx) => (
        <group key={`bench-${bIdx}`} position={[width * 0.18, 0.22, bz]}>
          <Box args={[0.15, 0.25, 0.6]} position={[0, 0.125, 0]} castShadow>
            <meshStandardMaterial color="#92400e" roughness={0.7} />
          </Box>
        </group>
      ))}
    </group>
  );
});

/* ─────────────────────────────────────────────────────────────
   14. UNIFIED PROCEDURAL CAMPUS BUILDING MODEL SELECTOR
   Matches building types & faculty names to professional 3D models
───────────────────────────────────────────────────────────── */
export const BuildingModel = React.memo(({ 
  room, 
  width, 
  height, 
  depth 
}: { 
  room: Room; 
  width: number; 
  height: number; 
  depth: number;
}) => {
  const type = room.type || "unknown";
  const nameLow = room.name.toLowerCase();

  if (type === 'admin') {
    return <AdministrativeBuildingModel width={width} height={height} depth={depth} />;
  }

  if (type === 'library') {
    return <CentralLibraryModel width={width} height={height} depth={depth} />;
  }

  if (type === 'auditorium') {
    return <AuditoriumModel width={width} height={height} depth={depth} />;
  }

  if (type === 'medical') {
    return <MedicalCenterModel width={width} height={height} depth={depth} />;
  }

  if (type === 'hostel') {
    return <HostelModel width={width} height={height} depth={depth} />;
  }

  if (type === 'food') {
    return <FoodCourtModel width={width} height={height} depth={depth} />;
  }

  if (type === 'security') {
    return <SecurityGatehouseModel width={width} height={height} depth={depth} />;
  }

  if (type === 'utility') {
    return <UtilitySubstationModel width={width} height={height} depth={depth} />;
  }

  if (type === 'park') {
    return <ParkLandscapeModel width={width} depth={depth} name={room.name} />;
  }

  if (type === 'sports') {
    if (nameLow.includes('indoor') || nameLow.includes('stadium')) {
      return <IndoorStadiumModel width={width} height={height} depth={depth} />;
    }
    return <OutdoorSportsModel width={width} depth={depth} name={room.name} />;
  }

  // Academic / Faculty Blocks
  if (nameLow.includes('computer') || nameLow.includes('innovation')) {
    return <TechInnovationHubModel width={width} height={height} depth={depth} />;
  }

  if (nameLow.includes('chemistry')) {
    return <ScienceLabModel width={width} height={height} depth={depth} accentColor="#f59e0b" />;
  }

  if (nameLow.includes('physics')) {
    return <ScienceLabModel width={width} height={height} depth={depth} accentColor="#3b82f6" />;
  }

  if (nameLow.includes('microbiology')) {
    return <ScienceLabModel width={width} height={height} depth={depth} accentColor="#8b5cf6" />;
  }

  // Default Standard Academic Hall (Economics, Education, Classrooms)
  return <ScienceLabModel width={width} height={height} depth={depth} accentColor="#0ea5e9" />;
});

/* ─────────────────────────────────────────────────────────────
   15. ARCHITECTURAL STREETLIGHT FIXTURE
   Modern LED light pole with arm and downward illumination
───────────────────────────────────────────────────────────── */
export const StreetlightFixture = React.memo(({ 
  position, 
  isNight 
}: { 
  position: [number, number, number]; 
  isNight: boolean;
}) => {
  return (
    <group position={position}>
      {/* Base Anchor Plinth */}
      <Cylinder args={[0.15, 0.2, 0.2, 8]} position={[0, 0.1, 0]}>
        <meshStandardMaterial color="#1e293b" />
      </Cylinder>
      {/* Slender Architectural Pole */}
      <Cylinder args={[0.05, 0.08, 4.2, 8]} position={[0, 2.2, 0]} castShadow>
        <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.2} />
      </Cylinder>
      {/* Horizontal Luminaire Arm */}
      <Box args={[0.8, 0.06, 0.12]} position={[0.35, 4.25, 0]} castShadow>
        <meshStandardMaterial color="#334155" metalness={0.8} />
      </Box>
      {/* LED Light Head */}
      <Box args={[0.3, 0.08, 0.14]} position={[0.65, 4.2, 0]}>
        <meshStandardMaterial 
          color="#f8fafc" 
          emissive={isNight ? "#fef08a" : "#f8fafc"} 
          emissiveIntensity={isNight ? 3.0 : 0.4} 
        />
      </Box>
      {/* Warm Nighttime Spot Pool */}
      {isNight && (
        <pointLight 
          position={[0.65, 4.0, 0]} 
          color="#fef08a" 
          intensity={1.8} 
          distance={14} 
          decay={2} 
        />
      )}
    </group>
  );
});

/* ─────────────────────────────────────────────────────────────
   16. CAMPUS ROADS, SIDEWALKS & INFRASTRUCTURE
   - Deep rich natural lawn turf
   - Clean dark asphalt roads with dashed lane markings
   - Pedestrian crosswalk zebra stripes at intersections
   - Concrete pedestrian walkways connecting building doors
   - Modern architectural perimeter boundary wall with pillars
───────────────────────────────────────────────────────────── */
export const CampusRoadsAndGround = React.memo(({ 
  gridSize, 
  roads, 
  isNight,
  isTargeting,
  onMapClick,
  onMapRightClick
}: { 
  gridSize: GridPoint; 
  roads: GridPoint[]; 
  isNight: boolean;
  isTargeting?: boolean;
  onMapClick?: (p: THREE.Vector3) => void;
  onMapRightClick?: (p: THREE.Vector3) => void;
}) => {
  const margin = 12;
  const compSizeX = gridSize.x + margin * 2;
  const compSizeY = gridSize.y + margin * 2;
  const halfX = compSizeX / 2;
  const halfY = compSizeY / 2;

  // Generate strategically placed streetlights along the primary road arteries
  const streetlights = useMemo(() => {
    const lights: Array<[number, number, number]> = [];
    // Artery Y = 21, 51, 81 and X = 26, 61, 91
    const xPositions = [15, 38, 55, 78, 102];
    const yRoads = [24, 54, 84];
    
    yRoads.forEach((yR) => {
      xPositions.forEach((xR) => {
        const [wx, , wz] = getGridPosition({ x: xR, y: yR, f: 0 }, gridSize, 0);
        lights.push([wx, 0, wz]);
      });
    });
    return lights;
  }, [gridSize]);

  return (
    <group>
      {/* Deep Rich Campus Lawn Ground */}
      <Plane
        args={[compSizeX, compSizeY]}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
        onClick={(e) => {
          if (isTargeting && onMapClick) { e.stopPropagation(); onMapClick(e.point); }
        }}
        onContextMenu={(e) => {
          e.nativeEvent.preventDefault();
          if (isTargeting && onMapRightClick) {
            e.stopPropagation();
            onMapRightClick(e.point);
          }
        }}
        onPointerOver={() => { if (isTargeting) document.body.style.cursor = 'crosshair'; }}
        onPointerOut={() => { if (isTargeting) document.body.style.cursor = 'auto'; }}
      >
        <meshStandardMaterial 
          color={isNight ? '#0f2918' : '#1c4524'} 
          roughness={0.92} 
          metalness={0.02}
        />
      </Plane>

      {/* Main Asphalt Road Network Tiles */}
      <Instances limit={roads.length + 10} receiveShadow>
        <boxGeometry args={[CELL_SIZE * 0.98, 0.04, CELL_SIZE * 0.98]} />
        <meshStandardMaterial 
          color={isNight ? '#0b0f19' : '#1e2433'} 
          roughness={0.7} 
          metalness={0.15} 
        />
        {roads.map((road, i) => {
          const [x, y, z] = getGridPosition(road, gridSize, 0.02);
          return <Instance key={`rd-${i}`} position={[x, y, z]} />;
        })}
      </Instances>

      {/* Road Lane Markings (Crisp dashed white stripes) */}
      <Instances limit={Math.floor(roads.length / 3) + 10} receiveShadow>
        <boxGeometry args={[CELL_SIZE * 0.5, 0.05, 0.08]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={isNight ? 0.2 : 0.05} />
        {roads.filter((_, idx) => idx % 3 === 0).map((road, i) => {
          const [x, y, z] = getGridPosition(road, gridSize, 0.026);
          return <Instance key={`stripe-${i}`} position={[x, y, z]} />;
        })}
      </Instances>

      {/* Streetlights along roads */}
      {streetlights.map((pos, idx) => (
        <StreetlightFixture key={`stlight-${idx}`} position={pos} isNight={isNight} />
      ))}

      {/* Architectural Perimeter Compound Wall with Pilasters */}
      <group>
        {/* Back Wall */}
        <Box args={[compSizeX, 1.8, 0.6]} position={[0, 0.9, halfY]} castShadow receiveShadow>
          <meshStandardMaterial color={isNight ? '#0f172a' : '#cbd5e1'} roughness={0.8} />
        </Box>
        {/* Front Wall */}
        <Box args={[compSizeX, 1.8, 0.6]} position={[0, 0.9, -halfY]} castShadow receiveShadow>
          <meshStandardMaterial color={isNight ? '#0f172a' : '#cbd5e1'} roughness={0.8} />
        </Box>
        {/* Right Wall */}
        <Box args={[0.6, 1.8, compSizeY]} position={[halfX, 0.9, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={isNight ? '#0f172a' : '#cbd5e1'} roughness={0.8} />
        </Box>
        {/* Left Wall */}
        <Box args={[0.6, 1.8, compSizeY]} position={[-halfX, 0.9, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={isNight ? '#0f172a' : '#cbd5e1'} roughness={0.8} />
        </Box>
      </group>
    </group>
  );
});

/* ─────────────────────────────────────────────────────────────
   17. SLEEK 3D BUILDING BADGE (Glassmorphism HUD Label)
   Replaces primitive black boxes with elegant aerospace-grade pills
───────────────────────────────────────────────────────────── */
export const Building3DLabel = React.memo(({ 
  room, 
  height, 
  isSelected, 
  onClick 
}: { 
  room: Room; 
  height: number; 
  isSelected?: boolean;
  onClick?: () => void;
}) => {
  const getCategoryIcon = (type: string = '', name: string = '') => {
    const nameLow = name.toLowerCase();
    if (type === 'admin') return <Landmark className="w-3.5 h-3.5 text-blue-400" />;
    if (type === 'library') return <BookOpen className="w-3.5 h-3.5 text-amber-400" />;
    if (type === 'auditorium') return <Music className="w-3.5 h-3.5 text-indigo-400" />;
    if (type === 'medical') return <Stethoscope className="w-3.5 h-3.5 text-red-400" />;
    if (type === 'hostel') return <Home className="w-3.5 h-3.5 text-cyan-400" />;
    if (type === 'food') return <Coffee className="w-3.5 h-3.5 text-orange-400" />;
    if (type === 'security') return <Shield className="w-3.5 h-3.5 text-emerald-400" />;
    if (type === 'utility') return <Zap className="w-3.5 h-3.5 text-yellow-400" />;
    if (type === 'sports') return <Trophy className="w-3.5 h-3.5 text-green-400" />;
    if (type === 'park') return <TreePine className="w-3.5 h-3.5 text-emerald-400" />;
    if (nameLow.includes('computer') || nameLow.includes('innovation')) {
      return <Cpu className="w-3.5 h-3.5 text-cyan-400" />;
    }
    return <FlaskConical className="w-3.5 h-3.5 text-purple-400" />;
  };

  return (
    <Html 
      position={[0, height + 1.2, 0]} 
      center 
      distanceFactor={60}
      style={{ pointerEvents: 'auto' }}
    >
      <div 
        onClick={onClick}
        className={`group cursor-pointer select-none transition-all duration-300 transform hover:scale-105 active:scale-95 ${
          isSelected 
            ? 'scale-110' 
            : ''
        }`}
      >
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-sans font-semibold tracking-wide backdrop-blur-xl border transition-all shadow-xl ${
          isSelected
            ? 'bg-cyan-950/90 border-cyan-400 text-white shadow-[0_0_20px_rgba(6,182,212,0.6)]'
            : 'bg-slate-950/85 hover:bg-slate-900 border-white/15 hover:border-cyan-500/50 text-gray-200 hover:text-white shadow-[0_4px_20px_rgba(0,0,0,0.6)]'
        }`}>
          {getCategoryIcon(room.type, room.name)}
          <span className="truncate max-w-[140px] whitespace-nowrap">{room.name}</span>
          {isSelected && (
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
          )}
        </div>
      </div>
    </Html>
  );
});
