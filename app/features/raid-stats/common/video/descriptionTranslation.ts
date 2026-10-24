import { segmentTitle, type TitleDictionary, type TitleSegment } from './titleTranslation';

export function segmentDescription(text: string, dict: TitleDictionary): TitleSegment[] {
  // Preserve URLs verbatim, including paths containing glossary terms or student names.
  return text.split(/(https?:\/\/[^\s<>"\u3000]+)/gi).flatMap((part, index) => (index % 2 === 1 ? [part] : segmentTitle(part, dict)));
}

export function translateDescription(text: string, dict: TitleDictionary): string {
  return segmentDescription(text, dict)
    .map((segment) => (typeof segment === 'string' ? segment : segment.dst))
    .join('');
}
