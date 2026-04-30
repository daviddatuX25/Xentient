import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createToolHandlers } from '../src/mcp/tools';

describe('xentient_get_capabilities gap tests', () => {
  it('returns graceful response when no spaceManager is provided', async () => {
    const handlers = createToolHandlers({
      mqtt: {} as any,
      audio: {} as any,
      camera: {} as any,
      modeManager: {} as any,
      sensorCache: {} as any,
    });
    const result = await handlers.xentient_get_capabilities({});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.nodes).toEqual([]);
    expect(parsed.core.activeConfig).toBe('default');
    expect(parsed.core.activePack).toBe('');
  });

  it('returns without throwing when pack is loaded but no config matches activeConfig', async () => {
    const mockManifest = {
      pack: { name: 'test-pack', version: '1.0.0' },
      configurations: [{ name: 'meeting', displayName: 'Meeting', nodeAssignments: { base: 'daily-life' }, coreSkills: ['_pir-wake'], brainSkills: [] }],
      nodeSkills: [{ id: 'daily-life', name: 'Daily Life', version: '1.0.0', requires: { pir: true }, sampling: { pirDebounceMs: 1000, micMode: 0 }, emits: ['motion'], expectedBy: '_pir-wake', compatibleConfigs: [] }],
      skills: [],
    };

    const mockSpace = {
      id: 'default',
      nodes: [{ nodeId: 'node-01', role: 'base', hardware: ['motion'], state: 'running' as const }],
      activePack: 'test-pack',
      activeConfig: 'nonexistent-config',
      availableConfigs: ['meeting'],
      integrations: [],
      sensors: ['temperature'],
    };

    const handlers = createToolHandlers({
      mqtt: {} as any,
      audio: {} as any,
      camera: {} as any,
      modeManager: {} as any,
      sensorCache: {} as any,
      packLoader: { getLoadedPackManifest: vi.fn().mockReturnValue(mockManifest), getLoadedPack: vi.fn().mockReturnValue('test-pack') } as any,
      spaceManager: {
        getSpace: vi.fn().mockReturnValue(mockSpace),
        getExecutor: vi.fn().mockReturnValue({ listSkills: vi.fn().mockReturnValue([]) }),
      } as any,
    });

    const result = await handlers.xentient_get_capabilities({});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.nodes[0].activeProfile).toBeNull();
    expect(parsed.nodes[0].eventMask).toEqual([]);
  });

  it('returns without throwing when no pack is loaded', async () => {
    const handlers = createToolHandlers({
      mqtt: {} as any,
      audio: {} as any,
      camera: {} as any,
      modeManager: {} as any,
      sensorCache: {} as any,
      packLoader: { getLoadedPackManifest: vi.fn().mockReturnValue(null), getLoadedPack: vi.fn().mockReturnValue(null) } as any,
      spaceManager: {
        getSpace: vi.fn().mockReturnValue(undefined),
        getExecutor: vi.fn().mockReturnValue(undefined),
      } as any,
    });

    const result = await handlers.xentient_get_capabilities({});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.nodes).toEqual([]);
    expect(parsed.core.activePack).toBe('');
  });
});