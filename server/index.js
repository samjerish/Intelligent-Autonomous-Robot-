import express from 'express';
import cors from 'cors';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { createServer } from 'http';
import { Server } from 'socket.io';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const cloudflaredBin = path.join(projectRoot, 'bin', 'cloudflared');

let cloudTunnelUrl = null;
let cloudTunnelStatus = 'initializing';
let cloudflaredProc = null;
let reconnectTimer = null;
let intentionalStop = false;

function startCloudTunnel() {
  if (!existsSync(cloudflaredBin)) {
    console.log('[Tunnel] Notice: cloudflared binary not found at', cloudflaredBin);
    cloudTunnelStatus = 'unavailable';
    return;
  }

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  intentionalStop = false;

  if (cloudflaredProc) {
    const oldProc = cloudflaredProc;
    cloudflaredProc = null;
    try { oldProc.kill('SIGTERM'); } catch (e) {}
  }

  cloudTunnelStatus = 'starting';
  console.log('[Tunnel] Starting Cloudflare Quick Tunnel for Vite (port 5173)...');

  const currentProc = spawn(cloudflaredBin, [
    'tunnel',
    '--url', 'http://127.0.0.1:5173',
    '--no-autoupdate',
    '--http-host-header', 'localhost:5173'
  ], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  cloudflaredProc = currentProc;

  const urlRegex = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/;

  const handleOutput = (data) => {
    if (cloudflaredProc !== currentProc) return;
    const text = data.toString();
    const match = text.match(urlRegex);
    if (match && match[0] && match[0] !== cloudTunnelUrl) {
      cloudTunnelUrl = match[0];
      cloudTunnelStatus = 'connected';
      console.log('----------------------------------------------------');
      console.log('🌐 CLOUDFLARE QUICK TUNNEL READY (ANY DEVICE / NETWORK):');
      console.log(`   ${cloudTunnelUrl}/mobile?key=1234`);
      console.log('----------------------------------------------------');
      io.emit('tunnel_status', { tunnelUrl: cloudTunnelUrl, status: 'connected' });
    }
  };

  currentProc.stdout.on('data', handleOutput);
  currentProc.stderr.on('data', handleOutput);

  currentProc.on('exit', (code) => {
    if (cloudflaredProc === currentProc) {
      console.log('[Tunnel] cloudflared exited with code', code);
      cloudTunnelStatus = 'reconnecting';
      io.emit('tunnel_status', { tunnelUrl: cloudTunnelUrl, status: 'reconnecting' });
      if (!intentionalStop) {
        console.log('[Tunnel] Scheduling auto-reconnect in 3 seconds...');
        reconnectTimer = setTimeout(() => {
          startCloudTunnel();
        }, 3000);
      }
    }
  });
}

// Start tunnel immediately
startCloudTunnel();

// Start Python AI Fire & Smoke Detection Service
const pythonServiceBin = path.join(projectRoot, 'python_service', 'venv', 'bin', 'python3');
let pythonProc = null;
function startPythonFireService() {
  if (existsSync(pythonServiceBin)) {
    console.log('[FireAI] Spawning Python AI Fire Detection & Emergency Service on port 5005...');
    pythonProc = spawn(pythonServiceBin, ['-m', 'uvicorn', 'python_service.server:app', '--host', '0.0.0.0', '--port', '5005'], {
      cwd: projectRoot,
      stdio: 'inherit'
    });
    pythonProc.on('exit', (code) => {
      console.log('[FireAI] Python service exited with code', code);
    });
  } else {
    console.log('[FireAI] Notice: python_service/venv not found. Python service not auto-spawned.');
  }
}
startPythonFireService();

const app = express();
const port = 3000;
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

const generateUniversityLayout = () => {
  const gridSize = { x: 120, y: 100, f: 1 };
  const rooms = [];
  const obstacles = [];
  const stairs = [];
  const elevators = [];

  let roomIdCounter = 1;

  const addBuilding = (name, xStart, yStart, w, h, color, type, doorX, doorY) => {
    rooms.push({
      id: `bldg_${roomIdCounter++}`,
      name,
      start: { x: xStart, y: yStart, f: 0 },
      end: { x: xStart + w - 1, y: yStart + h - 1, f: 0 },
      color,
      type,
      door: { x: doorX, y: doorY, f: 0 }
    });
  };

  const cAdmin = '#3b82f6';
  const cAcademic = '#8b5cf6';
  const cHostel = '#06b6d4';
  const cSports = '#10b981';
  const cPark = '#22c55e';
  const cAuditorium = '#6366f1';
  const cLibrary = '#eab308';
  const cAmenities = '#64748b';
  const cMedical = '#ef4444';
  const cFood = '#f97316';

  // Row 1: y 0..19
  addBuilding('Staff Quarters', 2, 2, 10, 8, cHostel, 'hostel', 7, 10);
  addBuilding('Medical Center', 14, 2, 8, 8, cMedical, 'medical', 18, 10);
  addBuilding('Food Court', 30, 2, 12, 10, cFood, 'food', 36, 12);
  addBuilding('Computer Science', 45, 2, 12, 8, cAcademic, 'classroom', 51, 10);
  addBuilding('Generator Room', 66, 2, 8, 6, cAmenities, 'utility', 70, 8);
  addBuilding('Girls Hostel', 76, 2, 12, 12, cHostel, 'hostel', 82, 14);
  addBuilding('Administrative Building', 96, 2, 20, 12, cAdmin, 'admin', 106, 14);
  
  // Gateway Security Room with some space before the Gateway
  addBuilding('Security Room', 45, 90, 8, 6, cAdmin, 'security', 52, 92);

  // Row 2: y 24..49
  addBuilding('Library', 5, 28, 15, 10, cLibrary, 'library', 12, 38);
  addBuilding('Microbiology', 5, 40, 12, 8, cAcademic, 'classroom', 11, 48);
  addBuilding('Chemistry', 30, 28, 12, 10, cAcademic, 'classroom', 36, 38);
  addBuilding('Economics', 45, 28, 12, 10, cAcademic, 'classroom', 51, 38);
  addBuilding('Physics', 30, 40, 12, 8, cAcademic, 'classroom', 36, 48);
  addBuilding('Computer Applications', 45, 40, 12, 8, cAcademic, 'classroom', 51, 48);
  addBuilding('Auditorium', 66, 30, 20, 15, cAuditorium, 'auditorium', 76, 45);
  addBuilding('Boys Hostel', 96, 30, 15, 18, cHostel, 'hostel', 103, 48);

  // Row 3: y 54..79
  addBuilding('Innovation Lab', 5, 56, 15, 10, cAcademic, 'classroom', 12, 66);
  addBuilding('Data Center', 5, 68, 15, 10, cAmenities, 'utility', 12, 78);
  addBuilding('Cricket Nets', 30, 56, 12, 12, cSports, 'sports', 36, 68);
  addBuilding('Hockey Field', 45, 56, 12, 12, cSports, 'sports', 51, 68);
  addBuilding('Sports Ground', 30, 70, 25, 9, cSports, 'sports', 42, 79);
  addBuilding('Indoor Stadium', 66, 56, 15, 15, cSports, 'sports', 73, 71);
  addBuilding('Botanical Garden', 66, 73, 15, 6, cPark, 'park', 73, 79);
  addBuilding('Eco Park', 96, 56, 20, 10, cPark, 'park', 106, 66);
  addBuilding('College of Education', 96, 68, 20, 10, cAcademic, 'classroom', 106, 78);

  rooms.forEach(room => {
    for (let x = room.start.x; x <= room.end.x; x++) {
      for (let y = room.start.y; y <= room.end.y; y++) {
        if (x === room.start.x || x === room.end.x || y === room.start.y || y === room.end.y) {
          if (x !== room.door.x || y !== room.door.y) {
            obstacles.push({ x, y, f: 0 });
          }
        }
      }
    }
  });

  const roadCells = new Set();

  const addRoadRect = (x1, y1, x2, y2) => {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
        roadCells.add(`${x},${y},0`);
      }
    }
  };

  // Horizontal arteries
  addRoadRect(0, 20, 119, 23);
  addRoadRect(0, 50, 119, 53);
  addRoadRect(0, 80, 119, 83);

  // Vertical main roads
  addRoadRect(25, 0, 28, 99);
  addRoadRect(63, 0, 66, 99);
  addRoadRect(90, 0, 93, 99);
  
  // Road to Security Room
  addRoadRect(53, 91, 62, 93);

  const isInsideRoom = (x, y) => {
    return rooms.some(r => x >= r.start.x && x <= r.end.x && y >= r.start.y && y <= r.end.y);
  };

  const isPathClear = (x1, y1, x2, y2) => {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
        if (isInsideRoom(x, y)) return false;
      }
    }
    return true;
  };

  const xArteries = [26, 61, 91];
  const yArteries = [21, 51, 81];

  // Connect doors
  rooms.forEach(room => {
    let bestDist = Infinity;
    let bestTarget = null;

    // Try horizontal connections
    xArteries.forEach(ax => {
      if (isPathClear(room.door.x, room.door.y, ax, room.door.y)) {
        let dist = Math.abs(room.door.x - ax);
        if (dist < bestDist) {
          bestDist = dist;
          bestTarget = { x: ax, y: room.door.y };
        }
      }
    });

    // Try vertical connections
    yArteries.forEach(ay => {
      if (isPathClear(room.door.x, room.door.y, room.door.x, ay)) {
        let dist = Math.abs(room.door.y - ay);
        if (dist < bestDist) {
          bestDist = dist;
          bestTarget = { x: room.door.x, y: ay };
        }
      }
    });

    if (bestTarget) {
      if (room.door.x === bestTarget.x) {
        addRoadRect(room.door.x, Math.min(room.door.y, bestTarget.y), bestTarget.x, Math.max(room.door.y, bestTarget.y));
      } else {
        addRoadRect(Math.min(room.door.x, bestTarget.x), room.door.y, Math.max(room.door.x, bestTarget.x), room.door.y);
      }
    }
  });

  const roads = Array.from(roadCells).map(key => {
    const [x, y, f] = key.split(',').map(Number);
    return { x, y, f };
  });

  for (let x = 0; x < gridSize.x; x++) {
    for (let y = 0; y < gridSize.y; y++) {
      if (!roadCells.has(`${x},${y},0`) && !isInsideRoom(x, y)) {
        if (!obstacles.some(o => o.x === x && o.y === y && o.f === 0)) {
          obstacles.push({ x, y, f: 0 });
        }
      }
    }
  }

  return { gridSize, start: { x: 70, y: 8, f: 0 }, end: { x: 70, y: 8, f: 0 }, obstacles, stairs, elevators, rooms, columns: [], roads };
};

