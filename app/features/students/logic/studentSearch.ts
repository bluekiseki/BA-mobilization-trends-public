type Matcher = (target: string, query: string) => boolean;

interface SearchableStudent {
  Name: string;
  FamilyName?: string;
  SearchTags?: string[];
}

/** 0 when the student does not match; otherwise higher is better (name, then nickname tags, then family name). */
export function studentSearchScore(student: SearchableStudent, rawQuery: string, matcher: Matcher): number {
  const query = rawQuery.trim();
  if (!query) return 1;
  if (matcher(student.Name, query)) {
    const name = student.Name.toLowerCase();
    const lowered = query.toLowerCase();
    return 1000 + (name === lowered ? 500 : name.startsWith(lowered) ? 200 : 0);
  }
  if ((student.SearchTags ?? []).some((tag) => matcher(tag, query))) return 100;
  if (student.FamilyName && matcher(student.FamilyName, query)) return 50;
  return 0;
}
