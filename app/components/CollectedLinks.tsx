import { useMatches } from 'react-router';
import type { AppUIMatch, CollectedLink } from '~/types/link';

/**
 * Collect preload information from the 'handle' of all currently active routes
 * The component that renders the <link> tag.
 * This component must be used within <head>.
 */
export function CollectedLinks() {
  // Use the useMatches() hook to get all the route information
  const matches = useMatches() as AppUIMatch[];

  const rootLoaderData = matches.filter((v) => v.id == 'root')[0]?.data;

  // console.log('<CollectedLinks', matches, rootLoaderData)

  // Run handle.preload function for all routes
  const links = rootLoaderData
    ? matches.flatMap((match) => {
        if (match.handle?.preload) {
          // console.log('match.handle?.preload',match.handle?.preload, rootLoaderData)
          // console.log('match.handle?.preload res',match.handle.preload(rootLoaderData))
          return match.handle.preload(rootLoaderData);
        }
        return [];
      })
    : [];

  // console.log('rootLoaderData',rootLoaderData)
  // console.log('links',links)

  // Remove links with duplicate href.
  // const uniqueLinks = new Map<string, CollectedLink>();
  // for (const link of links) {
  //   if (link.href && !uniqueLinks.has(link.href)) {
  //     uniqueLinks.set(link.href, link);
  //   }
  // }

  // // <link> rendering
  // return (
  //   <>
  //     {Array.from(uniqueLinks.values()).map((linkProps) => (
  //       <link key={linkProps.href} {...linkProps} />
  //     ))}
  //   </>
  // );
  return (
    <>
      {links.map((linkProps, index) => (
        <link key={linkProps.href + index} {...linkProps} />
      ))}
    </>
  );
}
