// A raid can span several terrain phases, so a location is either one terrain or an ordered list of them.
export type RaidLocation = string | string[];

export const toLocations = (location: RaidLocation | undefined): string[] => (location ? [location].flat() : []);

export const formatLocations = (location: RaidLocation | undefined, separator = ' '): string => toLocations(location).join(separator);
