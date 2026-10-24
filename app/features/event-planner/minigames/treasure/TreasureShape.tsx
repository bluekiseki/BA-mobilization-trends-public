import { treasureColor } from './colors';

interface ShapeGlyphProps {
  w: number;
  h: number;
  typeIndex: number;
  /** Cell size in px */
  cell?: number;
}

/** Draws a treasure footprint as a w×h block of small squares. */
export const ShapeGlyph = ({ w, h, typeIndex, cell = 8 }: ShapeGlyphProps) => (
  <div className="grid shrink-0 gap-px" style={{ gridTemplateColumns: `repeat(${w}, ${cell}px)`, gridTemplateRows: `repeat(${h}, ${cell}px)` }} aria-label={`${w}×${h}`}>
    {Array.from({ length: w * h }).map((_, i) => (
      <span key={i} className="rounded-[1px]" style={{ backgroundColor: treasureColor(typeIndex) }} />
    ))}
  </div>
);
