import type { PvEntry } from '../data/pv';
import { SERVER_LABELS, SERVERS, type Server } from '../logic/releaseDates';
import type { StoryLang } from '../logic/types';
import { pickText } from '../logic/storyIndex';
import { CategoryPill } from './StorySections';

// "https://www.youtube.com/watch?v=abc" -> "abc"
function videoId(url: string | undefined): string | null {
  try {
    return url ? new URL(url).searchParams.get('v') : null;
  } catch {
    return null;
  }
}

// A promotional video on the timeline, laid out like the stories around it. Each date opens the video of that server when its link is known.
// Like the other thumbnails, the YouTube thumbnails stay hidden until spoilers are switched on.
export function PvRow({ pv, lang, server, spoilers }: { pv: PvEntry; lang: StoryLang; server: Server; spoilers: boolean }) {
  const title = pickText(pv.title, lang);
  // One thumbnail: the video of the server being viewed, or else the first video that has a link.
  const shown = [server, ...SERVERS].flatMap((candidate) => {
    const url = pv.videos[candidate]?.url;
    const id = videoId(url);
    return url && id ? [{ server: candidate, url, id }] : [];
  })[0];
  return (
    <li className="grid gap-2 py-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-6">
      <span className="flex min-w-0 flex-col gap-2">
        <span className="flex items-start gap-2">
          <CategoryPill category="PV" lang={lang} />
          <span className="text-sm font-semibold leading-relaxed">{title}</span>
        </span>
        <span className="flex flex-wrap gap-x-4 text-sm tabular-nums text-neutral-700 dark:text-neutral-300">
          {SERVERS.flatMap((server) => {
            const video = pv.videos[server];
            return video
              ? [
                  <span key={server}>
                    <span className="text-neutral-500 dark:text-neutral-400">{SERVER_LABELS[server]}</span>{' '}
                    {video.url ? (
                      <a href={video.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-neutral-900 dark:hover:text-white">
                        {video.date}
                      </a>
                    ) : (
                      video.date
                    )}
                  </span>,
                ]
              : [];
          })}
        </span>
      </span>
      {spoilers && shown && (
        <span className="flex justify-end">
          <a href={shown.url} target="_blank" rel="noopener noreferrer" aria-label={`${title} (${SERVER_LABELS[shown.server]})`} className="w-32 shrink-0 sm:w-44">
            <img
              src={`https://i.ytimg.com/vi/${shown.id}/mqdefault.jpg`}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="aspect-video w-full bg-neutral-100 object-cover dark:bg-neutral-800"
            />
          </a>
        </span>
      )}
    </li>
  );
}
