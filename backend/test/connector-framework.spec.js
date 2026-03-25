const test = require('node:test');
const assert = require('node:assert/strict');
const { ConnectorManager } = require('../.tmp-test-dist/common/connectors/connector.manager');

function makeConnector(id, options = {}) {
  const state = {
    started: false,
    stopCount: 0,
    startMetadata: []
  };

  return {
    connector: {
      id,
      name: `Connector-${id}`,
      async start(context) {
        state.startMetadata.push(context.metadata);
        if (options.failStart) {
          throw new Error(options.failStart);
        }
        if (options.mutateMetadata) {
          context.metadata.shared = `changed-by-${id}`;
        }
        state.started = true;
      },
      async stop() {
        if (options.failStop) {
          throw new Error(options.failStop);
        }
        state.started = false;
        state.stopCount += 1;
      }
    },
    state
  };
}

test('simulates multiple connectors and validates isolation', async () => {
  const manager = new ConnectorManager();
  const first = makeConnector('alpha', { mutateMetadata: true });
  const second = makeConnector('beta');

  manager.register({ connector: first.connector, metadata: { shared: 'seed' } });
  manager.register({ connector: second.connector, metadata: { shared: 'seed' } });

  const startResult = await manager.startAll();

  assert.deepEqual(startResult.failed, []);
  assert.deepEqual(startResult.started.sort(), ['alpha', 'beta']);
  assert.equal(first.state.startMetadata[0].shared, 'changed-by-alpha');
  assert.equal(second.state.startMetadata[0].shared, 'seed');

  const snapshot = manager.getSnapshot();
  assert.equal(snapshot.length, 2);
  assert.equal(snapshot.every((entry) => entry.state === 'running'), true);
});

test('handles connector startup errors without leaking to other connectors', async () => {
  const manager = new ConnectorManager();
  const healthy = makeConnector('healthy');
  const broken = makeConnector('broken', { failStart: 'cannot connect' });

  manager.register({ connector: healthy.connector });
  manager.register({ connector: broken.connector });

  const result = await manager.startAll();

  assert.deepEqual(result.started, ['healthy']);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].connectorId, 'broken');

  const snapshot = manager.getSnapshot();
  const healthySnapshot = snapshot.find((entry) => entry.id === 'healthy');
  const brokenSnapshot = snapshot.find((entry) => entry.id === 'broken');

  assert.equal(healthySnapshot.state, 'running');
  assert.equal(brokenSnapshot.state, 'failed');
  assert.match(brokenSnapshot.lastError, /cannot connect/);
});
