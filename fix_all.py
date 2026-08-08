with open('src/components/SimulationView.tsx', 'r') as f:
    lines = f.readlines()

def make_async(func_name, lines):
    for i in range(len(lines)):
        if f"const {func_name} = (" in lines[i] and "async" not in lines[i]:
            lines[i] = lines[i].replace(f"const {func_name} = (", f"const {func_name} = async (")
        elif f"const {func_name} = () => {{" in lines[i] and "async" not in lines[i]:
            lines[i] = lines[i].replace(f"const {func_name} = () => {{", f"const {func_name} = async () => {{")

make_async('resetSimulation', lines)
make_async('handleEmergencyCall', lines)
make_async('handleCrowdEmergency', lines)
make_async('handleCrowdResponseComplete', lines)
make_async('handleKeyDown', lines)

# For socket.on('update_state'
for i in range(len(lines)):
    if "socketRef.current.on('update_state', (newState: any) => {" in lines[i]:
        lines[i] = lines[i].replace("(newState: any) => {", "async (newState: any) => {")

# For returning_home (around 1549):
for i in range(1530, 1560):
    if "useEffect(() => {" in lines[i] and "if (robotState === 'returning_home') {" in lines[i+1]:
        if "async" not in lines[i+1]:
            lines[i] = "  useEffect(() => {\n    (async () => {\n"
            for j in range(i, len(lines)):
                if "}, [robotState, path, currentPosIndex, mapData, userBlockers]);" in lines[j]:
                    lines[j] = lines[j].replace("  }, [robotState, path, currentPosIndex, mapData, userBlockers]);", "    })();\n  }, [robotState, path, currentPosIndex, mapData, userBlockers]);")
                    break

# For patrol (around 1677):
for i in range(1660, 1690):
    if "useEffect(() => {" in lines[i] and "if (robotState === 'patrol' && mapData) {" in lines[i+1]:
        if "async" not in lines[i+1]:
            lines[i] = "  useEffect(() => {\n    (async () => {\n"
            for j in range(i, len(lines)):
                if "}, [robotState, isPlaying, path, currentPosIndex, mapData, isOn, isIdleMode]);" in lines[j]:
                    lines[j] = lines[j].replace("  }, [robotState, isPlaying, path, currentPosIndex, mapData, isOn, isIdleMode]);", "    })();\n  }, [robotState, isPlaying, path, currentPosIndex, mapData, isOn, isIdleMode]);")
                    break

with open('src/components/SimulationView.tsx', 'w') as f:
    f.writelines(lines)