const universityMap = generateUniversityLayout();

app.post('/api/plan', (req, res) => {
  const { mission, startPoint } = req.body;
  const strategies = [
    {
      id: 'fastest',
      name: 'Urgent Response',
      time: '3m',
      energy: '15%',
      risk: 'High',
      confidence: '95%',
      score: 98,
      description: 'Maximum speed, using elevators overriding passenger calls.',
      color: 'text-red-400'
    },
    {
      id: 'standard',
      name: 'Standard Delivery',
      time: '8m',
      energy: '5%',
      risk: 'Low',
      confidence: '99%',
      score: 90,
      description: 'Normal corridor navigation obeying all traffic rules.',
      color: 'text-blue-400'
    }
  ];

  const cleanMission = mission.toLowerCase().replace(/[.,!?]/g, '').replace(/\s+/g, ' ');

  let targetFloor = null;
  if (cleanMission.includes('ground floor') || cleanMission.includes('floor 0')) targetFloor = 0;
  else if (cleanMission.includes('first floor') || cleanMission.includes('floor 1')) targetFloor = 1;
  else if (cleanMission.includes('second floor') || cleanMission.includes('floor 2')) targetFloor = 2;

  const matchedRoomsMap = new Map();
  const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function levenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  function fuzzyMatchRoom(missionText, roomName) {
    const missionTokens = missionText.split(' ');
    const roomTokens = roomName.toLowerCase().split(' ');
    const roomLen = roomTokens.length;

    for (let i = 0; i <= missionTokens.length - roomLen; i++) {
      const window = missionTokens.slice(i, i + roomLen).join(' ');
      const maxDist = Math.max(2, Math.floor(roomName.length * 0.25));
      if (levenshteinDistance(window, roomName.toLowerCase()) <= maxDist) {
        return true;
      }
    }
    return false;
  }

  universityMap.rooms.forEach(r => {
    const roomNameLower = r.name.toLowerCase();
    const regex = new RegExp(`\\b${escapeRegExp(roomNameLower)}\\b`);
    // Exact match or fuzzy match
    if (regex.test(cleanMission) || fuzzyMatchRoom(cleanMission, roomNameLower)) {
      if (targetFloor === null || r.start.f === targetFloor) {
        matchedRoomsMap.set(r.id, r);
      }
    }
  });

  const matchedRooms = Array.from(matchedRoomsMap.values());

  let tasks = [];
  const start = startPoint || universityMap.start;

  const isMedicalMission = cleanMission.includes('medic') || 
                           cleanMission.includes('first aid') || 
                           cleanMission.includes('doctor') || 
                           cleanMission.includes('hospital') || 
                           cleanMission.includes('health') || 
                           cleanMission.includes('pharmacy') ||
                           cleanMission.includes('ambulance');

  const isFoodMission = !isMedicalMission && (
                        cleanMission.includes('food') || 
                        cleanMission.includes('meal') || 
                        cleanMission.includes('lunch') || 
                        cleanMission.includes('dinner') || 
                        cleanMission.includes('breakfast') || 
                        cleanMission.includes('snack') || 
                        cleanMission.includes('coffee') || 
                        cleanMission.includes('pizza') || 
                        cleanMission.includes('burger') || 
                        cleanMission.includes('canteen') || 
                        cleanMission.includes('cafeteria'));

  if (isMedicalMission) {
    const medicalCenter = universityMap.rooms.find(r => r.name === 'Medical Center') || universityMap.rooms[0];
    const destinationRooms = matchedRooms.filter(r => r.name !== 'Medical Center');

    if (destinationRooms.length > 0) {
      tasks = [
        {
          id: `task_${Date.now()}_med_dispatch`,
          type: 'pickup',
          location: { x: medicalCenter.door.x, y: medicalCenter.door.y, f: medicalCenter.start.f },
          locationName: 'Medical Center (Operational Dispatch)'
        },
        {
          id: `task_${Date.now()}_med_delivery`,
          type: 'delivery',
          location: { x: destinationRooms[0].door.x, y: destinationRooms[0].door.y, f: destinationRooms[0].start.f },
          locationName: destinationRooms[0].name
        }
      ];
    } else {
      tasks = [
        {
          id: `task_${Date.now()}_med_dispatch`,
          type: 'operational_dispatch',
          location: { x: medicalCenter.door.x, y: medicalCenter.door.y, f: medicalCenter.start.f },
          locationName: 'Medical Center (Operational Dispatch)'
        }
      ];
    }
  } else if (isFoodMission) {
    const foodCourt = universityMap.rooms.find(r => r.name === 'Food Court') || universityMap.rooms[0];
    const destinationRooms = matchedRooms.filter(r => r.name !== 'Food Court');

    if (destinationRooms.length > 0) {
      tasks = [
        {
          id: `task_${Date.now()}_food_dispatch`,
          type: 'pickup',
          location: { x: foodCourt.door.x, y: foodCourt.door.y, f: foodCourt.start.f },
          locationName: 'Food Court (Operational Dispatch)'
        },
        {
          id: `task_${Date.now()}_food_delivery`,
          type: 'delivery',
          location: { x: destinationRooms[0].door.x, y: destinationRooms[0].door.y, f: destinationRooms[0].start.f },
          locationName: destinationRooms[0].name
        }
      ];
    } else {
      tasks = [
        {
          id: `task_${Date.now()}_food_dispatch`,
          type: 'operational_dispatch',
          location: { x: foodCourt.door.x, y: foodCourt.door.y, f: foodCourt.start.f },
          locationName: 'Food Court (Operational Dispatch)'
        }
      ];
    }
  } else if (matchedRooms.length === 0) {
    const reception = universityMap.rooms.find(r => r.name === 'Administrative Building');
    if (reception) {
      tasks.push({
        id: `task_${Date.now()}_1`,
        type: 'go_to',
        location: { x: reception.door.x, y: reception.door.y, f: reception.start.f },
        locationName: reception.name
      });
    }
  } else if (matchedRooms.length === 1) {
    let type = 'go_to';
    if (cleanMission.includes('clean')) type = 'cleaning';
    else if (cleanMission.includes('patrol')) type = 'patrol';
    else if (cleanMission.includes('deliver') || cleanMission.includes('send') || cleanMission.includes('dispatch')) type = 'delivery';

    tasks.push({
      id: `task_${Date.now()}_1`,
      type,
      location: { x: matchedRooms[0].door.x, y: matchedRooms[0].door.y, f: matchedRooms[0].start.f },
      locationName: matchedRooms[0].name
    });
  } else {
    matchedRooms.sort((a, b) => {
      const idxA = cleanMission.indexOf(a.name.toLowerCase().split(' ')[0]);
      const idxB = cleanMission.indexOf(b.name.toLowerCase().split(' ')[0]);
      return idxA - idxB;
    });

    tasks = matchedRooms.map((room, index) => {
      let type = 'go_to';
      if (index === 0 && (cleanMission.includes('pick') || cleanMission.includes('get'))) type = 'pickup';
      else if (index === matchedRooms.length - 1 && (cleanMission.includes('deliver') || cleanMission.includes('drop'))) type = 'delivery';

      return {
        id: `task_${Date.now()}_${index}`,
        type,
        location: { x: room.door.x, y: room.door.y, f: room.start.f },
        locationName: room.name
      };
    });
  }

  const end = tasks.length > 0 ? tasks[tasks.length - 1].location : start;

  universityMap.start = start;
  universityMap.end = end;
  universityMap.tasks = tasks;

  res.json({
    mission,
    strategies,
    mapData: universityMap
  });
});

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Professional University Digital Twin API running at http://0.0.0.0:${port}`);
});

