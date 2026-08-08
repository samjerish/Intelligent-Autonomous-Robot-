const fs = require('fs');
let content = fs.readFileSync('src/components/SimulationView.tsx', 'utf8');

// Fix 1: checkResume inside useEffect is okay, but // 2. Real-time Blockage is inside the same useEffect but outside checkResume!
// Wait, the regex replaced `useEffect(() => { ...` with `useEffect(() => { const checkResume = async () => { ... } checkResume(); ...`.
// So Real-time Blockage is still outside checkResume!
// Let's wrap the whole useEffect body in an async IIFE for the ones that need it.

content = content.replace(
  "useEffect(() => {\n    const checkResume = async () => {\n      // 1. Auto-Resume Logic",
  "useEffect(() => {\n    (async () => {\n      // 1. Auto-Resume Logic"
);
content = content.replace(
  "    checkResume();\n\n    // 2. Real-time Blockage",
  "    // 2. Real-time Blockage"
);
// And add `})();` at the end of that useEffect. I will just do it by replacing the end of the block.
content = content.replace(
  "      }\n    }\n  }, [userBlockers, mapData]);",
  "      }\n    }\n    })();\n  }, [userBlockers, mapData]);"
);

// Fix 2: robotState === 'returning_home'
content = content.replace(
  "useEffect(() => {\n    if (robotState === 'returning_home') {",
  "useEffect(() => {\n    (async () => {\n    if (robotState === 'returning_home') {"
);
content = content.replace(
  "    }\n  }, [robotState, path, currentPosIndex, mapData, userBlockers]);",
  "    }\n    })();\n  }, [robotState, path, currentPosIndex, mapData, userBlockers]);"
);

// Fix 3: patrol
content = content.replace(
  "useEffect(() => {\n    if (robotState === 'patrol' && mapData) {",
  "useEffect(() => {\n    (async () => {\n    if (robotState === 'patrol' && mapData) {"
);
content = content.replace(
  "    }\n  }, [robotState, isPlaying, path, currentPosIndex, mapData, isOn, isIdleMode]);",
  "    }\n    })();\n  }, [robotState, isPlaying, path, currentPosIndex, mapData, isOn, isIdleMode]);"
);

// Fix 4: processCommand
content = content.replace("const processCommand = (", "const processCommand = async (");

// Fix 5: socket.on('update_state')
content = content.replace(
  "socketRef.current.on('update_state', (newState: any) => {",
  "socketRef.current.on('update_state', async (newState: any) => {"
);

// Fix 6: handleCrowdResponseComplete
content = content.replace(
  "const handleCrowdResponseComplete = () => {",
  "const handleCrowdResponseComplete = async () => {"
);

// Fix 7: handleEmergencyComplete
content = content.replace(
  "const handleEmergencyComplete = () => {",
  "const handleEmergencyComplete = async () => {"
);

// Fix 8: handleMapClickRef typing
content = content.replace(
  "const handleMapClickRef = useRef((p: THREE.Vector3) => {",
  "const handleMapClickRef = useRef(async (p: THREE.Vector3) => {"
);
content = content.replace(
  "const handleMapClickRef = useRef(async (p: THREE.Vector3) => {\n",
  ""
); // wait I replaced this before, let me just replace the whole line.
content = content.replace(
  "const handleMapClickRef = useRef(async (p: THREE.Vector3) => {",
  "const handleMapClickRef = useRef<((p: THREE.Vector3) => Promise<void>) | ((p: THREE.Vector3) => void)>(async (p: THREE.Vector3) => {"
);

// Fix 9: onMapClick prop in SimulationView
content = content.replace(
  "onMapClick?: (p: THREE.Vector3) => void",
  "onMapClick?: (p: THREE.Vector3) => void | Promise<void>"
);

// Fix 10: window.addEventListener('keydown')
content = content.replace(
  "const handleKeyDown = (e: KeyboardEvent) => {",
  "const handleKeyDown = async (e: KeyboardEvent) => {"
);

// We'll write to file
fs.writeFileSync('src/components/SimulationView.tsx', content);
