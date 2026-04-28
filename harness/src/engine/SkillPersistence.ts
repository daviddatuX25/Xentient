import fs from 'fs';
import path from 'path';
import pino from 'pino';
import type { CoreSkill } from '../shared/types';

const logger = pino({ name: 'skill-persistence' }, process.stderr);

export class SkillPersistence {
  private filePath: string;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(private dataDir: string) {
    this.filePath = path.join(dataDir, 'skills.json');
  }

  /** Load persisted skills from disk. Returns only brain-registered skills. */
  load(): CoreSkill[] {
    try {
      if (!fs.existsSync(this.filePath)) {
        logger.info('No persisted skills file found — starting fresh');
        return [];
      }
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        logger.warn('Persisted skills file is not an array — ignoring');
        return [];
      }
      const brainSkills = parsed.filter((s: CoreSkill) => s.source === 'brain');
      logger.info({ count: brainSkills.length }, 'Persisted skills loaded');
      return brainSkills;
    } catch (err) {
      logger.error({ err }, 'Failed to load persisted skills — starting fresh');
      return [];
    }
  }

  /** Save brain-registered skills to disk. */
  save(skills: CoreSkill[]): void {
    const brainSkills = skills.filter(s => s.source === 'brain');
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      const tmpPath = this.filePath + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(brainSkills, null, 2), 'utf-8');
      fs.renameSync(tmpPath, this.filePath);
      logger.info({ count: brainSkills.length }, 'Persisted skills saved');
    } catch (err) {
      logger.error({ err }, 'Failed to persist skills');
    }
  }

  /** Debounced save — batches writes within 500ms window. */
  debouncedSave(skills: CoreSkill[]): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.save(skills);
      this.saveTimer = null;
    }, 500);
  }

  /** Flush any pending debounced save immediately. */
  flush(skills: CoreSkill[]): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.save(skills);
  }
}