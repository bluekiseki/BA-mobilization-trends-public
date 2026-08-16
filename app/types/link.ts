import type { UIMatch } from 'react-router';

// Standard <link> Tag Properties
export interface CollectedLink {
  rel: 'preload' | 'prefetch' | 'stylesheet' | 'modulepreload' | 'alternate' | 'canonical';
  href: string;
  as?: 'image' | 'style' | 'script' | 'font' | 'fetch';
  type?: string;
  crossOrigin?: 'anonymous' | 'use-credentials';
  hrefLang?: string;
}

// Custom type to the handle object on the React Router.
export interface AppHandle {
  preload?: (data: unknown, match?: AppUIMatch) => CollectedLink[];
}

// Expand the type of UIMatch to our AppHandle.
export type AppUIMatch = UIMatch<unknown, AppHandle>;
