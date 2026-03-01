import { useMatches } from 'react-router';
import type { AppUIMatch } from '~/types/link';

/**
 * Collect preload information from the 'handle' of all currently active routes
 * The component that renders the <link> tag.
 * This component must be used within <head>.
 */
export function CollectedLinks() {
  // Use the useMatches() hook to get all the route information
  const matches = useMatches() as AppUIMatch[];

  const rootLoaderData = matches.filter((v) => v.id == 'root')[0]?.data;

  // Run handle.preload function for all routes
  const links = rootLoaderData
    ? matches.flatMap((match) => {
        if (match.handle?.preload) {
          return match.handle.preload(rootLoaderData);
        }
        return [];
      })
    : [];

  return (
    <>
      {links.map((linkProps, index) => (
        <link key={linkProps.href + index} {...linkProps} />
      ))}
    </>
  );
}
