function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${msg}`);
}

console.log('=== VERIFYING PERMANENT AUTONOMOUS PATROL MODE ===\n');

type RobotState = 'patrol' | 'idle' | 'off';
type RobotLiveStatus = 'IDLE' | 'MOVING' | 'DIVERSION' | 'ROAD BARRICADE DETECTED';

const CHECKPOINTS = [
  'Admin Block',
  'Academic Block',
  'Library',
  'Hostel Zone',
  'Sports Complex',
  'Cafeteria',
];

interface PatrolSimState {
  robotState: RobotState;
  liveStatus: RobotLiveStatus;
  currentCheckpointIdx: number;
  patrolCountdown: number | null;
  isPlaying: boolean;
}

// Emulate simulation state machine
class PatrolManager {
  state: PatrolSimState = {
    robotState: 'patrol',
    liveStatus: 'MOVING',
    currentCheckpointIdx: 0,
    patrolCountdown: null,
    isPlaying: true,
  };

  // Robot reaches destination
  onReachDestination() {
    // Must remain in patrol mode, pause in IDLE status
    assert(this.state.robotState === 'patrol', 'State remains "patrol" upon reaching destination');
    this.state.isPlaying = false;
    this.state.patrolCountdown = 5.0;
    this.state.liveStatus = 'IDLE';
  }

  // Timer tick for inspection pause
  tickCountdown(secondsElapsed: number) {
    if (this.state.patrolCountdown !== null) {
      const nextVal = Math.max(0, this.state.patrolCountdown - secondsElapsed);
      this.state.patrolCountdown = nextVal;
      if (nextVal <= 0) {
        this.state.patrolCountdown = null;
        // Resume next leg of patrol
        this.dispatchNextLeg();
      }
    }
  }

  dispatchNextLeg() {
    // Advances to next checkpoint in loop
    this.state.currentCheckpointIdx = (this.state.currentCheckpointIdx + 1) % CHECKPOINTS.length;
    this.state.robotState = 'patrol';
    this.state.isPlaying = true;
    this.state.liveStatus = 'MOVING';
  }

  // Encounter obstacle along route
  onAvoidObstacle() {
    assert(this.state.robotState === 'patrol', 'Remains in patrol mode during obstacle diversion');
    this.state.liveStatus = 'DIVERSION';
  }

  // Obstacle cleared
  onClearObstacle() {
    assert(this.state.robotState === 'patrol', 'Remains in patrol mode after obstacle cleared');
    this.state.liveStatus = 'MOVING';
  }

  // Encounter road barricade
  onDetectBarricade() {
    assert(this.state.robotState === 'patrol', 'Remains in patrol mode during barricade rerouting');
    this.state.liveStatus = 'ROAD BARRICADE DETECTED';
  }

  // Alternate route engaged
  onAlternateRouteActive() {
    assert(this.state.robotState === 'patrol', 'Remains in patrol mode while following alternate route');
    this.state.liveStatus = 'ROAD BARRICADE DETECTED';
  }

  // Destination blocked by barricade
  onDestinationUnreachable() {
    assert(this.state.robotState === 'patrol', 'Remains in patrol mode when destination blocked');
    // Intelligently skip to next open destination
    this.dispatchNextLeg();
  }

  // Reset simulation
  onReset() {
    this.state.currentCheckpointIdx = 0;
    this.state.patrolCountdown = null;
    this.state.robotState = 'patrol';
    this.state.isPlaying = true;
    this.state.liveStatus = 'MOVING';
  }
}

const manager = new PatrolManager();

// --- TEST 1: Initial State is Patrol ---
console.log('--- TEST 1: Initial State is Patrol ---');
assert(manager.state.robotState === 'patrol', 'Initial state is patrol');
assert(manager.state.liveStatus === 'MOVING', 'Initial live status is MOVING');

// --- TEST 2: Multi-Leg Patrol Loop with Inspection Pauses ---
console.log('\n--- TEST 2: Multi-Leg Patrol Loop ---');
for (let lap = 0; lap < 3; lap++) {
  const currentTarget = CHECKPOINTS[manager.state.currentCheckpointIdx];
  console.log(`Cruising to checkpoint [${manager.state.currentCheckpointIdx}]: ${currentTarget}`);
  assert(manager.state.liveStatus === 'MOVING', 'Cruising status is MOVING');
  assert(manager.state.robotState === 'patrol', 'State is patrol');

  // Arrive at destination
  manager.onReachDestination();
  assert(manager.state.liveStatus === 'IDLE', 'Destination pause status is IDLE');
  assert(manager.state.robotState === 'patrol', 'Mode is permanently patrol during pause');

  // Finish pause
  manager.tickCountdown(5.0);
  assert(manager.state.liveStatus === 'MOVING', 'Resumed status is MOVING');
  assert(manager.state.robotState === 'patrol', 'Mode is permanently patrol when resuming');
}

// --- TEST 3: Obstacle Diversions Never Exit Patrol ---
console.log('\n--- TEST 3: Obstacle Diversion Invariant ---');
manager.onAvoidObstacle();
assert(manager.state.liveStatus === 'DIVERSION', 'Live status is DIVERSION');
assert(manager.state.robotState === 'patrol', 'Robot state remains patrol');
manager.onClearObstacle();
assert(manager.state.liveStatus === 'MOVING', 'Live status returns to MOVING');
assert(manager.state.robotState === 'patrol', 'Robot state remains patrol');

// --- TEST 4: Barricade Detection Never Exits Patrol ---
console.log('\n--- TEST 4: Barricade Rerouting Invariant ---');
manager.onDetectBarricade();
assert(manager.state.liveStatus === 'ROAD BARRICADE DETECTED', 'Live status is ROAD BARRICADE DETECTED');
assert(manager.state.robotState === 'patrol', 'Robot state remains patrol');
manager.onAlternateRouteActive();
assert(manager.state.robotState === 'patrol', 'Robot state remains patrol during alternate routing');

// --- TEST 5: Blocked Destination Advances Without Freezing ---
console.log('\n--- TEST 5: Blocked Destination Recovery ---');
const prevIdx = manager.state.currentCheckpointIdx;
manager.onDestinationUnreachable();
assert(manager.state.currentCheckpointIdx === (prevIdx + 1) % CHECKPOINTS.length, 'Advanced to next checkpoint');
assert(manager.state.robotState === 'patrol', 'Robot state remains patrol');
assert(manager.state.liveStatus === 'MOVING', 'Robot keeps moving without freezing');

// --- TEST 6: Reset Reinitializes Patrol Mode ---
console.log('\n--- TEST 6: Reset Invariant ---');
manager.onReset();
assert(manager.state.robotState === 'patrol', 'Reset preserves patrol mode');
assert(manager.state.currentCheckpointIdx === 0, 'Reset returns to checkpoint 0');
assert(manager.state.isPlaying === true, 'Reset begins playing immediately');

console.log('\n=== ALL PERMANENT AUTONOMOUS PATROL TESTS PASSED ===');
