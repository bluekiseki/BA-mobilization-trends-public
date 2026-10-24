import { useSearchParams } from 'react-router';
import { StoryList } from './StoryList';
import { StoryShell } from './StoryShell';
import { useStoryIndex, useStoryLang } from './useStoryIndex';
import { useStoryListScroll } from './useStoryListScroll';

export function StoryListPage() {
  const { index, releases, error } = useStoryIndex();
  const { lang, setLang, query } = useStoryLang();
  useStoryListScroll(index !== null);
  const [params] = useSearchParams();
  const requested = params.get('character');
  const character = index && requested && index.chars[requested] ? requested : null;

  return (
    <StoryShell lang={lang} onLang={setLang} langQuery={query} error={error} loading={!index}>
      {index && <StoryList index={index} lang={lang} langQuery={query} releases={releases} character={character} />}
    </StoryShell>
  );
}
