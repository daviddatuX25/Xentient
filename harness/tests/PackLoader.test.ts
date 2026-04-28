import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PackLoader } from '../src/engine/PackLoader';
import type { CoreSkill } from '../src/shared/types';

// ── Helpers ────────────────────────────────────────────────────────

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'packloader-test-'));
}

function writeManifest(dir: string, packName: string, manifest: object): string {
  const packDir = path.join(dir, packName);
  fs.mkdirSync(packDir, { recursive: true });
  fs.writeFileSync(path.join(packDir, 'skills.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  return packDir;
}

function makeValidManifest(overrides: Record<string, any> = {}): object {
  return {
    pack: { name: 'test-pack', version: '1.0.0', ...overrides.pack },
    skills: overrides.skills ?? [
      {
        id: 'greet',
        displayName: 'Greeting',
        trigger: { type: 'event', event: 'motion_detected' },
        actions: [{ type: 'log', message: 'Hello!' }],
        priority: 50,
        cooldownMs: 0,
      },
    ],
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('PackLoader', () => {
  let tempDir: string;
  let registered: CoreSkill[];
  let removed: string[];

  beforeEach(() => {
    tempDir = createTempDir();
    registered = [];
    removed = [];
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function makeLoader(): PackLoader {
    return new PackLoader(
      tempDir,
      (skill) => registered.push(skill),
      (id) => { removed.push(id); return true; },
    );
  }

  describe('loadPack()', () => {
    it('loads skills from manifest', () => {
      writeManifest(tempDir, 'default', makeValidManifest());
      const loader = makeLoader();

      loader.loadPack('default');

      expect(registered).toHaveLength(1);
      expect(registered[0].id).toBe('greet');
      expect(registered[0].displayName).toBe('Greeting');
    });

    it('loaded skills have source=pack, spaceId=*, priority=50 defaults', () => {
      writeManifest(tempDir, 'default', makeValidManifest());
      const loader = makeLoader();

      loader.loadPack('default');

      const skill = registered[0];
      expect(skill.source).toBe('pack');
      expect(skill.spaceId).toBe('*');
      expect(skill.priority).toBe(50);
      expect(skill.fireCount).toBe(0);
      expect(skill.escalationCount).toBe(0);
    });

    it('throws if skill ID starts with underscore', () => {
      writeManifest(tempDir, 'default', {
        pack: { name: 'bad-pack', version: '1.0.0' },
        skills: [
          {
            id: '_reserved',
            displayName: 'Reserved',
            trigger: { type: 'event', event: 'motion_detected' },
            actions: [{ type: 'log', message: 'bad' }],
          },
        ],
      });
      const loader = makeLoader();

      expect(() => loader.loadPack('default')).toThrow(/collides with builtin namespace/i);
    });

    it('unloads previous pack before loading new one', () => {
      writeManifest(tempDir, 'pack-a', makeValidManifest());
      writeManifest(tempDir, 'pack-b', {
        pack: { name: 'pack-b', version: '2.0.0' },
        skills: [
          {
            id: 'greet-b',
            displayName: 'Greeting B',
            trigger: { type: 'event', event: 'motion_detected' },
            actions: [{ type: 'log', message: 'Hello B!' }],
          },
        ],
      });

      const loader = makeLoader();
      loader.loadPack('pack-a');
      expect(registered).toHaveLength(1);
      expect(registered[0].id).toBe('greet');

      loader.loadPack('pack-b');
      // Previous skill should have been removed
      expect(removed).toContain('greet');
      // New skill should be registered
      expect(registered[registered.length - 1].id).toBe('greet-b');
    });

    it('throws for non-existent pack', () => {
      const loader = makeLoader();
      expect(() => loader.loadPack('nonexistent')).toThrow(/not found/i);
    });
  });

  describe('Zod validation', () => {
    it('rejects malformed manifests', () => {
      writeManifest(tempDir, 'bad-pack', {
        pack: { name: 'bad-pack', version: '1.0.0' },
        skills: [
          {
            // Missing required 'trigger' and 'actions'
            id: 'broken',
            displayName: 'Broken',
          },
        ],
      });
      const loader = makeLoader();

      expect(() => loader.loadPack('bad-pack')).toThrow();
    });

    it('rejects manifest without pack metadata', () => {
      writeManifest(tempDir, 'no-meta', {
        skills: [],
      });
      const loader = makeLoader();

      expect(() => loader.loadPack('no-meta')).toThrow();
    });
  });

  describe('unloadCurrentPack()', () => {
    it('only removes pack skills (preserves brain/builtin)', () => {
      writeManifest(tempDir, 'default', makeValidManifest());
      const loader = makeLoader();

      loader.loadPack('default');
      expect(registered).toHaveLength(1);

      // Simulate brain skill being registered separately
      const brainSkill: CoreSkill = {
        id: 'brain-skill',
        displayName: 'Brain Skill',
        enabled: true,
        spaceId: 'test-space',
        trigger: { type: 'event', event: 'voice_start' },
        priority: 10,
        actions: [],
        source: 'brain',
        cooldownMs: 0,
        fireCount: 0,
        escalationCount: 0,
      };
      registered.push(brainSkill);

      loader.unloadCurrentPack();

      // Only the pack skill 'greet' should be in the removed list
      expect(removed).toEqual(['greet']);
    });

    it('clears loadedSkillIds after unload', () => {
      writeManifest(tempDir, 'default', makeValidManifest());
      const loader = makeLoader();

      loader.loadPack('default');
      expect(loader.getLoadedPack()).toBe('default');

      loader.unloadCurrentPack();
      expect(loader.getLoadedPack()).toBeNull();
    });
  });

  describe('listAvailablePacks()', () => {
    it('returns pack names with valid skills.json', () => {
      writeManifest(tempDir, 'pack-alpha', makeValidManifest());
      writeManifest(tempDir, 'pack-beta', makeValidManifest());

      const loader = makeLoader();
      const packs = loader.listAvailablePacks();

      expect(packs).toContain('pack-alpha');
      expect(packs).toContain('pack-beta');
    });

    it('returns empty array for non-existent directory', () => {
      const loader = new PackLoader(
        '/nonexistent/path',
        (skill) => {},
        (id) => true,
      );
      expect(loader.listAvailablePacks()).toEqual([]);
    });

    it('ignores directories without skills.json', () => {
      const emptyDir = path.join(tempDir, 'empty-pack');
      fs.mkdirSync(emptyDir, { recursive: true });
      writeManifest(tempDir, 'valid-pack', makeValidManifest());

      const loader = makeLoader();
      const packs = loader.listAvailablePacks();

      expect(packs).toContain('valid-pack');
      expect(packs).not.toContain('empty-pack');
    });
  });

  describe('reload()', () => {
    it('reloads the current pack', () => {
      writeManifest(tempDir, 'default', makeValidManifest());
      const loader = makeLoader();

      loader.loadPack('default');
      expect(registered).toHaveLength(1);

      // Update the manifest
      writeManifest(tempDir, 'default', {
        pack: { name: 'default', version: '2.0.0' },
        skills: [
          {
            id: 'greet',
            displayName: 'Greeting v2',
            trigger: { type: 'event', event: 'motion_detected' },
            actions: [{ type: 'log', message: 'Hello v2!' }],
          },
        ],
      });

      loader.reload();

      // Old skill removed, new one registered
      expect(removed).toContain('greet');
      // Latest registered skill is the updated one
      expect(registered[registered.length - 1].displayName).toBe('Greeting v2');
    });

    it('does nothing if no pack is loaded', () => {
      const loader = makeLoader();
      // Should not throw
      loader.reload();
      expect(registered).toHaveLength(0);
    });
  });
});