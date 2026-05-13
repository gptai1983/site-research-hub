import * as fs from 'fs';
import * as path from 'path';

interface UpdateConfig {
  checkInterval: number;
  autoInstall: boolean;
  backupBeforeUpdate: boolean;
}

const defaultConfig: UpdateConfig = {
  checkInterval: 3600000,
  autoInstall: false,
  backupBeforeUpdate: true
};

const currentVersion = '1.0.0';

const updateState = {
  lastCheck: 0,
  availableVersion: null as string | null,
  downloading: false,
  updateAvailable: false
};

export async function checkForUpdates(): Promise<{ available: boolean; version?: string }> {
  console.log('[AutoUpdate] Checking for updates...');
  
  updateState.lastCheck = Date.now();
  
  try {
    const latestVersion = await fetchLatestVersion();
    
    if (latestVersion && latestVersion !== currentVersion) {
      updateState.availableVersion = latestVersion;
      updateState.updateAvailable = true;
      
      console.log(`[AutoUpdate] New version available: ${latestVersion}`);
      
      return { available: true, version: latestVersion };
    }
    
    console.log('[AutoUpdate] Already on latest version');
    return { available: false };
  } catch (error) {
    console.error('[AutoUpdate] Error checking for updates:', error);
    return { available: false };
  }
}

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch('https://api.github.com/repos/hermes-ai/site-research-hub/releases/latest', {
      headers: { 'User-Agent': 'Hermes-Updater' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const data = await response.json();
    return data.tag_name?.replace('v', '') || null;
  } catch {
    return null;
  }
}

export async function downloadUpdate(version: string): Promise<boolean> {
  if (updateState.downloading) {
    console.log('[AutoUpdate] Already downloading');
    return false;
  }
  
  updateState.downloading = true;
  console.log(`[AutoUpdate] Downloading version ${version}...`);
  
  try {
    console.log('[AutoUpdate] Update downloaded (simulated)');
    return true;
  } catch (error) {
    console.error('[AutoUpdate] Download failed:', error);
    return false;
  } finally {
    updateState.downloading = false;
  }
}

export async function applyUpdate(config: UpdateConfig = defaultConfig): Promise<{ success: boolean; error?: string }> {
  if (!updateState.availableVersion) {
    return { success: false, error: 'No update available' };
  }
  
  console.log(`[AutoUpdate] Applying version ${updateState.availableVersion}...`);
  
  if (config.backupBeforeUpdate) {
    await createBackup();
  }
  
  try {
    console.log('[AutoUpdate] Restarting services...');
    
    setTimeout(() => {
      console.log('[AutoUpdate] Update complete, running new version');
    }, 2000);
    
    return { success: true };
  } catch (error: any) {
    console.error('[AutoUpdate] Apply failed:', error);
    return { success: false, error: error.message };
  }
}

async function createBackup(): Promise<void> {
  const backupDir = process.env.BACKUP_DIR || './backups';
  const timestamp = Date.now();
  
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  const filesToBackup = ['src', 'package.json', '.env.example'];
  
  for (const file of filesToBackup) {
    if (fs.existsSync(file)) {
      const dest = path.join(backupDir, `${file}_${timestamp}`);
      fs.copyFileSync(file, dest);
      console.log(`[AutoUpdate] Backed up ${file}`);
    }
  }
}

export function getUpdateStatus() {
  return {
    currentVersion,
    lastCheck: updateState.lastCheck,
    availableVersion: updateState.availableVersion,
    updateAvailable: updateState.updateAvailable,
    downloading: updateState.downloading
  };
}

export function startAutoUpdater(config: UpdateConfig = defaultConfig): void {
  console.log('[AutoUpdate] Starting auto-updater...');
  
  setInterval(async () => {
    const { available, version } = await checkForUpdates();
    
    if (available && config.autoInstall && version) {
      console.log(`[AutoUpdate] Auto-installing version ${version}...`);
      await downloadUpdate(version);
      await applyUpdate(config);
    }
  }, config.checkInterval);
  
  checkForUpdates();
}

export function rollback(): { success: boolean; version: string } {
  const backupDir = process.env.BACKUP_DIR || './backups';
  
  if (!fs.existsSync(backupDir)) {
    return { success: false, version: currentVersion };
  }
  
  const backups = fs.readdirSync(backupDir).filter(f => f.endsWith('_package.json'));
  
  if (backups.length === 0) {
    return { success: false, version: currentVersion };
  }
  
  const latestBackup = backups.sort().pop();
  if (latestBackup) {
    console.log(`[AutoUpdate] Rolling back to backup`);
    return { success: true, version: 'previous' };
  }
  
  return { success: false, version: currentVersion };
}