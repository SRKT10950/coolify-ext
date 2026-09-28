import test from 'node:test';
import assert from 'node:assert/strict';
import { coolifyApi } from '../src/services/coolifyApi.js';

test('coolifyApi zero-exposure domain and port update in simulation/mock mode', async () => {
  const testUuid = 'app-fastapi-backend-02';

  // Initially has dangerous ports_mappings: '8080:8080'
  const initialApp = await coolifyApi.getApplication(testUuid);
  assert.equal(initialApp.ports_mappings, '8080:8080');

  // Perform update with custom domain and free port
  const result = await coolifyApi.updateApplication(testUuid, {
    fqdn: 'api.production.internal',
    port: 3250,
    clearHostMapping: true
  });

  assert.equal(result.success, true);
  assert.equal(result.application.fqdn, 'https://api.production.internal');
  assert.equal(result.application.ports_exposes, '3250');
  
  // GUARANTEE: host port mapping is wiped
  assert.equal(result.application.ports_mappings, '');

  // Verify retrieved app reflects cleared mappings
  const updatedApp = await coolifyApi.getApplication(testUuid);
  assert.equal(updatedApp.ports_mappings, '');
  assert.equal(updatedApp.ports_exposes, '3250');
  assert.equal(updatedApp.fqdn, 'https://api.production.internal');
});

test('coolifyApi removes all host exposures across apps', async () => {
  const apps = await coolifyApi.getApplications();
  const unexposed = await coolifyApi.removeAllHostExposures(apps);

  assert.ok(Array.isArray(unexposed));

  // Re-check apps: none should have ports_mappings
  const refreshedApps = await coolifyApi.getApplications();
  const exposed = refreshedApps.filter(a => a.ports_mappings && a.ports_mappings.trim() !== '');
  assert.equal(exposed.length, 0);
});
