import test from 'node:test';
import assert from 'node:assert/strict';
import EventEmitter from 'node:events';
import UserRustPlusManager from '../src/services/user-rustplus-manager.js';

class FakeRustPlusClient extends EventEmitter {
  constructor(infoResponse) {
    super();
    this.infoResponse = infoResponse;
    this.connected = false;
    this.disconnected = false;
  }

  async connect() {
    this.connected = true;
  }

  async sendRequestAsync(request) {
    if (request.getInfo) {
      return this.infoResponse;
    }
    return {};
  }

  disconnect() {
    this.connected = false;
    this.disconnected = true;
  }

  isConnected() {
    return this.connected;
  }
}

const config = {
  serverId: 'server-1',
  ip: '127.0.0.1',
  port: 28082,
  playerId: 'player-1',
  playerToken: 123,
};

test('WebSocket open is not connected until Rust+ validation succeeds', async () => {
  let client;
  const manager = new UserRustPlusManager('user-invalid', {
    autoReconnect: false,
    clientFactory: () => {
      client = new FakeRustPlusClient({});
      return client;
    },
  });
  manager.setProxy({ enabled: false });

  let connectedEvents = 0;
  manager.on('server:connected', () => { connectedEvents += 1; });

  await assert.rejects(manager.connect(config), /Rust\+ 连接验证失败/);

  assert.equal(client.disconnected, true);
  assert.equal(manager.isConnected(config.serverId), false);
  assert.equal(connectedEvents, 0);
});

test('validated Rust+ connection is published as connected', async () => {
  const manager = new UserRustPlusManager('user-valid', {
    autoReconnect: false,
    clientFactory: () => new FakeRustPlusClient({ info: { name: 'Test Server' } }),
  });
  manager.setProxy({ enabled: false });

  const connectedEvent = new Promise((resolve) => {
    manager.once('server:connected', resolve);
  });

  await manager.connect(config);

  assert.equal(manager.isConnected(config.serverId), true);
  assert.deepEqual(manager.getConnectedServers(), [config.serverId]);
  assert.equal((await connectedEvent).serverName, 'Test Server');

  await manager.disconnectAll();
});
