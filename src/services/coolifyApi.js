import { configManager } from './configManager.js';

// Default mock applications for preview / standalone demonstration
const MOCK_APPS = [
  {
    uuid: 'app-nextjs-ecommerce-01',
    name: 'Next.js Frontend Store',
    description: 'Modern storefront built with Next.js 14 and Tailwind',
    status: 'running',
    fqdn: 'https://store.example.com',
    ports_exposes: '3000',
    ports_mappings: '', // internal only, safe
    build_pack: 'nixpacks',
    git_repository: 'https://github.com/example/ecommerce-front',
    git_branch: 'main',
    updated_at: new Date(Date.now() - 3600000).toISOString()
  },
  {
    uuid: 'app-fastapi-backend-02',
    name: 'Python FastAPI Engine',
    description: 'High-performance REST API with async database access',
    status: 'running',
    fqdn: 'https://api.example.com',
    ports_exposes: '8080',
    ports_mappings: '8080:8080', // WARNING: host port exposed! Violates zero-expose rule!
    build_pack: 'dockerfile',
    git_repository: 'https://github.com/example/fastapi-core',
    git_branch: 'main',
    updated_at: new Date(Date.now() - 7200000).toISOString()
  },
  {
    uuid: 'app-strapi-cms-03',
    name: 'Strapi Headless CMS',
    description: 'Content repository for marketing websites',
    status: 'stopped',
    fqdn: '', // unconfigured domain!
    ports_exposes: '1337',
    ports_mappings: '',
    build_pack: 'dockerfile',
    git_repository: 'https://github.com/example/strapi-backend',
    git_branch: 'production',
    updated_at: new Date(Date.now() - 86400000).toISOString()
  },
  {
    uuid: 'app-docs-astro-04',
    name: 'Documentation Portal',
    description: 'Developer knowledge base and API reference',
    status: 'running',
    fqdn: 'https://docs.example.com',
    ports_exposes: '4321',
    ports_mappings: '',
    build_pack: 'nixpacks',
    git_repository: 'https://github.com/example/docs-hub',
    git_branch: 'main',
    updated_at: new Date(Date.now() - 14400000).toISOString()
  }
];

class CoolifyApiClient {
  constructor() {
    this.mockState = JSON.parse(JSON.stringify(MOCK_APPS));
  }

  getHeaders() {
    const config = configManager.getConfig();
    return {
      'Authorization': `Bearer ${config.coolifyApiToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  getBaseUrl() {
    const config = configManager.getConfig();
    let url = config.coolifyApiUrl.trim();
    if (url.endsWith('/')) url = url.slice(0, -1);
    if (!url.endsWith('/api/v1')) {
      url += '/api/v1';
    }
    return url;
  }

  isMockMode() {
    const config = configManager.getConfig();
    return config.mockMode || !config.coolifyApiToken;
  }

  /**
   * Health / Connection check
   */
  async checkConnection() {
    if (this.isMockMode()) {
      return {
        connected: true,
        mode: 'mock',
        message: 'Running in Simulation / Demo Mode. Add your Coolify API Token in Settings to connect to live instance.'
      };
    }

    try {
      const res = await fetch(`${this.getBaseUrl()}/version`, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(6000)
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return {
          connected: true,
          mode: 'live',
          version: data.version || 'Coolify v4',
          message: 'Connected to Coolify instance successfully'
        };
      }

      // If /version is not open, fallback to testing /applications
      const testRes = await fetch(`${this.getBaseUrl()}/applications`, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(6000)
      });

      if (testRes.ok) {
        return {
          connected: true,
          mode: 'live',
          message: 'Connected to Coolify instance successfully'
        };
      }

      return {
        connected: false,
        mode: 'live',
        status: testRes.status,
        message: `Authentication or connection failed: HTTP ${testRes.status}`
      };
    } catch (err) {
      return {
        connected: false,
        mode: 'live',
        error: err.message,
        message: `Could not reach Coolify at ${this.getBaseUrl()}: ${err.message}`
      };
    }
  }

  /**
   * Fetch all applications
   */
  async getApplications() {
    if (this.isMockMode()) {
      return this.mockState;
    }

    const res = await fetch(`${this.getBaseUrl()}/applications`, {
      method: 'GET',
      headers: this.getHeaders()
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Coolify API error (${res.status}): ${errorText}`);
    }

