import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const ALLOCATIONS_FILE = path.join(DATA_DIR, 'allocations.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Default system-reserved ports that should never be allocated to user apps
export const DEFAULT_RESERVED_PORTS = [
  21,   // FTP
  22,   // SSH
  25,   // SMTP
  53,   // DNS
  80,   // HTTP (Traefik / Coolify Proxy)
  443,  // HTTPS (Traefik / Coolify Proxy)
  3000, // Common default web port
  3306, // MySQL
  5432, // PostgreSQL
  6001, // Coolify Realtime Websocket
  6002, // Coolify Terminal Websocket
  6379, // Redis
  8000, // Coolify Dashboard UI
  8080, // Alternative HTTP
  9000, // Portainer / MinIO
  27017 // MongoDB
];

const DEFAULT_CONFIG = {
  coolifyApiUrl: process.env.COOLIFY_API_URL || 'http://localhost:8000',
  coolifyApiToken: process.env.COOLIFY_API_TOKEN || '',
  portRangeStart: Number(process.env.PORT_RANGE_START) || 3100,
  portRangeEnd: Number(process.env.PORT_RANGE_END) || 9999,
  autoRedeploy: process.env.AUTO_REDEPLOY === 'true',
  autoSetPortEnv: process.env.AUTO_SET_PORT_ENV !== 'false', // default true
  reservedPorts: DEFAULT_RESERVED_PORTS,
  mockMode: process.env.MOCK_MODE === 'true' || !process.env.COOLIFY_API_TOKEN
};

class ConfigManager {
  constructor() {
    this.config = this.loadConfig();
    this.allocations = this.loadAllocations();
  }

  loadConfig() {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
        return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
      }
    } catch (err) {
      console.error('[ConfigManager] Error reading settings.json, using defaults:', err.message);
    }
    return { ...DEFAULT_CONFIG };
  }

  saveConfig(newConfig) {
    this.config = {
      ...this.config,
      ...newConfig,
      portRangeStart: Number(newConfig.portRangeStart) || this.config.portRangeStart,
      portRangeEnd: Number(newConfig.portRangeEnd) || this.config.portRangeEnd,
      reservedPorts: Array.isArray(newConfig.reservedPorts)
        ? newConfig.reservedPorts.map(Number).filter(p => !isNaN(p))
        : this.config.reservedPorts
    };

    // Automatically toggle mock mode based on token presence if not explicitly set
    if (newConfig.coolifyApiToken !== undefined) {
      this.config.mockMode = !newConfig.coolifyApiToken.trim();
    }

    try {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(this.config, null, 2), 'utf-8');
      return { success: true, config: this.getPublicConfig() };
    } catch (err) {
      console.error('[ConfigManager] Error saving settings.json:', err.message);
      return { success: false, error: err.message };
    }
  }

  getConfig() {
    return this.config;
  }

  getPublicConfig() {
    // Return sanitized config without exposing full API token
    const token = this.config.coolifyApiToken || '';
    const maskedToken = token.length > 8
      ? `${token.slice(0, 4)}...${token.slice(-4)}`
      : (token ? '****' : '');

    return {
      coolifyApiUrl: this.config.coolifyApiUrl,
      hasToken: Boolean(token),
      maskedToken,
      portRangeStart: this.config.portRangeStart,
      portRangeEnd: this.config.portRangeEnd,
      autoRedeploy: this.config.autoRedeploy,
      autoSetPortEnv: this.config.autoSetPortEnv,
      reservedPorts: this.config.reservedPorts,
      mockMode: this.config.mockMode
    };
  }

  loadAllocations() {
    try {
      if (fs.existsSync(ALLOCATIONS_FILE)) {
        const data = fs.readFileSync(ALLOCATIONS_FILE, 'utf-8');
        return JSON.parse(data);
      }
    } catch (err) {
      console.error('[ConfigManager] Error reading allocations.json, starting fresh:', err.message);
    }
    return {};
  }

  saveAllocations() {
    try {
      fs.writeFileSync(ALLOCATIONS_FILE, JSON.stringify(this.allocations, null, 2), 'utf-8');
    } catch (err) {
      console.error('[ConfigManager] Error saving allocations.json:', err.message);
    }
  }

  getAllocations() {
    return this.allocations;
  }

  getAllocation(appUuid) {
    return this.allocations[appUuid] || null;
  }

  setAllocation(appUuid, port, appName = '', domain = '') {
    this.allocations[appUuid] = {
      port: Number(port),
      appName,
      domain,
      updatedAt: new Date().toISOString()
    };
    this.saveAllocations();
    return this.allocations[appUuid];
  }

  removeAllocation(appUuid) {
    if (this.allocations[appUuid]) {
      delete this.allocations[appUuid];
      this.saveAllocations();
      return true;
    }
    return false;
  }
}

export const configManager = new ConfigManager();
