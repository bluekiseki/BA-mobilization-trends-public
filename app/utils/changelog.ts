import type { Locale } from '~/utils/i18n/config';

// Define the type for a single changelog entry based on JSON structure
export interface ChangelogEntryData {
  date: string;
  changes: {
    // Use Partial to indicate not all languages might be present
    [key in Locale]?: string[];
  };
  to?: (string | null)[];
}
// Sort entries by date descending (most recent first)
export function sortChangelog(entries: ChangelogEntryData[]): ChangelogEntryData[] {
  return [...entries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
