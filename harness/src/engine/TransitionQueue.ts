import type { CoreNodeState, CoreSkill } from '../shared/types';

export type TransitionAction =
  | { type: 'activate_config'; configName: string; spaceId: string }
  | { type: 'set_node_state'; nodeId: string; state: CoreNodeState }
  | { type: 'register_skill'; skill: CoreSkill; spaceId: string }
  | { type: 'remove_skill'; skillId: string; spaceId: string };

export class TransitionQueue {
  private queue: TransitionAction[] = [];

  enqueue(action: TransitionAction): void {
    this.queue.push(action);
  }

  drain(): TransitionAction | null {
    if (this.queue.length === 0) return null;
    return this.queue.shift() ?? null;
  }

  get pending(): number {
    return this.queue.length;
  }

  clear(): void {
    this.queue = [];
  }
}