import { describe, expect, it } from 'vitest';
import { needsDocumentLoad } from './isolatedRoutes';

describe('isolated scanner document navigation', () => {
  it.each(['/scanner/student', '/ko/scanner/student', '/zh_Hant/scanner/student?x=1', '/scanner/student#scan', '/scanner/item', '/ja/scanner/item/'])('loads a fresh document for %s', (path) => {
    expect(needsDocumentLoad(path)).toBe(true);
  });
  it.each(['/', '/ko/planner/students', '/scanner/student-other', '/scanner/itemized', '/scanner/arena'])('keeps ordinary navigation for %s', (path) => {
    expect(needsDocumentLoad(path)).toBe(false);
  });
});
