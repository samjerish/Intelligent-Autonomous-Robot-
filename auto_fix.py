import re

with open('src/components/SimulationView.tsx', 'r') as f:
    lines = f.readlines()

def make_func_async(func_name, lines):
    # Find `const func_name = (...) => {`
    for i, line in enumerate(lines):
        if f"const {func_name} = (" in line and "async" not in line:
            lines[i] = line.replace(f"const {func_name} = (", f"const {func_name} = async (")
        elif f"const {func_name} = () => {{" in line and "async" not in line:
            lines[i] = line.replace(f"const {func_name} = () => {{", f"const {func_name} = async () => {{")

make_func_async("processCommand", lines)
make_func_async("missionAction", lines)
make_func_async("handleCrowdResponseComplete", lines)
make_func_async("handlePoliceArrival", lines)
make_func_async("handleKeyDown", lines)

# For socket.on('update_state'
for i, line in enumerate(lines):
    if "socketRef.current.on('update_state', (newState: any) => {" in line:
        lines[i] = line.replace("(newState: any) => {", "async (newState: any) => {")

# For useEffect wrappers, let's wrap them manually by finding the start of the useEffect and the end.
# 1. auto-resume (lines ~1378)
for i in range(1360, 1385):
    if "useEffect(() => {" in lines[i] and "const allObstacles" in lines[i+1]:
        lines[i] = "  useEffect(() => {\n    (async () => {\n"
        # find the end bracket
        for j in range(i, len(lines)):
            if "}, [userBlockers, mapData]);" in lines[j]:
                lines[j] = lines[j].replace("  }, [userBlockers, mapData]);", "    })();\n  }, [userBlockers, mapData]);")
                break
        break

# 2. returning_home (lines ~1535)
for i in range(1530, 1555):
    if "useEffect(() => {" in lines[i] and "if (robotState === 'returning_home') {" in lines[i+1]:
        lines[i] = "  useEffect(() => {\n    (async () => {\n"
        for j in range(i, len(lines)):
            if "}, [robotState, path, currentPosIndex, mapData, userBlockers]);" in lines[j]:
                lines[j] = lines[j].replace("  }, [robotState, path, currentPosIndex, mapData, userBlockers]);", "    })();\n  }, [robotState, path, currentPosIndex, mapData, userBlockers]);")
                break
        break

# 3. patrol (lines ~1665)
for i in range(1660, 1680):
    if "useEffect(() => {" in lines[i] and "if (robotState === 'patrol' && mapData) {" in lines[i+1]:
        lines[i] = "  useEffect(() => {\n    (async () => {\n"
        for j in range(i, len(lines)):
            if "}, [robotState, isPlaying, path, currentPosIndex, mapData, isOn, isIdleMode]);" in lines[j]:
                lines[j] = lines[j].replace("  }, [robotState, isPlaying, path, currentPosIndex, mapData, isOn, isIdleMode]);", "    })();\n  }, [robotState, isPlaying, path, currentPosIndex, mapData, isOn, isIdleMode]);")
                break
        break

# 4. handleMapClickRef is missing from line 2374.
for i in range(2365, 2385):
    if "const gridP = getGridPointFromVector3(p, mapData!.gridSize);" in lines[i]:
        # if the previous line is not the definition, insert it
        if "handleMapClickRef = useRef" not in lines[i-1]:
            lines.insert(i, "  const handleMapClickRef = useRef<((p: THREE.Vector3) => Promise<void>) | ((p: THREE.Vector3) => void)>(async (p: THREE.Vector3) => {\n")
        break

with open('src/components/SimulationView.tsx', 'w') as f:
    f.writelines(lines)
