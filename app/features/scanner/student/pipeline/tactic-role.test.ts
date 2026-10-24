import { inflateSync } from 'node:zlib';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { cdn } from '~/utils/cdn';
import { classifyTacticRole, loadTacticRoleTemplates, rankTacticRoles } from './tactic-role';
import { roleSamples } from './tactic-role-samples.test-data';

// cdn() only returns absolute URLs outside dev mode; this must run before cdn.ts is evaluated.
vi.hoisted(() => vi.stubEnv('VITE_USE_CDN', 'true'));

const fixtures = roleSamples.map(({ compressed, ...sample }) => ({ ...sample, pixels: inflateSync(Buffer.from(compressed, 'base64')) }));

describe('TacticRole icon classification', () => {
  beforeAll(async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await loadTacticRoleTemplates(() => {});
    expect(fetchMock).toHaveBeenCalledWith(cdn('/student-scanner/models/tactic-role-templates.json'));
    fetchMock.mockRestore();
  });
  it.each(fixtures)('reads a $role icon from a real nameplate crop', ({ role, width, height, badge, pixels }) => {
    const image = new ImageData(width, height);
    for (let i = 0; i < pixels.length; i += 1) image.data.set([pixels[i], pixels[i], pixels[i], 255], i * 4);
    expect(classifyTacticRole(image, badge)?.role).toBe(role);
  });

  it('abstains on an empty badge region', () => {
    const image = new ImageData(300, 60);
    image.data.fill(255);
    expect(classifyTacticRole(image, { x: 200, y: 6, width: 100, height: 36 })).toBeNull();
  });

  it('retains all five ranked scores for review', () => {
    const fixture = fixtures[0];
    const image = new ImageData(fixture.width, fixture.height);
    for (let i = 0; i < fixture.pixels.length; i += 1) image.data.set([fixture.pixels[i], fixture.pixels[i], fixture.pixels[i], 255], i * 4);
    const result = rankTacticRoles(image, fixture.badge);
    expect(result?.rankings).toHaveLength(5);
    expect(result?.rankings[0].role).toBe(fixture.role);
    expect(result?.rankings[0].score).toBeGreaterThan(result?.rankings[1].score ?? 0);
  });
});
