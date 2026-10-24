// Shared color palettes reused across student/inventory filter UIs, profile cards, and search
// dropdowns — kept in one place instead of duplicating the same hex/class literals per component.

export const SQUAD_TYPE_COLORS: Record<'Main' | 'Support', string> = {
  Main: '#cc1a25',
  Support: '#006bff',
};

// Tailwind bg-[...] classes (light/dark variants baked in), indexed by rarity: 0=N, 1=R, 2=SR, 3=SSR.
export const RARITY_BG_CLASSES = ['bg-[#bdc5d0] dark:bg-[#8c939e]', 'bg-[#90baec] dark:bg-[#658dbf]', 'bg-[#d6ad81] dark:bg-[#a87d51]', 'bg-[#a88aec] dark:bg-[#7a5bbe]'] as const;
