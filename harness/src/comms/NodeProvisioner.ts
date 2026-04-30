import { randomUUID } from 'crypto';
import type { ProvisioningToken, SpaceNode } from '../shared/types';

/**
 * Contract that SpaceManager must satisfy for the provisioning flow.
 * Task 4 will add these methods to SpaceManager directly.
 */
export interface ProvisioningManager {
  registerNode(spaceId: string, node: SpaceNode): void;
  updateNodeStatus(spaceId: string, nodeId: string, status: 'pending' | 'active'): boolean;
  removeNode(spaceId: string, nodeId: string): boolean;
}

export class NodeProvisioner {
  private pendingTokens = new Map<string, { token: ProvisioningToken; role: string; hardware: string[]; createdAt: number }>();

  constructor(
    private getMqttBroker: () => { host: string; port: number },
    private getWsHost: () => { host: string; port: number },
    private spaceManager: ProvisioningManager,
  ) {}

  /**
   * Generate a provisioning token AND register the node in SpaceManager immediately.
   * This prevents orphan tokens — if the user closes the browser, the nodeId is already tracked.
   * The node starts in status "pending" and transitions to "active" on first MQTT connect.
   */
  generateToken(spaceId: string, role: string, hardware: string[], wifiSsid?: string): ProvisioningToken {
    const nodeId = `node_${randomUUID().slice(0, 8)}`;
    const token: ProvisioningToken = {
      nodeId,
      spaceId,
      mqttBroker: this.getMqttBroker().host,
      mqttPort: this.getMqttBroker().port,
      wsHost: this.getWsHost().host,
      wsPort: this.getWsHost().port,
      wifiSsid,
    };

    // Register node immediately — no orphan tokens (G5 fix)
    const node: SpaceNode = {
      nodeId,
      role,
      hardware,
      state: 'dormant',
      status: 'pending',
    };
    this.spaceManager.registerNode(spaceId, node);

    // Track pending token for cleanup
    this.pendingTokens.set(nodeId, { token, role, hardware, createdAt: Date.now() });

    return token;
  }

  /**
   * Mark a node as active after first MQTT connection.
   * Called when the ESP32 connects via MQTT with its provisioned nodeId.
   */
  confirmNode(nodeId: string): boolean {
    const pending = this.pendingTokens.get(nodeId);
    if (!pending) return false;
    this.pendingTokens.delete(nodeId);
    // Update node status in SpaceManager
    return this.spaceManager.updateNodeStatus(pending.token.spaceId, nodeId, 'active');
  }

  /**
   * Clean up tokens older than TTL (default 1 hour).
   * Call periodically or on startup to prevent stale pending entries.
   */
  cleanupStale(ttlMs: number = 3600000): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [nodeId, entry] of this.pendingTokens.entries()) {
      if (now - entry.createdAt > ttlMs) {
        this.spaceManager.removeNode(entry.token.spaceId, nodeId);
        this.pendingTokens.delete(nodeId);
        cleaned++;
      }
    }
    return cleaned;
  }
}