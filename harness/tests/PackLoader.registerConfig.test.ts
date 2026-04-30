import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock fs.writeFileSync and renameSync for atomic persist
const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
vi.spyOn(fs, 'renameSync').mockImplementation(() => {});
vi.spyOn(fs, 'existsSync').mockReturnValue(true);
vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
  pack: { name: 'test-pack', version: '1.0.0' },
  configurations: [
    { name: 'default', displayName: 'Default', nodeAssignments: {}, coreSkills: ['_pir-wake'] },
  ],
  nodeSkills: [
    {
      id: 'daily-life',
      name: 'Daily Life',
      version: '1.0.0',
      requires: { pir: true },
      sampling: { pirDebounceMs: 1000 },
      emits: ['motion'],
      expectedBy: '_pir-wake',
      compatibleConfigs: ['default'],
    },
  ],
  skills: [
    {
      id: 'env-logger',
      displayName: 'Env Logger',
      trigger: { type: 'interval', everyMs: 5000 },
      actions: [{ type: 'log', message: 'env logged' }],
    },
  ],
}));
vi.spyOn(fs, 'readdirSync').mockReturnValue([]);

import { PackLoader } from '../src/engine/PackLoader';

function makeLoader(): PackLoader {
  return new PackLoader('/packs', () => {}, () => false);
}

describe('PackLoader.registerConfig', () => {
  beforeEach(() => {
    writeFileSyncSpy.mockClear();
  });

  it('registers a valid configuration', async () => {
    const loader = makeLoader();
    loader.loadPack('test-pack');

    const before = loader.getLoadedPackManifest()!;
    expect(before.configurations).toHaveLength(1);

    await loader.registerConfig({
      name: 'deep-focus',
      displayName: 'Deep Focus',
      nodeAssignments: {},
      coreSkills: ['env-logger'],
      brainSkills: [],
    });

    const after = loader.getLoadedPackManifest()!;
    expect(after.configurations).toHaveLength(2);
    expect(after.configurations[1].name).toBe('deep-focus');
  });

  it('rejects a duplicate config name', async () => {
    const loader = makeLoader();
    loader.loadPack('test-pack');

    await loader.registerConfig({
      name: 'default',
      displayName: 'Duplicate',
      nodeAssignments: {},
      coreSkills: ['_pir-wake'],
      brainSkills: [],
    });

    // Should still have only 1 configuration (the original)
    const manifest = loader.getLoadedPackManifest()!;
    expect(manifest.configurations).toHaveLength(1);
    // writeFileSync should NOT have been called for a duplicate
    expect(writeFileSyncSpy).not.toHaveBeenCalled();
  });

  it('rejects an invalid coreSkill ID', async () => {
    const loader = makeLoader();
    loader.loadPack('test-pack');

    await loader.registerConfig({
      name: 'broken',
      displayName: 'Broken',
      nodeAssignments: {},
      coreSkills: ['nonexistent-skill'],
      brainSkills: [],
    });

    const manifest = loader.getLoadedPackManifest()!;
    expect(manifest.configurations).toHaveLength(1); // unchanged
    expect(writeFileSyncSpy).not.toHaveBeenCalled();
  });

  it('accepts a builtin coreSkill ID', async () => {
    const loader = makeLoader();
    loader.loadPack('test-pack');

    await loader.registerConfig({
      name: 'monitor-only',
      displayName: 'Monitor Only',
      nodeAssignments: {},
      coreSkills: ['_pir-wake', '_sensor-telemetry'],
      brainSkills: [],
    });

    const manifest = loader.getLoadedPackManifest()!;
    expect(manifest.configurations).toHaveLength(2);
    expect(manifest.configurations[1].name).toBe('monitor-only');
  });

  it('persists manifest to disk', async () => {
    const loader = makeLoader();
    loader.loadPack('test-pack');

    await loader.registerConfig({
      name: 'night-mode',
      displayName: 'Night Mode',
      nodeAssignments: {},
      coreSkills: ['env-logger'],
      brainSkills: [],
    });

    expect(writeFileSyncSpy).toHaveBeenCalledTimes(1);
    const writtenPath = writeFileSyncSpy.mock.calls[0][0] as string;
    expect(writtenPath).toContain('test-pack');
    expect(writtenPath).toContain('skills.json');
    expect(writtenPath).toContain('.tmp');  // atomic write uses .tmp suffix
    const writtenData = JSON.parse(writeFileSyncSpy.mock.calls[0][1] as string);
    expect(writtenData.configurations).toHaveLength(2);
    expect(writtenData.configurations[1].name).toBe('night-mode');
  });

  it('does nothing when no pack is loaded', async () => {
    const loader = makeLoader();
    // Do NOT call loadPack

    await loader.registerConfig({
      name: 'orphan',
      displayName: 'Orphan',
      nodeAssignments: {},
      coreSkills: ['_pir-wake'],
      brainSkills: [],
    });

    expect(writeFileSyncSpy).not.toHaveBeenCalled();
  });
});

