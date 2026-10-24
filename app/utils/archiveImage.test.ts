import { describe, expect, it } from 'vitest';
import { archiveImageUrl, isArchivable, normalizeImageUrl } from './archiveImage';

const IMG = 'https://a.test/img/hero.jpg';

describe('archiveImageUrl', () => {
  it('hashes the normalized URL, first 16 bytes of sha256', async () => {
    expect(await archiveImageUrl(IMG)).toMatch(/^https:\/\/[^/]+\/img\/eb28b3847ddd7d08a7fcbf169f2f8a47\.jpg$/);
  });

  it('treats a protocol-relative URL as https', async () => {
    expect(await archiveImageUrl('//a.test/img/hero.jpg')).toBe(await archiveImageUrl(IMG));
  });

  it('trims surrounding whitespace', async () => {
    expect(await archiveImageUrl(`  ${IMG}\n`)).toBe(await archiveImageUrl(IMG));
  });

  it('keeps http and https distinct', async () => {
    expect(await archiveImageUrl(IMG.replace('https', 'http'))).not.toBe(await archiveImageUrl(IMG));
  });

  it('lowercases the path extension and ignores the query', async () => {
    expect(await archiveImageUrl('https://a.test/x/IMG.PNG')).toMatch(/\.png$/);
    expect(await archiveImageUrl('https://a.test/x/img?file=a.png')).toMatch(/img\/[0-9a-f]{32}$/);
  });

  it('omits unknown extensions', async () => {
    expect(await archiveImageUrl('https://a.test/x/img.bmp')).toMatch(/img\/[0-9a-f]{32}$/);
  });
});

describe('helpers', () => {
  it('normalizes', () => {
    expect(normalizeImageUrl(' //a.test/x.png ')).toBe('https://a.test/x.png');
  });
  it('detects archivable sources', () => {
    expect(isArchivable('data:image/png;base64,AAA')).toBe(false);
    expect(isArchivable('//a.test/x.png')).toBe(true);
  });
});