app.get('/api/map', (req, res) => {
  res.json(universityMap);
});

app.get('/api/ip', (req, res) => {
  const nets = os.networkInterfaces();
  const interfaces = [];
  let bestIp = 'localhost';
  let bestScore = -1;
  let isHotspot = false;

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        let score = 10;
        const lowerName = name.toLowerCase();
        const isSingleHost = net.netmask === '255.255.255.255' || net.address.startsWith('192.0.0.');

        // Prioritize Wi-Fi or primary ethernet interfaces
        if (lowerName.includes('en0') || lowerName.includes('wlan') || lowerName.includes('wi-fi')) {
          score += 30;
        } else if (lowerName.includes('eth') || lowerName.includes('en1') || lowerName.includes('ethernet')) {
          score += 25;
        }

        // Prioritize typical LAN subnets (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
        if (net.address.startsWith('192.168.')) {
          score += 50;
        } else if (net.address.startsWith('10.')) {
          score += 45;
        } else if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(net.address)) {
          score += 40;
        } else if (isSingleHost) {
          // Cellular hotspot / point-to-point tethering interface (isolated from LAN)
          score -= 20;
          isHotspot = true;
        }

        let label = name;
        if (lowerName.includes('en0') || lowerName.includes('wlan')) {
          label = isSingleHost ? `Hotspot / Tether (${name})` : `Wi-Fi (${name})`;
        } else if (lowerName.includes('en1') || lowerName.includes('eth')) {
          label = `Ethernet (${name})`;
        }

        interfaces.push({
          name,
          label: `${label}: ${net.address}`,
          address: net.address,
          isHotspot: isSingleHost
        });

        if (score > bestScore) {
          bestScore = score;
          bestIp = net.address;
        }
      }
    }
  }

  // Fallback to localhost if no external interfaces found
  if (interfaces.length === 0) {
    interfaces.push({ name: 'lo', label: 'Localhost: 127.0.0.1', address: 'localhost', isHotspot: false });
  }

  res.json({ 
    ip: bestIp, 
    hostname: `${os.hostname().replace(/\.local$/, '')}.local`,
    isHotspotDetected: isHotspot,
    tunnelUrl: cloudTunnelUrl, 
    tunnelStatus: cloudTunnelStatus, 
    interfaces 
  });
});

