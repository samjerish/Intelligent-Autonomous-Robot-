import React, { useMemo } from 'react';
import type { Room, GridPoint } from '../types';
import { Box, Cylinder, Sphere, Html, RoundedBox, Cone } from '@react-three/drei';
import * as THREE from 'three';

// Category color palettes and architectural constants
export const getBuildingCategory = (room: Room): {
  category: 'admin' | 'academic' | 'library' | 'auditorium' | 'medical' | 'hostel' | 'sports' | 'food' | 'utility' | 'security' | 'park';
  icon: string;
  badgeColor: string;
  subTitle: string;
} => {
  const type = room.type || 'unknown';
  const nameLow = room.name.toLowerCase();

  if (type === 'admin' || nameLow.includes('administrative') || nameLow.includes('senate')) {
    return { category: 'admin', icon: '🏛️', badgeColor: 'border-blue-500/50 text-blue-400 bg-blue-500/10', subTitle: 'Administration & Senate' };
  }
  if (type === 'library' || nameLow.includes('library')) {
    return { category: 'library', icon: '📚', badgeColor: 'border-amber-500/50 text-amber-400 bg-amber-500/10', subTitle: 'Central University Library' };
  }
  if (type === 'auditorium' || nameLow.includes('auditorium')) {
    return { category: 'auditorium', icon: '🎭', badgeColor: 'border-indigo-500/50 text-indigo-400 bg-indigo-500/10', subTitle: 'Performing Arts & Convocation' };
  }
  if (type === 'medical' || nameLow.includes('medical') || nameLow.includes('health') || nameLow.includes('clinic')) {
    return { category: 'medical', icon: '🏥', badgeColor: 'border-red-500/50 text-red-400 bg-red-500/10', subTitle: 'Emergency & Health Center' };
  }
  if (type === 'hostel' || nameLow.includes('hostel') || nameLow.includes('quarters') || nameLow.includes('residence')) {
    return { category: 'hostel', icon: '🏠', badgeColor: 'border-cyan-500/50 text-cyan-400 bg-cyan-500/10', subTitle: 'Student & Faculty Living' };
  }
  if (type === 'food' || nameLow.includes('food') || nameLow.includes('cafeteria') || nameLow.includes('canteen')) {
    return { category: 'food', icon: '☕', badgeColor: 'border-orange-500/50 text-orange-400 bg-orange-500/10', subTitle: 'Student Commons & Dining' };
  }
  if (type === 'sports' || nameLow.includes('stadium') || nameLow.includes('cricket') || nameLow.includes('hockey') || nameLow.includes('ground') || nameLow.includes('pool')) {
    return { category: 'sports', icon: '🏆', badgeColor: 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10', subTitle: 'Athletics & Recreation' };
  }
  if (type === 'park' || nameLow.includes('park') || nameLow.includes('garden')) {
    return { category: 'park', icon: '🌳', badgeColor: 'border-green-500/50 text-green-400 bg-green-500/10', subTitle: 'Eco Reserve & Botanical' };
  }
  if (type === 'security' || nameLow.includes('security') || nameLow.includes('gate')) {
    return { category: 'security', icon: '🛡️', badgeColor: 'border-sky-500/50 text-sky-400 bg-sky-500/10', subTitle: 'Security Command & Gate' };
  }
  if (type === 'utility' || nameLow.includes('generator') || nameLow.includes('data center') || nameLow.includes('power')) {
    return { category: 'utility', icon: '⚡', badgeColor: 'border-yellow-500/50 text-yellow-400 bg-yellow-500/10', subTitle: 'Critical Infrastructure & Power' };
  }
  return { category: 'academic', icon: '🔬', badgeColor: 'border-purple-500/50 text-purple-400 bg-purple-500/10', subTitle: 'Academic Faculty & Research' };
};

// Calculate realistic building height based on architectural program
export const getBuildingHeight = (room: Room): number => {
  const { category } = getBuildingCategory(room);
  const nameLow = room.name.toLowerCase();

  switch (category) {
    case 'admin':
      return 7.5;
    case 'library':
      return 6.5;
    case 'auditorium':
      return 6.8;
    case 'hostel':
      return 6.2;
    case 'academic':
      if (nameLow.includes('computer') || nameLow.includes('innovation')) return 5.8;
      if (nameLow.includes('physics') || nameLow.includes('chemistry') || nameLow.includes('microbiology')) return 5.4;
      return 5.0;
    case 'medical':
      return 5.0;
    case 'food':
      return 4.0;
    case 'indoor stadium':
    case 'sports':
      if (nameLow.includes('indoor') || nameLow.includes('stadium')) return 6.5;
      return 0.4; // Open field / court
    case 'park':
      return 0.3; // Open park terrain
    case 'utility':
      if (nameLow.includes('data center')) return 4.8;
      return 3.6;
    case 'security':
      return 3.0;
    default:
      return 4.8;
  }
};

/* ── Modern Architectural Materials ── */
const MAT = {
  concreteLight: '#e2e8f0',
  concretePodium: '#cbd5e1',
  concreteDark: '#334155',
  slateWall: '#1e293b',
  charcoalWall: '#0f172a',
  glassCurtain: '#38bdf8',
  glassDark: '#0284c7',
  solarCell: '#1e3a8a',
  metalAccent: '#64748b',
  trimWhite: '#f8fafc',
  warmWood: '#b45309',
  emergencyRed: '#ef4444',
  medicalTeal: '#0d9488',
  safetyYellow: '#f59e0b',
  athleticGreen: '#15803d',
  clayTrack: '#b91c1c',
  grassLawn: '#1b3b22'
};

/* ── Rooftop HVAC Unit ── */
const RooftopHVAC = ({ position = [0, 0, 0], scale = 1 }: { position?: [number, number, number]; scale?: number }) => (
  <group position={position} scale={scale}>
    <Box args={[1.4, 0.7, 1.0]} position={[0, 0.35, 0]} castShadow>
      <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} />
    </Box>
    <Cylinder args={[0.35, 0.35, 0.1, 16]} position={[-0.3, 0.75, 0]} castShadow>
      <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.2} />
    </Cylinder>
    <Cylinder args={[0.35, 0.35, 0.1, 16]} position={[0.3, 0.75, 0]} castShadow>
      <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.2} />
    </Cylinder>
  </group>
);

/* ── Rooftop Solar Array ── */
const SolarArray = ({ position = [0, 0, 0], rows = 2, cols = 3 }: { position?: [number, number, number]; rows?: number; cols?: number }) => (
  <group position={position}>
    {Array.from({ length: rows }).map((_, r) =>
      Array.from({ length: cols }).map((_, c) => (
        <group key={`sol-${r}-${c}`} position={[(c - (cols - 1) / 2) * 1.5, 0.2, (r - (rows - 1) / 2) * 1.2]} rotation={[0.35, 0, 0]}>
          <Box args={[1.3, 0.04, 0.9]} castShadow>
            <meshStandardMaterial color={MAT.solarCell} metalness={0.9} roughness={0.15} />
          </Box>
          <Box args={[1.34, 0.05, 0.94]} position={[0, -0.01, 0]}>
            <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.4} />
          </Box>
          <Cylinder args={[0.02, 0.02, 0.3, 8]} position={[0.5, -0.15, 0.3]} castShadow>
            <meshStandardMaterial color="#64748b" metalness={0.8} />
          </Cylinder>
          <Cylinder args={[0.02, 0.02, 0.3, 8]} position={[-0.5, -0.15, 0.3]} castShadow>
            <meshStandardMaterial color="#64748b" metalness={0.8} />
          </Cylinder>
        </group>
      ))
    )}
  </group>
);

