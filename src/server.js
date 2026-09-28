import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { configManager } from './services/configManager.js';
import { PortAllocator } from './services/portAllocator.js';
import { coolifyApi } from './services/coolifyApi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. System & Connection Status
app.get('/api/status', async (req, res) => {
  try {
    const status = await coolifyApi.checkConnection();
    res.json({
      success: true,
      status,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Configuration Settings
app.get('/api/config', (req, res) => {
  res.json({ success: true, config: configManager.getPublicConfig() });
});

app.post('/api/config', async (req, res) => {
  try {
    const result = configManager.saveConfig(req.body);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    // Re-check connection with updated credentials
    const conn = await coolifyApi.checkConnection();
    res.json({ success: true, config: result.config, connection: conn });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. List Applications with Port & Exposure Analysis
app.get('/api/apps', async (req, res) => {
  try {
    const rawApps = await coolifyApi.getApplications();
    const allocations = configManager.getAllocations();
    const config = configManager.getConfig();

    const apps = await Promise.all(
      rawApps.map(async (app) => {
        const uuid = app.uuid || app.id;
        const exposedPort = app.ports_exposes || '';
        const hostMapping = app.ports_mappings || '';
        const hasDangerousHostExposure = Boolean(hostMapping && hostMapping.trim() !== '');
        const savedAlloc = allocations[uuid];

        // Determine effective port
        let currentPort = exposedPort ? PortAllocator.parsePorts(exposedPort)[0] : null;
        if (!currentPort && savedAlloc) {
          currentPort = savedAlloc.port;
        }

        // Suggest next free port if not yet assigned
        let suggestedPort = currentPort;
        if (!suggestedPort) {
          try {
            suggestedPort = await PortAllocator.findFreePort({
              appUuid: uuid,
              coolifyApps: rawApps,
              checkSocket: false
            });
          } catch {
            suggestedPort = config.portRangeStart;
          }
        }

        return {
          uuid,
          name: app.name || 'Unnamed Application',
          description: app.description || '',
          status: app.status || 'unknown',
          fqdn: app.fqdn || '',
          currentPort: currentPort || null,
          suggestedPort,
          ports_exposes: exposedPort,
          ports_mappings: hostMapping,
          hasDangerousHostExposure,
          isInternalOnly: !hasDangerousHostExposure && Boolean(currentPort),
          build_pack: app.build_pack || 'nixpacks',
          git_repository: app.git_repository || '',
          git_branch: app.git_branch || '',
          updated_at: app.updated_at || null
        };
      })
    );

    res.json({
      success: true,
      apps,
      totalCount: apps.length,
      exposedCount: apps.filter(a => a.hasDangerousHostExposure).length
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Auto-Allocate Next Free Port for an App
app.post('/api/apps/:uuid/allocate-port', async (req, res) => {
  try {
    const { uuid } = req.params;
    const rawApps = await coolifyApi.getApplications();
    const freePort = await PortAllocator.findFreePort({
      appUuid: uuid,
      coolifyApps: rawApps,
      checkSocket: true
    });

    res.json({
      success: true,
      appUuid: uuid,
      freePort
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 5. Configure Domain and Auto-Assigned/Selected Port (Zero-Expose Enforced)
app.post('/api/apps/:uuid/configure', async (req, res) => {
  try {
    const { uuid } = req.params;
    let { domain, port, autoAssign, redeploy } = req.body;
    const rawApps = await coolifyApi.getApplications();
    const config = configManager.getConfig();

    // If autoAssign requested or no port provided, pick next free port
    if (autoAssign || !port) {
      port = await PortAllocator.findFreePort({
        appUuid: uuid,
        coolifyApps: rawApps,
        checkSocket: true
      });
    } else {
      port = Number(port);
      if (isNaN(port) || port < 1 || port > 65535) {
        return res.status(400).json({ success: false, error: 'Invalid port number specified' });
      }
    }

    // Call Coolify API with strict zero-exposure enforcement
    const updateResult = await coolifyApi.updateApplication(uuid, {
      fqdn: domain,
      port,
      clearHostMapping: true // GUARANTEED: strips any ports_mappings
    });

    let deployResult = null;
    const shouldRedeploy = redeploy ?? config.autoRedeploy;
    if (shouldRedeploy) {
      try {
        deployResult = await coolifyApi.deployApplication(uuid);
      } catch (deployErr) {
        console.warn(`[Server] Deploy error for ${uuid}:`, deployErr.message);
        deployResult = { success: false, error: deployErr.message };
      }
    }

    res.json({
      success: true,
      message: `Configured ${domain || '(no domain)'} -> internal port ${port}. Host exposure strictly removed.`,
      application: updateResult.application,
      assignedPort: port,
      deployed: Boolean(deployResult),
      deployResult
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Batch Configure Multiple Applications
app.post('/api/apps/batch-configure', async (req, res) => {
  try {
    const { updates, autoAssignAll, redeployAll } = req.body;
    // updates: Array of { uuid, domain, port }
    const rawApps = await coolifyApi.getApplications();
    const config = configManager.getConfig();
    const results = [];
    const usedInBatch = [];

    const targets = Array.isArray(updates) && updates.length > 0
      ? updates
      : rawApps.map(a => ({ uuid: a.uuid || a.id, domain: a.fqdn || '' }));

    for (const item of targets) {
      try {
        let assignedPort = item.port;
        if (autoAssignAll || !assignedPort) {
          assignedPort = await PortAllocator.findFreePort({
            appUuid: item.uuid,
            coolifyApps: rawApps,
            excludePorts: usedInBatch,
            checkSocket: false
          });
        }
        usedInBatch.push(assignedPort);

        await coolifyApi.updateApplication(item.uuid, {
          fqdn: item.domain,
          port: assignedPort,
          clearHostMapping: true
        });

        let deployed = false;
        if (redeployAll ?? config.autoRedeploy) {
          await coolifyApi.deployApplication(item.uuid).catch(() => {});
          deployed = true;
        }

        results.push({
          uuid: item.uuid,
          domain: item.domain,
          port: assignedPort,
          deployed,
          success: true
        });
      } catch (e) {
        results.push({
          uuid: item.uuid,
          success: false,
          error: e.message
        });
      }
    }

    res.json({
      success: true,
      processed: results.length,
      results
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Security Action: Unexpose All Host Ports
app.post('/api/apps/unexpose-all', async (req, res) => {
  try {
    const rawApps = await coolifyApi.getApplications();
    const unexposed = await coolifyApi.removeAllHostExposures(rawApps);
    res.json({
      success: true,
      message: `Audited ${rawApps.length} applications and stripped host port exposures`,
      remediated: unexposed
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Port Allocation Matrix & Conflict Overview
app.get('/api/ports/overview', async (req, res) => {
  try {
    const rawApps = await coolifyApi.getApplications();
    const overview = PortAllocator.getPortsOverview(rawApps);
    res.json({ success: true, ...overview });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start Express Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Coolify Configurator] Web App running on http://0.0.0.0:${PORT}`);
  console.log(`[Coolify Configurator] Ready to configure Coolify domains & internal ports.`);
});
