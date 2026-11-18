import { describe, expect, it } from 'vitest';
import { parseStudentTab, studentPath } from './studentTab';

describe('student tab', () => {
  it('falls back to the first tab for anything unknown', () => {
    expect(parseStudentTab(null)).toBe('info');
    expect(parseStudentTab('nope')).toBe('info');
    expect(parseStudentTab('growth')).toBe('growth');
  });
  it('leaves the first tab out of the path', () => {
    expect(studentPath(26015)).toBe('/students/26015');
    expect(studentPath(26015, 'info')).toBe('/students/26015');
    expect(studentPath('26015', 'growth')).toBe('/students/26015?tab=growth');
  });
});
