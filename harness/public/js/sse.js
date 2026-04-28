/**
 * sse.js — SSE client with reconnection and state recovery
 *
 * Connects to /api/events, parses SSE messages, and provides
 * automatic reconnection with exponential backoff.
 * On reconnect, calls the reconnect callback so the caller
 * can re-fetch full state from REST endpoints.
 */
export class DashboardSSE {
  constructor() {
    this.source = null;
    this.onEvent = null;
    this.onDisconnect = null;
    this.onReconnect = null;
    this.reconnectAttempts = 0;
    this.maxReconnectDelay = 30000; // 30s max backoff
    this.reconnectTimer = null;
    this.intentionalClose = false;
  }

  /**
   * Connect to the SSE endpoint.
   * @param {Function} onEvent - Called with parsed event data for each SSE message
   * @param {Function} onDisconnect - Called when SSE connection drops
   * @param {Function} onReconnect - Called when SSE reconnects after a disconnect
   */
  connect(onEvent, onDisconnect, onReconnect) {
    this.onEvent = onEvent;
    this.onDisconnect = onDisconnect;
    this.onReconnect = onReconnect;
    this.intentionalClose = false;
    this._createConnection();
  }

  /**
   * Intentionally close the SSE connection (e.g., on page unload).
   */
  disconnect() {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.source) {
      this.source.close();
      this.source = null;
    }
  }

  _createConnection() {
    if (this.source) {
      this.source.close();
    }

    this.source = new EventSource('/api/events');

    this.source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (this.onEvent) this.onEvent(data);
      } catch {
        // Malformed SSE data — ignore gracefully
      }
    };

    this.source.onopen = () => {
      if (this.reconnectAttempts > 0 && this.onReconnect) {
        this.onReconnect();
      }
      this.reconnectAttempts = 0;
    };

    this.source.onerror = () => {
      // EventSource auto-reconnects, but we track state
      if (this.intentionalClose) return;

      if (this.source.readyState === EventSource.CLOSED) {
        // Connection dropped — notify and schedule manual reconnect
        if (this.onDisconnect) this.onDisconnect();
        this._scheduleReconnect();
      } else if (this.source.readyState === EventSource.CONNECTING) {
        // Browser is auto-reconnecting — notify disconnect
        if (this.reconnectAttempts === 0 && this.onDisconnect) {
          this.onDisconnect();
        }
        // Don't schedule manual reconnect yet — let browser try first
        // But if it fails repeatedly, we take over after a few attempts
      }
    };

    // Safety net: if browser's auto-reconnect doesn't fire onopen
    // within a reasonable time, force a manual reconnect
    this._startConnectTimeout();
  }

  _scheduleReconnect() {
    if (this.intentionalClose) return;
    if (this.reconnectTimer) return;

    this.reconnectAttempts++;
    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this._createConnection();
    }, delay);
  }

  _startConnectTimeout() {
    // If browser's auto-reconnect doesn't succeed in 10s, force manual reconnect
    setTimeout(() => {
      if (this.source && this.source.readyState === EventSource.CONNECTING && this.reconnectAttempts === 0) {
        this.reconnectAttempts = 1;
        if (this.onDisconnect) this.onDisconnect();
        this._scheduleReconnect();
      }
    }, 10000);
  }
}