/* ── Window Strip / Glass Ribbon Component ── */
const WindowBand = ({ width, height, position, color = MAT.glassCurtain }: { width: number; height: number; position: [number, number, number]; color?: string }) => (
  <group position={position}>
    <Box args={[width, height, 0.08]} castShadow>
      <meshStandardMaterial
        color={color}
        roughness={0.15}
        metalness={0.7}
        transparent
        opacity={0.85}
      />
    </Box>
    {/* Mullion vertical dividers */}
    {Array.from({ length: Math.max(2, Math.floor(width / 1.6)) }).map((_, i, arr) => {
      const step = width / (arr.length + 1);
      const xOffset = -width / 2 + step * (i + 1);
      return (
        <Box key={i} args={[0.04, height + 0.02, 0.1]} position={[xOffset, 0, 0]}>
          <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.3} />
        </Box>
      );
    })}
  </group>
);

/* ── Entrance Portico with Glass Canopy ── */
const EntrancePortico = ({ width = 4, height = 1.6, depth = 1.2, position = [0, 0, 0] }: { width?: number; height?: number; depth?: number; position?: [number, number, number] }) => (
  <group position={position}>
    {/* Glass canopy roof */}
    <Box args={[width, 0.1, depth]} position={[0, height, depth / 2]} castShadow receiveShadow>
      <meshStandardMaterial color="#0284c7" transparent opacity={0.65} metalness={0.8} roughness={0.1} />
    </Box>
    <Box args={[width + 0.1, 0.08, 0.08]} position={[0, height, depth]}>
      <meshStandardMaterial color="#0f172a" metalness={0.8} />
    </Box>
    {/* Dual Columns */}
    <Cylinder args={[0.08, 0.08, height, 16]} position={[-width * 0.45, height / 2, depth * 0.9]} castShadow>
      <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.3} />
    </Cylinder>
    <Cylinder args={[0.08, 0.08, height, 16]} position={[width * 0.45, height / 2, depth * 0.9]} castShadow>
      <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.3} />
    </Cylinder>
    {/* Double Sliding Glass Doors */}
    <Box args={[width * 0.6, height * 0.9, 0.06]} position={[0, height * 0.45, 0.02]}>
      <meshStandardMaterial color="#0369a1" transparent opacity={0.7} metalness={0.6} roughness={0.2} />
    </Box>
  </group>
);

/* ── Detailed Realistic Tree ── */
export const RealisticTree = ({ position, scale = 1, type = 'broadleaf' }: { position: [number, number, number]; scale?: number; type?: 'broadleaf' | 'pine' | 'flowering' }) => {
  const foliageColor = type === 'flowering' ? '#ec4899' : type === 'pine' ? '#14532d' : '#15803d';
  const trunkHeight = 1.0 * scale;

  return (
    <group position={position}>
      {/* Trunk */}
      <Cylinder args={[0.12 * scale, 0.18 * scale, trunkHeight, 8]} position={[0, trunkHeight / 2, 0]} castShadow>
        <meshStandardMaterial color="#582f0e" roughness={0.9} />
      </Cylinder>
      {/* Foliage Canopy */}
      {type === 'pine' ? (
        <group position={[0, trunkHeight, 0]}>
          <Cone args={[0.9 * scale, 1.2 * scale, 7]} position={[0, 0.5 * scale, 0]} castShadow>
            <meshStandardMaterial color={foliageColor} roughness={0.8} />
          </Cone>
          <Cone args={[0.7 * scale, 1.0 * scale, 7]} position={[0, 1.1 * scale, 0]} castShadow>
            <meshStandardMaterial color="#166534" roughness={0.8} />
          </Cone>
          <Cone args={[0.45 * scale, 0.8 * scale, 7]} position={[0, 1.6 * scale, 0]} castShadow>
            <meshStandardMaterial color="#15803d" roughness={0.8} />
          </Cone>
        </group>
      ) : (
        <group position={[0, trunkHeight + 0.5 * scale, 0]}>
          <Sphere args={[0.85 * scale, 12, 10]} position={[0, 0, 0]} scale={[1, 0.9, 1]} castShadow>
            <meshStandardMaterial color={foliageColor} roughness={0.85} />
          </Sphere>
          <Sphere args={[0.65 * scale, 10, 8]} position={[0.25 * scale, 0.4 * scale, 0.1 * scale]} scale={[0.9, 0.85, 0.9]} castShadow>
            <meshStandardMaterial color={type === 'flowering' ? '#f472b6' : '#22c55e'} roughness={0.85} />
          </Sphere>
          <Sphere args={[0.55 * scale, 10, 8]} position={[-0.25 * scale, 0.35 * scale, -0.15 * scale]} scale={[0.9, 0.85, 0.9]} castShadow>
            <meshStandardMaterial color={type === 'flowering' ? '#db2777' : '#16a34a'} roughness={0.85} />
          </Sphere>
        </group>
      )}
    </group>
  );
};

/* ── Modern Architectural Streetlight ── */
export const ArchitecturalStreetlight = ({ position, isNight = false }: { position: [number, number, number]; isNight?: boolean }) => {
  return (
    <group position={position}>
      {/* Ground Base */}
      <Cylinder args={[0.15, 0.2, 0.2, 8]} position={[0, 0.1, 0]} castShadow>
        <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.3} />
      </Cylinder>
      {/* Sleek Vertical Mast */}
      <Cylinder args={[0.06, 0.08, 4.2, 12]} position={[0, 2.2, 0]} castShadow>
        <meshStandardMaterial color="#334155" metalness={0.85} roughness={0.25} />
      </Cylinder>
      {/* Horizontal Luminaire Arm */}
      <Box args={[0.08, 0.08, 1.0]} position={[0, 4.25, 0.45]} castShadow>
        <meshStandardMaterial color="#1e293b" metalness={0.85} roughness={0.25} />
      </Box>
      {/* LED Luminaire Head */}
      <Box args={[0.22, 0.06, 0.4]} position={[0, 4.22, 0.85]} castShadow>
        <meshStandardMaterial color="#0f172a" metalness={0.9} />
      </Box>
      {/* Glowing Emitter */}
      <Box args={[0.18, 0.02, 0.34]} position={[0, 4.18, 0.85]}>
        <meshStandardMaterial
          color={isNight ? '#fef08a' : '#ffffff'}
          emissive={isNight ? '#fef08a' : '#ffffff'}
          emissiveIntensity={isNight ? 1.8 : 0.4}
        />
      </Box>
      {isNight && (
        <pointLight position={[0, 4.0, 0.85]} intensity={0.8} distance={8} color="#fef08a" decay={2} />
      )}
    </group>
  );
};

