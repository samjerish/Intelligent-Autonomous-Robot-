import express from 'express';
import cors from 'cors';
import os from 'os';
import { createServer } from 'http';
import { Server } from 'socket.io';

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
  addBuilding('Swimming Pool', 5, 56, 15, 10, cSports, 'sports', 12, 66);
  addBuilding('Gymnasium', 5, 68, 15, 10, cSports, 'sports', 12, 78);
  addBuilding('Cricket Nets', 30, 56, 12, 12, cSports, 'sports', 36, 68);
  addBuilding('Hockey Field', 45, 56, 12, 12, cSports, 'sports', 51, 68);
  addBuilding('Sports Ground', 30, 70, 25, 9, cSports, 'sports', 42, 79);
  addBuilding('Indoor Stadium', 66, 56, 15, 15, cSports, 'sports', 73, 71);
  addBuilding('Botanical Garden', 66, 73, 15, 6, cPark, 'park', 73, 79);
  addBuilding('Eco Park', 96, 56, 20, 10, cPark, 'park', 106, 66);
  addBuilding('College of Education', 96, 68, 20, 10, cAcademic, 'classroom', 106, 78);

  // Security Room near gate (gate is at x=62, y=86) — with space
  addBuilding('Security Room', 70, 84, 4, 5, cAmenities, 'security', 72, 89);

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

  // Horizontal arteries — 6 cells wide
  addRoadRect(0, 19, 119, 24);
  addRoadRect(0, 49, 119, 54);
  addRoadRect(0, 79, 119, 84);

  // Vertical main roads — 4 cells wide
  addRoadRect(24, 0, 27, 99);
  addRoadRect(62, 0, 65, 99);
  addRoadRect(89, 0, 92, 99);

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

  if (matchedRooms.length === 0) {
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
  let localIp = 'localhost';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        localIp = net.address;
      }
    }
  }
  res.json({ ip: localIp });
});

let appState = {
  history: [],
  currentMission: null,
  isOn: true
};

let isStateInitialized = false;

let telemetry = {
  battery: 100,
  temperature: 35.0,
  cpu: 10,
  network: 100,
  speed: 0,
  position: { x: 61, y: 81 },
  state: 'Idle'
};

// Telemetry is now driven entirely by the desktop client via local_telemetry_update event.

io.on('connection', (socket) => {
  if (isStateInitialized) {
    socket.emit('init_state', appState);
  }
  socket.emit('telemetry_update', telemetry);

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
    // Relay mobile commands to the desktop client
    socket.broadcast.emit('mobile_command_received', data);
  });

  // Real-time telemetry update from simulation (Desktop -> Server -> Mobile)
  socket.on('update_telemetry', (data) => {
    telemetry = { ...telemetry, ...data };
    socket.broadcast.emit('telemetry_update', telemetry);
  });
});
