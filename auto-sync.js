import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const SYNC_INTERVAL_MS = 60000; // 60 seconds

async function checkAndSync() {
  try {
    // Check if there are any changes
    const { stdout: statusOut } = await execAsync('git status --porcelain');
    
    if (statusOut.trim().length > 0) {
      console.log('[Auto-Sync] Changes detected. Syncing to GitHub...');
      
      const timestamp = new Date().toLocaleString();
      
      await execAsync('git add .');
      await execAsync(`git commit -m "Auto-sync: ${timestamp}"`);
      await execAsync('git push origin main');
      
      console.log(`[Auto-Sync] Successfully synced changes at ${timestamp}`);
    }
  } catch (error) {
    // Only log meaningful non-network drops or summarized message
    const msg = error.message || '';
    if (msg.includes('No route to host') || msg.includes('408') || msg.includes('Could not resolve host')) {
      console.warn('[Auto-Sync] Network unreachable, will retry next cycle...');
    } else {
      console.error('[Auto-Sync] Error during sync:', msg.split('\n')[0]);
    }
  }
}

console.log(`[Auto-Sync] Started background sync (runs every ${SYNC_INTERVAL_MS / 1000} seconds)...`);

// Run the loop
setInterval(checkAndSync, SYNC_INTERVAL_MS);
