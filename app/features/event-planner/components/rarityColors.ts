// In-game item rarity colors (index 0: N, 1: R, 2: SR, 3: SSR, 4: UR)
export const RARITY_COLORS: Record<'light' | 'dark', Record<number, string>> = {
  light: { 0: '#bdc5d0', 1: '#90baec', 2: '#d6ad81', 3: '#a88aec', 4: '#ebc355' },
  dark: { 0: '#8c939e', 1: '#658dbf', 2: '#a87d51', 3: '#7a5bbe', 4: '#c9a227' },
};

// Subtle row tint (about 9% alpha) used behind table rows
export const rarityRowBackground = (theme: 'light' | 'dark', rarityIndex: number): string => `${RARITY_COLORS[theme][rarityIndex]}18`;
