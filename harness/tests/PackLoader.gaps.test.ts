import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';

vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
vi.spyOn(fs, 'renameSync').mockImplementation(() => {});
vi.spyOn(fs, 'existsSync').mockReturnValue(true);
vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
  pack: { name: 'test-pack', version: '1.0.0' },
  configurations: [
    { name: 'default', displayName: 'Default', nodeAssignments: {}, coreSkills: ['_pir-wake'], brainSkills: [] },
  ],
  nodeSkills: [],
  skills: [
    { id: 'env-logger', displayName: 'Env Logger', trigger: { type: 'interval', everyMs: 5000 }, actions: [{ type: 'log', message: 'test' }] },
  ],
}));
vi.spyOn(fs, 'readdirSync').mockReturnValue([]);

import { PackLoader } from '../src/engine/PackLoader';

function makeLoader(): PackLoader {
  return new PackLoader('/packs', () => {}, () => false);
}

describe('PackLoader gap tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registerConfig with duplicate name rejects (preserves original)', async () => {
    const loader = makeLoader();
    loader.loadPack('test-pack');

    loader.registerConfig({
      name: 'deep-focus',
      displayName: 'Deep Focus v1',
      nodeAssignments: {},
      coreSkills: ['env-logger'],
      brainSkills: [],
    });

    await loader.registerConfig({
      name: 'deep-focus',
      displayName: 'Deep Focus v2',
      nodeAssignments: {},
      coreSkills: ['env-logger'],
      brainSkills: [],
    });

    const manifest = loader.getLoadedPackManifest()!;
    const deepFocusConfigs = manifest.configurations.filter(c => c.name === 'deep-focus');
    expect(deepFocusConfigs).toHaveLength(1);
    expect(deepFocusConfigs[0].displayName).toBe('Deep Focus v1');
  });

  it('Brain-authored config survives in manifest', async () => {
    const loader = makeLoader();
    loader.loadPack('test-pack');

    await loader.registerConfig({
      name: 'late-night',
      displayName: 'Late Night',
      nodeAssignments: {},
      coreSkills: ['env-logger'],
      brainSkills: [],
    });

    const manifest = loader.getLoadedPackManifest()!;
    expect(manifest.configurations.map(c => c.name)).toContain('late-night');
  });

  it('registerConfig allows empty coreSkills array', async () => {
    const loader = makeLoader();
    loader.loadPack('test-pack');

    await loader.registerConfig({
      name: 'monitor-only',
      displayName: 'Monitor Only',
      nodeAssignments: {},
      coreSkills: [],
      brainSkills: [],
    });

    const manifest = loader.getLoadedPackManifest()!;
    expect(manifest.configurations).toHaveLength(2);
  });
});