// hooks/useSearchMatcher.ts
import { useState, useEffect } from 'react';
import defaultMatch from '../utils/matchers/default';
import type { Locale } from './i18n/config';

type MatcherFunction = (target: string, query: string) => boolean;

export function useSearchMatcher(locale: Locale) {
  const [matcher, setMatcher] = useState<MatcherFunction>(() => defaultMatch);

  useEffect(() => {
    let isMounted = true;

    const loadMatcher = async () => {
      try {
        let module;

        // Download only files required according to language code
        if (locale === 'ko') {
          module = await import('../utils/matchers/ko');
        } else if (locale === 'ja') {
          module = await import('../utils/matchers/ja');
        } else {
          module = { default: defaultMatch };
        }

        if (isMounted) {
          setMatcher(() => module.default);
        }
      } catch (e) {
        console.error('Matcher loading failed', e);
      }
    };

    loadMatcher();

    return () => {
      isMounted = false;
    };
  }, [locale]);

  return matcher;
}
