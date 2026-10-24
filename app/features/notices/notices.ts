// Sentinel token carrying an <img> reference through the plain-text diff pipeline, so images show up inline in the unified diff.
const IMAGE_LINE_RE = /^⟦IMG:(.+)⟧$/;

export function imageLineToken(src: string): string {
  return `⟦IMG:${src}⟧`;
}

export function parseImageLine(text: string): string | null {
  const match = IMAGE_LINE_RE.exec(text);
  return match ? match[1] : null;
}
