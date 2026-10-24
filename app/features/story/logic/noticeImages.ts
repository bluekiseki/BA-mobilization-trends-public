import { collapseSameDate, type Release } from './releaseDates';
import notices from '~/data/story/notice_images.json';

interface Notice {
  date: string; // JP release day of the step the announcement belongs to
  image: string | null;
}

const byKey: Record<string, Notice[]> = notices;

// Announcement image of the release step that opened on this JP date ("YYYY-MM-DD..."), if the announcement had one.
export function noticeImage(key: readonly [string, string] | undefined, date: string | undefined): string | null {
  if (!key || !date) return null;
  return byKey[`${key[0]}:${key[1]}`]?.find((notice) => notice.date === date.slice(0, 10))?.image ?? null;
}

export function noticeImages(key: readonly [string, string] | undefined, date: string | undefined): string[] {
  const image = noticeImage(key, date);
  return image ? [image] : [];
}

// Images shown for the story as a whole: only when it opened in one step. A story released in parts keeps each image with its episodes.
export function storyImages(images: string[] | undefined, jpSteps: Release[] | undefined): string[] | undefined {
  return collapseSameDate(jpSteps ?? []).length > 1 ? undefined : images;
}
