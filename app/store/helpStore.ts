import { create } from 'zustand';

interface HelpState {
  isOpen: boolean;
  activeHelpKey: string | string[] | null;
  highlightedTour: { key: string; index: number } | null;

  setHelpKey: (key: string | string[] | null) => void;
  openSidebar: () => void;
  closeSidebar: () => void;
  setHighlightedTour: (tour: { key: string; index: number } | null) => void;
}

export const useHelpStore = create<HelpState>((set) => ({
  isOpen: false,
  activeHelpKey: null,
  highlightedTour: null,

  setHelpKey: (key) => set({ activeHelpKey: key }),
  openSidebar: () => set({ isOpen: true }),
  closeSidebar: () => set({ isOpen: false }),
  setHighlightedTour: (tour) => set({ highlightedTour: tour }),
}));
