import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { NotificationsGateway, NotificationPayload } from './notifications.gateway';
import { Collection, CollectionStatus, CollectionSource } from '../modules/collections/entities/collection.entity';
import { Machine, MachineStatus } from '../modules/machines/entities/machine.entity';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockSocket(overrides: Record<string, any> = {}): any {
  return {
    id: overrides.id ?? 'socket-1',
    handshake: overrides.handshake ?? {
      headers: {},
      auth: {},
    },
    join: jest.fn(),
    disconnect: jest.fn(),
    ...overrides,
  };
}

function createMockServer(): any {
  const mockChain = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  };
  return {
    to: jest.fn().mockReturnValue(mockChain),
    emit: jest.fn(),
    _chain: mockChain,
  };
}

const mockCollection: Partial<Collection> = {
  id: 'col-123',
  machineId: 'machine-1',
  operatorId: 'operator-1',
  status: CollectionStatus.COLLECTED,
  source: CollectionSource.REALTIME,
  collectedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockMachine: Partial<Machine> = {
  id: 'machine-123',
  code: 'M001',
  name: 'Test Machine',
  status: MachineStatus.APPROVED,
  isActive: true,
  createdById: 'user-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('NotificationsGateway', () => {
  let gateway: NotificationsGateway;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;
  let mockServer: ReturnType<typeof createMockServer>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsGateway,
        {
          provide: JwtService,
          useValue: {
            verify: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'jwt.secret') return 'test-secret';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    gateway = module.get<NotificationsGateway>(NotificationsGateway);
    jwtService = module.get(JwtService);
    configService = module.get(ConfigService);

    mockServer = createMockServer();
    gateway.server = mockServer as any;
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  // =========================================================================
  // afterInit
  // =========================================================================
  describe('afterInit', () => {
    it('should log that the gateway was initialized', () => {
      // Should not throw
      expect(() => gateway.afterInit()).not.toThrow();
    });
  });

  // =========================================================================
  // handleConnection
  // =========================================================================
  describe('handleConnection', () => {
    it('should authenticate client with JWT from cookie and join rooms', async () => {
      const payload = { sub: 'user-1', role: 'operator' };
      jwtService.verify.mockReturnValue(payload);

      const client = createMockSocket({
        id: 'socket-abc',
        handshake: {
          headers: {
            cookie: 'access_token=valid-jwt-token; other_cookie=value',
          },
          auth: {},
        },
      });

      await gateway.handleConnection(client);

      expect(jwtService.verify).toHaveBeenCalledWith('valid-jwt-token', {
        secret: 'test-secret',
      });
      expect(client.join).toHaveBeenCalledWith('role:operator');
      expect(client.join).toHaveBeenCalledWith('user:user-1');
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('should authenticate client with token from auth object when no cookie', async () => {
      const payload = { sub: 'user-2', role: 'manager' };
      jwtService.verify.mockReturnValue(payload);

      const client = createMockSocket({
        id: 'socket-def',
        handshake: {
          headers: {},
          auth: { token: 'auth-token' },
        },
      });

      await gateway.handleConnection(client);

      expect(jwtService.verify).toHaveBeenCalledWith('auth-token', {
        secret: 'test-secret',
      });
      expect(client.join).toHaveBeenCalledWith('role:manager');
      expect(client.join).toHaveBeenCalledWith('user:user-2');
    });

    it('should authenticate client with Bearer token from authorization header', async () => {
      const payload = { sub: 'user-3', role: 'admin' };
      jwtService.verify.mockReturnValue(payload);

      const client = createMockSocket({
        id: 'socket-ghi',
        handshake: {
          headers: {
            authorization: 'Bearer header-token',
          },
          auth: {},
        },
      });

      await gateway.handleConnection(client);

      expect(jwtService.verify).toHaveBeenCalledWith('header-token', {
        secret: 'test-secret',
      });
      expect(client.join).toHaveBeenCalledWith('role:admin');
      expect(client.join).toHaveBeenCalledWith('user:user-3');
    });

    it('should disconnect client when no token is provided', async () => {
      const client = createMockSocket({
        id: 'socket-notoken',
        handshake: {
          headers: {},
          auth: {},
        },
      });

      await gateway.handleConnection(client);

      expect(jwtService.verify).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should disconnect client when JWT verification fails', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      const client = createMockSocket({
        id: 'socket-badtoken',
        handshake: {
          headers: {
            cookie: 'access_token=expired-token',
          },
          auth: {},
        },
      });

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should handle non-Error thrown during verification', async () => {
      jwtService.verify.mockImplementation(() => {
        throw 'string error';
      });

      const client = createMockSocket({
        id: 'socket-strerror',
        handshake: {
          headers: {
            cookie: 'access_token=some-token',
          },
          auth: {},
        },
      });

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should prefer cookie token over auth token', async () => {
      const payload = { sub: 'user-cookie', role: 'operator' };
      jwtService.verify.mockReturnValue(payload);

      const client = createMockSocket({
        id: 'socket-prefer-cookie',
        handshake: {
          headers: {
            cookie: 'access_token=cookie-token',
          },
          auth: { token: 'auth-token' },
        },
      });

      await gateway.handleConnection(client);

      expect(jwtService.verify).toHaveBeenCalledWith('cookie-token', {
        secret: 'test-secret',
      });
    });

    it('should handle cookie header with only access_token', async () => {
      const payload = { sub: 'user-solo', role: 'operator' };
      jwtService.verify.mockReturnValue(payload);

      const client = createMockSocket({
        id: 'socket-solo-cookie',
        handshake: {
          headers: {
            cookie: 'access_token=solo-token',
          },
          auth: {},
        },
      });

      await gateway.handleConnection(client);

      expect(jwtService.verify).toHaveBeenCalledWith('solo-token', {
        secret: 'test-secret',
      });
    });

    it('should fall through to auth token when cookie has no access_token', async () => {
      const payload = { sub: 'user-fallback', role: 'operator' };
      jwtService.verify.mockReturnValue(payload);

      const client = createMockSocket({
        id: 'socket-no-access-cookie',
        handshake: {
          headers: {
            cookie: 'other_cookie=value; session=abc',
          },
          auth: { token: 'fallback-token' },
        },
      });

      await gateway.handleConnection(client);

      expect(jwtService.verify).toHaveBeenCalledWith('fallback-token', {
        secret: 'test-secret',
      });
    });

    it('should disconnect when cookie exists but has no access_token and no other token source', async () => {
      const client = createMockSocket({
        id: 'socket-no-access',
        handshake: {
          headers: {
            cookie: 'other_cookie=value',
          },
          auth: {},
        },
      });

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should store client info in connectedClients map', async () => {
      const payload = { sub: 'user-stored', role: 'manager' };
      jwtService.verify.mockReturnValue(payload);

      const client = createMockSocket({
        id: 'socket-stored',
        handshake: {
          headers: {
            cookie: 'access_token=valid-token',
          },
          auth: {},
        },
      });

      await gateway.handleConnection(client);

      expect(gateway.getConnectedClientsCount()).toBe(1);
    });
  });

  // =========================================================================
  // handleDisconnect
  // =========================================================================
  describe('handleDisconnect', () => {
    it('should remove client from connectedClients map on disconnect', async () => {
      // First connect a client
      const payload = { sub: 'user-dc', role: 'operator' };
      jwtService.verify.mockReturnValue(payload);

      const client = createMockSocket({
        id: 'socket-dc',
        handshake: {
          headers: { cookie: 'access_token=valid-token' },
          auth: {},
        },
      });

      await gateway.handleConnection(client);
      expect(gateway.getConnectedClientsCount()).toBe(1);

      gateway.handleDisconnect(client);
      expect(gateway.getConnectedClientsCount()).toBe(0);
    });

    it('should handle disconnect for unknown client gracefully', () => {
      const client = createMockSocket({ id: 'unknown-socket' });

      // Should not throw
      expect(() => gateway.handleDisconnect(client)).not.toThrow();
      expect(gateway.getConnectedClientsCount()).toBe(0);
    });
  });

  // =========================================================================
  // handlePing
  // =========================================================================
  describe('handlePing', () => {
    it('should return "pong"', () => {
      const client = createMockSocket();
      const result = gateway.handlePing(client);
      expect(result).toBe('pong');
    });
  });

  // =========================================================================
  // notifyNewCollection
  // =========================================================================
  describe('notifyNewCollection', () => {
    it('should emit notification to manager and admin rooms', () => {
      gateway.notifyNewCollection(mockCollection as Collection);

      expect(mockServer.to).toHaveBeenCalledWith('role:manager');
      expect(mockServer._chain.to).toHaveBeenCalledWith('role:admin');
      expect(mockServer._chain.emit).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({
          type: 'collection_created',
          data: mockCollection,
          timestamp: expect.any(Date),
        }),
      );
    });
  });

  // =========================================================================
  // notifyCollectionReceived
  // =========================================================================
  describe('notifyCollectionReceived', () => {
    it('should emit notification to the operator and admin room', () => {
      gateway.notifyCollectionReceived(mockCollection as Collection, 'operator-1');

      // First call: to user
      expect(mockServer.to).toHaveBeenCalledWith('user:operator-1');
      expect(mockServer._chain.emit).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({
          type: 'collection_received',
          data: mockCollection,
          timestamp: expect.any(Date),
        }),
      );

      // Second call: to admin
      expect(mockServer.to).toHaveBeenCalledWith('role:admin');
    });
  });

  // =========================================================================
  // notifyCollectionCancelled
  // =========================================================================
  describe('notifyCollectionCancelled', () => {
    it('should emit notification to the operator, manager, and admin rooms', () => {
      gateway.notifyCollectionCancelled(mockCollection as Collection, 'operator-2');

      expect(mockServer.to).toHaveBeenCalledWith('user:operator-2');
      expect(mockServer._chain.emit).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({
          type: 'collection_cancelled',
          data: mockCollection,
          timestamp: expect.any(Date),
        }),
      );

      // Also notifies manager and admin rooms
      expect(mockServer.to).toHaveBeenCalledWith('role:manager');
      expect(mockServer._chain.to).toHaveBeenCalledWith('role:admin');
    });
  });

  // =========================================================================
  // notifyMachineApproved
  // =========================================================================
  describe('notifyMachineApproved', () => {
    it('should emit notification to the creator and admin room', () => {
      gateway.notifyMachineApproved(mockMachine as Machine, 'creator-1');

      expect(mockServer.to).toHaveBeenCalledWith('user:creator-1');
      expect(mockServer._chain.emit).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({
          type: 'machine_approved',
          data: mockMachine,
          timestamp: expect.any(Date),
        }),
      );

      expect(mockServer.to).toHaveBeenCalledWith('role:admin');
    });
  });

  // =========================================================================
  // notifyMachineRejected
  // =========================================================================
  describe('notifyMachineRejected', () => {
    it('should emit notification to the creator', () => {
      gateway.notifyMachineRejected(mockMachine as Machine, 'creator-2');

      expect(mockServer.to).toHaveBeenCalledWith('user:creator-2');
      expect(mockServer._chain.emit).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({
          type: 'machine_rejected',
          data: mockMachine,
          timestamp: expect.any(Date),
        }),
      );
    });
  });

  // =========================================================================
  // broadcast
  // =========================================================================
  describe('broadcast', () => {
    it('should emit event to all connected clients', () => {
      const payload: NotificationPayload = {
        type: 'collection_created',
        data: mockCollection as Collection,
        timestamp: new Date(),
      };

      gateway.broadcast('custom-event', payload);

      expect(mockServer.emit).toHaveBeenCalledWith('custom-event', payload);
    });
  });

  // =========================================================================
  // getConnectedClientsCount
  // =========================================================================
  describe('getConnectedClientsCount', () => {
    it('should return 0 when no clients are connected', () => {
      expect(gateway.getConnectedClientsCount()).toBe(0);
    });

    it('should return correct count after multiple connections', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-1', role: 'operator' });

      const client1 = createMockSocket({
        id: 'socket-1',
        handshake: { headers: { cookie: 'access_token=t1' }, auth: {} },
      });
      const client2 = createMockSocket({
        id: 'socket-2',
        handshake: { headers: { cookie: 'access_token=t2' }, auth: {} },
      });

      await gateway.handleConnection(client1);
      await gateway.handleConnection(client2);

      expect(gateway.getConnectedClientsCount()).toBe(2);
    });

    it('should decrement after disconnect', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-1', role: 'operator' });

      const client = createMockSocket({
        id: 'socket-count',
        handshake: { headers: { cookie: 'access_token=t' }, auth: {} },
      });

      await gateway.handleConnection(client);
      expect(gateway.getConnectedClientsCount()).toBe(1);

      gateway.handleDisconnect(client);
      expect(gateway.getConnectedClientsCount()).toBe(0);
    });
  });

  // =========================================================================
  // CORS origin callback (decorator metadata, lines 25-39)
  // =========================================================================
  describe('CORS origin callback', () => {
    let corsOriginFn: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void;

    beforeEach(() => {
      // Extract CORS config from @WebSocketGateway decorator via NestJS metadata
      const gatewayOptions = Reflect.getMetadata(
        'websockets:gateway_options',
        NotificationsGateway,
      );
      corsOriginFn = gatewayOptions?.cors?.origin;
    });

    it('should have a CORS origin function defined in metadata', () => {
      expect(corsOriginFn).toBeDefined();
      expect(typeof corsOriginFn).toBe('function');
    });

    it('should allow requests with no origin (undefined)', () => {
      const callback = jest.fn();
      corsOriginFn(undefined, callback);
      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should allow localhost:3000 origin', () => {
      const callback = jest.fn();
      corsOriginFn('http://localhost:3000', callback);
      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should allow localhost:5173 origin', () => {
      const callback = jest.fn();
      corsOriginFn('http://localhost:5173', callback);
      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should reject disallowed origin', () => {
      const callback = jest.fn();
      corsOriginFn('http://evil.com', callback);
      expect(callback).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should allow FRONTEND_URL when set', () => {
      const originalUrl = process.env.FRONTEND_URL;
      process.env.FRONTEND_URL = 'https://app.example.com';
      try {
        const callback = jest.fn();
        corsOriginFn('https://app.example.com', callback);
        expect(callback).toHaveBeenCalledWith(null, true);
      } finally {
        if (originalUrl !== undefined) {
          process.env.FRONTEND_URL = originalUrl;
        } else {
          delete process.env.FRONTEND_URL;
        }
      }
    });

    it('should reject unknown origin even when FRONTEND_URL is set', () => {
      const originalUrl = process.env.FRONTEND_URL;
      process.env.FRONTEND_URL = 'https://app.example.com';
      try {
        const callback = jest.fn();
        corsOriginFn('https://other.example.com', callback);
        expect(callback).toHaveBeenCalledWith(expect.any(Error));
      } finally {
        if (originalUrl !== undefined) {
          process.env.FRONTEND_URL = originalUrl;
        } else {
          delete process.env.FRONTEND_URL;
        }
      }
    });
  });

  // =========================================================================
  // Edge cases for cookie parsing
  // =========================================================================
  describe('cookie parsing edge cases', () => {
    it('should handle cookies with extra spaces', async () => {
      const payload = { sub: 'user-space', role: 'operator' };
      jwtService.verify.mockReturnValue(payload);

      const client = createMockSocket({
        id: 'socket-space',
        handshake: {
          headers: {
            cookie: '  access_token=spaced-token ;  other=val  ',
          },
          auth: {},
        },
      });

      await gateway.handleConnection(client);

      expect(jwtService.verify).toHaveBeenCalledWith('spaced-token', {
        secret: 'test-secret',
      });
    });

    it('should handle cookie string with empty segments', async () => {
      const payload = { sub: 'user-empty', role: 'operator' };
      jwtService.verify.mockReturnValue(payload);

      const client = createMockSocket({
        id: 'socket-empty-seg',
        handshake: {
          headers: {
            cookie: 'access_token=token1;;',
          },
          auth: {},
        },
      });

      await gateway.handleConnection(client);

      expect(jwtService.verify).toHaveBeenCalledWith('token1', {
        secret: 'test-secret',
      });
    });

    it('should handle undefined cookie header', async () => {
      const payload = { sub: 'user-auth', role: 'operator' };
      jwtService.verify.mockReturnValue(payload);

      const client = createMockSocket({
        id: 'socket-no-cookie',
        handshake: {
          headers: { cookie: undefined },
          auth: { token: 'auth-fallback' },
        },
      });

      await gateway.handleConnection(client);

      expect(jwtService.verify).toHaveBeenCalledWith('auth-fallback', {
        secret: 'test-secret',
      });
    });
  });
});
