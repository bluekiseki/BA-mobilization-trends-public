// Sentinel token used to carry an <img> reference through the plain-text diff pipeline,
// so an image shows up as its own line in the same unified diff as the surrounding text
// instead of a separate, disconnected "images changed" block.
const IMAGE_LINE_RE = /^⟦IMG:(.+)⟧$/;

export function imageLineToken(src: string): string {
  return `⟦IMG:${src}⟧`;
}

export function parseImageLine(text: string): string | null {
  const match = IMAGE_LINE_RE.exec(text);
  return match ? match[1] : null;
}