/* =====================================================================
   MAIN COMPONENT: Comprehensive Building Architecture Renderer
===================================================================== */
export const ProfessionalBuildingModel = React.memo(({
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
  const { category } = getBuildingCategory(room);
  const nameLow = room.name.toLowerCase();

  // Common architectural podium for grounding
  const podiumH = 0.3;
  const mainBodyH = height - podiumH - 0.25;

  /* ─────────────────────────────────────────────────────────────
     1. ADMINISTRATIVE BUILDING (Senate Hall & Executive Plaza)
  ───────────────────────────────────────────────────────────── */
  if (category === 'admin') {
    const wingW = width * 0.32;
    const centerW = width * 0.36;
    return (
      <group position={[0, 0, 0]}>
        {/* Granite Foundation Podium */}
        <Box args={[width + 0.6, podiumH, depth + 0.6]} position={[0, podiumH / 2, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={MAT.concretePodium} roughness={0.9} />
        </Box>
        {/* Entrance Steps */}
        <Box args={[centerW * 0.8, 0.15, depth * 0.2]} position={[0, 0.075, depth * 0.55]} receiveShadow>
          <meshStandardMaterial color="#94a3b8" />
        </Box>

        {/* Central High-Ceiling Atrium */}
        <Box args={[centerW, mainBodyH * 1.05, depth * 0.95]} position={[0, podiumH + (mainBodyH * 1.05) / 2, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#f8fafc" roughness={0.85} />
        </Box>

        {/* Grand Civic Colonnade (Square Columns in Front) */}
        {[-centerW * 0.38, -centerW * 0.13, centerW * 0.13, centerW * 0.38].map((cx, idx) => (
          <Box key={idx} args={[0.3, mainBodyH * 0.85, 0.3]} position={[cx, podiumH + (mainBodyH * 0.85) / 2, depth * 0.5]} castShadow>
            <meshStandardMaterial color="#e2e8f0" metalness={0.2} roughness={0.6} />
          </Box>
        ))}

        {/* Grand Portico Entablature (Beam above columns) */}
        <Box args={[centerW * 1.05, 0.4, 0.6]} position={[0, podiumH + mainBodyH * 0.87, depth * 0.5]} castShadow>
          <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.4} />
        </Box>

        {/* Central Glass Curtain Wall with University Emblem */}
        <WindowBand
          width={centerW * 0.75}
          height={mainBodyH * 0.65}
          position={[0, podiumH + mainBodyH * 0.45, depth * 0.48]}
          color="#38bdf8"
        />

        {/* Left & Right Executive Wings with Tinted Ribbon Windows */}
        {[-1, 1].map((side) => {
          const posX = side * (width / 2 - wingW / 2);
          return (
            <group key={side} position={[posX, podiumH + (mainBodyH * 0.85) / 2, 0]}>
              <Box args={[wingW, mainBodyH * 0.85, depth * 0.88]} castShadow receiveShadow>
                <meshStandardMaterial color="#f1f5f9" roughness={0.9} />
              </Box>
              {/* Floor 1 Windows */}
              <WindowBand width={wingW * 0.85} height={mainBodyH * 0.28} position={[0, -mainBodyH * 0.18, depth * 0.45]} />
              {/* Floor 2 Windows */}
              <WindowBand width={wingW * 0.85} height={mainBodyH * 0.28} position={[0, mainBodyH * 0.18, depth * 0.45]} />
            </group>
          );
        })}

        {/* Stepped Clock / Monument Tower on Roof */}
        <Box args={[centerW * 0.5, 1.8, centerW * 0.5]} position={[0, podiumH + mainBodyH * 1.05 + 0.9, 0]} castShadow>
          <meshStandardMaterial color="#0f172a" metalness={0.6} roughness={0.4} />
        </Box>
        {/* University Clock Face */}
        <Cylinder args={[0.5, 0.5, 0.05, 32]} position={[0, podiumH + mainBodyH * 1.05 + 1.1, centerW * 0.26]} rotation={[Math.PI / 2, 0, 0]}>
          <meshStandardMaterial color="#ffffff" emissive="#bae6fd" emissiveIntensity={0.3} />
        </Cylinder>
        {/* Rooftop Flagstaff */}
        <Cylinder args={[0.04, 0.04, 2.2, 12]} position={[0, podiumH + mainBodyH * 1.05 + 2.8, 0]}>
          <meshStandardMaterial color="#cbd5e1" metalness={0.9} />
        </Cylinder>
        {/* Roof HVAC units */}
        <RooftopHVAC position={[-width * 0.35, podiumH + mainBodyH * 0.85 + 0.1, -depth * 0.2]} />
        <RooftopHVAC position={[width * 0.35, podiumH + mainBodyH * 0.85 + 0.1, -depth * 0.2]} />
      </group>
    );
  }

  /* ─────────────────────────────────────────────────────────────
     2. CENTRAL UNIVERSITY LIBRARY & LEARNING COMMONS
  ───────────────────────────────────────────────────────────── */
  if (category === 'library') {
    return (
      <group position={[0, 0, 0]}>
        {/* Foundation Plinth */}
        <Box args={[width + 0.4, podiumH, depth + 0.4]} position={[0, podiumH / 2, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={MAT.concretePodium} roughness={0.9} />
        </Box>

        {/* Lower Solid Archive Base (Warm Stone) */}
        <Box args={[width * 0.92, mainBodyH * 0.45, depth * 0.92]} position={[0, podiumH + (mainBodyH * 0.45) / 2, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#cbd5e1" roughness={0.95} />
        </Box>

        {/* Cantilevered Glass Study Pavilion (Upper 2 Floors) */}
        <Box args={[width * 1.06, mainBodyH * 0.55, depth * 1.06]} position={[0, podiumH + mainBodyH * 0.45 + (mainBodyH * 0.55) / 2, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#0284c7" transparent opacity={0.35} metalness={0.7} roughness={0.15} />
        </Box>
        {/* Inner Solid Core */}
        <Box args={[width * 0.75, mainBodyH * 0.53, depth * 0.75]} position={[0, podiumH + mainBodyH * 0.45 + (mainBodyH * 0.53) / 2, 0]}>
          <meshStandardMaterial color="#1e293b" roughness={0.9} />
        </Box>

        {/* Vertical Architectural Sun-Fins (Book-Spine Concept) */}
        {Array.from({ length: 8 }).map((_, i) => {
          const xPos = -width * 0.48 + i * (width * 0.96 / 7);
          return (
            <Box key={`fin-${i}`} args={[0.08, mainBodyH * 0.58, 0.4]} position={[xPos, podiumH + mainBodyH * 0.45 + (mainBodyH * 0.55) / 2, depth * 0.54]} castShadow>
              <meshStandardMaterial color="#f59e0b" roughness={0.7} />
            </Box>
          );
        })}

        {/* Ground Floor Entrance Portico */}
        <EntrancePortico width={width * 0.35} height={1.8} depth={1.0} position={[0, podiumH, depth * 0.46]} />

        {/* Slanted Architectural Roof Feature with Skylight */}
        <Box args={[width * 1.08, 0.3, depth * 1.08]} position={[0, podiumH + mainBodyH + 0.15, 0]} rotation={[0.05, 0, 0]} castShadow>
          <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.3} />
        </Box>
        {/* Rooftop Glass Skylight Lantern */}
        <Box args={[width * 0.45, 0.5, depth * 0.45]} position={[0, podiumH + mainBodyH + 0.45, 0]} castShadow>
          <meshStandardMaterial color="#38bdf8" transparent opacity={0.8} metalness={0.8} />
        </Box>
        <RooftopHVAC position={[width * 0.3, podiumH + mainBodyH + 0.3, -depth * 0.25]} scale={0.9} />
      </group>
    );
  }

  /* ─────────────────────────────────────────────────────────────
     3. UNIVERSITY AUDITORIUM & CONVOCATION HALL
  ───────────────────────────────────────────────────────────── */
  if (category === 'auditorium') {
    return (
      <group position={[0, 0, 0]}>
        {/* Foundation Base */}
        <Box args={[width + 0.5, podiumH, depth + 0.5]} position={[0, podiumH / 2, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={MAT.concretePodium} roughness={0.9} />
        </Box>

        {/* Main Hall Body (Acoustic Shell Geometry) */}
        <Box args={[width * 0.95, mainBodyH * 0.65, depth * 0.85]} position={[0, podiumH + (mainBodyH * 0.65) / 2, -depth * 0.05]} castShadow receiveShadow>
          <meshStandardMaterial color="#334155" roughness={0.8} />
        </Box>

        {/* Sweeping Faceted Titanium Acoustic Shell Roof */}
        <Cylinder
          args={[Math.min(width, depth) * 0.52, Math.min(width, depth) * 0.52, width * 0.96, 32, 1, false, 0, Math.PI]}
          position={[0, podiumH + mainBodyH * 0.6, -depth * 0.05]}
          rotation={[0, 0, Math.PI / 2]}
          castShadow
        >
          <meshStandardMaterial color="#94a3b8" metalness={0.65} roughness={0.25} />
        </Cylinder>

        {/* Rear Fly Tower (Stage Scenery House) */}
        <Box args={[width * 0.6, mainBodyH * 0.9, depth * 0.3]} position={[0, podiumH + (mainBodyH * 0.9) / 2, -depth * 0.42]} castShadow>
          <meshStandardMaterial color="#1e293b" roughness={0.9} />
        </Box>

        {/* Double-Height Grand Glass Entrance Foyer */}
        <Box args={[width * 0.85, mainBodyH * 0.5, depth * 0.25]} position={[0, podiumH + (mainBodyH * 0.5) / 2, depth * 0.42]} castShadow>
          <meshStandardMaterial color="#38bdf8" transparent opacity={0.6} metalness={0.7} roughness={0.15} />
        </Box>
        {/* Dramatic Marquee Entrance Canopy */}
        <Box args={[width * 0.9, 0.2, 1.4]} position={[0, podiumH + mainBodyH * 0.45, depth * 0.48]} castShadow>
          <meshStandardMaterial color="#0f172a" metalness={0.8} />
        </Box>
        <Box args={[width * 0.86, 0.05, 0.2]} position={[0, podiumH + mainBodyH * 0.44, depth * 0.48 + 0.6]}>
          <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.8} />
        </Box>
      </group>
    );
  }

  /* ─────────────────────────────────────────────────────────────
     4. MEDICAL CENTER & EMERGENCY TRAUMA BAY
  ───────────────────────────────────────────────────────────── */
  if (category === 'medical') {
    return (
      <group position={[0, 0, 0]}>
        {/* Clean Clinical Podium */}
        <Box args={[width + 0.4, podiumH, depth + 0.4]} position={[0, podiumH / 2, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={MAT.concretePodium} roughness={0.9} />
        </Box>

        {/* Main Clinical Complex (White Architectural Composite) */}
        <Box args={[width * 0.95, mainBodyH, depth * 0.9]} position={[0, podiumH + mainBodyH / 2, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#f8fafc" roughness={0.9} />
        </Box>

        {/* Horizontal Red Medical Cross Banding */}
        <Box args={[width * 0.97, 0.25, depth * 0.92]} position={[0, podiumH + mainBodyH * 0.65, 0]} castShadow>
          <meshStandardMaterial color={MAT.emergencyRed} roughness={0.4} />
        </Box>
        <Box args={[width * 0.97, 0.25, depth * 0.92]} position={[0, podiumH + mainBodyH * 0.35, 0]} castShadow>
          <meshStandardMaterial color="#0284c7" roughness={0.4} />
        </Box>

        {/* Ribbon Windows */}
        <WindowBand width={width * 0.8} height={mainBodyH * 0.22} position={[0, podiumH + mainBodyH * 0.8, depth * 0.46]} />
        <WindowBand width={width * 0.8} height={mainBodyH * 0.22} position={[0, podiumH + mainBodyH * 0.5, depth * 0.46]} />

        {/* Emergency Drive-In Ambulance Canopy */}
        <group position={[width * 0.25, podiumH, depth * 0.48]}>
          <Box args={[width * 0.45, 0.15, 2.0]} position={[0, 2.2, 1.0]} castShadow>
            <meshStandardMaterial color="#e2e8f0" metalness={0.4} />
          </Box>
          <Cylinder args={[0.08, 0.08, 2.2, 12]} position={[width * 0.18, 1.1, 1.9]} castShadow>
            <meshStandardMaterial color="#ef4444" />
          </Cylinder>
          <Cylinder args={[0.08, 0.08, 2.2, 12]} position={[-width * 0.18, 1.1, 1.9]} castShadow>
            <meshStandardMaterial color="#ef4444" />
          </Cylinder>
        </group>

        {/* ROOFTOP HELIPAD */}
        <group position={[0, podiumH + mainBodyH + 0.05, 0]}>
          {/* Helipad Octagonal Base Pad */}
          <Cylinder args={[Math.min(width, depth) * 0.38, Math.min(width, depth) * 0.38, 0.12, 16]} position={[0, 0.06, 0]} castShadow>
            <meshStandardMaterial color="#1e293b" roughness={0.8} />
          </Cylinder>
          {/* White Outer Circle */}
          <Cylinder args={[Math.min(width, depth) * 0.33, Math.min(width, depth) * 0.33, 0.13, 32]} position={[0, 0.065, 0]}>
            <meshStandardMaterial color="#ffffff" />
          </Cylinder>
          {/* Dark Inner Fill */}
          <Cylinder args={[Math.min(width, depth) * 0.30, Math.min(width, depth) * 0.30, 0.14, 32]} position={[0, 0.07, 0]}>
            <meshStandardMaterial color="#0f172a" />
          </Cylinder>
          {/* Yellow Safety Perimeter */}
          <Cylinder args={[Math.min(width, depth) * 0.28, Math.min(width, depth) * 0.28, 0.145, 32]} position={[0, 0.072, 0]}>
            <meshStandardMaterial color="#facc15" />
          </Cylinder>
          <Cylinder args={[Math.min(width, depth) * 0.25, Math.min(width, depth) * 0.25, 0.15, 32]} position={[0, 0.075, 0]}>
            <meshStandardMaterial color="#0f172a" />
          </Cylinder>
          {/* Prominent Red 'H' Helipad Cross */}
          <Box args={[0.3, 0.16, 1.4]} position={[-0.45, 0.08, 0]}>
            <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.6} />
          </Box>
          <Box args={[0.3, 0.16, 1.4]} position={[0.45, 0.08, 0]}>
            <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.6} />
          </Box>
          <Box args={[0.9, 0.16, 0.3]} position={[0, 0.08, 0]}>
            <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.6} />
          </Box>
        </group>
      </group>
    );
  }

  /* ─────────────────────────────────────────────────────────────
     5. RESIDENTIAL HALLS (Hostels & Staff Quarters)
  ───────────────────────────────────────────────────────────── */
  if (category === 'hostel') {
    const isBoys = nameLow.includes('boy');
    const isStaff = nameLow.includes('staff');
    const facadeColor = isStaff ? '#f8fafc' : isBoys ? '#cbd5e1' : '#f1f5f9';
    const accentColor = isStaff ? '#3b82f6' : isBoys ? '#0284c7' : '#ec4899';

    return (
      <group position={[0, 0, 0]}>
        {/* Foundation Plinth */}
        <Box args={[width + 0.4, podiumH, depth + 0.4]} position={[0, podiumH / 2, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={MAT.concretePodium} roughness={0.9} />
        </Box>

        {/* Main Residential Block */}
        <Box args={[width * 0.95, mainBodyH, depth * 0.92]} position={[0, podiumH + mainBodyH / 2, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={facadeColor} roughness={0.95} />
        </Box>

        {/* Rhythm of Student Room Balcony Insets (3 Floors) */}
        {[0.25, 0.55, 0.85].map((levelRatio, fIdx) => (
          <group key={fIdx} position={[0, podiumH + mainBodyH * levelRatio - 0.2, depth * 0.47]}>
            {/* Balcony Continuous Slab */}
            <Box args={[width * 0.92, 0.1, 0.4]} castShadow>
              <meshStandardMaterial color={accentColor} metalness={0.4} roughness={0.6} />
            </Box>
            {/* Dark Guard Railings */}
            <Box args={[width * 0.9, 0.4, 0.04]} position={[0, 0.25, 0.18]}>
              <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.3} />
            </Box>
            {/* Windows Behind Balcony */}
            {Array.from({ length: 5 }).map((_, wIdx) => {
              const xPos = -width * 0.38 + wIdx * (width * 0.76 / 4);
              return (
                <Box key={wIdx} args={[0.7, 0.8, 0.05]} position={[xPos, 0.5, -0.15]}>
                  <meshStandardMaterial color="#0284c7" metalness={0.6} roughness={0.2} transparent opacity={0.8} />
                </Box>
              );
            })}
          </group>
        ))}

        {/* Ground Floor Entrance Reception Canopy */}
        <EntrancePortico width={width * 0.3} height={1.8} depth={1.2} position={[0, podiumH, depth * 0.47]} />

        {/* Rooftop Parapet Perimeter */}
        <Box args={[width * 0.98, 0.35, depth * 0.95]} position={[0, podiumH + mainBodyH + 0.17, 0]} castShadow>
          <meshStandardMaterial color="#334155" roughness={0.9} />
        </Box>
        {/* Rooftop Water Utility Tanks */}
        <group position={[-width * 0.25, podiumH + mainBodyH + 0.6, -depth * 0.2]}>
          <Cylinder args={[0.5, 0.5, 0.9, 16]} castShadow>
            <meshStandardMaterial color="#0284c7" metalness={0.5} roughness={0.4} />
          </Cylinder>
          <Cylinder args={[0.5, 0.5, 0.9, 16]} position={[1.1, 0, 0]} castShadow>
            <meshStandardMaterial color="#0284c7" metalness={0.5} roughness={0.4} />
          </Cylinder>
        </group>
        {/* Elevator Overrun Pavilion */}
        <Box args={[width * 0.22, 1.2, depth * 0.22]} position={[width * 0.25, podiumH + mainBodyH + 0.6, 0]} castShadow>
          <meshStandardMaterial color="#1e293b" roughness={0.9} />
        </Box>
      </group>
    );
  }

  /* ─────────────────────────────────────────────────────────────
     6. HIGH-TECH COMPUTER SCIENCE & INNOVATION LAB
  ───────────────────────────────────────────────────────────── */
  if (nameLow.includes('computer') || nameLow.includes('innovation')) {
    return (
      <group position={[0, 0, 0]}>
        {/* High-Tech Foundation */}
        <Box args={[width + 0.4, podiumH, depth + 0.4]} position={[0, podiumH / 2, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.3} />
        </Box>

        {/* Stepped Dark Obsidian Tech Body */}
        <Box args={[width * 0.95, mainBodyH, depth * 0.9]} position={[0, podiumH + mainBodyH / 2, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#0f172a" metalness={0.85} roughness={0.2} />
        </Box>

        {/* Reflective Glass Curtain Wall with Cyan LED Accent Fins */}
        <WindowBand width={width * 0.88} height={mainBodyH * 0.35} position={[0, podiumH + mainBodyH * 0.7, depth * 0.46]} color="#0ea5e9" />
        <WindowBand width={width * 0.88} height={mainBodyH * 0.35} position={[0, podiumH + mainBodyH * 0.28, depth * 0.46]} color="#0ea5e9" />

        {/* Cyan Cybernetic Accent Trims */}
        <Box args={[width * 0.97, 0.08, 0.08]} position={[0, podiumH + mainBodyH * 0.5, depth * 0.46]}>
          <meshStandardMaterial color="#06b6d4" emissive="#06b6d4" emissiveIntensity={1.2} />
        </Box>
        <Box args={[width * 0.97, 0.08, 0.08]} position={[0, podiumH + mainBodyH, depth * 0.46]}>
          <meshStandardMaterial color="#06b6d4" emissive="#06b6d4" emissiveIntensity={1.2} />
        </Box>

        {/* High-Tech Cantilever Entrance */}
        <EntrancePortico width={width * 0.4} height={2.0} depth={1.4} position={[0, podiumH, depth * 0.46]} />

        {/* ROOFTOP PHOTOVOLTAIC SOLAR ARRAY & SATELLITE DISH */}
        <group position={[0, podiumH + mainBodyH, 0]}>
          <SolarArray position={[-width * 0.1, 0, -depth * 0.1]} rows={2} cols={Math.max(2, Math.floor(width / 2.5))} />
          {/* Satellite Telemetry Dish */}
          <group position={[width * 0.35, 0.6, depth * 0.25]} rotation={[0.4, 0.6, 0]}>
            <Cylinder args={[0.04, 0.04, 0.8, 8]} position={[0, -0.4, 0]} castShadow>
              <meshStandardMaterial color="#94a3b8" metalness={0.9} />
            </Cylinder>
            <Sphere args={[0.4, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} position={[0, 0, 0]} rotation={[Math.PI, 0, 0]} castShadow>
              <meshStandardMaterial color="#f8fafc" metalness={0.8} roughness={0.2} />
            </Sphere>
          </group>
        </group>
      </group>
    );
  }

  /* ─────────────────────────────────────────────────────────────
     7. RESEARCH SCIENCES (Chemistry, Physics, Microbiology)
  ───────────────────────────────────────────────────────────── */
  if (nameLow.includes('chemistry') || nameLow.includes('physics') || nameLow.includes('microbiology')) {
    const facultyColor = nameLow.includes('chem') ? '#f59e0b' : nameLow.includes('phys') ? '#3b82f6' : '#8b5cf6';

    return (
      <group position={[0, 0, 0]}>
        <Box args={[width + 0.4, podiumH, depth + 0.4]} position={[0, podiumH / 2, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={MAT.concretePodium} roughness={0.9} />
        </Box>

        {/* Main Research Labs Block */}
        <Box args={[width * 0.94, mainBodyH, depth * 0.9]} position={[0, podiumH + mainBodyH / 2, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#f8fafc" roughness={0.9} />
        </Box>

        {/* Faculty-Specific Spandrel Accent Stripe */}
        <Box args={[width * 0.96, 0.3, depth * 0.92]} position={[0, podiumH + mainBodyH * 0.5, 0]} castShadow>
          <meshStandardMaterial color={facultyColor} metalness={0.4} roughness={0.5} />
        </Box>

        {/* Ribbon Laboratory Windows */}
        <WindowBand width={width * 0.85} height={mainBodyH * 0.3} position={[0, podiumH + mainBodyH * 0.75, depth * 0.46]} />
        <WindowBand width={width * 0.85} height={mainBodyH * 0.3} position={[0, podiumH + mainBodyH * 0.25, depth * 0.46]} />

        {/* Entrance Portico */}
        <EntrancePortico width={width * 0.32} height={1.8} depth={1.2} position={[0, podiumH, depth * 0.46]} />

        {/* ROOFTOP FUME HOOD EXHAUST STACKS (Laboratory Specific) */}
        <group position={[0, podiumH + mainBodyH, 0]}>
          <Box args={[width * 0.96, 0.3, depth * 0.92]} position={[0, 0.15, 0]} castShadow>
            <meshStandardMaterial color="#334155" roughness={0.9} />
          </Box>
          {[-width * 0.25, -width * 0.08, width * 0.08, width * 0.25].map((sx, idx) => (
            <group key={idx} position={[sx, 0, -depth * 0.15]}>
              <Cylinder args={[0.15, 0.15, 1.4, 16]} position={[0, 0.7, 0]} castShadow>
                <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.2} />
              </Cylinder>
              <Cone args={[0.25, 0.3, 16]} position={[0, 1.4, 0]} castShadow>
                <meshStandardMaterial color="#64748b" metalness={0.8} />
              </Cone>
            </group>
          ))}
          <RooftopHVAC position={[0, 0.1, depth * 0.2]} scale={0.9} />
        </group>
      </group>
    );
  }

  /* ─────────────────────────────────────────────────────────────
     8. FOOD COURT & STUDENT COMMONS PAVILION
  ───────────────────────────────────────────────────────────── */
  if (category === 'food') {
    return (
      <group position={[0, 0, 0]}>
        <Box args={[width + 0.4, podiumH, depth + 0.4]} position={[0, podiumH / 2, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={MAT.concretePodium} roughness={0.9} />
        </Box>

        {/* Welcoming Floor-to-Ceiling Glass Dining Pavilion */}
        <Box args={[width * 0.95, mainBodyH * 0.85, depth * 0.65]} position={[0, podiumH + (mainBodyH * 0.85) / 2, -depth * 0.12]} castShadow receiveShadow>
          <meshStandardMaterial color="#0284c7" transparent opacity={0.4} metalness={0.6} roughness={0.2} />
        </Box>
        {/* Solid Service / Kitchen Core at Rear */}
        <Box args={[width * 0.85, mainBodyH * 0.85, depth * 0.25]} position={[0, podiumH + (mainBodyH * 0.85) / 2, -depth * 0.32]} castShadow>
          <meshStandardMaterial color="#334155" roughness={0.85} />
        </Box>

        {/* Warm Timber Architectural Overhang Roof */}
        <Box args={[width * 1.05, 0.25, depth * 0.8]} position={[0, podiumH + mainBodyH * 0.85 + 0.12, -depth * 0.05]} castShadow>
          <meshStandardMaterial color="#ea580c" roughness={0.7} />
        </Box>

        {/* Outdoor Pergola Dining Terrace with Tables & Umbrellas */}
        <group position={[0, podiumH, depth * 0.32]}>
          <Box args={[width * 0.95, 0.05, depth * 0.32]} position={[0, 0.025, 0]} receiveShadow>
            <meshStandardMaterial color="#d97706" roughness={0.9} />
          </Box>
          {/* Pergola Timber Beams */}
          {[-width * 0.35, 0, width * 0.35].map((px, idx) => (
            <group key={idx} position={[px, 0, 0]}>
              <Cylinder args={[0.06, 0.06, 2.0, 8]} position={[0, 1.0, depth * 0.12]} castShadow>
                <meshStandardMaterial color="#78350f" />
              </Cylinder>
              <Cylinder args={[0.06, 0.06, 2.0, 8]} position={[0, 1.0, -depth * 0.12]} castShadow>
                <meshStandardMaterial color="#78350f" />
              </Cylinder>
            </group>
          ))}
          {/* Café Table and Umbrella */}
          <group position={[-width * 0.2, 0, 0]}>
            <Cylinder args={[0.3, 0.3, 0.45, 12]} position={[0, 0.22, 0]} castShadow>
              <meshStandardMaterial color="#cbd5e1" />
            </Cylinder>
            <Cylinder args={[0.03, 0.03, 1.6, 8]} position={[0, 0.8, 0]}>
              <meshStandardMaterial color="#475569" />
            </Cylinder>
            <Cone args={[0.8, 0.3, 16]} position={[0, 1.5, 0]} castShadow>
              <meshStandardMaterial color="#f97316" />
            </Cone>
          </group>
          <group position={[width * 0.2, 0, 0]}>
            <Cylinder args={[0.3, 0.3, 0.45, 12]} position={[0, 0.22, 0]} castShadow>
              <meshStandardMaterial color="#cbd5e1" />
            </Cylinder>
            <Cylinder args={[0.03, 0.03, 1.6, 8]} position={[0, 0.8, 0]}>
              <meshStandardMaterial color="#475569" />
            </Cylinder>
            <Cone args={[0.8, 0.3, 16]} position={[0, 1.5, 0]} castShadow>
              <meshStandardMaterial color="#3b82f6" />
            </Cone>
          </group>
        </group>
      </group>
    );
  }

  /* ─────────────────────────────────────────────────────────────
     9. SPORTS FACILITIES (Indoor Stadium, Cricket, Hockey, Ground)
  ───────────────────────────────────────────────────────────── */
  if (category === 'sports') {
    // A) Indoor Stadium & Arena
    if (nameLow.includes('indoor') || nameLow.includes('stadium')) {
      return (
        <group position={[0, 0, 0]}>
          <Box args={[width + 0.4, podiumH, depth + 0.4]} position={[0, podiumH / 2, 0]} castShadow receiveShadow>
            <meshStandardMaterial color={MAT.concretePodium} roughness={0.9} />
          </Box>
          {/* Lower Perimeter Concourse */}
          <Box args={[width * 0.94, mainBodyH * 0.55, depth * 0.94]} position={[0, podiumH + (mainBodyH * 0.55) / 2, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#334155" metalness={0.4} roughness={0.6} />
          </Box>
          {/* Arched Space-Frame Barrel Vault Roof */}
          <Cylinder
            args={[Math.min(width, depth) * 0.5, Math.min(width, depth) * 0.5, Math.max(width, depth) * 0.92, 32, 1, false, 0, Math.PI]}
            position={[0, podiumH + mainBodyH * 0.52, 0]}
            rotation={[width > depth ? 0 : Math.PI / 2, 0, Math.PI / 2]}
            castShadow
          >
            <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.3} />
          </Cylinder>
          {/* Central Roof Skylight Strip */}
          <Box args={[width * 0.15, 0.2, depth * 0.88]} position={[0, podiumH + mainBodyH * 0.95, 0]}>
            <meshStandardMaterial color="#38bdf8" transparent opacity={0.7} metalness={0.8} />
          </Box>
          {/* Stadium Corner Floodlight Towers */}
          {[
            [-width * 0.48, -depth * 0.48],
            [width * 0.48, -depth * 0.48],
            [-width * 0.48, depth * 0.48],
            [width * 0.48, depth * 0.48]
          ].map(([fx, fz], idx) => (
            <group key={idx} position={[fx, podiumH, fz]}>
              <Cylinder args={[0.08, 0.12, 4.5, 8]} position={[0, 2.25, 0]} castShadow>
                <meshStandardMaterial color="#1e293b" metalness={0.8} />
              </Cylinder>
              <Box args={[0.6, 0.35, 0.2]} position={[0, 4.4, 0]}>
                <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.8} />
              </Box>
            </group>
          ))}
        </group>
      );
    }

    // B) Cricket Nets
    if (nameLow.includes('cricket')) {
      return (
        <group position={[0, 0, 0]}>
          {/* Green Turf Pad */}
          <Box args={[width, 0.12, depth]} position={[0, 0.06, 0]} receiveShadow>
            <meshStandardMaterial color="#15803d" roughness={0.9} />
          </Box>
          {/* Clay Pitch */}
          <Box args={[width * 0.25, 0.14, depth * 0.8]} position={[0, 0.07, 0]} receiveShadow>
            <meshStandardMaterial color="#d4a373" roughness={0.95} />
          </Box>
          {/* Protective Netting Cage (Outer Frame) */}
          <Box args={[width * 0.35, 2.0, depth * 0.88]} position={[0, 1.0, 0]}>
            <meshStandardMaterial color="#94a3b8" wireframe />
          </Box>
          {/* Cricket Wicket Stumps on both sides */}
          {[-depth * 0.35, depth * 0.35].map((stumpZ, sideIdx) => (
            <group key={sideIdx} position={[0, 0.14, stumpZ]}>
              {[-0.1, 0, 0.1].map((ox, i) => (
                <Cylinder key={i} args={[0.02, 0.02, 0.5, 8]} position={[ox, 0.25, 0]} castShadow>
                  <meshStandardMaterial color="#ffffff" />
                </Cylinder>
              ))}
            </group>
          ))}
        </group>
      );
    }

    // C) Hockey Turf
    if (nameLow.includes('hockey')) {
      return (
        <group position={[0, 0, 0]}>
          {/* Emerald Green Synthetic AstroTurf */}
          <Box args={[width, 0.12, depth]} position={[0, 0.06, 0]} receiveShadow>
            <meshStandardMaterial color="#166534" roughness={0.85} />
          </Box>
          {/* Outer Boundary White Lines */}
          <Box args={[width * 0.9, 0.13, 0.08]} position={[0, 0.065, depth * 0.42]}><meshStandardMaterial color="#ffffff" /></Box>
          <Box args={[width * 0.9, 0.13, 0.08]} position={[0, 0.065, -depth * 0.42]}><meshStandardMaterial color="#ffffff" /></Box>
          <Box args={[0.08, 0.13, depth * 0.84]} position={[width * 0.45, 0.065, 0]}><meshStandardMaterial color="#ffffff" /></Box>
          <Box args={[0.08, 0.13, depth * 0.84]} position={[-width * 0.45, 0.065, 0]}><meshStandardMaterial color="#ffffff" /></Box>
          {/* Center Dividing Line */}
          <Box args={[width * 0.9, 0.13, 0.08]} position={[0, 0.065, 0]}><meshStandardMaterial color="#ffffff" /></Box>
          {/* Goal Cages on both sides */}
          <group position={[0, 0.12, depth * 0.42]}>
            <Box args={[width * 0.2, 0.8, 0.3]} position={[0, 0.4, 0]}>
              <meshStandardMaterial color="#ffffff" wireframe />
            </Box>
          </group>
          <group position={[0, 0.12, -depth * 0.42]}>
            <Box args={[width * 0.2, 0.8, 0.3]} position={[0, 0.4, 0]}>
              <meshStandardMaterial color="#ffffff" wireframe />
            </Box>
          </group>
        </group>
      );
    }

    // D) Sports Ground with Running Track & Infield
    return (
      <group position={[0, 0, 0]}>
        {/* Outer Base Ground */}
        <Box args={[width, 0.1, depth]} position={[0, 0.05, 0]} receiveShadow>
          <meshStandardMaterial color="#15803d" roughness={0.9} />
        </Box>
        {/* Oval Running Track (Terracotta Red) */}
        <Cylinder args={[Math.min(width, depth) * 0.45, Math.min(width, depth) * 0.45, 0.12, 32]} position={[0, 0.06, 0]} receiveShadow>
          <meshStandardMaterial color="#b91c1c" roughness={0.8} />
        </Cylinder>
        {/* Inner Grass Pitch */}
        <Cylinder args={[Math.min(width, depth) * 0.33, Math.min(width, depth) * 0.33, 0.14, 32]} position={[0, 0.07, 0]} receiveShadow>
          <meshStandardMaterial color="#22c55e" roughness={0.85} />
        </Cylinder>
        {/* White Track Separation Line */}
        <Cylinder args={[Math.min(width, depth) * 0.39, Math.min(width, depth) * 0.39, 0.13, 32]} position={[0, 0.065, 0]}>
          <meshStandardMaterial color="#ffffff" wireframe />
        </Cylinder>
      </group>
    );
  }

  /* ─────────────────────────────────────────────────────────────
     10. PARKS & BOTANICAL GARDENS
  ───────────────────────────────────────────────────────────── */
  if (category === 'park') {
    const isEco = nameLow.includes('eco');
    return (
      <group position={[0, 0, 0]}>
        {/* Manicured Park Grass Surface */}
        <Box args={[width, 0.12, depth]} position={[0, 0.06, 0]} receiveShadow>
          <meshStandardMaterial color="#15803d" roughness={0.9} />
        </Box>
        {/* Curving Stone Pathway */}
        <Box args={[width * 0.85, 0.14, depth * 0.18]} position={[0, 0.07, 0]} rotation={[0, 0.25, 0]} receiveShadow>
          <meshStandardMaterial color="#e2e8f0" roughness={0.95} />
        </Box>

        {/* Diverse 3D Trees (Broadleaf, Pines, Flowering) */}
        {useMemo(() => {
          const treeCount = isEco ? 14 : 8;
          return Array.from({ length: treeCount }).map((_, i) => {
            const angle = i * 2.39996;
            const r = Math.sqrt((i + 1) / (treeCount + 1)) * 0.38;
            const tx = Math.cos(angle) * r * width * 0.85;
            const tz = Math.sin(angle) * r * depth * 0.85;
            const treeType: 'broadleaf' | 'pine' | 'flowering' = i % 3 === 0 ? 'flowering' : i % 3 === 1 ? 'pine' : 'broadleaf';
            return (
              <RealisticTree
                key={`park-tree-${i}`}
                position={[tx, 0.12, tz]}
                scale={0.8 + (i % 4) * 0.15}
                type={treeType}
              />
            );
          });
        }, [isEco, width, depth])}

        {/* Central Stone Fountain or Garden Pavilion */}
        <group position={[0, 0.12, 0]}>
          <Cylinder args={[0.9, 1.1, 0.3, 16]} position={[0, 0.15, 0]} castShadow>
            <meshStandardMaterial color="#cbd5e1" roughness={0.8} />
          </Cylinder>
          <Cylinder args={[0.75, 0.75, 0.2, 16]} position={[0, 0.22, 0]}>
            <meshStandardMaterial color="#0ea5e9" metalness={0.8} roughness={0.1} transparent opacity={0.7} />
          </Cylinder>
        </group>
      </group>
    );
  }

  /* ─────────────────────────────────────────────────────────────
     11. DATA CENTER & CENTRAL UTILITY POWER STATION
  ───────────────────────────────────────────────────────────── */
  if (category === 'utility') {
    const isDataCenter = nameLow.includes('data');

    return (
      <group position={[0, 0, 0]}>
        <Box args={[width + 0.4, podiumH, depth + 0.4]} position={[0, podiumH / 2, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#1e293b" roughness={0.9} />
        </Box>

        {/* Heavy Security Block */}
        <Box args={[width * 0.94, mainBodyH, depth * 0.9]} position={[0, podiumH + mainBodyH / 2, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.4} />
        </Box>

        {/* Industrial Louvers / Cooling Vents */}
        {[-1, 1].map((side) => (
          <Box key={side} args={[width * 0.75, mainBodyH * 0.4, 0.08]} position={[0, podiumH + mainBodyH * 0.5, side * depth * 0.46]}>
            <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.3} />
          </Box>
        ))}

        {/* Emergency Hazard Warning Stripe */}
        <Box args={[width * 0.96, 0.2, depth * 0.92]} position={[0, podiumH + mainBodyH * 0.85, 0]}>
          <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.5} />
        </Box>

        {/* Exterior Industrial Transformers / Backup Generators */}
        {[-width * 0.25, width * 0.25].map((gx, idx) => (
          <group key={idx} position={[gx, podiumH, depth * 0.48]}>
            <Box args={[1.2, 1.2, 1.2]} position={[0, 0.6, 0.6]} castShadow>
              <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.3} />
            </Box>
            <Cylinder args={[0.08, 0.08, 1.8, 12]} position={[0.4, 0.9, 0.6]} castShadow>
              <meshStandardMaterial color="#1e293b" metalness={0.9} />
            </Cylinder>
          </group>
        ))}

        {/* Rooftop Industrial Chillers */}
        <group position={[0, podiumH + mainBodyH, 0]}>
          <RooftopHVAC position={[-width * 0.2, 0, 0]} scale={1.2} />
          <RooftopHVAC position={[width * 0.2, 0, 0]} scale={1.2} />
        </group>
      </group>
    );
  }

  /* ─────────────────────────────────────────────────────────────
     12. SECURITY CHECKPOINT & COMMAND GATE
  ───────────────────────────────────────────────────────────── */
  if (category === 'security') {
    return (
      <group position={[0, 0, 0]}>
        {/* Concrete Traffic Island */}
        <Box args={[width + 0.6, podiumH, depth + 0.6]} position={[0, podiumH / 2, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#e2e8f0" roughness={0.8} />
        </Box>
        {/* Hazard Curb Markings */}
        <Box args={[width + 0.65, 0.1, depth + 0.65]} position={[0, 0.05, 0]}>
          <meshStandardMaterial color="#eab308" />
        </Box>

        {/* Security Cabin (Off-White Pre-Fab with Large 360 Observation Windows) */}
        <Box args={[width * 0.85, mainBodyH, depth * 0.85]} position={[0, podiumH + mainBodyH / 2, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#f8fafc" roughness={0.85} />
        </Box>

        {/* Overhanging Architectural Blue Roof */}
        <Box args={[width * 1.15, 0.2, depth * 1.15]} position={[0, podiumH + mainBodyH + 0.1, 0]} castShadow>
          <meshStandardMaterial color="#1e40af" roughness={0.5} />
        </Box>

        {/* 360 Observation Windows */}
        <Box args={[width * 0.7, mainBodyH * 0.45, depth * 0.88]} position={[0, podiumH + mainBodyH * 0.55, 0]}>
          <meshStandardMaterial color="#38bdf8" transparent opacity={0.65} metalness={0.9} roughness={0.1} />
        </Box>

        {/* Automated Boom Barrier Gate */}
        <group position={[width * 0.55, podiumH, depth * 0.4]}>
          {/* Barrier Housing Cabinet */}
          <Box args={[0.3, 1.0, 0.3]} position={[0, 0.5, 0]} castShadow>
            <meshStandardMaterial color="#ef4444" metalness={0.5} />
          </Box>
          {/* Barrier Pivoting Arm (Striped) */}
          <Box args={[width * 1.4, 0.08, 0.08]} position={[width * 0.7, 0.85, 0]} castShadow>
            <meshStandardMaterial color="#facc15" />
          </Box>
        </group>

        {/* Roof CCTV Surveillance Mast */}
        <group position={[0, podiumH + mainBodyH + 0.2, 0]}>
          <Cylinder args={[0.04, 0.04, 1.2, 8]} position={[0, 0.6, 0]} castShadow>
            <meshStandardMaterial color="#334155" metalness={0.8} />
          </Cylinder>
          <Box args={[0.25, 0.15, 0.35]} position={[0, 1.2, 0.1]} castShadow>
            <meshStandardMaterial color="#0f172a" />
          </Box>
        </group>
      </group>
    );
  }

  /* ─────────────────────────────────────────────────────────────
     13. DEFAULT ACADEMIC FACULTY (Economics, Education, General)
  ───────────────────────────────────────────────────────────── */
  return (
    <group position={[0, 0, 0]}>
      {/* Foundation Podium */}
      <Box args={[width + 0.4, podiumH, depth + 0.4]} position={[0, podiumH / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={MAT.concretePodium} roughness={0.9} />
      </Box>

      {/* Main Faculty Body (Modern Off-White Limestone Finish) */}
      <Box args={[width * 0.95, mainBodyH, depth * 0.9]} position={[0, podiumH + mainBodyH / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#f8fafc" roughness={0.9} />
      </Box>

      {/* Modern Spandrel Panels */}
      <Box args={[width * 0.97, 0.3, depth * 0.92]} position={[0, podiumH + mainBodyH * 0.5, 0]} castShadow>
        <meshStandardMaterial color="#64748b" metalness={0.5} roughness={0.4} />
      </Box>

      {/* Floor 1 & Floor 2 Ribbon Glazing */}
      <WindowBand width={width * 0.85} height={mainBodyH * 0.3} position={[0, podiumH + mainBodyH * 0.75, depth * 0.46]} />
      <WindowBand width={width * 0.85} height={mainBodyH * 0.3} position={[0, podiumH + mainBodyH * 0.25, depth * 0.46]} />

      {/* Entrance Portico */}
      <EntrancePortico width={width * 0.35} height={1.8} depth={1.2} position={[0, podiumH, depth * 0.46]} />

      {/* Roof Parapet & HVAC */}
      <Box args={[width * 0.98, 0.3, depth * 0.93]} position={[0, podiumH + mainBodyH + 0.15, 0]} castShadow>
        <meshStandardMaterial color="#1e293b" roughness={0.8} />
      </Box>
      <RooftopHVAC position={[-width * 0.25, podiumH + mainBodyH + 0.1, -depth * 0.15]} />
    </group>
  );
});

/* =====================================================================
   HIGH-END 3D GLASSMORPHISM BUILDING LABEL
===================================================================== */
export const Building3DLabel = ({
  room,
  height,
  isSelected = false
}: {
  room: Room;
  height: number;
  isSelected?: boolean;
}) => {
  const meta = getBuildingCategory(room);

  return (
    <Html
      position={[0, height + 1.2, 0]}
      center
      style={{ pointerEvents: 'none' }}
    >
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-xl border transition-all duration-300 shadow-2xl select-none whitespace-nowrap ${
          isSelected
            ? 'bg-cyan-500/90 text-black border-white shadow-[0_0_25px_rgba(6,182,212,0.8)] scale-110 font-black'
            : 'bg-[#080d1a]/85 text-white border-white/15 hover:border-cyan-400/50 shadow-[0_4px_25px_rgba(0,0,0,0.8)]'
        }`}
      >
        <span className="text-sm drop-shadow-sm">{meta.icon}</span>
        <div className="flex flex-col text-left">
          <span className={`text-[11px] font-bold tracking-tight leading-tight ${isSelected ? 'text-black' : 'text-slate-100'}`}>
            {room.name}
          </span>
          <span className={`text-[9px] font-mono tracking-wider uppercase leading-tight ${isSelected ? 'text-black/75' : 'text-cyan-400'}`}>
            {meta.subTitle}
          </span>
        </div>
      </div>
    </Html>
  );
};
