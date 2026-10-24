export type DescriptionPart = { type: 'text'; text: string } | { type: 'link'; kind: 'url' | 'timestamp'; text: string; href: string };

export function linkDescription(text: string, videoUrl: string): DescriptionPart[] {
  const parts: DescriptionPart[] = [];
  // Match URLs first so timestamps inside URLs never become separate links.
  const tokens = /https?:\/\/[^\s<>"\u3000]+|(?<![\d:])(?:\d+:[0-5]\d:[0-5]\d|\d+:[0-5]\d)(?![\d:])/gi;
  let cursor = 0;
  for (const match of text.matchAll(tokens)) {
    if (match.index > cursor) parts.push({ type: 'text', text: text.slice(cursor, match.index) });
    const token = match[0];
    if (/^https?:\/\//i.test(token)) {
      const url = token.replace(/[.,!?;:，。！？、）)\]}〉》」』]+$/u, '');
      parts.push({ type: 'link', kind: 'url', text: url, href: url });
      if (url.length < token.length) parts.push({ type: 'text', text: token.slice(url.length) });
    } else {
      const seconds = token.split(':').reduce((total, value) => total * 60 + Number(value), 0);
      const url = new URL(videoUrl);
      url.searchParams.set('t', `${seconds}s`);
      parts.push({ type: 'link', kind: 'timestamp', text: token, href: url.toString() });
    }
    cursor = match.index + token.length;
  }
  if (cursor < text.length) parts.push({ type: 'text', text: text.slice(cursor) });
  return parts;
}
