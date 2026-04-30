import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import pino from 'pino';
import type { ProvisioningToken, ProvisioningTokenPublic, ProvisioningManager, SpaceNode } from '../shared/types';

const log = pino({ name: 'node-provisioner' }, process.stderr);

export class NodeProvisioner extends EventEmitter {
  private pendingTokens = new Map<string, { token: ProvisioningToken; role: string; hardware: string[]; createdAt: number }>();

  constructor(
    private getMqttBroker: () => { host: string; port: number },
    private getWsHost: () => { host: string; port: number },
    private spaceManager: ProvisioningManager,
  ) {
    super();
  }

  /**
   * Generate a provisioning token AND register the node in SpaceManager immediately.
   * This prevents orphan tokens — if the user closes the browser, the nodeId is already tracked.
   * The node starts in status "pending" and transitions to "active" on first MQTT connect.
   */
  generateToken(spaceId: string, role: string, hardware: string[], wifiSsid?: string, wifiPass?: string): ProvisioningToken {
    const mqtt = this.getMqttBroker();
    const ws = this.getWsHost();
    if (!mqtt?.host || !mqtt?.port) {
      throw new Error('MQTT broker not configured — cannot generate provisioning token');
    }
    if (!ws?.host || !ws?.port) {
      throw new Error('WebSocket host not configured — cannot generate provisioning token');
    }

    const nodeId = `node_${randomUUID().slice(0, 8)}`;
    const token: ProvisioningToken = {
      nodeId,
      spaceId,
      mqttBroker: mqtt.host,
      mqttPort: mqtt.port,
      wsHost: ws.host,
      wsPort: ws.port,
      wifiSsid,
      wifiPass,
    };

    // Register node immediately — no orphan tokens (G5 fix)
    const node: SpaceNode = {
      nodeId,
      role,
      hardware,
      state: 'dormant',
      status: 'pending',
      lastSeen: Date.now(),
    };
    this.spaceManager.registerNode(spaceId, node);

    // Track pending token for cleanup
    this.pendingTokens.set(nodeId, { token, role, hardware, createdAt: Date.now() });

    log.info({ nodeId, spaceId, role }, 'Provisioning token generated');
    this.emit('node-provisioned', { nodeId, spaceId, role });

    return token;
  }

  /**
   * Mark a node as active after first MQTT connection.
   * Called when the ESP32 connects via MQTT with its provisioned nodeId.
   */
  confirmNode(nodeId: string): boolean {
    const pending = this.pendingTokens.get(nodeId);
    if (!pending) {
      log.warn({ nodeId }, 'Node not found in pending tokens');
      return false;
    }
    this.pendingTokens.delete(nodeId);
    const spaceId = pending.token.spaceId;
    log.info({ nodeId }, 'Node confirmed active');
    this.emit('node-confirmed', { nodeId, spaceId });
    // Update node status in SpaceManager
    return this.spaceManager.updateNodeStatus(spaceId, nodeId, 'active');
  }

  /** Return a sanitized copy of the token for API/MCP responses — strips wifiPass */
  sanitizeToken(token: ProvisioningToken): ProvisioningTokenPublic {
    const { wifiPass: _, ...safe } = token;
    return safe;
  }

  /**
   * Clean up tokens older than TTL (default 1 hour).
   * Call periodically or on startup to prevent stale pending entries.
   */
  cleanupStale(ttlMs: number = 900000): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [nodeId, entry] of this.pendingTokens.entries()) {
      if (now - entry.createdAt > ttlMs) {
        const spaceId = entry.token.spaceId;
        this.spaceManager.removeNode(spaceId, nodeId);
        this.pendingTokens.delete(nodeId);
        this.emit('node-expired', { nodeId, spaceId });
        cleaned++;
      }
    }
    log.info({ cleaned, ttlMs }, 'Stale tokens cleaned up');
    return cleaned;
  }
}