interface OpenEscalation {
  escalationId: string;
  skillId: string;
  timer: ReturnType<typeof setTimeout>;
}

export class EscalationSupervisor {
  private open = new Map<string, OpenEscalation>();

  fire(skillId: string, notifyFn: (id: string) => void, fallbackFn: () => void, timeoutMs = 8000): string {
    const escalationId = crypto.randomUUID();
    const timer = setTimeout(() => {
      this.open.delete(escalationId);
      fallbackFn();
    }, timeoutMs);
    this.open.set(escalationId, { escalationId, skillId, timer });
    notifyFn(escalationId);
    return escalationId;
  }

  resolve(escalationId: string): boolean {
    const esc = this.open.get(escalationId);
    if (!esc) return false;
    clearTimeout(esc.timer);
    this.open.delete(escalationId);
    return true;
  }

  get openCount() { return this.open.size; }
}
