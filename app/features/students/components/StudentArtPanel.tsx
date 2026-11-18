import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiX } from 'react-icons/fi';
import { cdn } from '~/utils/cdn';

export interface StudentFullArtInfo {
  w: number;
  h: number;
  anim: boolean;
}

export interface StudentPoster {
  lang: 'kr' | 'en' | 'jp';
  file: string;
  // Absent in indexes built before thumbnails existed; the full image is used then
  thumb?: string;
  date: string | null;
  w: number;
  h: number;
}

type Slide = { kind: 'art' } | { kind: 'poster'; poster: StudentPoster; position: number; count: number };

const LANGS = ['kr', 'en', 'jp'] as const;

// Same default as the recruitment history: Korean reads KR, Japanese reads JP, everything else reads EN
function orderedPosters(posters: StudentPoster[], locale: string): Slide[] {
  const preferred = locale === 'ko' ? 'kr' : locale === 'ja' ? 'jp' : 'en';
  const langs = [...LANGS].sort((a, b) => Number(b === preferred) - Number(a === preferred));
  return langs.flatMap((lang) => {
    const list = posters.filter((poster) => poster.lang === lang);
    return list.map((poster, index): Slide => ({ kind: 'poster', poster, position: index + 1, count: list.length }));
  });
}

// The student's full-body render and the introduction posters share one small box beside the profile; the thumbnails below pick which one is shown.
// The halo moves in the animated AVIF; the static WebP is the fallback and is what people who prefer reduced motion see.
// Clicking opens the larger image.
export function StudentArtPanel({
  studentId,
  name,
  art,
  posters,
  locale,
  className = '',
}: {
  studentId: number;
  name: string;
  art: StudentFullArtInfo | null;
  posters: StudentPoster[];
  locale: string;
  className?: string;
}) {
  const { t } = useTranslation('students');
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  // The large image is only requested once it is opened
  const [opened, setOpened] = useState(false);
  const slides: Slide[] = [...(art ? [{ kind: 'art' } as const] : []), ...orderedPosters(posters, locale)];
  if (slides.length === 0) return null;
  const slide = slides[index % slides.length];
  const artBase = `/schaledb.com/img/student/full/${studentId}`;
  const posterBase = `/schaledb.com/poster/${studentId}`;
  const imageClass = 'h-auto w-full object-contain object-top sm:h-52 sm:w-auto lg:h-64';
  const slideLabel = (item: Slide) => (item.kind === 'art' ? t('artLabel') : `${t('posters')} ${item.poster.lang.toUpperCase()}${item.count > 1 ? ` ${item.position}/${item.count}` : ''}`);

  return (
    <div className={`flex flex-col gap-1.5 self-start ${className}`}>
      <button
        type="button"
        aria-label={t('fullArtOpen')}
        onClick={() => {
          setOpened(true);
          dialog.current?.showModal();
        }}
        // A fixed narrow column on phones so the intro text keeps its width; from sm the image sets the width itself
        className="w-20 cursor-zoom-in sm:w-auto"
      >
        <span className="block">
          {slide.kind === 'art' && art ? (
            <picture>
              {art.anim && <source type="image/avif" media="(prefers-reduced-motion: no-preference)" srcSet={cdn(`${artBase}.anim.avif`)} />}
              <img src={cdn(`${artBase}.webp`)} width={art.w} height={art.h} alt={name} loading="lazy" decoding="async" className={imageClass} />
            </picture>
          ) : slide.kind === 'poster' ? (
            <img
              src={cdn(`${posterBase}/${slide.poster.thumb ?? slide.poster.file}`)}
              width={slide.poster.w}
              height={slide.poster.h}
              alt={t('posters')}
              loading="lazy"
              decoding="async"
              className={imageClass}
            />
          ) : null}
        </span>
      </button>
      {/* w-0 + min-w-full: the thumbnails wrap inside the width the image sets instead of widening the column */}
      {slides.length > 1 && (
        <div className="w-0 min-w-full">
          <div className="flex flex-wrap gap-1">
            {slides.map((item, position) => {
              const selected = position === index % slides.length;
              return (
                <button
                  key={item.kind === 'art' ? 'art' : item.poster.file}
                  type="button"
                  aria-label={slideLabel(item)}
                  aria-pressed={selected}
                  title={slideLabel(item)}
                  onClick={() => setIndex(position)}
                  className={`relative h-9 w-7 shrink-0 overflow-hidden rounded border ${selected ? 'border-ba-btn-blue-dark' : 'border-neutral-300 opacity-70 dark:border-neutral-600'}`}
                >
                  <img
                    src={cdn(item.kind === 'art' ? `${artBase}.webp` : `${posterBase}/${item.poster.thumb ?? item.poster.file}`)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover object-top"
                  />
                  {item.kind === 'poster' && <span className="absolute inset-x-0 bottom-0 bg-black/60 text-center text-[8px] font-bold uppercase leading-3 text-white">{item.poster.lang}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <dialog ref={dialog} onClick={() => dialog.current?.close()} className="m-auto cursor-zoom-out bg-transparent p-0 backdrop:bg-black/70">
        {opened &&
          (slide.kind === 'art' && art ? (
            <img src={cdn(`${artBase}.webp`)} width={art.w} height={art.h} alt={name} className="h-[90dvh] w-[95vw] object-contain" />
          ) : slide.kind === 'poster' ? (
            <img src={cdn(`${posterBase}/${slide.poster.file}`)} width={slide.poster.w} height={slide.poster.h} alt={t('posters')} className="h-[90dvh] w-[95vw] object-contain" />
          ) : null)}
        <button type="button" aria-label={t('fullArtClose')} className="absolute right-2 top-2 rounded bg-neutral-900/60 p-2 text-white">
          <FiX aria-hidden />
        </button>
      </dialog>
    </div>
  );
}
