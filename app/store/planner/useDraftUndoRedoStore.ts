import { create } from 'zustand';
import type { GrowthPlan } from './useGlobalStore';

interface DraftUndoRedoState {
  undoStack: GrowthPlan[][];
  redoStack: GrowthPlan[][];
  pushUndo: (plans: GrowthPlan[]) => void;
  undo: (currentPlans: GrowthPlan[]) => GrowthPlan[] | null;
  redo: (currentPlans: GrowthPlan[]) => GrowthPlan[] | null;
  clear: () => void;
}

export const useDraftUndoRedoStore = create<DraftUndoRedoState>((set, get) => ({
  undoStack: [],
  redoStack: [],

  pushUndo: (plans: GrowthPlan[]) => {
    set((state) => ({
      undoStack: [...state.undoStack, JSON.parse(JSON.stringify(plans))],
      redoStack: [],
    }));
  },

  undo: (currentPlans: GrowthPlan[]) => {
    const { undoStack, redoStack } = get();
    if (undoStack.length === 0) return null;

    const newUndoStack = [...undoStack];
    const previousPlans = newUndoStack.pop()!;

    set({
      undoStack: newUndoStack,
      redoStack: [JSON.parse(JSON.stringify(currentPlans)), ...redoStack],
    });

    return previousPlans;
  },

  redo: (currentPlans: GrowthPlan[]) => {
    const { undoStack, redoStack } = get();
    if (redoStack.length === 0) return null;

    const newRedoStack = [...redoStack];
    const nextPlans = newRedoStack.shift()!;

    set({
      undoStack: [...undoStack, JSON.parse(JSON.stringify(currentPlans))],
      redoStack: newRedoStack,
    });

    return nextPlans;
  },

  clear: () => {
    set({
      undoStack: [],
      redoStack: [],
    });
  },
}));
