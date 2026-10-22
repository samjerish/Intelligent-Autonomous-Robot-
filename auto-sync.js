import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const SYNC_INTERVAL_MS = 60000; // 60 seconds

async function checkAndSync() {
  try {
    // 1. Check if there are any working tree changes
    const { stdout: statusOut } = await execAsync('git status --porcelain');
    
    if (statusOut.trim().length > 0) {
      console.log('[Auto-Sync] Changes detected. Syncing to GitHub...');
      const timestamp = new Date().toLocaleString();
      
      await execAsync('git add .');
      await execAsync(`git commit -m "Auto-sync: ${timestamp}"`);
      await execAsync('git push origin main');
      console.log(`[Auto-Sync] Successfully synced changes at ${timestamp}`);
      return;
    }

    // 2. If working tree is clean, check if there are unpushed commits from previous network retries
    try {
      const { stdout: unpushedOut } = await execAsync('git log origin/main..HEAD --oneline');
      if (unpushedOut.trim().length > 0) {
        console.log('[Auto-Sync] Pending local commits detected. Pushing to GitHub...');
        await execAsync('git push origin main');
        console.log('[Auto-Sync] Successfully pushed pending commits.');
      }
    } catch (_) {
      // Ignore if remote tracking reference is temporarily unavailable
    }
  } catch (error) {
    const msg = error.message || '';
    const isNetworkError =
      msg.includes('No route to host') ||
      msg.includes('408') ||
      msg.includes('Could not resolve host') ||
      msg.includes('Recv failure') ||
      msg.includes('unexpected disconnect') ||
      msg.includes('Operation timed out') ||
      msg.includes('Connection refused') ||
      msg.includes('Failed to connect');

    if (isNetworkError) {
      console.warn('[Auto-Sync] Network temporarily unreachable, will retry in next cycle...');
    } else {
      console.error('[Auto-Sync] Sync issue:', msg.split('\n')[0]);
    }
  }
}

console.log(`[Auto-Sync] Started background sync (runs every ${SYNC_INTERVAL_MS / 1000} seconds)...`);

// Run the loop
setInterval(checkAndSync, SYNC_INTERVAL_MS);
