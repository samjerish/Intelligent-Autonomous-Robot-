const fs = require('fs');
let content = fs.readFileSync('src/components/SimulationView.tsx', 'utf8');

// Imports
content = content.replace(
  "import { calculatePath, calculateLongPath } from '../utils/simulationEngine';",
  "import { calculatePathAsync, calculateLongPathAsync } from '../utils/simulationEngine';"
);

// Function signatures to async
content = content.replace("const resumeMissionTo = (", "const resumeMissionTo = async (");
content = content.replace("const initializeDynamicObstacles = (", "const initializeDynamicObstacles = async (");
content = content.replace("const handleEmergencyApprove = () => {", "const handleEmergencyApprove = async () => {");
content = content.replace("const handleEmergencyReject = () => {", "const handleEmergencyReject = async () => {");
content = content.replace("const handleChargeComplete = () => {", "const handleChargeComplete = async () => {");
content = content.replace("const handleObstacleDetected = (", "const handleObstacleDetected = async (");
content = content.replace("const startSimulation = () => {", "const startSimulation = async () => {");
content = content.replace("const handleCrowdResponse = (", "const handleCrowdResponse = async (");

// useEffect replacements
content = content.replace(/useEffect\(\(\) => \{\n\s*\/\/\ 1\. Auto-Resume Logic/g, "useEffect(() => {\n    const checkResume = async () => {\n      // 1. Auto-Resume Logic");
content = content.replace(/if \(canResume && fullResumePath\.length > 0\) \{\n\s*setPath\(fullResumePath\);\n\s*\}\n\s*\}\n\s*\}\n\s*\}\n\s*\};\n\s*\n\s*\/\/\ 2\. Real-time Blockage/g, "if (canResume && fullResumePath.length > 0) {\n        setPath(fullResumePath);\n      }\n    }\n    }\n    checkResume();\n\n    // 2. Real-time Blockage");

// Replace calls
content = content.replace(/calculatePath\(/g, "await calculatePathAsync(");
content = content.replace(/calculateLongPath\(/g, "await calculateLongPathAsync(");

// handleMapClickRef is inside a useEffect, but it's a ref to a function. 
content = content.replace("const handleMapClickRef = useRef((p: THREE.Vector3) => {", "const handleMapClickRef = useRef(async (p: THREE.Vector3) => {");

// setTimeout async
content = content.replace(/setTimeout\(\(\) => \{\n\s*isRecalculating\.current = false;\n\s*setIsPlaying\(true\);\n\s*\}, 3000\);/g, "setTimeout(() => {\n          isRecalculating.current = false;\n          setIsPlaying(true);\n        }, 3000);");
content = content.replace(/setTimeout\(\(\) => \{\n\s*const currentLoc/g, "setTimeout(async () => {\n          const currentLoc");

fs.writeFileSync('src/components/SimulationView.tsx', content);
