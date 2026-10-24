import { describe, expect, it } from 'vitest';
import { linkDescription } from './descriptionLinks';

const videoUrl = 'https://www.youtube.com/watch?v=example&t=20s';

describe('description links', () => {
  it('links zero, minute and hour timestamps while preserving the video ID', () => {
    const parts = linkDescription('0:00 サクラコNSLv7\n12:34 Aru\n1:23:45 End', videoUrl);
    const links = parts.filter((part) => part.type === 'link');
    expect(links.map((part) => new URL(part.href).searchParams.get('t'))).toEqual(['0s', '754s', '5025s']);
    expect(links.every((part) => new URL(part.href).searchParams.get('v') === 'example')).toBe(true);
    expect(parts.map((part) => part.text).join('')).toBe('0:00 サクラコNSLv7\n12:34 Aru\n1:23:45 End');
  });

  it('preserves URL timestamps and keeps trailing punctuation outside links', () => {
    const text = '（https://example.com/0:00?q=test）。\nhttps://youtu.be/example?t=30';
    const parts = linkDescription(text, videoUrl);
    expect(parts.filter((part) => part.type === 'link').map((part) => part.href)).toEqual(['https://example.com/0:00?q=test', 'https://youtu.be/example?t=30']);
    expect(parts.map((part) => part.text).join('')).toBe(text);
  });

  it('does not link invalid timestamps or executable URL schemes', () => {
    const text = '1:99 1:99:20 javascript:alert(1)';
    expect(linkDescription(text, videoUrl)).toEqual([{ type: 'text', text }]);
  });
});
