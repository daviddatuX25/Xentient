import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { SkillPersistence } from '../src/engine/SkillPersistence';
import type { CoreSkill } from '../src/shared/types';

// ── Helpers ────────────────────────────────────────────────────────

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'persistence-test-'));
}

function makeBrainSkill(overrides: Partial<CoreSkill> = {}): CoreSkill {
  return {
    id: 'brain-skill-1',
    displayName: 'Brain Skill',
    enabled: true,
    spaceId: 'test-space',
    trigger: { type: 'event', event: 'motion_detected' },
    priority: 10,
    actions: [{ type: 'log', message: 'test' }],
    source: 'brain',
    cooldownMs: 0,
    fireCount: 5,
    escalationCount: 0,
    ...overrides,
  };
}

function makeBuiltinSkill(overrides: Partial<CoreSkill> = {}): CoreSkill {
  return {
    id: '_pir-wake',
    displayName: 'PIR Wake',
    enabled: true,
    spaceId: '*',
    trigger: { type: 'event', event: 'motion_detected' },
    priority: 0,
    actions: [{ type: 'set_mode', mode: 'listen' }],
    source: 'builtin',
    cooldownMs: 0,
    fireCount: 100,
    escalationCount: 0,
    ...overrides,
  };
}

function makePackSkill(overrides: Partial<CoreSkill> = {}): CoreSkill {
  return {
    id: 'pack-skill-1',
    displayName: 'Pack Skill',
    enabled: true,
    spaceId: '*',
    trigger: { type: 'event', event: 'voice_start' },
    priority: 50,
    actions: [{ type: 'log', message: 'pack' }],
    source: 'pack',
    cooldownMs: 0,
    fireCount: 3,
    escalationCount: 0,
    _pack: 'default',
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('SkillPersistence', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('load()', () => {
    it('returns empty array when file does not exist', () => {
      const persistence = new SkillPersistence(tempDir);
      const skills = persistence.load();
      expect(skills).toEqual([]);
    });

    it('returns brain-registered skills from valid file', () => {
      const filePath = path.join(tempDir, 'skills.json');
      const brainSkill = makeBrainSkill();
      fs.writeFileSync(filePath, JSON.stringify([brainSkill], null, 2), 'utf-8');

      const persistence = new SkillPersistence(tempDir);
      const skills = persistence.load();

      expect(skills).toHaveLength(1);
      expect(skills[0].id).toBe('brain-skill-1');
      expect(skills[0].source).toBe('brain');
    });

    it('ignores non-brain skills (builtin, pack)', () => {
      const filePath = path.join(tempDir, 'skills.json');
      const brainSkill = makeBrainSkill();
      const builtinSkill = makeBuiltinSkill();
      const packSkill = makePackSkill();

      fs.writeFileSync(filePath, JSON.stringify([brainSkill, builtinSkill, packSkill], null, 2), 'utf-8');

      const persistence = new SkillPersistence(tempDir);
      const skills = persistence.load();

      expect(skills).toHaveLength(1);
      expect(skills[0].id).toBe('brain-skill-1');
    });

    it('returns empty array on malformed JSON (no crash)', () => {
      const filePath = path.join(tempDir, 'skills.json');
      fs.writeFileSync(filePath, '{ invalid json !!!', 'utf-8');

      const persistence = new SkillPersistence(tempDir);
      const skills = persistence.load();

      expect(skills).toEqual([]);
    });

    it('returns empty array when file contains non-array', () => {
      const filePath = path.join(tempDir, 'skills.json');
      fs.writeFileSync(filePath, JSON.stringify({ not: 'an array' }), 'utf-8');

      const persistence = new SkillPersistence(tempDir);
      const skills = persistence.load();

      expect(skills).toEqual([]);
    });
  });

  describe('save()', () => {
    it('writes only brain skills', () => {
      const persistence = new SkillPersistence(tempDir);
      const brainSkill = makeBrainSkill();
      const builtinSkill = makeBuiltinSkill();
      const packSkill = makePackSkill();

      persistence.save([brainSkill, builtinSkill, packSkill]);

      const filePath = path.join(tempDir, 'skills.json');
      const raw = fs.readFileSync(filePath, 'utf-8');
      const saved = JSON.parse(raw);

      expect(saved).toHaveLength(1);
      expect(saved[0].id).toBe('brain-skill-1');
      expect(saved[0].source).toBe('brain');
    });

    it('creates data directory if it does not exist', () => {
      const nestedDir = path.join(tempDir, 'nested', 'deep', 'dir');
      const persistence = new SkillPersistence(nestedDir);

      persistence.save([makeBrainSkill()]);

      expect(fs.existsSync(nestedDir)).toBe(true);
      expect(fs.existsSync(path.join(nestedDir, 'skills.json'))).toBe(true);
    });

    it('filters out builtin and pack skills', () => {
      const persistence = new SkillPersistence(tempDir);

      const builtinOnly = [makeBuiltinSkill()];
      persistence.save(builtinOnly);

      const filePath = path.join(tempDir, 'skills.json');
      const raw = fs.readFileSync(filePath, 'utf-8');
      const saved = JSON.parse(raw);
      expect(saved).toHaveLength(0);

      const packOnly = [makePackSkill()];
      persistence.save(packOnly);

      const raw2 = fs.readFileSync(filePath, 'utf-8');
      const saved2 = JSON.parse(raw2);
      expect(saved2).toHaveLength(0);
    });
  });

  describe('round-trip', () => {
    it('save then load returns the same brain skills', () => {
      const persistence = new SkillPersistence(tempDir);
      const skill1 = makeBrainSkill({ id: 'brain-1' });
      const skill2 = makeBrainSkill({ id: 'brain-2', displayName: 'Another' });

      persistence.save([skill1, skill2]);
      const loaded = persistence.load();

      expect(loaded).toHaveLength(2);
      expect(loaded.map(s => s.id).sort()).toEqual(['brain-1', 'brain-2']);
    });

    it('round-trip preserves essential skill fields', () => {
      const persistence = new SkillPersistence(tempDir);
      const skill = makeBrainSkill({
        id: 'test-roundtrip',
        displayName: 'Round Trip Skill',
        trigger: { type: 'event', event: 'motion_detected' },
        actions: [{ type: 'log', message: 'hello' }],
        modeFilter: 'student',
        cooldownMs: 5000,
        priority: 42,
      });

      persistence.save([skill]);
      const [loaded] = persistence.load();

      expect(loaded.id).toBe('test-roundtrip');
      expect(loaded.displayName).toBe('Round Trip Skill');
      expect(loaded.source).toBe('brain');
      expect(loaded.modeFilter).toBe('student');
      expect(loaded.cooldownMs).toBe(5000);
      expect(loaded.priority).toBe(42);
    });
  });
});