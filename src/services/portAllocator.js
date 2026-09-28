import net from 'node:net';
import { configManager } from './configManager.js';

export class PortAllocator {
  /**
   * Test if a port can be bound locally on the machine.
   * Note: inside a container without host networking, this checks container-local binding.
   */
  static isPortFreeLocally(port, host = '0.0.0.0') {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.unref();

      server.on('error', () => {
        resolve(false);
      });

      server.listen({ port, host, exclusive: true }, () => {
        server.close(() => {
          resolve(true);
        });
      });
    });
  }

  /**
   * Extract numeric ports from a Coolify port string.
   * e.g. "3000" -> [3000]
   * e.g. "3000, 3001" -> [3000, 3001]
   * e.g. "8080:80" -> [8080, 80]
   */
  static parsePorts(portStr) {
    if (!portStr || typeof portStr !== 'string') return [];
    const ports = [];
    const segments = portStr.split(/[,\s]+/);

    for (const segment of segments) {
      if (!segment) continue;
      if (segment.includes(':')) {
        const parts = segment.split(':');
        for (const part of parts) {
          const p = parseInt(part.trim(), 10);
          if (!isNaN(p) && p > 0 && p <= 65535) ports.push(p);
        }
      } else {
        const p = parseInt(segment.trim(), 10);
        if (!isNaN(p) && p > 0 && p <= 65535) ports.push(p);
      }
    }
    return ports;
  }

  /**
   * Collect all currently used ports from Coolify applications and persistent allocations.
   * Returns a Map of port -> details { appUuid, appName, source: 'coolify_expose'|'coolify_mapping'|'registry' }
   */
  static getUsedPortsMap(coolifyApps = []) {
    const usedMap = new Map();
    const config = configManager.getConfig();

    // 1. System reserved ports
    for (const port of config.reservedPorts || []) {
      usedMap.set(port, {
        appUuid: 'system',
        appName: 'System / Reserved Port',
        source: 'reserved'
      });
    }

    // 2. Persistent allocations from local registry
    const registry = configManager.getAllocations();
    for (const [uuid, alloc] of Object.entries(registry)) {
      if (alloc && alloc.port) {
        usedMap.set(alloc.port, {
          appUuid: uuid,
          appName: alloc.appName || 'Registered Application',
          source: 'registry'
        });
      }
    }

    // 3. Applications currently fetched from Coolify
    for (const app of coolifyApps) {
      const appUuid = app.uuid || app.id;
      const appName = app.name || 'Unnamed App';

      // Internal exposed ports (for Traefik)
      const exposed = PortAllocator.parsePorts(app.ports_exposes);
      for (const p of exposed) {
        usedMap.set(p, {
          appUuid,
          appName,
          source: 'coolify_expose'
        });
      }

      // Host published ports (mappings)
      const mapped = PortAllocator.parsePorts(app.ports_mappings);
      for (const p of mapped) {
        usedMap.set(p, {
          appUuid,
          appName,
          source: 'coolify_mapping',
          isDangerousExposure: true
        });
      }
    }

    return usedMap;
  }

  /**
   * Find the next available free port for an application.
   */
  static async findFreePort({
    preferredPort = null,
    appUuid = null,
    coolifyApps = [],
    excludePorts = [],
    checkSocket = true
  } = {}) {
    const config = configManager.getConfig();
    const start = config.portRangeStart;
    const end = config.portRangeEnd;
    const usedPorts = PortAllocator.getUsedPortsMap(coolifyApps);
    const excludeSet = new Set(excludePorts.map(Number));

    // If preferredPort is provided, check if it's available
    if (preferredPort) {
      const p = Number(preferredPort);
      const isAvailable = (!usedPorts.has(p) || (appUuid && usedPorts.get(p)?.appUuid === appUuid)) &&
        !excludeSet.has(p);

      if (isAvailable) {
        if (!checkSocket || (await PortAllocator.isPortFreeLocally(p))) {
          return p;
        }
      }
    }

    // Scan through configured port range
    for (let port = start; port <= end; port++) {
      if (excludeSet.has(port)) continue;

      // Check if taken in map
      if (usedPorts.has(port)) {
        // If it's already allocated to THIS exact app, we can reuse it
        if (appUuid && usedPorts.get(port)?.appUuid === appUuid) {
          return port;
        }
        continue;
      }

      // Socket verification check
      if (checkSocket) {
        const freeLocally = await PortAllocator.isPortFreeLocally(port);
        if (!freeLocally) {
          // Record it as occupied locally
          usedPorts.set(port, { appUuid: 'host', appName: 'Local Host Process', source: 'host_socket' });
          continue;
        }
      }

      return port;
    }

    throw new Error(`No free ports available in range ${start}-${end}`);
  }

  /**
   * Allocate sequential free ports for multiple applications
   */
  static async allocateMultiple(count, { coolifyApps = [], excludePorts = [] } = {}) {
    const allocated = [];
    const currentExcludes = [...excludePorts];

    for (let i = 0; i < count; i++) {
      const port = await PortAllocator.findFreePort({
        coolifyApps,
        excludePorts: [...currentExcludes, ...allocated]
      });
      allocated.push(port);
    }

    return allocated;
  }

  /**
   * Generates a complete status overview of the port ecosystem.
   */
  static getPortsOverview(coolifyApps = []) {
    const config = configManager.getConfig();
    const usedMap = PortAllocator.getUsedPortsMap(coolifyApps);
    const start = config.portRangeStart;
    const end = config.portRangeEnd;
    const totalSlots = Math.max(0, end - start + 1);

    const allocatedInRange = [];
    const exposedHostViolations = [];

    for (const [port, info] of usedMap.entries()) {
      if (port >= start && port <= end) {
        allocatedInRange.push({ port, ...info });
      }
      if (info.isDangerousExposure) {
        exposedHostViolations.push({ port, ...info });
      }
    }

    const freeSlots = Math.max(0, totalSlots - allocatedInRange.length);

    return {
      range: { start, end, totalSlots },
      allocatedCount: allocatedInRange.length,
      freeSlotsCount: freeSlots,
      usedPorts: Array.from(usedMap.entries()).map(([port, data]) => ({ port, ...data })),
      exposedHostViolations
    };
  }
}