app.post('/api/tunnel/restart', (req, res) => {
  startCloudTunnel();
  res.json({ status: 'restarting' });
});

let appState = {
  history: [],
  currentMission: null,
  isOn: true,
  obstacleCount: 9,
  activeFireIncident: null,
  fireHistory: []
};

// Fire Emergency API Bridge (calls Python service on 5005 with in-memory fallback)
const PYTHON_FIRE_URL = 'http://127.0.0.1:5005';

app.get('/api/fire/status', async (req, res) => {
  try {
    const pyRes = await fetch(`${PYTHON_FIRE_URL}/api/fire/status`);
    if (pyRes.ok) {
      const data = await pyRes.json();
      return res.json(data);
    }
  } catch (err) {}
  res.json({
    service: "ACVS-EDS Fire Detection Engine (Node Fallback)",
    status: "ONLINE",
    active_incident: appState.activeFireIncident,
    total_incidents_recorded: appState.fireHistory.length
  });
});

app.get('/api/fire/incidents', async (req, res) => {
  try {
    const pyRes = await fetch(`${PYTHON_FIRE_URL}/api/fire/incidents`);
    if (pyRes.ok) {
      const data = await pyRes.json();
      return res.json(data);
    }
  } catch (err) {}
  res.json({
    active_incident: appState.activeFireIncident,
    history: appState.fireHistory
  });
});

