import fs from 'fs';
import path from 'path';
import pino from 'pino';
import { z } from 'zod';
import { EventEmitter } from 'events';
import { PackSkillManifestSchema } from '../shared/contracts';
import type { CoreSkill, SkillTrigger, CoreAction } from '../shared/types';

type ParsedManifest = z.infer<typeof PackSkillManifestSchema>;
type ParsedPackSkill = ParsedManifest['skills'][number];

const logger = pino({ name: 'pack-loader' }, process.stderr);

export class PackLoader extends EventEmitter {
  private loadedPack: string | null = null;
  private loadedSkillIds: string[] = [];
  private cachedManifest: ParsedManifest | null = null;

  constructor(
    private packsDir: string,
    private registerFn: (skill: CoreSkill) => void,
    private removeFn: (id: string) => boolean,
  ) {
    super();
  }

  loadPack(packName: string): void {
    const manifestPath = path.join(this.packsDir, packName, 'skills.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Pack manifest not found: ${manifestPath}`);
    }
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const manifest = PackSkillManifestSchema.parse(parsed);

    // Phase 1: Expand all skills — if any fails, nothing is loaded
    const expanded: CoreSkill[] = [];
    for (const ps of manifest.skills) {
      const skill = this.expandPackSkill(ps, manifest.pack.name);
      expanded.push(skill);
    }

    // Phase 2: All expansions succeeded — apply
    this.unloadCurrentPack();
    for (const skill of expanded) {
      this.registerFn(skill);
      this.loadedSkillIds.push(skill.id);
    }

    this.loadedPack = packName;
    this.cachedManifest = manifest;
    this.emit('pack_loaded', { packName, skillCount: manifest.skills.length });
    logger.info({ pack: packName, skillCount: manifest.skills.length }, 'Pack loaded');
  }

  unloadCurrentPack(): void {
    const packName = this.loadedPack;
    for (const id of this.loadedSkillIds) {
      this.removeFn(id);
    }
    this.loadedSkillIds = [];
    this.loadedPack = null;
    this.cachedManifest = null;
    if (packName) {
      this.emit('pack_unloaded', { packName });
    }
  }

  getLoadedPack(): string | null {
    return this.loadedPack;
  }

  /** Return the parsed manifest of the currently loaded pack, or null. */
  getLoadedPackManifest(): ParsedManifest | null {
    return this.cachedManifest;
  }

  private expandPackSkill(ps: ParsedPackSkill, packName: string): CoreSkill {
    if (ps.id.startsWith('_')) {
      throw new Error(`Pack skill ID '${ps.id}' collides with builtin namespace — rename without leading underscore`);
    }
    return {
      id: ps.id,
      displayName: ps.displayName,
      enabled: true,
      spaceId: '*',
      trigger: ps.trigger as SkillTrigger,
      priority: ps.priority ?? 50,
      actions: ps.actions as CoreAction[],
      collect: ps.collect as CoreSkill['collect'],
      escalation: ps.escalation as CoreSkill['escalation'],
      source: 'pack',
      cooldownMs: ps.cooldownMs ?? 0,
      fireCount: 0,
      escalationCount: 0,
      configFilter: ps.configFilter,
      _pack: packName,
    };
  }

  listAvailablePacks(): string[] {
    if (!fs.existsSync(this.packsDir)) return [];
    return fs.readdirSync(this.packsDir)
      .filter(dir => fs.existsSync(path.join(this.packsDir, dir, 'skills.json')));
  }

  reload(): void {
    if (this.loadedPack) {
      const packName = this.loadedPack;
      this.loadPack(packName);
    }
  }
}