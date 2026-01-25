import type { AppLoadContext as OriginalAppLoadContext } from 'react-router';
import type { Locale } from '~/utils/i18n/config';
export interface AppLoadContext extends OriginalAppLoadContext {
  locale: Locale;
}
