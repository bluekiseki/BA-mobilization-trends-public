import type { FesEvent } from '../logic/fes';
import type { StoryLang } from '../logic/types';
import { anniversaryLabel } from '../logic/uiText';
import { CategoryPill, ReleaseLine } from './StorySections';
import { SheetIcon } from '~/components/common/SheetIcon';
import { useStudentNames } from './useStoryIndex';

// A Fes recruitment on the timeline, laid out like the stories around it: a pill, the students it introduces, the date on each server.
export function FesRow({ event, lang }: { event: FesEvent; lang: StoryLang }) {
  const names = useStudentNames(lang);
  return (
    <li className="grid gap-2 py-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-6">
      <span className="flex min-w-0 flex-col gap-2">
        <span className="flex items-start gap-2">
          <CategoryPill category="Fes" lang={lang} />
          {event.anniversary !== null && (
            <span className="inline-flex shrink-0 self-start rounded bg-ba-btn-yellow px-2 py-1 text-xs font-bold leading-none text-neutral-900">{anniversaryLabel(event.anniversary, lang)}</span>
          )}
          <span className="text-sm font-semibold leading-relaxed">{event.students.map((student) => names[student.id] ?? student.name).join(', ')}</span>
        </span>
        <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <ReleaseLine releases={event.releases} lang={lang} />
        </span>
      </span>
      <ul className="flex flex-wrap items-start gap-2">
        {event.students.map((student) => (
          <li key={student.id}>
            <span className="block size-12 rounded-full bg-neutral-100 dark:bg-neutral-800" title={names[student.id] ?? student.name}>
              <SheetIcon sheet="student" id={student.id} alt="" className="size-12 rounded-full" />
            </span>
          </li>
        ))}
      </ul>
    </li>
  );
}
