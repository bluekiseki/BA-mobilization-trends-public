import { useMemo } from 'react';
import { relationGraph } from '../logic/relationGraph';
import { seriesLabel } from '../logic/storyIndex';
import type { StoryIndex, StoryLang } from '../logic/types';
import { storyCopy } from '../logic/uiText';
import { CategoryPill, Section, seriesPath, SeriesTitle, StoryLink } from './StorySections';

interface RelationGraphProps {
  index: StoryIndex;
  seriesId: string;
  lang: StoryLang;
  langQuery: string;
  onSelect?: (id: string) => void;
}

// Direct neighbours stay readable without horizontal scrolling on touch screens.
export function RelationGraphSection({ index, seriesId, lang, langQuery, onSelect }: RelationGraphProps) {
  const graph = useMemo(() => relationGraph(index, seriesId, 1), [index, seriesId]);
  const t = storyCopy(lang);
  // A side with nothing on it is left out, and a series with no links at all has no flow section.
  const columns = [
    { depth: -1, title: t.before },
    { depth: 0, title: t.current },
    { depth: 1, title: t.after },
  ].filter((column) => column.depth === 0 || graph.nodes.some((node) => node.depth === column.depth));
  if (columns.length === 1) return null;

  return (
    <Section title={t.flow}>
      <ol className={`grid gap-4 pt-2 ${columns.length === 3 ? 'xl:grid-cols-3' : 'xl:grid-cols-2'}`}>
        {columns.map((column) => {
          const nodes = graph.nodes.filter((node) => node.depth === column.depth);
          return (
            <li key={column.depth} className={`min-w-0 border-l-2 pl-3 ${column.depth === 0 ? 'border-ba-btn-blue-dark' : 'border-neutral-200 dark:border-neutral-700'}`}>
              <h3 className="mb-2 text-xs font-semibold text-neutral-600 dark:text-neutral-400">{column.title}</h3>
              <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {nodes.map((node) => {
                  const series = index.series[node.id];
                  const label = seriesLabel(node.id, series, lang);
                  const content = (
                    <>
                      <CategoryPill category={series.c} lang={lang} />
                      <SeriesTitle label={label} main={series.c === 'Main'} />
                    </>
                  );
                  const className =
                    'flex w-full flex-col items-start gap-2 rounded py-3 text-left hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ba-btn-blue-dark dark:hover:bg-neutral-800';
                  return (
                    <li key={node.id}>
                      {column.depth === 0 ? (
                        <div className="flex flex-col gap-2 py-3" aria-current="step">
                          {content}
                        </div>
                      ) : onSelect ? (
                        <button type="button" onClick={() => onSelect(node.id)} className={className}>
                          {content}
                        </button>
                      ) : (
                        <StoryLink to={seriesPath(index, node.id, langQuery)} className={className}>
                          {content}
                        </StoryLink>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
