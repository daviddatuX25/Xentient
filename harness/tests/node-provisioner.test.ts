import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NodeProvisioner } from '../src/comms/NodeProvisioner';

function mockSpaceManager() {
  const nodes: any[] = [];
  return {
    registerNode: vi.fn((spaceId: string, node: any) => { nodes.push(node); return true; }),
    updateNodeStatus: vi.fn((spaceId: string, nodeId: string, status: string) => {
      const n = nodes.find((x: any) => x.nodeId === nodeId);
      if (n) n.status = status;
      return true;
    }),
    removeNode: vi.fn((spaceId: string, nodeId: string) => {
      const idx = nodes.findIndex((x: any) => x.nodeId === nodeId);
      if (idx >= 0) nodes.splice(idx, 1);
      return true;
    }),
  } as any;
}

describe('NodeProvisioner', () => {
  let sm: any;
  let provisioner: NodeProvisioner;

  beforeEach(() => {
    sm = mockSpaceManager();
    provisioner = new NodeProvisioner(
      () => ({ host: '10.0.0.1', port: 1883 }),
      () => ({ host: '10.0.0.1', port: 8080 }),
      sm,
    );
  });

  it('generates token with unique nodeId and registers in SpaceManager', () => {
    const token = provisioner.generateToken('default', 'base', ['motion']);
    expect(token.nodeId).toMatch(/^node_[a-f0-9]{8}$/);
    expect(token.spaceId).toBe('default');
    expect(token.mqttBroker).toBe('10.0.0.1');
    expect(token.mqttPort).toBe(1883);
    expect(token.wsHost).toBe('10.0.0.1');
    expect(token.wsPort).toBe(8080);
    expect(sm.registerNode).toHaveBeenCalledWith('default', expect.objectContaining({
      nodeId: token.nodeId,
      status: 'pending',
    }));
  });

  it('generates unique nodeIds across calls', () => {
    const a = provisioner.generateToken('default', 'base', ['motion']);
    const b = provisioner.generateToken('default', 'base', ['motion']);
    expect(a.nodeId).not.toBe(b.nodeId);
  });

  it('confirms a pending node transitions to active', () => {
    const token = provisioner.generateToken('default', 'base', ['motion']);
    expect(provisioner.confirmNode(token.nodeId)).toBe(true);
    expect(sm.updateNodeStatus).toHaveBeenCalledWith('default', token.nodeId, 'active');
  });

  it('returns false for unknown nodeId confirm', () => {
    expect(provisioner.confirmNode('unknown')).toBe(false);
  });

  it('cleanupStale removes expired tokens', () => {
    provisioner.generateToken('default', 'base', ['motion']);
    // Use TTL -1 so now - createdAt (>=0) > -1 is always true
    const cleaned = provisioner.cleanupStale(-1);
    expect(cleaned).toBeGreaterThanOrEqual(1);
    expect(sm.removeNode).toHaveBeenCalled();
  });

  it('passes wifiSsid and wifiPass to token', () => {
    const token = provisioner.generateToken('default', 'base', ['motion'], 'MyWiFi', 'secret123');
    expect(token.wifiSsid).toBe('MyWiFi');
    expect(token.wifiPass).toBe('secret123');
  });

  it('emits node-provisioned event on generate', () => {
    const handler = vi.fn();
    provisioner.on('node-provisioned', handler);
    provisioner.generateToken('default', 'base', ['motion']);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      spaceId: 'default',
      role: 'base',
    }));
  });

  it('emits node-confirmed event on confirm', () => {
    const handler = vi.fn();
    provisioner.on('node-confirmed', handler);
    const token = provisioner.generateToken('default', 'base', ['motion']);
    provisioner.confirmNode(token.nodeId);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      nodeId: token.nodeId,
      spaceId: 'default',
    }));
  });

  it('throws if MQTT broker not configured', () => {
    const broken = new NodeProvisioner(
      () => ({ host: '', port: 0 }),
      () => ({ host: '10.0.0.1', port: 8080 }),
      sm,
    );
    expect(() => broken.generateToken('default', 'base', ['motion'])).toThrow('MQTT broker not configured');
  });

  it('throws if WS host not configured', () => {
    const broken = new NodeProvisioner(
      () => ({ host: '10.0.0.1', port: 1883 }),
      () => ({ host: '', port: 0 }),
      sm,
    );
    expect(() => broken.generateToken('default', 'base', ['motion'])).toThrow('WebSocket host not configured');
  });
});