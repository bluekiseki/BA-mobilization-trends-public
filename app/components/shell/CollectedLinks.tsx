import { useMatches } from 'react-router';
import type { AppHandle, AppUIMatch } from '~/types/link';

/**
 * Collect preload information from the 'handle' of all currently active routes
 * The component that renders the <link> tag.
 * This component must be used within <head>.
 */
export function CollectedLinks() {
  // Use the useMatches() hook to get all the route information
  const matches = useMatches() as AppUIMatch[];

  const rootLoaderData = matches.filter((v) => v.id == 'root')[0]?.loaderData;

  // Run handle.preload function for all routes
  const links = rootLoaderData
    ? matches.flatMap((match) => {
        const preload = (match.handle as AppHandle | undefined)?.preload;
        return preload ? preload(rootLoaderData, match) : [];
      })
    : [];

  return (
    <>
      {links.map((linkProps, index) => (
        <link key={`${linkProps.href}-${index}`} {...linkProps} />
      ))}
    </>
  );
}
