import fs from 'fs';
import path from 'path';
import pino from 'pino';
import { z } from 'zod';
import { EventEmitter } from 'events';
import { PackSkillManifestSchema, BUILTIN_SKILL_IDS, BuiltinSkillId } from '../shared/contracts';
import type { CoreSkill, SkillTrigger, CoreAction, Configuration } from '../shared/types';

type ParsedManifest = z.infer<typeof PackSkillManifestSchema>;
type ParsedPackSkill = ParsedManifest['skills'][number];

const logger = pino({ name: 'pack-loader' }, process.stderr);

export class PackLoader extends EventEmitter {
  private loadedPack: string | null = null;
  private loadedSkillIds: string[] = [];
  private cachedManifest: ParsedManifest | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

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

  /** Register a new configuration (Brain-authored). Adds to in-memory manifest and persists to disk. */
  async registerConfig(config: Configuration): Promise<void> {
    const manifest = this.getLoadedPackManifest();
    if (!manifest) {
      logger.error('No pack loaded — cannot register configuration');
      return;
    }
    // Validate: no duplicate config name
    if (manifest.configurations.find(c => c.name === config.name)) {
      logger.error({ configName: config.name }, 'Configuration already exists in pack');
      return;
    }
    // Validate coreSkill IDs exist
    for (const skillId of config.coreSkills) {
      const found = manifest.skills.find(s => s.id === skillId) || BUILTIN_SKILL_IDS.includes(skillId as BuiltinSkillId);
      if (!found) {
        logger.error({ skillId, configName: config.name }, 'CoreSkill not found in pack');
        return;
      }
    }
    // Add with source tag
    manifest.configurations.push({ ...config });
    // Persist to disk
    await this.persistManifest(manifest);
    logger.info({ configName: config.name }, 'Brain-authored configuration registered');
  }

  /** Persist the manifest back to disk with atomic write. */
  private persistManifest(manifest: ParsedManifest): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      const packName = this.getLoadedPack();
      if (!packName) return;
      const manifestPath = path.join(this.packsDir, packName, 'skills.json');
      try {
        const data = JSON.stringify(manifest, null, 2);
        const tmpPath = manifestPath + '.tmp';
        fs.writeFileSync(tmpPath, data, 'utf-8');
        fs.renameSync(tmpPath, manifestPath);
        logger.info({ packName, path: manifestPath }, 'Pack manifest persisted');
      } catch (err) {
        logger.error({ err, packName }, 'Failed to persist pack manifest');
        throw err;
      }
    });
    return this.writeQueue;
  }

  reload(): void {
    if (this.loadedPack) {
      const packName = this.loadedPack;
      this.loadPack(packName);
    }
  }
}