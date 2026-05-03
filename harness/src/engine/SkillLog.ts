import { SkillLogEntry } from '../shared/types';
import { SKILL_LOG_CAPACITY } from '../shared/contracts';

export class SkillLog {
  private entries: SkillLogEntry[] = [];
  private capacity: number;

  constructor(capacity = SKILL_LOG_CAPACITY) {
    this.capacity = capacity;
  }

  append(entry: SkillLogEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.capacity) {
      this.entries.shift();
    }
  }

  query(filter: {
    spaceId?: string;
    skillId?: string;
    since?: number;
    limit?: number;
  }): SkillLogEntry[] {
    let results = this.entries;
    if (filter.spaceId) results = results.filter(e => e.spaceId === filter.spaceId);
    if (filter.skillId) results = results.filter(e => e.skillId === filter.skillId);
    if (filter.since) results = results.filter(e => e.firedAt >= filter.since!);
    const limit = filter.limit ?? 100;
    return results.slice(-limit);
  }

  /** Attach Brain's escalation response to a log entry (matched by skillId + approximate firedAt) */
  attachEscalationResponse(skillId: string, firedAt: number, response: SkillLogEntry['escalationResponse']): void {
    const entry = [...this.entries].reverse().find(
      e => e.skillId === skillId && Math.abs(e.firedAt - firedAt) < 60_000
    );
    if (entry) entry.escalationResponse = response;
  }
}