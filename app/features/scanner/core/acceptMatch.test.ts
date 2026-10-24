import { describe, expect, it } from 'vitest';
import { acceptMatchesFile } from './acceptMatch';

describe('acceptMatchesFile', () => {
  it('matches any prefix in a comma-separated list', () => {
    expect(acceptMatchesFile('image/*,video/*', 'image/png')).toBe(true);
    expect(acceptMatchesFile('image/*,video/*', 'video/mp4')).toBe(true);
    expect(acceptMatchesFile('image/*,video/*', 'application/pdf')).toBe(false);
  });

  it('handles a single-prefix accept string (item scanner)', () => {
    expect(acceptMatchesFile('image/*', 'image/webp')).toBe(true);
    expect(acceptMatchesFile('image/*', 'video/webm')).toBe(false);
  });

  it('lets through files with an unknown (empty) type', () => {
    expect(acceptMatchesFile('video/*', '')).toBe(true);
    expect(acceptMatchesFile('image/*,video/*', '')).toBe(true);
  });

  it('tolerates whitespace around list entries', () => {
    expect(acceptMatchesFile('image/*, video/*', 'video/quicktime')).toBe(true);
  });
});