app.post('/api/fire/detect', async (req, res) => {
  try {
    const pyRes = await fetch(`${PYTHON_FIRE_URL}/api/fire/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    if (pyRes.ok) {
      const data = await pyRes.json();
      if (data.incident) {
        appState.activeFireIncident = data.incident;
        appState.fireHistory.unshift(data.incident);
        io.emit('fire_emergency_alert', data.incident);
      }
      return res.json(data);
    }
  } catch (err) {}
  res.status(502).json({ error: "Python vision detector not reachable" });
});

app.post('/api/fire/simulate', async (req, res) => {
  try {
    const pyRes = await fetch(`${PYTHON_FIRE_URL}/api/fire/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    if (pyRes.ok) {
      const data = await pyRes.json();
      if (data.incident) {
        appState.activeFireIncident = data.incident;
        appState.fireHistory.unshift(data.incident);
        io.emit('fire_emergency_alert', data.incident);
      }
      return res.json(data);
    }
  } catch (err) {
    console.error("[Node] Error calling python simulate:", err);
  }
  res.status(502).json({ error: "Failed to simulate fire hazard" });
});

app.post('/api/fire/acknowledge', async (req, res) => {
  try {
    const pyRes = await fetch(`${PYTHON_FIRE_URL}/api/fire/acknowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    if (pyRes.ok) {
      const data = await pyRes.json();
      if (data.incident) {
        if (appState.activeFireIncident && appState.activeFireIncident.id === data.incident.id) {
          appState.activeFireIncident = data.incident;
        }
        io.emit('fire_incident_acknowledged', data.incident);
      }
      return res.json(data);
    }
  } catch (err) {}
  res.json({ success: true, acknowledged: true });
});

app.post('/api/fire/resolve', async (req, res) => {
  const { incident_id } = req.body || {};
  try {
    if (incident_id) {
      await fetch(`${PYTHON_FIRE_URL}/api/fire/resolve/${incident_id}`, { method: 'POST' });
    }
  } catch (err) {}
  appState.activeFireIncident = null;
  io.emit('fire_incident_cleared', { incident_id });
  res.json({ success: true, resolved: true });
});

app.get('/api/state', (req, res) => {
  res.json(appState);
});

let isStateInitialized = false;
let latestVisionFrame = null;
let latestPose = null;

let telemetry = {
  battery: 100,
  temperature: 35.0,
  cpu: 10,
  network: 100,
  speed: 0,
  position: { x: 61, y: 81 },
  state: 'Idle'
};

// Telemetry is driven by the desktop client via local_telemetry_update event.

io.on('connection', (socket) => {
  // Broadcast updated connected device count
  io.emit('device_count', io.engine.clientsCount);

  // Send cloud tunnel status to client
  socket.emit('tunnel_status', { tunnelUrl: cloudTunnelUrl, status: cloudTunnelStatus });

  if (isStateInitialized) {
    socket.emit('init_state', appState);
  } else {
    socket.emit('init_state', appState);
  }
  socket.emit('telemetry_update', telemetry);
  if (latestVisionFrame) socket.emit('robot_vision_frame', latestVisionFrame);
  if (latestPose) socket.emit('robot_pose_stream', latestPose);

  socket.on('disconnect', () => {
    io.emit('device_count', io.engine.clientsCount);
  });

  socket.on('client_ready', (state) => {
    if (!isStateInitialized && state) {
      appState = { ...appState, ...state };
      isStateInitialized = true;
      socket.broadcast.emit('init_state', appState);
    }
  });

  socket.on('update_state', (newState) => {
    appState = { ...appState, ...newState };
    isStateInitialized = true;
    socket.broadcast.emit('state_updated', newState);
  });

  // Mobile Control Events
  socket.on('mobile_command', (data) => {
    if (data.action === 'set_obstacle_count' && typeof data.count === 'number') {
      appState.obstacleCount = data.count;
      io.emit('obstacle_count_updated', { count: data.count });
    }
    // Relay mobile commands to the desktop client
    socket.broadcast.emit('mobile_command_received', data);
  });

  // Desktop or Mobile updates obstacle count directly
  socket.on('set_obstacle_count', (data) => {
    if (typeof data.count === 'number') {
      appState.obstacleCount = data.count;
      io.emit('obstacle_count_updated', { count: data.count });
    }
  });

  // Real-time telemetry update from simulation (Desktop -> Server -> Mobile)
  socket.on('update_telemetry', (data) => {
    telemetry = { ...telemetry, ...data };
    socket.broadcast.emit('telemetry_update', telemetry);
  });

  // Robot Vision Frame Broadcast (Desktop -> Server -> Mobile)
  socket.on('robot_vision_frame', (frameData) => {
    latestVisionFrame = frameData;
    socket.broadcast.emit('robot_vision_frame', frameData);
  });

  // High-frequency Robot Pose Stream for zero-lag 60 FPS FPV Digital Twin
  socket.on('robot_pose_stream', (poseData) => {
    latestPose = poseData;
    socket.broadcast.emit('robot_pose_stream', poseData);
  });

  socket.on('request_robot_vision', (data) => {
    socket.broadcast.emit('robot_vision_requested', data);
  });


  // Fire Emergency Sockets
  socket.emit('fire_state_init', {
    activeIncident: appState.activeFireIncident,
    history: appState.fireHistory
  });

  socket.on('fire_emergency_detected', (incident) => {
    appState.activeFireIncident = incident;
    appState.fireHistory.unshift(incident);
    io.emit('fire_emergency_alert', incident);
  });

  socket.on('fire_incident_ack', (data) => {
    if (appState.activeFireIncident && appState.activeFireIncident.id === data.incident_id) {
      appState.activeFireIncident.acknowledgement = {
        is_acknowledged: true,
        acknowledged_by: data.operator_name || 'Control Room Operator',
        acknowledged_at: new Date().toLocaleTimeString()
      };
      appState.activeFireIncident.status = 'ACKNOWLEDGED';
    }
    io.emit('fire_incident_acknowledged', data);
  });

  socket.on('fire_incident_resolved', (data) => {
    appState.activeFireIncident = null;
    io.emit('fire_incident_cleared', data);
  });
});