    return await res.json();
  }

  /**
   * Fetch single application
   */
  async getApplication(uuid) {
    if (this.isMockMode()) {
      const app = this.mockState.find(a => a.uuid === uuid);
      if (!app) throw new Error(`Mock application ${uuid} not found`);
      return app;
    }

    const res = await fetch(`${this.getBaseUrl()}/applications/${uuid}`, {
      method: 'GET',
      headers: this.getHeaders()
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch application ${uuid}: HTTP ${res.status}`);
    }

    return await res.json();
  }

  /**
   * Update application domain and internal exposed port.
   * GUARANTEE: strictly clears ports_mappings so no host ports are published!
   */
  async updateApplication(uuid, { fqdn, port, clearHostMapping = true }) {
    // Domain normalization: ensure scheme is included (e.g. https://domain.com)
    let normalizedFqdn = (fqdn || '').trim();
    if (normalizedFqdn && !normalizedFqdn.startsWith('http://') && !normalizedFqdn.startsWith('https://')) {
      normalizedFqdn = `https://${normalizedFqdn}`;
    }

    const payload = {
      fqdn: normalizedFqdn,
      ports_exposes: String(port)
    };

    // Zero-exposure enforcement
    if (clearHostMapping) {
      payload.ports_mappings = ''; // clears host-to-container port binding
    }

    if (this.isMockMode()) {
      const appIndex = this.mockState.findIndex(a => a.uuid === uuid);
      if (appIndex === -1) throw new Error(`Application ${uuid} not found`);

      this.mockState[appIndex] = {
        ...this.mockState[appIndex],
        fqdn: normalizedFqdn,
        ports_exposes: String(port),
        ...(clearHostMapping ? { ports_mappings: '' } : {}),
        updated_at: new Date().toISOString()
      };

      // Record in local persistent registry
      configManager.setAllocation(uuid, port, this.mockState[appIndex].name, normalizedFqdn);

      return {
        success: true,
        mode: 'mock',
        application: this.mockState[appIndex],
        message: `Mock app updated with domain: ${normalizedFqdn || 'None'} and internal port: ${port} (Zero host ports exposed)`
      };
    }

    // Call live Coolify API
    const res = await fetch(`${this.getBaseUrl()}/applications/${uuid}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to update application ${uuid} (${res.status}): ${err}`);
    }

    const updatedApp = await res.json().catch(() => ({ uuid, ...payload }));

    // Record in local persistent registry
    configManager.setAllocation(uuid, port, updatedApp.name || uuid, normalizedFqdn);

    // Optionally set PORT environment variable if configured
    const config = configManager.getConfig();
    if (config.autoSetPortEnv) {
      await this.setPortEnvVar(uuid, port).catch(e => {
        console.warn(`[CoolifyApi] Notice: could not automatically set PORT env var for ${uuid}: ${e.message}`);
      });
    }

    return {
      success: true,
      mode: 'live',
      application: updatedApp,
      message: `Application updated: ${normalizedFqdn || '(none)'} -> internal port ${port}`
    };
  }

  /**
   * Safely set PORT environment variable in Coolify application
   */
  async setPortEnvVar(uuid, port) {
    if (this.isMockMode()) return { success: true };

    try {
      // Coolify env endpoint
      await fetch(`${this.getBaseUrl()}/applications/${uuid}/envs`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          key: 'PORT',
          value: String(port),
          is_build_time: false,
          is_preview: false
        })
      });
      return { success: true };
    } catch {
      // Fail silently if unsupported
      return { success: false };
    }
  }

  /**
   * Trigger redeployment of application so Traefik picks up changes
   */
  async deployApplication(uuid, force = false) {
    if (this.isMockMode()) {
      const app = this.mockState.find(a => a.uuid === uuid);
      if (app) app.status = 'redeploying';
      setTimeout(() => {
        if (app) app.status = 'running';
      }, 5000);

      return {
        success: true,
        mode: 'mock',
        message: `Deployment triggered for ${app ? app.name : uuid}`
      };
    }

    const res = await fetch(`${this.getBaseUrl()}/deploy`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ uuid, force })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Deploy request failed (${res.status}): ${err}`);
    }

    return await res.json();
  }

  /**
   * Clear exposed host ports across all applications
   */
  async removeAllHostExposures(apps) {
    const results = [];
    for (const app of apps) {
      if (app.ports_mappings && app.ports_mappings.trim() !== '') {
        try {
          const res = await this.updateApplication(app.uuid, {
            fqdn: app.fqdn,
            port: app.ports_exposes || '3000',
            clearHostMapping: true
          });
          results.push({ uuid: app.uuid, name: app.name, cleared: true });
        } catch (e) {
          results.push({ uuid: app.uuid, name: app.name, cleared: false, error: e.message });
        }
      }
    }
    return results;
  }
}

export const coolifyApi = new CoolifyApiClient();
