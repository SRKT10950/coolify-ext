import test from 'node:test';
import assert from 'node:assert/strict';
import { PortAllocator } from '../src/services/portAllocator.js';
import { configManager, DEFAULT_RESERVED_PORTS } from '../src/services/configManager.js';

test('PortAllocator.parsePorts', () => {
  assert.deepEqual(PortAllocator.parsePorts('3000'), [3000]);
  assert.deepEqual(PortAllocator.parsePorts('3000, 3001, 3002'), [3000, 3001, 3002]);
  assert.deepEqual(PortAllocator.parsePorts('8080:80'), [8080, 80]);
  assert.deepEqual(PortAllocator.parsePorts(''), []);
  assert.deepEqual(PortAllocator.parsePorts(null), []);
});

test('PortAllocator.getUsedPortsMap flags dangerous host exposures', () => {
  const sampleApps = [
    {
      uuid: 'app-safe',
      name: 'Safe App',
      ports_exposes: '3200',
      ports_mappings: ''
    },
    {
      uuid: 'app-danger',
      name: 'Dangerous App',
      ports_exposes: '3300',
      ports_mappings: '3300:3300'
    }
  ];

  const map = PortAllocator.getUsedPortsMap(sampleApps);

  // System ports are protected
  assert.equal(map.has(80), true);
  assert.equal(map.has(443), true);
  assert.equal(map.has(8000), true);

  // Safe app
  assert.equal(map.has(3200), true);
  assert.equal(map.get(3200).source, 'coolify_expose');
  assert.equal(map.get(3200).isDangerousExposure, undefined);

  // Dangerous app with host port exposed
  assert.equal(map.has(3300), true);
  assert.equal(map.get(3300).isDangerousExposure, true);
});

test('PortAllocator.findFreePort finds available port outside reserved and used', async () => {
  const sampleApps = [
    { uuid: 'app-1', name: 'App 1', ports_exposes: '3100', ports_mappings: '' },
    { uuid: 'app-2', name: 'App 2', ports_exposes: '3101', ports_mappings: '' }
  ];

  const freePort = await PortAllocator.findFreePort({
    coolifyApps: sampleApps,
    checkSocket: false
  });

  assert.ok(freePort >= 3100);
  assert.notEqual(freePort, 3100);
  assert.notEqual(freePort, 3101);
  assert.equal(DEFAULT_RESERVED_PORTS.includes(freePort), false);
});

test('PortAllocator.allocateMultiple allocates collision-free sequential ports', async () => {
  const sampleApps = [];
  const ports = await PortAllocator.allocateMultiple(5, {
    coolifyApps: sampleApps,
    excludePorts: []
  });

  assert.equal(ports.length, 5);
  // Verify all ports are unique
  const uniquePorts = new Set(ports);
  assert.equal(uniquePorts.size, 5);

  // Verify none are reserved
  for (const p of ports) {
    assert.equal(DEFAULT_RESERVED_PORTS.includes(p), false);
  }
});