describe('xentient_register_config tool handler', () => {
  it('rejects invalid nodeSkill ID in nodeAssignments', async () => {
    const { createToolHandlers } = await import('../src/mcp/tools');

    const mockPackLoader = {
      getLoadedPackManifest: vi.fn().mockReturnValue({
        pack: { name: 'test-pack', version: '1.0.0' },
        configurations: [{ name: 'default', displayName: 'Default', nodeAssignments: {}, coreSkills: ['_pir-wake'] }],
        nodeSkills: [{ id: 'daily-life', name: 'Daily Life', version: '1.0.0', requires: {}, sampling: {}, emits: [], expectedBy: '', compatibleConfigs: [] }],
        skills: [{ id: 'env-logger', displayName: 'Env Logger', trigger: { type: 'interval', everyMs: 5000 }, actions: [{ type: 'log', message: 'test' }] }],
      }),
      getLoadedPack: vi.fn().mockReturnValue('test-pack'),
      registerConfig: vi.fn(),
    } as any;

    const mockSpaceManager = {
      getSpace: vi.fn().mockReturnValue({
        availableConfigs: ['default'],
        activeConfig: 'default',
      }),
    } as any;

    const handlers = createToolHandlers({
      mqtt: {} as any,
      audio: {} as any,
      camera: {} as any,
      modeManager: {} as any,
      sensorCache: {} as any,
      packLoader: mockPackLoader,
      spaceManager: mockSpaceManager,
    });

    const result = await handlers.xentient_register_config({
      name: 'broken-ns',
      displayName: 'Broken NS',
      nodeAssignments: { 'ceiling-unit': 'nonexistent-ns' },
      coreSkills: ['env-logger'],
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('nonexistent-ns');
    expect(result.isError).toBe(true);
  });

  it('adds config name to space.availableConfigs', async () => {
    const { createToolHandlers } = await import('../src/mcp/tools');

    const mockManifest = {
      pack: { name: 'test-pack', version: '1.0.0' },
      configurations: [{ name: 'default', displayName: 'Default', nodeAssignments: {}, coreSkills: ['_pir-wake'] }],
      nodeSkills: [{ id: 'daily-life', name: 'Daily Life', version: '1.0.0', requires: {}, sampling: {}, emits: [], expectedBy: '', compatibleConfigs: [] }],
      skills: [{ id: 'env-logger', displayName: 'Env Logger', trigger: { type: 'interval', everyMs: 5000 }, actions: [{ type: 'log', message: 'test' }] }],
    };

    const mockPackLoader = {
      getLoadedPackManifest: vi.fn().mockReturnValue(mockManifest),
      getLoadedPack: vi.fn().mockReturnValue('test-pack'),
      registerConfig: vi.fn(),
    } as any;

    const spaceObj = {
      availableConfigs: ['default'],
      activeConfig: 'default',
    };

    const mockSpaceManager = {
      getSpace: vi.fn().mockReturnValue(spaceObj),
    } as any;

    const handlers = createToolHandlers({
      mqtt: {} as any,
      audio: {} as any,
      camera: {} as any,
      modeManager: {} as any,
      sensorCache: {} as any,
      packLoader: mockPackLoader,
      spaceManager: mockSpaceManager,
    });

    const result = await handlers.xentient_register_config({
      name: 'party-mode',
      displayName: 'Party Mode',
      nodeAssignments: { 'ceiling-unit': 'daily-life' },
      coreSkills: ['env-logger'],
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.registered).toBe(true);
    expect(parsed.configName).toBe('party-mode');
    expect(spaceObj.availableConfigs).toContain('party-mode');
  });
});